import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { RealtimeEventService } from '../realtime/realtime-event.service';
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
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import {
  MatchingJobService,
  type ClaimedMatchingJob,
} from './matching-job.service';
import { toSocialAgentChatCandidate } from './social-agent-chat-candidate.presenter';
import type { SocialAgentChatCandidate } from './social-agent-chat.types';
import {
  type CandidatePoolSearchResult,
  SocialAgentCandidatePoolService,
} from './social-agent-candidate-pool.service';
import { buildSocialAgentCandidateDetailCard } from './social-agent-card-action.presenter';
import { CandidateSearchIndexService } from './candidate-search-index.service';
import { CandidateSearchIndex } from './entities/candidate-search-index.entity';
import { buildSocialAgentNoCandidatesCard } from './social-agent-no-candidates-card.presenter';
import { SocialAgentMatchRelaxationService } from './social-agent-match-relaxation.service';
import type { SocialAgentMatchingFallback } from './social-agent-match-relaxation.types';

const SOCIAL_REQUEST_ADVISORY_LOCK_NAMESPACE = 1_782_160_006;

type MatchingJobProcessorSummary = {
  claimed: number;
  candidatesReady: number;
  noCandidates: number;
  cancelled: number;
  failedRetryable: number;
  failedFinal: number;
};

type JobValidationResult = {
  ownerUserId: number;
  socialRequest: UserSocialRequest;
  publicIntent: PublicSocialIntent;
  sourceVersion: string;
};

type CandidateIndexHints = {
  candidateUserIds: number[];
  publicIntentIds: string[];
  sourceCount: number;
  used: boolean;
};

type FinalizedMatchingJob = {
  job: MatchingJob;
  ownerUserId: number;
  taskId: number | null;
  publicIntentId: string;
  socialRequestId: number;
  candidates: SocialAgentChatCandidate[];
  candidateCount: number;
  emptyReason: string | null;
  message: string | null;
  matchingFallback: SocialAgentMatchingFallback | null;
};

class CancelMatchingJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CancelMatchingJobError';
  }
}

class FinalMatchingJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinalMatchingJobError';
  }
}

@Injectable()
export class SocialAgentMatchingJobProcessorService {
  private readonly logger = new Logger(
    SocialAgentMatchingJobProcessorService.name,
  );

  constructor(
    private readonly matchingJobs: MatchingJobService,
    private readonly candidatePool: SocialAgentCandidatePoolService,
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(UserSocialRequest)
    private readonly userSocialRequestRepo: Repository<UserSocialRequest>,
    @Optional()
    private readonly candidateSearchIndex?: CandidateSearchIndexService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
    @Optional()
    private readonly relaxation?: SocialAgentMatchRelaxationService,
  ) {}

