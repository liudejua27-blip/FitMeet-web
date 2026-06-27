import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
  CandidateSearchIndexStatus,
} from './entities/candidate-search-index.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { isSocialAgentActivePublicIntent } from './social-agent-candidate-pool-eligibility';

export type CandidateSearchIndexQuery = {
  ownerUserId?: number | null;
  city?: string | null;
  activityTypes?: string[];
  interestTags?: string[];
  timeBuckets?: string[];
  includeProfiles?: boolean;
  includePublicIntents?: boolean;
  limit?: number;
};

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 200;

@Injectable()
export class CandidateSearchIndexService {
  constructor(
    @InjectRepository(CandidateSearchIndex)
    private readonly indexRepo: Repository<CandidateSearchIndex>,
    @InjectRepository(UserSocialProfile)
    private readonly profileRepo: Repository<UserSocialProfile>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
  ) {}

  async upsertFromSocialProfile(
    userId: number,
  ): Promise<CandidateSearchIndex | null> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      await this.indexRepo.delete({
        sourceType: CandidateSearchIndexSourceType.Profile,
        sourceId: String(userId),
      });
      return null;
    }

    const optedIn =
      profile.profileDiscoverable === true ||
      profile.agentCanRecommendMe === true;

    const projection = await this.saveProjection({
      sourceType: CandidateSearchIndexSourceType.Profile,
      sourceId: String(userId),
      sourceVersion: String(profile.profileVersion ?? 0),
      userId,
      publicIntentId: null,
      linkedSocialRequestId: null,
      isRealUser: true,
      profileDiscoverable: profile.profileDiscoverable === true,
      agentCanRecommendMe: profile.agentCanRecommendMe === true,
      agentCanStartChatAfterApproval:
        profile.agentCanStartChatAfterApproval === true,
      status: optedIn
        ? CandidateSearchIndexStatus.Active
        : CandidateSearchIndexStatus.Paused,
      displayName: firstNonEmpty(profile.nickname, profile.primaryPurpose),
      city: cleanText(profile.city),
      areaText: cleanText(profile.nearbyArea),
      lat: null,
      lng: null,
      radiusKm: positiveInt(profile.defaultMatchRadiusKm, 20),
      activityTypes: uniqueStrings([
        ...arrayFrom(profile.fitnessGoals),
        ...arrayFrom(profile.socialScenes),
        ...arrayFrom(profile.interestTags),
      ]),
      interestTags: uniqueStrings([
        ...arrayFrom(profile.interestTags),
        ...arrayFrom(profile.wantToMeet),
        ...arrayFrom(profile.preferredTraits),
      ]),
      lifestyleTags: uniqueStrings([
        ...arrayFrom(profile.lifestyleTags),
        ...arrayFrom(profile.traits),
      ]),
      socialScenes: uniqueStrings(arrayFrom(profile.socialScenes)),
      relationshipGoals: uniqueStrings(arrayFrom(profile.relationshipGoals)),
      timeBuckets: uniqueStrings([
        ...arrayFrom(profile.availableTimes),
        profile.weekdayAvailability,
        profile.weekendAvailability,
      ]),
      publicSummary: cleanText(profile.aiSummary || profile.socialPreference),
      publicSafetyNotes: uniqueStrings([
        profile.privacyBoundary,
        profile.rejectRules,
      ]),
      safetyFlags: {
        hideSensitiveTags: profile.hideSensitiveTags === true,
      },
      trustScore: 0,
      profileCompleteness: estimateProfileCompleteness(profile),
      lastActiveAt: profile.updatedAt ?? null,
      sourceUpdatedAt: profile.updatedAt ?? null,
    });

    return optedIn ? projection : null;
  }

  async upsertFromPublicIntent(
    publicIntentId: string,
  ): Promise<CandidateSearchIndex | null> {
    const intent = await this.publicIntentRepo.findOne({
      where: { id: publicIntentId },
    });
    if (!intent || !isEligiblePublicIntent(intent)) {
      await this.removePublicIntent(publicIntentId);
      return null;
    }

    return this.saveProjection({
      sourceType: CandidateSearchIndexSourceType.PublicIntent,
      sourceId: intent.id,
      sourceVersion: `${intent.status}:${intent.updatedAt?.toISOString() ?? ''}`,
      userId: intent.userId,
      publicIntentId: intent.id,
      linkedSocialRequestId: intent.linkedSocialRequestId,
      isRealUser: intent.userId !== null,
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: false,
      status: CandidateSearchIndexStatus.Active,
      displayName: cleanText(intent.title),
      city: cleanText(intent.city),
      areaText: firstNonEmpty(intent.loc, intent.locationPreference),
      lat: intent.lat,
      lng: intent.lng,
      radiusKm: positiveInt(intent.radiusKm, 5),
      activityTypes: uniqueStrings([
        intent.requestType,
        ...arrayFrom(intent.interestTags),
        ...stringsFromRecord(intent.filters, [
          'activityType',
          'activity',
          'sport',
          'scene',
        ]),
      ]),
      interestTags: uniqueStrings([
        ...arrayFrom(intent.interestTags),
        ...stringsFromRecord(intent.filters, ['interestTags', 'tags']),
      ]),
      lifestyleTags: [],
      socialScenes: uniqueStrings([
        intent.requestType,
        ...stringsFromRecord(intent.filters, ['socialScenes', 'scene']),
      ]),
      relationshipGoals: uniqueStrings([
        intent.socialGoal,
        ...stringsFromRecord(intent.filters, ['relationshipGoals', 'goal']),
      ]),
      timeBuckets: uniqueStrings([
        intent.timePreference,
        ...stringsFromRecord(intent.filters, ['time', 'timePreference']),
      ]),
      publicSummary: firstNonEmpty(intent.description, intent.socialGoal),
      publicSafetyNotes: uniqueStrings([
        `risk:${intent.riskLevel}`,
        intent.requiresUserConfirmation ? 'requires_confirmation' : '',
      ]),
      safetyFlags: {
        riskLevel: intent.riskLevel,
        requiresUserConfirmation: intent.requiresUserConfirmation === true,
      },
      trustScore: 0,
      profileCompleteness: 0,
      lastActiveAt: intent.updatedAt ?? null,
      sourceUpdatedAt: intent.updatedAt ?? null,
    });
  }

  async removePublicIntent(publicIntentId: string): Promise<void> {
    await this.indexRepo.update(
      {
        sourceType: CandidateSearchIndexSourceType.PublicIntent,
        sourceId: publicIntentId,
      },
      {
        status: CandidateSearchIndexStatus.Removed,
        sourceUpdatedAt: new Date(),
      },
    );
  }

  async markUserPaused(userId: number): Promise<void> {
    await this.indexRepo.update(
      { userId, status: CandidateSearchIndexStatus.Active },
      {
        status: CandidateSearchIndexStatus.Paused,
        sourceUpdatedAt: new Date(),
      },
    );
  }

  async markUserBlocked(userId: number): Promise<void> {
    await this.indexRepo.update(
      { userId },
      {
        status: CandidateSearchIndexStatus.Blocked,
        sourceUpdatedAt: new Date(),
      },
    );
  }

  async search(
    query: CandidateSearchIndexQuery,
  ): Promise<CandidateSearchIndex[]> {
    const limit = clampLimit(query.limit);
    const includeProfiles = query.includeProfiles !== false;
    const includePublicIntents = query.includePublicIntents !== false;
    const sourceTypes = [
      includeProfiles ? CandidateSearchIndexSourceType.Profile : null,
      includePublicIntents ? CandidateSearchIndexSourceType.PublicIntent : null,
    ].filter(Boolean) as CandidateSearchIndexSourceType[];
    if (sourceTypes.length === 0) return [];

    const qb = this.indexRepo
      .createQueryBuilder('candidate')
      .where('candidate.status = :status', {
        status: CandidateSearchIndexStatus.Active,
      })
      .andWhere('candidate.sourceType IN (:...sourceTypes)', { sourceTypes });

    const city = cleanText(query.city);
    if (city) qb.andWhere('candidate.city = :city', { city });
    if (query.ownerUserId)
      qb.andWhere('(candidate.userId IS NULL OR candidate.userId <> :owner)', {
        owner: query.ownerUserId,
      });

    const rows = await qb
      .orderBy('candidate.lastActiveAt', 'DESC', 'NULLS LAST')
      .addOrderBy('candidate.trustScore', 'DESC')
      .addOrderBy('candidate.updatedAt', 'DESC')
      .take(limit * 3)
      .getMany();

    return rows.filter((row) => matchesQuery(row, query)).slice(0, limit);
  }

  private async saveProjection(
    projection: Partial<CandidateSearchIndex> &
      Pick<CandidateSearchIndex, 'sourceType' | 'sourceId'>,
  ): Promise<CandidateSearchIndex> {
    const existing = await this.indexRepo.findOne({
      where: {
        sourceType: projection.sourceType,
        sourceId: projection.sourceId,
      },
    });
    const entity = Object.assign(
      existing ?? this.indexRepo.create(),
      projection,
    );
    return this.indexRepo.save(entity);
  }
}

