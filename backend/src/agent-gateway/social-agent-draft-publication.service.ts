import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import {
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import {
  appendShortTermMemoryItem,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { toSocialAgentPublishDto } from './social-agent-chat-result.presenter';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';
import { assertSocialAgentOpportunityPublishable } from './social-agent-opportunity-production-guard';
import { MatchingJobService } from './matching-job.service';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';

type DismissDraftContext = {
  action: string;
  cardId: string;
  existingDraft: Record<string, unknown>;
  publicIntentId: string | null;
  socialRequestId: number | null;
};

type DismissPersistenceResult = {
  cancelledMatchingJobIds: number[];
  publicIntentIds: string[];
  publicIntentsTombstoned: number;
  socialRequestDismissed: boolean;
  socialRequestId: number | null;
};

const SOCIAL_REQUEST_ADVISORY_LOCK_NAMESPACE = 1_782_160_006;

@Injectable()
export class SocialAgentDraftPublicationService {
  private readonly logger = new Logger(SocialAgentDraftPublicationService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly executor: SocialAgentToolExecutorService,
    @Optional()
    private readonly longTermMemory?: SocialAgentLongTermMemoryService,
    @Optional()
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo?: Repository<PublicSocialIntent>,
    @Optional()
    private readonly sideEffectLedger?: AgentSideEffectLedgerService,
    @Optional()
    private readonly matchingJobs?: MatchingJobService,
    @Optional()
    @InjectRepository(UserSocialRequest)
    private readonly userSocialRequestRepo?: Repository<UserSocialRequest>,
    @Optional()
    @InjectRepository(MatchingJob)
    private readonly matchingJobRepo?: Repository<MatchingJob>,
  ) {}

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): Promise<Record<string, unknown>> {
    this.assertRequiredPersistenceDependencies();
    const socialRequestId = await this.resolvePublishSocialRequestId(
      ownerUserId,
      taskId,
      draft,
    );
    const idempotencyKey = this.publishIdempotencyKey(taskId, {
      ...draft,
      socialRequestId,
    });
    const { result, reused } = await this.sideEffectLedger!.run(
      {
        ownerUserId,
        agentTaskId: taskId,
        actionType: 'publish_social_request',
        idempotencyKey,
        resourceType: 'social_request',
        resourceId: socialRequestId,
        metadata: {
          source: 'social_agent_draft_publication',
          socialRequestId,
        },
        request: {
          socialRequestId,
          city: draft.city ?? null,
          activityType: draft.activityType ?? null,
          title: draft.title ?? null,
          timeStart: draft.timeStart ?? null,
          timeEnd: draft.timeEnd ?? null,
          lat: draft.lat ?? null,
          lng: draft.lng ?? null,
          radiusKm: draft.radiusKm ?? null,
          safetyRequirement: draft.safetyRequirement ?? null,
        },
      },
      () => this.publishDraftOnce(ownerUserId, taskId, draft, socialRequestId),
    );
    if (reused) {
      this.logger.log({
        event: 'social_agent.publish.reused_side_effect',
        taskId,
        idempotencyKey,
        socialRequestId,
      });
    }
    return result;
  }

  async dismissDraft(
    ownerUserId: number,
    taskId: number,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    this.assertRequiredPersistenceDependencies();
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const context = this.buildDismissDraftContext(task, payload);
    const idempotencyKey = this.dismissIdempotencyKey(taskId, payload, context);
    const { result, reused } = await this.sideEffectLedger!.run(
      {
        ownerUserId,
        agentTaskId: taskId,
        actionType: 'dismiss_social_request_publish',
        idempotencyKey,
        resourceType: context.socialRequestId
          ? 'social_request'
          : context.publicIntentId
            ? 'public_social_intent'
            : 'agent_task',
        resourceId: context.socialRequestId ?? context.publicIntentId ?? taskId,
        metadata: {
          source: 'social_agent_draft_publication',
          action: context.action,
          socialRequestId: context.socialRequestId,
          publicIntentId: context.publicIntentId,
        },
        request: {
          action: context.action,
          cardId: context.cardId || null,
          socialRequestId: context.socialRequestId,
          publicIntentId: context.publicIntentId,
        },
      },
      () => this.dismissDraftOnce(ownerUserId, taskId, payload),
    );
    if (reused) {
      this.logger.log({
        event: 'social_agent.dismiss_publish.reused_side_effect',
        taskId,
        idempotencyKey,
        socialRequestId: context.socialRequestId,
        publicIntentId: context.publicIntentId,
      });
    }
    return result;
  }

  private async dismissDraftOnce(
    ownerUserId: number,
    taskId: number,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return this.dismissDraftWithTransaction(ownerUserId, taskId, payload);
  }

  private async dismissDraftWithTransaction(
    ownerUserId: number,
    taskId: number,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.taskRepo.manager.transaction(async (manager) => {
      const initialTask = await manager.getRepository(AgentTask).findOne({
        where: { id: taskId, ownerUserId },
      });
      if (!initialTask) {
        throw new NotFoundException(`Social agent task ${taskId} not found`);
      }
      const initialContext = this.buildDismissDraftContext(
        initialTask,
        payload,
      );
      const socialRequestId = await this.resolveDismissSocialRequestId(
        manager,
        ownerUserId,
        initialContext,
      );
      await this.lockSocialRequestAggregate(manager, socialRequestId);

      const task = await manager.getRepository(AgentTask).findOne({
        where: { id: taskId, ownerUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!task) {
        throw new NotFoundException(`Social agent task ${taskId} not found`);
      }
      const context = {
        ...this.buildDismissDraftContext(task, payload),
        socialRequestId,
      };
      const now = new Date().toISOString();
      const persistence = await this.persistDismissal(
        manager,
        ownerUserId,
        context,
        now,
      );
      this.applyDismissalToTask(task, payload, context, now, persistence);
      await manager.getRepository(AgentTask).save(task);
      await this.writeDismissEventInTransaction(
        manager,
        task,
        payload,
        context,
        persistence,
      );
      return this.dismissResponse(taskId, context, persistence);
    });
  }

  private buildDismissDraftContext(
    task: AgentTask,
    payload: Record<string, unknown>,
  ): DismissDraftContext {
    const result = this.record(task.result);
    const chatRun = this.record(result.chatRun);
    const activityDraft = this.record(result.activityDraft);
    const publishSocialRequest = this.record(result.publishSocialRequest);
    const memory = this.record(task.memory);
    const socialAgentChat = this.record(memory.socialAgentChat);
    const existingDraft = this.firstNonEmptyRecord(
      payload.socialRequestDraft,
      payload.draft,
      chatRun.socialRequestDraft,
      socialAgentChat.socialRequestDraft,
      activityDraft,
    );
    const socialRequestId = this.number(
      payload.socialRequestId ??
        payload.linkedSocialRequestId ??
        existingDraft.socialRequestId ??
        this.record(existingDraft.metadata).socialRequestId ??
        this.record(chatRun.socialRequestDraft).socialRequestId ??
        this.record(this.record(chatRun.socialRequestDraft).metadata)
          .socialRequestId ??
        this.record(socialAgentChat.socialRequestDraft).socialRequestId ??
        this.record(this.record(socialAgentChat.socialRequestDraft).metadata)
          .socialRequestId ??
        activityDraft.socialRequestId ??
        this.record(activityDraft.metadata).socialRequestId ??
        publishSocialRequest.socialRequestId ??
        chatRun.socialRequestId ??
        socialAgentChat.socialRequestId,
    );
    const publicIntentId =
      this.text(
        payload.publicIntentId ??
          existingDraft.publicIntentId ??
          publishSocialRequest.publicIntentId ??
          chatRun.publicIntentId ??
          socialAgentChat.publicIntentId,
      ) || null;
    return {
      action: cleanDisplayText(payload.action, 'social_intent.decline_publish'),
      cardId: this.text(
        payload.cardId ?? existingDraft.cardId ?? existingDraft.id,
      ),
      existingDraft,
      publicIntentId,
      socialRequestId,
    };
  }

  private async resolveDismissSocialRequestId(
    manager: EntityManager,
    ownerUserId: number,
    context: DismissDraftContext,
  ): Promise<number> {
    if (context.socialRequestId) {
      await this.assertOwnedSocialRequestExists(
        manager,
        ownerUserId,
        context.socialRequestId,
        '约练卡不存在或不属于当前用户，无法取消发布。',
      );
      return context.socialRequestId;
    }

    if (!context.publicIntentId) {
      throw new BadRequestException('缺少可取消的约练卡，无法取消发布。');
    }

    const intent = await manager
      .getRepository(PublicSocialIntent)
      .createQueryBuilder('intent')
      .where('intent.id = :publicIntentId', {
        publicIntentId: context.publicIntentId,
      })
      .getOne();
    if (!intent) {
      throw new BadRequestException(
        '公开约练卡不存在或不属于当前用户，无法取消发布。',
      );
    }
    await this.assertPublicIntentDismissalOwnership(
      manager,
      ownerUserId,
      intent,
    );
    const socialRequestId = this.number(intent.linkedSocialRequestId);
    if (!socialRequestId) {
      throw new BadRequestException(
        '无法证明公开约练卡属于当前用户，拒绝取消发布。',
      );
    }
    return socialRequestId;
  }

  private async assertPublicIntentDismissalOwnership(
    manager: EntityManager,
    ownerUserId: number,
    intent: PublicSocialIntent,
  ): Promise<void> {
    const linkedSocialRequestId = this.number(intent.linkedSocialRequestId);
    if (intent.userId !== null && intent.userId !== ownerUserId) {
      throw new BadRequestException(
        '公开约练卡不存在或不属于当前用户，无法取消发布。',
      );
    }
    if (!linkedSocialRequestId) {
      if (intent.userId === ownerUserId) return;
      throw new BadRequestException(
        '无法证明公开约练卡属于当前用户，拒绝取消发布。',
      );
    }
    await this.assertOwnedSocialRequestExists(
      manager,
      ownerUserId,
      linkedSocialRequestId,
      '公开约练卡关联的约练卡不属于当前用户，无法取消发布。',
    );
  }

  private async assertOwnedSocialRequestExists(
    manager: EntityManager,
    ownerUserId: number,
    socialRequestId: number,
    message: string,
  ): Promise<UserSocialRequest> {
    const request = await manager
      .getRepository(UserSocialRequest)
      .createQueryBuilder('request')
      .where('request.id = :socialRequestId', { socialRequestId })
      .andWhere('request.userId = :ownerUserId', { ownerUserId })
      .getOne();
    if (!request) {
      throw new BadRequestException(message);
    }
    return request;
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

  private async persistDismissal(
    manager: EntityManager,
    ownerUserId: number,
    context: DismissDraftContext,
    now: string,
  ): Promise<DismissPersistenceResult> {
    const publicIntents = await this.lockPublicIntentsForDismissal(
      manager,
      ownerUserId,
      context,
    );
    const publicIntentIds = publicIntents
      .map((intent) => this.text(intent.id))
      .filter(Boolean);
    const socialRequestId =
      context.socialRequestId ??
      this.number(publicIntents[0]?.linkedSocialRequestId);

    let socialRequestDismissed = false;
    if (socialRequestId) {
      const socialRequest = await manager
        .getRepository(UserSocialRequest)
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :socialRequestId', { socialRequestId })
        .andWhere('request.userId = :ownerUserId', { ownerUserId })
        .getOne();
      if (!socialRequest) {
        throw new BadRequestException(
          '约练卡不存在或不属于当前用户，无法取消发布。',
        );
      }
      socialRequest.status = UserSocialRequestStatus.Cancelled;
      socialRequest.visibility = SocialRequestVisibility.Private;
      socialRequest.agentAllowed = false;
      socialRequest.metadata = {
        ...(socialRequest.metadata ?? {}),
        dismissed: true,
        dismissedAt: now,
        dismissedBy: 'user',
        matchingStopped: true,
        publishStatus: 'dismissed',
        publicDiscoverPublishSkipped: true,
        visibility: 'hidden',
      };
      await manager.getRepository(UserSocialRequest).save(socialRequest);
      socialRequestDismissed = true;
    }

    for (const intent of publicIntents) {
      intent.status = SocialRequestStatus.Inactive;
      intent.candidateUserIds = [];
      intent.matchedCount = 0;
      intent.metadata = {
        ...(intent.metadata ?? {}),
        dismissed: true,
        matchingStopped: true,
        publishStatus: 'dismissed',
        tombstoned: true,
        tombstonedAt: now,
        tombstonedBy: ownerUserId,
        tombstoneReason: 'social_intent_publish_dismissed',
      };
      await manager.getRepository(PublicSocialIntent).save(intent);
    }

    const cancelledMatchingJobIds = await this.cancelMatchingJobsForDismissal(
      manager,
      {
        ownerUserId,
        publicIntentIds:
          publicIntentIds.length > 0
            ? publicIntentIds
            : context.publicIntentId
              ? [context.publicIntentId]
              : [],
        socialRequestId,
        now,
      },
    );

    return {
      cancelledMatchingJobIds,
      publicIntentIds,
      publicIntentsTombstoned: publicIntents.length,
      socialRequestDismissed,
      socialRequestId,
    };
  }

  private async lockPublicIntentsForDismissal(
    manager: EntityManager,
    ownerUserId: number,
    context: DismissDraftContext,
  ): Promise<PublicSocialIntent[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (context.publicIntentId) {
      conditions.push('intent.id = :publicIntentId');
      params.publicIntentId = context.publicIntentId;
    }
    if (context.socialRequestId) {
      conditions.push('intent.linkedSocialRequestId = :socialRequestId');
      params.socialRequestId = context.socialRequestId;
    }
    if (conditions.length === 0) return [];
    const intents = await manager
      .getRepository(PublicSocialIntent)
      .createQueryBuilder('intent')
      .setLock('pessimistic_write')
      .where(`(${conditions.join(' OR ')})`, params)
      .getMany();
    if (
      context.publicIntentId &&
      !intents.some((intent) => intent.id === context.publicIntentId)
    ) {
      throw new BadRequestException(
        '公开约练卡不存在或不属于当前用户，无法取消发布。',
      );
    }
    for (const intent of intents) {
      await this.assertPublicIntentDismissalOwnership(
        manager,
        ownerUserId,
        intent,
      );
    }
    return intents;
  }

  private async cancelMatchingJobsForDismissal(
    manager: EntityManager,
    input: {
      ownerUserId: number;
      publicIntentIds: string[];
      socialRequestId: number | null;
      now: string;
    },
  ): Promise<number[]> {
    if (!input.socialRequestId && input.publicIntentIds.length === 0) {
      return [];
    }
    const rows: unknown = await manager.query(
      `UPDATE "matching_jobs"
       SET "status" = $1,
           "completedAt" = $2,
           "nextRunAt" = NULL,
           "errorMessage" = $3,
           "metadata" = COALESCE("metadata", '{}'::jsonb) || $4::jsonb,
           "updatedAt" = $2
       WHERE (
           "linkedSocialRequestId" = $5
           OR "publicIntentId" = ANY($6::varchar[])
         )
         AND (
           "ownerUserId" = $7
           OR (
             "ownerUserId" IS NULL
             AND $5::int IS NOT NULL
             AND "linkedSocialRequestId" = $5
           )
         )
         AND "status" IN ($8, $9)
       RETURNING "id"`,
      [
        MatchingJobStatus.Cancelled,
        new Date(input.now),
        'cancelled_by_user',
        JSON.stringify({
          cancelledAt: input.now,
          cancelledBy: 'user',
          cancelReason: 'social_intent_publish_dismissed',
        }),
        input.socialRequestId,
        input.publicIntentIds,
        input.ownerUserId,
        MatchingJobStatus.Queued,
        MatchingJobStatus.Running,
      ],
    );
    if (!Array.isArray(rows)) return [];
    const ids: number[] = [];
    for (const row of rows) {
      const id = this.number(this.record(row).id);
      if (id) ids.push(id);
    }
    return ids;
  }

  private applyDismissalToTask(
    task: AgentTask,
    payload: Record<string, unknown>,
    context: DismissDraftContext,
    now: string,
    persistence: DismissPersistenceResult,
  ): void {
    const result = this.record(task.result);
    const chatRun = this.record(result.chatRun);
    const memory = this.record(task.memory);
    const socialAgentChat = this.record(memory.socialAgentChat);
    const socialRequestId =
      persistence.socialRequestId ?? context.socialRequestId;
    const publicIntentIds = persistence.publicIntentIds;
    const dismissedDraft = {
      ...context.existingDraft,
      ...(socialRequestId ? { socialRequestId } : {}),
      ...(context.publicIntentId
        ? { publicIntentId: context.publicIntentId }
        : {}),
      visibility: 'hidden',
      publishStatus: 'dismissed',
      dismissed: true,
      dismissedAt: now,
      dismissedBy: 'user',
      publicDiscoverPublishSkipped: true,
      matchingStopped: true,
    };

    task.status = AgentTaskStatus.Cancelled;
    task.statusReason = 'social_intent_publish_dismissed';
    task.completedAt = new Date(now);
    task.result = {
      ...result,
      chatRun: {
        ...chatRun,
        socialRequestDraft: null,
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        publishStatus: 'dismissed',
        publicDiscoverPublishSkipped: true,
        matchingStopped: true,
      },
      activityDraft: null,
      publishSocialRequest: {
        ...this.record(result.publishSocialRequest),
        ...(socialRequestId ? { socialRequestId } : {}),
        publicIntentIds,
        status: 'dismissed',
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        dismissedAt: now,
        dismissedBy: 'user',
        dismissedDraft: sanitizeForDisplay(dismissedDraft),
        cancelledMatchingJobIds: persistence.cancelledMatchingJobIds,
        publicIntentsTombstoned: persistence.publicIntentsTombstoned,
        socialRequestDismissed: persistence.socialRequestDismissed,
      },
    };
    task.memory = {
      ...memory,
      socialAgentChat: {
        ...socialAgentChat,
        socialRequestDraft: null,
        publishStatus: 'dismissed',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        publicDiscoverPublishSkipped: true,
        matchingStopped: true,
        updatedAt: now,
      },
    };
    rememberSocialAgentShortTerm(task, {
      socialRequestDraft: null,
      publishStatus: 'dismissed',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      publicDiscoverPublishSkipped: true,
      matchingStopped: true,
      hasSearched: false,
      lastSearchCandidateCount: 0,
      lastSearchEmptyReason: null,
      lastSearchNextStep: null,
    });
    transitionSocialAgentState(task, 'message_action', {
      objective: 'meet_loop',
      nextStep: '已取消发布，不会进入发现或继续匹配。',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'user_next_message',
      lastCompletedStep: 'social_intent_publish_dismissed',
    });
    void payload;
  }

  private async writeDismissEvent(
    task: AgentTask,
    payload: Record<string, unknown>,
    context: DismissDraftContext,
    persistence: DismissPersistenceResult,
  ) {
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      '用户取消发布约练卡',
      {
        ...((persistence.socialRequestId ?? context.socialRequestId)
          ? {
              socialRequestId:
                persistence.socialRequestId ?? context.socialRequestId,
            }
          : {}),
        ...(context.publicIntentId
          ? { publicIntentId: context.publicIntentId }
          : {}),
        action: cleanDisplayText(payload.action, context.action),
        status: 'dismissed',
        visibility: 'hidden',
        publicDiscoverPublishSkipped: true,
        matchingStopped: true,
        cancelledMatchingJobIds: persistence.cancelledMatchingJobIds,
        publicIntentIds: persistence.publicIntentIds,
        publicIntentsTombstoned: persistence.publicIntentsTombstoned,
        socialRequestDismissed: persistence.socialRequestDismissed,
      },
      AgentTaskEventActor.User,
    );
  }

  private async writeDismissEventInTransaction(
    manager: EntityManager,
    task: AgentTask,
    payload: Record<string, unknown>,
    context: DismissDraftContext,
    persistence: DismissPersistenceResult,
  ) {
    await manager.getRepository(AgentTaskEvent).save(
      manager.getRepository(AgentTaskEvent).create({
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        eventType: AgentTaskEventType.Note,
        actor: AgentTaskEventActor.User,
        summary: '用户取消发布约练卡',
        payload: sanitizeForDisplay({
          ...((persistence.socialRequestId ?? context.socialRequestId)
            ? {
                socialRequestId:
                  persistence.socialRequestId ?? context.socialRequestId,
              }
            : {}),
          ...(context.publicIntentId
            ? { publicIntentId: context.publicIntentId }
            : {}),
          action: cleanDisplayText(payload.action, context.action),
          status: 'dismissed',
          visibility: 'hidden',
          publicDiscoverPublishSkipped: true,
          matchingStopped: true,
          cancelledMatchingJobIds: persistence.cancelledMatchingJobIds,
          publicIntentIds: persistence.publicIntentIds,
          publicIntentsTombstoned: persistence.publicIntentsTombstoned,
          socialRequestDismissed: persistence.socialRequestDismissed,
        }) as Record<string, unknown>,
      }),
    );
  }

  private dismissResponse(
    taskId: number,
    context: DismissDraftContext,
    persistence: DismissPersistenceResult,
  ): Record<string, unknown> {
    return {
      success: true,
      taskId,
      socialRequestId: persistence.socialRequestId ?? context.socialRequestId,
      status: 'dismissed',
      visibility: 'hidden',
      publishStatus: 'dismissed',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      matchingStopped: true,
      cancelledMatchingJobIds: persistence.cancelledMatchingJobIds,
      publicIntentIds: persistence.publicIntentIds,
      publicIntentsTombstoned: persistence.publicIntentsTombstoned,
      socialRequestDismissed: persistence.socialRequestDismissed,
      message: '已取消发布，这张约练卡不会出现在发现页，也不会继续匹配。',
    };
  }

  private async publishDraftOnce(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
    socialRequestId: number,
  ): Promise<Record<string, unknown>> {
    assertSocialAgentOpportunityPublishable(draft);
    return this.taskRepo.manager.transaction(async (manager) => {
      await this.lockSocialRequestAggregate(manager, socialRequestId);
      await this.assertPublishRequestCanProceed(
        manager,
        ownerUserId,
        socialRequestId,
      );
      return this.publishDraftUnderAggregateLock(
        manager,
        ownerUserId,
        taskId,
        draft,
        socialRequestId,
      );
    });
  }

  private async publishDraftUnderAggregateLock(
    manager: EntityManager,
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
    expectedSocialRequestId: number,
  ): Promise<Record<string, unknown>> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const dto = toSocialAgentPublishDto(task.id, draft);
    const publishAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...dto,
        socialRequestId: expectedSocialRequestId,
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        metadata: {
          ...(dto.metadata ?? {}),
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    if (publishAction.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(publishAction.error?.message, '发布约练失败'),
      );
    }

    task = await this.assertTaskOwner(taskId, ownerUserId);
    const output = this.isRecord(publishAction.output)
      ? publishAction.output
      : {};
    const pendingApproval = this.pendingApprovalFromOutput(output);
    if (pendingApproval) {
      await this.writeEvent(
        task,
        AgentTaskEventType.ConfirmationRequested,
        '发布约练等待用户确认',
        {
          status: 'pending_approval',
          approvalId: pendingApproval.id,
          approval: pendingApproval,
          toolName: SocialAgentToolName.CreateSocialRequest,
          toolCallId: publishAction.id,
        },
      );
      this.rememberShortTermStep(
        task,
        'publish_social_request_approval',
        '发布约练等待用户确认',
        'awaiting_confirmation',
      );
      rememberSocialAgentShortTerm(task, {
        publishStatus: 'pending_approval',
        pendingPublishApprovalId: pendingApproval.id,
        pendingApprovals: [pendingApproval],
      });
      task.status = AgentTaskStatus.AwaitingConfirmation;
      task.statusReason = 'publish_social_request_requires_approval';
      task.result = {
        ...(task.result ?? {}),
        publishSocialRequest: {
          approvalId: pendingApproval.id,
          pendingApproval,
          status: 'pending_approval',
          synced: false,
          toolCallId: publishAction.id,
        },
      };
      await this.taskRepo.save(task);

      return {
        success: false,
        taskId,
        approvalId: pendingApproval.id,
        pendingApproval,
        status: 'pending_approval',
        taskStatus: task.status,
        synced: false,
        toolCallId: publishAction.id,
        message: '发布到发现前需要你确认，确认后才会公开约练卡。',
      };
    }

    const publishedSocialRequestId = this.number(
      output.socialRequestId ?? output.id ?? expectedSocialRequestId,
    );
    if (publishedSocialRequestId !== expectedSocialRequestId) {
      throw new BadRequestException('发布约练返回的 socialRequestId 不一致');
    }
    const publicIntent = this.isRecord(output.publicIntent)
      ? output.publicIntent
      : {};
    const publicIntentId =
      cleanDisplayText(output.publicIntentId ?? publicIntent.id, '') || null;
    if (!publicIntentId) {
      throw new BadRequestException('发布约练缺少 publicIntentId');
    }
    const publicIntentReadback = await this.readPublishedPublicIntent(
      publicIntentId,
      {
        ownerUserId,
        socialRequestId: expectedSocialRequestId,
        draft,
        publicIntent,
      },
    );
    await this.assertPublishRequestCanProceed(
      manager,
      ownerUserId,
      expectedSocialRequestId,
    );
    const sourceVersion = this.publicIntentSourceVersion(publicIntentReadback);
    const discoverHref = this.discoverHref(
      publicIntentId,
      expectedSocialRequestId,
    );
    const publicIntentHref = this.publicIntentHref(
      publicIntentId,
      expectedSocialRequestId,
    );
    const matchingJob = await this.enqueueMatchingJob({
      ownerUserId,
      taskId,
      socialRequestId: expectedSocialRequestId,
      publicIntentId,
      sourceVersion,
      discoverHref,
      publicIntentHref,
    });
    const socialRequest = this.isRecord(output.socialRequest)
      ? output.socialRequest
      : output;

    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      '用户确认发布约练',
      {
        socialRequestId: expectedSocialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        status: 'published',
        toolName: SocialAgentToolName.CreateSocialRequest,
        toolCallId: publishAction.id,
        matchingJobId: matchingJob.id,
        matchingJobStatus: matchingJob.status,
        sourceVersion,
      },
    );
    this.rememberShortTermStep(
      task,
      'publish_social_request',
      '用户确认发布约练',
      'done',
    );
    rememberSocialAgentShortTerm(task, {
      publishedSocialRequestId: expectedSocialRequestId,
      publicIntentId,
      discoverHref,
      publicIntentHref,
      socialRequestId: expectedSocialRequestId,
      publishStatus: 'published',
      matchingJobId: matchingJob.id,
      matchingJobStatus: matchingJob.status,
      sourceVersion,
    });
    const memory = this.record(task.memory);
    const socialAgentChat = this.record(memory.socialAgentChat);
    const result = this.record(task.result);
    const chatRun = this.record(result.chatRun);
    const activityDraft = this.record(result.activityDraft);
    const socialRequestDraft = this.firstNonEmptyRecord(
      chatRun.socialRequestDraft,
      socialAgentChat.socialRequestDraft,
    );
    const publishedAt = new Date().toISOString();
    task.memory = {
      ...memory,
      socialAgentChat: {
        ...socialAgentChat,
        socialRequestDraft:
          Object.keys(socialRequestDraft).length > 0
            ? {
                ...socialRequestDraft,
                socialRequestId: expectedSocialRequestId,
                publicIntentId,
                discoverHref,
                publicIntentHref,
                publishStatus: 'published',
                visibility: 'public',
                matchingJobId: matchingJob.id,
                matchingJobStatus: matchingJob.status,
                sourceVersion,
                publishedAt,
              }
            : socialAgentChat.socialRequestDraft,
        socialRequestId: expectedSocialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        publishStatus: 'published',
        matchingJobId: matchingJob.id,
        matchingJobStatus: matchingJob.status,
        sourceVersion,
        updatedAt: publishedAt,
      },
    };
    task.status = AgentTaskStatus.Succeeded;
    task.statusReason = 'social_request_published_and_synced';
    task.completedAt = new Date();
    task.result = {
      ...result,
      chatRun: {
        ...chatRun,
        socialRequestDraft:
          Object.keys(socialRequestDraft).length > 0
            ? {
                ...socialRequestDraft,
                socialRequestId: expectedSocialRequestId,
                publicIntentId,
                discoverHref,
                publicIntentHref,
                publishStatus: 'published',
                visibility: 'public',
                matchingJobId: matchingJob.id,
                matchingJobStatus: matchingJob.status,
                sourceVersion,
                publishedAt,
              }
            : chatRun.socialRequestDraft,
        socialRequestId: expectedSocialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        publishStatus: 'published',
        matchingJobId: matchingJob.id,
        matchingJobStatus: matchingJob.status,
        sourceVersion,
      },
      activityDraft: {
        ...activityDraft,
        socialRequestId: expectedSocialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        publishStatus: 'published',
        visibility: 'public',
        autoPublished: true,
        matchingJobId: matchingJob.id,
        matchingJobStatus: matchingJob.status,
        sourceVersion,
        publishedAt,
      },
      publishSocialRequest: {
        socialRequestId: expectedSocialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        status: 'published',
        synced: true,
        toolCallId: publishAction.id,
        matchingJob: this.serializeMatchingJob(matchingJob),
        sourceVersion,
      },
    };
    transitionSocialAgentState(task, 'message_action', {
      objective: 'meet_loop',
      nextStep: 'Discover 已可见，已创建候选匹配任务。',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'matching_job',
      lastCompletedStep: 'published_to_discover',
    });
    await this.taskRepo.save(task);
    void this.longTermMemory?.summarizeTask(task).catch(() => undefined);

    return {
      success: true,
      taskId,
      socialRequestId: expectedSocialRequestId,
      publicIntentId,
      discoverHref,
      publicIntentHref,
      status: 'published',
      taskStatus: task.status,
      synced: true,
      toolCallId: publishAction.id,
      socialRequest: sanitizeForDisplay(socialRequest),
      matchingJob: this.serializeMatchingJob(matchingJob),
      sourceVersion,
      publicIntent: publicIntentReadback
        ? sanitizeForDisplay({
            id: publicIntentReadback.id,
            status: publicIntentReadback.status,
            mode: publicIntentReadback.mode,
            title: publicIntentReadback.title,
            sourceVersion,
          })
        : undefined,
    };
  }

  private async enqueueMatchingJob(input: {
    ownerUserId: number;
    taskId: number;
    socialRequestId: number;
    publicIntentId: string;
    sourceVersion: string;
    discoverHref: string;
    publicIntentHref: string;
  }) {
    if (!this.matchingJobs) {
      throw new BadRequestException('发布约练缺少候选匹配任务队列能力');
    }
    const { job } = await this.matchingJobs.enqueue({
      ownerUserId: input.ownerUserId,
      linkedSocialRequestId: input.socialRequestId,
      publicIntentId: input.publicIntentId,
      sourceVersion: input.sourceVersion,
      idempotencyKey: `matching-job:${input.publicIntentId}:${input.sourceVersion}`,
      metadata: {
        taskId: input.taskId,
        socialRequestId: input.socialRequestId,
        discoverHref: input.discoverHref,
        publicIntentHref: input.publicIntentHref,
        source: 'publish_to_discover',
      },
    });
    return job;
  }

  private serializeMatchingJob(job: {
    id: number;
    status: string;
    publicIntentId: string;
    sourceVersion: string;
    candidateCount: number;
  }) {
    return {
      id: job.id,
      status: job.status,
      publicIntentId: job.publicIntentId,
      sourceVersion: job.sourceVersion,
      candidateCount: job.candidateCount,
    };
  }

  private publishIdempotencyKey(
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): string {
    const explicit = cleanDisplayText(
      draft.metadata?.idempotencyKey ??
        (draft as { idempotencyKey?: unknown }).idempotencyKey,
      '',
    );
    if (explicit) return explicit;
    const socialRequestId = this.number(
      draft.socialRequestId ?? draft.metadata?.socialRequestId,
    );
    if (socialRequestId)
      return `publish-social-request:${taskId}:${socialRequestId}`;
    const fingerprint = [
      draft.title,
      draft.city,
      (draft as { locationName?: unknown }).locationName,
      (draft as { timePreference?: unknown }).timePreference,
      draft.type,
    ]
      .map((value) =>
        cleanDisplayText(value, '')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .slice(0, 40),
      )
      .filter(Boolean)
      .join(':');
    return `publish-social-request:${taskId}:${fingerprint || 'draft'}`;
  }

  private dismissIdempotencyKey(
    taskId: number,
    payload: Record<string, unknown>,
    context: DismissDraftContext,
  ): string {
    const explicit = cleanDisplayText(
      payload.idempotencyKey ??
        payload.clientActionId ??
        this.record(payload.runtime).idempotencyKey,
      '',
    );
    if (explicit) return explicit;
    const target =
      (context.socialRequestId
        ? `social-request:${context.socialRequestId}`
        : '') ||
      (context.publicIntentId
        ? `public-intent:${context.publicIntentId}`
        : '') ||
      (context.cardId ? `card:${context.cardId}` : '') ||
      'current-draft';
    return `dismiss-social-request:${taskId}:${this.stableKeySegment(target)}`;
  }

  private stableKeySegment(value: unknown): string {
    return (
      cleanDisplayText(value, 'current-draft')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9:_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120) || 'current-draft'
    );
  }

  private assertRequiredPersistenceDependencies(): void {
    const missing: string[] = [];
    if (!this.sideEffectLedger) missing.push('side_effect_ledger');
    if (!this.userSocialRequestRepo) missing.push('user_social_request_repo');
    if (!this.publicIntentRepo) missing.push('public_social_intent_repo');
    if (!this.matchingJobs) missing.push('matching_job_service');
    if (!this.matchingJobRepo) missing.push('matching_job_repo');
    if (typeof this.taskRepo.manager?.transaction !== 'function') {
      missing.push('database_transaction');
    }
    if (missing.length === 0) return;
    throw new ServiceUnavailableException(
      `Agent publish persistence unavailable: ${missing.join(', ')}`,
    );
  }

  private requireSocialRequestId(value: unknown, message: string): number {
    const id = this.number(value);
    if (!id) throw new BadRequestException(message);
    return id;
  }

  private async resolvePublishSocialRequestId(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): Promise<number> {
    const direct = this.number(
      draft.socialRequestId ?? draft.metadata?.socialRequestId,
    );
    if (direct) return direct;
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const context = this.buildDismissDraftContext(
      task,
      draft as unknown as Record<string, unknown>,
    );
    return this.requireSocialRequestId(
      context.socialRequestId,
      '发布约练缺少 socialRequestId',
    );
  }

  private async assertPublishRequestCanProceed(
    manager: EntityManager,
    ownerUserId: number,
    socialRequestId: number,
  ): Promise<UserSocialRequest> {
    const request = await manager
      .getRepository(UserSocialRequest)
      .createQueryBuilder('request')
      .where('request.id = :socialRequestId', { socialRequestId })
      .andWhere('request.userId = :ownerUserId', { ownerUserId })
      .getOne();
    if (!request) {
      throw new BadRequestException('约练卡不存在或不属于当前用户，无法发布。');
    }
    const metadata = this.record(request.metadata);
    if (
      request.status === UserSocialRequestStatus.Cancelled ||
      metadata.dismissed === true ||
      this.text(metadata.publishStatus) === 'dismissed'
    ) {
      throw new BadRequestException('这张约练卡已取消发布，不能再次发布。');
    }
    return request;
  }

  private async readPublishedPublicIntent(
    publicIntentId: string,
    expected: {
      ownerUserId: number;
      socialRequestId: number;
      draft: CreateSocialRequestDto & { socialRequestId?: number | null };
      publicIntent: Record<string, unknown>;
    },
  ): Promise<PublicSocialIntent> {
    if (!this.publicIntentRepo) {
      throw new BadRequestException('发布约练缺少发现页读回校验能力');
    }
    const readback = await this.publicIntentRepo.findOne({
      where: { id: publicIntentId },
    });
    if (!readback) {
      throw new BadRequestException('发布约练后未能在发现页读回公开卡片');
    }
    if (readback.mode !== 'public') {
      throw new BadRequestException('发布约练读回的公开卡片不可见');
    }
    if (this.isTombstonedPublicIntent(readback)) {
      throw new BadRequestException('发布约练读回的公开卡片已取消发布');
    }
    this.assertPublicIntentReadbackMatches(readback, expected);
    await this.assertDiscoverQueryCanReadIntent(publicIntentId);
    return readback;
  }

  private assertPublicIntentReadbackMatches(
    readback: PublicSocialIntent,
    expected: {
      ownerUserId: number;
      socialRequestId: number;
      draft: CreateSocialRequestDto & { socialRequestId?: number | null };
      publicIntent: Record<string, unknown>;
    },
  ): void {
    if (readback.userId !== expected.ownerUserId) {
      throw new BadRequestException('发布约练读回的公开卡片归属用户不一致');
    }
    if (readback.linkedSocialRequestId !== expected.socialRequestId) {
      throw new BadRequestException('发布约练读回的公开卡片关联需求不一致');
    }
    if (!this.isDiscoverablePublicIntentStatus(readback.status)) {
      throw new BadRequestException('发布约练读回的公开卡片状态不可发现');
    }
    const expiresAt = this.publicIntentExpiresAt(readback);
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('发布约练读回的公开卡片已过期');
    }
    if (!this.publicIntentSourceVersion(readback)) {
      throw new BadRequestException('发布约练读回缺少 sourceVersion');
    }
    this.assertMatchingPublicText({
      label: '标题',
      actual: readback.title,
      expected: [expected.publicIntent.title, expected.draft.title],
    });
    this.assertMatchingPublicText({
      label: '城市',
      actual: readback.city,
      expected: [expected.publicIntent.city, expected.draft.city],
    });
    this.assertMatchingPublicText({
      label: '时间',
      actual: readback.timePreference,
      expected: [
        expected.publicIntent.timePreference,
        this.record(expected.draft.metadata).timePreference,
        expected.draft.timeStart,
      ],
    });
    this.assertMatchingPublicText({
      label: '地点',
      actual: readback.locationPreference,
      expected: [
        expected.publicIntent.locationPreference,
        this.record(expected.draft.metadata).locationPreference,
      ],
    });
  }

  private async assertDiscoverQueryCanReadIntent(publicIntentId: string) {
    if (!this.publicIntentRepo) return;
    const intent = await this.publicIntentRepo
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
    if (!intent) {
      throw new BadRequestException('发现页查询无法按 ID 读回公开卡片');
    }
  }

  private isDiscoverablePublicIntentStatus(status: unknown): boolean {
    return [
      SocialRequestStatus.Active,
      SocialRequestStatus.Searching,
      SocialRequestStatus.Matched,
    ].includes(status as SocialRequestStatus);
  }

  private isTombstonedPublicIntent(intent: PublicSocialIntent): boolean {
    const metadata = this.record(intent.metadata);
    return (
      metadata.tombstoned === true ||
      this.text(metadata.tombstoned) === 'true' ||
      this.text(metadata.publishStatus) === 'dismissed'
    );
  }

  private publicIntentExpiresAt(intent: PublicSocialIntent): Date | null {
    const expiresAt = this.text(this.record(intent.metadata).expiresAt);
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private publicIntentSourceVersion(intent: PublicSocialIntent): string {
    const metadataVersion = this.text(
      this.record(intent.metadata).sourceVersion,
    );
    if (metadataVersion) return metadataVersion.slice(0, 128);
    if (intent.updatedAt instanceof Date) return intent.updatedAt.toISOString();
    return '';
  }

  private assertMatchingPublicText(input: {
    label: string;
    actual: unknown;
    expected: unknown[];
  }): void {
    const actual = this.normalizedPublicText(input.actual);
    const expected = this.firstNormalizedPublicText(input.expected);
    if (!actual || !expected) return;
    if (actual !== expected) {
      throw new BadRequestException(
        `发布约练读回的公开卡片${input.label}不一致`,
      );
    }
  }

  private firstNormalizedPublicText(values: unknown[]): string | null {
    for (const value of values) {
      const text = this.normalizedPublicText(value);
      if (text) return text;
    }
    return null;
  }

  private normalizedPublicText(value: unknown): string | null {
    const text = cleanDisplayText(value, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return text || null;
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }

  private async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task) {
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    }
    return task;
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.draft_publication.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private rememberShortTermStep(
    task: AgentTask,
    id: string,
    label: string,
    status: string,
  ): void {
    const step = {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      currentStep: step,
      steps: appendShortTermMemoryItem(task, 'steps', step, 40),
    });
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private record(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private firstNonEmptyRecord(...values: unknown[]): Record<string, unknown> {
    for (const value of values) {
      const record = this.record(value);
      if (Object.keys(record).length > 0) return record;
    }
    return {};
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private pendingApprovalFromOutput(
    output: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const isPending =
      output.pendingApproval === true || output.status === 'pending_approval';
    if (!isPending) return null;
    const approval = this.isRecord(output.approval) ? output.approval : {};
    const approvalId = this.number(output.approvalId ?? approval.id);
    if (!approvalId) return null;
    return {
      id: approvalId,
      type: cleanDisplayText(approval.type, 'custom'),
      actionType: cleanDisplayText(
        approval.actionType,
        'publish_social_request',
      ),
      summary: cleanDisplayText(approval.summary, '发布约练卡到发现页'),
      riskLevel: cleanDisplayText(approval.riskLevel, 'medium'),
      payload: this.isRecord(approval.payload) ? approval.payload : {},
      expiresAt: cleanDisplayText(approval.expiresAt, '') || null,
    };
  }

  private discoverHref(
    publicIntentId: string | null,
    socialRequestId: number,
  ): string {
    if (publicIntentId) {
      return `/discover?publicIntentId=${encodeURIComponent(publicIntentId)}`;
    }
    return `/discover?socialRequestId=${encodeURIComponent(String(socialRequestId))}`;
  }

  private publicIntentHref(
    publicIntentId: string | null,
    socialRequestId: number,
  ): string {
    if (publicIntentId) {
      return `/public-intent/${encodeURIComponent(publicIntentId)}`;
    }
    return `/discover?socialRequestId=${encodeURIComponent(String(socialRequestId))}`;
  }
}
