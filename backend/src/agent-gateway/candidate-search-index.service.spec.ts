import { CandidateSearchIndexService } from './candidate-search-index.service';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
  CandidateSearchIndexStatus,
} from './entities/candidate-search-index.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from './entities/social-request.entity';

describe('CandidateSearchIndexService', () => {
  function makeRepo<T extends object>() {
    return {
      findOne: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      create: jest.fn(() => ({})),
      save: jest.fn(async (entity: T) => entity),
      createQueryBuilder: jest.fn(),
    };
  }

  function makeService() {
    const indexRepo = makeRepo<CandidateSearchIndex>();
    const profileRepo = makeRepo<Record<string, unknown>>();
    const publicIntentRepo = makeRepo<PublicSocialIntent>();
    const service = new CandidateSearchIndexService(
      indexRepo as never,
      profileRepo as never,
      publicIntentRepo as never,
    );
    return { service, indexRepo, profileRepo, publicIntentRepo };
  }

  it('projects an opted-in profile into the active search index', async () => {
    const { service, indexRepo, profileRepo } = makeService();
    profileRepo.findOne.mockResolvedValueOnce({
      userId: 7,
      profileVersion: 3,
      nickname: '青岛跑步搭子',
      primaryPurpose: '找运动伙伴',
      city: '青岛',
      nearbyArea: '五四广场',
      defaultMatchRadiusKm: 8,
      fitnessGoals: ['跑步'],
      socialScenes: ['同城约练'],
      interestTags: ['跑步', '散步'],
      wantToMeet: ['运动伙伴'],
      preferredTraits: ['自律'],
      lifestyleTags: ['早睡'],
      traits: ['积极'],
      relationshipGoals: ['找搭子'],
      availableTimes: ['晚上'],
      weekdayAvailability: '',
      weekendAvailability: '周末下午',
      privacyBoundary: '先站内沟通',
      rejectRules: '不交换联系方式',
      socialPreference: '低压力运动',
      aiSummary: '喜欢轻松跑步和散步。',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: true,
      hideSensitiveTags: true,
      updatedAt: new Date('2026-06-26T10:00:00.000Z'),
    });
    indexRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.upsertFromSocialProfile(7)).resolves.toMatchObject({
      sourceType: CandidateSearchIndexSourceType.Profile,
      sourceId: '7',
      sourceVersion: '3',
      userId: 7,
      status: CandidateSearchIndexStatus.Active,
      city: '青岛',
      areaText: '五四广场',
      activityTypes: ['跑步', '同城约练', '散步'],
      interestTags: ['跑步', '散步', '运动伙伴', '自律'],
      timeBuckets: ['晚上', '周末下午'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    expect(indexRepo.save).toHaveBeenCalledTimes(1);
  });

  it('pauses a profile projection when recommendation consent is disabled', async () => {
    const { service, indexRepo, profileRepo } = makeService();
    profileRepo.findOne.mockResolvedValueOnce({
      userId: 9,
      profileVersion: 1,
      city: '青岛',
      nearbyArea: '',
      defaultMatchRadiusKm: 20,
      profileDiscoverable: false,
      agentCanRecommendMe: false,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      updatedAt: new Date('2026-06-26T10:00:00.000Z'),
    });
    indexRepo.findOne.mockResolvedValueOnce({ id: 4 });

    await expect(service.upsertFromSocialProfile(9)).resolves.toBeNull();
    expect(indexRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 4,
        sourceType: CandidateSearchIndexSourceType.Profile,
        sourceId: '9',
        status: CandidateSearchIndexStatus.Paused,
      }),
    );
  });

  it('projects an active public intent into the active search index', async () => {
    const { service, indexRepo, publicIntentRepo } = makeService();
    publicIntentRepo.findOne.mockResolvedValueOnce(
      publicIntent({
        id: 'public_1',
        userId: 11,
        linkedSocialRequestId: 301,
        title: '今晚五四广场散步搭子',
        city: '青岛',
        loc: '五四广场',
        requestType: '散步',
        interestTags: ['散步', '低压力社交'],
        timePreference: '明天晚上7点',
        socialGoal: '找散步搭子',
        filters: { scene: '约练', tags: ['同城'] },
      }),
    );
    indexRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.upsertFromPublicIntent('public_1'),
    ).resolves.toMatchObject({
      sourceType: CandidateSearchIndexSourceType.PublicIntent,
      sourceId: 'public_1',
      publicIntentId: 'public_1',
      linkedSocialRequestId: 301,
      userId: 11,
      status: CandidateSearchIndexStatus.Active,
      city: '青岛',
      areaText: '五四广场',
      activityTypes: ['散步', '低压力社交', '约练'],
      timeBuckets: ['明天晚上7点'],
    });
  });

  it('removes an ineligible public intent projection', async () => {
    const { service, indexRepo, publicIntentRepo } = makeService();
    publicIntentRepo.findOne.mockResolvedValueOnce(
      publicIntent({
        id: 'public_removed',
        status: SocialRequestStatus.Inactive,
      }),
    );

    await expect(
      service.upsertFromPublicIntent('public_removed'),
    ).resolves.toBeNull();
    expect(indexRepo.update).toHaveBeenCalledWith(
      {
        sourceType: CandidateSearchIndexSourceType.PublicIntent,
        sourceId: 'public_removed',
      },
      expect.objectContaining({
        status: CandidateSearchIndexStatus.Removed,
      }),
    );
  });

  it('searches active candidates, excludes the owner, and applies signal filters', async () => {
    const { service, indexRepo } = makeService();
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        candidate({ userId: 1, city: '青岛', interestTags: ['跑步'] }),
        candidate({ userId: 2, city: '青岛', interestTags: ['散步'] }),
        candidate({
          userId: 3,
          city: '青岛',
          publicSummary: '晚上可以一起散步',
        }),
      ]),
    };
    indexRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(
      service.search({
        ownerUserId: 1,
        city: '青岛',
        interestTags: ['散步'],
        limit: 2,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ userId: 2 }),
      expect.objectContaining({ userId: 3 }),
    ]);
    expect(qb.andWhere).toHaveBeenCalledWith('candidate.city = :city', {
      city: '青岛',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(candidate.userId IS NULL OR candidate.userId <> :owner)',
      { owner: 1 },
    );
    expect(qb.take).toHaveBeenCalledWith(6);
  });
});

