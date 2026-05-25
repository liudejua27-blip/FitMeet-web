import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';

export type SocialAgentPlanSource = 'deepseek' | 'fallback';
export type SocialAgentPlanStepStatus = 'planned' | 'replanned';
export type SocialAgentPlanRiskLevel = 'low' | 'medium' | 'high';
export type SocialAgentPlanReason =
  | 'initial'
  | 'user_follow_up'
  | 'failure_recovery'
  | 'manual_replan';

export interface SocialAgentPlanFailureContext {
  stepId?: string | null;
  toolName?: string | null;
  action?: SocialAgentAction | string | null;
  status?: string | null;
  code?: string | null;
  message?: string | null;
}

export interface SocialAgentPlannerOptions {
  reason?: SocialAgentPlanReason;
  userMessage?: string | null;
  failure?: SocialAgentPlanFailureContext | null;
  maxReplanAttempts?: number;
}

export interface SocialAgentPlanStep extends Record<string, unknown> {
  id: string;
  title: string;
  action: SocialAgentAction;
  status: SocialAgentPlanStepStatus;
  requiresUserConfirmation: boolean;
  riskLevel: SocialAgentPlanRiskLevel;
  toolName: string | null;
  input: Record<string, unknown>;
  rationale: string;
}

export interface SocialAgentPlannerResult {
  taskId: number;
  permissionMode: AgentTaskPermissionMode;
  allowedActions: SocialAgentAction[];
  plan: SocialAgentPlanStep[];
  source: SocialAgentPlanSource;
  fallbackReason: string | null;
  reason: SocialAgentPlanReason;
  replanAttempt: number;
}

@Injectable()
export class SocialAgentPlannerService {
  private readonly logger = new Logger(SocialAgentPlannerService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly config: ConfigService,
    private readonly permissions: AgentPermissionService,
    private readonly toolRegistry: FitMeetAgentToolRegistryService,
    @Optional() private readonly modelRouter?: SocialAgentModelRouterService,
  ) {}

