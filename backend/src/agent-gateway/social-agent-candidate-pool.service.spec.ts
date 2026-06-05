/* eslint-disable @typescript-eslint/require-await */
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
    isCoach: false,
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
    profileDiscoverable: false,
    agentCanRecommendMe: false,
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
    source: 'public_social_skills',
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
    lifeGraphSignals?: Record<string, unknown> | null;
  } = {},
) {
  const users = repo(options.users ?? [realUser(1), realUser(2)]);
  const profiles = repo(options.profiles ?? []);
  const delegates = repo([]);
  const publicIntents = repo(options.publicIntents ?? []);
  const legacyRequests = repo([]);
  const socialRequests = repo(options.socialRequests ?? []);
  const activities = repo(options.activities ?? []);
  const candidates = repo([]);
  const tasks = repo([]);
  const safety = {
    getMutualBlockUserIds: jest.fn(
      async () => new Set(options.blockedIds ?? []),
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
  );
  return { service, candidates, safety, lifeGraph };
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

  it('social_search returns real public_social_intents', async () => {
    const { service } = makeService({
      publicIntents: [publicIntent('intent_2', 2)],
    });

    const result = await service.searchSocial({
      ownerUserId: 1,
      city: '青岛',
      interestTags: ['咖啡'],
    });

    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'public_intent',
          isRealData: true,
          candidateUserId: 2,
          publicIntentId: 'intent_2',
        }),
      ]),
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

  it('returns emptyReason and does not generate FitMeet User names when no real candidates exist', async () => {
    const { service } = makeService({ users: [realUser(1)] });

    const result = await service.searchSocial({ ownerUserId: 1, city: '青岛' });

    expect(result.candidates).toEqual([]);
    expect(result.emptyReason).toBe('no_real_candidates');
    expect(JSON.stringify(result)).not.toMatch(/FitMeet User/i);
  });

  it('treats missing or null profileDiscoverable as recommendable', async () => {
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
  });

  it('treats missing or null agentCanRecommendMe as recommendable', async () => {
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

  it('keeps incomplete real users but lowers their dataQuality and score', async () => {
    const { service } = makeService({
      users: [
        realUser(1),
        realUser(2, { name: 'FitMeet User M5l4', city: '', interestTags: [] }),
      ],
      profiles: [],
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

  it('productizes mahjong confirmation risk into candidate risk and persisted rows', async () => {
    const { service, candidates } = makeService({
      profiles: [profile(2, { interestTags: ['麻将'], city: '青岛' })],
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
