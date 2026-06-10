import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import {
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import { AgentObservabilityService } from './agent-observability.service';

type ChatDeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

  async complete(input: {
    useCase: SocialAgentModelUseCase;
    taskId: number | null;
    intent?: unknown;
    fallbackTemperature: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
    messages: ChatDeepSeekMessage[];
    onDelta?: (delta: string) => void | Promise<void>;
    signal?: AbortSignal | null;
    traceId?: string | null;
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model = this.modelFor(input.useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    input.signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(
      () => controller.abort(),
      this.chatDeepSeekTimeoutMs(input.useCase),
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
            temperature:
              this.modelRouter?.getTemperature(input.useCase) ??
              input.fallbackTemperature,
            ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
            ...(input.responseFormat
              ? { response_format: input.responseFormat }
              : {}),
            ...(input.onDelta && !input.responseFormat ? { stream: true } : {}),
            messages: input.messages,
          }),
        },
      );
      if (!response.ok) {
        this.logModelCall({
          useCase: input.useCase,
          model,
          taskId: input.taskId,
          intent: input.intent,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason: `DeepSeek HTTP ${response.status}`,
        });
        throw new Error(`DeepSeek HTTP ${response.status}`);
      }
      const streamResult =
        input.onDelta && !input.responseFormat
          ? await this.readStreamedContent(response, input.onDelta, startedAt)
          : null;
      const content =
        streamResult?.content ??
        this.readChatDeepSeekContent(
          (await response.json()) as Record<string, unknown>,
        );
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
        success: true,
      });
      return content || null;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? input.signal?.aborted
            ? 'client_aborted'
            : 'deepseek_timeout'
          : error instanceof Error
            ? error.message
            : String(error);
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
        failureReason: reason,
      });
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          input.signal?.aborted ? 'client_aborted' : 'deepseek_timeout',
        );
      }
      throw error;
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

  private async readStreamedContent(
    response: Response,
    onDelta: (delta: string) => void | Promise<void>,
    startedAt: number,
  ): Promise<{
    content: string;
    firstTokenLatencyMs: number | null;
    tokenCount: number;
  }> {
    if (!response.body)
      return { content: '', firstTokenLatencyMs: null, tokenCount: 0 };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let firstTokenLatencyMs: number | null = null;
    let tokenCount = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split(/\r?\n\r?\n/);
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const delta = this.readStreamDelta(chunk);
          if (!delta) continue;
          content += delta;
          firstTokenLatencyMs ??= Date.now() - startedAt;
          tokenCount += this.countTokens(delta);
          await onDelta(cleanDisplayText(delta, ''));
        }
      }
      if (buffer.trim()) {
        const delta = this.readStreamDelta(buffer);
        if (delta) {
          content += delta;
          firstTokenLatencyMs ??= Date.now() - startedAt;
          tokenCount += this.countTokens(delta);
          await onDelta(cleanDisplayText(delta, ''));
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Stream may already be closed.
      }
    }
    return {
      content: cleanDisplayText(content, '').trim(),
      firstTokenLatencyMs,
      tokenCount,
    };
  }

  private countTokens(delta: string): number {
    return delta.match(/[\u4e00-\u9fff]|[a-zA-Z0-9_]+|[^\s]/g)?.length ?? 0;
  }

  private readStreamDelta(chunk: string): string {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    let delta = '';
    for (const line of lines) {
      if (!line || line === '[DONE]') continue;
      try {
        const payload = JSON.parse(line) as Record<string, unknown>;
        const choices = Array.isArray(payload.choices) ? payload.choices : [];
        const first = this.isRecord(choices[0]) ? choices[0] : {};
        const deltaPayload = this.isRecord(first.delta) ? first.delta : {};
        const content = deltaPayload.content;
        if (typeof content === 'string') delta += content;
      } catch {
        continue;
      }
    }
    return delta;
  }

  private modelFor(useCase: SocialAgentModelUseCase): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    const legacy = this.config.get<string>('DEEPSEEK_MODEL');
    if (useCase === 'casual_chat') {
      return (
        this.config.get<string>('AGENT_CASUAL_CHAT_MODEL') ||
        this.config.get<string>('DEEPSEEK_CHAT_MODEL') ||
        this.chatCompatibleLegacyModel(legacy) ||
        'deepseek-v4-pro'
      );
    }
    if (useCase === 'final_response') {
      return (
        this.config.get<string>('AGENT_FINAL_RESPONSE_MODEL') ||
        this.config.get<string>('DEEPSEEK_CHAT_MODEL') ||
        this.chatCompatibleLegacyModel(legacy) ||
        'deepseek-v4-pro'
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

  private chatDeepSeekTimeoutMs(useCase: SocialAgentModelUseCase): number {
    if (this.modelRouter) return this.modelRouter.getTimeout(useCase);
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
