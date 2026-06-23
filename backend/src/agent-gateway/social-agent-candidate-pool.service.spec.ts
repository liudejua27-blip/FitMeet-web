import { SocialActivityStatus } from '../activities/entities/activity.entity';
import { ActivityType } from '../activities/entities/activity-template.entity';
import { SocialRequestCandidateStatus } from '../match/social-request-candidate.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { CandidateExplanationService } from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import { SocialAgentToolResultCacheService } from './social-agent-tool-result-cache.service';

function repo<T>(rows: T[] = []) {
  let nextId = 1000;
  return {
    count: jest.fn(async () => rows.length),
    find: jest.fn(async () => rows),
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => {
        if (!where) return null;
        return (
          rows.find((row) =>
            Object.entries(where).every(
              ([key, value]) => (row as Record<string, unknown>)[key] === value,
            ),
          ) ?? null
        );
      },
    ),
    create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (value: Record<string, unknown>) => ({
      id: value.id ?? nextId++,
      ...value,
    })),
  };
}

const now = new Date('2026-05-23T08:00:00.000Z');

function realUser(id: number, overrides: Partial<User> = {}): User {
  return {
    id,
    email: `user${id}@fitmeet.test`,
    password: '',
    phone: '',
    wechatOpenId: null,
    name: `真实用户 ${id}`,
    avatar: '',
    color: '#168a55',
    gender: '',
    age: 0,
    city: '青岛',
    lat: null,
    lng: null,
    locationUpdatedAt: null,
    acceptNearbyMatch: true,
    gym: '',
    bio: '',
    coverUrl: null,
    singleCert: false,
    verified: false,
    interestTags: [],
    trainingDays: 0,
    trainingCount: 0,
    caloriesBurned: 0,
    bestRecords: [],
    trustScore: 0,
    socialTrustCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as User;
}

function profile(
  userId: number,
  overrides: Partial<UserSocialProfile> = {},
): UserSocialProfile {
  return {
    userId,
    gender: '',
    nickname: `画像用户 ${userId}`,
    ageRange: '',
    city: '青岛',
    zodiac: '',
    mbti: '',
    traits: [],
    socialStyle: '',
    communicationStyle: '',
    nearbyArea: '',
    fitnessGoals: [],
    interestTags: ['咖啡'],
    lifestyleTags: [],
    socialScenes: [],
    wantToMeet: [],
    preferredTraits: [],
    avoidTraits: [],
    relationshipGoals: [],
    openness: '',
    availableTimes: ['周末'],
    weekdayAvailability: '',
    weekendAvailability: '',
    socialPreference: '',
    rejectRules: '',
    privacyBoundary: '',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    hideSensitiveTags: true,
    aiSummary: '',
    aiProfileCard: {},
    matchSignals: {},
    sensitiveTagDecisions: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as UserSocialProfile;
}

function publicIntent(
  id: string,
  userId: number,
  overrides: Partial<PublicSocialIntent> = {},
): PublicSocialIntent {
  return {
    id,
    userId,
    linkedSocialRequestId: null,
    source: 'public_intent',
    mode: 'public',
    requestType: 'coffee_chat',
    title: '周末咖啡局',
    description: '找人周末一起喝咖啡',
    interestTags: ['咖啡'],
    city: '青岛',
    loc: '',
    lat: null,
    lng: null,
    radiusKm: 5,
    timePreference: '周末',
    locationPreference: '',
    socialGoal: '',
    riskLevel: 'low' as never,
    requiresUserConfirmation: true,
    filters: {},
    candidateUserIds: [],
    matchedCount: 0,
    status: SocialRequestStatus.Searching,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PublicSocialIntent;
}

function makeService(
  options: {
    users?: User[];
    profiles?: UserSocialProfile[];
    publicIntents?: PublicSocialIntent[];
    socialRequests?: Array<Record<string, unknown>>;
    activities?: Array<Record<string, unknown>>;
    blockedIds?: number[];
    recommendationExcludedIds?: number[];
    lifeGraphSignals?: Record<string, unknown> | null;
    toolResultCache?: SocialAgentToolResultCacheService;
    metrics?: { recordToolResultCache: jest.Mock };
    interestEvents?: {
      summarizeForUser: jest.Mock;
    };
  } = {},
) {
  const users = repo(options.users ?? [realUser(1), realUser(2)]);
  const profiles = repo(options.profiles ?? []);
  const delegates = repo<unknown>([]);
  const publicIntents = repo(options.publicIntents ?? []);
  const legacyRequests = repo<unknown>([]);
  const socialRequests = repo(options.socialRequests ?? []);
  const activities = repo(options.activities ?? []);
  const candidates = repo<Record<string, unknown>>([]);
  const tasks = repo<unknown>([]);
  const safety = {
    getMutualBlockUserIds: jest.fn(
      async () => new Set(options.blockedIds ?? []),
    ),
    getAgentRecommendationExcludedUserIds: jest.fn(
      async () =>
        new Set(options.recommendationExcludedIds ?? options.blockedIds ?? []),
    ),
  };
  const lifeGraph = options.lifeGraphSignals
    ? { getUnifiedMatchSignals: jest.fn(async () => options.lifeGraphSignals) }
    : undefined;
  const service = new SocialAgentCandidatePoolService(
    users as never,
    profiles as never,
    delegates as never,
    publicIntents as never,
    legacyRequests as never,
    socialRequests as never,
    activities as never,
    candidates as never,
    tasks as never,
    safety as never,
    new CandidateExplanationService(new SceneRiskPolicyService()),
    new SceneRiskPolicyService(),
    lifeGraph as never,
    options.toolResultCache,
    options.metrics as never,
    options.interestEvents as never,
  );
  return {
    service,
    candidates,
    safety,
    lifeGraph,
    toolResultCache: options.toolResultCache,
    repos: {
      users,
      profiles,
      delegates,
      publicIntents,
      legacyRequests,
      socialRequests,
      activities,
      tasks,
    },
  };
}

describe('SocialAgentCandidatePoolService', () => {
  it('social_search returns real user_social_profiles', async () => {
    const { service } = makeService({
      profiles: [profile(2, { interestTags: ['咖啡', '拍照'] })],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      rawText: '周末一起喝咖啡',
    });

    expect(result.candidates[0]).toMatchObject({
      source: 'profile_candidate',
      isRealData: true,
      candidateUserId: 2,
      displayName: '画像用户 2',
      scoreBreakdown: expect.objectContaining({
        distance: expect.any(Number),
        timeOverlap: expect.any(Number),
        interestSimilarity: expect.any(Number),
        lifeRhythm: expect.any(Number),
        socialEnergy: expect.any(Number),
        relationshipGoal: expect.any(Number),
        trustworthiness: expect.any(Number),
        safetyRisk: expect.any(Number),
      }),
    });
  });

  it('matches registered profiles by profile interests even when user tags are empty', async () => {
    const { service } = makeService({
      users: [
        realUser(1, { interestTags: [] }),
        realUser(2, { interestTags: [] }),
      ],
      profiles: [
        profile(2, {
          nickname: '羽毛球候选',
          interestTags: ['羽毛球'],
          fitnessGoals: ['周末约练'],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['羽毛球'],
      rawText: '帮我找一个羽毛球搭子',
    });

    expect(result.emptyReason).toBeNull();
    expect(result.candidates[0]).toMatchObject({
      source: 'profile_candidate',
      isRealData: true,
      candidateUserId: 2,
      displayName: '羽毛球候选',
      commonTags: ['羽毛球'],
      interestTags: expect.arrayContaining(['羽毛球']),
    });
    expect(
      result.candidates[0].scoreBreakdown.interestSimilarity,
    ).toBeGreaterThan(0);
  });

  it('uses persisted user interest events to rerank candidates without LLM sorting', async () => {
    const interestEvents = {
      summarizeForUser: jest.fn().mockResolvedValue({
        ownerUserId: 1,
        eventCount: 2,
        positiveTargetUserIds: [],
        negativeTargetUserIds: [],
        activityTagWeights: [{ tag: '散步', weight: 8 }],
        candidatePreferenceWeights: [{ tag: '低压力', weight: 4 }],
        cityWeights: [],
        locationWeights: [],
        timeWindowWeights: [],
      }),
    };
    const { service } = makeService({
      users: [realUser(1), realUser(2), realUser(3)],
      profiles: [
        profile(2, {
          nickname: '散步候选',
          interestTags: ['散步', '低压力'],
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        profile(3, {
          nickname: '咖啡候选',
          interestTags: ['咖啡'],
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ],
      interestEvents,
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: [],
      rawText: '周末找个轻松搭子',
    });

    expect(interestEvents.summarizeForUser).toHaveBeenCalledWith({
      ownerUserId: 1,
      limit: 200,
    });
    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 2,
      displayName: '散步候选',
      scoreBreakdown: expect.objectContaining({
        behaviorPreference: expect.any(Number),
      }),
      preferenceHistorySignals: expect.arrayContaining([
        expect.stringContaining('你之前偏好类似兴趣'),
      ]),
    });
    expect(
      result.candidates[0].scoreBreakdown.behaviorPreference,
    ).toBeGreaterThan(0);
  });

  it('uses location and time behavior signals for public intent ranking', async () => {
    const interestEvents = {
      summarizeForUser: jest.fn().mockResolvedValue({
        ownerUserId: 1,
        eventCount: 2,
        positiveTargetUserIds: [],
        negativeTargetUserIds: [],
        activityTagWeights: [],
        candidatePreferenceWeights: [],
        cityWeights: [],
        locationWeights: [{ tag: '青岛大学', weight: 6 }],
        timeWindowWeights: [{ tag: '今天晚上', weight: 5 }],
      }),
    };
    const { service } = makeService({
      users: [realUser(1), realUser(2), realUser(3)],
      profiles: [
        profile(2, { nickname: '校园散步候选', interestTags: ['散步'] }),
        profile(3, { nickname: '周末咖啡候选', interestTags: ['咖啡'] }),
      ],
      publicIntents: [
        publicIntent('intent_2', 2, {
          title: '今晚青岛大学散步',
          description: '今天晚上在青岛大学附近轻松散步',
          interestTags: ['散步'],
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
        }),
        publicIntent('intent_3', 3, {
          title: '周末咖啡',
          description: '周末找人喝咖啡',
          interestTags: ['咖啡'],
          timePreference: '周末',
          locationPreference: '市南区',
        }),
      ],
      interestEvents,
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: [],
      rawText: '帮我看看附近机会',
    });

    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 2,
      preferenceHistorySignals: expect.arrayContaining([
        expect.stringContaining('你之前更常选择这个区域'),
        expect.stringContaining('你之前更常选择这个时间'),
      ]),
    });
    expect(
      result.candidates[0].scoreBreakdown.behaviorPreference,
    ).toBeGreaterThan(0);
  });

  it('boosts candidates the user previously viewed or clicked from Discover', async () => {
    const interestEvents = {
      summarizeForUser: jest.fn().mockResolvedValue({
        ownerUserId: 1,
        eventCount: 2,
        positiveTargetUserIds: [3],
        negativeTargetUserIds: [],
        activityTagWeights: [],
        candidatePreferenceWeights: [],
        cityWeights: [],
        locationWeights: [],
        timeWindowWeights: [],
      }),
    };
    const { service } = makeService({
      users: [realUser(1), realUser(2), realUser(3)],
      profiles: [
        profile(2, {
          nickname: '资料更完整但没看过',
          interestTags: ['咖啡', '读书'],
          updatedAt: new Date('2026-06-20T00:00:00.000Z'),
        }),
        profile(3, {
          nickname: '之前看过的人',
          interestTags: ['咖啡'],
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
      interestEvents,
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      rawText: '帮我找一个咖啡聊天搭子',
    });

    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 3,
      displayName: '之前看过的人',
      preferenceHistorySignals: expect.arrayContaining([
        expect.stringContaining('你之前对这位候选表现过兴趣'),
      ]),
    });
    expect(
      result.candidates[0].scoreBreakdown.behaviorPreference,
    ).toBeGreaterThan(0);
  });

  it('reuses read-only candidate source snapshots across repeated searches', async () => {
    const { service, repos, safety, lifeGraph } = makeService({
      users: [realUser(1), realUser(2)],
      profiles: [profile(2, { interestTags: ['散步', '咖啡'] })],
      lifeGraphSignals: {
        identitySignals: { city: '青岛', nearbyArea: '青岛大学附近' },
        socialIntentSignals: {
          currentSocialGoal: '找散步搭子',
          relationshipGoal: '运动社交',
        },
        lifestyleSignals: { availableTimes: ['今天晚上'] },
        fitnessSignals: { sportsPreferences: ['散步'], publicPlaceOnly: true },
        behaviorSignals: {
          pressurePreference: 'low',
          locationPreference: 'same_school_or_area',
          recommendationWeights: {
            sameCity: 70,
            commonInterest: 80,
            lowPressure: 90,
            sports: 80,
            safetyBoundary: 90,
          },
          matchingGuidance: {
            shouldPreferLowPressure: true,
            shouldPreferSports: true,
            shouldUsePublicPlace: true,
            suggestedFilters: ['低压力', '公共场所'],
            rankingNotes: ['优先低压力散步。'],
          },
          summary: '更适合低压力散步。',
        },
        safetySignals: {
          realNameRequired: false,
          publicPlaceOnly: true,
          strictConfirmationRequired: true,
          blockedScenarios: [],
          locationSharingAllowed: false,
          acceptsNightMeet: false,
        },
        confidence: { overall: 0.8, byField: {} },
        missingCriticalFields: [],
        preferenceHistory: {},
      } as never,
    });

    const first = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['散步'],
      persistCandidates: false,
    });
    const second = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      persistCandidates: false,
    });

    expect(first.candidates[0].candidateUserId).toBe(2);
    expect(second.candidates[0].candidateUserId).toBe(2);
    expect(repos.users.find).toHaveBeenCalledTimes(1);
    expect(repos.profiles.find).toHaveBeenCalledTimes(1);
    expect(repos.publicIntents.find).toHaveBeenCalledTimes(1);
    expect(repos.legacyRequests.find).toHaveBeenCalledTimes(1);
    expect(safety.getAgentRecommendationExcludedUserIds).toHaveBeenCalledTimes(
      1,
    );
    expect(lifeGraph?.getUnifiedMatchSignals).toHaveBeenCalledTimes(1);
  });

  it('uses the shared tool result cache for source snapshot reads', async () => {
    const toolResultCache = new SocialAgentToolResultCacheService();
    const metrics = { recordToolResultCache: jest.fn() };
    const { service, repos } = makeService({
      users: [realUser(1), realUser(2)],
      profiles: [profile(2, { interestTags: ['散步'] })],
      toolResultCache,
      metrics,
    });

    await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['散步'],
      persistCandidates: false,
    });
    await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      persistCandidates: false,
    });

    expect(repos.users.find).toHaveBeenCalledTimes(1);
    expect(toolResultCache.stats()).toMatchObject({
      hits: expect.any(Number),
      misses: expect.any(Number),
      size: expect.any(Number),
      savedApproxPromptChars: expect.any(Number),
    });
    expect(toolResultCache.stats().hits).toBeGreaterThan(0);
    expect(toolResultCache.stats().savedApproxPromptChars).toBeGreaterThan(0);
    expect(metrics.recordToolResultCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheName: 'candidate_pool_source',
        hit: false,
        approxChars: expect.any(Number),
      }),
    );
    expect(metrics.recordToolResultCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheName: 'candidate_pool_source',
        hit: true,
        approxChars: expect.any(Number),
      }),
    );
  });

  it('caches owner-independent public profile summaries across candidate searches', async () => {
    const toolResultCache = new SocialAgentToolResultCacheService();
    const metrics = { recordToolResultCache: jest.fn() };
    const { service } = makeService({
      users: [realUser(1), realUser(2)],
      profiles: [
        profile(2, {
          nickname: '青岛散步候选',
          interestTags: ['散步', '咖啡'],
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ],
      toolResultCache,
      metrics,
    });

    const first = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['散步'],
      persistCandidates: false,
    });
    const second = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      persistCandidates: false,
    });

    expect(first.candidates[0]).toMatchObject({
      candidateUserId: 2,
      displayName: '青岛散步候选',
    });
    expect(second.candidates[0]).toMatchObject({
      candidateUserId: 2,
      displayName: '青岛散步候选',
    });
    expect(metrics.recordToolResultCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheName: 'candidate_public_profile_summary',
        hit: false,
        approxChars: expect.any(Number),
      }),
    );
    expect(metrics.recordToolResultCache).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheName: 'candidate_public_profile_summary',
        hit: true,
        approxChars: expect.any(Number),
      }),
    );
  });

  it('keeps candidate row persistence even when source snapshots are cached', async () => {
    const { service, candidates } = makeService({
      users: [realUser(1), realUser(2)],
      profiles: [profile(2, { interestTags: ['散步'] })],
      socialRequests: [
        {
          id: 301,
          userId: 1,
          city: '青岛',
          rawText: '青岛今晚散步',
          interestTags: ['散步'],
        },
      ],
    });

    await service.searchSocial({
      ownerUserId: 1,
      socialRequestId: 301,
      city: '青岛',
      interestTags: ['散步'],
    });
    await service.searchSocial({
      ownerUserId: 1,
      socialRequestId: 301,
      city: '青岛',
      interestTags: ['散步'],
    });

    expect(candidates.save).toHaveBeenCalledTimes(2);
  });

  it('social_search uses public_social_intents only for profile-discoverable Agent-matching users', async () => {
    const { service } = makeService({
      publicIntents: [publicIntent('intent_2', 2)],
      profiles: [profile(2)],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
    });

    expect(result.candidates[0]).toMatchObject({
      isRealData: true,
      candidateUserId: 2,
      recommendationConsent: expect.objectContaining({
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      }),
    });
    expect(result.candidates[0].matchReasons.join(' ')).toContain(
      '公开约练卡片',
    );
  });

  it('uses the linked social request city when tool input city is empty', async () => {
    const { service } = makeService({
      users: [
        realUser(1),
        realUser(2, { city: '北京' }),
        realUser(3, { city: '青岛' }),
      ],
      publicIntents: [
        publicIntent('intent_beijing', 2, { city: '北京' }),
        publicIntent('intent_qingdao', 3, { city: '青岛' }),
      ],
      profiles: [profile(2, { city: '北京' }), profile(3, { city: '青岛' })],
      socialRequests: [
        {
          id: 301,
          userId: 1,
          city: '青岛',
          rawText: '青岛周末咖啡健身交流',
          activityType: 'fitness_partner',
          interestTags: ['咖啡', '健身'],
        },
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      socialRequestId: 301,
      city: '',
      rawText: '青岛周末咖啡健身交流',
    });

    expect(result.query.city).toBe('青岛');
    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 3,
      city: '青岛',
    });
    expect(
      result.candidates.find((candidate) => candidate.city === '北京')
        ?.matchScore,
    ).toBeLessThan(result.candidates[0].matchScore);
  });

  it('rejects socialRequestId that does not belong to the owner', async () => {
    const { service, candidates } = makeService({
      profiles: [profile(2)],
      socialRequests: [
        {
          id: 301,
          userId: 2,
          city: '青岛',
          rawText: '青岛周末咖啡',
          interestTags: ['咖啡'],
        },
      ],
    });

    await expect(
      service.searchSocial({
        ownerUserId: 1,
        socialRequestId: 301,
        city: '青岛',
      }),
    ).rejects.toThrow('Social request not found');
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('activity_search returns real social_activities first', async () => {
    const { service } = makeService({
      activities: [
        {
          id: 88,
          creatorId: 2,
          type: ActivityType.Custom,
          title: '青岛周末咖啡活动',
          description: '公开咖啡活动',
          locationName: '市南区',
          city: '青岛',
          status: SocialActivityStatus.Confirmed,
          startTime: now,
          endTime: new Date('2026-06-27T08:00:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
      ],
      publicIntents: [publicIntent('intent_2', 2)],
      profiles: [profile(2)],
    });

    const result = await service.searchActivity({
      ownerUserId: 1,
      city: '青岛',
      rawText: '周末咖啡活动',
    });

    expect(result.activityResults).toHaveLength(1);
    expect(result.activityResults[0]).toMatchObject({
      source: 'activity',
      activityId: 88,
      isRealData: true,
    });
  });

  it('activity_search falls back to activity-like public_social_intents', async () => {
    const { service } = makeService({
      publicIntents: [publicIntent('intent_2', 2)],
      profiles: [profile(2)],
    });

    const result = await service.searchActivity({
      ownerUserId: 1,
      city: '青岛',
      rawText: '周末咖啡活动',
    });

    expect(result.activityResults[0]).toMatchObject({
      source: 'public_intent',
      publicIntentId: 'intent_2',
      isRealData: true,
    });
  });

  it('excludes activity creators with safety or recommendation-blocking boundaries', async () => {
    const { service } = makeService({
      activities: [
        {
          id: 88,
          creatorId: 2,
          type: ActivityType.Custom,
          title: '青岛周末咖啡活动',
          description: '公开咖啡活动',
          locationName: '市南区',
          city: '青岛',
          status: SocialActivityStatus.Confirmed,
          startTime: now,
          endTime: new Date('2026-06-27T08:00:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
      ],
      profiles: [
        profile(2, {
          privacyBoundary: '投诉处理中，请不要再推荐',
        }),
      ],
    });

    const result = await service.searchActivity({
      ownerUserId: 1,
      city: '青岛',
      rawText: '周末咖啡活动',
    });

    expect(result.activityResults).toEqual([]);
    expect(result.emptyReason).toBe('no_real_candidates');
    expect(result.debug.filtered.boundaryMismatch).toBe(1);
  });

  it('allows activity-like public intents from real registered users', async () => {
    const { service } = makeService({
      publicIntents: [publicIntent('intent_2', 2)],
      profiles: [profile(2, { agentCanRecommendMe: false })],
    });

    const result = await service.searchActivity({
      ownerUserId: 1,
      city: '青岛',
      rawText: '周末咖啡活动',
    });

    expect(result.activityResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publicIntentId: 'intent_2',
          candidateUserId: 2,
          source: 'public_intent',
        }),
      ]),
    );
    expect(result.emptyReason).toBeNull();
  });

  it('keeps public activity creators searchable when their profile can support matching', async () => {
    const { service } = makeService({
      activities: [
        {
          id: 88,
          creatorId: 2,
          type: ActivityType.Custom,
          title: '青岛周末咖啡活动',
          description: '公开咖啡活动',
          locationName: '市南区',
          city: '青岛',
          status: SocialActivityStatus.Confirmed,
          startTime: now,
          endTime: new Date('2026-06-27T08:00:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 89,
          creatorId: 3,
          type: ActivityType.Custom,
          title: '青岛周末轻松跑',
          description: '公开跑步活动',
          locationName: '五四广场',
          city: '青岛',
          status: SocialActivityStatus.Confirmed,
          startTime: now,
          endTime: new Date('2026-06-27T08:00:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
      ],
      profiles: [
        profile(2, {
          profileDiscoverable: true,
          agentCanRecommendMe: false,
        }),
        profile(3, {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      ],
    });

    const result = await service.searchActivity({
      ownerUserId: 1,
      city: '青岛',
      rawText: '周末公开活动',
    });

    expect(
      result.activityResults.map((activity) => activity.activityId),
    ).toEqual([88, 89]);
    expect(
      result.activityResults.map((activity) => activity.activityId),
    ).toEqual(expect.arrayContaining([88]));
  });

  it('does not surface activity opportunities when the user explicitly rejects strangers', async () => {
    const { service } = makeService({
      activities: [
        {
          id: 88,
          creatorId: 2,
          type: ActivityType.Custom,
          title: '青岛周末咖啡活动',
          description: '公开咖啡活动',
          locationName: '市南区',
          city: '青岛',
          status: SocialActivityStatus.Confirmed,
          startTime: now,
          endTime: new Date('2026-06-27T08:00:00.000Z'),
          createdAt: now,
          updatedAt: now,
        },
      ],
      publicIntents: [
        publicIntent('intent_3', 3, {
          title: '青岛周末羽毛球活动',
          description: '公开约练活动',
          requestType: 'badminton_partner',
        }),
      ],
      profiles: [
        profile(2, {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(3, {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      ],
    });

    const result = await service.searchActivity({
      ownerUserId: 1,
      city: '青岛',
      rawText: '周末活动，只推荐熟人，不接受陌生人',
    });

    expect(result.query.acceptsStrangers).toBe(false);
    expect(result.activityResults).toEqual([]);
    expect(result.emptyReason).toBe('no_real_candidates');
    expect(result.debug.filtered.boundaryMismatch).toBeGreaterThanOrEqual(2);
  });

  it('returns emptyReason and does not generate FitMeet User names when no real candidates exist', async () => {
    const { service } = makeService({ users: [realUser(1)] });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(result.candidates).toEqual([]);
    expect(result.emptyReason).toBe('no_real_candidates');
    expect(JSON.stringify(result)).not.toMatch(/FitMeet User/i);
  });

  it('allows profile candidates with recommendation consent even when discoverability is unset', async () => {
    const { service } = makeService({
      profiles: [
        profile(2, {
          profileDiscoverable: null as never,
          agentCanRecommendMe: true,
        }),
      ],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toContain(2);
    expect(result.emptyReason).toBeNull();
  });

  it('allows publicly discoverable profile candidates when Agent matching is unset', async () => {
    const { service } = makeService({
      profiles: [
        profile(2, {
          profileDiscoverable: true,
          agentCanRecommendMe: null as never,
        }),
      ],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toContain(2);
    expect(result.emptyReason).toBeNull();
  });

  it('keeps public intent owners searchable after they publish a real intent', async () => {
    const { service } = makeService({
      users: [realUser(1), realUser(2), realUser(3), realUser(4)],
      publicIntents: [
        publicIntent('intent_2', 2),
        publicIntent('intent_3', 3),
        publicIntent('intent_4', 4),
      ],
      profiles: [
        profile(2, {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(3, {
          profileDiscoverable: true,
          agentCanRecommendMe: false,
        }),
        profile(4, {
          profileDiscoverable: false,
          agentCanRecommendMe: true,
        }),
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      rawText: '想认识周末能低压力喝咖啡的新朋友',
    });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual([2, 3, 4]);
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual(expect.arrayContaining([3, 4]));
  });

  it('filters cold profile candidates when both recommendation switches are missing or disabled', async () => {
    const { service } = makeService({
      users: [realUser(1), realUser(2), realUser(3)],
      profiles: [
        profile(2, {
          profileDiscoverable: null as never,
          agentCanRecommendMe: null as never,
        }),
        profile(3, {
          profileDiscoverable: false,
          agentCanRecommendMe: false,
        }),
      ],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(result.candidates).toEqual([]);
    expect(result.debug.filtered.boundaryMismatch).toBeGreaterThanOrEqual(2);
  });

  it('allows profileCompleteness >= 40 into the pool', async () => {
    const { service } = makeService({
      profiles: [
        profile(2, {
          interestTags: [],
          availableTimes: [],
          socialPreference: '',
        }),
      ],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 2,
      profileCompleteness: expect.any(Number),
    });
    expect(result.candidates[0].profileCompleteness).toBeGreaterThanOrEqual(
      0.4,
    );
  });

  it('never recommends the owner user', async () => {
    const { service } = makeService({
      users: [realUser(1), realUser(2)],
      profiles: [profile(1), profile(2)],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).not.toContain(1);
  });

  it('never recommends mutually blocked users', async () => {
    const { service } = makeService({
      profiles: [profile(2), profile(3)],
      users: [realUser(1), realUser(2), realUser(3)],
      blockedIds: [2],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual([3]);
  });

  it('uses the Agent recommendation safety exclusion set before recommending strangers', async () => {
    const { service, safety } = makeService({
      profiles: [profile(2), profile(3)],
      users: [realUser(1), realUser(2), realUser(3)],
      blockedIds: [],
      recommendationExcludedIds: [2],
    });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(safety.getAgentRecommendationExcludedUserIds).toHaveBeenCalledWith(
      1,
    );
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual([3]);
  });

  it('excludes discoverable strangers with complaint or moderation safety boundaries', async () => {
    const { service } = makeService({
      profiles: [
        profile(2, {
          nickname: '安全候选',
          privacyBoundary: '先站内沟通，只在公共场所见面',
        }),
        profile(3, {
          nickname: '投诉风险候选',
          privacyBoundary: '投诉处理中，请不要再推荐',
        }),
        profile(4, {
          nickname: '风控候选',
          rejectRules: '风控标记，暂时禁用匹配',
        }),
      ],
      users: [realUser(1), realUser(2), realUser(3), realUser(4)],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      rawText: '想认识周末能一起喝咖啡的新朋友',
    });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual([2]);
    expect(result.debug.filtered.blocked).toBeGreaterThanOrEqual(2);
  });

  it('surfaces safe profile candidates from a mixed candidate pool', async () => {
    const { service, candidates, safety } = makeService({
      users: [
        realUser(1),
        realUser(2),
        realUser(3),
        realUser(4),
        realUser(5),
        realUser(6),
      ],
      profiles: [
        profile(2, {
          nickname: '可发现候选',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(3, {
          nickname: '仅 Agent 匹配候选',
          profileDiscoverable: false,
          agentCanRecommendMe: true,
        }),
        profile(4, {
          nickname: '未授权候选',
          profileDiscoverable: false,
          agentCanRecommendMe: false,
        }),
        profile(5, {
          nickname: '安全排除候选',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(6, {
          nickname: '拒绝推荐候选',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          privacyBoundary: '请不要推荐给陌生人',
        }),
      ],
      recommendationExcludedIds: [5],
      socialRequests: [
        {
          id: 301,
          userId: 1,
          city: '青岛',
          rawText: '青岛周末咖啡',
          interestTags: ['咖啡'],
        },
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      socialRequestId: 301,
      city: '青岛',
      interestTags: ['咖啡'],
      rawText: '想认识周末能低压力喝咖啡的新朋友',
    });

    expect(safety.getAgentRecommendationExcludedUserIds).toHaveBeenCalledWith(
      1,
    );
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual([2, 3]);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'profile_candidate',
          displayName: '可发现候选',
          isRealData: true,
        }),
      ]),
    );
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).not.toEqual(expect.arrayContaining([1, 3, 4, 5, 6]));
    expect(result.debug.filtered).toMatchObject({
      self: expect.any(Number),
      blocked: expect.any(Number),
      boundaryMismatch: expect.any(Number),
    });
    expect(result.debug.filtered.self).toBeGreaterThanOrEqual(1);
    expect(result.debug.filtered.blocked).toBeGreaterThanOrEqual(1);
    expect(result.debug.filtered.boundaryMismatch).toBeGreaterThanOrEqual(2);
    expect(candidates.save).toHaveBeenCalledTimes(2);
  });

  it('does not surface cold-start strangers when the user explicitly rejects strangers', async () => {
    const { service, candidates } = makeService({
      users: [realUser(1), realUser(2), realUser(3)],
      profiles: [
        profile(2, {
          nickname: '公开可发现用户',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(3, {
          nickname: '公开意图用户',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      ],
      publicIntents: [publicIntent('intent_3', 3)],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
      rawText:
        '青岛周末下午，轻松咖啡，只在公共场所，先站内聊，不接受陌生人，不公开发起活动',
    });

    expect(result.query.acceptsStrangers).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(result.debug.filtered.boundaryMismatch).toBeGreaterThanOrEqual(2);
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('returns only safe explainable top candidates with opener and boundary metadata', async () => {
    const { service } = makeService({
      users: [
        realUser(1),
        realUser(2),
        realUser(3),
        realUser(4),
        realUser(5),
        realUser(6),
      ],
      profiles: [
        profile(2, {
          nickname: '小林',
          interestTags: ['跑步', '咖啡'],
          availableTimes: ['周末下午'],
          socialPreference: '低压力，先站内聊',
          privacyBoundary: '公共场所，不交换联系方式',
          relationshipGoals: ['运动搭子'],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(3, {
          nickname: '阿森',
          interestTags: ['跑步'],
          availableTimes: ['周末下午'],
          socialPreference: '轻松慢跑',
          privacyBoundary: '公共路线',
          relationshipGoals: ['新朋友'],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(4, {
          nickname: '小周',
          interestTags: ['健身', '跑步'],
          availableTimes: ['周末'],
          socialPreference: '先聊天再见面',
          privacyBoundary: '站内沟通',
          relationshipGoals: ['约练搭子'],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
        profile(5, {
          nickname: '未授权',
          interestTags: ['跑步'],
          profileDiscoverable: false,
          agentCanRecommendMe: false,
        }),
        profile(6, {
          nickname: '被排除',
          interestTags: ['跑步'],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      ],
      recommendationExcludedIds: [6],
      lifeGraphSignals: {
        identitySignals: { city: '青岛' },
        socialIntentSignals: {
          currentSocialGoal: '周末下午找低压力跑步搭子',
          preferredSocialStyle: '先站内聊',
        },
        lifestyleSignals: { availableTimes: ['周末下午'] },
        fitnessSignals: { sportsPreferences: ['跑步'], publicPlaceOnly: true },
        behaviorSignals: {
          pressurePreference: 'low',
          locationPreference: 'same_school_or_area',
          recommendationWeights: {
            sameCity: 70,
            commonInterest: 80,
            lowPressure: 90,
            sports: 88,
            safetyBoundary: 90,
          },
          matchingGuidance: {
            shouldPreferLowPressure: true,
            shouldPreferSports: true,
            shouldUsePublicPlace: true,
            suggestedFilters: ['低压力', '公共场所'],
            rankingNotes: ['优先低压力跑步和公共场所边界。'],
          },
          summary: '更适合低压力运动社交。',
        },
        safetySignals: {
          publicPlaceOnly: true,
          locationSharingAllowed: false,
          strictConfirmationRequired: true,
          acceptsNightMeet: false,
        },
        confidence: { overall: 0.86, byField: {} },
      },
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['跑步'],
      rawText:
        '青岛周末下午，轻松跑步，只在公共场所，先站内聊，接受陌生人，不公开发起活动',
      limit: 3,
    });

    expect(result.candidates).toHaveLength(3);
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual([2, 3, 4]);
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).not.toEqual(expect.arrayContaining([1, 5, 6]));
    for (const candidate of result.candidates) {
      expect(candidate).toMatchObject({
        isRealData: true,
        risk: expect.objectContaining({ level: expect.any(String) }),
        candidateExplanation: expect.objectContaining({
          fitReasons: expect.any(Array),
          suggestedOpener: expect.any(String),
          safeFirstStep: expect.any(String),
          nextActionSuggestion: expect.any(String),
        }),
        lifeGraphExplanation: expect.objectContaining({
          boundaryNotes: expect.arrayContaining([
            expect.stringContaining('公共场所'),
          ]),
          confidenceLevel: expect.stringMatching(/high|medium|low/),
        }),
      });
      expect(candidate.candidateExplanation.fitReasons.length).toBeGreaterThan(
        0,
      );
      expect(candidate.suggestedOpener).toBeTruthy();
      expect(candidate.suggestedOpener).toBe(candidate.suggestedMessage);
      expect(candidate.whyYouMayLike).toBeTruthy();
      expect(candidate.whyNow).toBeTruthy();
      expect(candidate.matchPoints.length).toBeGreaterThan(0);
      expect(candidate.boundaryNotes.join(' ')).toContain('公共场所');
      expect(candidate.dynamicSignalReasons.join(' ')).toContain('低压力');
      expect(candidate.nextAction).toMatch(/站内|消息|确认|轻量/);
      expect(candidate.riskWarning).toContain('公共场所');
      expect(candidate.scoreBreakdown.safetyRisk).toBeGreaterThan(0);
      expect(candidate.scoreBreakdown.lifeGraphBehaviorFit).toBeGreaterThan(0);
    }
  });

  it('keeps opted-in incomplete real users but lowers their dataQuality and score', async () => {
    const { service } = makeService({
      users: [
        realUser(1),
        realUser(2, { name: 'FitMeet User M5l4', city: '', interestTags: [] }),
      ],
      profiles: [
        profile(2, {
          nickname: '',
          city: '',
          interestTags: [],
          availableTimes: [],
          socialPreference: '',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      rawText: '找青岛拍照搭子',
    });

    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 2,
      dataQuality: 'incomplete',
      displayName: '已脱敏用户 2',
    });
    expect(result.candidates[0].matchScore).toBeLessThan(60);
  });

  it('persists real candidate rows when a socialRequestId is present', async () => {
    const { service, candidates } = makeService({
      profiles: [profile(2)],
      socialRequests: [
        {
          id: 301,
          userId: 1,
          city: '青岛',
          rawText: '青岛周末咖啡',
          interestTags: ['咖啡'],
        },
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      socialRequestId: 301,
    });

    expect(candidates.save).toHaveBeenCalledWith(
      expect.objectContaining({
        socialRequestId: 301,
        candidateUserId: 2,
        status: SocialRequestCandidateStatus.Suggested,
      }),
    );
    expect(result.candidates[0].candidateRecordId).toBeDefined();
  });

  it('reuses an existing candidate row when concurrent persistence hits the unique index', async () => {
    const { service, candidates } = makeService({
      profiles: [profile(2)],
      socialRequests: [
        {
          id: 301,
          userId: 1,
          city: '青岛',
          rawText: '青岛周末咖啡',
          interestTags: ['咖啡'],
        },
      ],
    });
    candidates.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 777,
      socialRequestId: 301,
      candidateUserId: 2,
      status: SocialRequestCandidateStatus.Suggested,
    });
    candidates.save.mockRejectedValueOnce(
      Object.assign(new Error('duplicate candidate row'), { code: '23505' }),
    );

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      socialRequestId: 301,
    });

    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 2,
      candidateRecordId: 777,
      socialRequestId: 301,
    });
    expect(candidates.findOne).toHaveBeenLastCalledWith({
      where: { socialRequestId: 301, candidateUserId: 2 },
    });
  });

  it('productizes mahjong confirmation risk into candidate risk and persisted rows', async () => {
    const { service, candidates } = makeService({
      profiles: [profile(2, { interestTags: ['麻将'], city: '青岛' })],
      socialRequests: [
        {
          id: 301,
          userId: 1,
          city: '青岛',
          rawText: '找麻将搭子，先确认是否涉钱和公开地点',
          interestTags: ['麻将'],
        },
      ],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      socialRequestId: 301,
      rawText: '找麻将搭子，先确认是否涉钱和公开地点',
      interestTags: ['麻将'],
    });

    expect(result.candidates[0]).toMatchObject({
      risk: expect.objectContaining({
        level: 'medium',
        warnings: expect.arrayContaining([expect.stringContaining('麻将')]),
      }),
      candidateExplanation: expect.objectContaining({
        requiresConfirmation: true,
        safeFirstStep: expect.stringContaining('公开'),
      }),
    });
    expect(candidates.save).toHaveBeenCalledWith(
      expect.objectContaining({
        riskLevel: 'medium',
        riskWarnings: expect.arrayContaining([expect.stringContaining('麻将')]),
      }),
    );
  });

  it('uses Life Graph signals for candidate scoring and explanations', async () => {
    const { service, lifeGraph } = makeService({
      profiles: [
        profile(2, {
          interestTags: ['跑步'],
          city: '青岛',
          availableTimes: ['周末下午'],
        }),
      ],
      lifeGraphSignals: {
        identitySignals: { city: '青岛', nearbyArea: '青岛大学附近' },
        socialIntentSignals: {
          currentSocialGoal: '找跑步搭子',
          preferredSocialStyle: '先聊天后见面',
        },
        lifestyleSignals: { availableTimes: ['周末下午'] },
        fitnessSignals: { sportsPreferences: ['跑步'], publicPlaceOnly: true },
        behaviorSignals: {
          activityLevel: 'quiet',
          socialEnergy: 'sports',
          completionTrend: 'reliable',
          cancellationPattern: 'rare',
          pressurePreference: 'low',
          nightBoundary: 'avoids_late_private',
          locationPreference: 'same_school_or_area',
          feedbackPattern: ['跑步', '同校'],
          scores: {
            rhythmConfidence: 0.8,
            sportsAffinity: 0.9,
            lowPressureFit: 0.95,
            safetyBoundaryClarity: 0.9,
            reliability: 0.85,
          },
          recommendationWeights: {
            sameSchoolOrArea: 88,
            sameCity: 72,
            commonInterest: 70,
            lowPressure: 92,
            sports: 90,
            reliability: 86,
            recency: 38,
            safetyBoundary: 90,
          },
          matchingGuidance: {
            shouldPreferSameSchoolOrArea: true,
            shouldPreferSameCity: false,
            shouldPreferCommonInterest: false,
            shouldPreferLowPressure: true,
            shouldPreferSports: true,
            shouldAvoidNight: true,
            shouldUsePublicPlace: true,
            shouldReduceDisturbance: true,
            suggestedFilters: ['只看同校', '只看低压力', '不要晚上'],
            rankingNotes: ['优先同校、低压力、公共场所的跑步搭子。'],
          },
          summary: '你最近更适合低压力运动社交。',
          insights: ['你更容易接受同校或活动区域接近的人。'],
        },
        safetySignals: {
          publicPlaceOnly: true,
          locationSharingAllowed: false,
          strictConfirmationRequired: true,
          realNameRequired: false,
          acceptsNightMeet: false,
        },
        confidence: { overall: 0.9, byField: {} },
        missingCriticalFields: [{ label: '运动强度' }],
      },
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      rawText: '帮我找附近跑步搭子',
      interestTags: ['跑步'],
    });

    expect(lifeGraph?.getUnifiedMatchSignals).toHaveBeenCalledWith(1);
    expect(result.candidates[0].lifeGraphExplanation).toMatchObject({
      usedSignals: expect.arrayContaining([
        expect.stringContaining('青岛大学附近'),
        expect.stringContaining('跑步'),
      ]),
      missingSignals: expect.arrayContaining(['运动强度']),
      boundaryNotes: expect.arrayContaining([
        expect.stringContaining('公共场所'),
      ]),
    });
    expect(
      result.candidates[0].scoreBreakdown.interestSimilarity,
    ).toBeGreaterThan(10);
    expect(
      result.candidates[0].scoreBreakdown.lifeGraphBehaviorFit,
    ).toBeGreaterThan(0);
    expect(result.candidates[0]).toMatchObject({
      whyYouMayLike: expect.stringContaining('不是只因为分数高'),
      matchPoints: expect.arrayContaining([expect.stringContaining('低压力')]),
      boundaryNotes: expect.arrayContaining([
        expect.stringContaining('公共场所'),
      ]),
      openerStrategy: expect.stringContaining('开场'),
      dynamicSignalReasons: expect.arrayContaining([
        expect.stringContaining('低压力运动社交'),
        expect.stringContaining('优先同校'),
      ]),
      continuousFilterHints: expect.arrayContaining([
        '只看同校',
        '只看低压力',
        '不要晚上',
      ]),
    });
  });
});
