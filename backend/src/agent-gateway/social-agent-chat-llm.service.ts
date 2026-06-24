import { Injectable, Logger, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentSelfImproveService } from './agent-self-improve.service';
import { conversationalFallbackReply } from './social-agent-chat-replies';
import {
  buildSocialAgentAgentBrainMessages,
  buildSocialAgentDirectReplyMessages,
} from './social-agent-chat-llm-prompts';
import {
  buildSocialAgentAgentBrainFinalResponseInput,
  buildSocialAgentDirectReplyFinalResponseInput,
} from './social-agent-chat-final-response.presenter';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import type { ExtractedProfileFields } from './social-agent-chat.types';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import {
  SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
  socialAgentContextTurnLimit,
} from './social-agent-context-window';
import {
  createTrackedSocialAgentDeltaHandler,
  socialAgentAnswerSource,
} from './social-agent-chat-llm-delta';
import type {
  SocialAgentBrainReplyInput,
  SocialAgentDirectReplyInput,
  SocialAgentGeneratedAnswer,
} from './social-agent-chat-llm.types';
import {
  buildSocialAgentProfileExtractionMessages,
  parseSocialAgentProfileExtractionContent,
  profileFieldsFromRecord,
} from './social-agent-profile-extraction.presenter';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import {
  buildSocialAgentExactCacheKey,
  buildSocialAgentPromptFingerprint,
  readSocialAgentExactCacheKeyFingerprint,
} from './social-agent-prompt-fingerprint.util';
import {
  selectSocialAgentConfiguredModel,
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
} from './social-agent-model-router.service';

export type { SocialAgentGeneratedAnswer } from './social-agent-chat-llm.types';

@Injectable()
export class SocialAgentChatLlmService {
  private readonly logger = new Logger(SocialAgentChatLlmService.name);
  private localProfileExtractionCache?: SocialAgentLlmOutputCacheService;

  constructor(
    private readonly metrics: SocialAgentMetricsService,
    private readonly deepSeek: SocialAgentChatDeepSeekClientService,
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
    @Optional()
    private readonly selfImprove?: AgentSelfImproveService,
    @Optional()
    private readonly llmOutputCache?: SocialAgentLlmOutputCacheService,
  ) {}

  async generateConversationalAnswer(
    input: SocialAgentDirectReplyInput,
  ): Promise<string> {
    return (await this.generateConversationalAnswerWithSource(input)).text;
  }