function isEligiblePublicIntent(intent: PublicSocialIntent): boolean {
  if (!isSocialAgentActivePublicIntent(intent)) return false;
  if (intent.status === SocialRequestStatus.Cancelled) return false;
  if (intent.closesAt && intent.closesAt.getTime() <= Date.now()) return false;
  const tombstoned = Boolean(intent.metadata?.tombstoned);
  return !tombstoned;
}

function matchesQuery(
  row: CandidateSearchIndex,
  query: CandidateSearchIndexQuery,
): boolean {
  const activities = normalizedNeedles(query.activityTypes);
  if (
    activities.length > 0 &&
    !hasOverlap(activities, [
      row.activityTypes,
      row.interestTags,
      row.socialScenes,
      row.publicSummary,
    ])
  ) {
    return false;
  }

  const interests = normalizedNeedles(query.interestTags);
  if (
    interests.length > 0 &&
    !hasOverlap(interests, [
      row.interestTags,
      row.lifestyleTags,
      row.relationshipGoals,
      row.publicSummary,
    ])
  ) {
    return false;
  }

  const timeBuckets = normalizedNeedles(query.timeBuckets);
  if (
    timeBuckets.length > 0 &&
    !hasOverlap(timeBuckets, [row.timeBuckets, row.publicSummary])
  ) {
    return false;
  }
  return true;
}

function hasOverlap(needles: string[], haystacks: unknown[]): boolean {
  const text = haystacks
    .flatMap((item) => arrayFrom(item))
    .join(' ')
    .toLowerCase();
  return needles.some((needle) => text.includes(needle));
}

function normalizedNeedles(value: unknown): string[] {
  return arrayFrom(value).map((item) => item.toLowerCase());
}

function arrayFrom(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === 'string') {
    return uniqueStrings(value.split(/[,，、/|]/g));
  }
  return [];
}

function stringsFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
): string[] {
  if (!record || typeof record !== 'object') return [];
  return keys.flatMap((key) => arrayFrom(record[key]));
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_LIMIT;
  return Math.min(Math.round(parsed), MAX_SEARCH_LIMIT);
}

function estimateProfileCompleteness(profile: UserSocialProfile): number {
  const fields: unknown[] = [
    profile.city,
    profile.nearbyArea,
    profile.interestTags,
    profile.relationshipGoals,
    profile.availableTimes,
    profile.privacyBoundary,
    profile.aiSummary,
    profile.wantToMeet,
  ];
  const filled = fields.filter((value) => arrayFrom(value).length > 0).length;
  return Math.round((filled / fields.length) * 100);
}
