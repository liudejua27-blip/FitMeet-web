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
import { callDeepSeekChatCompletion } from '../common/deepseek.util';
import {
  isRetryableSocialAgentDeepSeekFailure,
  isSocialAgentAbortError,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';

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

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
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
    const timeoutMs = this.toolJsonTimeoutMs(useCase);
    const maxAttempts = socialAgentDeepSeekRetryAttempts(this.config, {
      specificKey: 'SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS',
    });
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.assertNotClientAborted(input.signal);
      const startedAt = Date.now();
      try {
        const content = this.deepSeek
          ? await this.deepSeek.complete({
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
            })
          : await callDeepSeekChatCompletion({
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
        if (!content?.trim()) throw new Error('DeepSeek returned empty JSON');
        const parsed = parseSocialAgentJsonObject(content);
        this.logModelCall({
          useCase,
          model,
          taskId: input.taskId ?? null,
          intent: input.purpose,
          latencyMs: Date.now() - startedAt,
          success: true,
        });
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
