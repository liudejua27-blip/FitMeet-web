import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import { AgentFeedbackEvent } from './entities/agent-feedback-event.entity';
import {
  AgentSideEffectLedger,
  AgentSideEffectLedgerStatus,
} from './entities/agent-side-effect-ledger.entity';
import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SafetyEvent, Severity } from './entities/safety-event.entity';
import { SocialAgentMessageFeedback } from './entities/social-agent-message-feedback.entity';
import { SocialCandidateEvent } from './entities/social-candidate-event.entity';
import { SocialCandidateSnapshot } from './entities/social-candidate-snapshot.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { PublicIntentApplication } from '../social-loop/public-intent-application.entity';
import { DomainOutboxEvent } from '../social-loop/domain-outbox-event.entity';
import {
  SocialActivity,
  SocialActivityStatus,
} from '../activities/entities/activity.entity';

type CountMap = Record<string, number>;

type LoopTraceLink = {
  taskId: number;
  runId: string | null;
  threadId: string | null;
  publicIntentId: string | null;
  socialRequestId: number | null;
  matchingJobId: number | null;
  candidateSnapshotId: number | null;
  candidateRecordId: number | null;
  applicationId: number | null;
  conversationId: string | null;
  activityId: number | null;
  approvalId: number | null;
  status: AgentTaskStatus;
  missing: string[];
  updatedAt: string;
};

type RatioMetric = {
  numerator: number;
  denominator: number;
  rate: number | null;
};

type LoopBusinessMetrics = {
  publishSuccessRate: RatioMetric;
  matchingJobP95LatencyMs: number | null;
  noCandidateRate: RatioMetric;
  candidateClickRate: RatioMetric;
  openerGenerationRate: RatioMetric;
  openerSendConfirmationRate: RatioMetric;
  messageReplyRate: RatioMetric;
  applicationAcceptanceRate: RatioMetric;
  activityCompletionRate: RatioMetric;
  reviewSubmissionRate: RatioMetric;
  safetyInterventionRate: RatioMetric;
  duplicateSideEffectInterceptions: number;
  sideEffectFailureRate: RatioMetric;
  outboxFailureRate: RatioMetric;
};

export type SocialAgentLoopObservabilitySnapshot = {
  generatedAt: string;
  sampleLimit: number;
  identifiers: string[];
  counts: {
    tasksByStatus: CountMap;
    matchingJobsByStatus: CountMap;
    candidateEventsByType: CountMap;
    applicationsByStatus: CountMap;
    approvalsByStatus: CountMap;
    sideEffectsByStatus: CountMap;
    outboxByStatus: CountMap;
    activitiesByStatus: CountMap;
    safetyEventsBySeverity: CountMap;
  };
  traceCoverage: Record<
    string,
    {
      present: number;
      missing: number;
      coverage: number;
    }
  >;
  businessMetrics: LoopBusinessMetrics;
  recentTraceLinks: LoopTraceLink[];
};

