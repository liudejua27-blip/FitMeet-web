import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentLoopRun, SubagentHandoffResult } from './agent-loop.types';
import { AgentLoopService } from './agent-loop.service';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import type { SubagentWorkerJob } from './entities/agent-l5-runtime.entity';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import {
  FitMeetSubagentWorkerDispatcherService,
  type SerializedSubagentWorkerDispatchResult,
} from './fitmeet-subagent-worker-dispatcher.service';
import {
  FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS,
  FitMeetSubagentWorkerRuntimeService,
  type FitMeetSubagentWorkerJobContext,
} from './fitmeet-subagent-worker-runtime.service';
import {
  buildFitMeetSubagentWorkerCommand,
  type FitMeetSubagentWorkerContextSnapshot,
  type FitMeetSubagentWorkerToolCommand,
  type LegacySubagentRouteBranchPayload,
} from './fitmeet-subagent-worker-command.contract';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SocialAgentModelRouterService,
  type SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import {
  selectSocialAgentContextWindow,
  socialAgentContextTurnLimit,
} from './social-agent-context-window';
import { sanitizeForDisplay } from '../common/display-text.util';
import { buildSocialAgentKnownTaskSlotConstraints } from './social-agent-task-slot-constraints.presenter';

type SubagentWorkerToolRunner = (input: {
  agent: FitMeetAlphaAgentName;
  toolName: string;
  input: Record<string, unknown>;
  attempt: number;
  signal?: AbortSignal | null;
}) => Promise<Record<string, unknown>>;

type SubagentWorkerInput = {
  ownerUserId?: number | null;
  taskId?: number | null;
  agent: FitMeetAlphaAgentName;
  goal: string;
  plannerInput: Record<string, unknown>;
  tools: Array<{
    toolName: string;
    input?: Record<string, unknown> | null;
    requiresApproval?: boolean;
  }>;
  memoryScope?: string | null;
  maxToolCalls?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
  workerTrace?: Record<string, unknown> | null;
  signal?: AbortSignal | null;
  runner: SubagentWorkerToolRunner;
};

type SubagentWorkerRunOutput = {
  loop: AgentLoopRun;
  handoff: SubagentHandoffResult;
  workerOutput?: Record<string, unknown>;
};

const SUBAGENT_MEMORY_MAX_DEPTH = 7;
const SUBAGENT_MEMORY_MAX_ARRAY_ITEMS = 12;
const SUBAGENT_MEMORY_MAX_STRING_LENGTH = 800;

export class NonRetryableSubagentWorkerJobError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableSubagentWorkerJobError';
  }
}

export function isNonRetryableSubagentWorkerJobError(error: unknown): boolean {
  return (
    error instanceof NonRetryableSubagentWorkerJobError ||
    (Boolean(error) &&
      typeof error === 'object' &&
      (error as { retryable?: unknown }).retryable === false)
  );
}

interface SubagentWorkerProfile {
  memoryScope: string;
  evalRunner: string;
  failureReviewPolicy: string;
  privateScratchpad: boolean;
  defaultToolBudget: number;
}

@Injectable()
export class FitMeetSubagentWorkerService {
  constructor(
    private readonly agentLoop: AgentLoopService,
    @Optional() private readonly l5Runtime?: AgentL5RuntimeService,
    @Optional()
    private readonly workerRuntime?: FitMeetSubagentWorkerRuntimeService,
    @Optional()
    private readonly dispatcher?: FitMeetSubagentWorkerDispatcherService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly config?: ConfigService,
  ) {}

  async run(input: SubagentWorkerInput): Promise<SubagentWorkerRunOutput> {
    const runId = this.workerRunId(input);
    if (this.workerRuntime) {
      return this.workerRuntime.submit({
        agent: input.agent,
        runId,
        signal: input.signal,
        serializedPayload: this.serializedPayload(input, runId),
        job: (context) => this.executeInLoop(input, context),
      });
    }
    const modelUseCase = this.modelUseCaseFor(input.agent);
    return this.executeInLoop(input, {
      workerId: runId,
      agent: input.agent,
      mode: 'resident_in_process',
      queueName: `fitmeet.subagent.${this.slug(input.agent)}`,
      timeoutMs: input.timeoutMs ?? FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS,
      crashIsolation: false,
      scalable: false,
      modelUseCase,
      model: this.modelFor(modelUseCase),
      runId,
      signal: input.signal ?? null,
    });
  }

