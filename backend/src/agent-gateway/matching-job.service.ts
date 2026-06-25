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
  metadata?: Record<string, unknown>;
};

type SqlQueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown>;
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
           "sourceVersion", "idempotencyKey", "status", "attemptCount",
           "candidateCount", "errorMessage", "result", "metadata",
           "nextRunAt", "startedAt", "completedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0, '', '{}'::jsonb,
           $7::jsonb, $8, NULL, NULL, $8, $8)
         ON CONFLICT ("idempotencyKey") DO NOTHING
         RETURNING *`,
        [
          publicIntentId,
          input.ownerUserId ?? null,
          input.linkedSocialRequestId ?? null,
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

  async markCompleted(
    jobId: number,
    candidateCount: number,
    result: Record<string, unknown> = {},
  ) {
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

  async markFailed(jobId: number, error: unknown, retryable = true) {
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
    if (!Array.isArray(rows)) return [];
    return rows as T[];
  }
}