  async generateConversationalAnswerWithSource(
    input: SocialAgentDirectReplyInput,
  ): Promise<SocialAgentGeneratedAnswer> {
    const fallbackReply = conversationalFallbackReply(
      input.message,
      input.route.intent,
    );
    const delta = createTrackedSocialAgentDeltaHandler(input.onDelta);
    if (this.finalResponses) {
      const text = await this.finalResponses.generate(
        buildSocialAgentDirectReplyFinalResponseInput({
          ...input,
          fallbackReply,
          contextTurnLimit: this.contextTurnLimit(),
        }),
        {
          ...(delta.onDelta ? { onDelta: delta.onDelta } : {}),
          signal: input.signal,
        },
      );
      return {
        text,
        source: socialAgentAnswerSource(
          text,
          fallbackReply,
          delta.emittedDelta(),
        ),
      };
    }
    try {
      const answer = await this.callDeepSeekForDirectReply({
        ...input,
        onDelta: delta.onDelta,
      });
      if (answer) return { text: answer, source: 'llm' };
    } catch (error) {
      if (this.isClientAborted(error)) throw error;
      this.metrics.recordError('social_agent_chat_deepseek_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.chat.deepseek_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return { text: fallbackReply, source: 'fallback' };
  }

  async generateAgentBrainReply(
    input: SocialAgentBrainReplyInput,
  ): Promise<string> {
    return (await this.generateAgentBrainReplyWithSource(input)).text;
  }

  async generateAgentBrainReplyWithSource(
    input: SocialAgentBrainReplyInput,
  ): Promise<SocialAgentGeneratedAnswer> {
    const delta = createTrackedSocialAgentDeltaHandler(input.onDelta);
    if (this.finalResponses) {
      const text = await this.finalResponses.generate(
        buildSocialAgentAgentBrainFinalResponseInput({
          ...input,
          contextTurnLimit: this.contextTurnLimit(),
        }),
        {
          ...(delta.onDelta ? { onDelta: delta.onDelta } : {}),
          signal: input.signal,
        },
      );
      return {
        text,
        source: socialAgentAnswerSource(
          text,
          input.fallbackReply,
          delta.emittedDelta(),
        ),
      };
    }
    try {
      const answer = await this.callDeepSeekForAgentBrain({
        ...input,
        onDelta: delta.onDelta,
      });
      if (answer) return { text: answer, source: 'llm' };
    } catch (error) {
      if (this.isClientAborted(error)) throw error;
      this.metrics.recordError('social_agent_brain_deepseek_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.brain.deepseek_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return { text: input.fallbackReply, source: 'fallback' };
  }

  async extractProfileFieldsWithLlm(
    task: AgentTask,
    sourceMessage: string,
  ): Promise<ExtractedProfileFields> {
    const cleanMessage = cleanDisplayText(sourceMessage, '').trim();
    if (!cleanMessage) return {};
    const useCase = 'profile_extraction' as const;
    const extraRules = await this.publishedLifeGraphExtractionRules();
    const messages = buildSocialAgentProfileExtractionMessages(
      task,
      cleanMessage,
      extraRules,
    );
    const cacheKey = this.profileExtractionCacheKey({
      messages,
      model: this.profileExtractionModel(),
    });
    const cacheTtlMs = this.profileExtractionCacheTtlMs();
    if (cacheTtlMs > 0) {
      const cached = await this.profileExtractionCache().getAsync(cacheKey);
      const cacheFingerprint =
        readSocialAgentExactCacheKeyFingerprint(cacheKey);
      this.metrics.recordLlmOutputCache?.({
        cacheName: 'profile_extraction_exact',
        hit: cached !== null,
        approxChars: cached !== null ? this.approxChars(messages) : null,
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
      });
      if (cached !== null) {
        return parseSocialAgentProfileExtractionContent(cached);
      }
    }

    try {
      const content = await this.deepSeek.complete({
        useCase,
        taskId: task.id,
        intent: 'profile_enrichment',
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        messages,
      });
      if (!content) return {};
      const extracted = parseSocialAgentProfileExtractionContent(content);
      if (cacheTtlMs > 0) {
        await this.profileExtractionCache().setAsync(cacheKey, content, {
          ttlMs: cacheTtlMs,
          approxPromptChars: this.approxChars(messages),
        });
      }
      return extracted;
    } catch {
      return {};
    }
  }

  profileFieldsFromRecord(
    value: Record<string, unknown>,
  ): ExtractedProfileFields {
    return profileFieldsFromRecord(value);
  }

  private async publishedLifeGraphExtractionRules(): Promise<string[]> {
    if (!this.selfImprove) return [];
    try {
      return await this.selfImprove.publishedLifeGraphExtractionRules(
        'profile_extraction.system_prompt',
      );
    } catch {
      return [];
    }
  }

  private profileExtractionCache(): SocialAgentLlmOutputCacheService {
    if (this.llmOutputCache) return this.llmOutputCache;
    this.localProfileExtractionCache ??= new SocialAgentLlmOutputCacheService();
    return this.localProfileExtractionCache;
  }

  private profileExtractionCacheKey(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model: string;
  }): string {
    return buildSocialAgentExactCacheKey({
      cacheName: 'profile_extraction_exact',
      fingerprint: buildSocialAgentPromptFingerprint({
        schema: 'social_agent_profile_extraction.v1',
        model: input.model,
        useCase: 'profile_extraction',
        messages: input.messages,
      }),
    });
  }

  private profileExtractionModel(): string {
    const config = this.deepSeek.configReader();
    return (
      selectSocialAgentConfiguredModel(config.get('AGENT_EXTRACTOR_MODEL'), {
        allowFast: false,
      }) ??
      selectSocialAgentConfiguredModel(config.get('DEEPSEEK_CHAT_MODEL'), {
        allowFast: false,
      }) ??
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private profileExtractionCacheTtlMs(): number {
    const configured = Number(
      this.deepSeek
        .configReader()
        ?.get('SOCIAL_AGENT_PROFILE_EXTRACTION_CACHE_TTL_MS') ?? '',
    );
    if (Number.isFinite(configured) && configured >= 0) {
      return Math.floor(configured);
    }
    return 5 * 60 * 1000;
  }

  private approxChars(value: unknown): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  private async callDeepSeekForDirectReply(
    input: SocialAgentDirectReplyInput,
  ): Promise<string | null> {
    const useCase =
      input.route.intent === 'casual_chat' ? 'casual_chat' : 'final_response';
    return this.deepSeek.complete({
      useCase,
      taskId: input.task.id,
      intent: input.route.intent,
      fallbackTemperature: 0.6,
      maxTokens: this.maxTokens(),
      onDelta: input.onDelta,
      signal: input.signal,
      traceId: input.traceId ?? null,
      messages: buildSocialAgentDirectReplyMessages({
        ...input,
        contextTurnLimit: this.contextTurnLimit(),
      }),
    });
  }

  private async callDeepSeekForAgentBrain(
    input: SocialAgentBrainReplyInput,
  ): Promise<string | null> {
    const useCase = 'final_response' as const;
    return this.deepSeek.complete({
      useCase,
      taskId: input.task.id,
      intent: input.intent,
      fallbackTemperature: 0.6,
      maxTokens: this.maxTokens(),
      onDelta: input.onDelta,
      signal: input.signal,
      traceId: input.traceId ?? null,
      messages: buildSocialAgentAgentBrainMessages({
        ...input,
        contextTurnLimit: this.contextTurnLimit(),
      }),
    });
  }

  private contextTurnLimit(): number {
    const reader = this.deepSeek.configReader();
    return reader
      ? socialAgentContextTurnLimit(reader)
      : SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS;
  }

  private maxTokens(): number {
    const reader = this.deepSeek.configReader();
    const configured = Number(
      reader?.get('SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS') ??
        reader?.get('SOCIAL_AGENT_CHAT_MAX_TOKENS') ??
        reader?.get('SOCIAL_AGENT_DEEPSEEK_MAX_TOKENS') ??
        '',
    );
    if (!Number.isFinite(configured) || configured <= 0) return 1200;
    return Math.min(Math.max(Math.floor(configured), 900), 4000);
  }

  private isClientAborted(error: unknown): boolean {
    return error instanceof Error && error.message === 'client_aborted';
  }
}