  async executeQueuedJob(input: {
    job: SubagentWorkerJob;
    context: FitMeetSubagentWorkerJobContext;
  }): Promise<SubagentWorkerRunOutput> {
    if (!this.dispatcher) {
      throw new Error('Subagent worker dispatcher is not configured.');
    }
    const payload = this.dispatcher.normalizePayload(input.job.payload);
    if (!payload) {
      throw new NonRetryableSubagentWorkerJobError(
        'Unsupported subagent worker payload.',
      );
    }
    const workerTrace = this.queuedWorkerTrace(input.job, input.context);
    let workerOutput: SerializedSubagentWorkerDispatchResult | null = null;
    const runInput: SubagentWorkerInput = {
      ownerUserId: payload.ownerUserId,
      taskId: payload.taskId,
      agent: payload.agent,
      goal: payload.goal,
      plannerInput: payload.plannerInput,
      tools: payload.tools,
      memoryScope: payload.memoryScope ?? null,
      maxToolCalls: payload.maxToolCalls ?? null,
      maxRetries: payload.maxRetries ?? null,
      timeoutMs: payload.timeoutMs ?? null,
      workerTrace,
      runner: async ({ toolName }) => {
        workerOutput = await this.dispatcher!.dispatch({
          payload,
          toolName,
          job: input.job,
          signal: input.context.signal ?? null,
        });
        return {
          ...workerOutput.observation,
          subagentWorker: true,
          externalWorker: true,
          workerJobId: input.job.id,
          workerTrace,
        };
      },
    };
    const result = await this.executeInLoop(runInput, input.context);
    return {
      ...result,
      workerOutput: workerOutput
        ? this.serializedDispatchOutput(workerOutput, workerTrace)
        : undefined,
    };
  }

  private async executeInLoop(
    input: SubagentWorkerInput,
    workerContext: FitMeetSubagentWorkerJobContext,
  ): Promise<SubagentWorkerRunOutput> {
    const profile = this.profileFor(input.agent);
    const execution = await this.agentLoop.execute({
      taskId: input.taskId ?? null,
      goal: input.goal,
      agent: input.agent,
      plan: {
        reason: `${input.agent} independent worker execution.`,
        tools: input.tools.map((tool) => ({
          agent: input.agent,
          toolName: tool.toolName,
          input: tool.input ?? {},
          requiresApproval: tool.requiresApproval,
        })),
      },
      maxToolCalls: input.maxToolCalls ?? profile.defaultToolBudget,
      maxRetries: input.maxRetries ?? 1,
      timeoutMs: input.timeoutMs ?? workerContext.timeoutMs,
      signal: input.signal ?? workerContext.signal ?? null,
      runner: ({ agent, toolName, input: toolInput, attempt, signal }) =>
        input.runner({
          agent,
          toolName,
          input: toolInput,
          attempt,
          signal,
        }),
    });
    const workerTrace = this.workerTraceMetadata(input, workerContext);
    const handoff = this.agentLoop.buildHandoff({
      agent: input.agent,
      memoryScope: input.memoryScope ?? profile.memoryScope,
      input: input.plannerInput,
      toolNames: input.tools.map((tool) => tool.toolName),
      observation: execution.loop.finalObservation ?? {
        observations: execution.observations,
      },
      critique: this.critique(execution),
      handoffOutput: {
        workerRunId: execution.loop.runId,
        workerRuntime: this.workerRuntimeMetadata(workerContext),
        workerTrace,
        subagentProfile: profile,
        failureReview: this.failureReview(execution, workerContext, profile),
        answerBoundary: {
          fromObservationsOnly: true,
          requiresApproval: execution.answerBoundary.requiresApproval,
        },
        observations: execution.observations,
      },
    });
    handoff.plannerInput = input.plannerInput;
    handoff.observations = execution.observations;
    handoff.evalHints = {
      ...(handoff.evalHints ?? {}),
      independentWorker: true,
      maxToolCalls: execution.loop.toolBudget?.maxToolCalls ?? null,
      usedToolCalls: execution.loop.toolBudget?.usedToolCalls ?? null,
      maxRetries: execution.loop.toolBudget?.maxRetries ?? null,
      requiresApproval: execution.answerBoundary.requiresApproval,
      residentWorker: workerContext.mode === 'resident_in_process',
      queueWorkerReady: workerContext.mode === 'queue_worker_ready',
      externalProcessReady: workerContext.mode === 'external_process_ready',
      memoryScope: profile.memoryScope,
      evalRunner: profile.evalRunner,
      failureReviewPolicy: profile.failureReviewPolicy,
      privateScratchpad: profile.privateScratchpad,
      workerRuntime: this.workerRuntimeMetadata(workerContext),
      workerTrace,
      failureReview: this.failureReview(execution, workerContext, profile),
    };
    await this.recordMemory(input, handoff);
    return { loop: execution.loop, handoff };
  }

