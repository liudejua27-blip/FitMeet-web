import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentSelfImproveService } from './agent-self-improve.service';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
  SocialAgentModelRouterService,
  isSocialAgentLegacyDeepSeekAlias,
  normalizeSocialAgentModel,
  selectSocialAgentConfiguredModel,
} from './social-agent-model-router.service';
import { AgentObservabilityService } from './agent-observability.service';
import {
  readDeepSeekStreamedContent,
  readDeepSeekSystemFingerprint,
  readDeepSeekUsageMetrics,
} from './deepseek-streaming.util';
import {
  DeepSeekStreamResult,
  emptyDeepSeekStreamMetrics,
} from './deepseek-latency.types';
import {
  isRetryableSocialAgentDeepSeekFailure,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import {
  SocialAgentTokenBudgetMode,
  SocialAgentTokenBudgetContextPackerService,
  SocialAgentTokenBudgetPackResult,
} from './social-agent-token-budget-context-packer.service';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentSemanticResponseCacheService } from './social-agent-semantic-response-cache.service';
import {
  explicitlyRejectsSocialExecution,
  isConversationOnlySocialMention,
  isSocialAdviceQuestion,
} from './social-agent-social-intent-gate';

export interface SocialAgentFinalResponseInput {
  userMessage: string;
  traceId?: string | null;
  intent?: string | null;
  route?: Record<string, unknown> | null;
  agentState?: string | null;
  conversationHistory?: Array<Record<string, unknown>>;
  memoryContext?: Record<string, unknown> | null;
  taskContext?: Record<string, unknown> | null;
  plannerDecision?: Record<string, unknown> | null;
  toolResults?: unknown[];
  searchResults?: Record<string, unknown> | null;
  safetyRules?: string[];
  responseGoal?: string | null;
  fallbackReply: string;
}

export interface SocialAgentFinalResponseGenerateOptions {
  onDelta?: (delta: string) => void | Promise<void>;
  signal?: AbortSignal | null;
}

type FinalResponseAttemptResult =
  | { ok: true; answer: string | null }
  | {
      ok: false;
      error: unknown;
      reason: string;
      retryable: boolean;
      clientAborted: boolean;
    };

type DeepSeekMessagesInput = {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  promptBudget: SocialAgentTokenBudgetPackResult['promptBudget'];
};

