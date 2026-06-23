import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import {
  FitMeetSubagentWorkerService,
  isNonRetryableSubagentWorkerJobError,
} from './fitmeet-subagent-worker.service';
import type { FitMeetSubagentWorkerJobContext } from './fitmeet-subagent-worker-runtime.service';
import { FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS } from './fitmeet-subagent-worker-runtime.service';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
  selectSocialAgentConfiguredModel,
  type SocialAgentModelUseCase,
} from './social-agent-model-router.service';
import type { SubagentWorkerJob } from './entities/agent-l5-runtime.entity';
import { SubagentWorkerQueueService } from './subagent-worker-queue.service';
import { workerRuntimeFromSubagentPayload } from './fitmeet-subagent-worker-command.contract';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const queue = app.get(SubagentWorkerQueueService);
  const worker = app.get(FitMeetSubagentWorkerService);
  const workerId =
    process.env.FITMEET_SUBAGENT_WORKER_ID ??
    `subagent-worker:${process.pid}:${Date.now().toString(36)}`;
  const pollMs = positiveInt(process.env.FITMEET_SUBAGENT_WORKER_POLL_MS, 2000);
  const timeoutMs = positiveInt(
    process.env.FITMEET_SUBAGENT_WORKER_TIMEOUT_MS,
    FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS,
  );
  const heartbeatMs = positiveInt(
    process.env.FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS,
    Math.min(Math.max(Math.floor(pollMs * 2), 5000), 30000),
  );
  const concurrency = positiveInt(
    process.env.FITMEET_SUBAGENT_WORKER_CONCURRENCY,
    1,
  );
  const queueNames = (
    process.env.FITMEET_SUBAGENT_WORKER_QUEUE ??
    'fitmeet.subagent.agent-brain,fitmeet.subagent.life-graph-agent,fitmeet.subagent.match-agent'
  )
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const heartbeat = async (status: 'idle' | 'running' = 'idle') => {
    await queue.reclaimTimedOutJobs();
    await Promise.all(
      queueNames.map((queueName) =>
        queue.heartbeat({
          workerId,
          queueName,
          status,
          activeJobId: null,
          metadata: {
            mode: process.env.FITMEET_SUBAGENT_WORKER_MODE ?? 'db_queue',
            processId: process.pid,
            concurrency,
            heartbeatMs,
          },
        }),
      ),
    );
  };

  await heartbeat();
  const active = new Set<Promise<void>>();
  let stopping = false;
  let ticking = false;
  const tick = async () => {
    if (stopping || ticking) return;
    ticking = true;
    try {
      await queue.reclaimTimedOutJobs();
      while (!stopping && active.size < concurrency) {
        const job = await queue.claimNext({
          workerId,
          queueNames,
          timeoutMs,
        });
        if (!job) break;
        const run = processSubagentWorkerJob({
          queue,
          worker,
          workerId,
          timeoutMs,
          job,
        }).finally(() => active.delete(run));
        active.add(run);
      }
      if (active.size === 0) await heartbeat();
    } finally {
      ticking = false;
    }
  };
  await tick();
  const timer = setInterval(() => {
    void tick();
  }, pollMs);
  const heartbeatTimer = setInterval(() => {
    void heartbeat(active.size > 0 ? 'running' : 'idle');
  }, heartbeatMs);

  const shutdown = async () => {
    stopping = true;
    clearInterval(timer);
    clearInterval(heartbeatTimer);
    await Promise.allSettled(Array.from(active));
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

export async function processSubagentWorkerJob(input: {
  queue: SubagentWorkerQueueService;
  worker: FitMeetSubagentWorkerService;
  workerId: string;
  timeoutMs: number;
  job: SubagentWorkerJob;
}): Promise<void> {
  const cancellation = createWorkerJobCancellationWatcher({
    queue: input.queue,
    jobId: input.job.id,
    pollMs: positiveInt(
      process.env.FITMEET_SUBAGENT_WORKER_CANCEL_POLL_MS,
      Math.min(Math.max(Math.floor(input.timeoutMs / 10), 500), 2000),
    ),
  });
  const context = subagentWorkerContextForJob(
    input.job,
    input.workerId,
    input.timeoutMs,
    cancellation.signal,
  );
  await input.queue.heartbeat({
    workerId: input.workerId,
    queueName: input.job.queueName,
    status: 'running',
    activeJobId: input.job.id,
    metadata: {
      mode: 'db_queue',
      processId: process.pid,
      agent: input.job.agentName,
    },
  });
  try {
    const result = await input.worker.executeQueuedJob({
      job: input.job,
      context,
    });
    await input.queue.complete(
      input.job.id,
      result as unknown as Record<string, unknown>,
    );
    await input.queue.heartbeat({
      workerId: input.workerId,
      queueName: input.job.queueName,
      status: 'idle',
      activeJobId: null,
      metadata: {
        mode: 'db_queue',
        processId: process.pid,
        agent: input.job.agentName,
      },
    });
  } catch (error) {
    await input.queue.fail({
      jobId: input.job.id,
      workerId: input.workerId,
      error,
      retryable: !isNonRetryableSubagentWorkerJobError(error),
      context: {
        processId: process.pid,
        queueName: input.job.queueName,
      },
    });
    await input.queue.heartbeat({
      workerId: input.workerId,
      queueName: input.job.queueName,
      status: 'failed',
      activeJobId: null,
      metadata: {
        mode: 'db_queue',
        processId: process.pid,
        agent: input.job.agentName,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    cancellation.stop();
  }
}

export function subagentWorkerContextForJob(
  job: SubagentWorkerJob,
  workerId: string,
  fallbackTimeoutMs: number,
  signal?: AbortSignal | null,
): FitMeetSubagentWorkerJobContext {
  const runtime = workerRuntimeFromSubagentPayload(job.payload);
  const modelUseCase = modelUseCaseValue(runtime.modelUseCase);
  return {
    workerId,
    agent: job.agentName,
    mode: 'queue_worker_ready',
    queueName: job.queueName,
    timeoutMs: qualitySafeTimeoutValue(
      runtime.timeoutMs,
      fallbackTimeoutMs,
      modelUseCase,
    ),
    crashIsolation: true,
    scalable: true,
    modelUseCase,
    model: qualitySafeModelValue(runtime.model),
    runId: job.runId ?? `subagent-job:${job.id}`,
    signal: signal ?? null,
  };
}

export function createWorkerJobCancellationWatcher(input: {
  queue: SubagentWorkerQueueService;
  jobId: number;
  pollMs: number;
}): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  let stopped = false;
  let polling = false;
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error('Subagent worker job cancelled.'));
    }
  };
  const poll = async () => {
    if (stopped || polling || controller.signal.aborted) return;
    polling = true;
    try {
      const job = await input.queue.getJob(input.jobId);
      if (job.status === 'cancelled') abort();
    } catch {
      // Health/cancellation polling must not crash the worker process.
    } finally {
      polling = false;
    }
  };
  const timer = setInterval(
    () => {
      void poll();
    },
    Math.max(100, input.pollMs),
  );
  void poll();
  return {
    signal: controller.signal,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function positiveIntValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function qualitySafeTimeoutValue(
  value: unknown,
  fallback: number,
  useCase: SocialAgentModelUseCase,
): number {
  return Math.max(
    positiveIntValue(value, fallback),
    positiveIntValue(fallback, FITMEET_SUBAGENT_WORKER_DEFAULT_TIMEOUT_MS),
    qualityTimeoutFloor(useCase),
  );
}

function qualityTimeoutFloor(useCase: SocialAgentModelUseCase): number {
  if (useCase === 'casual_chat' || useCase === 'final_response') {
    return SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS;
  }
  if (useCase === 'planner') return SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS;
  return SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function qualitySafeModelValue(value: unknown): string {
  return (
    selectSocialAgentConfiguredModel(stringValue(value), {
      allowFast: false,
    }) ?? SOCIAL_AGENT_DEFAULT_REASONING_MODEL
  );
}

function modelUseCaseValue(value: unknown): SocialAgentModelUseCase {
  const text = stringValue(value);
  if (
    text === 'planner' ||
    text === 'candidate_summary' ||
    text === 'profile_extraction' ||
    text === 'safety_check' ||
    text === 'casual_chat' ||
    text === 'final_response' ||
    text === 'card_generation'
  ) {
    return text;
  }
  return 'planner';
}

if (require.main === module) {
  void main();
}