@Injectable()
export class SocialAgentLoopObservabilityService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(MatchingJob)
    private readonly matchingJobRepo: Repository<MatchingJob>,
    @InjectRepository(SocialCandidateSnapshot)
    private readonly candidateSnapshotRepo: Repository<SocialCandidateSnapshot>,
    @InjectRepository(SocialCandidateEvent)
    private readonly candidateEventRepo: Repository<SocialCandidateEvent>,
    @InjectRepository(PublicIntentApplication)
    private readonly applicationRepo: Repository<PublicIntentApplication>,
    @InjectRepository(AgentApprovalRequest)
    private readonly approvalRepo: Repository<AgentApprovalRequest>,
    @InjectRepository(AgentSideEffectLedger)
    private readonly ledgerRepo: Repository<AgentSideEffectLedger>,
    @InjectRepository(DomainOutboxEvent)
    private readonly outboxRepo: Repository<DomainOutboxEvent>,
    @InjectRepository(SocialActivity)
    private readonly activityRepo: Repository<SocialActivity>,
    @InjectRepository(SafetyEvent)
    private readonly safetyRepo: Repository<SafetyEvent>,
    @InjectRepository(AgentFeedbackEvent)
    private readonly feedbackRepo: Repository<AgentFeedbackEvent>,
    @InjectRepository(SocialAgentMessageFeedback)
    private readonly messageFeedbackRepo: Repository<SocialAgentMessageFeedback>,
  ) {}

  async snapshot(limit = 80): Promise<SocialAgentLoopObservabilitySnapshot> {
    const take = this.normalizeLimit(limit);
    const [
      tasks,
      publicIntents,
      matchingJobs,
      candidateSnapshots,
      candidateEvents,
      applications,
      approvals,
      sideEffects,
      outboxEvents,
      activities,
      safetyEvents,
      agentFeedback,
      messageFeedback,
    ] = await Promise.all([
      this.taskRepo.find({ order: { updatedAt: 'DESC', id: 'DESC' }, take }),
      this.publicIntentRepo.find({
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
        take: take * 2,
      }),
      this.matchingJobRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.candidateSnapshotRepo.find({
        order: { createdAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.candidateEventRepo.find({
        order: { createdAt: 'DESC', id: 'DESC' },
        take: take * 3,
      }),
      this.applicationRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.approvalRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.ledgerRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.outboxRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.activityRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.safetyRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.feedbackRepo.find({
        order: { createdAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
      this.messageFeedbackRepo.find({
        order: { updatedAt: 'DESC', id: 'DESC' },
        take: take * 2,
      }),
    ]);

    const recentTraceLinks = this.buildTraceLinks({
      tasks,
      publicIntents,
      matchingJobs,
      candidateSnapshots,
      candidateEvents,
      applications,
      approvals,
      sideEffects,
      outboxEvents,
      activities,
    });

    return {
      generatedAt: new Date().toISOString(),
      sampleLimit: take,
      identifiers: [
        'taskId',
        'runId',
        'threadId',
        'publicIntentId',
        'socialRequestId',
        'matchingJobId',
        'candidateSnapshotId',
        'candidateRecordId',
        'applicationId',
        'conversationId',
        'activityId',
        'approvalId',
      ],
      counts: {
        tasksByStatus: this.countBy(tasks, (item) => item.status),
        matchingJobsByStatus: this.countBy(matchingJobs, (item) => item.status),
        candidateEventsByType: this.countBy(
          candidateEvents,
          (item) => item.eventType,
        ),
        applicationsByStatus: this.countBy(applications, (item) => item.status),
        approvalsByStatus: this.countBy(approvals, (item) => item.status),
        sideEffectsByStatus: this.countBy(sideEffects, (item) => item.status),
        outboxByStatus: this.countBy(outboxEvents, (item) => item.status),
        activitiesByStatus: this.countBy(activities, (item) => item.status),
        safetyEventsBySeverity: this.countBy(
          safetyEvents,
          (item) => item.severity,
        ),
      },
      traceCoverage: this.traceCoverage(recentTraceLinks),
      businessMetrics: this.businessMetrics({
        publicIntents,
        matchingJobs,
        candidateSnapshots,
        candidateEvents,
        applications,
        approvals,
        sideEffects,
        outboxEvents,
        activities,
        safetyEvents,
        agentFeedback,
        messageFeedback,
      }),
      recentTraceLinks,
    };
  }

  private buildTraceLinks(input: {
    tasks: AgentTask[];
    publicIntents: PublicSocialIntent[];
    matchingJobs: MatchingJob[];
    candidateSnapshots: SocialCandidateSnapshot[];
    candidateEvents: SocialCandidateEvent[];
    applications: PublicIntentApplication[];
    approvals: AgentApprovalRequest[];
    sideEffects: AgentSideEffectLedger[];
    outboxEvents: DomainOutboxEvent[];
    activities: SocialActivity[];
  }): LoopTraceLink[] {
    return input.tasks.map((task) => {
      const socialRequestId =
        this.findNumber(task.result, 'socialRequestId') ??
        this.findNumber(task.memory, 'socialRequestId') ??
        this.findNumber(task.input, 'socialRequestId');
      const publicIntentId =
        this.findString(task.result, 'publicIntentId') ??
        this.findString(task.memory, 'publicIntentId') ??
        this.findString(task.input, 'publicIntentId') ??
        this.latestPublicIntentForSocialRequest(
          input.publicIntents,
          socialRequestId,
        )?.id ??
        null;
      const matchingJob =
        this.latestByTaskOrIntent(input.matchingJobs, {
          taskId: task.id,
          publicIntentId,
          socialRequestId,
        }) ?? null;
      const snapshot =
        this.latestByTaskOrIntent(input.candidateSnapshots, {
          taskId: task.id,
          publicIntentId,
          matchingJobId: matchingJob?.id ?? null,
          socialRequestId,
        }) ?? null;
      const event =
        this.latestByTaskOrIntent(input.candidateEvents, {
          taskId: task.id,
          publicIntentId,
          matchingJobId: matchingJob?.id ?? null,
          socialRequestId,
        }) ?? null;
      const application =
        input.applications.find(
          (item) =>
            (publicIntentId && item.publicIntentId === publicIntentId) ||
            (snapshot?.publicIntentId &&
              item.publicIntentId === snapshot.publicIntentId),
        ) ?? null;
      const approval =
        input.approvals.find((item) => item.agentTaskId === task.id) ?? null;
      const activity =
        input.activities.find(
          (item) =>
            (socialRequestId && item.socialRequestId === socialRequestId) ||
            (application?.meetId && item.meetId === application.meetId),
        ) ?? null;
      const outbox =
        input.outboxEvents.find((item) => {
          const payload = this.record(item.payload);
          return (
            (application?.id &&
              Number(payload.applicationId) === application.id) ||
            (publicIntentId && payload.publicIntentId === publicIntentId) ||
            (activity?.meetId && Number(payload.meetId) === activity.meetId)
          );
        }) ?? null;
      const conversationId =
        this.findString(task.result, 'conversationId') ??
        this.findString(task.memory, 'conversationId') ??
        this.findString(outbox?.payload, 'conversationId');
      const runId =
        this.findString(task.result, 'runId') ??
        this.findString(task.memory, 'runId') ??
        this.findString(task.input, 'runId');
      const threadId =
        this.findString(task.result, 'threadId') ??
        this.findString(task.memory, 'threadId') ??
        this.findString(task.input, 'threadId');
      const link: LoopTraceLink = {
        taskId: task.id,
        runId,
        threadId,
        publicIntentId,
        socialRequestId,
        matchingJobId:
          matchingJob?.id ?? this.findNumber(task.result, 'matchingJobId'),
        candidateSnapshotId: snapshot?.id ?? null,
        candidateRecordId:
          event?.candidateRecordId ??
          this.findNumber(task.result, 'candidateRecordId'),
        applicationId:
          application?.id ?? this.findNumber(task.result, 'applicationId'),
        conversationId,
        activityId: activity?.id ?? this.findNumber(task.result, 'activityId'),
        approvalId: approval?.id ?? this.findNumber(task.result, 'approvalId'),
        status: task.status,
        missing: [],
        updatedAt: task.updatedAt.toISOString(),
      };
      link.missing = this.missingIdentifiers(link);
      return link;
    });
  }

  private businessMetrics(input: {
    publicIntents: PublicSocialIntent[];
    matchingJobs: MatchingJob[];
    candidateSnapshots: SocialCandidateSnapshot[];
    candidateEvents: SocialCandidateEvent[];
    applications: PublicIntentApplication[];
    approvals: AgentApprovalRequest[];
    sideEffects: AgentSideEffectLedger[];
    outboxEvents: DomainOutboxEvent[];
    activities: SocialActivity[];
    safetyEvents: SafetyEvent[];
    agentFeedback: AgentFeedbackEvent[];
    messageFeedback: SocialAgentMessageFeedback[];
  }): LoopBusinessMetrics {
    const publishedIntents = input.publicIntents.filter(
      (item) =>
        item.mode === 'public' && item.status !== SocialRequestStatus.Cancelled,
    ).length;
    const publishAttempts =
      publishedIntents +
      input.sideEffects.filter((item) =>
        /publish|discover/i.test(item.actionType),
      ).length;
    const matchingCompleted = input.matchingJobs.filter((item) =>
      [
        MatchingJobStatus.CandidatesReady,
        MatchingJobStatus.NoCandidates,
      ].includes(item.status),
    );
    const candidateEvents = input.candidateEvents;
    const impressions = this.countEvents(candidateEvents, [
      'candidate_impression',
    ]);
    const candidateEngagement = this.countEvents(candidateEvents, [
      'candidate_viewed',
      'candidate_saved',
      'more_like_this_requested',
      'opener_previewed',
      'invite_approval_requested',
      'invite_sent',
      'connect_approval_requested',
      'connect_established',
    ]);
    const openerPreviewed = this.countEvents(candidateEvents, [
      'opener_previewed',
      'opener_regenerated',
    ]);
    const candidateViewed = this.countEvents(candidateEvents, [
      'candidate_viewed',
      'candidate_saved',
      'more_like_this_requested',
    ]);
    const inviteApproval = this.countEvents(candidateEvents, [
      'invite_approval_requested',
    ]);
    const inviteSent = this.countEvents(candidateEvents, ['invite_sent']);
    const replies = this.countEvents(candidateEvents, ['candidate_replied']);
    const resolvedApplications = input.applications.filter(
      (item) => item.status === 'accepted' || item.status === 'rejected',
    ).length;
    const completedActivities = input.activities.filter(
      (item) => item.status === SocialActivityStatus.Completed,
    ).length;
    const activeActivities = input.activities.filter(
      (item) => item.status !== SocialActivityStatus.Draft,
    ).length;
    const activityCompletedEvents = this.countEvents(candidateEvents, [
      'activity_completed',
    ]);
    const reviewSubmittedEvents = this.countEvents(candidateEvents, [
      'review_submitted',
    ]);
    const highRiskSafety = input.safetyEvents.filter((item) =>
      [Severity.High, Severity.Critical].includes(item.severity),
    ).length;
    const duplicateSideEffectInterceptions = input.sideEffects.filter(
      (item) =>
        item.attemptCount === 0 &&
        item.status === AgentSideEffectLedgerStatus.Succeeded &&
        /duplicate|reused|idempotent/i.test(
          JSON.stringify({ result: item.result, metadata: item.metadata }),
        ),
    ).length;
    const sideEffectFailures = input.sideEffects.filter((item) =>
      /failed|manual|unknown/i.test(item.status),
    ).length;
    const outboxFailures = input.outboxEvents.filter(
      (item) => item.status === 'failed',
    ).length;

    return {
      publishSuccessRate: this.ratio(
        publishedIntents,
        Math.max(publishAttempts, publishedIntents),
      ),
      matchingJobP95LatencyMs: this.p95(
        matchingCompleted
          .map((job) => this.durationMs(job.createdAt, job.completedAt))
          .filter((value): value is number => value != null),
      ),
      noCandidateRate: this.ratio(
        input.matchingJobs.filter(
          (item) => item.status === MatchingJobStatus.NoCandidates,
        ).length,
        matchingCompleted.length,
      ),
      candidateClickRate: this.ratio(candidateEngagement, impressions),
      openerGenerationRate: this.ratio(openerPreviewed, candidateViewed),
      openerSendConfirmationRate: this.ratio(inviteSent, inviteApproval),
      messageReplyRate: this.ratio(replies, inviteSent),
      applicationAcceptanceRate: this.ratio(
        input.applications.filter((item) => item.status === 'accepted').length,
        resolvedApplications,
      ),
      activityCompletionRate: this.ratio(completedActivities, activeActivities),
      reviewSubmissionRate: this.ratio(
        reviewSubmittedEvents,
        activityCompletedEvents,
      ),
      safetyInterventionRate: this.ratio(
        highRiskSafety,
        input.safetyEvents.length +
          input.agentFeedback.length +
          input.messageFeedback.length,
      ),
      duplicateSideEffectInterceptions,
      sideEffectFailureRate: this.ratio(
        sideEffectFailures,
        input.sideEffects.length,
      ),
      outboxFailureRate: this.ratio(outboxFailures, input.outboxEvents.length),
    };
  }

  private traceCoverage(
    links: LoopTraceLink[],
  ): SocialAgentLoopObservabilitySnapshot['traceCoverage'] {
    const keys: Array<
      keyof Omit<LoopTraceLink, 'missing' | 'status' | 'updatedAt'>
    > = [
      'taskId',
      'runId',
      'threadId',
      'publicIntentId',
      'socialRequestId',
      'matchingJobId',
      'candidateSnapshotId',
      'candidateRecordId',
      'applicationId',
      'conversationId',
      'activityId',
      'approvalId',
    ];
    const out: SocialAgentLoopObservabilitySnapshot['traceCoverage'] = {};
    for (const key of keys) {
      const present = links.filter((item) => item[key] != null).length;
      out[key] = {
        present,
        missing: Math.max(links.length - present, 0),
        coverage: this.rate(present, links.length),
      };
    }
    return out;
  }

  private missingIdentifiers(link: LoopTraceLink): string[] {
    return [
      'runId',
      'threadId',
      'publicIntentId',
      'socialRequestId',
      'matchingJobId',
      'candidateSnapshotId',
      'candidateRecordId',
      'applicationId',
      'conversationId',
      'activityId',
      'approvalId',
    ].filter((key) => link[key as keyof LoopTraceLink] == null);
  }

  private latestPublicIntentForSocialRequest(
    publicIntents: PublicSocialIntent[],
    socialRequestId: number | null,
  ): PublicSocialIntent | null {
    if (!socialRequestId) return null;
    return (
      publicIntents.find(
        (item) => item.linkedSocialRequestId === socialRequestId,
      ) ?? null
    );
  }

  private latestByTaskOrIntent<
    T extends {
      taskId?: number | null;
      publicIntentId?: string | null;
      matchingJobId?: number | null;
      socialRequestId?: number | null;
      linkedSocialRequestId?: number | null;
      id?: number;
    },
  >(
    rows: T[],
    input: {
      taskId?: number | null;
      publicIntentId?: string | null;
      matchingJobId?: number | null;
      socialRequestId?: number | null;
    },
  ): T | null {
    return (
      rows.find(
        (row) =>
          (input.taskId && row.taskId === input.taskId) ||
          (input.matchingJobId && row.matchingJobId === input.matchingJobId) ||
          (input.publicIntentId &&
            row.publicIntentId === input.publicIntentId) ||
          (input.socialRequestId &&
            (row.socialRequestId === input.socialRequestId ||
              row.linkedSocialRequestId === input.socialRequestId)),
      ) ?? null
    );
  }

  private countEvents(events: SocialCandidateEvent[], types: string[]): number {
    const typeSet = new Set(types);
    return events.filter((event) => typeSet.has(event.eventType)).length;
  }

  private countBy<T>(items: T[], getter: (item: T) => string): CountMap {
    const out: CountMap = {};
    for (const item of items) {
      const key = getter(item) || 'unknown';
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }

  private ratio(numerator: number, denominator: number): RatioMetric {
    return {
      numerator,
      denominator,
      rate: denominator > 0 ? this.rate(numerator, denominator) : null,
    };
  }

  private rate(numerator: number, denominator: number): number {
    return denominator > 0
      ? Math.round((numerator / denominator) * 10000) / 10000
      : 0;
  }

  private p95(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
    );
    return sorted[index];
  }

  private durationMs(start: Date | null, end: Date | null): number | null {
    if (!start || !end) return null;
    const ms = end.getTime() - start.getTime();
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  }

  private findNumber(value: unknown, key: string): number | null {
    const found = this.findValue(value, key);
    const num = Number(found);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
  }

  private findString(value: unknown, key: string): string | null {
    const found = this.findValue(value, key);
    return typeof found === 'string' && found.trim() ? found.trim() : null;
  }

  private findValue(value: unknown, key: string): unknown {
    if (value == null) return null;
    if (typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findValue(item, key);
        if (found != null) return found;
      }
      return null;
    }
    const record = value as Record<string, unknown>;
    if (record[key] != null) return record[key];
    for (const item of Object.values(record)) {
      const found = this.findValue(item, key);
      if (found != null) return found;
    }
    return null;
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private normalizeLimit(value: number): number {
    return Number.isFinite(value) ? Math.max(10, Math.min(value, 200)) : 80;
  }
}
