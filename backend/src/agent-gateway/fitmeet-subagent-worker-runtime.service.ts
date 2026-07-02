import { Injectable, Optional } from '@nestjs/common';

import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SocialAgentModelRouterService,
  selectSocialAgentConfiguredModel,
  type SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import { AgentObservabilityService } from './agent-observability.service';
import { SubagentWorkerQueueService } from './subagent-worker-queue.service';
import {
  buildFitMeetSubagentWorkerCommand,
  isFitMeetSubagentWorkerCommand,
  isLegacySubagentRouteBranchPayload,
} from './fitmeet-subagent-worker-command.contract';
import { fitMeetSubagentQueueNameForAgent } from './fitmeet-subagent-worker-queues';

export type FitMeetSubagentWorkerMode =
  | 'resident_in_process'
  | 'queue_worker_ready'
  | 'external_process_ready';

export const FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS = 30_000;

export interface FitMeetSubagentWorkerJobContext {
  workerId: string;
  agent: FitMeetAlphaAgentName;
  mode: FitMeetSubagentWorkerMode;
  queueName: string;
  timeoutMs: number;
  crashIsolation: boolean;
  scalable: boolean;
  modelUseCase: SocialAgentModelUseCase;
  model: string;
  runId: string;
  signal?: AbortSignal | null;
}

export type FitMeetSubagentWorkerJob<T> = (
  context: FitMeetSubagentWorkerJobContext,
) => Promise<T>;

export interface FitMeetSubagentWorkerLaneSnapshot {
  workerId: string;
  agent: FitMeetAlphaAgentName;
  mode: FitMeetSubagentWorkerMode;
  queueName: string;
  timeoutMs: number;
  crashIsolation: boolean;
  scalable: boolean;
  status: 'idle' | 'running' | 'failed';
  modelUseCase: SocialAgentModelUseCase;
  model: string;
  queueDepth: number;
  activeRunId: string | null;
  lastHeartbeatAt: string | null;
  totalRuns: number;
  failedRuns: number;
}

interface WorkerLane {
  workerId: string;
  agent: FitMeetAlphaAgentName;
  mode: FitMeetSubagentWorkerMode;
  queueName: string;
  timeoutMs: number;
  crashIsolation: boolean;
  scalable: boolean;
  status: 'idle' | 'running' | 'failed';
  modelUseCase: SocialAgentModelUseCase;
  model: string;
  queueDepth: number;
  activeRunId: string | null;
  lastHeartbeatAt: string | null;
  totalRuns: number;
  failedRuns: number;
  tail: Promise<void>;
}

@Injectable()
export class FitMeetSubagentWorkerRuntimeService {
  private readonly lanes = new Map<string, WorkerLane>();

  constructor(
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
    @Optional()
    private readonly observability?: AgentObservabilityService,
    @Optional()
    private readonly dbQueue?: SubagentWorkerQueueService,
  ) {}

