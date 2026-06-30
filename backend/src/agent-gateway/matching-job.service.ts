import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';

type EnqueueMatchingJobInput = {
  publicIntentId: string;
  sourceVersion: string;
  idempotencyKey: string;
  ownerUserId?: number | null;
  linkedSocialRequestId?: number | null;
  parentJobId?: number | null;
  recoveryStrategyId?: string | null;
  metadata?: Record<string, unknown>;
};

type SqlQueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown>;
};

export type ClaimedMatchingJob = MatchingJob & {
  leaseOwner: string;
  leaseExpiresAt: Date;
};

@Injectable()
export class MatchingJobService {
  constructor(
    @InjectRepository(MatchingJob)
    private readonly repo: Repository<MatchingJob>,
  ) {}

  async enqueue(input: EnqueueMatchingJobInput) {
    const publicIntentId = this.requiredText(
      input.publicIntentId,
      'matching_job_public_intent_required',
    );
    const sourceVersion = this.requiredText(
      input.sourceVersion,
      'matching_job_source_version_required',
    );
    const idempotencyKey = this.requiredText(
      input.idempotencyKey,
      'matching_job_idempotency_key_required',
    );
    const metadata = input.metadata ?? {};
    const now = new Date();

    return this.repo.manager.transaction(async (manager) => {
      const inserted = await this.queryRows<MatchingJob>(
        manager,
        `INSERT INTO "matching_jobs"
          ("publicIntentId", "ownerUserId", "linkedSocialRequestId",
           "parentJobId", "recoveryStrategyId", "sourceVersion",
           "idempotencyKey", "status", "attemptCount",
           "candidateCount", "errorMessage", "result", "metadata",
           "nextRunAt", "startedAt", "completedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, '', '{}'::jsonb,
           $9::jsonb, $10, NULL, NULL, $10, $10)
         ON CONFLICT ("idempotencyKey") DO NOTHING
         RETURNING *`,
        [
          publicIntentId,
          input.ownerUserId ?? null,
          input.linkedSocialRequestId ?? null,
          input.parentJobId ?? null,
          this.text(input.recoveryStrategyId).slice(0, 40) || null,
          sourceVersion,
          idempotencyKey,
          MatchingJobStatus.Queued,
          JSON.stringify(metadata),
          now,
        ],
      );
      if (inserted[0]) return { job: inserted[0], reused: false };

      const existing = await this.queryRows<MatchingJob>(
        manager,
        `SELECT * FROM "matching_jobs" WHERE "idempotencyKey" = $1 FOR UPDATE`,
        [idempotencyKey],
      );
      const job = existing[0];
      if (!job) {
        throw new BadRequestException('matching_job_enqueue_failed');
      }
      if (
        job.publicIntentId !== publicIntentId ||
        job.sourceVersion !== sourceVersion
      ) {
        throw new BadRequestException('matching_job_idempotency_conflict');
      }
      return { job, reused: true };
    });
  }

