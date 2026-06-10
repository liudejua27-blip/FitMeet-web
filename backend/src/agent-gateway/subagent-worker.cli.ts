import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { FitMeetSubagentWorkerService } from './fitmeet-subagent-worker.service';
import type { FitMeetSubagentWorkerJobContext } from './fitmeet-subagent-worker-runtime.service';
import type { SocialAgentModelUseCase } from './social-agent-model-router.service';
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
    15000,
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
    'fitmeet.subagent.life-graph-agent,fitmeet.subagent.social-match-agent,fitmeet.subagent.meet-loop-agent,fitmeet.subagent.math-agent'
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
        const run = processJob({
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

async function processJob(input: {
  queue: SubagentWorkerQueueService;
  worker: FitMeetSubagentWorkerService;
  workerId: string;
  timeoutMs: number;
  job: SubagentWorkerJob;
}): Promise<void> {
  const context = workerContextForJob(
    input.job,
    input.workerId,
    input.timeoutMs,
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
  }
}

function workerContextForJob(
  job: SubagentWorkerJob,
  workerId: string,
  fallbackTimeoutMs: number,
): FitMeetSubagentWorkerJobContext {
  const runtime = workerRuntimeFromSubagentPayload(job.payload);
  return {
    workerId,
    agent: job.agentName,
    mode: 'queue_worker_ready',
    queueName: job.queueName,
    timeoutMs: positiveIntValue(runtime.timeoutMs, fallbackTimeoutMs),
    crashIsolation: true,
    scalable: true,
    modelUseCase: modelUseCaseValue(runtime.modelUseCase),
    model: stringValue(runtime.model) ?? 'deepseek-v4-flash',
    runId: job.runId ?? `subagent-job:${job.id}`,
    signal: null,
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

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
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

void main();