  async submit<T>(input: {
    agent: FitMeetAlphaAgentName;
    runId: string;
    queueName?: string | null;
    signal?: AbortSignal | null;
    serializedPayload?: Record<string, unknown>;
    job: FitMeetSubagentWorkerJob<T>;
  }): Promise<T> {
    const lane = this.laneFor(input.agent, input.queueName);
    if (lane.mode === 'queue_worker_ready') {
      if (this.dbQueue) return this.submitViaDbQueue(input, lane);
      return this.rejectUnavailableOutOfProcessWorker(
        input,
        lane,
        'Subagent DB queue mode is enabled, but SubagentWorkerQueueService is not available.',
      );
    }
    if (lane.mode === 'external_process_ready') {
      return this.rejectUnavailableOutOfProcessWorker(
        input,
        lane,
        'Subagent external process mode is enabled, but no external worker adapter is registered.',
      );
    }
    lane.queueDepth += 1;
    this.recordQueueSnapshot();

    const run = lane.tail.then(async () => {
      lane.queueDepth = Math.max(0, lane.queueDepth - 1);
      const jobAbort = this.createJobAbortBridge(input.signal);
      if (jobAbort.signal.aborted) {
        jobAbort.cleanup();
        throw new Error('Subagent worker job aborted before start.');
      }
      lane.status = 'running';
      lane.activeRunId = input.runId;
      lane.lastHeartbeatAt = new Date().toISOString();
      lane.totalRuns += 1;
      try {
        const result = await this.withTimeout(
          input.job({
            workerId: lane.workerId,
            agent: lane.agent,
            mode: lane.mode,
            queueName: lane.queueName,
            timeoutMs: lane.timeoutMs,
            crashIsolation: lane.crashIsolation,
            scalable: lane.scalable,
            modelUseCase: lane.modelUseCase,
            model: lane.model,
            runId: input.runId,
            signal: jobAbort.signal,
          }),
          lane.timeoutMs,
          jobAbort.signal,
          (error) => jobAbort.abort(error),
        );
        lane.status = 'idle';
        return result;
      } catch (error) {
        lane.status = 'failed';
        lane.failedRuns += 1;
        throw error;
      } finally {
        jobAbort.cleanup();
        lane.activeRunId = null;
        lane.lastHeartbeatAt = new Date().toISOString();
        this.recordQueueSnapshot();
      }
    });

    lane.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private rejectUnavailableOutOfProcessWorker<T>(
    input: {
      agent: FitMeetAlphaAgentName;
      runId: string;
      job: FitMeetSubagentWorkerJob<T>;
    },
    lane: WorkerLane,
    message: string,
  ): Promise<T> {
    lane.status = 'failed';
    lane.failedRuns += 1;
    lane.activeRunId = input.runId;
    lane.lastHeartbeatAt = new Date().toISOString();
    this.recordQueueSnapshot();
    lane.activeRunId = null;
    const error = new Error(message);
    error.name = 'SubagentWorkerRuntimeUnavailableError';
    return Promise.reject(error);
  }

  snapshot(agent?: FitMeetAlphaAgentName): FitMeetSubagentWorkerLaneSnapshot[] {
    const lanes = agent
      ? Array.from(this.lanes.values()).filter((lane) => lane.agent === agent)
      : Array.from(this.lanes.values());
    const resolvedLanes =
      agent && lanes.length === 0 ? [this.laneFor(agent)] : lanes;
    const snapshot = resolvedLanes.map((lane) => ({
      workerId: lane.workerId,
      agent: lane.agent,
      mode: lane.mode,
      queueName: lane.queueName,
      timeoutMs: lane.timeoutMs,
      crashIsolation: lane.crashIsolation,
      scalable: lane.scalable,
      status: lane.status,
      modelUseCase: lane.modelUseCase,
      model: lane.model,
      queueDepth: lane.queueDepth,
      activeRunId: lane.activeRunId,
      lastHeartbeatAt: lane.lastHeartbeatAt,
      totalRuns: lane.totalRuns,
      failedRuns: lane.failedRuns,
    }));
    this.observability?.recordQueueSnapshot(snapshot);
    return snapshot;
  }

  private laneFor(
    agent: FitMeetAlphaAgentName,
    requestedQueueName?: string | null,
  ): WorkerLane {
    const queueName = this.queueNameFor(agent, requestedQueueName);
    const key = this.laneKey(agent, queueName);
    const existing = this.lanes.get(key);
    if (existing) return existing;
    const modelUseCase = this.modelUseCaseFor(agent);
    const mode = this.modeFor(agent);
    const lane: WorkerLane = {
      workerId: `subagent:${this.slug(agent)}:${Date.now().toString(36)}`,
      agent,
      mode,
      queueName,
      timeoutMs: this.timeoutMsFor(agent, modelUseCase),
      crashIsolation: mode !== 'resident_in_process',
      scalable: mode !== 'resident_in_process',
      status: 'idle',
      modelUseCase,
      model: this.modelFor(agent, modelUseCase),
      queueDepth: 0,
      activeRunId: null,
      lastHeartbeatAt: null,
      totalRuns: 0,
      failedRuns: 0,
      tail: Promise.resolve(),
    };
    this.lanes.set(key, lane);
    return lane;
  }

  private modelUseCaseFor(
    agent: FitMeetAlphaAgentName,
  ): SocialAgentModelUseCase {
    if (agent === 'Life Graph Agent') return 'profile_extraction';
    if (agent === 'Match Agent') return 'candidate_summary';
    if (agent === 'Agent Brain') return 'planner';
    return 'planner';
  }

  private modelFor(
    agent: FitMeetAlphaAgentName,
    useCase: SocialAgentModelUseCase,
  ): string {
    const override = this.env(this.agentEnvKey(agent, 'MODEL'));
    const safeOverride = selectSocialAgentConfiguredModel(override, {
      allowFast: false,
    });
    if (safeOverride) return safeOverride;
    return (
      this.modelRouter?.getModel(useCase) ??
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private timeoutMsFor(
    agent: FitMeetAlphaAgentName,
    useCase: SocialAgentModelUseCase,
  ): number {
    const modelBudget =
      typeof this.modelRouter?.getTimeout === 'function'
        ? this.modelRouter.getTimeout(useCase)
        : FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS;
    const override = this.positiveInt(
      this.env(this.agentEnvKey(agent, 'TIMEOUT_MS')),
    );
    if (override) return Math.max(override, modelBudget);
    const shared = this.positiveInt(
      this.env('FITMEET_SUBAGENT_WORKER_TIMEOUT_MS'),
    );
    if (shared) return Math.max(shared, modelBudget);
    return modelBudget;
  }

  private modeFor(agent: FitMeetAlphaAgentName): FitMeetSubagentWorkerMode {
    const raw = (
      this.env(this.agentEnvKey(agent, 'MODE')) ??
      this.env('FITMEET_SUBAGENT_WORKER_MODE') ??
      ''
    )
      .toLowerCase()
      .trim();
    if (raw === 'queue' || raw === 'queue_worker_ready' || raw === 'db_queue') {
      return 'queue_worker_ready';
    }
    if (raw === 'external' || raw === 'external_process_ready') {
      return 'external_process_ready';
    }
    return 'resident_in_process';
  }

  private queueNameFor(
    agent: FitMeetAlphaAgentName,
    requestedQueueName?: string | null,
  ): string {
    return (
      this.cleanText(requestedQueueName) ??
      this.env(this.agentEnvKey(agent, 'QUEUE')) ??
      fitMeetSubagentQueueNameForAgent(agent)
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    signal?: AbortSignal | null,
    onTimeout?: (error: Error) => void,
  ): Promise<T> {
    if (signal?.aborted) {
      throw this.abortErrorFromSignal(signal);
    }
    const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    if (!hasTimeout && !signal) return promise;
    let timer: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;
    const blockers: Promise<never>[] = [];
    if (hasTimeout) {
      blockers.push(
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error(
              `Subagent worker timed out after ${timeoutMs}ms.`,
            );
            onTimeout?.(error);
            reject(error);
          }, timeoutMs);
        }),
      );
    }
    if (signal) {
      blockers.push(
        new Promise<never>((_, reject) => {
          abortListener = () => reject(this.abortErrorFromSignal(signal));
          signal.addEventListener('abort', abortListener, { once: true });
        }),
      );
    }
    try {
      return await Promise.race([promise, ...blockers]);
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  }

  private createJobAbortBridge(parent?: AbortSignal | null): {
    signal: AbortSignal;
    abort: (reason?: unknown) => void;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const abort = (reason?: unknown) => {
      if (!controller.signal.aborted) {
        controller.abort(reason ?? this.abortError());
      }
    };
    const onParentAbort = () => abort(this.abortErrorFromSignal(parent));
    if (parent?.aborted) {
      onParentAbort();
    } else if (parent) {
      parent.addEventListener('abort', onParentAbort, { once: true });
    }
    return {
      signal: controller.signal,
      abort,
      cleanup: () => {
        parent?.removeEventListener('abort', onParentAbort);
      },
    };
  }

  private abortError(message = 'Subagent worker job aborted.'): Error {
    const error = new Error(message);
    error.name = 'SubagentWorkerAbortedError';
    return error;
  }

  private abortErrorFromSignal(signal?: AbortSignal | null): Error {
    const reason: unknown = signal?.reason;
    if (reason instanceof Error) return reason;
    if (typeof reason === 'string' && reason.trim()) {
      return this.abortError(reason);
    }
    return this.abortError();
  }

  private agentEnvKey(agent: FitMeetAlphaAgentName, suffix: string): string {
    return `FITMEET_${this.slug(agent).replace(/-/g, '_').toUpperCase()}_WORKER_${suffix}`;
  }

  private env(key: string): string | null {
    const value = process.env[key]?.trim();
    return value ? value : null;
  }

  private positiveInt(value: string | null): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.trunc(parsed);
  }

