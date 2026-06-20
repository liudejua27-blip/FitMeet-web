import { SubagentWorkerQueueService } from './subagent-worker-queue.service';

type Row = {
  id: number;
  [key: string]: unknown;
};

class MemoryRepository<T extends Row> {
  rows: T[] = [];
  private nextId = 1;

  create(input: Partial<T>): T {
    return {
      id: Number(input.id ?? this.nextId++),
      createdAt: new Date(),
      updatedAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
      priority: 0,
      ...input,
    } as unknown as T;
  }

  async save(input: T): Promise<T> {
    await Promise.resolve();
    const existing = this.rows.findIndex((row) => row.id === input.id);
    const saved = { ...input, updatedAt: new Date() } as T;
    if (existing >= 0) this.rows[existing] = saved;
    else this.rows.push(saved);
    return saved;
  }

  async findOne(input: {
    where?: Record<string, unknown>;
    order?: Record<string, 'ASC' | 'DESC'>;
  }): Promise<T | null> {
    await Promise.resolve();
    return this.sorted(this.matching(input.where), input.order)[0] ?? null;
  }

  async findOneByOrFail(where: Record<string, unknown>): Promise<T> {
    await Promise.resolve();
    const row = this.matching(where)[0];
    if (!row) throw new Error('row not found');
    return row;
  }

  async find(input: {
    where?: Record<string, unknown>;
    order?: Record<string, 'ASC' | 'DESC'>;
    take?: number;
  }): Promise<T[]> {
    await Promise.resolve();
    return this.sorted(this.matching(input.where), input.order).slice(
      0,
      input.take,
    );
  }

  async update(criteria: unknown, patch: Partial<T>): Promise<void> {
    await Promise.resolve();
    for (const row of this.rows) {
      if (this.matchesCriteria(row, criteria)) {
        Object.assign(row, patch, { updatedAt: new Date() });
      }
    }
  }

  createQueryBuilder() {
    let patch: Partial<T> = {};
    let id: number | null = null;
    let status: string | null = null;
    return {
      update: () => ({
        set: (nextPatch: Partial<T>) => {
          patch = nextPatch;
          return {
            where: (_sql: string, params: { id: number }) => {
              id = params.id;
              return {
                andWhere: (_andSql: string, more: { status: string }) => {
                  status = more.status;
                  return {
                    execute: async () => {
                      await Promise.resolve();
                      const row = this.rows.find(
                        (item) => item.id === id && item.status === status,
                      );
                      if (!row) return { affected: 0 };
                      Object.assign(row, patch, { updatedAt: new Date() });
                      return { affected: 1 };
                    },
                  };
                },
              };
            },
          };
        },
      }),
    };
  }

