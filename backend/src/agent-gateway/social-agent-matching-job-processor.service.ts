import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
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
  ) {}

  async processDueJobs(input: {
    workerId: string;
    limit?: number;
    leaseMs?: number;
    maxAttempts?: number;
  }): Promise<MatchingJobProcessorSummary> {
    const claimed = await this.matchingJobs.claimDueJobs({
      workerId: input.workerId,
      limit: input.limit,
      leaseMs: input.leaseMs,
    });
    const summary: MatchingJobProcessorSummary = {
      claimed: claimed.length,
      candidatesReady: 0,
      noCandidates: 0,
      cancelled: 0,
      failedRetryable: 0,
      failedFinal: 0,
    };
    for (const job of claimed) {
      const status = await this.processClaimedJob(job, {
        maxAttempts: input.maxAttempts,
      });
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
    options: { maxAttempts?: number } = {},
  ): Promise<MatchingJobStatus> {
    try {
      const validation = await this.validateJob(job);
      const searchResult = await this.searchCandidates(job, validation);
      await this.validateJob(job);
      const candidates = searchResult.candidates.map((candidate) =>
        toSocialAgentChatCandidate(
          this.taskIdFromJob(job) ?? 0,
          validation.socialRequest.id,
          candidate as never,
        ),
      );
      const completed = await this.matchingJobs.markCompleted(
        job.id,
        candidates.length,
        {
          candidates: sanitizeForDisplay(candidates),
          candidateCount: candidates.length,
          emptyReason: searchResult.emptyReason,
          message: searchResult.message,
          publicIntentId: job.publicIntentId,
          socialRequestId: validation.socialRequest.id,
          debugReasons: sanitizeForDisplay(searchResult.debugReasons),
        },
        job.leaseOwner,
      );
      await this.writeTaskResult({
        job: completed,
        validation,
        candidates,
        searchResult,
      });
      return completed.status;
    } catch (error) {
      if (error instanceof CancelMatchingJobError) {
        const cancelled = await this.matchingJobs.cancelClaimed(
          job.id,
          job.leaseOwner,
          error.message,
        );
        return cancelled.status;
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
    }
  }

  private async searchCandidates(
    job: MatchingJob,
    validation: JobValidationResult,
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
      persistCandidates: true,
    });
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

  private async writeTaskResult(input: {
    job: MatchingJob;
    validation: JobValidationResult;
    candidates: SocialAgentChatCandidate[];
    searchResult: CandidatePoolSearchResult;
  }): Promise<void> {
    const taskId = this.taskIdFromJob(input.job);
    if (!taskId) return;
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId: input.validation.ownerUserId },
    });
    if (!task) return;
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
        refreshedAt: now,
        statusReason: task.statusReason,
      },
      matchingJob: {
        id: input.job.id,
        status: input.job.status,
        publicIntentId: input.job.publicIntentId,
        sourceVersion: input.job.sourceVersion,
        candidateCount,
        completedAt: input.job.completedAt,
      },
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
        updatedAt: now,
      },
    };
    await this.taskRepo.save(task);
    await this.eventRepo.save(
      this.eventRepo.create({
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
      matchingJobId: this.number(input.chatRun.matchingJobId),
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

  private async assertDiscoverQueryCanReadIntent(publicIntentId: string) {
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
      throw new BadRequestException('matching_job_discover_readback_failed');
    }
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
