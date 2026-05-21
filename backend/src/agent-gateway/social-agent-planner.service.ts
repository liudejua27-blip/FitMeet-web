import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

export type SocialAgentPlanSource = 'deepseek' | 'fallback';
export type SocialAgentPlanStepStatus = 'planned';
export type SocialAgentPlanRiskLevel = 'low' | 'medium' | 'high';

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
  ) {}

  async planTask(taskId: number): Promise<SocialAgentPlannerResult> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);
    return this.planExistingTask(task);
  }

  async planExistingTask(task: AgentTask): Promise<SocialAgentPlannerResult> {
    const permissionMode = task.permissionMode;
    const allowedActions = this.permissions.getAllowedActions(permissionMode);
    let plan: SocialAgentPlanStep[] = [];
    let source: SocialAgentPlanSource = 'deepseek';
    let fallbackReason: string | null = null;

    try {
      const responseText = await this.callDeepSeekPlan(task, allowedActions);
      const parsed = this.parseJsonObject(responseText);
      const rawSteps = this.readSteps(parsed);
      plan = this.normalizeSteps(rawSteps, allowedActions, permissionMode);
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
      plan = this.buildFallbackPlan(task, allowedActions, fallbackReason);
    }

    task.plan = plan;
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
          permissionMode,
          allowedActions,
          stepCount: plan.length,
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
    };
  }

  private async callDeepSeekPlan(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
  ): Promise<string> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    const model = this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          { role: 'user', content: this.buildUserPrompt(task, allowedActions) },
        ],
      }),
    });

    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('DeepSeek returned empty plan');
    return content;
  }

  private buildSystemPrompt(): string {
    return [
      'You are FitMeet Social Agent Brain Planner.',
      'Return only a valid JSON object. Do not include markdown, comments, or prose.',
      'The JSON object must contain a steps array.',
      'Each step must contain: id, title, action, toolName, input, rationale, riskLevel, requiresUserConfirmation.',
      'Every step.action must be one of the allowedActions provided by the user message.',
      'If an action is not allowed by the permission mode, omit that step entirely.',
    ].join('\n');
  }

  private buildUserPrompt(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
  ): string {
    return JSON.stringify({
      taskId: task.id,
      ownerUserId: task.ownerUserId,
      agentConnectionId: task.agentConnectionId,
      permissionMode: task.permissionMode,
      allowedActions,
      goal: task.goal,
      taskType: task.taskType,
      title: task.title,
      input: task.input ?? {},
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
          this.optionalString(rawStep.title) || this.defaultTitleForAction(action),
        action,
        status: 'planned',
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
  ): SocialAgentPlanStep[] {
    const goal = `${task.goal} ${task.title}`;
    const preferred = this.preferredFallbackActions(task.permissionMode, goal);
    return preferred
      .filter((action) => allowedActions.includes(action))
      .map((action, index) => ({
        id: `fallback_${index + 1}`,
        title: this.defaultTitleForAction(action),
        action,
        status: 'planned' as const,
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
        rationale: 'Fallback plan generated without a valid DeepSeek JSON plan.',
      }));
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toFallbackReason(error: unknown): string {
    if (error instanceof SyntaxError) return 'deepseek_json_parse_failed';
    if (error instanceof Error) return error.message;
    return 'unknown_planner_error';
  }
}
