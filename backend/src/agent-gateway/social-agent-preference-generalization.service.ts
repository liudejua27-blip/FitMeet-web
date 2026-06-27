import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  AgentFeedbackEvent,
  type AgentFeedbackReasonCode,
} from './entities/agent-feedback-event.entity';

export type SocialAgentPreferenceWeight = {
  tag: string;
  weight: number;
  reasons: string[];
};

export type SocialAgentTargetPreferenceWeight = {
  userId: number;
  weight: number;
  reasons: string[];
};

export type SocialAgentPreferenceGeneralizationSummary = {
  version: 'fitmeet.preference_generalization.v1';
  updatedAt: string;
  preferredRadiusKm: number | null;
  targetUserWeights: SocialAgentTargetPreferenceWeight[];
  activityTagWeights: SocialAgentPreferenceWeight[];
  styleWeights: SocialAgentPreferenceWeight[];
  timeBucketWeights: SocialAgentPreferenceWeight[];
  cityWeights: SocialAgentPreferenceWeight[];
  areaWeights: SocialAgentPreferenceWeight[];
  recentReasons: string[];
};

type MutableGeneralization = SocialAgentPreferenceGeneralizationSummary;

const MATRIX_VERSION = 'fitmeet.preference_generalization.v1' as const;
const POSITIVE_REASONS = new Set<AgentFeedbackReasonCode>([
  'good_fit',
  'more_like_this',
  'save_candidate',
  'connect_candidate',
]);
const COMPETITIVE_STYLE_TAGS = ['竞技', '高强度', '猛烈', '硬核', '冲刺'];
const RELAXED_STYLE_TAGS = ['休闲', '低压力', '养生', '轻松', '慢节奏'];

@Injectable()
export class SocialAgentPreferenceGeneralizationService {
  constructor(
    @InjectRepository(UserSocialProfile)
    private readonly profileRepo: Repository<UserSocialProfile>,
  ) {}

  async summarizeForUser(
    ownerUserId: number,
  ): Promise<SocialAgentPreferenceGeneralizationSummary | null> {
    const profile = await this.profileRepo.findOne({
      where: { userId: ownerUserId },
    });
    if (!profile) return null;
    return this.matrixFromProfile(profile);
  }

  async recordFeedback(
    row: AgentFeedbackEvent,
  ): Promise<SocialAgentPreferenceGeneralizationSummary | null> {
    if (!this.shouldGeneralize(row)) return null;
    const profile =
      (await this.profileRepo.findOne({ where: { userId: row.userId } })) ??
      this.profileRepo.create({
        userId: row.userId,
        matchSignals: {},
      });
    const matrix = this.matrixFromProfile(profile);
    const next = this.applyFeedback(matrix, row, profile);
    profile.matchSignals = {
      ...this.record(profile.matchSignals),
      preferenceGeneralization: next,
    };
    await this.profileRepo.save(profile);
    return next;
  }

  private shouldGeneralize(row: AgentFeedbackEvent): boolean {
    if (row.feedbackType !== 'candidate_quality') {
      return ['too_far', 'time_mismatch', 'style_mismatch'].includes(
        row.reasonCode,
      );
    }
    return [
      'good_fit',
      'more_like_this',
      'save_candidate',
      'connect_candidate',
      'bad_fit',
      'too_far',
      'time_mismatch',
      'style_mismatch',
    ].includes(row.reasonCode);
  }

  private applyFeedback(
    matrix: SocialAgentPreferenceGeneralizationSummary,
    row: AgentFeedbackEvent,
    profile: UserSocialProfile,
  ): SocialAgentPreferenceGeneralizationSummary {
    const next = this.cloneMatrix(matrix);
    const metadata = this.record(row.metadata);
    const candidateText = this.candidateText(row);
    const tags = this.extractTags(row);
    const targetUserId = this.number(
      metadata.targetUserId ?? metadata.candidateUserId ?? row.candidateId,
    );
    const reasonLabel = this.reasonLabel(row.reasonCode);

    if (row.reasonCode === 'too_far') {
      const currentRadius =
        next.preferredRadiusKm ??
        this.number(metadata.currentRadiusKm ?? metadata.radiusKm) ??
        profile.defaultMatchRadiusKm ??
        20;
      next.preferredRadiusKm = Math.max(1, Math.floor(currentRadius * 0.8));
      this.addAreaWeights(next, row, -3, reasonLabel);
    }

    if (row.reasonCode === 'time_mismatch') {
      const bucket = this.timeBucket(row);
      if (bucket)
        this.addWeight(next.timeBucketWeights, bucket, -5, reasonLabel);
    }

    if (row.reasonCode === 'style_mismatch') {
      this.applyStyleMismatch(next, candidateText, tags, reasonLabel);
    }

    if (row.reasonCode === 'bad_fit') {
      if (targetUserId) {
        this.addTargetWeight(next, targetUserId, -30, reasonLabel);
      }
      this.addWeakNegativeWeights(next, row, tags, reasonLabel);
    }

    if (POSITIVE_REASONS.has(row.reasonCode)) {
      if (targetUserId) {
        this.addTargetWeight(next, targetUserId, 14, reasonLabel);
      }
      this.addPositiveWeights(next, row, tags, reasonLabel);
    }

    next.updatedAt = new Date().toISOString();
    next.recentReasons = [
      `${reasonLabel}${targetUserId ? ` #${targetUserId}` : ''}`,
      ...next.recentReasons,
    ].slice(0, 12);
    return this.compactMatrix(next);
  }

