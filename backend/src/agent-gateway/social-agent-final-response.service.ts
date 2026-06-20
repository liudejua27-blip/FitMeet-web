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
import {
  selectSocialAgentContextWindow,
  socialAgentContextTurnLimit,
} from './social-agent-context-window';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';

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

type FinalResponseSlotConfirmation =
  | 'user_confirmed'
  | 'inferred_context';

type FinalResponseSlotEntry = {
  value: string;
  confirmation: FinalResponseSlotConfirmation;
  state?: string;
};

@Injectable()
export class SocialAgentFinalResponseService {
  private readonly logger = new Logger(SocialAgentFinalResponseService.name);

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional() private readonly selfImprove?: AgentSelfImproveService,
    @Optional() private readonly observability?: AgentObservabilityService,
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
  ) {}

  async generate(
    input: SocialAgentFinalResponseInput,
    options: SocialAgentFinalResponseGenerateOptions = {},
  ): Promise<string> {
    const fallback = this.contextAwareFallbackReply(input);
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
    const messages = await this.deepSeekMessages(input);

    try {
      if (this.deepSeek) {
        const answer = await this.deepSeek.complete({
          useCase,
          taskId: this.taskIdOf(input),
          intent: input.intent ?? input.route?.intent,
          fallbackTemperature: 0.6,
          maxTokens: this.maxTokens(),
          retryAttempts: 1,
          messages,
          onDelta,
          signal: options.signal ?? null,
          timeoutMs: this.timeoutMs(useCase),
          traceId: input.traceId ?? null,
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
            max_tokens: this.maxTokens(),
            ...(onDelta ? { stream: true } : {}),
            ...(onDelta ? { stream_options: { include_usage: true } } : {}),
            thinking: { type: this.thinkingMode(useCase) },
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
        latencyMs,
        success: true,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        traceId: input.traceId ?? null,
        taskId: this.taskIdOf(input),
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
        latencyMs,
        success: false,
        reason,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        traceId: input.traceId ?? null,
        taskId: this.taskIdOf(input),
        latencyMs,
        success: false,
        httpHeadersLatencyMs,
        firstSseChunkLatencyMs: usageMetrics.firstSseChunkLatencyMs,
        firstReasoningDeltaLatencyMs: usageMetrics.firstReasoningDeltaLatencyMs,
        firstContentDeltaLatencyMs: usageMetrics.firstContentDeltaLatencyMs,
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
  ): Promise<Array<{ role: 'system' | 'user'; content: string }>> {
    return [
      {
        role: 'system',
        content: this.systemPrompt(await this.publishedPromptRules()),
      },
      {
        role: 'user',
        content: JSON.stringify(this.payload(input)),
      },
    ];
  }

  private payload(
    input: SocialAgentFinalResponseInput,
  ): Record<string, unknown> {
    return {
      userMessage: cleanDisplayText(input.userMessage, ''),
      intent: input.intent ?? input.route?.intent ?? null,
      route: input.route ?? null,
      conversationHistory: selectSocialAgentContextWindow(
        input.conversationHistory,
        socialAgentContextTurnLimit(this.config),
      ),
      memoryContext: input.memoryContext ?? null,
      taskContext: input.taskContext ?? null,
      knownTaskSlotConstraints: this.taskSlotConstraints(input),
      plannerDecision: input.plannerDecision ?? null,
      toolResults: input.toolResults ?? [],
      searchResults: input.searchResults ?? null,
      agentState: input.agentState ?? null,
      safetyRules:
        input.safetyRules && input.safetyRules.length > 0
          ? input.safetyRules
          : this.defaultSafetyRules(),
      responseGoal: input.responseGoal ?? null,
      fallbackReply: input.fallbackReply,
    };
  }

  private contextAwareFallbackReply(input: SocialAgentFinalResponseInput): string {
    const fallback = cleanDisplayText(input.fallbackReply, '').trim();
    const slots = this.knownSlots(input);
    if (
      !this.isStaleSlotClarification(fallback, slots) &&
      !this.isGenericRecoveryFallback(fallback, slots) &&
      !this.isGenericOnboardingFallback(fallback, slots, input.intent)
    ) {
      return fallback;
    }
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

  private taskSlotConstraints(
    input: SocialAgentFinalResponseInput,
  ): Record<string, unknown> {
    const slots = this.slotEntries(input);
    const labels: Record<string, string> = {
      activity: '活动',
      time_window: '时间',
      location_text: '地点',
      geo_area: '区域',
      intensity: '强度',
      visibility: '公开方式',
      safety_boundary: '安全边界',
      invite_tone: '邀请语气',
      candidate_preference: '候选偏好',
    };
    const known = Object.entries(slots)
      .filter(([, slot]) => cleanDisplayText(slot.value, ''))
      .map(([key, slot]) => ({
        key,
        label: labels[key] ?? key,
        value: slot.value,
        ...(slot.state ? { state: slot.state } : {}),
        confirmation: slot.confirmation,
      }));
    return {
      treatAsHardConstraints: known.length > 0,
      knownSlots: known,
      doNotAskAgainFor: known
        .filter((slot) => slot.confirmation === 'user_confirmed')
        .map((slot) => slot.key),
      userVisibleSummary: known
        .map((slot) => `${slot.label}：${slot.value}`)
        .join('；'),
      candidatePreferencePolicy:
        'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
      instruction:
        '如果 knownSlots 已包含用户刚才或之前补充的信息，最终回复必须基于这些信息继续推进；除非用户主动修改，否则不要再次询问 doNotAskAgainFor 中的字段。',
    };
  }

  private knownSlots(input: SocialAgentFinalResponseInput): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, slot] of Object.entries(this.slotEntries(input))) {
      out[key] = slot.value;
    }
    return out;
  }

  private slotEntries(
    input: SocialAgentFinalResponseInput,
  ): Record<string, FinalResponseSlotEntry> {
    const taskContext = this.isRecord(input.taskContext)
      ? input.taskContext
      : {};
    const taskMemory = this.isRecord(taskContext.taskMemory)
      ? taskContext.taskMemory
      : {};
    return {
      ...this.extractKnownConstraintSlotEntries(input.memoryContext),
      ...this.extractKnownConstraintSlotEntries(taskMemory),
      ...this.extractKnownConstraintSlotEntries(taskContext),
      ...this.extractSlotEntries(input.memoryContext?.taskSlots),
      ...this.extractSlotEntries(taskMemory.taskSlots),
      ...this.extractSlotEntries(taskContext.taskSlots),
    };
  }

  private extractKnownConstraintSlotEntries(
    value: unknown,
  ): Record<string, FinalResponseSlotEntry> {
    const source = this.isRecord(value) ? value : {};
    const constraints = this.isRecord(source.knownTaskSlotConstraints)
      ? source.knownTaskSlotConstraints
      : {};
    const knownSlots = Array.isArray(constraints.knownSlots)
      ? constraints.knownSlots
      : [];
    const doNotAskAgainFor = Array.isArray(constraints.doNotAskAgainFor)
      ? new Set(
          constraints.doNotAskAgainFor
            .map((item) => cleanDisplayText(item, ''))
            .filter(Boolean),
        )
      : new Set<string>();
    const out: Record<string, FinalResponseSlotEntry> = {};
    for (const rawSlot of knownSlots) {
      if (!this.isRecord(rawSlot)) continue;
      const key = cleanDisplayText(rawSlot.key, '');
      const valueText = cleanDisplayText(rawSlot.value, '');
      if (!key || !valueText) continue;
      const state = cleanDisplayText(rawSlot.state, '');
      const confirmation =
        rawSlot.confirmation === 'user_confirmed' || doNotAskAgainFor.has(key)
          ? 'user_confirmed'
          : 'inferred_context';
      out[key] = {
        value: valueText,
        confirmation,
        ...(state ? { state } : {}),
      };
    }
    return out;
  }

  private extractSlotEntries(
    value: unknown,
  ): Record<string, FinalResponseSlotEntry> {
    const slots = this.isRecord(value) ? value : {};
    const knownStates = new Set([
      'inferred',
      'answered',
      'confirmed',
      'completed',
      'modified',
    ]);
    const userConfirmedStates = new Set([
      'answered',
      'confirmed',
      'completed',
      'modified',
    ]);
    const out: Record<string, FinalResponseSlotEntry> = {};
    for (const key of [
      'activity',
      'time_window',
      'location_text',
      'geo_area',
      'intensity',
      'visibility',
      'safety_boundary',
      'invite_tone',
      'candidate_preference',
    ]) {
      const raw = slots[key];
      const slot = this.isRecord(raw) ? raw : {};
      const state = cleanDisplayText(slot.state, '');
      if (state && !knownStates.has(state)) continue;
      const valueText = cleanDisplayText(slot.value ?? raw, '');
      if (!valueText) continue;
      out[key] = {
        value: valueText,
        confirmation: userConfirmedStates.has(state)
          ? 'user_confirmed'
          : 'inferred_context',
        ...(state ? { state } : {}),
      };
    }
    return out;
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
    const socialIntent = /social_search|activity_search|candidate_followup|action_request/i.test(
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

  private defaultSafetyRules(): string[] {
    return [
      '涉及私信、加好友、连接候选人、创建公开活动或公开需求时，必须遵守确认要求。',
      '不要承诺线下见面安全；提醒优先公共场所、尊重边界。',
      '不要输出骚扰、操控、越界或隐私泄露式文案。',
      '不要把推断当成事实。',
    ];
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
    latencyMs: number;
    success: boolean;
    reason?: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'social_agent.model_call',
        useCase: input.useCase,
        model: input.model,
        traceId: input.traceId ?? null,
        taskId: input.taskId,
        intent: typeof input.intent === 'string' ? input.intent : null,
        latencyMs: input.latencyMs,
        success: input.success,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
