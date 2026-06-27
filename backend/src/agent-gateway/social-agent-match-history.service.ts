import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import { MatchingJob } from './entities/matching-job.entity';
import {
  SocialCandidateEvent,
  type SocialCandidateEventType,
} from './entities/social-candidate-event.entity';
import { SocialCandidateSnapshot } from './entities/social-candidate-snapshot.entity';
import { SocialCandidateAuditService } from './social-candidate-audit.service';
import { UserSocialRequest } from '../social-requests/social-request.entity';

export type SocialAgentMatchHistoryCandidate = {
  candidateUserId: number | null;
  candidateRecordId: number | null;
  displayName: string;
  status: string;
  rankPosition: number | null;
  publicIntentId: string | null;
  reasons: string[];
  commonTags: string[];
  whyYouMayLike: string;
  latestAction: string;
};

export type SocialAgentMatchHistoryEventSummary = {
  id: number;
  eventType: SocialCandidateEventType;
  candidateUserId: number | null;
  candidateRecordId: number | null;
  createdAt: string;
  source: string;
  summary: string;
};

export type SocialAgentMatchHistoryEntry = {
  snapshotId: number | null;
  taskId: number | null;
  socialRequestId: number | null;
  publicIntentId: string | null;
  matchingJobId: number | null;
  matchingJobStatus: string | null;
  candidateCount: number;
  createdAt: string | null;
  sourceVersion: string;
  scoreVersion: string;
  constraintsSummary: string[];
  candidates: SocialAgentMatchHistoryCandidate[];
  recentEvents: SocialAgentMatchHistoryEventSummary[];
  feedbackSummary: {
    saved: number;
    skipped: number;
    openerPreviewed: number;
    inviteSent: number;
    connected: number;
    activityCompleted: number;
    reviewSubmitted: number;
  };
};

export type SocialAgentMatchHistoryOutput = {
  matches: SocialAgentMatchHistoryEntry[];
  total: number;
  source: 'candidate_snapshots' | 'candidate_rows';
};

@Injectable()
export class SocialAgentMatchHistoryService {
  constructor(
    private readonly candidateAudit: SocialCandidateAuditService,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(MatchingJob)
    private readonly matchingJobRepo: Repository<MatchingJob>,
    @InjectRepository(UserSocialRequest)
    private readonly socialRequestRepo: Repository<UserSocialRequest>,
  ) {}

  async viewMatchHistory(input: {
    ownerUserId: number;
    taskId?: number | null;
    limit?: number | null;
  }): Promise<SocialAgentMatchHistoryOutput> {
    const limit = this.limit(input.limit);
    const snapshots = await this.candidateAudit.listRecentSnapshots({
      ownerUserId: input.ownerUserId,
      taskId: this.number(input.taskId),
      limit,
    });
    if (snapshots.length > 0) {
      const [events, candidates, jobs] = await Promise.all([
        this.candidateAudit.listRecentEvents({
          ownerUserId: input.ownerUserId,
          taskId: this.number(input.taskId),
          limit: limit * 20,
        }),
        this.loadCandidatesForSnapshots(snapshots),
        this.loadMatchingJobs(snapshots),
      ]);
      return {
        matches: snapshots.map((snapshot) =>
          this.entryFromSnapshot(snapshot, events, candidates, jobs),
        ),
        total: snapshots.length,
        source: 'candidate_snapshots',
      };
    }

    const candidates = await this.loadOwnerCandidateRows({
      ownerUserId: input.ownerUserId,
      limit,
    });
    return {
      matches: this.entriesFromCandidateRows(candidates),
      total: candidates.length,
      source: 'candidate_rows',
    };
  }

  private async loadOwnerCandidateRows(input: {
    ownerUserId: number;
    limit: number;
  }): Promise<SocialRequestCandidate[]> {
    const requests = await this.socialRequestRepo.find({
      where: { userId: input.ownerUserId },
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: input.limit * 3,
    });
    const socialRequestIds = requests.map((request) => request.id);
    if (socialRequestIds.length === 0) return [];
    return this.candidateRepo.find({
      where: { socialRequestId: In(socialRequestIds) },
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: input.limit,
    });
  }

  private async loadCandidatesForSnapshots(
    snapshots: SocialCandidateSnapshot[],
  ): Promise<SocialRequestCandidate[]> {
    const socialRequestIds = [
      ...new Set(
        snapshots
          .map((snapshot) => this.number(snapshot.socialRequestId))
          .filter((value): value is number => typeof value === 'number'),
      ),
    ];
    if (socialRequestIds.length === 0) return [];
    return this.candidateRepo.find({
      where: { socialRequestId: In(socialRequestIds) },
      order: { rankPosition: 'ASC', score: 'DESC', id: 'ASC' },
    });
  }

  private async loadMatchingJobs(
    snapshots: SocialCandidateSnapshot[],
  ): Promise<MatchingJob[]> {
    const jobIds = [
      ...new Set(
        snapshots
          .map((snapshot) => this.number(snapshot.matchingJobId))
          .filter((value): value is number => typeof value === 'number'),
      ),
    ];
    if (jobIds.length === 0) return [];
    return this.matchingJobRepo.find({ where: { id: In(jobIds) } });
  }