@Injectable()
export class SocialAgentFinalResponseService {
  private readonly logger = new Logger(SocialAgentFinalResponseService.name);
  private localContextPacker?: SocialAgentTokenBudgetContextPackerService;
  private localLlmOutputCache?: SocialAgentLlmOutputCacheService;
  private localSemanticResponseCache?: SocialAgentSemanticResponseCacheService;

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional() private readonly selfImprove?: AgentSelfImproveService,
    @Optional() private readonly observability?: AgentObservabilityService,
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
    @Optional()
    private readonly contextPacker?: SocialAgentTokenBudgetContextPackerService,
    @Optional()
    private readonly llmOutputCache?: SocialAgentLlmOutputCacheService,
    @Optional() private readonly metrics?: SocialAgentMetricsService,
    @Optional()
    private readonly semanticResponseCache?: SocialAgentSemanticResponseCacheService,
  ) {}

  async generate(
    input: SocialAgentFinalResponseInput,
    options: SocialAgentFinalResponseGenerateOptions = {},
  ): Promise<string> {
    const fallback = this.contextAwareFallbackReply(input);
    const deterministicFallback = this.deterministicFallbackReply(
      input,
      fallback,
    );
    if (deterministicFallback) {
      await options.onDelta?.(deterministicFallback);
      this.metrics?.recordDeterministicRouteReply(
        this.intentOf(input) || 'final_response',
        { estimatedAvoidedLlmCalls: 1 },
      );
      return deterministicFallback;
    }
    const modelInput =
      fallback === input.fallbackReply
        ? input
        : { ...input, fallbackReply: fallback };
    const apiKey = this.config?.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return fallback;

    const baseUrl =
      this.config?.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const useCase = 'final_response' as const;
    const model = this.modelFor(useCase);
    const maxAttempts = socialAgentDeepSeekRetryAttempts(this.config, {
      specificKey: 'SOCIAL_AGENT_FINAL_RESPONSE_RETRY_ATTEMPTS',
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.generateWithDeepSeek(modelInput, options, {
        apiKey,
        baseUrl,
        useCase,
        model,
      });
      if (result.ok) return result.answer || fallback;
      if (result.clientAborted) throw new Error('client_aborted');

      const willRetry = result.retryable && attempt < maxAttempts;
      this.logger.warn(
        JSON.stringify({
          event: willRetry
            ? 'social_agent.final_response.deepseek_retrying'
            : 'social_agent.final_response.deepseek_failed',
          message: result.reason,
          attempt,
          maxAttempts,
        }),
      );
      if (!willRetry) break;
    }

    return fallback;
  }

  private deterministicFallbackReply(
    input: SocialAgentFinalResponseInput,
    fallback: string,
  ): string | null {
    const text = cleanDisplayText(fallback, '').trim();
    if (!text) return null;
    const originalFallback = cleanDisplayText(input.fallbackReply, '').trim();
    const slots = this.tokenBudgetContextPacker().knownSlots(input);

    if (
      text !== originalFallback &&
      this.hasActionableSocialSlots(slots) &&
      /我记得你已经补充了/.test(text)
    ) {
      return text;
    }

    if (this.isNoRealCandidateFallback(input, text)) {
      return text;
    }

    if (this.isLowRiskCardActionFallback(text)) {
      return text;
    }

    return null;
  }

  private async generateWithDeepSeek(
    input: SocialAgentFinalResponseInput,
    options: SocialAgentFinalResponseGenerateOptions,
    runtime: {
      apiKey: string;
      baseUrl: string;
      useCase: 'final_response';
      model: string;
    },
  ): Promise<FinalResponseAttemptResult> {
    const { apiKey, baseUrl, useCase, model } = runtime;
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs(useCase),
    );
    let httpHeadersLatencyMs: number | null = null;
    let streamResult: DeepSeekStreamResult | null = null;
    let usageMetrics = emptyDeepSeekStreamMetrics(null);
    let emittedDelta = false;
    const onDelta = options.onDelta
      ? async (delta: string) => {
          if (delta) emittedDelta = true;
          await options.onDelta?.(delta);
        }
      : undefined;
    const deepSeekInput = await this.deepSeekMessages(input);
    const { messages, promptBudget } = deepSeekInput;
    const maxTokens = this.maxTokens();
    const thinkingMode = this.thinkingMode(useCase);
    const outputCacheKey = this.llmOutputCacheKey({
      useCase,
      model,
      maxTokens,
      thinkingMode,
      promptPrefixHash: promptBudget.promptPrefixHash,
      dynamicContextHash: promptBudget.dynamicContextHash,
    });
    const outputCacheTtlMs = this.llmOutputCacheTtlMs();
    if (outputCacheTtlMs > 0) {
      const cached =
        await this.llmOutputCacheService().getAsync(outputCacheKey);
      this.metrics?.recordLlmOutputCache({
        cacheName: 'final_response_exact',
        hit: cached !== null,
        approxChars: cached !== null ? promptBudget.approxPromptChars : null,
        promptPrefixHash: promptBudget.promptPrefixHash,
        dynamicContextHash: promptBudget.dynamicContextHash,
      });
      if (cached !== null) {
        await onDelta?.(cached);
        this.logModelCall({
          useCase,
          model,
          traceId: input.traceId ?? null,
          intent: input.intent ?? input.route?.intent,
          taskId: this.taskIdOf(input),
          promptPrefixHash: promptBudget.promptPrefixHash,
          dynamicContextHash: promptBudget.dynamicContextHash,
          latencyMs: Date.now() - startedAt,
          success: true,
          cacheHit: true,
          cacheType: 'exact',
        });
        return { ok: true, answer: cached };
      }
    }
    const semanticCacheTtlMs = this.semanticResponseCacheTtlMs();
    const semanticCacheEligible = this.isSemanticResponseCacheEligible(input);
    if (semanticCacheTtlMs > 0 && semanticCacheEligible) {
      const cached = await this.semanticResponseCacheService().getAsync(
        {
          userMessage: input.userMessage,
          intent: this.intentOf(input),
          model,
          promptPrefixHash: promptBudget.promptPrefixHash,
        },
        { threshold: this.semanticResponseCacheThreshold() },
      );
      this.metrics?.recordLlmOutputCache({
        cacheName: 'final_response_semantic',
        hit: cached !== null,
        approxChars: cached !== null ? promptBudget.approxPromptChars : null,
        promptPrefixHash: promptBudget.promptPrefixHash,
        dynamicContextHash: promptBudget.dynamicContextHash,
      });
      if (cached !== null) {
        await onDelta?.(cached.answer);
        this.logModelCall({
          useCase,
          model,
          traceId: input.traceId ?? null,
          intent: input.intent ?? input.route?.intent,
          taskId: this.taskIdOf(input),
          promptPrefixHash: promptBudget.promptPrefixHash,
          dynamicContextHash: promptBudget.dynamicContextHash,
          latencyMs: Date.now() - startedAt,
          success: true,
          cacheHit: true,
          cacheType: 'semantic',
        });
        return { ok: true, answer: cached.answer };
      }
    }

    try {
      if (this.deepSeek) {
        const answer = await this.deepSeek.complete({
          useCase,
          taskId: this.taskIdOf(input),
          intent: input.intent ?? input.route?.intent,
          fallbackTemperature: 0.6,
          maxTokens,
          retryAttempts: 1,
          messages,
          onDelta,
          signal: options.signal ?? null,
          timeoutMs: this.timeoutMs(useCase),
          traceId: input.traceId ?? null,
        });
        await this.writeLlmOutputCache(
          outputCacheKey,
          answer,
          outputCacheTtlMs,
          promptBudget.approxPromptChars,
        );
        await this.writeSemanticResponseCache(input, answer, {
          model,
          promptPrefixHash: promptBudget.promptPrefixHash,
          ttlMs: semanticCacheTtlMs,
          eligible: semanticCacheEligible,
          approxPromptChars: promptBudget.approxPromptChars,
        });
        return { ok: true, answer };
      }
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
            max_tokens: maxTokens,
            ...(onDelta ? { stream: true } : {}),
            ...(onDelta ? { stream_options: { include_usage: true } } : {}),
            thinking: { type: thinkingMode },
            messages,
          }),
        },
      );
      httpHeadersLatencyMs = Date.now() - startedAt;
      usageMetrics.httpHeadersLatencyMs = httpHeadersLatencyMs;
      if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
      streamResult = onDelta
        ? await readDeepSeekStreamedContent({
            response,
            onDelta,
            startedAt,
            httpHeadersLatencyMs,
            firstChunkTimeoutMs: this.firstChunkTimeoutMs(useCase),
            abortController: controller,
          })
        : null;
      const jsonPayload = streamResult
        ? null
        : ((await response.json()) as Record<string, unknown>);
      const answer =
        streamResult?.content ?? this.readContent(jsonPayload ?? {});
      await this.writeLlmOutputCache(
        outputCacheKey,
        answer,
        outputCacheTtlMs,
        promptBudget.approxPromptChars,
      );
      await this.writeSemanticResponseCache(input, answer, {
        model,
        promptPrefixHash: promptBudget.promptPrefixHash,
        ttlMs: semanticCacheTtlMs,
        eligible: semanticCacheEligible,
        approxPromptChars: promptBudget.approxPromptChars,
      });
      usageMetrics =
        streamResult ??
        ({
          ...usageMetrics,
          ...readDeepSeekUsageMetrics(jsonPayload ?? {}),
          systemFingerprint: readDeepSeekSystemFingerprint(jsonPayload ?? {}),
        } satisfies typeof usageMetrics);
      const latencyMs = Date.now() - startedAt;
      this.logModelCall({
        useCase,
        model,
        traceId: input.traceId ?? null,
        intent: input.intent ?? input.route?.intent,
        taskId: this.taskIdOf(input),
        promptPrefixHash: promptBudget.promptPrefixHash,
        dynamicContextHash: promptBudget.dynamicContextHash,
        latencyMs,
        success: true,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        traceId: input.traceId ?? null,
        taskId: this.taskIdOf(input),
        promptPrefixHash: promptBudget.promptPrefixHash,
        dynamicContextHash: promptBudget.dynamicContextHash,
        latencyMs,
        firstTokenLatencyMs: streamResult?.firstTokenLatencyMs ?? null,
        tokenCount: streamResult?.tokenCount ?? null,
        httpHeadersLatencyMs,
        firstSseChunkLatencyMs: usageMetrics.firstSseChunkLatencyMs,
        firstReasoningDeltaLatencyMs: usageMetrics.firstReasoningDeltaLatencyMs,
        firstContentDeltaLatencyMs: usageMetrics.firstContentDeltaLatencyMs,
        promptTokens: usageMetrics.promptTokens,
        promptCacheHitTokens: usageMetrics.promptCacheHitTokens,
        promptCacheMissTokens: usageMetrics.promptCacheMissTokens,
        completionTokens: usageMetrics.completionTokens,
        reasoningTokens: usageMetrics.reasoningTokens,
        approxPromptChars: promptBudget.approxPromptChars,
        systemFingerprint: usageMetrics.systemFingerprint,
        success: true,
      });
      return { ok: true, answer };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const clientAborted =
        error instanceof Error &&
        error.name === 'AbortError' &&
        Boolean(options.signal?.aborted);
      const reason = clientAborted
        ? 'client_aborted'
        : socialAgentDeepSeekFailureReason(error);
      this.logModelCall({
        useCase,
        model,
        traceId: input.traceId ?? null,
        intent: input.intent ?? input.route?.intent,
        taskId: this.taskIdOf(input),
        promptPrefixHash: promptBudget.promptPrefixHash,
        dynamicContextHash: promptBudget.dynamicContextHash,
        latencyMs,
        success: false,
        reason,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        traceId: input.traceId ?? null,
        taskId: this.taskIdOf(input),
        promptPrefixHash: promptBudget.promptPrefixHash,
        dynamicContextHash: promptBudget.dynamicContextHash,
        latencyMs,
        success: false,
        httpHeadersLatencyMs,
        firstSseChunkLatencyMs: usageMetrics.firstSseChunkLatencyMs,
        firstReasoningDeltaLatencyMs: usageMetrics.firstReasoningDeltaLatencyMs,
        firstContentDeltaLatencyMs: usageMetrics.firstContentDeltaLatencyMs,
        approxPromptChars: promptBudget.approxPromptChars,
        failureReason: reason,
      });
      return {
        ok: false,
        error,
        reason,
        clientAborted,
        retryable:
          !emittedDelta &&
          !clientAborted &&
          isRetryableSocialAgentDeepSeekFailure(reason, {
            includeTimeoutFailures: true,
            includeJsonFormatErrors: true,
          }),
      };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromParent);
    }
  }

  private async deepSeekMessages(
    input: SocialAgentFinalResponseInput,
  ): Promise<DeepSeekMessagesInput> {
    const systemPrompt = this.systemPrompt(await this.publishedPromptRules());
    const { payload, promptBudget } =
      this.tokenBudgetContextPacker().packFinalResponseInput(input, {
        promptPrefix: systemPrompt,
        budgetMode: this.contextBudgetMode('final_response'),
      });
    return {
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
      promptBudget,
    };
  }

  private contextAwareFallbackReply(
    input: SocialAgentFinalResponseInput,
  ): string {
    const fallback = cleanDisplayText(input.fallbackReply, '').trim();
    const slots = this.tokenBudgetContextPacker().knownSlots(input);
    if (
      !this.isStaleSlotClarification(fallback, slots) &&
      !this.isGenericRecoveryFallback(fallback, slots) &&
      !this.isGenericOnboardingFallback(fallback, slots, input.intent)
    ) {
      return fallback;
    }
    if (!this.canUseTaskSlotContinuationFallback(input)) return fallback;
    const knownValues = [
      slots.activity,
      slots.time_window,
      slots.location_text ?? slots.geo_area,
      slots.candidate_preference,
    ].filter(Boolean);
    if (knownValues.length === 0) return fallback;
    return [
      `我记得你已经补充了：${knownValues.slice(0, 4).join('、')}。`,
      '我会基于这些继续处理，不再重复追问；如果要修改，直接告诉我新的时间、地点或偏好。',
    ].join('');
  }

  private canUseTaskSlotContinuationFallback(
    input: SocialAgentFinalResponseInput,
  ): boolean {
    const intent = this.intentOf(input);
    const socialTaskIntent = [
      'social_search',
      'activity_search',
      'candidate_followup',
      'action_request',
    ].includes(intent);
    if (!socialTaskIntent) return false;

    const message = cleanDisplayText(input.userMessage, '').trim();
    if (
      explicitlyRejectsSocialExecution(message) ||
      isConversationOnlySocialMention(message) ||
      isSocialAdviceQuestion(message)
    ) {
      return false;
    }

    if (this.isRecord(input.route)) {
      const replyStrategy = cleanDisplayText(
        input.route.replyStrategy,
        '',
      ).trim();
      const hasExecutionSignal =
        input.route.shouldSearch === true ||
        input.route.shouldExecuteAction === true ||
        input.route.shouldReplan === true;
      if (replyStrategy === 'conversational_answer' && !hasExecutionSignal) {
        return false;
      }
    }

    return true;
  }

  private isStaleSlotClarification(
    fallback: string,
    slots: Record<string, string>,
  ): boolean {
    if (!fallback) return false;
    const asksKnownTime =
      Boolean(slots.time_window) &&
      /(今晚|今天晚上|周末|下午|上午|中午|晚上|什么时候|哪个时间|时间偏好|时间)/i.test(
        fallback,
      );
    const asksKnownActivity =
      Boolean(slots.activity) &&
      /(散步|跑步|羽毛球|篮球|健身|活动|约练类型|运动类型|做什么)/i.test(
        fallback,
      );
    const asksKnownLocation =
      Boolean(slots.location_text ?? slots.geo_area) &&
      /(青岛大学|附近|地点|位置|哪里|哪个区域|区域)/i.test(fallback);
    const asksKnownCandidatePreference =
      Boolean(slots.candidate_preference) &&
      /(女生|男生|舞蹈|舞蹈生|候选偏好|想找什么样的人|什么样的人)/i.test(
        fallback,
      );
    return (
      asksKnownTime ||
      asksKnownActivity ||
      asksKnownLocation ||
      asksKnownCandidatePreference
    );
  }

  private isGenericRecoveryFallback(
    fallback: string,
    slots: Record<string, string>,
  ): boolean {
    if (!fallback) return false;
    const hasActionableSocialContext = Boolean(
      slots.activity ||
      slots.time_window ||
      slots.location_text ||
      slots.geo_area ||
      slots.candidate_preference,
    );
    if (!hasActionableSocialContext) return false;
    return /(?:保留(?:了)?当前对话|保留(?:了)?你的需求|稍后再试|稍后再试一次|可以稍后|稍后继续|连接中断|重试)/i.test(
      fallback,
    );
  }

  private isGenericOnboardingFallback(
    fallback: string,
    slots: Record<string, string>,
    intent?: string | null,
  ): boolean {
    if (!fallback) return false;
    if (!this.hasActionableSocialSlots(slots)) return false;
    const socialIntent =
      /social_search|activity_search|candidate_followup|action_request/i.test(
        cleanDisplayText(intent, ''),
      );
    const asksForAlreadyStartedProfile =
      /(先|继续|可以)?(帮你|帮我)?(补齐|完善|填写|整理).{0,12}(画像|基础信息|资料)|告诉我.{0,18}(城市|兴趣|可约时间|活动|地点|区域|想认识|边界)|还缺.{0,18}(关键信息|基础信息|画像|城市|时间|地点|活动)/i.test(
        fallback,
      );
    return socialIntent && asksForAlreadyStartedProfile;
  }

  private hasActionableSocialSlots(slots: Record<string, string>): boolean {
    return Boolean(
      slots.activity ||
      slots.time_window ||
      slots.location_text ||
      slots.geo_area ||
      slots.candidate_preference,
    );
  }

  private isNoRealCandidateFallback(
    input: SocialAgentFinalResponseInput,
    fallback: string,
  ): boolean {
    const emptyReason = cleanDisplayText(
      input.searchResults?.emptyReason ??
        input.taskContext?.emptyReason ??
        input.plannerDecision?.emptyReason ??
        '',
      '',
    )
      .trim()
      .toLowerCase();
    if (
      [
        'no_real_candidates',
        'no_candidates',
        'empty_candidates',
        'no_public_candidates',
      ].includes(emptyReason)
    ) {
      return true;
    }
    return /(?:当前|暂时|这次)?没有(?:找到|匹配到).{0,12}(真实候选人|合适的人|公开可发现的人|符合条件的人)|暂无公开可发现/.test(
      fallback,
    );
  }

  private isLowRiskCardActionFallback(fallback: string): boolean {
    if (
      /(需要|等待|请你|请先).{0,10}(确认|同意)|确认后|发送前|发布前/.test(
        fallback,
      )
    ) {
      return false;
    }
    return /(?:已记录|已收藏|已保存|已生成.{0,8}开场白|开场白草稿|暂不发布|这个操作来自旧卡片|旧卡片|暂时不可用|暂不可用)/.test(
      fallback,
    );
  }

  private systemPrompt(publishedRules: string[] = []): string {
    const baseRules = [
      '你是 FitMeet Agent 的第 7 层 Final Response Generator。',
      '你只负责把用户消息、对话上下文、Planner 计划、工具结果、记忆和安全规则整合成自然中文回复。',
      '无论前面是普通聊天、画像保存、搜索结果、候选人操作还是活动规划，都要基于输入事实统一生成最终回复。',
      '不要暴露 DeepSeek、API、后端、工具日志、JSON 字段名、内部状态机名称或错误堆栈。',
      '不要编造候选人、活动、消息、关系状态或已经执行的工具结果。',
      '如果工具已经成功执行，可以明确说已完成；如果工具需要用户确认，只能说等待确认，不能说已经发送、连接或创建。',
      '如果搜索结果为空，要自然说明没有找到，并给出一个可执行的下一步，例如放宽条件、补充时间或发布需求。',
      '如果画像已更新，要区分已写入字段、补充记忆字段和仍缺失的信息，并用一个简短问题推进下一步。',
      'taskContext.taskSlots 和 memoryContext.taskSlots 是用户已回答/已确认的信息硬约束；state 为 answered、confirmed、completed 或 modified 的字段不能重复追问，只能基于它们继续推进。',
      'taskContext.candidateActions/candidateState 是候选人操作事实；已经跳过的候选不要再次推荐，已经保存、喜欢或已邀请的候选要按当前状态继续。',
      'taskContext.pendingApprovals/pendingActions 是待用户确认的动作事实；存在待确认发布、连接、发邀请或发消息时，只能提示用户确认、修改或取消，不能把动作说成已经执行。',
      '如果用户刚刚纠正了目标、地点、时间或候选偏好，要先承认并复述最新约束，再继续计划；最新用户修正优先于旧 fallbackReply 或旧澄清问题。',
      'candidate_preference 只能作为公开可发现资料、公开标签或用户自愿公开信息的筛选偏好，不能推断隐私或承诺一定能找到。',
      '默认使用非 thinking 快速回答；只有输入里明确有复杂推理证据时才展开步骤，但不要把推理过程输出给用户。',
      '回复要像豆包/GPT 一样自然、具体、克制，不要像模板；优先使用 1-2 段，必要时使用简短列表。',
    ];
    if (publishedRules.length > 0) {
      baseRules.push(
        '以下是经过人审发布的 FitMeet Agent 自我改进规则，必须遵守：',
        ...publishedRules.map((rule) => `- ${rule}`),
      );
    }
    return baseRules.join('\n');
  }

  private async publishedPromptRules(): Promise<string[]> {
    if (!this.selfImprove) return [];
    try {
      return await this.selfImprove.publishedPromptRules(
        'final_response.system_prompt',
      );
    } catch {
      return [];
    }
  }

  private tokenBudgetContextPacker(): SocialAgentTokenBudgetContextPackerService {
    if (this.contextPacker) return this.contextPacker;
    this.localContextPacker ??= new SocialAgentTokenBudgetContextPackerService(
      this.config,
    );
    return this.localContextPacker;
  }

  private llmOutputCacheService(): SocialAgentLlmOutputCacheService {
    if (this.llmOutputCache) return this.llmOutputCache;
    this.localLlmOutputCache ??= new SocialAgentLlmOutputCacheService();
    return this.localLlmOutputCache;
  }

  private semanticResponseCacheService(): SocialAgentSemanticResponseCacheService {
    if (this.semanticResponseCache) return this.semanticResponseCache;
    this.localSemanticResponseCache ??=
      new SocialAgentSemanticResponseCacheService();
    return this.localSemanticResponseCache;
  }

  private llmOutputCacheKey(input: {
    useCase: 'final_response';
    model: string;
    maxTokens: number;
    thinkingMode: 'disabled' | 'enabled';
    promptPrefixHash: string | null;
    dynamicContextHash: string;
  }): string {
    return [
      'final_response_exact',
      input.useCase,
      input.model,
      `max:${input.maxTokens}`,
      `thinking:${input.thinkingMode}`,
      `prefix:${input.promptPrefixHash ?? 'none'}`,
      `dynamic:${input.dynamicContextHash}`,
    ].join('|');
  }

  private async writeLlmOutputCache(
    key: string,
    answer: string | null,
    ttlMs: number,
    approxPromptChars: number,
  ): Promise<void> {
    const text = cleanDisplayText(answer, '').trim();
    if (!text || ttlMs <= 0) return;
    await this.llmOutputCacheService().setAsync(key, text, {
      ttlMs,
      approxPromptChars,
    });
  }

  private async writeSemanticResponseCache(
    input: SocialAgentFinalResponseInput,
    answer: string | null,
    options: {
      model: string;
      promptPrefixHash: string | null;
      ttlMs: number;
      eligible: boolean;
      approxPromptChars: number;
    },
  ): Promise<void> {
    const text = cleanDisplayText(answer, '').trim();
    if (!text || options.ttlMs <= 0 || !options.eligible) return;
    await this.semanticResponseCacheService().setAsync(
      {
        userMessage: input.userMessage,
        answer: text,
        intent: this.intentOf(input),
        model: options.model,
        promptPrefixHash: options.promptPrefixHash,
      },
      { ttlMs: options.ttlMs, approxPromptChars: options.approxPromptChars },
    );
  }

  private llmOutputCacheTtlMs(): number {
    const configuredRaw = this.config?.get<string>(
      'SOCIAL_AGENT_FINAL_RESPONSE_EXACT_CACHE_TTL_MS',
    );
    if (configuredRaw != null && configuredRaw.trim() !== '') {
      const configured = Number(configuredRaw);
      if (!Number.isFinite(configured)) return 0;
      if (configured <= 0) return 0;
      return Math.min(Math.max(Math.floor(configured), 1_000), 600_000);
    }
    return 60_000;
  }

  private semanticResponseCacheTtlMs(): number {
    const configuredRaw = this.config?.get<string>(
      'SOCIAL_AGENT_FINAL_RESPONSE_SEMANTIC_CACHE_TTL_MS',
    );
    if (configuredRaw != null && configuredRaw.trim() !== '') {
      const configured = Number(configuredRaw);
      if (!Number.isFinite(configured)) return 0;
      if (configured <= 0) return 0;
      return Math.min(Math.max(Math.floor(configured), 1_000), 600_000);
    }
    return 300_000;
  }

  private semanticResponseCacheThreshold(): number {
    const configured = Number(
      this.config?.get<string>(
        'SOCIAL_AGENT_FINAL_RESPONSE_SEMANTIC_CACHE_THRESHOLD',
      ) ?? '',
    );
    if (!Number.isFinite(configured) || configured <= 0) return 0.78;
    return Math.min(Math.max(configured, 0.1), 0.99);
  }

  private isSemanticResponseCacheEligible(
    input: SocialAgentFinalResponseInput,
  ): boolean {
    const intent = this.intentOf(input);
    if (
      !['product_help', 'workflow_help', 'safety_or_boundary'].includes(intent)
    ) {
      return false;
    }
    if (this.taskIdOf(input) != null) return false;
    if (Array.isArray(input.toolResults) && input.toolResults.length > 0) {
      return false;
    }
    if (this.hasMeaningfulObject(input.searchResults)) return false;
    if (this.hasMeaningfulObject(input.taskContext)) return false;
    if (this.hasMeaningfulObject(input.memoryContext)) return false;
    if (
      this.routeOrPlannerRequestsExecution(input.route) ||
      this.routeOrPlannerRequestsExecution(input.plannerDecision)
    ) {
      return false;
    }
    return !this.isDirectSocialExecutionRequest(input.userMessage);
  }

  private contextBudgetMode(
    useCase: 'final_response',
  ): SocialAgentTokenBudgetMode {
    const configured = cleanDisplayText(
      this.config?.get<string>(
        'SOCIAL_AGENT_FINAL_RESPONSE_CONTEXT_BUDGET_MODE',
      ) ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_CONTEXT_BUDGET_MODE') ??
        '',
      '',
    )
      .trim()
      .toLowerCase();
    if (configured === 'strict' || configured === 'standard') {
      return configured;
    }
    return (
      this.observability?.recommendedLlmContextMode?.(useCase) ?? 'standard'
    );
  }

  private intentOf(input: SocialAgentFinalResponseInput): string {
    const intent =
      typeof input.intent === 'string'
        ? input.intent
        : typeof input.route?.intent === 'string'
          ? input.route.intent
          : '';
    return cleanDisplayText(intent, '').trim();
  }

  private hasMeaningfulObject(value: unknown): boolean {
    if (!this.isRecord(value)) return false;
    return Object.values(value).some((item) => {
      if (item == null) return false;
      if (Array.isArray(item)) return item.length > 0;
      if (this.isRecord(item)) return this.hasMeaningfulObject(item);
      if (typeof item === 'string') return item.trim().length > 0;
      return true;
    });
  }

  private routeOrPlannerRequestsExecution(value: unknown): boolean {
    if (!this.isRecord(value)) return false;
    const flags = [
      'shouldSearch',
      'shouldExecuteAction',
      'shouldUpdateProfile',
      'shouldReplan',
      'shouldCallTools',
      'shouldPublish',
      'shouldConnectCandidate',
      'shouldSendMessage',
      'requiresApproval',
    ];
    if (flags.some((flag) => value[flag] === true)) return true;
    const action = cleanDisplayText(value.action, '').trim();
    return Boolean(action && !['none', 'answer', 'chat'].includes(action));
  }

  private isDirectSocialExecutionRequest(message: string): boolean {
    const text = cleanDisplayText(message, '').trim();
    if (!text) return false;
    if (
      /(怎么|如何|流程|步骤|介绍|说明).{0,12}(找|约|发布|邀请|加好友)/i.test(
        text,
      )
    ) {
      return false;
    }
    return /(帮我|给我|我要|我想|想|找|推荐|匹配|约|发布|发送|邀请|加好友|私信).{0,18}(搭子|人|女生|男生|活动|约练|朋友|候选|发现|邀请|消息|私信|好友)/i.test(
      text,
    );
  }

  private readContent(payload: Record<string, unknown>): string {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = this.isRecord(choices[0]) ? choices[0] : {};
    const message = this.isRecord(first.message) ? first.message : {};
    return cleanDisplayText(message.content, '').trim();
  }

  private modelFor(useCase: 'final_response'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.configuredModel(
        this.config?.get<string>('AGENT_FINAL_RESPONSE_MODEL'),
      ) ||
      this.configuredModel(this.config?.get<string>('DEEPSEEK_CHAT_MODEL')) ||
      this.chatCompatibleLegacyModel() ||
      this.defaultChatModel()
    );
  }

  private configuredModel(value?: string | null): string | null {
    return selectSocialAgentConfiguredModel(value, {
      allowFast: false,
    });
  }

  private chatCompatibleLegacyModel(): string | null {
    const legacy = normalizeSocialAgentModel(
      this.config?.get<string>('DEEPSEEK_MODEL'),
    );
    if (!legacy || legacy === 'deepseek-v4') return null;
    if (isSocialAgentLegacyDeepSeekAlias(legacy)) return null;
    return /chat/i.test(legacy) ? legacy : null;
  }

  private defaultChatModel(): string {
    return SOCIAL_AGENT_DEFAULT_REASONING_MODEL;
  }

  private timeoutMs(useCase: 'final_response'): number {
    if (this.modelRouter) return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config?.get<string>('SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS') ??
        this.config?.get<string>('SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS') ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
        this.config?.get<string>('DEEPSEEK_TIMEOUT_MS') ??
        `${SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS}`,
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS;
    }
    return Math.max(configured, SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS);
  }

  private firstChunkTimeoutMs(useCase: 'final_response'): number {
    if (this.modelRouter) return this.modelRouter.getFirstChunkTimeout(useCase);
    const configured = Number(
      this.config?.get<string>(
        'SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS',
      ) ??
        this.config?.get<string>('SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS') ??
        this.config?.get<string>(
          'SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS',
        ) ??
        this.config?.get<string>('DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS') ??
        `${SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS}`,
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS;
    }
    return Math.max(
      configured,
      SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
    );
  }

  private maxTokens(): number {
    const configured = Number(
      this.config?.get<string>('SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS') ??
        this.config?.get<string>('SOCIAL_AGENT_CHAT_MAX_TOKENS') ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_MAX_TOKENS') ??
        '',
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return 1200;
    }
    return Math.min(Math.max(Math.floor(configured), 900), 4000);
  }

  private thinkingMode(useCase: 'final_response'): 'disabled' | 'enabled' {
    if (this.modelRouter) return this.modelRouter.getThinkingMode(useCase);
    const value = `${
      this.config?.get<string>('SOCIAL_AGENT_FINAL_RESPONSE_THINKING') ??
      this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_THINKING') ??
      ''
    }`
      .trim()
      .toLowerCase();
    return ['enabled', 'true', '1', 'yes'].includes(value)
      ? 'enabled'
      : 'disabled';
  }

  private taskIdOf(input: SocialAgentFinalResponseInput): number | null {
    const taskId =
      this.numberValue(input.taskContext?.taskId) ??
      this.numberValue(input.plannerDecision?.taskId) ??
      this.numberValue(input.route?.taskId);
    return taskId ?? null;
  }

  private numberValue(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private logModelCall(input: {
    useCase: string;
    model: string;
    traceId?: string | null;
    intent?: unknown;
    taskId: number | null;
    promptPrefixHash?: string | null;
    dynamicContextHash?: string | null;
    latencyMs: number;
    success: boolean;
    reason?: string;
    cacheHit?: boolean;
    cacheType?: 'exact' | 'semantic';
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'social_agent.model_call',
        useCase: input.useCase,
        model: input.model,
        traceId: input.traceId ?? null,
        taskId: input.taskId,
        intent: typeof input.intent === 'string' ? input.intent : null,
        promptPrefixHash: input.promptPrefixHash ?? null,
        dynamicContextHash: input.dynamicContextHash ?? null,
        latencyMs: input.latencyMs,
        success: input.success,
        ...(input.cacheHit != null ? { cacheHit: input.cacheHit } : {}),
        ...(input.cacheType ? { cacheType: input.cacheType } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
