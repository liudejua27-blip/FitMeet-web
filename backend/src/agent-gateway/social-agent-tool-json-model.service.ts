import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseSocialAgentJsonObject } from './social-agent-next-action-decision';
import {
  selectSocialAgentToolModel,
  selectSocialAgentToolTimeoutMs,
  socialAgentToolModelUseCaseForPurpose,
} from './social-agent-tool-model';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import {
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
  type SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import {
  callDeepSeekChatCompletionWithUsage,
  type DeepSeekChatCompletionUsage,
} from '../common/deepseek.util';
import {
  isRetryableSocialAgentDeepSeekFailure,
  isSocialAgentAbortError,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import {
  buildSocialAgentExactCacheKey,
  buildSocialAgentPromptFingerprint,
  readSocialAgentExactCacheKeyFingerprint,
} from './social-agent-prompt-fingerprint.util';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { AgentObservabilityService } from './agent-observability.service';

type SocialAgentToolJsonModelInput = {
  purpose: string;
  prompt: string;
  fallback: () => Record<string, unknown>;
  taskId?: number | null;
  signal?: AbortSignal | null;
  traceId?: string | null;
};

const SOCIAL_AGENT_TOOL_JSON_TIMEOUT_FLOOR_MS = Math.max(
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
);

@Injectable()
export class SocialAgentToolJsonModelService {
  private readonly logger = new Logger(SocialAgentToolJsonModelService.name);
  private localLlmOutputCache?: SocialAgentLlmOutputCacheService;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
    @Optional()
    private readonly llmOutputCache?: SocialAgentLlmOutputCacheService,
    @Optional()
    private readonly metrics?: SocialAgentMetricsService,
    @Optional()
    private readonly observability?: AgentObservabilityService,
  ) {}

  async callJson(
    input: SocialAgentToolJsonModelInput,
  ): Promise<Record<string, unknown>> {
    this.assertNotClientAborted(input.signal);
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        JSON.stringify({
          event: 'deepseek.call_skipped',
          purpose: input.purpose,
          taskId: input.taskId ?? null,
          reason: 'DEEPSEEK_API_KEY missing',
        }),
      );
      return this.fallbackJson(input, 'DEEPSEEK_API_KEY missing');
    }

    const useCase = socialAgentToolModelUseCaseForPurpose(input.purpose);
    const model = selectSocialAgentToolModel(useCase, {
      config: this.config,
      modelRouter: this.modelRouter,
    });
    const fallbackTemperature =
      this.modelRouter?.getTemperature(useCase) ?? 0.2;
    const messages = [
      {
        role: 'system' as const,
        content:
          'You are FitMeet Social Agent reply loop. Return only one valid JSON object.',
      },
      { role: 'user' as const, content: input.prompt },
    ];
    const cacheKey = this.toolJsonCacheKey({
      model,
      purpose: input.purpose,
      prompt: input.prompt,
      useCase,
    });
    const cacheTtlMs = this.toolJsonCacheTtlMs();
    const cached =
      cacheTtlMs > 0 ? this.llmOutputCacheService().get(cacheKey) : null;
    const cacheFingerprint = readSocialAgentExactCacheKeyFingerprint(cacheKey);
    if (cacheTtlMs > 0) {
      this.metrics?.recordLlmOutputCache?.({
        cacheName: 'tool_json_exact',
        hit: cached !== null,
        approxChars: cached !== null ? this.approxChars(messages) : null,
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
      });
    }
    if (cached) {
      const parsed = parseSocialAgentJsonObject(cached);
      return {
        ...parsed,
        source: 'deepseek',
        purpose: input.purpose,
      };
    }
    const timeoutMs = this.toolJsonTimeoutMs(useCase);
    const maxAttempts = socialAgentDeepSeekRetryAttempts(this.config, {
      specificKey: 'SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS',
    });
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.assertNotClientAborted(input.signal);
      const startedAt = Date.now();
      let fallbackUsage: DeepSeekChatCompletionUsage | null = null;
      try {
        const completion = this.deepSeek
          ? {
              content: await this.deepSeek.complete({
                useCase,
                taskId: input.taskId ?? null,
                intent: input.purpose,
                fallbackTemperature,
                responseFormat: { type: 'json_object' },
                retryAttempts: 1,
                messages,
                signal: input.signal ?? null,
                timeoutMs,
                traceId: input.traceId ?? null,
              }),
              usage: null as DeepSeekChatCompletionUsage | null,
            }
          : await callDeepSeekChatCompletionWithUsage({
              apiKey,
              baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL'),
              model,
              temperature: fallbackTemperature,
              responseFormat: { type: 'json_object' },
              retryAttempts: 1,
              messages,
              signal: input.signal ?? null,
              timeoutMs,
              timeoutMessage: 'deepseek_timeout',
            });
        const content = completion.content;
        fallbackUsage = completion.usage;
        if (!content?.trim()) throw new Error('DeepSeek returned empty JSON');
        const parsed = parseSocialAgentJsonObject(content);
        if (cacheTtlMs > 0) {
          this.llmOutputCacheService().set(cacheKey, content, {
            ttlMs: cacheTtlMs,
            approxPromptChars: this.approxChars(messages),
          });
        }
        this.logModelCall({
          useCase,
          model,
          taskId: input.taskId ?? null,
          intent: input.purpose,
          latencyMs: Date.now() - startedAt,
          success: true,
        });
        if (fallbackUsage) {
          this.observability?.recordLlmCall({
            traceId: input.traceId ?? null,
            useCase,
            model,
            taskId: input.taskId ?? null,
            latencyMs: Date.now() - startedAt,
            success: true,
            promptTokens: fallbackUsage.promptTokens,
            promptCacheHitTokens: fallbackUsage.promptCacheHitTokens,
            promptCacheMissTokens: fallbackUsage.promptCacheMissTokens,
            completionTokens: fallbackUsage.completionTokens,
            reasoningTokens: fallbackUsage.reasoningTokens,
            approxPromptChars: this.approxChars(messages),
            promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
            dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
          });
        }
        return {
          ...parsed,
          source: 'deepseek',
          purpose: input.purpose,
        };
      } catch (error) {
        if (this.isClientAbort(error, input.signal)) {
          throw new Error('client_aborted');
        }
        lastError = error;
        const reason = socialAgentDeepSeekFailureReason(error);
        this.logModelCall({
          useCase,
          model,
          taskId: input.taskId ?? null,
          intent: input.purpose,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason,
        });
        if (fallbackUsage) {
          this.observability?.recordLlmCall({
            traceId: input.traceId ?? null,
            useCase,
            model,
            taskId: input.taskId ?? null,
            latencyMs: Date.now() - startedAt,
            success: false,
            promptTokens: fallbackUsage.promptTokens,
            promptCacheHitTokens: fallbackUsage.promptCacheHitTokens,
            promptCacheMissTokens: fallbackUsage.promptCacheMissTokens,
            completionTokens: fallbackUsage.completionTokens,
            reasoningTokens: fallbackUsage.reasoningTokens,
            approxPromptChars: this.approxChars(messages),
            promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
            dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
            failureReason: reason,
          });
        }
        if (
          attempt < maxAttempts &&
          isRetryableSocialAgentDeepSeekFailure(reason, {
            includeJsonFormatErrors: true,
            includeTimeoutFailures: true,
          })
        ) {
          this.logRetrying(input.purpose, reason, attempt, maxAttempts);
          continue;
        }
        break;
      }
    }

    const reason =
      lastError === null
        ? 'unknown_error'
        : socialAgentDeepSeekFailureReason(lastError);
    const timedOut = /deepseek_timeout|timeout/i.test(reason);
    this.logger.warn(
      JSON.stringify({
        event: 'deepseek.call_failed',
        purpose: input.purpose,
        reason:
          timedOut || isSocialAgentAbortError(lastError)
            ? 'timeout'
            : 'exception',
        message: reason,
        maxAttempts,
        ...(timedOut || isSocialAgentAbortError(lastError)
          ? { timeoutMs }
          : {}),
      }),
    );
    return this.fallbackJson(input, reason);
  }

  private fallbackJson(
    input: SocialAgentToolJsonModelInput,
    fallbackReason: string,
  ): Record<string, unknown> {
    return {
      ...input.fallback(),
      source: 'fallback',
      purpose: input.purpose,
      fallbackReason,
    };
  }

  private toolJsonTimeoutMs(useCase: SocialAgentModelUseCase): number {
    const selected = selectSocialAgentToolTimeoutMs(useCase, {
      config: this.config,
      modelRouter: this.modelRouter,
    });
    return Math.max(selected, SOCIAL_AGENT_TOOL_JSON_TIMEOUT_FLOOR_MS);
  }

  private llmOutputCacheService(): SocialAgentLlmOutputCacheService {
    if (this.llmOutputCache) return this.llmOutputCache;
    this.localLlmOutputCache ??= new SocialAgentLlmOutputCacheService();
    return this.localLlmOutputCache;
  }

  private toolJsonCacheKey(input: {
    model: string;
    purpose: string;
    prompt: string;
    useCase: SocialAgentModelUseCase;
  }): string {
    return buildSocialAgentExactCacheKey({
      cacheName: 'tool_json_exact',
      fingerprint: buildSocialAgentPromptFingerprint({
        schema: `social_agent_tool_json.v1:${input.purpose}`,
        model: input.model,
        useCase: input.useCase,
        messages: [
          {
            role: 'system',
            content:
              'You are FitMeet Social Agent reply loop. Return only one valid JSON object.',
          },
          { role: 'user', content: input.prompt },
        ],
      }),
    });
  }

  private toolJsonCacheTtlMs(): number {
    const raw = this.config.get<string>('SOCIAL_AGENT_TOOL_JSON_CACHE_TTL_MS');
    if (raw === '0') return 0;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
    return 30_000;
  }

  private approxChars(value: unknown): number {
    return JSON.stringify(value).length;
  }

  private assertNotClientAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('client_aborted');
  }

  private isClientAbort(error: unknown, signal?: AbortSignal | null): boolean {
    if (error instanceof Error && error.message === 'client_aborted') {
      return true;
    }
    return isSocialAgentAbortError(error) && Boolean(signal?.aborted);
  }

  private logRetrying(
    purpose: string,
    reason: string,
    attempt: number,
    maxAttempts: number,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'deepseek.call_retrying',
        purpose,
        reason,
        attempt,
        maxAttempts,
      }),
    );
  }

  private logModelCall(input: {
    useCase: string;
    model: string;
    taskId: number | null;
    intent?: unknown;
    latencyMs: number;
    success: boolean;
    reason?: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'social_agent.model_call',
        useCase: input.useCase,
        model: input.model,
        taskId: input.taskId,
        intent: typeof input.intent === 'string' ? input.intent : null,
        latencyMs: input.latencyMs,
        success: input.success,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );
  }
}