  private applyStyleMismatch(
    matrix: MutableGeneralization,
    candidateText: string,
    tags: string[],
    reason: string,
  ): void {
    const haystack = [candidateText, ...tags].join(' ');
    let hasCompetitive = false;
    for (const tag of COMPETITIVE_STYLE_TAGS) {
      if (haystack.includes(tag)) {
        hasCompetitive = true;
        this.addWeight(matrix.styleWeights, tag, -5, reason);
      }
    }
    for (const tag of RELAXED_STYLE_TAGS) {
      if (haystack.includes(tag)) {
        this.addWeight(matrix.styleWeights, tag, 3, reason);
      }
    }
    if (!hasCompetitive)
      this.addWeight(matrix.styleWeights, '竞技', -4, reason);
    this.addWeight(matrix.styleWeights, '低压力', 3, reason);
    this.addWeight(matrix.styleWeights, '轻松', 2, reason);
  }

  private addWeakNegativeWeights(
    matrix: MutableGeneralization,
    row: AgentFeedbackEvent,
    tags: string[],
    reason: string,
  ): void {
    for (const tag of tags.slice(0, 8)) {
      this.addWeight(matrix.activityTagWeights, tag, -2, reason);
    }
    const city = this.firstText(
      row.metadata?.city,
      row.metadata?.candidateCity,
    );
    if (city) this.addWeight(matrix.cityWeights, city, -1, reason);
    this.addAreaWeights(matrix, row, -1, reason);
    const timeBucket = this.timeBucket(row);
    if (timeBucket)
      this.addWeight(matrix.timeBucketWeights, timeBucket, -1, reason);
  }

  private addPositiveWeights(
    matrix: MutableGeneralization,
    row: AgentFeedbackEvent,
    tags: string[],
    reason: string,
  ): void {
    for (const tag of tags.slice(0, 8)) {
      this.addWeight(matrix.activityTagWeights, tag, 3, reason);
    }
    const city = this.firstText(
      row.metadata?.city,
      row.metadata?.candidateCity,
    );
    if (city) this.addWeight(matrix.cityWeights, city, 2, reason);
    this.addAreaWeights(matrix, row, 2, reason);
    const timeBucket = this.timeBucket(row);
    if (timeBucket)
      this.addWeight(matrix.timeBucketWeights, timeBucket, 2, reason);
    for (const tag of tags) {
      if (RELAXED_STYLE_TAGS.some((style) => tag.includes(style))) {
        this.addWeight(matrix.styleWeights, tag, 2, reason);
      }
    }
  }

  private addAreaWeights(
    matrix: MutableGeneralization,
    row: AgentFeedbackEvent,
    weight: number,
    reason: string,
  ): void {
    const area = this.firstText(
      row.metadata?.locationText,
      row.metadata?.area,
      row.metadata?.distanceLabel,
    );
    if (area) this.addWeight(matrix.areaWeights, area, weight, reason);
  }

  private addTargetWeight(
    matrix: MutableGeneralization,
    userId: number,
    delta: number,
    reason: string,
  ): void {
    const existing = matrix.targetUserWeights.find(
      (item) => item.userId === userId,
    );
    if (existing) {
      existing.weight = this.clamp(existing.weight + delta, -60, 40);
      existing.reasons = this.unique([reason, ...existing.reasons]).slice(0, 4);
    } else {
      matrix.targetUserWeights.push({
        userId,
        weight: this.clamp(delta, -60, 40),
        reasons: [reason],
      });
    }
  }

  private addWeight(
    weights: SocialAgentPreferenceWeight[],
    tag: string,
    delta: number,
    reason: string,
  ): void {
    const cleaned = cleanDisplayText(tag, '').slice(0, 80);
    if (!cleaned || delta === 0) return;
    const existing = weights.find((item) => item.tag === cleaned);
    if (existing) {
      existing.weight = this.clamp(existing.weight + delta, -30, 30);
      existing.reasons = this.unique([reason, ...existing.reasons]).slice(0, 4);
    } else {
      weights.push({
        tag: cleaned,
        weight: this.clamp(delta, -30, 30),
        reasons: [reason],
      });
    }
  }

