import { CandidateFeatureService } from './candidate-feature.service';
import { CandidateRecallIndexService } from './candidate-recall-index.service';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
  CandidateSearchIndexStatus,
} from './entities/candidate-search-index.entity';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

describe('CandidateRecallIndexService', () => {
  it('turns candidate search index rows into scoped recall ids', async () => {
    const search = jest.fn(async () => [
      indexRow({
        sourceType: CandidateSearchIndexSourceType.Profile,
        sourceId: '2',
        userId: 2,
        publicIntentId: null,
      }),
      indexRow({
        sourceType: CandidateSearchIndexSourceType.PublicIntent,
        sourceId: 'intent_9',
        userId: 9,
        publicIntentId: 'intent_9',
      }),
    ]);
    const service = new CandidateRecallIndexService(
      { search } as never,
      new CandidateFeatureService(),
    );

    const result = await service.recallForCandidatePool(
      resolvedQuery({
        city: '青岛',
        activityType: '散步',
        interestTags: ['散步', '低压力'],
        timePreference: '今晚',
      }),
      { ownerUserId: 1, limit: 6 },
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        city: '青岛',
        activityTypes: ['散步'],
        interestTags: ['散步', '低压力'],
        timeBuckets: ['今晚'],
        includeProfiles: true,
        includePublicIntents: true,
        limit: 24,
      }),
    );
    expect(result).toMatchObject({
      used: true,
      rowCount: 2,
      candidateUserIds: [2, 9],
      publicIntentIds: ['intent_9'],
      features: {
        rowCount: 2,
        profileRows: 1,
        publicIntentRows: 1,
      },
    });
  });

  it('does not override explicit candidate scope', async () => {
    const search = jest.fn();
    const service = new CandidateRecallIndexService({ search } as never);

    const result = await service.recallForCandidatePool(
      resolvedQuery({ candidateUserIds: [8] }),
      { ownerUserId: 1 },
    );

    expect(search).not.toHaveBeenCalled();
    expect(result.used).toBe(false);
    expect(result.candidateUserIds).toEqual([]);
  });
});

function resolvedQuery(
  patch: Partial<CandidatePoolResolvedQuery> = {},
): CandidatePoolResolvedQuery {
  return {
    city: '',
    intent: 'social_search',
    interestTags: [],
    activityType: '',
    timePreference: '',
    locationPreference: '',
    socialRequestId: null,
    rawText: '',
    acceptsStrangers: true,
    candidateUserIds: [],
    publicIntentIds: [],
    ...patch,
  };
}

function indexRow(
  patch: Partial<CandidateSearchIndex> = {},
): CandidateSearchIndex {
  return {
    id: 1,
    sourceType: CandidateSearchIndexSourceType.Profile,
    sourceId: '2',
    sourceVersion: '',
    userId: 2,
    publicIntentId: null,
    linkedSocialRequestId: null,
    isRealUser: true,
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    status: CandidateSearchIndexStatus.Active,
    displayName: '候选',
    city: '青岛',
    locale: 'zh-CN',
    countryCode: 'CN',
    timeZone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    geoHash: '',
    areaText: '',
    lat: null,
    lng: null,
    radiusKm: 20,
    activityTypes: ['散步'],
    interestTags: ['低压力'],
    lifestyleTags: [],
    socialScenes: [],
    relationshipGoals: [],
    timeBuckets: ['今晚'],
    publicSummary: '',
    publicSafetyNotes: [],
    safetyFlags: {},
    trustScore: 0,
    profileCompleteness: 80,
    exposureCount: 0,
    lastRecommendedAt: null,
    lastActiveAt: new Date('2026-06-28T00:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-06-28T00:00:00.000Z'),
    createdAt: new Date('2026-06-28T00:00:00.000Z'),
    updatedAt: new Date('2026-06-28T00:00:00.000Z'),
    ...patch,
  };
}