  private matching(where?: Record<string, unknown>): T[] {
    if (!where) return [...this.rows];
    return this.rows.filter((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    );
  }

  private sorted(rows: T[], order?: Record<string, 'ASC' | 'DESC'>): T[] {
    if (!order) return [...rows];
    return [...rows].sort((a, b) => {
      for (const [key, direction] of Object.entries(order)) {
        const left = a[key] as Date | number | string | undefined;
        const right = b[key] as Date | number | string | undefined;
        const leftValue = left instanceof Date ? left.getTime() : left;
        const rightValue = right instanceof Date ? right.getTime() : right;
        if (leftValue === rightValue) continue;
        const result =
          String(leftValue ?? '') > String(rightValue ?? '') ? 1 : -1;
        return direction === 'DESC' ? -result : result;
      }
      return 0;
    });
  }

  private matchesCriteria(row: T, criteria: unknown): boolean {
    if (typeof criteria === 'number') return row.id === criteria;
    if (!criteria || typeof criteria !== 'object') return false;
    const where = criteria as Record<string, unknown>;
    return Object.entries(where).every(([key, value]) => {
      if (key === 'lockedUntil' && value && typeof value === 'object') {
        const maybeDate = (value as { _value?: Date; value?: Date })._value;
        const threshold = maybeDate ?? (value as { value?: Date }).value;
        return (
          row.lockedUntil instanceof Date &&
          threshold instanceof Date &&
          row.lockedUntil < threshold
        );
      }
      return row[key] === value;
    });
  }
}

function createService() {
  const jobs = new MemoryRepository<Row>();
  const heartbeats = new MemoryRepository<Row>();
  const failures = new MemoryRepository<Row>();
  const service = new SubagentWorkerQueueService(
    jobs as never,
    heartbeats as never,
    failures as never,
  );
  return { service, jobs, heartbeats, failures };
}

describe('SubagentWorkerQueueService', () => {
  it('enqueues, claims, heartbeats, and completes worker jobs', async () => {
    const { service, jobs, heartbeats } = createService();
    const queued = await service.enqueue({
      agentName: 'Life Graph Agent',
      queueName: 'fitmeet.subagent.life-graph-agent',
      payload: { contract: 'test' },
      runId: 'run_1',
      traceId: 'trace_1',
      priority: 3,
    });

    const claimed = await service.claimNext({
      workerId: 'worker-a',
      queueNames: ['fitmeet.subagent.life-graph-agent'],
      timeoutMs: 5000,
    });

    expect(claimed?.id).toBe(queued.id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.lockedBy).toBe('worker-a');
    expect(jobs.rows[0].lockedUntil).toBeInstanceOf(Date);

    await service.heartbeat({
      workerId: 'worker-a',
      queueName: 'fitmeet.subagent.life-graph-agent',
      status: 'running',
      activeJobId: queued.id,
    });
    expect(heartbeats.rows).toHaveLength(1);

    const completed = await service.complete(queued.id, { ok: true });
    expect(completed.status).toBe('succeeded');
    expect(completed.result).toEqual({ ok: true });
    expect(completed.lockedBy).toBeNull();
  });

  it('retries failures and records final failure after max attempts', async () => {
    const { service, failures } = createService();
    const job = await service.enqueue({
      agentName: 'Social Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      payload: {},
      maxAttempts: 2,
    });
    await service.markRunning({
      jobId: job.id,
      workerId: 'worker-a',
      timeoutMs: 1000,
    });

    const retried = await service.fail({
      jobId: job.id,
      workerId: 'worker-a',
      error: new Error('temporary failure'),
    });
    expect(retried.status).toBe('queued');
    expect(retried.attempts).toBe(1);

    await service.markRunning({
      jobId: job.id,
      workerId: 'worker-a',
      timeoutMs: 1000,
    });
    const failed = await service.fail({
      jobId: job.id,
      workerId: 'worker-a',
      error: 'permanent failure',
    });
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(2);
    expect(failures.rows).toHaveLength(2);
  });

  it('does not requeue non-retryable worker failures', async () => {
    const { service, failures } = createService();
    const job = await service.enqueue({
      agentName: 'Social Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      payload: { malformed: true },
      maxAttempts: 3,
    });
    await service.markRunning({
      jobId: job.id,
      workerId: 'worker-a',
      timeoutMs: 1000,
    });

    const failed = await service.fail({
      jobId: job.id,
      workerId: 'worker-a',
      error: new Error('Unsupported subagent worker payload.'),
      retryable: false,
      context: { reason: 'malformed_payload' },
    });

    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe('Unsupported subagent worker payload.');
    expect(failures.rows).toEqual([
      expect.objectContaining({
        error: 'Unsupported subagent worker payload.',
        context: { reason: 'malformed_payload' },
      }),
    ]);
  });

  it('reclaims timed-out running jobs and cancels aborted waiters', async () => {
    const { service, jobs } = createService();
    const job = await service.enqueue({
      agentName: 'Meet Loop Agent',
      queueName: 'fitmeet.subagent.meet-loop-agent',
      payload: {},
    });
    await service.markRunning({
      jobId: job.id,
      workerId: 'worker-a',
      timeoutMs: 1000,
    });
    jobs.rows[0].lockedUntil = new Date(Date.now() - 1000);

    await service.reclaimTimedOutJobs();
    expect(jobs.rows[0].status).toBe('queued');

    const controller = new AbortController();
    controller.abort();
    const waiter = service.waitForCompletion(job.id, {
      timeoutMs: 5000,
      pollMs: 50,
      signal: controller.signal,
    });
    await expect(waiter).rejects.toThrow('aborted');
    expect(jobs.rows[0].status).toBe('cancelled');
    expect(jobs.rows[0].lastError).toBe('cancelled');
  });

  it('cancels jobs when result waiting times out', async () => {
    const { service, jobs } = createService();
    const job = await service.enqueue({
      agentName: 'Social Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      payload: {},
    });

    await expect(
      service.waitForCompletion(job.id, {
        timeoutMs: 2,
        pollMs: 1,
      }),
    ).rejects.toThrow(`Subagent worker job ${job.id} timed out`);

    expect(jobs.rows[0].status).toBe('cancelled');
    expect(jobs.rows[0].lastError).toBe('cancelled');
  });

  it('does not let late worker complete or fail override a cancelled job', async () => {
    const { service, jobs, failures } = createService();
    const job = await service.enqueue({
      agentName: 'Meet Loop Agent',
      queueName: 'fitmeet.subagent.meet-loop-agent',
      payload: {},
    });
    await service.markRunning({
      jobId: job.id,
      workerId: 'worker-late',
      timeoutMs: 1000,
    });
    await service.cancel(job.id);

    const completed = await service.complete(job.id, { ok: true });
    expect(completed.status).toBe('cancelled');
    expect(jobs.rows[0].result).toBeUndefined();

    const failed = await service.fail({
      jobId: job.id,
      workerId: 'worker-late',
      error: new Error('late failure'),
    });
    expect(failed.status).toBe('cancelled');
    expect(jobs.rows[0].lastError).toBe('cancelled');
    expect(failures.rows).toHaveLength(0);
  });
});
