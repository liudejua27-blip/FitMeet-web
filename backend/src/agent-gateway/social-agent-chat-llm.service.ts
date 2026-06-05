import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import {
  conversationalFallbackReply,
  directReplySystemPrompt,
} from './social-agent-chat-replies';
import {
  buildSocialAgentLlmConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentConversationBrainLastToolResult,
  readSocialAgentConversationBrainPlannedTools,
  readSocialAgentCurrentAgentState,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import {
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';
import type { ExtractedProfileFields } from './social-agent-chat.types';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';

type LongTermMemorySnapshot = Awaited<
  ReturnType<SocialAgentLongTermMemoryService['readSnapshot']>
>;

@Injectable()
export class SocialAgentChatLlmService {
  private readonly logger = new Logger(SocialAgentChatLlmService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
  ) {}

  async generateConversationalAnswer(input: {
    message: string;
    route: SocialAgentIntentRouterResult;
    profile: Record<string, unknown> | null;
    task: AgentTask;
    longTermSnapshot: LongTermMemorySnapshot | null;
    memoryContext: SocialAgentMemoryContext | null;
    toolResults?: Array<Record<string, unknown>>;
  }): Promise<string> {
    const fallbackReply = conversationalFallbackReply(
      input.message,
      input.route.intent,
    );
    if (this.finalResponses) {
      return this.finalResponses.generate({
        userMessage: input.message,
        intent: input.route.intent,
        route: input.route as unknown as Record<string, unknown>,
        agentState: readSocialAgentCurrentAgentState(input.task),
        conversationHistory: buildSocialAgentLlmConversationHistory(input.task),
        memoryContext: this.memoryContextRecord(input.memoryContext),
        taskContext: summarizeSocialAgentTaskMemoryForLlm(input.task),
        plannerDecision: readSocialAgentConversationBrainDecision(input.task),
        toolResults:
          input.toolResults && input.toolResults.length > 0
            ? input.toolResults
            : [
                readSocialAgentConversationBrainLastToolResult(input.task),
              ].filter(Boolean),
        safetyRules: socialAgentFinalResponseSafetyRules(),
        responseGoal: '直接回答用户问题，并根据当前状态自然推进下一步。',
        fallbackReply,
      });
    }
    try {
      const answer = await this.callDeepSeekForDirectReply(input);
      if (answer) return answer;
    } catch (error) {
      this.metrics.recordError('social_agent_chat_deepseek_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.chat.deepseek_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return fallbackReply;
  }

  async generateAgentBrainReply(input: {
    message: string;
    task: AgentTask;
    intent: SocialAgentIntentType;
    mode: 'profile_extraction' | 'profile_correction' | 'profile_updated';
    extractedProfile: ExtractedProfileFields;
    sourceMessage: string;
    toolOutput?: Record<string, unknown>;
    fallbackReply: string;
    memoryContext: SocialAgentMemoryContext | null;
  }): Promise<string> {
    if (this.finalResponses) {
      return this.finalResponses.generate({
        userMessage: input.message,
        intent: input.intent,
        agentState: readSocialAgentCurrentAgentState(input.task),
        conversationHistory: buildSocialAgentLlmConversationHistory(input.task),
        memoryContext: this.memoryContextRecord(input.memoryContext),
        taskContext: summarizeSocialAgentTaskMemoryForLlm(input.task),
        plannerDecision: readSocialAgentConversationBrainDecision(input.task),
        toolResults: input.toolOutput ? [input.toolOutput] : [],
        safetyRules: socialAgentFinalResponseSafetyRules(),
        responseGoal:
          input.mode === 'profile_updated'
            ? '告诉用户画像已保存，说明已更新字段、补充记忆和缺失信息，并询问下一步。'
            : '告诉用户已提取画像信息，说明暂未自动搜索，并询问是否保存、补充或开始搜索。',
        fallbackReply: input.fallbackReply,
      });
    }
    try {
      const answer = await this.callDeepSeekForAgentBrain(input);
      if (answer) return answer;
    } catch (error) {
      this.metrics.recordError('social_agent_brain_deepseek_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.brain.deepseek_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return input.fallbackReply;
  }

  async extractProfileFieldsWithLlm(
    task: AgentTask,
    sourceMessage: string,
  ): Promise<ExtractedProfileFields> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey || !cleanDisplayText(sourceMessage, '').trim()) return {};
    const useCase = 'profile_extraction' as const;
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.chatDeepSeekTimeoutMs(useCase),
    );

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: this.modelRouter?.getTemperature(useCase) ?? 0.15,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: [
                  'You extract FitMeet user profile facts.',
                  'Return only one valid JSON object.',
                  'Allowed keys: gender, age, heightCm, weightKg, city, school, area, mbti, zodiac, personality, targetPreference, activityType, availableTimes, boundaries.',
                  'Use strings or string arrays only. Do not invent missing facts.',
                ].join('\n'),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  taskId: task.id,
                  message: sourceMessage,
                  outputSchema: {
                    city: 'Qingdao',
                    school: 'Qingdao University',
                    mbti: 'INFP',
                    targetPreference: 'same-school women',
                  },
                }),
              },
            ],
          }),
        },
      );
      if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.readChatDeepSeekContent(payload);
      const parsed = this.parseJsonObject(content);
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: 'profile_enrichment',
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return this.profileFieldsFromRecord(parsed);
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: 'profile_enrichment',
        latencyMs: Date.now() - startedAt,
        success: false,
        reason:
          error instanceof Error && error.name === 'AbortError'
            ? 'deepseek_timeout'
            : error instanceof Error
              ? error.message
              : String(error),
      });
      return {};
    } finally {
      clearTimeout(timeout);
    }
  }

  profileFieldsFromRecord(
    value: Record<string, unknown>,
  ): ExtractedProfileFields {
    const fields: ExtractedProfileFields = {};
    for (const [key, raw] of Object.entries(value)) {
      if (typeof raw === 'string') {
        const text = cleanDisplayText(raw, '');
        if (text) fields[key] = text;
        continue;
      }
      if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
        const list = raw
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean);
        if (list.length > 0) fields[key] = list;
      }
    }
    return fields;
  }

  private async callDeepSeekForDirectReply(input: {
    message: string;
    route: SocialAgentIntentRouterResult;
    profile: Record<string, unknown> | null;
    task: AgentTask;
    longTermSnapshot: LongTermMemorySnapshot | null;
    memoryContext: SocialAgentMemoryContext | null;
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const useCase =
      input.route.intent === 'casual_chat' ? 'casual_chat' : 'final_response';
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.chatDeepSeekTimeoutMs(useCase),
    );
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: this.modelRouter?.getTemperature(useCase) ?? 0.6,
            max_tokens: 700,
            messages: [
              {
                role: 'system',
                content: directReplySystemPrompt(),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  userMessage: input.message,
                  intent: input.route.intent,
                  profileSummary: input.profile ?? {},
                  taskMemory: summarizeSocialAgentTaskMemoryForLlm(input.task),
                  memoryContext: input.memoryContext,
                  longTermMemory: input.longTermSnapshot
                    ? {
                        taskCount: input.longTermSnapshot.taskCount,
                        profileFacts: input.longTermSnapshot.profileFacts,
                        preferences: input.longTermSnapshot.preferences,
                        boundaries: input.longTermSnapshot.boundaries,
                        socialGoals: input.longTermSnapshot.socialGoals,
                        availability: input.longTermSnapshot.availability,
                        activityPreferences:
                          input.longTermSnapshot.activityPreferences,
                        matchSignals: input.longTermSnapshot.matchSignals,
                      }
                    : null,
                  conversationHistory: buildSocialAgentLlmConversationHistory(
                    input.task,
                    8,
                  ),
                }),
              },
            ],
          }),
        },
      );
      if (!response.ok) {
        this.logModelCall({
          useCase,
          model,
          taskId: input.task.id,
          intent: input.route.intent,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason: `DeepSeek HTTP ${response.status}`,
        });
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.readChatDeepSeekContent(payload);
      this.logModelCall({
        useCase,
        model,
        taskId: input.task.id,
        intent: input.route.intent,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return cleanDisplayText(content, '').trim() || null;
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        taskId: input.task.id,
        intent: input.route.intent,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason:
          error instanceof Error && error.name === 'AbortError'
            ? 'deepseek_timeout'
            : error instanceof Error
              ? error.message
              : String(error),
      });
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('deepseek_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callDeepSeekForAgentBrain(input: {
    message: string;
    task: AgentTask;
    intent: SocialAgentIntentType;
    mode: 'profile_extraction' | 'profile_correction' | 'profile_updated';
    extractedProfile: ExtractedProfileFields;
    sourceMessage: string;
    toolOutput?: Record<string, unknown>;
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const useCase = 'final_response' as const;
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.chatDeepSeekTimeoutMs(useCase),
    );
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: this.modelRouter?.getTemperature(useCase) ?? 0.6,
            max_tokens: 650,
            messages: [
              {
                role: 'system',
                content: [
                  '你是 FitMeet 的主 Agent 大脑，不是关键词模板机器人。',
                  '你要完整理解最近上下文、用户纠正和当前动作状态，再生成自然、具体的中文回复。',
                  '如果 mode=profile_extraction：说明已提取画像信息，不要立刻搜索；询问用户是先保存/继续补齐，还是现在开始搜索。',
                  '如果 mode=profile_correction：先承认理解修正，说明上一段是画像信息不是搜索需求；展示提取字段；不要重复解释“人物画像是什么”。',
                  '如果 mode=profile_updated：说明已经调用工具保存画像；区分已写入画像字段和作为补充记忆记录的字段；继续询问缺少的可约时间、约练类型和边界要求。',
                  '如果用户的画像信息里带有“想找某类人”，这只是社交目标；除非用户明确说现在搜索，否则不要声称已经搜索。',
                  '不要暴露 DeepSeek、API、模型失败、后端、工具日志等技术细节。',
                  '不要编造候选人、会话、消息或已经执行的工具结果。',
                ].join('\n'),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  userMessage: input.message,
                  intent: input.intent,
                  mode: input.mode,
                  sourceProfileMessage: input.sourceMessage,
                  extractedProfile: input.extractedProfile,
                  toolOutput: input.toolOutput ?? null,
                  toolResult: input.toolOutput ?? null,
                  plannedTools: readSocialAgentConversationBrainPlannedTools(
                    input.task,
                  ),
                  lastToolResult:
                    readSocialAgentConversationBrainLastToolResult(input.task),
                  availableTools: [
                    'update_profile_from_agent_context',
                    'search_real_candidates',
                    'create_social_request',
                    'send_message_to_candidate',
                    'connect_candidate',
                    'create_activity',
                    'get_user_profile',
                    'get_conversation_history',
                  ],
                  taskMemory: summarizeSocialAgentTaskMemoryForLlm(input.task),
                  conversationHistory: buildSocialAgentLlmConversationHistory(
                    input.task,
                    8,
                  ),
                }),
              },
            ],
          }),
        },
      );
      if (!response.ok) {
        this.logModelCall({
          useCase,
          model,
          taskId: input.task.id,
          intent: input.intent,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason: `DeepSeek HTTP ${response.status}`,
        });
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      this.logModelCall({
        useCase,
        model,
        taskId: input.task.id,
        intent: input.intent,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return this.readChatDeepSeekContent(payload) || null;
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        taskId: input.task.id,
        intent: input.intent,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason:
          error instanceof Error && error.name === 'AbortError'
            ? 'deepseek_timeout'
            : error instanceof Error
              ? error.message
              : String(error),
      });
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('deepseek_timeout');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private readChatDeepSeekContent(payload: Record<string, unknown>): string {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = this.isRecord(choices[0]) ? choices[0] : {};
    const message = this.isRecord(first.message) ? first.message : {};
    return cleanDisplayText(message.content, '').trim();
  }

  private modelFor(useCase: SocialAgentModelUseCase): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    const legacy = this.config.get<string>('DEEPSEEK_MODEL');
    if (useCase === 'casual_chat') {
      return (
        this.config.get<string>('AGENT_CASUAL_CHAT_MODEL') ||
        this.config.get<string>('DEEPSEEK_CHAT_MODEL') ||
        this.chatCompatibleLegacyModel(legacy) ||
        'deepseek-chat'
      );
    }
    if (useCase === 'final_response') {
      return (
        this.config.get<string>('AGENT_FINAL_RESPONSE_MODEL') ||
        this.config.get<string>('DEEPSEEK_CHAT_MODEL') ||
        this.chatCompatibleLegacyModel(legacy) ||
        'deepseek-chat'
      );
    }
    return (
      this.config.get<string>('DEEPSEEK_FAST_MODEL') ||
      legacy ||
      'deepseek-v4-flash'
    );
  }

  private chatCompatibleLegacyModel(value?: string | null): string | null {
    const legacy = `${value ?? ''}`.trim();
    if (!legacy || legacy === 'deepseek-v4') return null;
    return /chat/i.test(legacy) ? legacy : null;
  }

  private chatDeepSeekTimeoutMs(useCase?: SocialAgentModelUseCase): number {
    if (useCase && this.modelRouter)
      return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS') ?? '5000',
    );
    if (!Number.isFinite(configured) || configured <= 0) return 5000;
    return Math.min(configured, 8000);
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

  private parseJsonObject(content: string): Record<string, unknown> {
    const parsed = JSON.parse(content) as unknown;
    return this.isRecord(parsed) ? parsed : {};
  }

  private memoryContextRecord(
    memoryContext: SocialAgentMemoryContext | null,
  ): Record<string, unknown> {
    return (memoryContext ?? {}) as unknown as Record<string, unknown>;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