  private async recordMemory(
    input: SubagentWorkerInput,
    handoff: SubagentHandoffResult,
  ): Promise<void> {
    if (!input.ownerUserId) return;
    const memory = this.subagentMemoryEnvelope(input, handoff);
    await this.l5Runtime?.recordSubagentMemory({
      ownerUserId: input.ownerUserId,
      agentTaskId: input.taskId ?? null,
      agentName: input.agent,
      memoryScope:
        handoff.memoryScope ?? this.profileFor(input.agent).memoryScope,
      input: memory.input,
      plannerInput: memory.plannerInput,
      toolCalls: memory.toolCalls,
      observation: memory.observation,
      observations: memory.observations,
      critique: handoff.critique,
      handoffOutput: memory.handoffOutput,
      evalHints: memory.evalHints,
    });
  }

  private subagentMemoryEnvelope(
    input: SubagentWorkerInput,
    handoff: SubagentHandoffResult,
  ): {
    input: Record<string, unknown>;
    plannerInput: Record<string, unknown>;
    toolCalls: Array<Record<string, unknown>>;
    observation: Record<string, unknown>;
    observations: Array<Record<string, unknown>>;
    handoffOutput: Record<string, unknown>;
    evalHints: Record<string, unknown>;
  } {
    const knownTaskSlotConstraints =
      this.recordOrNull(input.workerTrace?.knownTaskSlotConstraints) ??
      this.knownTaskSlotConstraintsFromPlannerInput(
        handoff.plannerInput ?? handoff.input,
      ) ??
      this.knownTaskSlotConstraintsFromPlannerInput(input.plannerInput);
    const plannerInput =
      this.recordOrNull(handoff.plannerInput) ?? handoff.input;
    const observations = (handoff.observations ?? [handoff.observation]).map(
      (item) =>
        this.subagentObservationSnapshot(item, knownTaskSlotConstraints),
    );
    const observation =
      observations[observations.length - 1] ??
      this.subagentObservationSnapshot(
        handoff.observation,
        knownTaskSlotConstraints,
      );
    return {
      input: this.safeSubagentRecord({
        goal: input.goal,
        agent: input.agent,
        taskId: input.taskId ?? null,
        memoryScope:
          handoff.memoryScope ?? this.profileFor(input.agent).memoryScope,
        route: this.recordOrNull(plannerInput.route),
        knownTaskSlotConstraints,
      }),
      plannerInput: this.safeSubagentRecord({
        route: this.recordOrNull(plannerInput.route),
        intent: plannerInput.intent ?? null,
        threadId: plannerInput.threadId ?? null,
        taskId: input.taskId ?? null,
        knownTaskSlotConstraints,
        contextSummary: this.subagentPlannerContextSummary(plannerInput),
      }),
      toolCalls: handoff.toolCalls.map((toolCall) =>
        this.subagentToolCallSnapshot(toolCall, knownTaskSlotConstraints),
      ),
      observation,
      observations,
      handoffOutput: this.safeSubagentRecord({
        workerRunId: handoff.handoffOutput.workerRunId ?? null,
        workerRuntime: this.recordOrNull(handoff.handoffOutput.workerRuntime),
        workerTrace: this.subagentWorkerTraceSnapshot(
          this.recordOrNull(handoff.handoffOutput.workerTrace),
          knownTaskSlotConstraints,
        ),
        answerBoundary: this.recordOrNull(handoff.handoffOutput.answerBoundary),
        failureReview: this.recordOrNull(handoff.handoffOutput.failureReview),
        subagentProfile: this.recordOrNull(
          handoff.handoffOutput.subagentProfile,
        ),
        observation,
        observationCount: observations.length,
      }),
      evalHints: this.safeSubagentRecord({
        ...(handoff.evalHints ?? {}),
        workerTrace: this.subagentWorkerTraceSnapshot(
          this.recordOrNull(handoff.evalHints?.workerTrace),
          knownTaskSlotConstraints,
        ),
        failureReview: this.recordOrNull(handoff.evalHints?.failureReview),
        knownTaskSlotConstraints,
      }),
    };
  }

