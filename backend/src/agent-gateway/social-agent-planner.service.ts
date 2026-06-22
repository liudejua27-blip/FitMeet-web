import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  selectSocialAgentConfiguredModel,
  SocialAgentModelRouterService,
} from './social-agent-model-router.service';
import { socialAgentContextTurnLimit } from './social-agent-context-window';
import {
  readSocialAgentConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  isRetryableSocialAgentDeepSeekFailure,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import {
  SocialAgentContextHydratorService,
  type SocialAgentHydratedContext,
} from './social-agent-context-hydrator.service';
import { callDeepSeekChatCompletionWithUsage } from '../common/deepseek.util';
import { hasExplicitSocialExecutionIntent } from './social-agent-social-intent-gate';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import {
  buildSocialAgentExactCacheKey,
  buildSocialAgentPromptFingerprint,
  readSocialAgentExactCacheKeyFingerprint,
} from './social-agent-prompt-fingerprint.util';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { AgentObservabilityService } from './agent-observability.service';

export type SocialAgentPlanSource = 'deepseek' | 'fallback' | 'workflow';
export type SocialAgentPlanStepStatus = 'planned' | 'replanned' | 'skipped';
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
  refreshedGoal?: string | null;
  failure?: SocialAgentPlanFailureContext | null;
  maxReplanAttempts?: number;
  signal?: AbortSignal | null;
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
    @Optional()
    private readonly deepSeek?: SocialAgentChatDeepSeekClientService,
    @Optional()
    private readonly contextHydrator?: SocialAgentContextHydratorService,
    @Optional()
    private readonly llmOutputCache?: SocialAgentLlmOutputCacheService,
    @Optional()
    private readonly metrics?: SocialAgentMetricsService,
    @Optional()
    private readonly observability?: AgentObservabilityService,
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
    const hydratedContext = await this.hydratePlannerContext(task);
    const taskContext = this.plannerTaskContext(task, hydratedContext);
    const brainMemory = this.buildBrainMemory(
      task,
      reason,
      options,
      hydratedContext,
    );
    const isReplan = reason !== 'initial';
    const workflowPlan = this.buildDeterministicWorkflowPlan(
      task,
      allowedActions,
      brainMemory,
      taskContext,
      isReplan,
    );
    let plan: SocialAgentPlanStep[] = workflowPlan ?? [];
    let source: SocialAgentPlanSource = workflowPlan ? 'workflow' : 'deepseek';
    let fallbackReason: string | null = null;

    if (!workflowPlan) {
      try {
        plan = await this.buildDeepSeekPlanWithRetry(
          task,
          allowedActions,
          brainMemory,
          taskContext,
          permissionMode,
          isReplan,
          options.signal,
        );
        if (plan.length === 0) {
          fallbackReason = 'deepseek_plan_empty_after_permission_filter';
        }
      } catch (error) {
        fallbackReason = this.toFallbackReason(error);
        if (fallbackReason === 'client_aborted') throw error;
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
    }

    if (fallbackReason) {
      source = 'fallback';
      plan = this.buildFallbackPlan(
        task,
        allowedActions,
        fallbackReason,
        brainMemory,
        taskContext,
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
          summary: '分析时间较长，已保留上下文并生成安全恢复计划。',
          payload: {
            reason,
            timeoutMs: this.deepSeekTimeoutMs('planner'),
            fallbackMessage:
              '分析时间较长，我已保留当前上下文；请重试或继续补充，我会从当前任务恢复。',
            degradedPlan: true,
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

  private buildDeterministicWorkflowPlan(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    brainMemory: Record<string, unknown>,
    taskContext: Record<string, unknown>,
    isReplan: boolean,
  ): SocialAgentPlanStep[] | null {
    const latestUserFollowUp = this.optionalString(
      brainMemory.latestUserFollowUp,
    );
    if (
      latestUserFollowUp &&
      !hasExplicitSocialExecutionIntent(latestUserFollowUp) &&
      !this.isFallbackSearchContinuation(latestUserFollowUp)
    ) {
      return null;
    }
    if (!this.contextSuggestsCandidateSearch(taskContext)) return null;
    if (!allowedActions.includes(SocialAgentAction.SearchProfiles)) return null;

    const candidateActions = [
      SocialAgentAction.SearchProfiles,
      SocialAgentAction.GenerateContent,
      SocialAgentAction.DraftMessage,
    ].filter((action) => allowedActions.includes(action));
    if (candidateActions.length === 0) return null;

    const compactInput = this.workflowPlanInput(task, taskContext);
    return candidateActions.map((action, index) => ({
      id: `workflow_${index + 1}`,
      title: this.defaultTitleForAction(action),
      action,
      status: (isReplan ? 'replanned' : 'planned') as SocialAgentPlanStepStatus,
      requiresUserConfirmation: this.isHighRiskAction(action),
      riskLevel: this.isHighRiskAction(action) ? 'high' : 'low',
      toolName: null,
      input: compactInput,
      rationale:
        'Deterministic social workflow selected because saved task slots already indicate candidate search.',
    }));
  }

  private workflowPlanInput(
    task: AgentTask,
    taskContext: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      goal: task.goal,
      taskId: task.id,
      taskSlotSummary: this.isRecord(taskContext.taskSlotSummary)
        ? taskContext.taskSlotSummary
        : {},
      knownTaskSlotConstraints: this.isRecord(
        taskContext.knownTaskSlotConstraints,
      )
        ? taskContext.knownTaskSlotConstraints
        : null,
      candidateActions: this.isRecord(taskContext.candidateActions)
        ? taskContext.candidateActions
        : {},
    };
  }

  private async buildDeepSeekPlanWithRetry(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    brainMemory: Record<string, unknown>,
    taskContext: Record<string, unknown>,
    permissionMode: AgentTaskPermissionMode,
    isReplan: boolean,
    signal?: AbortSignal | null,
  ): Promise<SocialAgentPlanStep[]> {
    const maxAttempts = socialAgentDeepSeekRetryAttempts(this.config, {
      specificKey: 'SOCIAL_AGENT_PLANNER_RETRY_ATTEMPTS',
    });
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const responseText = await this.callDeepSeekPlan(
          task,
          allowedActions,
          brainMemory,
          taskContext,
          maxAttempts,
          signal,
        );
        const parsed = this.parseJsonObject(responseText);
        const rawSteps = this.readSteps(parsed);
        return this.normalizeSteps(
          rawSteps,
          allowedActions,
          permissionMode,
          isReplan,
        );
      } catch (error) {
        lastError = error;
        const reason = this.toFallbackReason(error);
        if (
          attempt < maxAttempts &&
          isRetryableSocialAgentDeepSeekFailure(reason, {
            includeJsonFormatErrors: true,
          })
        ) {
          this.logger.warn(
            JSON.stringify({
              event: 'social_agent.planner.deepseek_retrying',
              reason,
              attempt,
              maxAttempts,
              taskId: task.id,
            }),
          );
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('unknown_planner_error');
  }

  private async callDeepSeekPlan(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    brainMemory: Record<string, unknown>,
    taskContext: Record<string, unknown>,
    retryAttempts: number,
    signal?: AbortSignal | null,
  ): Promise<string> {
    if (signal?.aborted) throw new Error('client_aborted');
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

    const useCase = 'planner' as const;
    const model = this.modelFor(useCase);
    const messages = [
      { role: 'system' as const, content: this.buildSystemPrompt() },
      {
        role: 'user' as const,
        content: this.buildUserPrompt(
          task,
          allowedActions,
          brainMemory,
          taskContext,
        ),
      },
    ];
    const cacheKey = this.plannerCacheKey({
      messages,
      model,
      useCase,
    });
    const cacheTtlMs = this.plannerCacheTtlMs();
    const cached =
      cacheTtlMs > 0 ? (this.llmOutputCache?.get(cacheKey) ?? null) : null;
    const cacheFingerprint = readSocialAgentExactCacheKeyFingerprint(cacheKey);
    if (cacheTtlMs > 0) {
      this.metrics?.recordLlmOutputCache?.({
        cacheName: 'task_planner_exact',
        hit: cached !== null,
        approxChars: cached !== null ? this.approxChars(messages) : null,
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
      });
    }
    if (cached !== null) return cached;

    if (this.deepSeek) {
      const content = await this.deepSeek.complete({
        useCase,
        taskId: task.id,
        intent: task.taskType,
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts,
        messages,
        signal,
      });
      if (!content?.trim()) throw new Error('DeepSeek returned empty plan');
      this.readSteps(this.parseJsonObject(content));
      if (cacheTtlMs > 0) {
        this.llmOutputCache?.set(cacheKey, content, {
          ttlMs: cacheTtlMs,
          approxPromptChars: this.approxChars(messages),
        });
      }
      return content;
    }

    const startedAt = Date.now();
    let fallbackUsage:
      | Awaited<ReturnType<typeof callDeepSeekChatCompletionWithUsage>>['usage']
      | null = null;
    try {
      const completion = await callDeepSeekChatCompletionWithUsage({
        apiKey,
        baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL'),
        model,
        temperature: this.modelRouter?.getTemperature(useCase) ?? 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts: 1,
        messages,
        signal,
        timeoutMs: this.deepSeekTimeoutMs(useCase),
        timeoutMessage: 'deepseek_timeout',
      });
      fallbackUsage = completion.usage;
      const content = completion.content;
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
      this.readSteps(this.parseJsonObject(content));
      if (cacheTtlMs > 0) {
        this.llmOutputCache?.set(cacheKey, content, {
          ttlMs: cacheTtlMs,
          approxPromptChars: this.approxChars(messages),
        });
      }
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: task.taskType,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        taskId: task.id,
        latencyMs: Date.now() - startedAt,
        success: true,
        promptTokens: fallbackUsage.promptTokens,
        promptCacheHitTokens: fallbackUsage.promptCacheHitTokens,
        promptCacheMissTokens: fallbackUsage.promptCacheMissTokens,
        completionTokens: fallbackUsage.completionTokens,
        reasoningTokens: fallbackUsage.reasoningTokens,
        approxPromptChars: this.approxChars(messages),
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
      });
      return content;
    } catch (error) {
      const reason = socialAgentDeepSeekFailureReason(error);
      this.logModelCall({
        useCase,
        model,
        taskId: task.id,
        intent: task.taskType,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason,
      });
      this.observability?.recordLlmCall({
        useCase,
        model,
        taskId: task.id,
        latencyMs: Date.now() - startedAt,
        success: false,
        promptTokens: fallbackUsage?.promptTokens,
        promptCacheHitTokens: fallbackUsage?.promptCacheHitTokens,
        promptCacheMissTokens: fallbackUsage?.promptCacheMissTokens,
        completionTokens: fallbackUsage?.completionTokens,
        reasoningTokens: fallbackUsage?.reasoningTokens,
        approxPromptChars: this.approxChars(messages),
        promptPrefixHash: cacheFingerprint?.promptPrefixHash ?? null,
        dynamicContextHash: cacheFingerprint?.dynamicContextHash ?? null,
        failureReason: reason,
      });
      throw error;
    }
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

  private plannerCacheKey(input: {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    model: string;
    useCase: 'planner';
  }): string {
    return buildSocialAgentExactCacheKey({
      cacheName: 'task_planner_exact',
      fingerprint: buildSocialAgentPromptFingerprint({
        schema: 'social_agent_task_planner.v1',
        model: input.model,
        useCase: input.useCase,
        messages: input.messages,
      }),
    });
  }

  private plannerCacheTtlMs(): number {
    const raw = this.config.get<string>('SOCIAL_AGENT_TASK_PLANNER_CACHE_TTL_MS');
    if (raw === '0') return 0;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
    return 30_000;
  }

  private approxChars(value: unknown): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  private buildUserPrompt(
    task: AgentTask,
    allowedActions: SocialAgentAction[],
    brainMemory: Record<string, unknown>,
    taskContext: Record<string, unknown>,
  ): string {
    const contextLimit = this.plannerContextLimit();
    const recentMessages = Array.isArray(taskContext.recentMessages)
      ? taskContext.recentMessages
          .filter((item): item is Record<string, unknown> =>
            this.isRecord(item),
          )
          .slice(-contextLimit)
      : [];
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
      taskContext,
      conversationHistory: recentMessages,
      memoryContract: {
        recentMessagesAreAuthoritative: true,
        taskSlotsAreHardConstraints: true,
        lifeGraphSummaryIsLongTermPreferenceContext: true,
        pendingApprovalsMustBeResolvedBeforeSideEffects: true,
        candidateActionsMustNotBeRepeated: true,
      },
      priorPlan: Array.isArray(task.plan) ? task.plan.slice(-contextLimit) : [],
      recentToolCalls: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-contextLimit)
        : [],
      brainMemory,
      activeGoal:
        this.optionalString(brainMemory.currentGoal) ||
        this.optionalString(task.goal),
      replanningRules: [
        'If lastFailure exists, do not repeat the same failing tool unless there is a changed input or a safer alternative.',
        'For blocked high-risk actions, move to drafting, inbox, or user confirmation instead of forcing execution.',
        'Preserve the user goal and use the latest user follow-up as the strongest instruction.',
        'Treat taskContext.taskSlots as hard constraints: answered, confirmed, completed, and modified slots are already known and must not be asked again.',
        'Use candidate_preference only against public, user-consented profile fields or public tags; never infer private traits.',
        'If required social slots are already complete, continue to the next safe action instead of planning another clarification question.',
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
          action,
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
    taskContext: Record<string, unknown> = this.plannerTaskContext(task),
    isReplan = false,
  ): SocialAgentPlanStep[] {
    const goal = `${task.goal} ${task.title}`;
    const shouldDeferExecution =
      this.shouldDeferModelFallbackExecution(fallbackReason);
    const latestUserFollowUp = this.optionalString(
      brainMemory.latestUserFollowUp,
    );
    const preferred = this.withoutRecentlyFailedAction(
      this.preferredFallbackActions(
        task,
        task.permissionMode,
        goal,
        fallbackReason,
        latestUserFollowUp,
        taskContext,
      ),
      brainMemory.lastFailure,
    );
    return preferred
      .filter((action) => allowedActions.includes(action))
      .map((action, index) => ({
        id: `${isReplan ? 'replan' : 'fallback'}_${index + 1}`,
        title: this.defaultTitleForAction(action),
        action,
        status: shouldDeferExecution
          ? 'skipped'
          : ((isReplan ? 'replanned' : 'planned') as SocialAgentPlanStepStatus),
        requiresUserConfirmation: this.requiresUserConfirmation(
          task.permissionMode,
          undefined,
          action,
        ),
        riskLevel: action === SocialAgentAction.Payment ? 'high' : 'low',
        toolName: null,
        input: {
          goal: task.goal,
          fallbackReason,
          taskContext,
          ...(shouldDeferExecution
            ? {
                executionDeferred: true,
                recoveryMessage:
                  '暂时没有得到可靠计划，已保留上下文；请重试或继续补充，我会从当前任务恢复。',
              }
            : {}),
        },
        rationale: isReplan
          ? shouldDeferExecution
            ? 'Planner did not return a reliable replan; context was preserved instead of executing deterministic tools.'
            : 'Fallback replan generated after a failed or blocked step.'
          : shouldDeferExecution
            ? 'Planner did not return a reliable plan; context was preserved instead of executing deterministic tools.'
            : 'Fallback plan generated without a valid model plan.',
      }));
  }

  private buildBrainMemory(
    task: AgentTask,
    reason: SocialAgentPlanReason,
    options: SocialAgentPlannerOptions,
    hydratedContext: SocialAgentHydratedContext | null = null,
  ): Record<string, unknown> {
    const current = this.isRecord(task.memory?.brain) ? task.memory.brain : {};
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
          },
        ]
      : priorTurns;
    const inferredFailure =
      options.failure ?? this.failureFromTaskState(task) ?? null;
    const refreshedGoal = this.optionalString(options.refreshedGoal);
    const shortTerm = this.isRecord(task.memory?.shortTerm)
      ? task.memory.shortTerm
      : {};
    const currentGoal =
      refreshedGoal ||
      this.optionalString(shortTerm.currentGoal) ||
      this.optionalString(task.goal);
    const isReplan = reason !== 'initial';
    const priorAttempt =
      typeof current.replanAttempt === 'number' ? current.replanAttempt : 0;
    const maxAttempts = Math.max(1, options.maxReplanAttempts ?? 3);
    const replanAttempt = isReplan
      ? Math.min(priorAttempt + 1, maxAttempts)
      : priorAttempt;
    const contextLimit = this.plannerContextLimit();
    const hydratedRecentMessages = Array.isArray(
      hydratedContext?.recentMessages,
    )
      ? hydratedContext.recentMessages.slice(-contextLimit)
      : [];

    return {
      turns: nextTurn.slice(-contextLimit),
      recentMessages: hydratedRecentMessages,
      hydratedContext: hydratedContext
        ? {
            threadId: hydratedContext.threadId,
            taskId: hydratedContext.taskId,
            recentMessageCount: hydratedContext.recentMessages.length,
            taskSlotSummary: hydratedContext.taskSlotSummary,
            knownTaskSlotConstraints:
              hydratedContext.knownTaskSlotConstraints,
            lifeGraphSummary: hydratedContext.lifeGraphSummary,
            pendingApprovals: hydratedContext.pendingApprovals,
            candidateActions: hydratedContext.candidateActions,
          }
        : null,
      currentGoal,
      latestUserFollowUp:
        this.optionalString(options.userMessage) ||
        this.optionalString(shortTerm.latestUserFollowUp),
      lastFailure: inferredFailure,
      replanAttempt,
      maxReplanAttempts: maxAttempts,
      replanExhausted: isReplan && replanAttempt >= maxAttempts,
      previousPlanSummary: Array.isArray(task.plan)
        ? task.plan.slice(-contextLimit).map((step) => ({
            id: this.optionalString(step.id),
            action: this.optionalString(step.action),
            status: this.optionalString(step.status),
            toolName: this.optionalString(step.toolName),
          }))
        : [],
      previousToolSummary: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-contextLimit).map((call) => ({
            id: this.optionalString(call.id),
            stepId: this.optionalString(call.stepId),
            toolName: this.optionalString(call.toolName),
            status: this.optionalString(call.status),
            error: this.isRecord(call.error) ? call.error : null,
          }))
        : [],
    };
  }

  private plannerTaskContext(
    task: AgentTask,
    hydratedContext: SocialAgentHydratedContext | null = null,
  ): Record<string, unknown> {
    const base = summarizeSocialAgentTaskMemoryForLlm(task);
    const storedRecentMessages = readSocialAgentConversationHistory(
      task,
      this.plannerContextLimit(),
    );
    const baseWithConversation: Record<string, unknown> = {
      ...base,
      recentMessages: storedRecentMessages,
      conversationHistory: storedRecentMessages,
    };
    if (!hydratedContext) return baseWithConversation;
    const recentMessages =
      this.nonEmptyRecordArray(hydratedContext.recentMessages) ??
      storedRecentMessages;
    return {
      ...baseWithConversation,
      recentMessages,
      conversationHistory: recentMessages,
      taskMemory:
        this.nonEmptyRecord(hydratedContext.taskMemory) ??
        baseWithConversation.taskMemory,
      taskSlots:
        this.nonEmptyRecord(hydratedContext.taskSlots) ??
        this.nonEmptyRecord(baseWithConversation.taskSlots) ??
        {},
      taskSlotSummary:
        this.nonEmptyRecord(hydratedContext.taskSlotSummary) ??
        this.nonEmptyRecord(baseWithConversation.taskSlotSummary) ??
        {},
      knownTaskSlotConstraints:
        this.nonEmptyRecord(hydratedContext.knownTaskSlotConstraints) ??
        this.nonEmptyRecord(baseWithConversation.knownTaskSlotConstraints) ??
        null,
      lifeGraphSummary:
        this.nonEmptyRecord(hydratedContext.lifeGraphSummary) ??
        this.nonEmptyRecord(baseWithConversation.lifeGraphSummary),
      lifeGraphFactDisplaySummaries:
        this.nonEmptyArray(hydratedContext.lifeGraphFactDisplaySummaries) ??
        baseWithConversation.lifeGraphFactDisplaySummaries,
      lifeGraphGovernanceSummary: hydratedContext.lifeGraphGovernanceSummary,
      pendingApprovals:
        this.nonEmptyArray(hydratedContext.pendingApprovals) ??
        this.nonEmptyArray(baseWithConversation.pendingApprovals) ??
        [],
      candidateActions:
        this.nonEmptyRecord(hydratedContext.candidateActions) ??
        this.nonEmptyRecord(baseWithConversation.candidateActions) ??
        this.nonEmptyRecord(baseWithConversation.candidateState),
    };
  }

  private async hydratePlannerContext(
    task: AgentTask,
  ): Promise<SocialAgentHydratedContext | null> {
    if (!this.contextHydrator) return null;
    return this.contextHydrator
      .hydrateContext({
        userId: task.ownerUserId,
        taskId: task.id,
        threadId: `agent-task:${task.id}`,
      })
      .catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.planner_context_hydration_failed',
            taskId: task.id,
            ownerUserId: task.ownerUserId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return null;
      });
  }

  private plannerContextLimit(): number {
    return socialAgentContextTurnLimit(this.config);
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
    task: AgentTask,
    permissionMode: AgentTaskPermissionMode,
    goal: string,
    fallbackReason: string,
    latestUserMessage: string | null = null,
    taskContext: Record<string, unknown> = this.plannerTaskContext(task),
  ): SocialAgentAction[] {
    if (this.isModelFallbackReason(fallbackReason)) {
      if (this.shouldDeferModelFallbackExecution(fallbackReason)) {
        return [SocialAgentAction.GenerateContent];
      }
      return this.modelFallbackActions(
        task,
        goal,
        latestUserMessage,
        taskContext,
      );
    }
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

  private modelFallbackActions(
    task: AgentTask,
    goal: string,
    latestUserMessage: string | null = null,
    taskContext: Record<string, unknown> = this.plannerTaskContext(task),
  ): SocialAgentAction[] {
    const latestMessage = this.optionalString(latestUserMessage);
    const allowSavedSearchContext =
      !latestMessage ||
      hasExplicitSocialExecutionIntent(latestMessage) ||
      this.isFallbackSearchContinuation(latestMessage);
    const searchIntentText = latestMessage ?? goal;
    const evidence = this.modelFallbackSearchIntentEvidence(
      task,
      searchIntentText,
      taskContext,
      allowSavedSearchContext,
    );
    const shouldPreserveCandidateSearch =
      (allowSavedSearchContext && this.hasSocialSearchIntent(evidence)) ||
      (allowSavedSearchContext &&
        this.contextSuggestsCandidateSearch(taskContext));
    const actions: SocialAgentAction[] = [];
    if (shouldPreserveCandidateSearch) {
      actions.push(SocialAgentAction.SearchProfiles);
    }
    actions.push(SocialAgentAction.GenerateContent);
    actions.push(SocialAgentAction.DraftMessage);
    return actions;
  }

  private modelFallbackSearchIntentEvidence(
    task: AgentTask,
    goal: string,
    taskContext: Record<string, unknown>,
    includeSavedTaskContext = true,
  ): string {
    const currentTask = this.isRecord(taskContext.currentTask)
      ? taskContext.currentTask
      : {};
    const savedContextEvidence = includeSavedTaskContext
      ? [
          task.taskType,
          this.optionalString(taskContext.goal),
          this.optionalString(taskContext.currentGoal),
          this.optionalString(currentTask.objective),
          this.optionalString(currentTask.nextStep),
        ]
      : [];
    return [goal, ...savedContextEvidence]
      .filter(Boolean)
      .join(' ');
  }

  private isFallbackSearchContinuation(message: string): boolean {
    return /^(可以|好的|好|行|继续|开始|按这个|就这样|找吧|搜吧|推荐吧|继续找|帮我找|帮我搜)/i.test(
      message.trim(),
    );
  }

  private hasSocialSearchIntent(text: string): boolean {
    return /(?:找|寻找|认识|搭子|约练|约跑|约球|散步|跑步|羽毛球|篮球|户外|活动|匹配|候选|推荐|同频|交友|朋友|舞蹈|舞蹈生|candidate|match|meet|social|buddy|partner|activity)/i.test(
      text,
    );
  }

  private contextSuggestsCandidateSearch(
    taskContext: Record<string, unknown>,
  ): boolean {
    const currentTask = this.isRecord(taskContext.currentTask)
      ? taskContext.currentTask
      : {};
    if (currentTask.shouldSearchNow === true) return true;
    const nextStep = this.optionalString(currentTask.nextStep);
    const state = this.optionalString(currentTask.state);
    const objective = this.optionalString(currentTask.objective);
    if (
      /search|candidate|match|候选|匹配/i.test(
        `${nextStep ?? ''} ${state ?? ''} ${objective ?? ''}`,
      )
    ) {
      return true;
    }
    const taskSlotSummary = this.isRecord(taskContext.taskSlotSummary)
      ? taskContext.taskSlotSummary
      : {};
    const taskSlots = this.isRecord(taskContext.taskSlots)
      ? taskContext.taskSlots
      : {};
    const socialSearchSummaryLabels = new Set([
      '活动',
      '时间',
      '地点',
      '区域',
      '候选偏好',
    ]);
    if (
      Object.entries(taskSlotSummary).some(
        ([label, value]) =>
          socialSearchSummaryLabels.has(label) &&
          Boolean(this.optionalString(value)),
      )
    ) {
      return true;
    }

    const socialSearchSlotKeys = new Set([
      'activity',
      'time_window',
      'location_text',
      'geo_area',
      'candidate_preference',
    ]);
    return Object.entries(taskSlots).some(([key, slot]) => {
      if (!socialSearchSlotKeys.has(key)) return false;
      if (!this.isRecord(slot)) return false;
      const state = this.optionalString(slot.state);
      return ['answered', 'confirmed', 'completed', 'modified'].includes(
        state ?? '',
      );
    });
  }

  private requiresUserConfirmation(
    permissionMode: AgentTaskPermissionMode,
    modelValue: unknown,
    action?: SocialAgentAction,
  ): boolean {
    if (action && this.isHighRiskAction(action)) return true;
    if (permissionMode === AgentTaskPermissionMode.LimitedAuto) return false;
    return typeof modelValue === 'boolean' ? modelValue : true;
  }

  private isModelFallbackReason(reason: string): boolean {
    return (
      reason === 'deepseek_timeout' ||
      reason === 'deepseek_json_parse_failed' ||
      reason === 'deepseek_plan_empty_after_permission_filter' ||
      reason === 'DEEPSEEK_API_KEY missing' ||
      /^DeepSeek HTTP/i.test(reason) ||
      /DeepSeek returned empty plan|DeepSeek plan is not a JSON object/i.test(
        reason,
      )
    );
  }

  private shouldDeferModelFallbackExecution(reason: string): boolean {
    return (
      this.isModelFallbackReason(reason) &&
      reason !== 'DEEPSEEK_API_KEY missing'
    );
  }

  private isHighRiskAction(action: SocialAgentAction): boolean {
    return [
      SocialAgentAction.AddFriend,
      SocialAgentAction.SendMessage,
      SocialAgentAction.SendInvite,
      SocialAgentAction.OfflineMeet,
      SocialAgentAction.Payment,
    ].includes(action);
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

  private nonEmptyRecord(
    value: unknown,
  ): Record<string, unknown> | undefined {
    return this.isRecord(value) && Object.keys(value).length > 0
      ? value
      : undefined;
  }

  private nonEmptyArray<T = unknown>(value: unknown): T[] | undefined {
    return Array.isArray(value) && value.length > 0
      ? (value as T[])
      : undefined;
  }

  private nonEmptyRecordArray(
    value: unknown,
  ): Array<Record<string, unknown>> | undefined {
    if (!Array.isArray(value)) return undefined;
    const records = value.filter((item): item is Record<string, unknown> =>
      this.isRecord(item),
    );
    return records.length > 0 ? records : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toFallbackReason(error: unknown): string {
    if (error instanceof Error && error.message === 'client_aborted') {
      return 'client_aborted';
    }
    if (error instanceof SyntaxError) return 'deepseek_json_parse_failed';
    return socialAgentDeepSeekFailureReason(error) || 'unknown_planner_error';
  }

  private modelFor(useCase: 'planner'): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    return (
      this.configuredModel(this.config.get<string>('AGENT_PLANNER_MODEL')) ||
      this.configuredModel(this.config.get<string>('DEEPSEEK_CHAT_MODEL')) ||
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private configuredModel(value?: string | null): string | null {
    return selectSocialAgentConfiguredModel(value, {
      allowFast: false,
    });
  }

  private deepSeekTimeoutMs(useCase?: 'planner'): number {
    if (useCase && this.modelRouter)
      return this.modelRouter.getTimeout(useCase);
    const configured = Number(
      this.config.get<string>('SOCIAL_AGENT_PLANNER_TIMEOUT_MS') ??
        this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
        this.config.get<string>('DEEPSEEK_TIMEOUT_MS'),
    );
    if (Number.isFinite(configured) && configured > 0) {
      return Math.min(
        Math.max(configured, SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS),
        60_000,
      );
    }
    return SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS;
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
