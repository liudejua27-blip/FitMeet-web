import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ObjectLiteral, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import {
  SocialCandidateEvent,
  type SocialCandidateEventType,
} from './entities/social-candidate-event.entity';
import {
  SocialCandidateSnapshot,
  type SocialCandidateSnapshotType,
} from './entities/social-candidate-snapshot.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';

type CandidateAuditRepository<T extends ObjectLiteral> = Pick<
  Repository<T>,
  'create' | 'find' | 'findOne' | 'save' | 'manager'
>;

type CandidateAuditManager = Pick<EntityManager, 'getRepository'>;

type CreateCandidateSnapshotInput = {
  ownerUserId: number;
  taskId?: number | null;
  socialRequestId?: number | null;
  publicIntentId?: string | null;
  matchingJobId?: number | null;
  snapshotType: SocialCandidateSnapshotType;
  sourceVersion?: string | null;
  scoreVersion?: string | null;
  query?: unknown;
  constraints?: unknown;
  candidates?: unknown[];
  debug?: unknown;
  metadata?: Record<string, unknown> | null;
};

type RecordCandidateEventInput = {
  ownerUserId: number;
  taskId?: number | null;
  snapshotId?: number | null;
  socialRequestId?: number | null;
  publicIntentId?: string | null;
  matchingJobId?: number | null;
  candidateUserId?: number | null;
  candidateRecordId?: number | null;
  eventType: SocialCandidateEventType;
  idempotencyKey?: string | null;
  source?: string | null;
  payload?: unknown;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class SocialCandidateAuditService {
  private readonly logger = new Logger(SocialCandidateAuditService.name);

  constructor(
    @InjectRepository(SocialCandidateSnapshot)
    private readonly snapshotRepo: Repository<SocialCandidateSnapshot>,
    @InjectRepository(SocialCandidateEvent)
    private readonly eventRepo: Repository<SocialCandidateEvent>,
  ) {}

  async createSnapshot(
    input: CreateCandidateSnapshotInput,
    manager?: CandidateAuditManager | null,
  ): Promise<SocialCandidateSnapshot> {
    const repo = this.snapshotRepository(manager);
    const publicIntentId = await this.safePublicIntentIdForSnapshot(
      repo,
      input.publicIntentId,
    );
    const candidates = (
      Array.isArray(input.candidates) ? input.candidates : []
    ).map((candidate, index) => this.summarizeCandidate(candidate, index));
    const snapshot = repo.create({
      ownerUserId: input.ownerUserId,
      taskId: this.number(input.taskId),
      socialRequestId: this.number(input.socialRequestId),
      publicIntentId,
      matchingJobId: this.number(input.matchingJobId),
      snapshotType: input.snapshotType,
      sourceVersion: this.safeVarchar(input.sourceVersion, 128),
      scoreVersion: this.safeVarchar(input.scoreVersion, 80),
      candidateCount: candidates.length,
      query: this.sanitizeRecord(input.query),
      constraints: this.sanitizeRecord(input.constraints),
      candidates,
      debug: this.sanitizeRecord(input.debug),
      metadata: this.sanitizeRecord(input.metadata ?? {}),
    });
    return repo.save(snapshot);
  }

  private async safePublicIntentIdForSnapshot(
    repo: CandidateAuditRepository<SocialCandidateSnapshot>,
    value: unknown,
  ): Promise<string | null> {
    const publicIntentId = this.safeVarchar(value, 80) || null;
    if (!publicIntentId) return null;
    const exists = await repo.manager
      .getRepository(PublicSocialIntent)
      .exist({ where: { id: publicIntentId } });
    if (exists) return publicIntentId;
    this.logger.warn({
      event: 'social_candidate_audit.snapshot_public_intent_missing',
      publicIntentId,
    });
    return null;
  }

  async recordEvent(
    input: RecordCandidateEventInput,
  ): Promise<SocialCandidateEvent> {
    const idempotencyKey = this.safeVarchar(input.idempotencyKey, 180) || null;
    if (idempotencyKey) {
      const existing = await this.eventRepo.findOne({
        where: {
          ownerUserId: input.ownerUserId,
          eventType: input.eventType,
          idempotencyKey,
        },
      });
      if (existing) return existing;
    }
    const event = this.eventRepo.create({
      ownerUserId: input.ownerUserId,
      taskId: this.number(input.taskId),
      snapshotId: this.number(input.snapshotId),
      socialRequestId: this.number(input.socialRequestId),
      publicIntentId: this.safeVarchar(input.publicIntentId, 80) || null,
      matchingJobId: this.number(input.matchingJobId),
      candidateUserId: this.number(input.candidateUserId),
      candidateRecordId: this.number(input.candidateRecordId),
      eventType: input.eventType,
      idempotencyKey,
      source: this.safeVarchar(input.source, 80) || 'agent',
      payload: this.sanitizeRecord(input.payload),
      metadata: this.sanitizeRecord(input.metadata ?? {}),
    });
    try {
      return await this.eventRepo.save(event);
    } catch (error) {
      if (idempotencyKey && this.isUniqueViolation(error)) {
        const existing = await this.eventRepo.findOne({
          where: {
            ownerUserId: input.ownerUserId,
            eventType: input.eventType,
            idempotencyKey,
          },
        });
        if (existing) return existing;
      }
      this.logger.warn({
        event: 'social_candidate_audit.event_write_failed',
        ownerUserId: input.ownerUserId,
        eventType: input.eventType,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  listRecentSnapshots(input?: {
    ownerUserId?: number | null;
    taskId?: number | null;
    publicIntentId?: string | null;
    matchingJobId?: number | null;
    limit?: number | null;
  }): Promise<SocialCandidateSnapshot[]> {
    return this.snapshotRepo.find({
      where: {
        ...(this.number(input?.ownerUserId)
          ? { ownerUserId: this.number(input?.ownerUserId) as number }
          : {}),
        ...(this.number(input?.taskId)
          ? { taskId: this.number(input?.taskId) as number }
          : {}),
        ...(this.safeVarchar(input?.publicIntentId, 80)
          ? { publicIntentId: this.safeVarchar(input?.publicIntentId, 80) }
          : {}),
        ...(this.number(input?.matchingJobId)
          ? { matchingJobId: this.number(input?.matchingJobId) as number }
          : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.limit(input?.limit),
    });
  }

  listRecentEvents(input?: {
    ownerUserId?: number | null;
    taskId?: number | null;
    snapshotId?: number | null;
    eventType?: string | null;
    limit?: number | null;
  }): Promise<SocialCandidateEvent[]> {
    return this.eventRepo.find({
      where: {
        ...(this.number(input?.ownerUserId)
          ? { ownerUserId: this.number(input?.ownerUserId) as number }
          : {}),
        ...(this.number(input?.taskId)
          ? { taskId: this.number(input?.taskId) as number }
          : {}),
        ...(this.number(input?.snapshotId)
          ? { snapshotId: this.number(input?.snapshotId) as number }
          : {}),
        ...(this.safeVarchar(input?.eventType, 80)
          ? {
              eventType: this.safeVarchar(
                input?.eventType,
                80,
              ) as SocialCandidateEventType,
            }
          : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.limit(input?.limit),
    });
  }

  private snapshotRepository(
    manager?: CandidateAuditManager | null,
  ): CandidateAuditRepository<SocialCandidateSnapshot> {
    return manager
      ? manager.getRepository(SocialCandidateSnapshot)
      : this.snapshotRepo;
  }

  private summarizeCandidate(
    value: unknown,
    index: number,
  ): Record<string, unknown> {
    const record = this.record(value);
    const candidateUserId = this.number(
      record.candidateUserId ?? record.targetUserId ?? record.userId,
    );
    return sanitizeForDisplay({
      rankPosition: this.number(record.rankPosition) ?? index + 1,
      source: this.safeVarchar(record.source, 40) || 'profile_candidate',
      candidateUserId,
      targetUserId: candidateUserId,
      publicIntentId: this.safeVarchar(record.publicIntentId, 80) || null,
      socialRequestId: this.number(record.socialRequestId),
      candidateRecordId: this.number(record.candidateRecordId),
      activityId: this.number(record.activityId),
      displayName:
        this.safeVarchar(record.displayName ?? record.nickname, 80) ||
        (candidateUserId ? `用户 #${candidateUserId}` : '候选人'),
      city: this.safeVarchar(record.city, 80),
      area: this.safeVarchar(record.area, 120),
      distanceKm: this.number(record.distanceKm),
      timeLabel: this.safeVarchar(record.timeLabel, 120),
      locationText: this.safeVarchar(record.locationText, 160),
      interestTags: this.stringList(record.interestTags).slice(0, 12),
      commonTags: this.stringList(record.commonTags).slice(0, 12),
      matchScore: this.number(record.matchScore ?? record.score),
      score: this.number(record.score ?? record.matchScore),
      scoreVersion: this.safeVarchar(record.scoreVersion, 80),
      scoreBreakdown: this.sanitizeRecord(record.scoreBreakdown),
      explanationSteps: this.stringList(record.explanationSteps).slice(0, 5),
      whyYouMayLike: this.safeText(record.whyYouMayLike, 240),
      riskLevel: this.safeVarchar(this.record(record.risk).level, 40),
      riskWarnings: this.stringList(
        this.record(record.risk).warnings ?? record.riskWarnings,
      ).slice(0, 8),
      status: this.safeVarchar(record.status, 60),
    }) as Record<string, unknown>;
  }

  private sanitizeRecord(value: unknown): Record<string, unknown> {
    const sanitized = sanitizeForDisplay(this.record(value));
    return this.record(sanitized);
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
          .slice(0, 50)
      : [];
  }

  private safeText(value: unknown, max: number): string {
    return cleanDisplayText(value, '').slice(0, max);
  }

  private safeVarchar(value: unknown, max: number): string {
    return cleanDisplayText(value, '').slice(0, max);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
  }

  private limit(value: unknown): number {
    const num = Number(value);
    return Number.isFinite(num)
      ? Math.max(1, Math.min(Math.floor(num), 200))
      : 50;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      this.record(error).code === '23505' ||
      /duplicate key/i.test(error instanceof Error ? error.message : '')
    );
  }
}
