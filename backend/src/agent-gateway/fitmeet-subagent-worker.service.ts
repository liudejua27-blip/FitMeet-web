import { Injectable, Optional } from '@nestjs/common';

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
  FitMeetSubagentWorkerRuntimeService,
  type FitMeetSubagentWorkerJobContext,
} from './fitmeet-subagent-worker-runtime.service';

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
  signal?: AbortSignal | null;
  runner: SubagentWorkerToolRunner;
};

type SubagentWorkerRunOutput = {
  loop: AgentLoopRun;
  handoff: SubagentHandoffResult;
  workerOutput?: Record<string, unknown>;
};

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
    return this.executeInLoop(input, {
      workerId: runId,
      agent: input.agent,
      mode: 'resident_in_process',
      queueName: `fitmeet.subagent.${this.slug(input.agent)}`,
      timeoutMs: input.timeoutMs ?? 15_000,
      crashIsolation: false,
      scalable: false,
      modelUseCase: 'planner',
      model: 'deepseek-v4-flash',
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
      throw new Error('Unsupported subagent worker payload.');
    }
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
      runner: async ({ toolName }) => {
        workerOutput = await this.dispatcher!.dispatch({
          payload,
          toolName,
          job: input.job,
        });
        return {
          ...workerOutput.observation,
          subagentWorker: true,
          externalWorker: true,
          workerJobId: input.job.id,
        };
      },
    };
    const result = await this.executeInLoop(runInput, input.context);
    return {
      ...result,
      workerOutput: workerOutput
        ? this.serializedDispatchOutput(workerOutput)
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
      timeoutMs: input.timeoutMs ?? 15_000,
      signal: input.signal,
      runner: ({ agent, toolName, input: toolInput, attempt, signal }) =>
        input.runner({
          agent,
          toolName,
          input: toolInput,
          attempt,
          signal,
        }),
    });
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
    await this.l5Runtime?.recordSubagentMemory({
      ownerUserId: input.ownerUserId,
      agentTaskId: input.taskId ?? null,
      agentName: input.agent,
      memoryScope:
        handoff.memoryScope ?? this.profileFor(input.agent).memoryScope,
      input: handoff.input,
      plannerInput: handoff.plannerInput ?? handoff.input,
      toolCalls: handoff.toolCalls,
      observation: handoff.observation,
      observations: handoff.observations ?? [handoff.observation],
      critique: handoff.critique,
      handoffOutput: handoff.handoffOutput,
      evalHints: handoff.evalHints ?? {},
    });
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
    if (agent === 'Social Match Agent') {
      return {
        memoryScope: 'matching.worker_memory',
        evalRunner: 'social_match_recall_ranking_eval_v1',
        failureReviewPolicy: 'cluster_recall_or_ranking_failures',
        privateScratchpad: true,
        defaultToolBudget: 3,
      };
    }
    if (agent === 'Meet Loop Agent') {
      return {
        memoryScope: 'meet_loop.worker_memory',
        evalRunner: 'meet_loop_state_machine_eval_v1',
        failureReviewPolicy: 'review_state_transition_and_idempotency',
        privateScratchpad: true,
        defaultToolBudget: 4,
      };
    }
    if (agent === 'Math Agent') {
      return {
        memoryScope: 'math.worker_memory',
        evalRunner: 'deterministic_math_contract_eval_v1',
        failureReviewPolicy: 'review_invalid_input_or_unit_boundary',
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
    return {
      kind: 'route_branch',
      runId,
      ownerUserId: input.ownerUserId ?? null,
      taskId: input.taskId ?? null,
      agent: input.agent,
      goal: input.goal,
      plannerInput: input.plannerInput,
      tools: input.tools,
      memoryScope: input.memoryScope ?? null,
      maxToolCalls: input.maxToolCalls ?? null,
      maxRetries: input.maxRetries ?? null,
      timeoutMs: input.timeoutMs ?? null,
      route: input.plannerInput.route ?? {
        intent: input.plannerInput.intent,
        source: input.plannerInput.routeSource,
      },
      profile: input.plannerInput.profile ?? null,
      longTermSnapshot: input.plannerInput.longTermSnapshot ?? null,
      brainToolResults: input.plannerInput.brainToolResults ?? [],
      state: {
        assistantMessage: input.plannerInput.assistantMessage ?? null,
      },
    };
  }

  private serializedDispatchOutput(
    value: SerializedSubagentWorkerDispatchResult,
  ): Record<string, unknown> {
    return {
      taskId: value.task.id,
      state: value.state as unknown as Record<string, unknown>,
      actionTurn: value.actionTurn
        ? (value.actionTurn as unknown as Record<string, unknown>)
        : null,
      observation: value.observation,
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

  private slug(agent: FitMeetAlphaAgentName): string {
    return agent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