  private subagentPlannerContextSummary(
    plannerInput: Record<string, unknown>,
  ): Record<string, unknown> {
    const hydratedContext = this.recordOrNull(plannerInput.hydratedContext);
    const taskContext = this.recordOrNull(plannerInput.taskContext);
    const source = hydratedContext ?? taskContext ?? {};
    const knownTaskSlotConstraints =
      this.recordOrNull(source.knownTaskSlotConstraints) ??
      this.knownTaskSlotConstraintsFromPlannerInput(plannerInput);
    const knownSlots = Array.isArray(knownTaskSlotConstraints?.knownSlots)
      ? knownTaskSlotConstraints.knownSlots
      : [];
    const doNotAskAgainFor = Array.isArray(
      knownTaskSlotConstraints?.doNotAskAgainFor,
    )
      ? knownTaskSlotConstraints.doNotAskAgainFor
      : [];
    const recentMessages = this.recordArray(
      source.recentMessages ?? taskContext?.conversationHistory,
    );
    return this.safeSubagentRecord({
      contextSource: hydratedContext
        ? 'hydratedContext'
        : taskContext
          ? 'taskContext'
          : 'none',
      threadId: source.threadId ?? taskContext?.threadId ?? null,
      recentTurnCount: recentMessages.length,
      hasRecentMessages: recentMessages.length > 0,
      taskSlotSummary: this.recordOrNull(source.taskSlotSummary),
      knownSlotCount: knownSlots.length,
      doNotAskAgainCount: doNotAskAgainFor.length,
      pendingApprovalCount: Array.isArray(source.pendingApprovals)
        ? source.pendingApprovals.length
        : 0,
      candidateActions: this.recordOrNull(source.candidateActions),
      hasLifeGraphSummary: Boolean(this.recordOrNull(source.lifeGraphSummary)),
    });
  }

  private subagentToolCallSnapshot(
    toolCall: SubagentHandoffResult['toolCalls'][number],
    knownTaskSlotConstraints: Record<string, unknown> | null,
  ): Record<string, unknown> {
    return this.safeSubagentRecord({
      toolName: toolCall.toolName,
      status: toolCall.status,
      inputKeys: Object.keys(toolCall.input ?? {}).sort(),
      inputSummary: this.subagentPlannerContextSummary(toolCall.input ?? {}),
      knownTaskSlotConstraints,
    });
  }

  private subagentObservationSnapshot(
    observation: Record<string, unknown>,
    knownTaskSlotConstraints: Record<string, unknown> | null,
  ): Record<string, unknown> {
    return this.safeSubagentRecord({
      branch: observation.branch ?? null,
      status: observation.status ?? null,
      handled: observation.handled ?? null,
      candidateCount: observation.candidateCount ?? null,
      approvalRequired:
        observation.approvalRequired ??
        observation.requiresConfirmation ??
        null,
      requiresConfirmation: observation.requiresConfirmation ?? null,
      eventType: observation.eventType ?? null,
      summary: observation.summary ?? observation.explanation ?? null,
      message: observation.message ?? null,
      error: observation.error ?? null,
      resultCount: Array.isArray(observation.results)
        ? observation.results.length
        : null,
      cardCount: Array.isArray(observation.cards)
        ? observation.cards.length
        : null,
      knownTaskSlotConstraints:
        this.recordOrNull(observation.knownTaskSlotConstraints) ??
        knownTaskSlotConstraints,
    });
  }

