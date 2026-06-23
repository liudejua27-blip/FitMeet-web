import { Injectable, Optional } from '@nestjs/common';

import type {
  AgentLoopExecutionResult,
  AgentLoopPhase,
  AgentLoopRun,
  AgentLoopStep,
  AgentLoopToolPlan,
  SubagentHandoffResult,
} from './agent-loop.types';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import { AgentObservabilityService } from './agent-observability.service';

type AgentLoopToolRunner = (input: {
  runId: string;
  traceId: string;
  taskId: number | null;
  agent: FitMeetAlphaAgentName;
  toolName: string;
  input: Record<string, unknown>;
  attempt: number;
  signal?: AbortSignal | null;
}) => Promise<Record<string, unknown>>;

type AgentLoopExecuteInput = {
  taskId?: number | null;
  goal: string;
  agent?: FitMeetAlphaAgentName;
  plan: {
    reason?: string | null;
    tools: AgentLoopToolPlan[];
  };
  runner: AgentLoopToolRunner;
  maxToolCalls?: number | null;
  maxRetries?: number | null;
  timeoutMs?: number | null;
  traceId?: string | null;
  signal?: AbortSignal | null;
  emit?: (event: {
    type: 'agent_loop_step' | 'tool_call' | 'tool_result' | 'approval_required';
    runId: string;
    traceId: string;
    step: AgentLoopStep;
  }) => void;
};

@Injectable()
export class AgentLoopService {
  constructor(
    @Optional()
    private readonly observability?: AgentObservabilityService,
  ) {}

  async execute(
    input: AgentLoopExecuteInput,
  ): Promise<AgentLoopExecutionResult> {
    const startedAt = Date.now();
    const maxToolCalls = this.positiveInt(input.maxToolCalls, 6);
    const maxRetries = this.positiveInt(input.maxRetries, 1);
    const timeoutMs = this.positiveInt(input.timeoutMs, 20_000);
    let loop = this.start({
      taskId: input.taskId ?? null,
      goal: input.goal,
      agent: input.agent ?? 'FitMeet Main Agent',
      traceId: input.traceId ?? null,
    });
    this.observability?.recordAgentRun({
      traceId: loop.traceId,
      runId: loop.runId,
      taskId: loop.taskId,
      status: 'started',
    });
    loop = {
      ...loop,
      toolBudget: {
        maxToolCalls,
        usedToolCalls: 0,
        maxRetries,
        timeoutMs,
      },
    };
    const plannedTools = input.plan.tools.map((tool) => ({
      ...tool,
      requiresApproval: this.requiresApproval(tool),
    }));
    loop = this.plan(loop, {
      agent: 'Agent Brain',
      plan: {
        goal: input.goal,
        reason: input.plan.reason ?? 'Unified AgentLoop execution.',
        tools: plannedTools.map((tool) => ({
          agent: tool.agent,
          toolName: tool.toolName,
          requiresApproval: tool.requiresApproval,
        })),
      },
      critique: 'Agent Brain selected tools for the unified loop.',
      nextPhase: 'tool',
    });
    this.emit(input, loop, this.latestStep(loop));

    const observations: Array<Record<string, unknown>> = [];
    let requiresApproval = false;
    let sawToolFailure = false;
    for (const tool of plannedTools.slice(0, maxToolCalls)) {
      this.assertNotAborted(input.signal);
      loop = {
        ...this.tool(loop, {
          agent: tool.agent,
          toolName: tool.toolName,
          toolInput: tool.input ?? {},
          critique: tool.requiresApproval
            ? 'Mandatory approval gate applies before any social side effect.'
            : 'Execute through the unified AgentLoop runner.',
          nextPhase: 'observe',
        }),
        toolBudget: {
          ...(loop.toolBudget ?? {
            maxToolCalls,
            usedToolCalls: 0,
            maxRetries,
            timeoutMs,
          }),
          usedToolCalls: (loop.toolBudget?.usedToolCalls ?? 0) + 1,
        },
      };
      this.emit(input, loop, this.latestStep(loop), 'tool_call');

      if (tool.requiresApproval) {
        const observation = {
          toolName: tool.toolName,
          requiresConfirmation: true,
          approvalRequired: true,
          status: 'blocked',
        };
        this.observability?.recordApprovalBlocked({
          traceId: loop.traceId,
          runId: loop.runId,
          toolName: tool.toolName,
        });
        this.observability?.recordToolCall({
          traceId: loop.traceId,
          runId: loop.runId,
          toolName: tool.toolName,
          status: 'blocked',
          failureReason: 'approval_required',
        });
        requiresApproval = true;
        observations.push(observation);
        loop = this.append(loop, {
          phase: 'observe',
          agent: tool.agent,
          toolName: tool.toolName,
          observation,
          critique: 'Approval gate blocked execution before side effects.',
          status: 'blocked',
          nextPhase: 'answer',
        });
        this.emit(input, loop, this.latestStep(loop), 'approval_required');
        loop = this.replan(loop, {
          agent: 'Agent Brain',
          reason: `approval_required_${tool.toolName}`,
          observation,
          nextPhase: 'answer',
        });
        this.emit(input, loop, this.latestStep(loop));
        break;
      }

      const startedAt = Date.now();
      const toolResult = await this.runWithRetry({
        input,
        tool,
        maxRetries,
        timeoutMs,
        loop,
      });
      const latencyMs = Date.now() - startedAt;
      observations.push(toolResult.observation);
      this.observability?.recordToolCall({
        traceId: loop.traceId,
        runId: loop.runId,
        toolName: tool.toolName,
        status: toolResult.status,
        latencyMs,
        failureReason: toolResult.error,
      });
      loop = this.append(loop, {
        phase: 'observe',
        agent: tool.agent,
        toolName: tool.toolName,
        observation: toolResult.observation,
        critique:
          toolResult.error ?? this.defaultCritique(toolResult.observation),
        status: toolResult.status,
        latencyMs,
        error: toolResult.error,
        nextPhase: toolResult.status === 'observed' ? 'replan' : 'answer',
      });
      this.emit(input, loop, this.latestStep(loop), 'tool_result');
      if (toolResult.status !== 'observed') {
        sawToolFailure = true;
        loop = this.replan(loop, {
          agent: 'Agent Brain',
          reason: `tool_${tool.toolName}_${toolResult.status}`,
          observation: toolResult.observation,
          nextPhase: 'answer',
        });
        this.emit(input, loop, this.latestStep(loop));
        break;
      }
      loop = this.replan(loop, {
        agent: 'Agent Brain',
        reason: `observe_${tool.toolName}`,
        observation: toolResult.observation,
        nextPhase: 'tool',
      });
      this.emit(input, loop, this.latestStep(loop));
    }

    loop = this.complete(loop);
    this.observability?.recordAgentRun({
      traceId: loop.traceId,
      runId: loop.runId,
      taskId: loop.taskId,
      status: requiresApproval
        ? 'approval_required'
        : loop.status === 'failed' || sawToolFailure
          ? 'failed'
          : 'completed',
      latencyMs: Date.now() - startedAt,
      failureReason:
        loop.status === 'failed' || sawToolFailure
          ? this.safeText(loop.finalObservation?.error) || 'unknown'
          : null,
    });
    this.emit(input, loop, this.latestStep(loop));
    return {
      loop,
      observations,
      answerBoundary: {
        fromObservationsOnly: true,
        requiresApproval,
        canContinue:
          !requiresApproval && !sawToolFailure && loop.status === 'completed',
        status: requiresApproval
          ? 'approval_required'
          : sawToolFailure
            ? 'tool_failed'
            : 'ready',
        userSafeMessage: requiresApproval
          ? '这个动作需要你确认后我才能继续执行；我还没有发送消息、加好友或发布活动。'
          : sawToolFailure
            ? '刚才调用工具时失败了，我没有继续执行可能产生影响的动作。你可以让我重试，或换一种说法继续。'
            : null,
      },
    };
  }

