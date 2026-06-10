import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentSelfImproveService } from './agent-self-improve.service';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';
import { AgentObservabilityService } from './agent-observability.service';

export interface SocialAgentFinalResponseInput {
  userMessage: string;
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

@Injectable()
export class SocialAgentFinalResponseService {
  private readonly logger = new Logger(SocialAgentFinalResponseService.name);

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional() private readonly selfImprove?: AgentSelfImproveService,
    @Optional() private readonly observability?: AgentObservabilityService,
  ) {}

  async generate(
    input: SocialAgentFinalResponseInput,
    options: SocialAgentFinalResponseGenerateOptions = {},
  ): Promise<string> {
    const fallback = cleanDisplayText(input.fallbackReply, '').trim();
    const apiKey = this.config?.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return fallback;

    const baseUrl =
      this.config?.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const useCase = 'final_response' as const;
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs(useCase),
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
            ...(options.onDelta ? { stream: true } : {}),
            messages: [
              {
                role: 'system',
                content: this.systemPrompt(await this.publishedPromptRules()),
              },
              {
                role: 'user',
                content: JSON.stringify(this.payload(input)),
              },
            ],
          }),
        },
      );
      if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
      const streamResult = options.onDelta
        ? await this.readStreamedContent(response, options.onDelta, startedAt)
        : null;
      const answer =
        streamResult?.content ??
        this.readContent((await response.json()) as Record<string, unknown>);
      const latencyMs = Date.now() - startedAt;
      this.logModelCall({
        useCase,
        model,
        intent: input.intent ?? input.route?.intent,
        taskId: this.taskIdOf(input),
        latencyMs,
        success: true,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        taskId: this.taskIdOf(input),
        latencyMs,
        firstTokenLatencyMs: streamResult?.firstTokenLatencyMs ?? null,
        tokenCount: streamResult?.tokenCount ?? null,
        success: true,
      });
      return answer || fallback;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? options.signal?.aborted
            ? 'client_aborted'
            : 'deepseek_timeout'
          : error instanceof Error
            ? error.message
            : String(error);
      this.logModelCall({
        useCase,
        model,
        intent: input.intent ?? input.route?.intent,
        taskId: this.taskIdOf(input),
        latencyMs,
        success: false,
        reason,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        taskId: this.taskIdOf(input),
        latencyMs,
        success: false,
        failureReason: reason,
      });
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.final_response.deepseek_failed',
          message:
            error instanceof Error && error.name === 'AbortError'
              ? options.signal?.aborted
                ? 'client_aborted'
                : 'deepseek_timeout'
              : error instanceof Error
                ? error.message
                : String(error),
        }),
      );
      if (error instanceof Error && error.name === 'AbortError') {
        if (options.signal?.aborted) throw new Error('client_aborted');
      }
      return fallback;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromParent);
    }
  }

  private payload(
    input: SocialAgentFinalResponseInput,
  ): Record<string, unknown> {
    return {
      userMessage: cleanDisplayText(input.userMessage, ''),
      intent: input.intent ?? input.route?.intent ?? null,
      route: input.route ?? null,
      agentState: input.agentState ?? null,
      conversationHistory: input.conversationHistory ?? [],
      memoryContext: input.memoryContext ?? null,
      taskContext: input.taskContext ?? null,
      plannerDecision: input.plannerDecision ?? null,
      toolResults: input.toolResults ?? [],
      searchResults: input.searchResults ?? null,
      safetyRules:
        input.safetyRules && input.safetyRules.length > 0
          ? input.safetyRules
          : this.defaultSafetyRules(),
      responseGoal: input.responseGoal ?? null,
      fallbackReply: input.fallbackReply,
    };
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

  private modelFor(useCase: 'final_response'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.config?.get<string>('AGENT_FINAL_RESPONSE_MODEL') ||
      this.config?.get<string>('DEEPSEEK_CHAT_MODEL') ||
      this.chatCompatibleLegacyModel() ||
      'deepseek-v4-pro'
    );
  }

  private chatCompatibleLegacyModel(): string | null {
    const legacy = `${this.config?.get<string>('DEEPSEEK_MODEL') ?? ''}`.trim();
    if (!legacy || legacy === 'deepseek-v4') return null;
    return /chat/i.test(legacy) ? legacy : null;
  }

  private timeoutMs(useCase: 'final_response'): number {
    if (this.modelRouter) return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config?.get<string>('SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS') ??
        this.config?.get<string>('SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS') ??
        '5000',
    );
    if (!Number.isFinite(configured) || configured <= 0) return 5000;
    return configured;
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