  private subagentWorkerTraceSnapshot(
    workerTrace: Record<string, unknown> | null,
    knownTaskSlotConstraints: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!workerTrace && !knownTaskSlotConstraints) return null;
    return this.safeSubagentRecord({
      source: workerTrace?.source ?? null,
      workerJobId: workerTrace?.workerJobId ?? null,
      commandId: workerTrace?.commandId ?? null,
      commandType: workerTrace?.commandType ?? null,
      commandVersion: workerTrace?.commandVersion ?? null,
      traceId: workerTrace?.traceId ?? null,
      runId: workerTrace?.runId ?? null,
      queueName: workerTrace?.queueName ?? null,
      knownTaskSlotConstraints:
        this.recordOrNull(workerTrace?.knownTaskSlotConstraints) ??
        knownTaskSlotConstraints,
    });
  }

  private safeSubagentRecord(value: unknown): Record<string, unknown> {
    const sanitized = this.boundedSubagentMemoryValue(
      sanitizeForDisplay(value),
    );
    return this.isRecord(sanitized) ? sanitized : {};
  }

  private boundedSubagentMemoryValue(value: unknown, depth = 0): unknown {
    if (depth > SUBAGENT_MEMORY_MAX_DEPTH) return '[truncated]';
    if (typeof value === 'string') {
      return value.length > SUBAGENT_MEMORY_MAX_STRING_LENGTH
        ? `${value.slice(0, SUBAGENT_MEMORY_MAX_STRING_LENGTH)}...`
        : value;
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, SUBAGENT_MEMORY_MAX_ARRAY_ITEMS)
        .map((item) => this.boundedSubagentMemoryValue(item, depth + 1));
    }
    if (this.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.boundedSubagentMemoryValue(item, depth + 1),
        ]),
      );
    }
    return value;
  }

  private critique(execution: {
    loop: AgentLoopRun;
    observations: Array<Record<string, unknown>>;
  }): string {
    if (execution.loop.status === 'failed') {
      return 'Independent subagent worker failed; main agent must replan.';
    }
    if (execution.observations.some((item) => item.requiresConfirmation)) {
      return 'Independent subagent worker reached an approval boundary.';
    }
    return 'Independent subagent worker completed with observed tool results.';
  }

  private defaultMemoryScope(agent: FitMeetAlphaAgentName): string {
    return this.profileFor(agent).memoryScope;
  }

  private modelUseCaseFor(
    agent: FitMeetAlphaAgentName,
  ): SocialAgentModelUseCase {
    if (agent === 'Life Graph Agent') return 'profile_extraction';
    if (agent === 'Match Agent') return 'candidate_summary';
    if (agent === 'Agent Brain') return 'planner';
    return 'planner';
  }

  private modelFor(useCase: SocialAgentModelUseCase): string {
    return (
      this.modelRouter?.getModel(useCase) ??
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private contextTurnLimit(): number {
    return socialAgentContextTurnLimit(this.config);
  }

  private profileFor(agent: FitMeetAlphaAgentName): SubagentWorkerProfile {
    if (agent === 'Life Graph Agent') {
      return {
        memoryScope: 'life_graph.worker_memory',
        evalRunner: 'life_graph_memory_conflict_eval_v1',
        failureReviewPolicy: 'review_profile_conflicts_and_merge_boundaries',
        privateScratchpad: true,
        defaultToolBudget: 3,
      };
    }
    if (agent === 'Match Agent') {
      return {
        memoryScope: 'matching.worker_memory',
        evalRunner: 'match_recall_ranking_and_meet_loop_eval_v1',
        failureReviewPolicy:
          'cluster_recall_ranking_or_state_transition_failures',
        privateScratchpad: true,
        defaultToolBudget: 3,
      };
    }
    if (agent === 'Agent Brain') {
      return {
        memoryScope: 'agent_brain.worker_memory',
        evalRunner: 'agent_brain_low_cost_router_eval_v1',
        failureReviewPolicy: 'review_router_or_unit_boundary',
        privateScratchpad: false,
        defaultToolBudget: 1,
      };
    }
    return {
      memoryScope: 'agent_brain.worker_memory',
      evalRunner: 'main_agent_handoff_eval_v1',
      failureReviewPolicy: 'review_planner_handoff_failures',
      privateScratchpad: true,
      defaultToolBudget: 3,
    };
  }

  private workerRunId(input: SubagentWorkerInput): string {
    const task = input.taskId ?? 'new';
    const slug = this.slug(input.agent);
    return `subagent:${slug}:${task}:${Date.now().toString(36)}`;
  }

  private serializedPayload(
    input: SubagentWorkerInput,
    runId: string,
  ): Record<string, unknown> {
    const queueName = `fitmeet.subagent.${this.slug(input.agent)}`;
    const modelUseCase = this.modelUseCaseFor(input.agent);
    const timeoutMs =
      input.timeoutMs ?? FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS;
    const taskContext = this.isRecord(input.plannerInput.taskContext)
      ? input.plannerInput.taskContext
      : null;
    const hydratedContext = this.isRecord(input.plannerInput.hydratedContext)
      ? input.plannerInput.hydratedContext
      : null;
    const profile = this.isRecord(input.plannerInput.profile)
      ? input.plannerInput.profile
      : null;
    const longTermSnapshot = (
      this.isRecord(input.plannerInput.longTermSnapshot)
        ? input.plannerInput.longTermSnapshot
        : null
    ) as FitMeetSubagentWorkerContextSnapshot['longTermSnapshot'];
    const taskMemory =
      this.recordOrNull(hydratedContext?.taskMemory) ??
      this.recordOrNull(taskContext?.taskMemory);
    const taskSlots = this.isRecord(hydratedContext?.taskSlots)
      ? hydratedContext.taskSlots
      : this.isRecord(taskContext?.taskSlots)
        ? taskContext.taskSlots
        : this.recordOrNull(taskMemory?.taskSlots);
    const taskSlotSummary = this.isRecord(hydratedContext?.taskSlotSummary)
      ? hydratedContext.taskSlotSummary
      : this.isRecord(taskContext?.taskSlotSummary)
        ? taskContext.taskSlotSummary
        : this.recordOrNull(taskMemory?.taskSlotSummary);
    const pendingApprovals = Array.isArray(hydratedContext?.pendingApprovals)
      ? hydratedContext.pendingApprovals
      : Array.isArray(hydratedContext?.pendingActions)
        ? hydratedContext.pendingActions
        : Array.isArray(taskContext?.pendingApprovals)
          ? taskContext.pendingApprovals
          : Array.isArray(taskContext?.pendingActions)
            ? taskContext.pendingActions
            : Array.isArray(taskMemory?.pendingApprovals)
              ? taskMemory.pendingApprovals
              : Array.isArray(taskMemory?.pendingActions)
                ? taskMemory.pendingActions
                : [];
    const candidateActions =
      this.recordOrNull(hydratedContext?.candidateActions) ??
      this.recordOrNull(hydratedContext?.candidateState) ??
      this.recordOrNull(taskContext?.candidateActions) ??
      this.recordOrNull(taskContext?.candidateState) ??
      this.recordOrNull(taskMemory?.candidateActions) ??
      this.recordOrNull(taskMemory?.candidateState);
    const lifeGraphSummary =
      this.recordOrNull(hydratedContext?.lifeGraphSummary) ??
      this.recordOrNull(taskContext?.lifeGraphSummary) ??
      this.recordOrNull(taskMemory?.lifeGraphSummary);
    const threadId =
      this.string(input.plannerInput.threadId) ??
      this.string(hydratedContext?.threadId) ??
      this.string(taskContext?.threadId) ??
      (input.taskId ? `agent-task:${input.taskId}` : null);
    const contextSnapshot: FitMeetSubagentWorkerContextSnapshot = {
      threadId,
      taskId: input.taskId ?? null,
      recentMessages: selectSocialAgentContextWindow(
        this.recordArray(
          hydratedContext?.recentMessages ??
            taskContext?.recentMessages ??
            taskContext?.conversationHistory,
        ),
        this.contextTurnLimit(),
      ),
      taskMemory,
      taskSlots,
      taskSlotSummary,
      knownTaskSlotConstraints:
        this.recordOrNull(hydratedContext?.knownTaskSlotConstraints) ??
        this.recordOrNull(taskContext?.knownTaskSlotConstraints) ??
        this.recordOrNull(taskMemory?.knownTaskSlotConstraints) ??
        buildSocialAgentKnownTaskSlotConstraints(taskSlots),
      pendingApprovals,
      candidateActions,
      lifeGraphSummary,
      taskContext,
      profile,
      longTermSnapshot,
    };
    const route = (this.recordOrNull(input.plannerInput.route) ?? {
      intent: input.plannerInput.intent ?? 'unknown',
      source: input.plannerInput.routeSource ?? 'rules',
    }) as unknown as LegacySubagentRouteBranchPayload['route'];
    const serializedTools: FitMeetSubagentWorkerToolCommand[] = input.tools.map(
      (tool) => ({
        toolName: tool.toolName,
        input: tool.input ?? {},
        ...(typeof tool.requiresApproval === 'boolean'
          ? { requiresApproval: tool.requiresApproval }
          : {}),
      }),
    );
    const runtimeThreadId =
      threadId ??
      (input.taskId ? `agent-task:${input.taskId}` : 'agent-task:0');
    const legacyPayload: Record<string, unknown> = {
      kind: 'route_branch',
      runId,
      runtimeIdentity: {
        threadId: runtimeThreadId,
        taskId: input.taskId ?? null,
        runId,
        sessionId: `social-codex:${runtimeThreadId}:${runId}`,
      },
      ownerUserId: input.ownerUserId ?? null,
      taskId: input.taskId ?? null,
      agent: input.agent,
      goal: input.goal,
      plannerInput: input.plannerInput,
      tools: serializedTools,
      memoryScope: input.memoryScope ?? null,
      maxToolCalls: input.maxToolCalls ?? null,
      maxRetries: input.maxRetries ?? null,
      timeoutMs: input.timeoutMs ?? null,
      route,
      taskContext,
      contextSnapshot,
      profile,
      longTermSnapshot,
      brainToolResults: this.recordArray(input.plannerInput.brainToolResults),
      state: {
        assistantMessage: this.string(input.plannerInput.assistantMessage),
      },
    };
    if (
      typeof input.ownerUserId === 'number' &&
      input.ownerUserId > 0 &&
      typeof input.taskId === 'number' &&
      input.taskId > 0
    ) {
      return buildFitMeetSubagentWorkerCommand({
        runId,
        agentName: input.agent,
        queueName,
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        threadId,
        goal: input.goal,
        plannerInput: input.plannerInput,
        tools: serializedTools,
        memoryScope: input.memoryScope ?? null,
        maxToolCalls: input.maxToolCalls ?? null,
        maxRetries: input.maxRetries ?? null,
        timeoutMs: input.timeoutMs ?? null,
        route,
        taskContext,
        contextSnapshot,
        contextTurnLimit: this.contextTurnLimit(),
        profile,
        longTermSnapshot,
        brainToolResults: this.recordArray(input.plannerInput.brainToolResults),
        state: {
          assistantMessage: this.string(input.plannerInput.assistantMessage),
        },
        workerRuntime: {
          mode: 'queue_worker_ready',
          queueName,
          timeoutMs,
          crashIsolation: true,
          scalable: true,
          modelUseCase,
          model: this.modelFor(modelUseCase),
          runId,
        },
      });
    }
    return legacyPayload;
  }

  private serializedDispatchOutput(
    value: SerializedSubagentWorkerDispatchResult,
    workerTrace: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      taskId: value.task.id,
      state: value.state as unknown as Record<string, unknown>,
      actionTurn: value.actionTurn
        ? (value.actionTurn as unknown as Record<string, unknown>)
        : null,
      observation: value.observation,
      workerTrace,
    };
  }

  private failureReview(
    execution: {
      loop: AgentLoopRun;
      observations: Array<Record<string, unknown>>;
      answerBoundary: { requiresApproval: boolean };
    },
    context: FitMeetSubagentWorkerJobContext,
    profile: SubagentWorkerProfile,
  ): Record<string, unknown> {
    const failedObservation = execution.observations.find(
      (item) => item.error || item.status === 'failed',
    );
    const approvalBoundary = execution.answerBoundary.requiresApproval;
    return {
      required:
        execution.loop.status === 'failed' || Boolean(failedObservation),
      policy: profile.failureReviewPolicy,
      reason:
        execution.loop.status === 'failed'
          ? 'loop_failed'
          : failedObservation
            ? 'tool_observation_failed'
            : approvalBoundary
              ? 'approval_boundary'
              : 'none',
      workerMode: context.mode,
      queueName: context.queueName,
      nextStep:
        execution.loop.status === 'failed' || failedObservation
          ? 'cluster_failure_and_generate_eval_case'
          : approvalBoundary
            ? 'wait_for_user_or_admin_approval'
            : 'store_as_successful_subagent_trace',
    };
  }

  private workerRuntimeMetadata(
    context: FitMeetSubagentWorkerJobContext,
  ): Record<string, unknown> {
    return {
      workerId: context.workerId,
      mode: context.mode,
      queueName: context.queueName,
      timeoutMs: context.timeoutMs,
      crashIsolation: context.crashIsolation,
      scalable: context.scalable,
      modelUseCase: context.modelUseCase,
      model: context.model,
      runId: context.runId,
    };
  }

  private workerTraceMetadata(
    input: SubagentWorkerInput,
    context: FitMeetSubagentWorkerJobContext,
  ): Record<string, unknown> {
    return {
      source: input.workerTrace
        ? 'subagent_worker_job'
        : 'subagent_worker_runtime',
      taskId: input.taskId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      agentName: input.agent,
      toolNames: input.tools.map((tool) => tool.toolName),
      workerRuntime: this.workerRuntimeMetadata(context),
      ...(input.workerTrace ?? {}),
      knownTaskSlotConstraints:
        this.recordOrNull(input.workerTrace?.knownTaskSlotConstraints) ??
        this.knownTaskSlotConstraintsFromPlannerInput(input.plannerInput),
    };
  }

  private queuedWorkerTrace(
    job: SubagentWorkerJob,
    context: FitMeetSubagentWorkerJobContext,
  ): Record<string, unknown> {
    const payload = this.isRecord(job.payload) ? job.payload : {};
    const routeBranch = this.recordOrNull(payload.routeBranch);
    const contextSnapshot =
      this.recordOrNull(payload.contextSnapshot) ??
      this.recordOrNull(routeBranch?.contextSnapshot);
    const plannerInput = this.recordOrNull(payload.plannerInput);
    const taskContext =
      this.recordOrNull(payload.taskContext) ??
      this.recordOrNull(routeBranch?.taskContext);
    return {
      source: 'subagent_worker_job',
      workerJobId: job.id,
      workerJobStatus: job.status ?? null,
      attempts: job.attempts ?? null,
      maxAttempts: job.maxAttempts ?? null,
      agentName: job.agentName,
      queueName: job.queueName,
      runId: job.runId ?? context.runId,
      traceId: job.traceId ?? job.runId ?? context.runId,
      commandId: this.string(payload.commandId),
      commandType: this.string(payload.commandType),
      commandContract: this.string(payload.contract),
      commandVersion:
        typeof payload.version === 'number' && Number.isFinite(payload.version)
          ? payload.version
          : null,
      workerRuntime: this.workerRuntimeMetadata(context),
      knownTaskSlotConstraints:
        this.recordOrNull(contextSnapshot?.knownTaskSlotConstraints) ??
        this.recordOrNull(plannerInput?.knownTaskSlotConstraints) ??
        this.recordOrNull(taskContext?.knownTaskSlotConstraints) ??
        this.knownTaskSlotConstraintsFromPlannerInput(plannerInput ?? {}),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private recordOrNull(value: unknown): Record<string, unknown> | null {
    return this.isRecord(value) ? value : null;
  }

  private recordArray(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        )
      : [];
  }

  private knownTaskSlotConstraintsFromPlannerInput(
    plannerInput: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const hydratedContext = this.recordOrNull(plannerInput.hydratedContext);
    const taskContext = this.recordOrNull(plannerInput.taskContext);
    return (
      this.recordOrNull(hydratedContext?.knownTaskSlotConstraints) ??
      this.recordOrNull(taskContext?.knownTaskSlotConstraints) ??
      buildSocialAgentKnownTaskSlotConstraints(
        this.isRecord(hydratedContext?.taskSlots)
          ? hydratedContext.taskSlots
          : this.isRecord(taskContext?.taskSlots)
            ? taskContext.taskSlots
            : null,
      )
    );
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private slug(agent: FitMeetAlphaAgentName): string {
    return agent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