  async processDueJobs(input: {
    workerId: string;
    limit?: number;
    leaseMs?: number;
    maxAttempts?: number;
  }): Promise<MatchingJobProcessorSummary> {
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 10), 100));
    const summary: MatchingJobProcessorSummary = {
      claimed: 0,
      candidatesReady: 0,
      noCandidates: 0,
      cancelled: 0,
      failedRetryable: 0,
      failedFinal: 0,
    };
    for (let index = 0; index < limit; index += 1) {
      const [job] = await this.matchingJobs.claimDueJobs({
        workerId: input.workerId,
        limit: 1,
        leaseMs: input.leaseMs,
      });
      if (!job) break;
      summary.claimed += 1;
      let status: MatchingJobStatus;
      try {
        status = await this.processClaimedJob(job, {
          maxAttempts: input.maxAttempts,
          leaseMs: input.leaseMs,
        });
      } catch (error) {
        summary.failedRetryable += 1;
        this.logger.warn({
          event: 'social_agent.matching_job.unhandled_failure',
          jobId: job.id,
          publicIntentId: job.publicIntentId,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (status === MatchingJobStatus.CandidatesReady) {
        summary.candidatesReady += 1;
      } else if (status === MatchingJobStatus.NoCandidates) {
        summary.noCandidates += 1;
      } else if (status === MatchingJobStatus.Cancelled) {
        summary.cancelled += 1;
      } else if (status === MatchingJobStatus.FailedRetryable) {
        summary.failedRetryable += 1;
      } else if (status === MatchingJobStatus.FailedFinal) {
        summary.failedFinal += 1;
      }
    }
    return summary;
  }

  async processClaimedJob(
    job: ClaimedMatchingJob,
    options: { maxAttempts?: number; leaseMs?: number } = {},
  ): Promise<MatchingJobStatus> {
    const heartbeat = this.startLeaseHeartbeat(job, options.leaseMs);
    try {
      const validation = await this.validateJob(job);
      const indexHints = await this.resolveCandidateIndexHints(validation);
      const searchResult = await this.searchCandidates(
        job,
        validation,
        indexHints,
      );
      const matchingFallback =
        searchResult.candidates.length === 0
          ? await this.relaxation?.buildFallback({
              ownerUserId: validation.ownerUserId,
              query: searchResult.query,
              socialRequest: validation.socialRequest,
              publicIntent: validation.publicIntent,
            })
          : null;
      const finalized = await this.finalizeSearchResult({
        job,
        validation,
        searchResult,
        indexHints,
        matchingFallback: matchingFallback ?? null,
      });
      this.emitMatchingResult(finalized);
      return finalized.job.status;
    } catch (error) {
      if (error instanceof CancelMatchingJobError) {
        try {
          const cancelled = await this.matchingJobs.cancelClaimed(
            job.id,
            job.leaseOwner,
            error.message,
          );
          return cancelled.status;
        } catch (cancelError) {
          if (
            cancelError instanceof Error &&
            cancelError.message.includes('matching_job_lease_lost')
          ) {
            return MatchingJobStatus.Cancelled;
          }
          throw cancelError;
        }
      }
      const retryable = this.shouldRetry(job, error, options.maxAttempts);
      const failed = await this.matchingJobs.markFailed(
        job.id,
        error,
        retryable,
        job.leaseOwner,
      );
      this.logger.warn({
        event: 'social_agent.matching_job.failed',
        jobId: job.id,
        publicIntentId: job.publicIntentId,
        status: failed.status,
        message: error instanceof Error ? error.message : String(error),
      });
      return failed.status;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private startLeaseHeartbeat(
    job: ClaimedMatchingJob,
    leaseMs = 60_000,
  ): NodeJS.Timeout {
    const safeLeaseMs = Math.max(5_000, Math.floor(leaseMs || 60_000));
    const intervalMs = Math.max(1_000, Math.floor(safeLeaseMs / 3));
    return setInterval(() => {
      void this.matchingJobs
        .extendLease({
          jobId: job.id,
          leaseOwner: job.leaseOwner,
          leaseMs: safeLeaseMs,
        })
        .catch((error) => {
          this.logger.warn({
            event: 'social_agent.matching_job.heartbeat_failed',
            jobId: job.id,
            publicIntentId: job.publicIntentId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }, intervalMs);
  }

  private async searchCandidates(
    job: MatchingJob,
    validation: JobValidationResult,
    indexHints: CandidateIndexHints,
  ): Promise<CandidatePoolSearchResult> {
    const request = validation.socialRequest;
    const intent = validation.publicIntent;
    const metadata = this.record(intent.metadata);
    const filters = this.record(intent.filters);
    return this.candidatePool.searchSocial({
      ownerUserId: validation.ownerUserId,
      taskId: this.taskIdFromJob(job),
      socialRequestId: request.id,
      city: request.city || intent.city,
      activityType:
        request.activityType ||
        cleanDisplayText(intent.requestType, '') ||
        cleanDisplayText(metadata.activityType, ''),
      interestTags: this.stringList(request.interestTags).length
        ? this.stringList(request.interestTags)
        : this.stringList(intent.interestTags),
      candidatePreference: cleanDisplayText(
        metadata.candidatePreference ?? filters.candidatePreference,
        '',
      ),
      candidatePreferencePolicy: cleanDisplayText(
        metadata.candidatePreferencePolicy,
        'public_discoverable_profiles_and_user_consented_public_tags_only',
      ),
      timePreference: cleanDisplayText(
        intent.timePreference ?? metadata.timePreference,
        '',
      ),
      locationPreference: cleanDisplayText(
        intent.locationPreference || intent.loc || metadata.locationPreference,
        '',
      ),
      rawText:
        request.rawText ||
        intent.socialGoal ||
        intent.description ||
        intent.title,
      acceptsStrangers:
        typeof metadata.acceptsStrangers === 'boolean'
          ? metadata.acceptsStrangers
          : null,
      limit: 10,
      persistCandidates: false,
      candidateUserIds: indexHints.used ? indexHints.candidateUserIds : null,
      publicIntentIds: indexHints.used ? indexHints.publicIntentIds : null,
    });
  }

  private async resolveCandidateIndexHints(
    validation: JobValidationResult,
  ): Promise<CandidateIndexHints> {
    if (!this.candidateSearchIndex) return emptyCandidateIndexHints();
    await this.candidateSearchIndex.upsertFromPublicIntent(
      validation.publicIntent.id,
    );
    const query = {
      ownerUserId: validation.ownerUserId,
      city: validation.socialRequest.city || validation.publicIntent.city,
      activityTypes: [
        validation.socialRequest.activityType,
        validation.publicIntent.requestType,
      ],
      interestTags: this.stringList(validation.socialRequest.interestTags)
        .length
        ? this.stringList(validation.socialRequest.interestTags)
        : this.stringList(validation.publicIntent.interestTags),
      timeBuckets: [validation.publicIntent.timePreference],
      limit: 80,
    };
    let rows = await this.candidateSearchIndex.search(query);
    if (rows.length === 0) {
      await this.candidateSearchIndex.syncActiveProfiles({ limit: 500 });
      await this.candidateSearchIndex.syncActivePublicIntents({ limit: 500 });
      rows = await this.candidateSearchIndex.search(query);
    }
    return buildCandidateIndexHints(rows);
  }

  private async validateJob(job: MatchingJob): Promise<JobValidationResult> {
    const intent = await this.publicIntentRepo.findOne({
      where: { id: job.publicIntentId },
    });
    if (!intent) {
      throw new BadRequestException('matching_job_public_intent_missing');
    }
    const linkedSocialRequestId =
      this.number(intent.linkedSocialRequestId) ??
      this.number(job.linkedSocialRequestId);
    if (!linkedSocialRequestId) {
      throw new FinalMatchingJobError(
        'matching_job_public_intent_missing_linked_request',
      );
    }
    if (
      job.linkedSocialRequestId &&
      intent.linkedSocialRequestId !== job.linkedSocialRequestId
    ) {
      throw new FinalMatchingJobError(
        'matching_job_linked_social_request_mismatch',
      );
    }
    const socialRequest = await this.userSocialRequestRepo.findOne({
      where: { id: linkedSocialRequestId },
    });
    if (!socialRequest) {
      throw new BadRequestException('matching_job_social_request_missing');
    }
    const ownerUserId =
      this.number(job.ownerUserId) ??
      this.number(intent.userId) ??
      socialRequest.userId;
    if (intent.userId !== null && intent.userId !== ownerUserId) {
      throw new FinalMatchingJobError(
        'matching_job_public_intent_owner_mismatch',
      );
    }
    if (socialRequest.userId !== ownerUserId) {
      throw new FinalMatchingJobError(
        'matching_job_social_request_owner_mismatch',
      );
    }
    if (job.ownerUserId !== null && job.ownerUserId !== ownerUserId) {
      throw new FinalMatchingJobError('matching_job_owner_mismatch');
    }
    if (this.isDismissedOrInactive(intent, socialRequest)) {
      throw new CancelMatchingJobError('matching_job_public_intent_cancelled');
    }
    if (this.isExpired(intent, socialRequest)) {
      throw new CancelMatchingJobError('matching_job_public_intent_expired');
    }
    const sourceVersion = this.publicIntentSourceVersion(intent);
    if (!sourceVersion) {
      throw new FinalMatchingJobError(
        'matching_job_public_intent_missing_source_version',
      );
    }
    if (sourceVersion !== job.sourceVersion) {
      throw new FinalMatchingJobError('matching_job_source_version_mismatch');
    }
    await this.assertDiscoverQueryCanReadIntent(intent.id);
    return {
      ownerUserId,
      publicIntent: intent,
      socialRequest,
      sourceVersion,
    };
  }

  private async finalizeSearchResult(input: {
    job: ClaimedMatchingJob;
    validation: JobValidationResult;
    searchResult: CandidatePoolSearchResult;
    indexHints: CandidateIndexHints;
    matchingFallback: SocialAgentMatchingFallback | null;
  }): Promise<FinalizedMatchingJob> {
    return this.taskRepo.manager.transaction(async (manager) => {
      await this.lockSocialRequestAggregate(
        manager,
        input.validation.socialRequest.id,
      );
      const lockedJob = await this.lockClaimedMatchingJob(
        manager,
        input.job.id,
        input.job.leaseOwner,
      );
      const intent = await manager
        .getRepository(PublicSocialIntent)
        .createQueryBuilder('intent')
        .setLock('pessimistic_write')
        .where('intent.id = :publicIntentId', {
          publicIntentId: lockedJob.publicIntentId,
        })
        .getOne();
      const linkedSocialRequestId =
        this.number(intent?.linkedSocialRequestId) ??
        this.number(lockedJob.linkedSocialRequestId);
      const socialRequest = linkedSocialRequestId
        ? await manager
            .getRepository(UserSocialRequest)
            .createQueryBuilder('request')
            .setLock('pessimistic_write')
            .where('request.id = :socialRequestId', {
              socialRequestId: linkedSocialRequestId,
            })
            .getOne()
        : null;
      const validation = this.validateLockedJob({
        job: lockedJob,
        intent,
        socialRequest,
      });
      await this.assertDiscoverQueryCanReadIntent(intent!.id, manager);

      const candidateRows = input.searchResult.candidates;
      await this.candidatePool.persistCandidateRows(
        validation.socialRequest.id,
        candidateRows,
        manager,
      );
      const taskId = this.taskIdFromJob(lockedJob);
      const candidates = candidateRows.map((candidate) =>
        toSocialAgentChatCandidate(
          taskId ?? 0,
          validation.socialRequest.id,
          candidate as never,
        ),
      );
      const candidateCount = candidates.length;
      const noCandidateCards =
        candidateCount === 0 && taskId && input.matchingFallback
          ? [
              buildSocialAgentNoCandidatesCard({
                taskId,
                socialRequestId: validation.socialRequest.id,
                publicIntentId: lockedJob.publicIntentId,
                matchingJobId: lockedJob.id,
                fallback: input.matchingFallback,
                message: input.searchResult.message,
              }),
            ]
          : [];
      const completedAt = new Date();
      const status =
        candidateCount > 0
          ? MatchingJobStatus.CandidatesReady
          : MatchingJobStatus.NoCandidates;
      const resultPayload = {
        candidates: sanitizeForDisplay(candidates),
        candidateCount,
        emptyReason: input.searchResult.emptyReason,
        message: input.searchResult.message,
        publicIntentId: lockedJob.publicIntentId,
        socialRequestId: validation.socialRequest.id,
        debugReasons: sanitizeForDisplay(input.searchResult.debugReasons),
        matchingFallback: sanitizeForDisplay(input.matchingFallback),
        cards: noCandidateCards,
        candidateSearchIndex: {
          used: input.indexHints.used,
          sourceCount: input.indexHints.sourceCount,
          candidateUserIds: input.indexHints.candidateUserIds,
          publicIntentIds: input.indexHints.publicIntentIds,
        },
      };
      const completedJob = {
        ...lockedJob,
        status,
        candidateCount,
        result: resultPayload,
        completedAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
      } as MatchingJob;

      const task = taskId
        ? await manager
            .getRepository(AgentTask)
            .createQueryBuilder('task')
            .setLock('pessimistic_write')
            .where('task.id = :taskId', { taskId })
            .andWhere('task.ownerUserId = :ownerUserId', {
              ownerUserId: validation.ownerUserId,
            })
            .getOne()
        : null;
      if (task) {
        await this.writeTaskResultInTransaction(manager, {
          task,
          job: completedJob,
          validation,
          candidates,
          searchResult: input.searchResult,
          indexHints: input.indexHints,
          matchingFallback: input.matchingFallback,
          noCandidateCards,
        });
      }

      validation.publicIntent.candidateUserIds = candidates
        .map((candidate) => candidate.candidateUserId ?? candidate.userId)
        .filter((value): value is number => typeof value === 'number');
      validation.publicIntent.matchedCount = candidateCount;
      validation.publicIntent.status =
        candidateCount > 0
          ? SocialRequestStatus.Matched
          : SocialRequestStatus.Searching;
      validation.publicIntent.metadata = {
        ...(validation.publicIntent.metadata ?? {}),
        matchingJobId: lockedJob.id,
        matchingJobStatus: status,
        candidateCount,
        matchedCount: candidateCount,
        matchingFallback:
          candidateCount === 0
            ? sanitizeForDisplay(input.matchingFallback)
            : undefined,
        candidateSearchIndex: {
          used: input.indexHints.used,
          sourceCount: input.indexHints.sourceCount,
        },
        matchedAt: completedAt.toISOString(),
      };
      await manager
        .getRepository(PublicSocialIntent)
        .save(validation.publicIntent);

      const updated = await this.queryRows<MatchingJob>(
        manager,
        `UPDATE "matching_jobs"
         SET "status" = $1,
             "candidateCount" = $2,
             "result" = $3::jsonb,
             "errorMessage" = '',
             "nextRunAt" = NULL,
             "leaseOwner" = NULL,
             "leaseExpiresAt" = NULL,
             "lastHeartbeatAt" = NULL,
             "completedAt" = $4,
             "updatedAt" = $4
         WHERE "id" = $5
           AND "status" = $6
           AND "leaseOwner" = $7
         RETURNING *`,
        [
          status,
          candidateCount,
          JSON.stringify(resultPayload),
          completedAt,
          lockedJob.id,
          MatchingJobStatus.Running,
          input.job.leaseOwner,
        ],
      );
      const finalized = updated[0];
      if (!finalized) throw new BadRequestException('matching_job_lease_lost');
      return {
        job: finalized,
        ownerUserId: validation.ownerUserId,
        taskId,
        publicIntentId: validation.publicIntent.id,
        socialRequestId: validation.socialRequest.id,
        candidates,
        candidateCount,
        emptyReason: input.searchResult.emptyReason ?? null,
        message: input.searchResult.message ?? null,
        matchingFallback: input.matchingFallback,
      };
    });
  }

  private async writeTaskResultInTransaction(
    manager: EntityManager,
    input: {
      task: AgentTask;
      job: MatchingJob;
      validation: JobValidationResult;
      candidates: SocialAgentChatCandidate[];
      searchResult: CandidatePoolSearchResult;
      indexHints: CandidateIndexHints;
      matchingFallback: SocialAgentMatchingFallback | null;
      noCandidateCards: ReturnType<typeof buildSocialAgentNoCandidatesCard>[];
    },
  ): Promise<void> {
    const taskId = this.taskIdFromJob(input.job);
    if (!taskId) throw new BadRequestException('matching_job_task_id_missing');
    const task = input.task;
    const now = new Date().toISOString();
    const result = this.record(task.result);
    const memory = this.record(task.memory);
    const chatRun = this.record(result.chatRun);
    const activityDraft = this.record(result.activityDraft);
    const socialAgentChat = this.record(memory.socialAgentChat);
    const socialRequestDraft = this.buildSocialRequestDraft({
      task,
      validation: input.validation,
      chatRun,
      activityDraft,
      socialAgentChat,
    });
    const candidateCount = input.candidates.length;
    const candidateCards = input.candidates.map((candidate) =>
      buildSocialAgentCandidateDetailCard({
        taskId,
        candidate: sanitizeForDisplay(candidate) as Record<string, unknown>,
      }),
    );
    const cards =
      candidateCards.length > 0 ? candidateCards : input.noCandidateCards;
    task.status =
      candidateCount > 0
        ? AgentTaskStatus.AwaitingConfirmation
        : AgentTaskStatus.WaitingResult;
    task.statusReason =
      candidateCount > 0
        ? 'matching_job_candidates_ready'
        : 'matching_job_no_candidates';
    task.result = {
      ...result,
      chatRun: {
        ...chatRun,
        socialRequestId: input.validation.socialRequest.id,
        socialRequestDraft,
        candidates: sanitizeForDisplay(input.candidates),
        candidateCount,
        emptyReason:
          candidateCount > 0
            ? null
            : (input.searchResult.emptyReason ?? 'no_real_candidates'),
        message:
          input.searchResult.message ??
          (candidateCount > 0
            ? '已找到候选，等待你确认下一步。'
            : '暂时没有找到合适候选。'),
        debugReasons: sanitizeForDisplay(input.searchResult.debugReasons),
        matchingJobId: input.job.id,
        matchingJobStatus: input.job.status,
        matchingFallback: sanitizeForDisplay(input.matchingFallback),
        candidateSearchIndex: {
          used: input.indexHints.used,
          sourceCount: input.indexHints.sourceCount,
          candidateUserIds: input.indexHints.candidateUserIds,
          publicIntentIds: input.indexHints.publicIntentIds,
        },
        refreshedAt: now,
        statusReason: task.statusReason,
        cards,
      },
      matchingJob: {
        id: input.job.id,
        status: input.job.status,
        publicIntentId: input.job.publicIntentId,
        sourceVersion: input.job.sourceVersion,
        candidateCount,
        completedAt: input.job.completedAt,
      },
      cards,
    };
    task.memory = {
      ...memory,
      socialAgentChat: {
        ...socialAgentChat,
        socialRequestId: input.validation.socialRequest.id,
        socialRequestDraft,
        candidates: input.candidates.map((candidate) => ({
          userId: candidate.userId,
          candidateUserId: candidate.candidateUserId ?? candidate.userId,
          socialRequestId: candidate.socialRequestId,
          candidateRecordId: candidate.candidateRecordId,
          score: candidate.score,
        })),
        matchingJobId: input.job.id,
        matchingJobStatus: input.job.status,
        matchingFallback: sanitizeForDisplay(input.matchingFallback),
        candidateSearchIndex: {
          used: input.indexHints.used,
          sourceCount: input.indexHints.sourceCount,
        },
        updatedAt: now,
      },
    };
    await manager.getRepository(AgentTask).save(task);
    await manager.getRepository(AgentTaskEvent).save(
      manager.getRepository(AgentTaskEvent).create({
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        actor: AgentTaskEventActor.Agent,
        eventType: AgentTaskEventType.SocialAgentCandidatesReturned,
        summary:
          candidateCount > 0
            ? 'FitMeet Agent 返回候选卡片'
            : 'FitMeet Agent 返回空候选结果',
        payload: sanitizeForDisplay({
          candidates: input.candidates,
          socialRequestDraft,
          candidateCount,
          emptyReason:
            candidateCount > 0
              ? null
              : (input.searchResult.emptyReason ?? 'no_real_candidates'),
          message: input.searchResult.message,
          matchingJobId: input.job.id,
          publicIntentId: input.job.publicIntentId,
          matchingFallback: sanitizeForDisplay(input.matchingFallback),
          candidateSearchIndex: {
            used: input.indexHints.used,
            sourceCount: input.indexHints.sourceCount,
          },
          createdAt: now,
        }) as Record<string, unknown>,
      }),
    );
  }

  private buildSocialRequestDraft(input: {
    task: AgentTask;
    validation: JobValidationResult;
    chatRun: Record<string, unknown>;
    activityDraft: Record<string, unknown>;
    socialAgentChat: Record<string, unknown>;
  }): Record<string, unknown> {
    const existing = this.firstRecord(
      input.chatRun.socialRequestDraft,
      input.socialAgentChat.socialRequestDraft,
      input.activityDraft,
    );
    const request = input.validation.socialRequest;
    const intent = input.validation.publicIntent;
    const discoverHref = `/discover?publicIntentId=${encodeURIComponent(intent.id)}`;
    const publicIntentHref = `/public-intent/${encodeURIComponent(intent.id)}`;
    return {
      ...existing,
      agentTaskId: input.task.id,
      socialRequestId: request.id,
      publicIntentId: intent.id,
      discoverHref,
      publicIntentHref,
      title: request.title || intent.title,
      description: request.description || intent.description,
      city: request.city || intent.city,
      activityType: request.activityType || intent.requestType,
      interestTags: this.stringList(request.interestTags).length
        ? this.stringList(request.interestTags)
        : this.stringList(intent.interestTags),
      rawText: request.rawText || intent.socialGoal || intent.description,
      publishStatus: 'published',
      visibility: 'public',
      autoPublished: true,
      matchingJobId:
        this.number(input.chatRun.matchingJobId) ??
        this.number(input.socialAgentChat.matchingJobId),
      sourceVersion: input.validation.sourceVersion,
    };
  }

  private shouldRetry(
    job: MatchingJob,
    error: unknown,
    maxAttempts = 3,
  ): boolean {
    if (error instanceof FinalMatchingJobError) return false;
    if (error instanceof CancelMatchingJobError) return false;
    return (job.attemptCount ?? 1) < Math.max(1, maxAttempts);
  }

  private async assertDiscoverQueryCanReadIntent(
    publicIntentId: string,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(PublicSocialIntent)
      : this.publicIntentRepo;
    const intent = await repo
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
      throw new BadRequestException('matching_job_discover_readback_failed');
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

  private async lockClaimedMatchingJob(
    manager: EntityManager,
    jobId: number,
    leaseOwner: string,
  ): Promise<MatchingJob> {
    const rows = await this.queryRows<MatchingJob>(
      manager,
      `SELECT *
       FROM "matching_jobs"
       WHERE "id" = $1
       FOR UPDATE`,
      [jobId],
    );
    const job = rows[0];
    if (
      !job ||
      job.status !== MatchingJobStatus.Running ||
      job.leaseOwner !== leaseOwner
    ) {
      throw new BadRequestException('matching_job_lease_lost');
    }
    return job;
  }

  private validateLockedJob(input: {
    job: MatchingJob;
    intent: PublicSocialIntent | null;
    socialRequest: UserSocialRequest | null;
  }): JobValidationResult {
    const { job, intent, socialRequest } = input;
    if (!intent) {
      throw new BadRequestException('matching_job_public_intent_missing');
    }
    if (!socialRequest) {
      throw new BadRequestException('matching_job_social_request_missing');
    }
    const linkedSocialRequestId =
      this.number(intent.linkedSocialRequestId) ??
      this.number(job.linkedSocialRequestId);
    if (!linkedSocialRequestId) {
      throw new FinalMatchingJobError(
        'matching_job_public_intent_missing_linked_request',
      );
    }
    if (
      job.linkedSocialRequestId &&
      intent.linkedSocialRequestId !== job.linkedSocialRequestId
    ) {
      throw new FinalMatchingJobError(
        'matching_job_linked_social_request_mismatch',
      );
    }
    const ownerUserId =
      this.number(job.ownerUserId) ??
      this.number(intent.userId) ??
      socialRequest.userId;
    if (intent.userId !== null && intent.userId !== ownerUserId) {
      throw new FinalMatchingJobError(
        'matching_job_public_intent_owner_mismatch',
      );
    }
    if (socialRequest.userId !== ownerUserId) {
      throw new FinalMatchingJobError(
        'matching_job_social_request_owner_mismatch',
      );
    }
    if (job.ownerUserId !== null && job.ownerUserId !== ownerUserId) {
      throw new FinalMatchingJobError('matching_job_owner_mismatch');
    }
    if (this.isDismissedOrInactive(intent, socialRequest)) {
      throw new CancelMatchingJobError('matching_job_public_intent_cancelled');
    }
    if (this.isExpired(intent, socialRequest)) {
      throw new CancelMatchingJobError('matching_job_public_intent_expired');
    }
    const sourceVersion = this.publicIntentSourceVersion(intent);
    if (!sourceVersion) {
      throw new FinalMatchingJobError(
        'matching_job_public_intent_missing_source_version',
      );
    }
    if (sourceVersion !== job.sourceVersion) {
      throw new FinalMatchingJobError('matching_job_source_version_mismatch');
    }
    return { ownerUserId, publicIntent: intent, socialRequest, sourceVersion };
  }

  private emitMatchingResult(result: FinalizedMatchingJob): void {
    if (!this.realtime || !result.taskId) return;
    const cards =
      result.candidateCount === 0 && result.matchingFallback
        ? [
            buildSocialAgentNoCandidatesCard({
              taskId: result.taskId,
              socialRequestId: result.socialRequestId,
              publicIntentId: result.publicIntentId,
              matchingJobId: result.job.id,
              fallback: result.matchingFallback,
              message: result.message,
            }),
          ]
        : [];
    this.realtime.emitAgentEvent(result.ownerUserId, 'agent:candidates', {
      taskId: result.taskId,
      publicIntentId: result.publicIntentId,
      socialRequestId: result.socialRequestId,
      matchingJobId: result.job.id,
      matchingJobStatus: result.job.status,
      candidateCount: result.candidateCount,
      candidates: sanitizeForDisplay(result.candidates),
      cards: sanitizeForDisplay(cards),
      emptyReason: result.emptyReason,
      message: result.message,
      matchingFallback: sanitizeForDisplay(result.matchingFallback),
      publicLoopStage:
        result.candidateCount > 0 ? 'candidates_recommended' : 'no_candidates',
    });
  }

  private isDismissedOrInactive(
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

  private taskIdFromJob(job: MatchingJob): number | null {
    return this.number(this.record(job.metadata).taskId);
  }

  private firstRecord(...values: unknown[]): Record<string, unknown> {
    for (const value of values) {
      const record = this.record(value);
      if (Object.keys(record).length > 0) return record;
    }
    return {};
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

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => cleanDisplayText(item, '')).filter(Boolean)
      : [];
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim().toLowerCase();
  }
}

function emptyCandidateIndexHints(): CandidateIndexHints {
  return {
    candidateUserIds: [],
    publicIntentIds: [],
    sourceCount: 0,
    used: false,
  };
}

function buildCandidateIndexHints(
  rows: CandidateSearchIndex[],
): CandidateIndexHints {
  const candidateUserIds = uniqueNumbers(rows.map((row) => row.userId));
  const publicIntentIds = uniqueStrings(
    rows.map((row) => row.publicIntentId ?? ''),
  );
  return {
    candidateUserIds,
    publicIntentIds,
    sourceCount: rows.length,
    used: rows.length > 0,
  };
}

function uniqueNumbers(values: unknown[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    const id = Math.floor(parsed);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = cleanDisplayText(value, '');
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
