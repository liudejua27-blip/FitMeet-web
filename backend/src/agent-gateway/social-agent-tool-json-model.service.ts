import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseSocialAgentJsonObject } from './social-agent-next-action-decision';
import {
  selectSocialAgentToolModel,
  selectSocialAgentToolTimeoutMs,
  socialAgentToolModelUseCaseForPurpose,
} from './social-agent-tool-model';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';

type SocialAgentToolJsonModelInput = {
  purpose: string;
  prompt: string;
  fallback: () => Record<string, unknown>;
  taskId?: number | null;
};

@Injectable()
export class SocialAgentToolJsonModelService {
  private readonly logger = new Logger(SocialAgentToolJsonModelService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
  ) {}

  async callJson(
    input: SocialAgentToolJsonModelInput,
  ): Promise<Record<string, unknown>> {
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
      return input.fallback();
    }

    const useCase = socialAgentToolModelUseCaseForPurpose(input.purpose);
    const model = selectSocialAgentToolModel(useCase, {
      config: this.config,
      modelRouter: this.modelRouter,
    });
    const timeoutMs = selectSocialAgentToolTimeoutMs(useCase, {
      config: this.config,
      modelRouter: this.modelRouter,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const baseUrl =
        this.config.get<string>('DEEPSEEK_BASE_URL') ||
        'https://api.deepseek.com';
      const res = await fetch(
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
            temperature: this.modelRouter?.getTemperature(useCase) ?? 0.2,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are FitMeet Social Agent reply loop. Return only one valid JSON object.',
              },
              { role: 'user', content: input.prompt },
            ],
          }),
        },
      );
      if (!res.ok) {
        this.logModelCall({
          useCase,
          model,
          taskId: input.taskId ?? null,
          intent: input.purpose,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason: `DeepSeek HTTP ${res.status}`,
        });
        this.logger.warn(
          JSON.stringify({
            event: 'deepseek.call_failed',
            purpose: input.purpose,
            httpStatus: res.status,
            reason: 'http_error',
          }),
        );
        return input.fallback();
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? '';
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
      const reason = this.isAbortError(error)
        ? 'deepseek_timeout'
        : error instanceof Error
          ? error.message
          : String(error);
      this.logModelCall({
        useCase,
        model,
        taskId: input.taskId ?? null,
        intent: input.purpose,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason,
      });
      this.logger.warn(
        JSON.stringify({
          event: 'deepseek.call_failed',
          purpose: input.purpose,
          reason: this.isAbortError(error) ? 'timeout' : 'exception',
          message: reason,
          ...(this.isAbortError(error) ? { timeoutMs } : {}),
        }),
      );
      return input.fallback();
    } finally {
      clearTimeout(timeout);
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
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
