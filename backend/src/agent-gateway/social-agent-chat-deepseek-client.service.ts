import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import {
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
} from './social-agent-model-router.service';

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
  ) {}

  async complete(input: {
    useCase: SocialAgentModelUseCase;
    taskId: number | null;
    intent?: unknown;
    fallbackTemperature: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' };
    messages: ChatDeepSeekMessage[];
  }): Promise<string | null> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model = this.modelFor(input.useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
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
      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.readChatDeepSeekContent(payload);
      this.logModelCall({
        useCase: input.useCase,
        model,
        taskId: input.taskId,
        intent: input.intent,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return content || null;
    } catch (error) {
      this.logModelCall({
        useCase: input.useCase,
        model,
        taskId: input.taskId,
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
