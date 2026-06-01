import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cleanDisplayText } from '../common/display-text.util';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';

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

@Injectable()
export class SocialAgentFinalResponseService {
  private readonly logger = new Logger(SocialAgentFinalResponseService.name);

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
  ) {}

  async generate(input: SocialAgentFinalResponseInput): Promise<string> {
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
            messages: [
              {
                role: 'system',
                content: this.systemPrompt(),
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
      const payload = (await response.json()) as Record<string, unknown>;
      const answer = this.readContent(payload) || fallback;
      this.logModelCall({
        useCase,
        model,
        intent: input.intent ?? input.route?.intent,
        taskId: this.taskIdOf(input),
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return answer;
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        intent: input.intent ?? input.route?.intent,
        taskId: this.taskIdOf(input),
        latencyMs: Date.now() - startedAt,
        success: false,
        reason:
          error instanceof Error && error.name === 'AbortError'
            ? 'deepseek_timeout'
            : error instanceof Error
              ? error.message
              : String(error),
      });
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.final_response.deepseek_failed',
          message:
            error instanceof Error && error.name === 'AbortError'
              ? 'deepseek_timeout'
              : error instanceof Error
                ? error.message
                : String(error),
        }),
      );
      return fallback;
    } finally {
      clearTimeout(timeout);
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

  private systemPrompt(): string {
    return [
      '你是 FitMeet Agent 的第 7 层 Final Response Generator。',
      '你只负责把用户消息、对话上下文、Planner 计划、工具结果、记忆和安全规则整合成自然中文回复。',
      '无论前面是普通聊天、画像保存、搜索结果、候选人操作还是活动规划，都要基于输入事实统一生成最终回复。',
      '不要暴露 DeepSeek、API、后端、工具日志、JSON 字段名、内部状态机名称或错误堆栈。',
      '不要编造候选人、活动、消息、关系状态或已经执行的工具结果。',
      '如果工具已经成功执行，可以明确说已完成；如果工具需要用户确认，只能说等待确认，不能说已经发送、连接或创建。',
      '如果搜索结果为空，要自然说明没有找到，并给出一个可执行的下一步，例如放宽条件、补充时间或发布需求。',
      '如果画像已更新，要区分已写入字段、补充记忆字段和仍缺失的信息，并用一个简短问题推进下一步。',
      '回复要像豆包/GPT 一样自然、具体、克制，不要像模板；优先使用 1-2 段，必要时使用简短列表。',
    ].join('\n');
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
      this.config?.get<string>('AGENT_FINAL_RESPONSE_MODEL') ||
      this.config?.get<string>('DEEPSEEK_CHAT_MODEL') ||
      this.chatCompatibleLegacyModel() ||
      'deepseek-chat'
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