  start(input: {
    taskId?: number | null;
    goal: string;
    agent?: FitMeetAlphaAgentName;
    traceId?: string | null;
  }): AgentLoopRun {
    const runId = `loop:${input.taskId ?? 'new'}:${Date.now().toString(36)}`;
    const traceId =
      input.traceId ??
      this.observability?.createTraceId('agent') ??
      `agent:${Date.now().toString(36)}:${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    return {
      runId,
      traceId,
      taskId: input.taskId ?? null,
      goal: input.goal,
      status: 'running',
      steps: [
        this.step({
          phase: 'plan',
          agent: input.agent ?? 'FitMeet Main Agent',
          input: { goal: input.goal },
          critique: 'Start with a plan before calling tools.',
          status: 'planned',
          nextPhase: 'tool',
        }),
      ],
    };
  }

  observe(
    run: AgentLoopRun,
    input: {
      agent: FitMeetAlphaAgentName;
      toolName?: string | null;
      observation: Record<string, unknown>;
      critique?: string | null;
      nextPhase?: AgentLoopPhase | null;
    },
  ): AgentLoopRun {
    return {
      ...run,
      steps: [
        ...run.steps,
        this.step({
          phase: 'observe',
          agent: input.agent,
          toolName: input.toolName,
          observation: input.observation,
          critique: input.critique ?? this.defaultCritique(input.observation),
          status: input.observation.error ? 'failed' : 'observed',
          nextPhase: input.nextPhase ?? 'answer',
        }),
      ],
    };
  }

  plan(
    run: AgentLoopRun,
    input: {
      agent: FitMeetAlphaAgentName;
      plan: Record<string, unknown>;
      critique?: string | null;
      nextPhase?: AgentLoopPhase | null;
    },
  ): AgentLoopRun {
    return this.append(run, {
      phase: 'plan',
      agent: input.agent,
      input: input.plan,
      critique: input.critique ?? 'Planner selected the next specialist path.',
      status: 'planned',
      nextPhase: input.nextPhase ?? 'tool',
    });
  }

  tool(
    run: AgentLoopRun,
    input: {
      agent: FitMeetAlphaAgentName;
      toolName: string;
      toolInput?: Record<string, unknown> | null;
      critique?: string | null;
      nextPhase?: AgentLoopPhase | null;
    },
  ): AgentLoopRun {
    return this.append(run, {
      phase: 'tool',
      agent: input.agent,
      toolName: input.toolName,
      input: input.toolInput ?? {},
      critique: input.critique ?? 'Execute through the shared tool loop.',
      status: 'running',
      nextPhase: input.nextPhase ?? 'observe',
    });
  }

  replan(
    run: AgentLoopRun,
    input: {
      agent?: FitMeetAlphaAgentName;
      reason: string;
      observation?: Record<string, unknown> | null;
      nextPhase?: AgentLoopPhase | null;
    },
  ): AgentLoopRun {
    return this.append(run, {
      phase: 'replan',
      agent: input.agent ?? 'Agent Brain',
      input: { reason: input.reason },
      observation: input.observation ?? null,
      critique: 'Re-evaluate the plan after a branch or tool observation.',
      status: input.observation?.error ? 'failed' : 'completed',
      nextPhase: input.nextPhase ?? 'answer',
    });
  }

  complete(run: AgentLoopRun): AgentLoopRun {
    return {
      ...run,
      status: 'completed',
      finalObservation: this.latestObservation(run),
      steps: [
        ...run.steps,
        this.step({
          phase: 'answer',
          agent: 'FitMeet Main Agent',
          critique: 'Return a user-facing answer and preserve internal trace.',
          status: 'completed',
          nextPhase: null,
        }),
      ],
    };
  }

  buildHandoff(input: {
    agent: FitMeetAlphaAgentName;
    memoryScope?: string | null;
    input: Record<string, unknown>;
    toolNames?: string[];
    observation?: Record<string, unknown>;
    critique?: string | null;
    handoffOutput?: Record<string, unknown>;
  }): SubagentHandoffResult {
    const toolNames = input.toolNames ?? [];
    const observation = input.observation ?? {};
    return {
      agent: input.agent,
      memoryScope: input.memoryScope ?? null,
      input: input.input,
      toolCalls: toolNames.map((toolName) => ({
        toolName,
        input: input.input,
        status: Object.keys(observation).length > 0 ? 'observed' : 'planned',
      })),
      plannerInput: input.input,
      observations: Object.keys(observation).length > 0 ? [observation] : [],
      observation,
      critique: input.critique ?? this.defaultCritique(observation),
      handoffOutput: input.handoffOutput ?? observation,
      evalHints: {
        requiresConfirmation: observation.requiresConfirmation === true,
        hasError: Boolean(observation.error),
        observedKeys: Object.keys(observation),
        toolBudget: {
          plannedToolCount: toolNames.length,
          observedToolCount: Object.keys(observation).length > 0 ? 1 : 0,
        },
      },
    };
  }

  fail(
    run: AgentLoopRun,
    input: {
      agent?: FitMeetAlphaAgentName;
      error: unknown;
      observation?: Record<string, unknown> | null;
    },
  ): AgentLoopRun {
    const message =
      input.error instanceof Error ? input.error.message : String(input.error);
    return {
      ...this.append(run, {
        phase: 'observe',
        agent: input.agent ?? 'FitMeet Main Agent',
        observation: {
          ...(input.observation ?? {}),
          error: message,
        },
        critique: 'Loop failed; preserve the trace for reflection.',
        status: 'failed',
        error: message,
        nextPhase: null,
      }),
      status: 'failed',
      finalObservation: { error: message },
    };
  }

  private step(input: Omit<AgentLoopStep, 'createdAt'>): AgentLoopStep {
    return {
      ...input,
      input: input.input ?? null,
      observation: input.observation ?? null,
      toolName: input.toolName ?? null,
      critique: input.critique ?? null,
      status: input.status ?? 'planned',
      latencyMs: input.latencyMs ?? null,
      error: input.error ?? null,
      nextPhase: input.nextPhase ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  private append(
    run: AgentLoopRun,
    step: Omit<AgentLoopStep, 'createdAt'>,
  ): AgentLoopRun {
    return {
      ...run,
      steps: [...run.steps, this.step(step)],
    };
  }

  private latestObservation(run: AgentLoopRun): Record<string, unknown> | null {
    for (const step of [...run.steps].reverse()) {
      if (step.observation && Object.keys(step.observation).length > 0) {
        return step.observation;
      }
    }
    return null;
  }

  private defaultCritique(observation: Record<string, unknown>): string {
    if (observation.error)
      return 'Tool observation failed; replan before answer.';
    if (observation.requiresConfirmation) {
      return 'Observation requires user confirmation before any side effect.';
    }
    return 'Observation is sufficient for the next response.';
  }

  private requiresApproval(tool: AgentLoopToolPlan): boolean {
    if (tool.requiresApproval === true) return true;
    if (this.isSafeInternalPlanningTool(tool)) return false;
    if (tool.toolName === 'card_action_dispatch') return false;
    if (this.isConfirmedCandidateCommand(tool)) return false;
    const name = tool.toolName.toLowerCase();
    if (this.highRiskToolNames().some((pattern) => pattern.test(name))) {
      return true;
    }
    return this.highRiskInputSurface(tool.input ?? {});
  }

  private isSafeInternalPlanningTool(tool: AgentLoopToolPlan): boolean {
    if (tool.requiresApproval !== false) return false;
    return (
      /^recommendation_/.test(tool.toolName) ||
      /^route_.*_turn$/.test(tool.toolName) ||
      [
        'social_match_search_turn',
        'life_graph_profile_turn',
        'life_graph_conversation_turn',
        'meet_loop_action_turn',
      ].includes(tool.toolName) ||
      tool.toolName === 'candidate_confirmation_check' ||
      tool.toolName === 'main_agent_prepare_turn'
    );
  }

  private isConfirmedCandidateCommand(tool: AgentLoopToolPlan): boolean {
    return (
      tool.toolName === 'candidate_command_execute' &&
      tool.input?.confirmedEndpoint === true
    );
  }

  private highRiskToolNames(): RegExp[] {
    return [
      /send.*message/,
      /reply.*message/,
      /connect.*candidate/,
      /add.*friend/,
      /create.*activity/,
      /invite.*activity/,
      /join.*activity/,
      /publish/,
      /offline.*meet/,
      /share.*location/,
      /privacy/,
      /payment|pay/,
      /confirm_(send|connect|create|publish|pay)/,
    ];
  }

  private highRiskInputSurface(input: Record<string, unknown>): boolean {
    const text = this.safeText(input).toLowerCase();
    return /发送|私信|加好友|连接候选|邀约|创建活动|公开发布|支付|付款|共享位置|精确定位|隐私设置|phone|mobile|precise.*location|payment|publish/.test(
      text,
    );
  }

  private async runWithRetry(input: {
    input: AgentLoopExecuteInput;
    tool: AgentLoopToolPlan;
    maxRetries: number;
    timeoutMs: number;
    loop: AgentLoopRun;
  }): Promise<{
    observation: Record<string, unknown>;
    status: 'observed' | 'failed';
    error?: string | null;
  }> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= input.maxRetries; attempt += 1) {
      try {
        this.assertNotAborted(input.input.signal);
        const observation = await this.withTimeout(
          input.input.runner({
            runId: input.loop.runId,
            traceId: input.loop.traceId,
            taskId: input.loop.taskId,
            agent: input.tool.agent,
            toolName: input.tool.toolName,
            input: input.tool.input ?? {},
            attempt,
            signal: input.input.signal ?? null,
          }),
          input.timeoutMs,
          input.input.signal ?? null,
        );
        return { observation, status: 'observed', error: null };
      } catch (error) {
        lastError = error;
        if (input.input.signal?.aborted) break;
      }
    }
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    return {
      observation: {
        toolName: input.tool.toolName,
        error: message,
      },
      status: 'failed',
      error: message,
    };
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal: AbortSignal | null,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () =>
        finish(() => reject(new Error('AgentLoop aborted')));
      const timeout = setTimeout(
        () => finish(() => reject(new Error('AgentLoop tool timeout'))),
        timeoutMs,
      );
      signal?.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => finish(() => resolve(value)),
        (error) =>
          finish(() =>
            reject(error instanceof Error ? error : new Error(String(error))),
          ),
      );
    });
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('AgentLoop aborted');
  }

  private positiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(1, Math.trunc(parsed));
  }

  private safeText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }

  private emit(
    input: AgentLoopExecuteInput,
    loop: AgentLoopRun,
    step: AgentLoopStep,
    type:
      | 'agent_loop_step'
      | 'tool_call'
      | 'tool_result'
      | 'approval_required' = 'agent_loop_step',
  ): void {
    input.emit?.({
      type,
      runId: loop.runId,
      traceId: loop.traceId,
      step,
    });
  }

  private latestStep(run: AgentLoopRun): AgentLoopStep {
    return run.steps[run.steps.length - 1];
  }
}