  private matrixFromProfile(
    profile: UserSocialProfile,
  ): SocialAgentPreferenceGeneralizationSummary {
    const matchSignals = this.record(profile.matchSignals);
    const raw = this.record(matchSignals.preferenceGeneralization);
    return this.compactMatrix({
      version: MATRIX_VERSION,
      updatedAt: this.text(raw.updatedAt) || new Date(0).toISOString(),
      preferredRadiusKm:
        this.number(raw.preferredRadiusKm) ??
        this.number(raw.radiusHardFilterKm) ??
        null,
      targetUserWeights: this.targetWeights(raw.targetUserWeights),
      activityTagWeights: this.weights(raw.activityTagWeights),
      styleWeights: this.weights(raw.styleWeights),
      timeBucketWeights: this.weights(raw.timeBucketWeights),
      cityWeights: this.weights(raw.cityWeights),
      areaWeights: this.weights(raw.areaWeights),
      recentReasons: this.stringList(raw.recentReasons).slice(0, 12),
    });
  }

  private compactMatrix(
    matrix: SocialAgentPreferenceGeneralizationSummary,
  ): SocialAgentPreferenceGeneralizationSummary {
    return {
      ...matrix,
      targetUserWeights: matrix.targetUserWeights
        .filter((item) => item.weight !== 0)
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, 40),
      activityTagWeights: this.sortedWeights(matrix.activityTagWeights),
      styleWeights: this.sortedWeights(matrix.styleWeights),
      timeBucketWeights: this.sortedWeights(matrix.timeBucketWeights),
      cityWeights: this.sortedWeights(matrix.cityWeights),
      areaWeights: this.sortedWeights(matrix.areaWeights),
      recentReasons: this.unique(matrix.recentReasons).slice(0, 12),
    };
  }

  private cloneMatrix(
    matrix: SocialAgentPreferenceGeneralizationSummary,
  ): SocialAgentPreferenceGeneralizationSummary {
    return JSON.parse(
      JSON.stringify(matrix),
    ) as SocialAgentPreferenceGeneralizationSummary;
  }

  private sortedWeights(
    weights: SocialAgentPreferenceWeight[],
  ): SocialAgentPreferenceWeight[] {
    return weights
      .filter((item) => item.tag && item.weight !== 0)
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 40)
      .map((item) => ({
        tag: item.tag,
        weight: Math.round(item.weight * 100) / 100,
        reasons: this.unique(item.reasons).slice(0, 4),
      }));
  }

  private weights(value: unknown): SocialAgentPreferenceWeight[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.record(item))
      .map((item) => ({
        tag: this.text(item.tag),
        weight: this.number(item.weight) ?? 0,
        reasons: this.stringList(item.reasons).slice(0, 4),
      }))
      .filter((item) => item.tag);
  }

  private targetWeights(value: unknown): SocialAgentTargetPreferenceWeight[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.record(item))
      .map((item) => ({
        userId: this.number(item.userId) ?? 0,
        weight: this.number(item.weight) ?? 0,
        reasons: this.stringList(item.reasons).slice(0, 4),
      }))
      .filter((item) => item.userId > 0);
  }

  private extractTags(row: AgentFeedbackEvent): string[] {
    const metadata = this.record(row.metadata);
    return this.unique([
      ...this.stringList(metadata.activityTags),
      ...this.stringList(metadata.interestTags),
      ...this.stringList(metadata.candidatePreferenceTags),
      ...this.stringList(metadata.tags),
      ...this.stringList(metadata.styleTags),
      this.text(metadata.activity),
      this.text(metadata.activityType),
      this.text(metadata.requestType),
      ...extractTagsFromText(row.freeText),
    ]).slice(0, 16);
  }

  private candidateText(row: AgentFeedbackEvent): string {
    const metadata = this.record(row.metadata);
    return [
      row.freeText,
      metadata.displayName,
      metadata.city,
      metadata.locationText,
      metadata.timeWindow,
      metadata.timeLabel,
      metadata.description,
      ...this.extractTags(row),
    ]
      .map((item) => cleanDisplayText(item, ''))
      .filter(Boolean)
      .join(' ');
  }

  private timeBucket(row: AgentFeedbackEvent): string | null {
    const metadata = this.record(row.metadata);
    return (
      this.firstText(
        metadata.timeBucket,
        metadata.timeWindow,
        metadata.timeLabel,
        metadata.timePreference,
      ) || null
    );
  }

  private reasonLabel(reasonCode: AgentFeedbackReasonCode): string {
    switch (reasonCode) {
      case 'good_fit':
        return '合适';
      case 'more_like_this':
        return '想看更多类似';
      case 'save_candidate':
        return '收藏候选';
      case 'connect_candidate':
        return '联系候选';
      case 'bad_fit':
        return '不合适';
      case 'too_far':
        return '太远';
      case 'time_mismatch':
        return '时间不合';
      case 'style_mismatch':
        return '风格不合';
      default:
        return '候选反馈';
    }
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return this.unique(value.map((item) => this.text(item)).filter(Boolean));
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim().slice(0, 120);
  }

  private firstText(...values: unknown[]): string {
    for (const value of values) {
      const text = this.text(value);
      if (text) return text;
    }
    return '';
  }

  private number(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

function extractTagsFromText(value: unknown): string[] {
  const text = cleanDisplayText(value, '');
  if (!text) return [];
  return [
    ...COMPETITIVE_STYLE_TAGS.filter((tag) => text.includes(tag)),
    ...RELAXED_STYLE_TAGS.filter((tag) => text.includes(tag)),
  ];
}