  private cleanText(value: string | null | undefined): string | null {
    const text = `${value ?? ''}`.trim();
    return text ? text : null;
  }

  private slug(agent: FitMeetAlphaAgentName): string {
    return agent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private recordQueueSnapshot(): void {
    this.observability?.recordQueueSnapshot(this.snapshot());
  }

  private laneKey(agent: FitMeetAlphaAgentName, queueName: string): string {
    return `${agent}\u0000${queueName}`;
  }

  private async submitViaDbQueue<T>(
    input: {
      agent: FitMeetAlphaAgentName;
      runId: string;
      signal?: AbortSignal | null;
      serializedPayload?: Record<string, unknown>;
      job: FitMeetSubagentWorkerJob<T>;
    },
    lane: WorkerLane,
  ): Promise<T> {
    lane.queueDepth += 1;
    this.recordQueueSnapshot();
    const payload = this.dbQueuePayloadForRun(input, lane);
    const queuedJob = await this.dbQueue!.enqueue({
      agentName: input.agent,
      queueName: lane.queueName,
      payload,
      runId: input.runId,
      traceId: input.runId,
      maxAttempts:
        this.positiveInt(this.env('FITMEET_SUBAGENT_WORKER_MAX_ATTEMPTS')) ?? 3,
    });

    try {
      const result = await this.dbQueue!.waitForCompletion(queuedJob.id, {
        timeoutMs: this.queueWaitTimeoutMs(lane),
        pollMs: this.queuePollMs(),
        signal: input.signal ?? null,
      });
      lane.status = 'idle';
      lane.totalRuns += 1;
      return result as T;
    } catch (error) {
      lane.status = 'failed';
      lane.failedRuns += 1;
      throw error;
    } finally {
      lane.queueDepth = Math.max(0, lane.queueDepth - 1);
      lane.activeRunId = null;
      lane.lastHeartbeatAt = new Date().toISOString();
      this.recordQueueSnapshot();
    }
  }

  private safeRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }

  private dbQueuePayloadForRun(
    input: {
      agent: FitMeetAlphaAgentName;
      runId: string;
      serializedPayload?: Record<string, unknown>;
    },
    lane: WorkerLane,
  ): Record<string, unknown> {
    const payload = input.serializedPayload ?? {};
    if (isFitMeetSubagentWorkerCommand(payload)) {
      this.assertCommandMatchesQueueRun(payload, input, lane);
      return payload;
    }
    if (!isLegacySubagentRouteBranchPayload(payload)) {
      throw new Error(
        'Subagent DB queue mode requires a serializable route branch command payload.',
      );
    }
    return buildFitMeetSubagentWorkerCommand({
      runId: input.runId,
      traceId: input.runId,
      agentName: input.agent,
      queueName: lane.queueName,
      ownerUserId: payload.ownerUserId,
      taskId: payload.taskId,
      threadId:
        payload.runtimeIdentity?.threadId ??
        payload.contextSnapshot?.threadId ??
        (this.safeRecord(payload.taskContext).threadId as string | undefined) ??
        null,
      goal: payload.goal,
      plannerInput: payload.plannerInput,
      tools: payload.tools,
      memoryScope: payload.memoryScope ?? null,
      maxToolCalls: payload.maxToolCalls ?? null,
      maxRetries: payload.maxRetries ?? null,
      timeoutMs: payload.timeoutMs ?? null,
      route: payload.route,
      taskContext: payload.taskContext ?? null,
      contextSnapshot: payload.contextSnapshot ?? null,
      profile: payload.profile ?? null,
      longTermSnapshot: payload.longTermSnapshot ?? null,
      brainToolResults: payload.brainToolResults ?? [],
      state: payload.state,
      workerRuntime: this.workerRuntimeMetadata(lane, input.runId),
    });
  }

  private assertCommandMatchesQueueRun(
    command: ReturnType<typeof buildFitMeetSubagentWorkerCommand>,
    input: {
      agent: FitMeetAlphaAgentName;
      runId: string;
    },
    lane: WorkerLane,
  ): void {
    if (
      command.agentName !== input.agent ||
      command.runId !== input.runId ||
      command.queueName !== lane.queueName
    ) {
      throw new Error(
        'Subagent DB queue command does not match the requested worker lane.',
      );
    }
  }

  private queuePollMs(): number {
    return (
      this.positiveInt(this.env('FITMEET_SUBAGENT_WORKER_RESULT_POLL_MS')) ??
      500
    );
  }

  private queueWaitTimeoutMs(lane: WorkerLane): number {
    const floor = Math.max(lane.timeoutMs * 2, lane.timeoutMs + 10_000);
    const configured = this.positiveInt(
      this.env('FITMEET_SUBAGENT_WORKER_RESULT_TIMEOUT_MS'),
    );
    return configured ? Math.max(configured, floor) : floor;
  }

  private workerRuntimeMetadata(
    lane: WorkerLane,
    runId: string,
  ): Record<string, unknown> {
    return {
      workerId: lane.workerId,
      agent: lane.agent,
      mode: lane.mode,
      queueName: lane.queueName,
      timeoutMs: lane.timeoutMs,
      crashIsolation: lane.crashIsolation,
      scalable: lane.scalable,
      modelUseCase: lane.modelUseCase,
      model: lane.model,
      runId,
    };
  }
}