  async claimDueJobs(input: {
    workerId: string;
    limit?: number;
    leaseMs?: number;
  }): Promise<ClaimedMatchingJob[]> {
    const workerId = this.requiredText(
      input.workerId,
      'matching_job_worker_id_required',
    );
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 10), 100));
    const leaseMs = Math.max(
      5_000,
      Math.min(Math.floor(input.leaseMs ?? 60_000), 15 * 60_000),
    );
    const leaseExpiresAt = new Date(Date.now() + leaseMs);
    const now = new Date();
    return this.repo.manager.transaction(async (manager) => {
      const rows = await this.queryRows<ClaimedMatchingJob>(
        manager,
        `WITH claimable AS (
           SELECT "id"
           FROM "matching_jobs"
           WHERE (
               "status" IN ($1, $2)
               AND ("nextRunAt" IS NULL OR "nextRunAt" <= $3)
             )
             OR (
               "status" = $4
               AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < $3)
             )
           ORDER BY
             CASE WHEN "status" = $4 THEN 0 ELSE 1 END,
             "nextRunAt" NULLS FIRST,
             "createdAt" ASC,
             "id" ASC
           LIMIT $5
           FOR UPDATE SKIP LOCKED
         )
         UPDATE "matching_jobs" job
         SET "status" = $4,
             "attemptCount" = job."attemptCount" + 1,
             "leaseOwner" = $6,
             "leaseExpiresAt" = $7,
             "lastHeartbeatAt" = $3,
             "startedAt" = COALESCE(job."startedAt", $3),
             "updatedAt" = $3,
             "errorMessage" = '',
             "metadata" = COALESCE(job."metadata", '{}'::jsonb) || $8::jsonb
         FROM claimable
         WHERE job."id" = claimable."id"
         RETURNING job.*`,
        [
          MatchingJobStatus.Queued,
          MatchingJobStatus.FailedRetryable,
          now,
          MatchingJobStatus.Running,
          limit,
          workerId,
          leaseExpiresAt,
          JSON.stringify({
            leaseOwner: workerId,
            leaseStartedAt: now.toISOString(),
            leaseExpiresAt: leaseExpiresAt.toISOString(),
          }),
        ],
      );
      return rows;
    });
  }

  async extendLease(input: {
    jobId: number;
    leaseOwner: string;
    leaseMs?: number;
  }): Promise<MatchingJob> {
    const leaseOwner = this.requiredText(
      input.leaseOwner,
      'matching_job_lease_owner_required',
    );
    const leaseMs = Math.max(
      5_000,
      Math.min(Math.floor(input.leaseMs ?? 60_000), 15 * 60_000),
    );
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + leaseMs);
    const rows = await this.queryRows<MatchingJob>(
      this.repo.manager,
      `UPDATE "matching_jobs"
       SET "leaseExpiresAt" = $1,
           "lastHeartbeatAt" = $2,
           "updatedAt" = $2,
           "metadata" = COALESCE("metadata", '{}'::jsonb) || $3::jsonb
       WHERE "id" = $4
         AND "status" = $5
         AND "leaseOwner" = $6
       RETURNING *`,
      [
        leaseExpiresAt,
        now,
        JSON.stringify({
          leaseOwner,
          leaseExtendedAt: now.toISOString(),
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        }),
        input.jobId,
        MatchingJobStatus.Running,
        leaseOwner,
      ],
    );
    const claimed = rows[0];
    if (!claimed) throw new BadRequestException('matching_job_lease_lost');
    return claimed;
  }

  async markCompleted(
    jobId: number,
    candidateCount: number,
    result: Record<string, unknown> = {},
    leaseOwner?: string,
  ) {
    if (leaseOwner) {
      const count = Math.max(0, Math.floor(Number(candidateCount) || 0));
      const completedAt = new Date();
      const status =
        count > 0
          ? MatchingJobStatus.CandidatesReady
          : MatchingJobStatus.NoCandidates;
      const rows = await this.queryRows<MatchingJob>(
        this.repo.manager,
        `UPDATE "matching_jobs"
         SET "status" = $1,
             "candidateCount" = $2,
             "result" = $3::jsonb,
             "errorMessage" = '',
             "nextRunAt" = NULL,
             "leaseOwner" = NULL,
             "leaseExpiresAt" = NULL,
             "lastHeartbeatAt" = NULL,
             "completedAt" = $4::timestamptz,
             "updatedAt" = $4::timestamptz
         WHERE "id" = $5
           AND "status" = $6
           AND "leaseOwner" = $7
         RETURNING *`,
        [
          status,
          count,
          JSON.stringify(result),
          completedAt.toISOString(),
          jobId,
          MatchingJobStatus.Running,
          leaseOwner,
        ],
      );
      const claimed = rows[0];
      if (!claimed) throw new BadRequestException('matching_job_lease_lost');
      return claimed;
    }
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new BadRequestException('matching_job_not_found');
    const count = Math.max(0, Math.floor(Number(candidateCount) || 0));
    job.candidateCount = count;
    job.result = result;
    job.status =
      count > 0
        ? MatchingJobStatus.CandidatesReady
        : MatchingJobStatus.NoCandidates;
    job.completedAt = new Date();
    job.errorMessage = '';
    job.nextRunAt = null;
    return this.repo.save(job);
  }

  async markFailed(
    jobId: number,
    error: unknown,
    retryable = true,
    leaseOwner?: string,
  ) {
    if (leaseOwner) {
      const now = new Date();
      const retryAt = retryable ? new Date(Date.now() + 60_000) : null;
      const status = retryable
        ? MatchingJobStatus.FailedRetryable
        : MatchingJobStatus.FailedFinal;
      const rows = await this.queryRows<MatchingJob>(
        this.repo.manager,
        `UPDATE "matching_jobs"
         SET "status" = $1,
             "errorMessage" = $2,
             "nextRunAt" = $3::timestamptz,
             "leaseOwner" = NULL,
             "leaseExpiresAt" = NULL,
             "lastHeartbeatAt" = NULL,
             "completedAt" = CASE WHEN $4::boolean THEN NULL ELSE $5::timestamptz END,
             "updatedAt" = $5::timestamptz,
             "metadata" = COALESCE("metadata", '{}'::jsonb) || $6::jsonb
         WHERE "id" = $7
           AND "status" = $8
           AND "leaseOwner" = $9
         RETURNING *`,
        [
          status,
          this.errorMessage(error),
          retryAt ? retryAt.toISOString() : null,
          retryable,
          now.toISOString(),
          JSON.stringify({
            failedAt: now.toISOString(),
            retryable,
          }),
          jobId,
          MatchingJobStatus.Running,
          leaseOwner,
        ],
      );
      const claimed = rows[0];
      if (!claimed) throw new BadRequestException('matching_job_lease_lost');
      return claimed;
    }
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) throw new BadRequestException('matching_job_not_found');
    job.status = retryable
      ? MatchingJobStatus.FailedRetryable
      : MatchingJobStatus.FailedFinal;
    job.errorMessage = this.errorMessage(error);
    job.nextRunAt = retryable
      ? new Date(Date.now() + Math.min(job.attemptCount + 1, 5) * 60_000)
      : null;
    job.completedAt = retryable ? null : new Date();
    return this.repo.save(job);
  }

  async cancelClaimed(jobId: number, leaseOwner: string, reason: string) {
    const now = new Date();
    const rows = await this.queryRows<MatchingJob>(
      this.repo.manager,
      `UPDATE "matching_jobs"
       SET "status" = $1,
           "errorMessage" = $2,
           "nextRunAt" = NULL,
           "leaseOwner" = NULL,
           "leaseExpiresAt" = NULL,
           "lastHeartbeatAt" = NULL,
           "completedAt" = $3::timestamptz,
           "updatedAt" = $3::timestamptz,
           "metadata" = COALESCE("metadata", '{}'::jsonb) || $4::jsonb
       WHERE "id" = $5
         AND "status" = $6
         AND "leaseOwner" = $7
       RETURNING *`,
      [
        MatchingJobStatus.Cancelled,
        this.errorMessage(reason),
        now.toISOString(),
        JSON.stringify({
          cancelledAt: now.toISOString(),
          cancelReason: reason,
        }),
        jobId,
        MatchingJobStatus.Running,
        leaseOwner,
      ],
    );
    const claimed = rows[0];
    if (!claimed) throw new BadRequestException('matching_job_lease_lost');
    return claimed;
  }

  private requiredText(value: unknown, errorCode: string): string {
    const text = this.text(value);
    if (!text) throw new BadRequestException(errorCode);
    return text;
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private errorMessage(error: unknown): string {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'matching_job_failed';
    return (message.trim() || 'matching_job_failed').slice(0, 500);
  }

  private async queryRows<T>(
    manager: SqlQueryManager,
    query: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    const rows: unknown = await manager.query(query, parameters);
    if (
      Array.isArray(rows) &&
      rows.length === 2 &&
      Array.isArray(rows[0]) &&
      typeof rows[1] === 'number'
    ) {
      return rows[0] as T[];
    }
    if (!Array.isArray(rows)) return [];
    return rows as T[];
  }
}