  private entryFromSnapshot(
    snapshot: SocialCandidateSnapshot,
    events: SocialCandidateEvent[],
    rows: SocialRequestCandidate[],
    jobs: MatchingJob[],
  ): SocialAgentMatchHistoryEntry {
    const snapshotEvents = events
      .filter(
        (event) =>
          event.snapshotId === snapshot.id ||
          (snapshot.taskId !== null && event.taskId === snapshot.taskId) ||
          (snapshot.publicIntentId &&
            event.publicIntentId === snapshot.publicIntentId),
      )
      .slice(0, 12);
    const rowCandidates = rows.filter(
      (row) => row.socialRequestId === snapshot.socialRequestId,
    );
    const snapshotCandidates = Array.isArray(snapshot.candidates)
      ? snapshot.candidates
      : [];
    const candidates =
      rowCandidates.length > 0
        ? rowCandidates.slice(0, 8).map((row) => this.candidateFromRow(row))
        : snapshotCandidates
            .slice(0, 8)
            .map((candidate) => this.candidateFromSnapshot(candidate));
    const job = jobs.find((item) => item.id === snapshot.matchingJobId);
    return {
      snapshotId: snapshot.id,
      taskId: snapshot.taskId,
      socialRequestId: snapshot.socialRequestId,
      publicIntentId: snapshot.publicIntentId,
      matchingJobId: snapshot.matchingJobId,
      matchingJobStatus: job?.status ?? null,
      candidateCount: snapshot.candidateCount,
      createdAt: snapshot.createdAt?.toISOString() ?? null,
      sourceVersion: snapshot.sourceVersion,
      scoreVersion: snapshot.scoreVersion,
      constraintsSummary: this.constraintsSummary(snapshot.constraints),
      candidates,
      recentEvents: snapshotEvents.map((event) => this.eventSummary(event)),
      feedbackSummary: this.feedbackSummary(snapshotEvents),
    };
  }

  private entriesFromCandidateRows(
    rows: SocialRequestCandidate[],
  ): SocialAgentMatchHistoryEntry[] {
    const groups = new Map<number, SocialRequestCandidate[]>();
    for (const row of rows) {
      const existing = groups.get(row.socialRequestId) ?? [];
      existing.push(row);
      groups.set(row.socialRequestId, existing);
    }
    return [...groups.entries()].map(([socialRequestId, candidates]) => ({
      snapshotId: null,
      taskId: null,
      socialRequestId,
      publicIntentId: candidates[0]?.publicIntentId ?? null,
      matchingJobId: null,
      matchingJobStatus: null,
      candidateCount: candidates.length,
      createdAt: candidates[0]?.updatedAt?.toISOString() ?? null,
      sourceVersion: '',
      scoreVersion: candidates[0]?.scoreVersion ?? '',
      constraintsSummary: [],
      candidates: candidates
        .slice(0, 8)
        .map((row) => this.candidateFromRow(row)),
      recentEvents: [],
      feedbackSummary: this.feedbackSummary([]),
    }));
  }

  private candidateFromRow(
    row: SocialRequestCandidate,
  ): SocialAgentMatchHistoryCandidate {
    return {
      candidateUserId: row.candidateUserId,
      candidateRecordId: row.id,
      displayName: `用户 #${row.candidateUserId}`,
      status: row.status,
      rankPosition: row.rankPosition,
      publicIntentId: row.publicIntentId,
      reasons: this.stringList(row.reasons).slice(0, 6),
      commonTags: this.stringList(row.commonTags).slice(0, 8),
      whyYouMayLike: this.string(row.explanation?.whyYouMayLike),
      latestAction: row.userAction,
    };
  }

  private candidateFromSnapshot(
    value: Record<string, unknown>,
  ): SocialAgentMatchHistoryCandidate {
    return {
      candidateUserId: this.number(value.candidateUserId),
      candidateRecordId: this.number(value.candidateRecordId),
      displayName:
        this.string(value.displayName) ||
        (this.number(value.candidateUserId)
          ? `用户 #${this.number(value.candidateUserId)}`
          : '候选人'),
      status: this.string(value.status),
      rankPosition: this.number(value.rankPosition),
      publicIntentId: this.string(value.publicIntentId) || null,
      reasons: this.stringList(value.explanationSteps).slice(0, 6),
      commonTags: this.stringList(value.commonTags).slice(0, 8),
      whyYouMayLike: this.string(value.whyYouMayLike),
      latestAction: '',
    };
  }

  private eventSummary(
    event: SocialCandidateEvent,
  ): SocialAgentMatchHistoryEventSummary {
    return {
      id: event.id,
      eventType: event.eventType,
      candidateUserId: event.candidateUserId,
      candidateRecordId: event.candidateRecordId,
      createdAt: event.createdAt?.toISOString() ?? '',
      source: event.source,
      summary:
        this.string(event.payload?.summary) ||
        this.string(event.payload?.reason) ||
        this.string(event.metadata?.reason) ||
        event.eventType,
    };
  }

  private feedbackSummary(events: SocialCandidateEvent[]) {
    const count = (types: SocialCandidateEventType[]) =>
      events.filter((event) => types.includes(event.eventType)).length;
    return {
      saved: count(['candidate_saved']),
      skipped: count(['candidate_skipped']),
      openerPreviewed: count(['opener_previewed', 'opener_regenerated']),
      inviteSent: count(['invite_sent']),
      connected: count(['connect_established']),
      activityCompleted: count(['activity_completed']),
      reviewSubmitted: count(['review_submitted']),
    };
  }

  private constraintsSummary(value: Record<string, unknown>): string[] {
    return Object.entries(value ?? {})
      .map(([key, raw]) => {
        const text = this.string(raw);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  private limit(value: number | null | undefined): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 10;
    return Math.min(50, Math.max(1, Math.trunc(numeric)));
  }

  private number(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private string(value: unknown): string {
    if (typeof value === 'string') return value.trim().slice(0, 240);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.string(item))
      .filter(Boolean)
      .slice(0, 20);
  }
}
