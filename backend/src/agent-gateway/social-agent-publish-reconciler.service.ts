import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { MatchingJobService } from './matching-job.service';

const SOCIAL_REQUEST_ADVISORY_LOCK_NAMESPACE = 1_782_160_006;

type PublishReconcileContext = {
  publicIntentId: string | null;
  socialRequestId: number | null;
  sourceVersion: string | null;
  matchingJobId: number | null;
};

type PublishIntentValidation = {
  ok: boolean;
  reason: string;
  sourceVersion: string;
  socialRequestId: number | null;
  cancelMatching: boolean;
};

@Injectable()
export class SocialAgentPublishReconcilerService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @Optional()
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo?: Repository<PublicSocialIntent>,
    @Optional()
    @InjectRepository(UserSocialRequest)
    private readonly userSocialRequestRepo?: Repository<UserSocialRequest>,
    @Optional()
    private readonly matchingJobs?: MatchingJobService,
    @Optional()
    @InjectRepository(MatchingJob)
    private readonly matchingJobRepo?: Repository<MatchingJob>,
  ) {}

  async reconcileTask(
    ownerUserId: number,
    taskId: number,
    leaseOwner?: string,
  ) {
    this.assertRequiredPersistenceDependencies();
    return this.taskRepo.manager.transaction(async (manager) => {
      const task = await manager
        .getRepository(AgentTask)
        .createQueryBuilder('task')
        .setLock('pessimistic_write')
        .where('task.id = :taskId', { taskId })
        .andWhere('task.ownerUserId = :ownerUserId', { ownerUserId })
        .getOne();
      if (!task) {
        throw new NotFoundException('Agent task not found');
      }
      if (leaseOwner && !this.taskHasPublishReconcileLease(task, leaseOwner)) {
        return {
          status: 'lease_lost',
          taskId,
          publicIntentId: this.publishContextFromTask(task).publicIntentId,
        };
      }

      const context = this.publishContextFromTask(task);
      if (!context.publicIntentId) {
        await this.markNeedsRepair(
          task,
          'publish_reconcile_missing_public_intent',
          manager,
        );
        return {
          status: 'needs_repair',
          taskId,
          publicIntentId: null,
        };
      }

      const intent = await manager
        .getRepository(PublicSocialIntent)
        .createQueryBuilder('intent')
        .setLock('pessimistic_write')
        .where('intent.id = :publicIntentId', {
          publicIntentId: context.publicIntentId,
        })
        .getOne();
      const lockSocialRequestId =
        context.socialRequestId ?? this.number(intent?.linkedSocialRequestId);
      if (lockSocialRequestId) {
        await this.lockSocialRequestAggregate(manager, lockSocialRequestId);
      }
      const validation = await this.validatePublicIntent({
        ownerUserId,
        context,
        intent,
        manager,
      });
      if (!validation.ok) {
        if (validation.cancelMatching) {
          await this.cancelErroneousMatchingJobs({
            ownerUserId,
            publicIntentId: context.publicIntentId,
            socialRequestId: context.socialRequestId,
            reason: validation.reason,
            manager,
          });
        }
        await this.markNeedsRepair(task, validation.reason, manager);
        return {
          status: 'needs_repair',
          taskId,
          publicIntentId: context.publicIntentId,
        };
      }

      const matchingJob = await this.ensureMatchingJobInTransaction(manager, {
        ownerUserId,
        taskId,
        publicIntentId: context.publicIntentId,
        socialRequestId:
          validation.socialRequestId ?? context.socialRequestId ?? null,
        sourceVersion: validation.sourceVersion,
        discoverHref: `/discover?publicIntentId=${encodeURIComponent(
          context.publicIntentId,
        )}`,
        publicIntentHref: `/public-intent/${encodeURIComponent(
          context.publicIntentId,
        )}`,
      });
      task.statusReason = 'publish_reconcile_public_intent_visible';
      task.result = {
        ...(task.result ?? {}),
        publishReconcile: {
          status: 'visible',
          publicIntentId: context.publicIntentId,
          sourceVersion: validation.sourceVersion,
          matchingJobId: matchingJob?.id ?? context.matchingJobId ?? null,
          checkedAt: new Date().toISOString(),
        },
      };
      await manager.getRepository(AgentTask).save(task);
      return {
        status: 'visible',
        taskId,
        publicIntentId: context.publicIntentId,
      };
    });
  }

  private async markNeedsRepair(
    task: AgentTask,
    reason: string,
    manager: EntityManager = this.taskRepo.manager,
  ) {
    task.status = AgentTaskStatus.AwaitingConfirmation;
    task.statusReason = reason;
    task.result = {
      ...(task.result ?? {}),
      publishReconcile: {
        status: 'needs_repair',
        reason,
        checkedAt: new Date().toISOString(),
      },
    };
    await manager.getRepository(AgentTask).save(task);
  }

  private publishContextFromTask(task: AgentTask): PublishReconcileContext {
    const result = this.record(task.result);
    const publish = this.record(result.publishSocialRequest);
    const chatRun = this.record(result.chatRun);
    const draft = this.record(result.activityDraft);
    return {
      publicIntentId:
        this.text(publish.publicIntentId) ??
        this.text(chatRun.publicIntentId) ??
        this.text(draft.publicIntentId),
      socialRequestId:
        this.number(publish.socialRequestId) ??
        this.number(chatRun.socialRequestId) ??
        this.number(draft.socialRequestId),
      sourceVersion:
        this.text(publish.sourceVersion) ??
        this.text(chatRun.sourceVersion) ??
        this.text(draft.sourceVersion),
      matchingJobId:
        this.number(this.record(publish.matchingJob).id) ??
        this.number(publish.matchingJobId) ??
        this.number(chatRun.matchingJobId) ??
        this.number(draft.matchingJobId),
    };
  }

  private async validatePublicIntent(input: {
    ownerUserId: number;
    context: PublishReconcileContext;
    intent: PublicSocialIntent | null;
    manager: EntityManager;
  }): Promise<PublishIntentValidation> {
    const { ownerUserId, context, intent, manager } = input;
    if (!intent) return this.invalid('publish_reconcile_readback_failed');
    if (intent.userId !== null && intent.userId !== ownerUserId) {
      return this.invalid('publish_reconcile_owner_mismatch', true);
    }
    const socialRequestId =
      this.number(intent.linkedSocialRequestId) ?? context.socialRequestId;
    if (
      context.socialRequestId &&
      intent.linkedSocialRequestId !== context.socialRequestId
    ) {
      return this.invalid('publish_reconcile_linked_request_mismatch', true);
    }
    const socialRequest = socialRequestId
      ? await manager
          .getRepository(UserSocialRequest)
          .createQueryBuilder('request')
          .setLock('pessimistic_write')
          .where('request.id = :socialRequestId', { socialRequestId })
          .getOne()
      : null;
    if (!socialRequest) {
      return this.invalid('publish_reconcile_missing_social_request');
    }
    if (socialRequest.userId !== ownerUserId) {
      return this.invalid(
        'publish_reconcile_social_request_owner_mismatch',
        true,
      );
    }
    if (this.isCancelled(intent, socialRequest)) {
      return this.invalid('publish_reconcile_cancelled_or_tombstoned', true);
    }
    if (this.isExpired(intent, socialRequest)) {
      return this.invalid('publish_reconcile_expired', true);
    }
    const sourceVersion = this.publicIntentSourceVersion(intent);
    if (!sourceVersion) {
      return this.invalid('publish_reconcile_missing_source_version');
    }
    if (context.sourceVersion && context.sourceVersion !== sourceVersion) {
      return this.invalid('publish_reconcile_source_version_mismatch', true);
    }
    const visible = await this.discoverQueryCanReadIntent(intent.id, manager);
    if (!visible) {
      return this.invalid('publish_reconcile_discover_query_failed');
    }
    return {
      ok: true,
      reason: 'publish_reconcile_public_intent_visible',
      sourceVersion,
      socialRequestId,
      cancelMatching: false,
    };
  }

  private invalid(
    reason: string,
    cancelMatching = false,
  ): PublishIntentValidation {
    return {
      ok: false,
      reason,
      sourceVersion: '',
      socialRequestId: null,
      cancelMatching,
    };
  }

  private async ensureMatchingJobInTransaction(
    manager: EntityManager,
    input: {
      ownerUserId: number;
      taskId: number;
      publicIntentId: string;
      socialRequestId: number | null;
      sourceVersion: string;
      discoverHref: string;
      publicIntentHref: string;
    },
  ): Promise<MatchingJob | null> {
    const metadata = {
      taskId: input.taskId,
      socialRequestId: input.socialRequestId,
      discoverHref: input.discoverHref,
      publicIntentHref: input.publicIntentHref,
      source: 'publish_reconciler',
    };
    const idempotencyKey = `matching-job:${input.publicIntentId}:${input.sourceVersion}`;
    const now = new Date();
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
        input.publicIntentId,
        input.ownerUserId,
        input.socialRequestId,
        input.sourceVersion,
        idempotencyKey,
        MatchingJobStatus.Queued,
        JSON.stringify(metadata),
        now,
      ],
    );
    if (inserted[0]) return inserted[0];
    const existing = await this.queryRows<MatchingJob>(
      manager,
      `SELECT *
       FROM "matching_jobs"
       WHERE "idempotencyKey" = $1
       FOR UPDATE`,
      [idempotencyKey],
    );
    return existing[0] ?? null;
  }

  private async cancelErroneousMatchingJobs(input: {
    ownerUserId: number;
    publicIntentId: string | null;
    socialRequestId: number | null;
    reason: string;
    manager?: EntityManager;
  }): Promise<void> {
    const manager = input.manager ?? this.matchingJobRepo!.manager;
    await manager.query(
      `UPDATE "matching_jobs"
       SET "status" = $1,
           "completedAt" = $2,
           "nextRunAt" = NULL,
           "leaseOwner" = NULL,
           "leaseExpiresAt" = NULL,
           "lastHeartbeatAt" = NULL,
           "errorMessage" = $3,
           "metadata" = COALESCE("metadata", '{}'::jsonb) || $4::jsonb,
           "updatedAt" = $2
       WHERE ("publicIntentId" = $5 OR "linkedSocialRequestId" = $6)
         AND ("ownerUserId" = $7 OR "ownerUserId" IS NULL)
         AND "status" IN ($8, $9)`,
      [
        MatchingJobStatus.Cancelled,
        new Date(),
        input.reason,
        JSON.stringify({
          cancelledBy: 'publish_reconciler',
          cancelReason: input.reason,
          cancelledAt: new Date().toISOString(),
        }),
        input.publicIntentId,
        input.socialRequestId,
        input.ownerUserId,
        MatchingJobStatus.Queued,
        MatchingJobStatus.Running,
      ],
    );
  }

  private async discoverQueryCanReadIntent(
    publicIntentId: string,
    manager: EntityManager = this.taskRepo.manager,
  ) {
    const intent = await manager
      .getRepository(PublicSocialIntent)
      .createQueryBuilder('intent')
      .where('intent.id = :publicIntentId', { publicIntentId })
      .andWhere('intent.mode = :mode', { mode: 'public' })
      .andWhere('intent.status IN (:...statuses)', {
        statuses: [
          SocialRequestStatus.Active,
          SocialRequestStatus.Searching,
          SocialRequestStatus.Matched,
        ],
      })
      .andWhere(`COALESCE(intent.metadata ->> 'tombstoned', 'false') <> 'true'`)
      .getOne();
    return Boolean(intent);
  }

  private assertRequiredPersistenceDependencies(): void {
    const missing: string[] = [];
    if (!this.publicIntentRepo) missing.push('public_social_intent_repo');
    if (!this.userSocialRequestRepo) missing.push('user_social_request_repo');
    if (!this.matchingJobs) missing.push('matching_job_service');
    if (!this.matchingJobRepo) missing.push('matching_job_repo');
    if (missing.length > 0) {
      throw new ServiceUnavailableException({
        code: 'publish_reconcile_persistence_unavailable',
        missing,
      });
    }
  }

  private async lockSocialRequestAggregate(
    manager: EntityManager,
    socialRequestId: number,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
      SOCIAL_REQUEST_ADVISORY_LOCK_NAMESPACE,
      socialRequestId,
    ]);
  }

  private taskHasPublishReconcileLease(
    task: AgentTask,
    leaseOwner: string,
  ): boolean {
    const publishReconcile = this.record(
      this.record(task.result).publishReconcile,
    );
    return (
      this.text(publishReconcile.status) === 'running' &&
      this.text(publishReconcile.leaseOwner) === leaseOwner
    );
  }

  private async queryRows<T>(
    manager: Pick<EntityManager, 'query'>,
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
    return Array.isArray(rows) ? (rows as T[]) : [];
  }

  private isCancelled(
    intent: PublicSocialIntent,
    request: UserSocialRequest,
  ): boolean {
    const intentMetadata = this.record(intent.metadata);
    const requestMetadata = this.record(request.metadata);
    return (
      intent.mode !== 'public' ||
      ![
        SocialRequestStatus.Active,
        SocialRequestStatus.Searching,
        SocialRequestStatus.Matched,
      ].includes(intent.status) ||
      intentMetadata.tombstoned === true ||
      this.text(intentMetadata.tombstoned) === 'true' ||
      this.text(intentMetadata.publishStatus) === 'dismissed' ||
      request.status === UserSocialRequestStatus.Cancelled ||
      request.visibility === SocialRequestVisibility.Private ||
      requestMetadata.dismissed === true ||
      this.text(requestMetadata.publishStatus) === 'dismissed'
    );
  }

  private isExpired(
    intent: PublicSocialIntent,
    request: UserSocialRequest,
  ): boolean {
    const metadataExpiresAt = this.text(this.record(intent.metadata).expiresAt);
    const dates = [
      request.expiresAt,
      metadataExpiresAt ? new Date(metadataExpiresAt) : null,
    ].filter((value): value is Date => value instanceof Date);
    return dates.some(
      (date) => !Number.isNaN(date.getTime()) && date.getTime() <= Date.now(),
    );
  }

  private publicIntentSourceVersion(intent: PublicSocialIntent): string {
    const metadataVersion = this.text(
      this.record(intent.metadata).sourceVersion,
    );
    if (metadataVersion) return metadataVersion.slice(0, 128);
    if (intent.updatedAt instanceof Date) return intent.updatedAt.toISOString();
    return '';
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string | null {
    const text =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value).trim()
          : '';
    return text || null;
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