function publicIntent(
  patch: Partial<PublicSocialIntent> = {},
): PublicSocialIntent {
  return {
    id: 'public_1',
    userId: 1,
    linkedSocialRequestId: 1,
    source: 'public_intent',
    mode: 'public',
    requestType: '散步',
    title: '散步搭子',
    description: '一起散步',
    interestTags: ['散步'],
    city: '青岛',
    loc: '五四广场',
    lat: null,
    lng: null,
    radiusKm: 5,
    timePreference: '晚上',
    locationPreference: '五四广场',
    socialGoal: '找搭子',
    riskLevel: SocialRequestRiskLevel.Low,
    requiresUserConfirmation: true,
    filters: {},
    candidateUserIds: [],
    matchedCount: 0,
    capacityMin: 1,
    capacityMax: 1,
    acceptedCount: 0,
    applicationPolicy: 'approval_required',
    linkedMeetId: null,
    closesAt: null,
    status: SocialRequestStatus.Searching,
    metadata: {},
    createdAt: new Date('2026-06-26T09:00:00.000Z'),
    updatedAt: new Date('2026-06-26T10:00:00.000Z'),
    ...patch,
  };
}

function candidate(
  patch: Partial<CandidateSearchIndex> = {},
): CandidateSearchIndex {
  return {
    id: 1,
    sourceType: CandidateSearchIndexSourceType.Profile,
    sourceId: '1',
    sourceVersion: '1',
    userId: 1,
    publicIntentId: null,
    linkedSocialRequestId: null,
    isRealUser: true,
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    status: CandidateSearchIndexStatus.Active,
    displayName: '',
    city: '青岛',
    areaText: '',
    lat: null,
    lng: null,
    radiusKm: 20,
    activityTypes: [],
    interestTags: [],
    lifestyleTags: [],
    socialScenes: [],
    relationshipGoals: [],
    timeBuckets: [],
    publicSummary: '',
    publicSafetyNotes: [],
    safetyFlags: {},
    trustScore: 0,
    profileCompleteness: 0,
    exposureCount: 0,
    lastRecommendedAt: null,
    lastActiveAt: null,
    sourceUpdatedAt: null,
    createdAt: new Date('2026-06-26T09:00:00.000Z'),
    updatedAt: new Date('2026-06-26T10:00:00.000Z'),
    ...patch,
  };
}
