import { Injectable, Optional } from '@nestjs/common';

import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import {
  SocialAgentModelRouterService,
  type SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import { AgentObservabilityService } from './agent-observability.service';
import { SubagentWorkerQueueService } from './subagent-worker-queue.service';
import {
  buildFitMeetSubagentWorkerCommand,
  isLegacySubagentRouteBranchPayload,
} from './fitmeet-subagent-worker-command.contract';

export type FitMeetSubagentWorkerMode =
  | 'resident_in_process'
  | 'queue_worker_ready'
  | 'external_process_ready';

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
  private readonly lanes = new Map<FitMeetAlphaAgentName, WorkerLane>();

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
    signal?: AbortSignal | null;
    serializedPayload?: Record<string, unknown>;
    job: FitMeetSubagentWorkerJob<T>;
  }): Promise<T> {
    const lane = this.laneFor(input.agent);
    if (lane.mode === 'queue_worker_ready' && this.dbQueue) {
      return this.submitViaDbQueue(input, lane);
    }
    lane.queueDepth += 1;
    this.recordQueueSnapshot();

    const run = lane.tail.then(async () => {
      lane.queueDepth = Math.max(0, lane.queueDepth - 1);
      if (input.signal?.aborted) {
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
            signal: input.signal ?? null,
          }),
          lane.timeoutMs,
        );
        lane.status = 'idle';
        return result;
      } catch (error) {
        lane.status = 'failed';
        lane.failedRuns += 1;
        throw error;
      } finally {
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

  snapshot(agent?: FitMeetAlphaAgentName): FitMeetSubagentWorkerLaneSnapshot[] {
    const lanes = agent
      ? [this.laneFor(agent)]
      : Array.from(this.lanes.values());
    const snapshot = lanes.map((lane) => ({
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

  private laneFor(agent: FitMeetAlphaAgentName): WorkerLane {
    const existing = this.lanes.get(agent);
    if (existing) return existing;
    const modelUseCase = this.modelUseCaseFor(agent);
    const mode = this.modeFor(agent);
    const lane: WorkerLane = {
      workerId: `subagent:${this.slug(agent)}:${Date.now().toString(36)}`,
      agent,
      mode,
      queueName: this.queueNameFor(agent),
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
    this.lanes.set(agent, lane);
    return lane;
  }

  private modelUseCaseFor(
    agent: FitMeetAlphaAgentName,
  ): SocialAgentModelUseCase {
    if (agent === 'Life Graph Agent') return 'profile_extraction';
    if (agent === 'Social Match Agent') return 'candidate_summary';
    if (agent === 'Meet Loop Agent') return 'planner';
    if (agent === 'Math Agent') return 'planner';
    return 'planner';
  }

  private modelFor(
    agent: FitMeetAlphaAgentName,
    useCase: SocialAgentModelUseCase,
  ): string {
    const override = this.env(this.agentEnvKey(agent, 'MODEL'));
    if (override) return override;
    return this.modelRouter?.getModel(useCase) ?? 'deepseek-v4-flash';
  }

  private timeoutMsFor(
    agent: FitMeetAlphaAgentName,
    useCase: SocialAgentModelUseCase,
  ): number {
    const override = this.positiveInt(
      this.env(this.agentEnvKey(agent, 'TIMEOUT_MS')),
    );
    if (override) return override;
    const shared = this.positiveInt(
      this.env('FITMEET_SUBAGENT_WORKER_TIMEOUT_MS'),
    );
    if (shared) return shared;
    return typeof this.modelRouter?.getTimeout === 'function'
      ? this.modelRouter.getTimeout(useCase)
      : 15_000;
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

  private queueNameFor(agent: FitMeetAlphaAgentName): string {
    return (
      this.env(this.agentEnvKey(agent, 'QUEUE')) ??
      this.env('FITMEET_SUBAGENT_WORKER_QUEUE') ??
      `fitmeet.subagent.${this.slug(agent)}`
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Subagent worker timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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

  private slug(agent: FitMeetAlphaAgentName): string {
    return agent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private recordQueueSnapshot(): void {
    this.observability?.recordQueueSnapshot(this.snapshot());
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
      goal: payload.goal,
      plannerInput: payload.plannerInput,
      tools: payload.tools,
      memoryScope: payload.memoryScope ?? null,
      maxToolCalls: payload.maxToolCalls ?? null,
      maxRetries: payload.maxRetries ?? null,
      timeoutMs: payload.timeoutMs ?? null,
      route: payload.route,
      profile: payload.profile ?? null,
      longTermSnapshot: payload.longTermSnapshot ?? null,
      brainToolResults: payload.brainToolResults ?? [],
      state: payload.state,
      workerRuntime: this.workerRuntimeMetadata(lane, input.runId),
    });
  }

  private queuePollMs(): number {
    return (
      this.positiveInt(this.env('FITMEET_SUBAGENT_WORKER_RESULT_POLL_MS')) ??
      500
    );
  }

  private queueWaitTimeoutMs(lane: WorkerLane): number {
    return (
      this.positiveInt(this.env('FITMEET_SUBAGENT_WORKER_RESULT_TIMEOUT_MS')) ??
      Math.max(lane.timeoutMs * 2, lane.timeoutMs + 10_000)
    );
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
