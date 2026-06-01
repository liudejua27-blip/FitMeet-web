import {
  CandidateRiskLevel,
  SocialRequestCandidateStatus,
} from './social-request-candidate.entity';
/* eslint-disable @typescript-eslint/require-await */
import { MatchService } from './match.service';
import { CompatibilityScorerService } from './compatibility-scorer.service';
import {
  SocialRequestGenderPreference,
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';

const mockRepo = () => ({
  create: jest.fn((data) => data),
  delete: jest.fn().mockResolvedValue({ affected: 0 }),
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(async (data) => ({
    ...data,
    id: data.id ?? 501,
    status: data.status ?? SocialRequestCandidateStatus.Suggested,
  })),
  createQueryBuilder: jest.fn(),
});

function qbReturning(rows: User[], calls?: string[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => {
      calls?.push('db');
      return rows;
    }),
  };
}

function requestQbReturning(rows: UserSocialRequest[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 20,
    email: 'runner@example.com',
    password: '',
    phone: null,
    wechatOpenId: '',
    name: 'Runner',
    avatar: 'R',
    color: '#16C784',
    gender: '',
    age: 28,
    city: '上海',
    lat: null,
    lng: null,
    locationUpdatedAt: null,
    acceptNearbyMatch: true,
    gym: '',
    bio: '喜欢晚上轻松跑步',
    coverUrl: null,
    singleCert: true,
    verified: true,
    interestTags: ['running'],
    trainingDays: 0,
    trainingCount: 0,
    caloriesBurned: 0,
    bestRecords: [],
    isCoach: false,
    trustScore: 20,
    socialTrustCount: 1,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-20T00:00:00Z'),
    ...overrides,
  } as User;
}

