import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import {
  SubagentWorkerFailure,
  SubagentWorkerHeartbeat,
  SubagentWorkerJob,
  type SubagentWorkerJobStatus,
} from './entities/agent-l5-runtime.entity';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';

@Injectable()
export class SubagentWorkerQueueService {
  constructor(
    @InjectRepository(SubagentWorkerJob)
    private readonly jobs: Repository<SubagentWorkerJob>,
    @InjectRepository(SubagentWorkerHeartbeat)
    private readonly heartbeats: Repository<SubagentWorkerHeartbeat>,
    @InjectRepository(SubagentWorkerFailure)
    private readonly failures: Repository<SubagentWorkerFailure>,
  ) {}

  enqueue(input: {
    agentName: FitMeetAlphaAgentName;
    queueName: string;
    payload: Record<string, unknown>;
    runId?: string | null;
    traceId?: string | null;
    priority?: number;
    maxAttempts?: number;
  }) {
    return this.jobs.save(
      this.jobs.create({
        agentName: input.agentName,
        queueName: input.queueName,
        payload: input.payload,
        runId: input.runId ?? null,
        traceId: input.traceId ?? input.runId ?? null,
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts ?? 3,
        status: 'queued',
      }),
    );
  }

  async claimNext(input: {
    workerId: string;
    queueNames: string[];
    timeoutMs: number;
  }): Promise<SubagentWorkerJob | null> {
    const queueNames = input.queueNames
      .map((item) => item.trim())
      .filter(Boolean);
    for (const queueName of queueNames) {
      const job = await this.jobs.findOne({
        where: { queueName, status: 'queued' },
        order: { priority: 'DESC', createdAt: 'ASC' },
      });
      if (!job) continue;
      const result = await this.jobs
        .createQueryBuilder()
        .update(SubagentWorkerJob)
        .set({
          status: 'running',
          lockedBy: input.workerId,
          lockedUntil: new Date(Date.now() + input.timeoutMs),
        })
        .where('id = :id', { id: job.id })
        .andWhere('status = :status', { status: 'queued' })
        .execute();
      if ((result.affected ?? 0) > 0) {
        return this.jobs.findOneByOrFail({ id: job.id });
      }
    }
    return null;
  }

  async markRunning(input: {
    jobId: number;
    workerId: string;
    timeoutMs: number;
  }) {
    await this.jobs.update(input.jobId, {
      status: 'running',
      lockedBy: input.workerId,
      lockedUntil: new Date(Date.now() + input.timeoutMs),
    });
    return this.jobs.findOneByOrFail({ id: input.jobId });
  }

  async complete(jobId: number, result: Record<string, unknown>) {
    const job = await this.jobs.findOneByOrFail({ id: jobId });
    if (job.status === 'cancelled') return job;
    await this.jobs.update(jobId, {
      status: 'succeeded',
      result: result as never,
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
    });
    return this.jobs.findOneByOrFail({ id: jobId });
  }

  async fail(input: {
    jobId: number;
    workerId?: string | null;
    error: unknown;
    context?: Record<string, unknown>;
    retryable?: boolean;
  }) {
    const job = await this.jobs.findOneByOrFail({ id: input.jobId });
    if (job.status === 'cancelled') return job;
    const error = this.errorMessage(input.error);
    const nextStatus: SubagentWorkerJobStatus =
      input.retryable === false || job.attempts + 1 >= job.maxAttempts
        ? 'failed'
        : 'queued';
    await this.failures.save(
      this.failures.create({
        jobId: job.id,
        agentName: job.agentName,
        queueName: job.queueName,
        workerId: input.workerId ?? job.lockedBy ?? null,
        error,
        context: input.context ?? {},
      }),
    );
    await this.jobs.update(job.id, {
      status: nextStatus,
      attempts: job.attempts + 1,
      lockedBy: null,
      lockedUntil: null,
      lastError: error,
    });
    return this.jobs.findOneByOrFail({ id: job.id });
  }

  async heartbeat(input: {
    workerId: string;
    queueName: string;
    status: 'idle' | 'running' | 'failed';
    activeJobId?: number | null;
    metadata?: Record<string, unknown>;
  }) {
    const existing = await this.heartbeats.findOne({
      where: { workerId: input.workerId, queueName: input.queueName },
    });
    const heartbeat = this.heartbeats.create({
      ...(existing ?? {}),
      workerId: input.workerId,
      queueName: input.queueName,
      status: input.status,
      activeJobId: input.activeJobId ?? null,
      metadata: input.metadata ?? {},
      lastSeenAt: new Date(),
    });
    return this.heartbeats.save(heartbeat);
  }

  async listJobs(input?: {
    status?: string | null;
    queueName?: string | null;
    limit?: number;
  }) {
    const where: Record<string, string> = {};
    if (input?.status) where.status = input.status;
    if (input?.queueName) where.queueName = input.queueName;
    return this.jobs.find({
      where,
      order: { createdAt: 'DESC' },
      take: this.limit(input?.limit),
    });
  }

  getJob(jobId: number) {
    return this.jobs.findOneByOrFail({ id: jobId });
  }

  listHeartbeats(limit?: number) {
    return this.heartbeats.find({
      order: { lastSeenAt: 'DESC' },
      take: this.limit(limit),
    });
  }

  listFailures(limit?: number) {
    return this.failures.find({
      order: { createdAt: 'DESC' },
      take: this.limit(limit),
    });
  }

  async requeue(jobId: number) {
    await this.jobs.update(jobId, {
      status: 'queued',
      lockedBy: null,
      lockedUntil: null,
      lastError: null,
    });
    return this.jobs.findOneByOrFail({ id: jobId });
  }

  async cancel(jobId: number) {
    await this.jobs.update(jobId, {
      status: 'cancelled',
      lockedBy: null,
      lockedUntil: null,
      lastError: 'cancelled',
    });
    return this.jobs.findOneByOrFail({ id: jobId });
  }

  async reclaimTimedOutJobs() {
    await this.jobs.update(
      { status: 'running', lockedUntil: LessThan(new Date()) },
      { status: 'queued', lockedBy: null, lockedUntil: null },
    );
  }

  async waitForCompletion(
    jobId: number,
    input: {
      timeoutMs: number;
      pollMs: number;
      signal?: AbortSignal | null;
    },
  ): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= input.timeoutMs) {
      if (input.signal?.aborted) {
        await this.cancel(jobId);
        throw new Error('Subagent worker job aborted while queued.');
      }
      const job = await this.jobs.findOneByOrFail({ id: jobId });
      if (job.status === 'succeeded') return job.result ?? {};
      if (job.status === 'failed') {
        throw new Error(job.lastError ?? 'Subagent worker job failed.');
      }
      if (job.status === 'cancelled') {
        throw new Error('Subagent worker job cancelled.');
      }
      await this.sleep(input.pollMs, input.signal ?? null);
    }
    await this.cancel(jobId);
    throw new Error(
      `Subagent worker job ${jobId} timed out waiting for result.`,
    );
  }

  private limit(value?: number) {
    if (!Number.isFinite(value) || !value || value <= 0) return 50;
    return Math.min(200, Math.trunc(value));
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      let timeout: NodeJS.Timeout | null = null;
      let onAbort: (() => void) | null = null;
      const done = () => {
        if (timeout) clearTimeout(timeout);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        resolve();
      };
      onAbort = done;
      timeout = setTimeout(done, Math.max(0, ms));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
