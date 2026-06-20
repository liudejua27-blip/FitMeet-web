import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
  isSocialAgentLegacyDeepSeekAlias,
  normalizeSocialAgentModel,
  selectSocialAgentConfiguredModel,
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
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

type ChatDeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatDeepSeekAttemptResult =
  | { ok: true; content: string | null }
  | {
      ok: false;
      error: unknown;
      reason: string;
      retryable: boolean;
      clientAborted: boolean;
    };

@Injectable()
export class SocialAgentChatDeepSeekClientService {
  private readonly logger = new Logger(
    SocialAgentChatDeepSeekClientService.name,
  );

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly observability?: AgentObservabilityService,
  ) {}

  configReader(): Pick<ConfigService, 'get'> {
    return this.config;
  }

  async complete(input: {
    useCase: SocialAgentModelUseCase;
    taskId: number | null;
    intent?: unknown;
    fallbackTemperature: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
    retryAttempts?: number;
    messages: ChatDeepSeekMessage[];
    onDelta?: (delta: string) => void | Promise<void>;
    signal?: AbortSignal | null;
    timeoutMs?: number | null;
    traceId?: string | null;
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model = this.modelFor(input.useCase);
    const maxAttempts =
      input.retryAttempts ?? socialAgentDeepSeekRetryAttempts(this.config);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.completeOnce(input, {
        apiKey,
        baseUrl,
        model,
      });
      if (result.ok) return result.content;
      if (result.clientAborted) throw new Error('client_aborted');

      const willRetry = result.retryable && attempt < maxAttempts;
      if (willRetry) {
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.chat.deepseek_retrying',
            useCase: input.useCase,
            taskId: input.taskId,
            reason: result.reason,
            attempt,
            maxAttempts,
          }),
        );
        continue;
      }
      if (result.error instanceof Error) throw result.error;
      throw new Error(result.reason);
    }

    return null;
  }

  private async completeOnce(
    input: {
      useCase: SocialAgentModelUseCase;
      taskId: number | null;
      intent?: unknown;
      fallbackTemperature: number;
      maxTokens?: number;
      responseFormat?: { type: 'json_object' };
      retryAttempts?: number;
      messages: ChatDeepSeekMessage[];
      onDelta?: (delta: string) => void | Promise<void>;
      signal?: AbortSignal | null;
      timeoutMs?: number | null;
      traceId?: string | null;
    },
    runtime: { apiKey: string; baseUrl: string; model: string },
  ): Promise<ChatDeepSeekAttemptResult> {
    const { apiKey, baseUrl, model } = runtime;
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    input.signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(
      () => controller.abort(),
      this.chatDeepSeekTimeoutMs(input.useCase, input.timeoutMs),
    );
    let httpHeadersLatencyMs: number | null = null;
    let streamResult: DeepSeekStreamResult | null = null;
    let usageMetrics = emptyDeepSeekStreamMetrics(null);
    let emittedDelta = false;
    const onDelta = input.onDelta
      ? async (delta: string) => {
          if (delta) emittedDelta = true;
          await input.onDelta?.(delta);
        }
      : undefined;

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
            temperature:
              this.modelRouter?.getTemperature(input.useCase) ??
              input.fallbackTemperature,
            ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
            ...(input.responseFormat
              ? { response_format: input.responseFormat }
              : {}),
            ...(onDelta && !input.responseFormat ? { stream: true } : {}),
            ...(onDelta && !input.responseFormat
              ? { stream_options: { include_usage: true } }
              : {}),
            thinking: { type: this.thinkingMode(input.useCase) },
            messages: input.messages,
          }),
        },
      );
      httpHeadersLatencyMs = Date.now() - startedAt;
      usageMetrics.httpHeadersLatencyMs = httpHeadersLatencyMs;
      if (!response.ok) {
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }
      streamResult =
        onDelta && !input.responseFormat
          ? await readDeepSeekStreamedContent({
              response,
              onDelta,
              startedAt,
              httpHeadersLatencyMs,
              firstChunkTimeoutMs: this.firstChunkTimeoutMs(input.useCase),
              abortController: controller,
            })
          : null;
      const jsonPayload = streamResult
        ? null
        : ((await response.json()) as Record<string, unknown>);
      const content =
        streamResult?.content ??
        this.readChatDeepSeekContent(jsonPayload ?? {});
      usageMetrics =
        streamResult ??
        ({
          ...usageMetrics,
          ...readDeepSeekUsageMetrics(jsonPayload ?? {}),
          systemFingerprint: readDeepSeekSystemFingerprint(jsonPayload ?? {}),
        } satisfies typeof usageMetrics);
      const latencyMs = Date.now() - startedAt;
      this.logModelCall({
        useCase: input.useCase,
        model,
        taskId: input.taskId,
        intent: input.intent,
        latencyMs,
        success: true,
      });
      this.observability?.recordLlmCall({
        traceId: input.traceId,
        useCase: input.useCase,
        model,
        taskId: input.taskId,
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
      return { ok: true, content: content || null };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const clientAborted =
        error instanceof Error &&
        error.name === 'AbortError' &&
        Boolean(input.signal?.aborted);
      const reason = clientAborted
        ? 'client_aborted'
        : socialAgentDeepSeekFailureReason(error);
      this.logModelCall({
        useCase: input.useCase,
        model,
        taskId: input.taskId,
        intent: input.intent,
        latencyMs,
        success: false,
        reason,
      });
      this.observability?.recordLlmCall({
        traceId: input.traceId,
        useCase: input.useCase,
        model,
        taskId: input.taskId,
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
        error:
          error instanceof Error && error.name === 'AbortError'
            ? new Error(clientAborted ? 'client_aborted' : 'deepseek_timeout')
            : error,
        reason,
        clientAborted,
        retryable:
          !emittedDelta &&
          !clientAborted &&
          isRetryableSocialAgentDeepSeekFailure(reason, {
            includeTimeoutFailures: true,
          }),
      };
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abortFromParent);
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
        this.configuredModel(
          this.config.get<string>('AGENT_CASUAL_CHAT_MODEL'),
        ) ||
        this.configuredModel(this.config.get<string>('DEEPSEEK_CHAT_MODEL')) ||
        this.chatCompatibleLegacyModel(legacy) ||
        this.defaultChatModel()
      );
    }
    if (useCase === 'final_response') {
      return (
        this.configuredModel(
          this.config.get<string>('AGENT_FINAL_RESPONSE_MODEL'),
        ) ||
        this.configuredModel(this.config.get<string>('DEEPSEEK_CHAT_MODEL')) ||
        this.chatCompatibleLegacyModel(legacy) ||
        this.defaultChatModel()
      );
    }
    return (
      this.configuredModel(this.toolSpecificModel(useCase)) ||
      this.configuredModel(this.config.get<string>('DEEPSEEK_CHAT_MODEL')) ||
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private configuredModel(value?: string | null): string | null {
    return selectSocialAgentConfiguredModel(value, {
      allowFast: false,
    });
  }

  private chatCompatibleLegacyModel(value?: string | null): string | null {
    const legacy = normalizeSocialAgentModel(value);
    if (!legacy || legacy === 'deepseek-v4') return null;
    if (isSocialAgentLegacyDeepSeekAlias(legacy)) return null;
    return /chat/i.test(legacy) ? legacy : null;
  }

  private toolSpecificModel(useCase: SocialAgentModelUseCase): string | null {
    switch (useCase) {
      case 'planner':
        return this.config.get<string>('AGENT_PLANNER_MODEL') || null;
      case 'profile_extraction':
        return this.config.get<string>('AGENT_EXTRACTOR_MODEL') || null;
      case 'card_generation':
      case 'candidate_summary':
        return this.config.get<string>('AGENT_CARD_MODEL') || null;
      case 'safety_check':
        return this.config.get<string>('AGENT_SAFETY_MODEL') || null;
      default:
        return null;
    }
  }

  private defaultChatModel(): string {
    return SOCIAL_AGENT_DEFAULT_REASONING_MODEL;
  }

  private chatDeepSeekTimeoutMs(
    useCase: SocialAgentModelUseCase,
    overrideMs?: number | null,
  ): number {
    if (Number.isFinite(overrideMs) && Number(overrideMs) > 0) {
      return Math.max(Number(overrideMs), this.timeoutFloorMs(useCase));
    }
    if (this.modelRouter) return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS') ??
        this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
        this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ??
        `${SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS}`,
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS;
    }
    return Math.max(configured, this.timeoutFloorMs(useCase));
  }

  private firstChunkTimeoutMs(useCase: SocialAgentModelUseCase): number {
    if (this.modelRouter) return this.modelRouter.getFirstChunkTimeout(useCase);
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS') ??
        this.config.get<string>(
          'SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS',
        ) ??
        this.config.get<string>('DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS') ??
        `${SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS}`,
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS;
    }
    return Math.max(configured, this.firstChunkTimeoutFloorMs(useCase));
  }

  private timeoutFloorMs(useCase: SocialAgentModelUseCase): number {
    if (useCase === 'casual_chat' || useCase === 'final_response') {
      return SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS;
    }
    if (useCase === 'planner') return SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS;
    return SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS;
  }

  private firstChunkTimeoutFloorMs(useCase: SocialAgentModelUseCase): number {
    if (useCase === 'casual_chat' || useCase === 'final_response') {
      return SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS;
    }
    if (useCase === 'planner') {
      return SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS;
    }
    return SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS;
  }

  private thinkingMode(
    useCase: SocialAgentModelUseCase,
  ): 'disabled' | 'enabled' {
    if (this.modelRouter) return this.modelRouter.getThinkingMode(useCase);
    const value = `${
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_THINKING') ?? ''
    }`
      .trim()
      .toLowerCase();
    return ['enabled', 'true', '1', 'yes'].includes(value)
      ? 'enabled'
      : 'disabled';
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