function profile(
  overrides: Partial<UserSocialProfile> = {},
): UserSocialProfile {
  return {
    userId: 20,
    nickname: 'Runner',
    gender: '',
    ageRange: '25-30',
    city: '上海',
    zodiac: '',
    mbti: '',
    traits: ['自律'],
    socialStyle: '',
    communicationStyle: '',
    nearbyArea: '徐汇',
    fitnessGoals: ['running'],
    interestTags: ['running'],
    lifestyleTags: [],
    socialScenes: ['夜跑'],
    wantToMeet: ['跑步搭子'],
    preferredTraits: ['自律'],
    avoidTraits: [],
    relationshipGoals: ['找搭子'],
    openness: '',
    availableTimes: ['晚上'],
    weekdayAvailability: '',
    weekendAvailability: '',
    socialPreference: '',
    rejectRules: '',
    privacyBoundary: '',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
    hideSensitiveTags: true,
    aiSummary: '',
    aiProfileCard: {},
    matchSignals: {},
    sensitiveTagDecisions: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as UserSocialProfile;
}

function request(
  overrides: Partial<UserSocialRequest> = {},
): UserSocialRequest {
  return {
    id: 301,
    userId: 10,
    agentId: null,
    source: SocialRequestSource.Manual,
    type: SocialRequestType.RunningPartner,
    title: '今晚跑步',
    description: '找一个轻松夜跑搭子',
    rawText: '今晚跑步',
    city: '上海',
    lat: null,
    lng: null,
    radiusKm: 5,
    timeStart: null,
    timeEnd: null,
    genderPreference: SocialRequestGenderPreference.Any,
    ageMin: null,
    ageMax: null,
    interestTags: ['running'],
    activityType: 'running',
    safetyRequirement: SocialRequestSafety.None,
    agentAllowed: true,
    requireUserConfirmation: true,
    status: UserSocialRequestStatus.Matching,
    visibility: SocialRequestVisibility.MatchedOnly,
    metadata: {
      timePreference: '晚上',
      socialGoal: '找跑步搭子',
      personalityPreference: ['自律'],
    },
    expiresAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as UserSocialRequest;
}

function makeHarness(
  rows: User[] = [user()],
  activeRequests: UserSocialRequest[] = [],
) {
  const callOrder: string[] = [];
  const userRepo = mockRepo();
  const requestRepo = mockRepo();
  const candidateRepo = mockRepo();
  const prefRepo = mockRepo();
  const profileRepo = mockRepo();
  const safety = {
    getMutualBlockUserIds: jest.fn().mockResolvedValue(new Set()),
  };
  const reasoner = {
    explainSocialRequestCandidate: jest.fn(async (input) => {
      callOrder.push('ai');
      return {
        score: 86,
        scoreBreakdown: { ...input.scoreBreakdown, aiSecondPass: 4 },
        matchedSignals: ['running', '晚上'],
        publicReason: '共同跑步且时间偏好接近。',
        privateReason: '候选来自 MatchService 规则评分，AI 只负责解释。',
        riskWarning: '先站内沟通。',
        riskWarnings: ['先站内沟通。'],
        suggestedOpener: '你好，看到你也喜欢跑步，方便先在 FitMeet 聊聊吗？',
        nextAction: 'owner_confirmation_required',
        reasonerSource: 'fallback',
      };
    }),
  };
  const actionLogs = { logAgentAction: jest.fn().mockResolvedValue(null) };
  const qb = qbReturning(rows, callOrder);
  userRepo.createQueryBuilder.mockReturnValue(qb);
  userRepo.findOne.mockResolvedValue(user({ id: 10, name: 'Owner' }));
  requestRepo.findOne.mockResolvedValue(request());
  requestRepo.createQueryBuilder.mockReturnValue(
    requestQbReturning(activeRequests),
  );
  profileRepo.findOne.mockResolvedValue(profile({ userId: 10 }));
  profileRepo.find.mockResolvedValue(
    rows.map((row) => profile({ userId: row.id })),
  );
  prefRepo.find.mockResolvedValue(
    rows.map((row) => ({ userId: row.id, acceptAgentMessages: true })),
  );
  const service = new MatchService(
    userRepo as never,
    requestRepo as never,
    candidateRepo as never,
    prefRepo as never,
    profileRepo as never,
    safety as never,
    reasoner as never,
    actionLogs as never,
    new CompatibilityScorerService(),
  );
  return {
    service,
    callOrder,
    userRepo,
    requestRepo,
    candidateRepo,
    profileRepo,
    reasoner,
    actionLogs,
  };
}

describe('MatchService social request matching', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('recalls DB candidates before AI reasoning and returns the social request contract', async () => {
    const { service, callOrder, reasoner, candidateRepo } = makeHarness();

    const result = await service.runMatch(301, 10, { limit: 5 });

    expect(callOrder).toEqual(['db', 'ai']);
    expect(reasoner.explainSocialRequestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ baseScore: expect.any(Number) }),
    );
    expect(candidateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ candidateUserId: 20, score: 86 }),
    );
    expect(result.candidates[0]).toMatchObject({
      candidateUserId: 20,
      source: 'social_request',
      score: 86,
      scoreBreakdown: expect.objectContaining({
        distance: expect.any(Number),
        timeOverlap: expect.any(Number),
        interestSimilarity: expect.any(Number),
        lifeRhythm: expect.any(Number),
        socialEnergy: expect.any(Number),
        relationshipGoal: expect.any(Number),
        trustworthiness: expect.any(Number),
        safetyRisk: expect.any(Number),
        aiSecondPass: 4,
      }),
      matchedSignals: ['running', '晚上'],
      publicReason: expect.stringContaining('跑步'),
      privateReason: expect.stringContaining('规则评分'),
      riskWarning: expect.any(String),
      suggestedOpener: expect.stringContaining('FitMeet'),
      nextAction: 'strict_owner_confirmation_required:walking',
    });
  });

  it('raises high-risk scenes to double confirmation even after AI reasoning', async () => {
    const { service, requestRepo, candidateRepo } = makeHarness();
    requestRepo.findOne.mockResolvedValue(
      request({
        type: SocialRequestType.Custom,
        title: 'Friday drink buddy',
        description: 'Find a drink buddy near a public bar.',
        rawText: 'drink buddy bar',
        activityType: 'drink',
        interestTags: ['drink'],
      }),
    );

    const result = await service.runMatch(301, 10, { limit: 5 });
    const candidate = result.candidates[0];

    expect(candidate.nextAction).toBe('double_confirmation_required:drinking');
    expect(candidate.risk.level).toBe(CandidateRiskLevel.High);
    expect(candidate.risk.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Agent')]),
    );
    expect(candidate.scoreBreakdown).toEqual(
      expect.objectContaining({
        distance: expect.any(Number),
        timeOverlap: expect.any(Number),
        interestSimilarity: expect.any(Number),
        lifeRhythm: expect.any(Number),
        socialEnergy: expect.any(Number),
        relationshipGoal: expect.any(Number),
        trustworthiness: expect.any(Number),
        safetyRisk: expect.any(Number),
      }),
    );
    expect(candidateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ riskLevel: CandidateRiskLevel.High }),
    );
  });

  it('uses strict confirmation for medium-risk offline scenes', async () => {
    const { service, requestRepo } = makeHarness();
    requestRepo.findOne.mockResolvedValue(
      request({
        type: SocialRequestType.Custom,
        title: 'Mahjong table',
        description: 'Find a mahjong buddy nearby.',
        rawText: 'mahjong buddy',
        activityType: 'mahjong',
        interestTags: ['mahjong'],
      }),
    );

    const result = await service.runMatch(301, 10, { limit: 5 });

    expect(result.candidates[0]).toMatchObject({
      nextAction: 'strict_owner_confirmation_required:mahjong',
      risk: expect.objectContaining({ level: CandidateRiskLevel.Medium }),
    });
  });

  it('keeps low-risk coffee chats at normal owner confirmation', async () => {
    const { service, requestRepo } = makeHarness();
    requestRepo.findOne.mockResolvedValue(
      request({
        type: SocialRequestType.CoffeeChat,
        title: 'Coffee chat',
        description: 'Quiet public cafe chat.',
        rawText: 'coffee chat',
        activityType: 'coffee',
        interestTags: ['coffee'],
      }),
    );

    const result = await service.runMatch(301, 10, { limit: 5 });

    expect(result.candidates[0]).toMatchObject({
      nextAction: 'owner_confirmation_required',
      risk: expect.objectContaining({ level: CandidateRiskLevel.Low }),
    });
  });

  it('filters test-like users from production candidate pools', async () => {
    process.env.NODE_ENV = 'production';
    const testUser = user({
      id: 21,
      email: 'test-user@example.com',
      name: '测试用户',
    });
    const realUser = user({
      id: 22,
      email: 'real@example.com',
      name: 'Real Runner',
    });
    const { service, reasoner } = makeHarness([testUser, realUser]);

    const result = await service.runMatch(301, 10, { limit: 5 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].candidateUserId).toBe(22);
    expect(reasoner.explainSocialRequestCandidate).toHaveBeenCalledTimes(1);
    expect(reasoner.explainSocialRequestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateUser: expect.objectContaining({ id: 22 }),
      }),
    );
  });

  it('honors explicit privacy-boundary recommendation opt-outs', async () => {
    const visible = user({
      id: 21,
      email: 'visible@example.com',
      name: 'Visible Runner',
    });
    const hidden = user({
      id: 22,
      email: 'hidden@example.com',
      name: 'Hidden Runner',
    });
    const agentOptOut = user({
      id: 23,
      email: 'agent-opt-out@example.com',
      name: 'Quiet Runner',
    });
    const { service, profileRepo, reasoner } = makeHarness([
      visible,
      hidden,
      agentOptOut,
    ]);
    profileRepo.find.mockResolvedValue([
      profile({
        userId: 21,
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      }),
      profile({
        userId: 22,
        privacyBoundary: '关闭推荐，不参与匹配',
      }),
      profile({
        userId: 23,
        profileDiscoverable: true,
        agentCanRecommendMe: false,
      }),
    ]);

    const result = await service.runMatch(301, 10, { limit: 10 });

    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).toEqual(expect.arrayContaining([21, 23]));
    expect(
      result.candidates.map((candidate) => candidate.candidateUserId),
    ).not.toContain(22);
    expect(reasoner.explainSocialRequestCandidate).toHaveBeenCalledTimes(2);
  });

  it('keeps default-recommendable real users and public-card users', async () => {
    const profileCandidate = user({
      id: 21,
      email: 'profile@example.com',
      name: 'Profile Runner',
    });
    const plainCandidate = user({
      id: 22,
      email: 'plain@example.com',
      name: 'Plain Runner',
    });
    const publicCardCandidate = user({
      id: 23,
      email: 'public-card@example.com',
      name: 'Public Card Runner',
    });
    const { service, profileRepo, reasoner } = makeHarness(
      [profileCandidate, plainCandidate, publicCardCandidate],
      [
        request({
          id: 401,
          userId: 23,
          title: '周末一起夜跑',
          visibility: SocialRequestVisibility.Public,
          status: UserSocialRequestStatus.Matching,
          agentAllowed: true,
          interestTags: ['running'],
          activityType: 'running',
        }),
      ],
    );
    profileRepo.find.mockResolvedValue([
      profile({
        userId: 21,
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      }),
      profile({
        userId: 22,
        profileDiscoverable: false,
        agentCanRecommendMe: false,
      }),
    ]);

    const result = await service.runMatch(301, 10, { limit: 10 });

    const ids = result.candidates.map((candidate) => candidate.candidateUserId);
    expect(ids).toEqual(expect.arrayContaining([21, 22, 23]));
    expect(ids).toHaveLength(3);
    expect(reasoner.explainSocialRequestCandidate).toHaveBeenCalledTimes(3);
    expect(
      result.candidates.find((candidate) => candidate.candidateUserId === 23)
        ?.reasons,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('active public social request'),
      ]),
    );
  });
});
