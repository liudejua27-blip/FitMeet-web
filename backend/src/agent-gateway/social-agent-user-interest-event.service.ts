import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import {
  SocialAgentUserInterestEvent,
  SocialAgentUserInterestEventType,
} from './entities/social-agent-user-interest-event.entity';

export type SocialAgentUserInterestEventInput = {
  ownerUserId: number;
  agentTaskId?: number | null;
  eventType: SocialAgentUserInterestEventType;
  targetUserId?: number | null;
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  activityId?: number | null;
  weight?: number | null;
  activityTags?: string[] | null;
  candidatePreferenceTags?: string[] | null;
  city?: string | null;
  locationText?: string | null;
  timeWindow?: string | null;
  source?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SocialAgentUserInterestSummary = {
  ownerUserId: number;
  eventCount: number;
  positiveTargetUserIds: number[];
  negativeTargetUserIds: number[];
  activityTagWeights: Array<{ tag: string; weight: number }>;
  candidatePreferenceWeights: Array<{ tag: string; weight: number }>;
  cityWeights: Array<{ tag: string; weight: number }>;
  locationWeights: Array<{ tag: string; weight: number }>;
  timeWindowWeights: Array<{ tag: string; weight: number }>;
};

@Injectable()
export class SocialAgentUserInterestEventService {
  private readonly logger = new Logger(
    SocialAgentUserInterestEventService.name,
  );

  constructor(
    @InjectRepository(SocialAgentUserInterestEvent)
    private readonly repo: Repository<SocialAgentUserInterestEvent>,
  ) {}

  async recordEvent(
    input: SocialAgentUserInterestEventInput,
  ): Promise<SocialAgentUserInterestEvent | null> {
    if (!Number.isFinite(input.ownerUserId) || input.ownerUserId <= 0) {
      return null;
    }
    const event = this.repo.create({
      ownerUserId: input.ownerUserId,
      agentTaskId: this.number(input.agentTaskId),
      eventType: input.eventType,
      targetUserId: this.number(input.targetUserId),
      candidateRecordId: this.number(input.candidateRecordId),
      socialRequestId: this.number(input.socialRequestId),
      activityId: this.number(input.activityId),
      weight: this.weightFor(input.eventType, input.weight),
      activityTags: this.cleanList(input.activityTags),
      candidatePreferenceTags: this.cleanList(input.candidatePreferenceTags),
      city: this.clean(input.city, 120),
      locationText: this.clean(input.locationText, 160),
      timeWindow: this.clean(input.timeWindow, 120),
      source: this.clean(input.source, 80) || 'agent_web',
      dedupeKey: this.clean(input.dedupeKey, 240),
      metadata: this.sanitizeMetadata(input.metadata),
    });
    try {
      return await this.repo.save(event);
    } catch (error) {
      if (this.isDuplicate(error)) return null;
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.user_interest_event.write_failed',
          ownerUserId: input.ownerUserId,
          eventType: input.eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async summarizeForUser(input: {
    ownerUserId: number;
    limit?: number;
  }): Promise<SocialAgentUserInterestSummary> {
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 200), 1), 1000);
    const rows = await this.repo.find({
      where: { ownerUserId: input.ownerUserId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const summary: SocialAgentUserInterestSummary = {
      ownerUserId: input.ownerUserId,
      eventCount: rows.length,
      positiveTargetUserIds: [],
      negativeTargetUserIds: [],
      activityTagWeights: [],
      candidatePreferenceWeights: [],
      cityWeights: [],
      locationWeights: [],
      timeWindowWeights: [],
    };
    const positiveTargetIds = new Map<number, number>();
    const negativeTargetIds = new Map<number, number>();
    const activityWeights = new Map<string, number>();
    const preferenceWeights = new Map<string, number>();
    const cityWeights = new Map<string, number>();
    const locationWeights = new Map<string, number>();
    const timeWeights = new Map<string, number>();
    const referenceTime = this.latestEventTime(rows);

    for (const row of rows) {
      const weight = this.recencyAdjustedWeight(row, referenceTime);
      if (row.targetUserId && weight > 0) {
        positiveTargetIds.set(
          row.targetUserId,
          (positiveTargetIds.get(row.targetUserId) ?? 0) + weight,
        );
      }
      if (row.targetUserId && weight < 0) {
        negativeTargetIds.set(
          row.targetUserId,
          (negativeTargetIds.get(row.targetUserId) ?? 0) + Math.abs(weight),
        );
      }
      this.addWeights(activityWeights, row.activityTags, weight);
      this.addWeights(preferenceWeights, row.candidatePreferenceTags, weight);
      this.addWeight(cityWeights, row.city, weight);
      this.addWeight(locationWeights, row.locationText, weight);
      this.addWeight(timeWeights, row.timeWindow, weight);
    }

    summary.positiveTargetUserIds = this.sortedIds(positiveTargetIds);
    summary.negativeTargetUserIds = this.sortedIds(negativeTargetIds);
    summary.activityTagWeights = this.sortedWeights(activityWeights);
    summary.candidatePreferenceWeights = this.sortedWeights(preferenceWeights);
    summary.cityWeights = this.sortedWeights(cityWeights);
    summary.locationWeights = this.sortedWeights(locationWeights);
    summary.timeWindowWeights = this.sortedWeights(timeWeights);
    return summary;
  }

  eventFromCandidateAction(input: {
    action: string;
    ownerUserId: number;
    agentTaskId?: number | null;
    targetUserId?: number | null;
    candidateRecordId?: number | null;
    socialRequestId?: number | null;
    candidate?: Record<string, unknown> | null;
    dedupeKey?: string | null;
  }): SocialAgentUserInterestEventInput | null {
    const eventType = this.eventTypeForCandidateAction(input.action);
    if (!eventType) return null;
    const candidate = input.candidate ?? {};
    return {
      ownerUserId: input.ownerUserId,
      agentTaskId: input.agentTaskId,
      eventType,
      targetUserId: input.targetUserId,
      candidateRecordId: input.candidateRecordId,
      socialRequestId: input.socialRequestId,
      weight: this.weightFor(eventType),
      activityTags: this.cleanList([
        ...this.list(candidate.interests),
        ...this.list(candidate.interestTags),
        ...this.list(candidate.commonTags),
        this.clean(candidate.activity, 80),
        this.clean(candidate.activityType, 80),
      ]),
      candidatePreferenceTags: this.cleanList([
        ...this.list(candidate.matchReasons),
        ...this.list(candidate.reasons),
        ...this.list(candidate.tags),
      ]),
      city: this.clean(candidate.city, 120),
      locationText:
        this.clean(candidate.locationText, 160) ||
        this.clean(candidate.area, 160) ||
        this.clean(candidate.distanceLabel, 160),
      timeWindow:
        this.clean(candidate.timeWindow, 120) ||
        this.clean(candidate.timeLabel, 120),
      source: 'agent_candidate_card',
      dedupeKey: input.dedupeKey,
      metadata: {
        action: input.action,
        displayName:
          this.clean(candidate.displayName, 120) ||
          this.clean(candidate.nickname, 120),
      },
    };
  }

  private eventTypeForCandidateAction(
    action: string,
  ): SocialAgentUserInterestEventType | null {
    switch (action) {
      case 'candidate.view_detail':
      case 'candidate.view':
      case 'view_candidate':
      case 'view_profile':
        return 'view_profile';
      case 'candidate.like':
      case 'candidate.save':
      case 'save_candidate':
      case 'favorite_candidate':
        return 'save_candidate';
      case 'candidate.skip':
      case 'skip_candidate':
      case 'candidate.dislike':
        return 'skip_candidate';
      case 'candidate.more_like_this':
      case 'more_like_this':
        return 'more_like_this';
      case 'candidate.generate_opener':
      case 'generate_opener':
      case 'draft_opener':
        return 'generate_opener';
      case 'opener.confirm_send':
      case 'candidate.send_invite':
      case 'send_invite':
      case 'send_candidate_message':
        return 'send_invite';
      case 'candidate.connect':
      case 'connect_candidate':
      case 'candidate.chat':
      case 'candidate.connect_and_chat':
        return 'connect_candidate';
      default:
        return null;
    }
  }

  private weightFor(
    eventType: SocialAgentUserInterestEventType,
    explicit?: number | null,
  ): number {
    if (Number.isFinite(explicit)) return Number(explicit);
    switch (eventType) {
      case 'skip_candidate':
      case 'review_negative':
        return -3;
      case 'invite_accepted':
        return 6;
      case 'save_candidate':
      case 'more_like_this':
      case 'send_invite':
      case 'connect_candidate':
      case 'activity_complete':
      case 'review_positive':
        return 4;
      case 'generate_opener':
      case 'discover_click':
        return 2;
      case 'view_profile':
      case 'chat_topic':
      default:
        return 1;
    }
  }

  private sortedIds(map: Map<number, number>): number[] {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, 20);
  }

  private sortedWeights(
    map: Map<string, number>,
  ): Array<{ tag: string; weight: number }> {
    return [...map.entries()]
      .filter(([, weight]) => weight !== 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, weight]) => ({
        tag,
        weight: Math.round(weight * 100) / 100,
      }));
  }

  private latestEventTime(rows: SocialAgentUserInterestEvent[]): number {
    const times = rows
      .map((row) => row.createdAt?.getTime?.() ?? Number.NaN)
      .filter((time) => Number.isFinite(time));
    return times.length > 0 ? Math.max(...times) : Date.now();
  }

  private recencyAdjustedWeight(
    row: SocialAgentUserInterestEvent,
    referenceTime: number,
  ): number {
    const weight = Number.isFinite(row.weight) ? row.weight : 0;
    const createdAt = row.createdAt?.getTime?.();
    if (!Number.isFinite(createdAt)) return weight;
    const ageDays = Math.max(
      0,
      (referenceTime - Number(createdAt)) / 86_400_000,
    );
    if (ageDays <= 7) return weight;
    if (ageDays <= 30) return weight * 0.75;
    if (ageDays <= 90) return weight * 0.45;
    return weight * 0.25;
  }

  private addWeights(
    map: Map<string, number>,
    values: string[] | null | undefined,
    weight: number,
  ): void {
    for (const value of values ?? []) this.addWeight(map, value, weight);
  }

  private addWeight(
    map: Map<string, number>,
    value: string | null | undefined,
    weight: number,
  ): void {
    const cleaned = this.clean(value, 80);
    if (!cleaned || weight === 0) return;
    map.set(cleaned, (map.get(cleaned) ?? 0) + weight);
  }

  private list(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return this.cleanList(value.map((item) => this.clean(item, 80)));
  }

  private cleanList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .map((item) => this.clean(item, 80))
          .filter((item): item is string => Boolean(item)),
      ),
    ].slice(0, 20);
  }

  private sanitizeMetadata(
    value: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 20)) {
      if (item == null) continue;
      if (typeof item === 'string') out[key] = this.clean(item, 240);
      else if (typeof item === 'number' || typeof item === 'boolean') {
        out[key] = item;
      }
    }
    return out;
  }

  private clean(value: unknown, maxLength: number): string | null {
    const cleaned = cleanDisplayText(value, '').trim();
    return cleaned ? cleaned.slice(0, maxLength) : null;
  }

  private number(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private isDuplicate(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: unknown } | null)?.code;
    return code === '23505' || /duplicate key|unique constraint/i.test(message);
  }
}