  async planTask(
    taskId: number,
    options: SocialAgentPlannerOptions = {},
  ): Promise<SocialAgentPlannerResult> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);
    return this.planExistingTask(task, options);
  }

  async replanTask(
    taskId: number,
    options: SocialAgentPlannerOptions = {},
  ): Promise<SocialAgentPlannerResult> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);
    return this.planExistingTask(task, {
      ...options,
      reason: options.reason ?? 'failure_recovery',
    });
  }

  async planExistingTask(
    task: AgentTask,
    options: SocialAgentPlannerOptions = {},
  ): Promise<SocialAgentPlannerResult> {
    const permissionMode = task.permissionMode;
    const allowedActions = this.permissions.getAllowedActions(permissionMode);
    const reason = options.reason ?? 'initial';
    const brainMemory = this.buildBrainMemory(task, reason, options);
    const isReplan = reason !== 'initial';
    let plan: SocialAgentPlanStep[] = [];
    let source: SocialAgentPlanSource = 'deepseek';
    let fallbackReason: string | null = null;

    try {
      const responseText = await this.callDeepSeekPlan(
        task,
        allowedActions,
        brainMemory,
      );
      const parsed = this.parseJsonObject(responseText);
      const rawSteps = this.readSteps(parsed);
      plan = this.normalizeSteps(
        rawSteps,
        allowedActions,
        permissionMode,
        isReplan,
      );
      if (plan.length === 0) {
        fallbackReason = 'deepseek_plan_empty_after_permission_filter';
      }
    } catch (error) {
      fallbackReason = this.toFallbackReason(error);
      this.logger.warn(
        JSON.stringify({
          event: 'deepseek.call_failed',
          purpose: 'social_agent_plan',
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          permissionMode,
          fallbackReason,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    if (fallbackReason) {
      source = 'fallback';
      plan = this.buildFallbackPlan(
        task,
        allowedActions,
        fallbackReason,
        brainMemory,
        isReplan,
      );
    }

    if (fallbackReason === 'deepseek_timeout') {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType: AgentTaskEventType.SocialAgentLlmTimeout,
          actor: AgentTaskEventActor.Agent,
          summary: 'AI 分析超时，已使用规则匹配继续执行。',
          payload: {
            reason,
            timeoutMs: this.deepSeekTimeoutMs('planner'),
            fallbackMessage: '已收到补充信息，当前先基于规则匹配继续搜索。',
          },
        }),
      );
    }

    task.plan = plan;
    task.memory = {
      ...(task.memory ?? {}),
      brain: {
        ...brainMemory,
        lastPlanSource: source,
        lastPlanReason: reason,
        lastPlannedAt: new Date().toISOString(),
      },
    };
    await this.taskRepo.save(task);
    await this.eventRepo.save(
      this.eventRepo.create({
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        eventType: AgentTaskEventType.PlanGenerated,
        actor: AgentTaskEventActor.Agent,
        summary: `Generated social agent plan with ${plan.length} step(s)`,
        payload: {
          source,
          fallbackReason,
          reason,
          permissionMode,
          allowedActions,
          stepCount: plan.length,
          replanAttempt: brainMemory.replanAttempt,
          lastFailure: brainMemory.lastFailure ?? null,
        },
      }),
    );

    return {
      taskId: task.id,
      permissionMode,
      allowedActions,
      plan,
      source,
      fallbackReason,
      reason,
      replanAttempt: this.numericValue(brainMemory.replanAttempt),
    };
  }

  private async callDeepSeekPlan(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    brainMemory: Record<string, unknown>,
  ): Promise<string> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const useCase = 'planner' as const;
    const model = this.modelFor(useCase);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.deepSeekTimeoutMs(useCase),
    );

    let res: Response;
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
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
            { role: 'system', content: this.buildSystemPrompt() },
            {
              role: 'user',
              content: this.buildUserPrompt(task, allowedActions, brainMemory),
            },
          ],
        }),
      });
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: task.taskType,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      });
      if (this.isAbortError(error)) throw new Error('deepseek_timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: task.taskType,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason: `DeepSeek HTTP ${res.status}`,
      });
      throw new Error(`DeepSeek HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: task.taskType,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason: 'DeepSeek returned empty plan',
      });
      throw new Error('DeepSeek returned empty plan');
    }
    this.logModelCall({
      useCase,
      model,
      taskId: task.id,
      intent: task.taskType,
      latencyMs: Date.now() - startedAt,
      success: true,
    });
    return content;
  }

  private buildSystemPrompt(): string {
    return [
      'You are FitMeet Social Agent Brain Planner.',
      'Return only a valid JSON object. Do not include markdown, comments, or prose.',
      'The JSON object must contain a steps array.',
      'Each step must contain: id, title, action, toolName, input, rationale, riskLevel, requiresUserConfirmation.',
      'Every step.action must be one of the allowedActions provided by the user message.',
      'Every step.toolName must match one availableTools[].name exactly, or be null when no tool is needed.',
      'If an action is not allowed by the permission mode, omit that step entirely.',
    ].join('\n');
  }

  private buildUserPrompt(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    brainMemory: Record<string, unknown>,
  ): string {
    return JSON.stringify({
      taskId: task.id,
      ownerUserId: task.ownerUserId,
      agentConnectionId: task.agentConnectionId,
      permissionMode: task.permissionMode,
      allowedActions,
      availableTools: this.toolRegistry.listModelTools(task.permissionMode),
      goal: task.goal,
      taskType: task.taskType,
      title: task.title,
      input: task.input ?? {},
      priorPlan: Array.isArray(task.plan) ? task.plan.slice(-8) : [],
      recentToolCalls: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-8)
        : [],
      brainMemory,
      replanningRules: [
        'If lastFailure exists, do not repeat the same failing tool unless there is a changed input or a safer alternative.',
        'For blocked high-risk actions, move to drafting, inbox, or user confirmation instead of forcing execution.',
        'Preserve the user goal and use the latest user follow-up as the strongest instruction.',
      ],
      outputSchema: {
        steps: [
          {
            id: 'step_1',
            title: 'short user-safe step title',
            action: allowedActions[0] ?? null,
            toolName: 'optional tool name or null',
            input: {},
            rationale: 'why this step helps the goal',
            riskLevel: 'low | medium | high',
            requiresUserConfirmation: true,
          },
        ],
      },
    });
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    const parsed = JSON.parse(trimmed) as unknown;
    if (!this.isRecord(parsed) || Array.isArray(parsed)) {
      throw new Error('DeepSeek plan is not a JSON object');
    }
    return parsed;
  }

  private readSteps(parsed: Record<string, unknown>): unknown {
    if (Array.isArray(parsed.steps)) return parsed.steps;
    const plan = parsed.plan;
    if (Array.isArray(plan)) return plan;
    if (this.isRecord(plan) && Array.isArray(plan.steps)) return plan.steps;
    return [];
  }

  private normalizeSteps(
    rawSteps: unknown,
    allowedActions: SocialAgentAction[],
    permissionMode: AgentTaskPermissionMode,
    isReplan = false,
  ): SocialAgentPlanStep[] {
    if (!Array.isArray(rawSteps)) return [];

    const allowed = new Set(allowedActions);
    const steps: SocialAgentPlanStep[] = [];

    for (const rawStep of rawSteps) {
      if (!this.isRecord(rawStep)) continue;
      const action = this.permissions.normalizeAction(
        this.optionalString(rawStep.action ?? rawStep.actionType) ?? '',
      );
      if (!action || !allowed.has(action)) continue;

      steps.push({
        id: this.optionalString(rawStep.id) || `step_${steps.length + 1}`,
        title:
          this.optionalString(rawStep.title) ||
          this.defaultTitleForAction(action),
        action,
        status: isReplan ? 'replanned' : 'planned',
        requiresUserConfirmation: this.requiresUserConfirmation(
          permissionMode,
          rawStep.requiresUserConfirmation,
        ),
        riskLevel: this.normalizeRiskLevel(rawStep.riskLevel),
        toolName: this.optionalString(rawStep.toolName),
        input: this.isRecord(rawStep.input) ? rawStep.input : {},
        rationale: this.optionalString(rawStep.rationale) || '',
      });
    }

    return steps;
  }

  private buildFallbackPlan(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    fallbackReason: string,
    brainMemory: Record<string, unknown> = {},
    isReplan = false,
  ): SocialAgentPlanStep[] {
    const goal = `${task.goal} ${task.title}`;
    const preferred = this.withoutRecentlyFailedAction(
      this.preferredFallbackActions(task.permissionMode, goal),
      brainMemory.lastFailure,
    );
    return preferred
      .filter((action) => allowedActions.includes(action))
      .map((action, index) => ({
        id: `${isReplan ? 'replan' : 'fallback'}_${index + 1}`,
        title: this.defaultTitleForAction(action),
        action,
        status: (isReplan
          ? 'replanned'
          : 'planned') as SocialAgentPlanStepStatus,
        requiresUserConfirmation: this.requiresUserConfirmation(
          task.permissionMode,
          undefined,
        ),
        riskLevel: action === SocialAgentAction.Payment ? 'high' : 'low',
        toolName: null,
        input: {
          goal: task.goal,
          fallbackReason,
        },
        rationale: isReplan
          ? 'Fallback replan generated after a failed or blocked step.'
          : 'Fallback plan generated without a valid DeepSeek JSON plan.',
      }));
  }

  private buildBrainMemory(
    task: AgentTask,
    reason: SocialAgentPlanReason,
    options: SocialAgentPlannerOptions,
  ): Record<string, unknown> {
    const current = this.isRecord(task.memory?.brain) ? task.memory.brain : {};
    const now = new Date().toISOString();
    const priorTurns = Array.isArray(current.turns)
      ? current.turns.filter((turn): turn is Record<string, unknown> =>
          this.isRecord(turn),
        )
      : [];
    const nextTurn = this.optionalString(options.userMessage)
      ? [
          ...priorTurns,
          {
            role: 'user',
            text: this.optionalString(options.userMessage),
            reason,
            at: now,
          },
        ]
      : priorTurns;
    const inferredFailure =
      options.failure ?? this.failureFromTaskState(task) ?? null;
    const isReplan = reason !== 'initial';
    const priorAttempt =
      typeof current.replanAttempt === 'number' ? current.replanAttempt : 0;
    const maxAttempts = Math.max(1, options.maxReplanAttempts ?? 3);
    const replanAttempt = isReplan
      ? Math.min(priorAttempt + 1, maxAttempts)
      : priorAttempt;

    return {
      turns: nextTurn.slice(-20),
      lastFailure: inferredFailure,
      replanAttempt,
      maxReplanAttempts: maxAttempts,
      replanExhausted: isReplan && replanAttempt >= maxAttempts,
      previousPlanSummary: Array.isArray(task.plan)
        ? task.plan.slice(-8).map((step) => ({
            id: this.optionalString(step.id),
            action: this.optionalString(step.action),
            status: this.optionalString(step.status),
            toolName: this.optionalString(step.toolName),
          }))
        : [],
      previousToolSummary: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-8).map((call) => ({
            id: this.optionalString(call.id),
            stepId: this.optionalString(call.stepId),
            toolName: this.optionalString(call.toolName),
            status: this.optionalString(call.status),
            error: this.isRecord(call.error) ? call.error : null,
          }))
        : [],
      updatedAt: now,
    };
  }

  private failureFromTaskState(
    task: AgentTask,
  ): SocialAgentPlanFailureContext | null {
    const lastCall = this.isRecord(task.result?.lastToolCall)
      ? task.result.lastToolCall
      : Array.isArray(task.toolCalls)
        ? task.toolCalls
            .slice()
            .reverse()
            .find((call) => {
              const status = this.optionalString(call.status);
              return status === 'failed' || status === 'blocked';
            })
        : null;
    if (!this.isRecord(lastCall)) {
      if (!this.isRecord(task.error)) return null;
      return {
        message: this.optionalString(task.error.message),
        code: this.optionalString(task.error.code),
      };
    }
    const error = this.isRecord(lastCall.error) ? lastCall.error : {};
    return {
      stepId: this.optionalString(lastCall.stepId),
      toolName: this.optionalString(lastCall.toolName),
      action: this.optionalString(lastCall.action),
      status: this.optionalString(lastCall.status),
      code: this.optionalString(error.code),
      message: this.optionalString(error.message),
    };
  }

  private withoutRecentlyFailedAction(
    actions: SocialAgentAction[],
    failure: unknown,
  ): SocialAgentAction[] {
    if (!this.isRecord(failure)) return actions;
    const raw = this.optionalString(failure.action) ?? '';
    const failedAction = this.permissions.normalizeAction(raw);
    if (!failedAction) return actions;
    const filtered = actions.filter((action) => action !== failedAction);
    return filtered.length > 0 ? filtered : actions;
  }

  private preferredFallbackActions(
    permissionMode: AgentTaskPermissionMode,
    goal: string,
  ): SocialAgentAction[] {
    if (permissionMode === AgentTaskPermissionMode.Assist) {
      return [SocialAgentAction.AddFriend, SocialAgentAction.SendMessage];
    }
    if (permissionMode === AgentTaskPermissionMode.Confirm) {
      return [
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.GenerateContent,
        SocialAgentAction.DraftMessage,
        SocialAgentAction.SendMessage,
        SocialAgentAction.SendInvite,
      ];
    }

    const actions = [
      SocialAgentAction.FavoriteCandidate,
      SocialAgentAction.DraftMessage,
      SocialAgentAction.WriteInbox,
      SocialAgentAction.SendMessage,
      SocialAgentAction.AddFriend,
    ];
    if (/(meet|offline|见面|线下|约练|邀请)/i.test(goal)) {
      actions.push(SocialAgentAction.OfflineMeet);
    }
    if (/(pay|payment|支付|付款|买单|付费)/i.test(goal)) {
      actions.push(SocialAgentAction.Payment);
    }
    return actions;
  }

  private requiresUserConfirmation(
    permissionMode: AgentTaskPermissionMode,
    modelValue: unknown,
  ): boolean {
    if (permissionMode === AgentTaskPermissionMode.LimitedAuto) return false;
    return typeof modelValue === 'boolean' ? modelValue : true;
  }

  private normalizeRiskLevel(value: unknown): SocialAgentPlanRiskLevel {
    return value === 'medium' || value === 'high' ? value : 'low';
  }

  private defaultTitleForAction(action: SocialAgentAction): string {
    switch (action) {
      case SocialAgentAction.AddFriend:
        return 'Add friend';
      case SocialAgentAction.SendMessage:
        return 'Send message';
      case SocialAgentAction.SearchProfiles:
        return 'Search profiles';
      case SocialAgentAction.GenerateContent:
        return 'Generate content';
      case SocialAgentAction.DraftMessage:
        return 'Draft message';
      case SocialAgentAction.SendInvite:
        return 'Send invite';
      case SocialAgentAction.FavoriteCandidate:
        return 'Favorite candidate';
      case SocialAgentAction.WriteInbox:
        return 'Write inbox event';
      case SocialAgentAction.OfflineMeet:
        return 'Arrange offline meet';
      case SocialAgentAction.Payment:
        return 'Handle payment';
    }
  }

  private optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private numericValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toFallbackReason(error: unknown): string {
    if (this.isAbortError(error)) return 'deepseek_timeout';
    if (error instanceof Error && error.message === 'deepseek_timeout') {
      return 'deepseek_timeout';
    }
    if (error instanceof SyntaxError) return 'deepseek_json_parse_failed';
    if (error instanceof Error) return error.message;
    return 'unknown_planner_error';
  }

  private modelFor(useCase: 'planner'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.config.get<string>('AGENT_PLANNER_MODEL') ||
      this.config.get<string>('DEEPSEEK_FAST_MODEL') ||
      this.config.get<string>('DEEPSEEK_MODEL') ||
      'deepseek-v4-flash'
    );
  }

  private deepSeekTimeoutMs(useCase?: 'planner'): number {
    if (useCase && this.modelRouter) return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
        this.config.get<string>('DEEPSEEK_TIMEOUT_MS'),
    );
    if (Number.isFinite(configured) && configured > 0) {
      return Math.min(configured, 15_000);
    }
    return 15_000;
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

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }
}
