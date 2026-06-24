import { AIService } from '../ai/ai.service';
import {
  SocialRequestSource,
  SocialRequestType,
  UserSocialRequest,
} from '../social-requests/social-request.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';
import { AiMatchReasonerService } from './ai-match-reasoner.service';
import { MatchPrivacySanitizer } from './match-privacy-sanitizer.service';

function request(
  overrides: Partial<UserSocialRequest> = {},
): UserSocialRequest {
  return {
    id: 1,
    userId: 10,
    agentId: null,
    source: SocialRequestSource.Manual,
    type: SocialRequestType.RunningPartner,
    title: '今晚跑步',
    description: '',
    rawText: '',
    city: '上海',
    lat: null,
    lng: null,
    radiusKm: 5,
    timeStart: null,
    timeEnd: null,
    interestTags: ['running'],
    activityType: 'running',
    agentAllowed: true,
    requireUserConfirmation: true,
    metadata: { timePreference: '晚上', socialGoal: '找跑步搭子' },
    expiresAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as UserSocialRequest;
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 20,
    email: 'runner@example.com',
    password: '',
    phone: '13800000000',
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
    bio: '',
    coverUrl: null,
    singleCert: false,
    verified: true,
    interestTags: ['running'],
    trainingDays: 0,
    trainingCount: 0,
    caloriesBurned: 0,
    bestRecords: [],
    trustScore: 10,
    socialTrustCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
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
    nearbyArea: '浦东',
    fitnessGoals: ['跑步'],
    interestTags: ['running'],
    lifestyleTags: [],
    socialScenes: [],
    wantToMeet: [],
    preferredTraits: [],
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

describe('AiMatchReasonerService', () => {
  it('does not pass unconfirmed sensitive tags or raw private fields to DeepSeek adapters', async () => {
    const ai = {
      rescoreCompatibility: jest.fn().mockResolvedValue({
        score: 80,
        confidence: 0.7,
        source: 'deepseek',
        publicReason: '共同跑步，时间接近。',
        privateReason: '规则评分后仅做解释。',
        reasons: [],
        riskWarnings: [],
      }),
      generateCandidateMatchContent: jest.fn().mockResolvedValue({
        source: 'deepseek',
        recommendationReasons: ['都喜欢跑步'],
        icebreakerMessage: '你好，方便先在 FitMeet 聊聊跑步时间吗？',
        riskWarnings: [],
      }),
    } as unknown as AIService;
    const service = new AiMatchReasonerService(ai, new MatchPrivacySanitizer());

    await service.explainSocialRequestCandidate({
      request: request(),
      source: 'social_request',
      ownerProfile: profile({
        userId: 10,
        privacyBoundary: '不公开手机号 13900000000',
      }),
      candidateUser: user({ name: 'Runner', phone: '13800000000' }),
      candidateProfile: profile({
        matchSignals: {
          publicTags: ['running', 'rich'],
          privatePreferenceTags: ['收入 50000元'],
          sensitivePrivateTags: ['rich', '手机号13800000000'],
          matchKeywords: ['running', 'rich'],
        },
        sensitiveTagDecisions: {
          rich: { status: 'pending', category: 'wealth' },
        },
        privacyBoundary: '微信 runner_123，住址: 中关村大街1号',
      }),
      baseScore: 76,
      scoreBreakdown: { distance: 25 },
      deterministicReasons: ['Shared public tags: running'],
      commonTags: ['running'],
      riskWarnings: [],
      distanceKm: 2,
    });

    const payload = JSON.stringify(
      (ai.rescoreCompatibility as jest.Mock).mock.calls[0][0],
    );
    expect(payload).toContain('running');
    expect(payload).not.toMatch(
      /rich|50000|13800000000|runner_123|中关村大街1号/,
    );
  });

  it('falls back when DeepSeek adapters fail', async () => {
    const ai = {
      rescoreCompatibility: jest
        .fn()
        .mockRejectedValue(new Error('DeepSeek down')),
      generateCandidateMatchContent: jest.fn(),
    } as unknown as AIService;
    const service = new AiMatchReasonerService(ai, new MatchPrivacySanitizer());

    const result = await service.explainSocialRequestCandidate({
      request: request(),
      source: 'social_request',
      ownerProfile: null,
      candidateUser: user(),
      candidateProfile: profile(),
      baseScore: 72,
      scoreBreakdown: { distance: 25, time: 20 },
      deterministicReasons: ['Shared public tags: running'],
      commonTags: ['running'],
      riskWarnings: [],
      distanceKm: 2,
    });

    expect(result.score).toBe(72);
    expect(result.reasonerSource).toBe('fallback');
    expect(result.reasoningDegraded).toBe(true);
    expect(result.reasoningRetryable).toBe(true);
    expect(result.degradationReason).toBe('model_unavailable');
    expect(result.reasonerConfidence).toBeLessThanOrEqual(0.45);
    expect(result.publicReason).toContain('running');
    expect(result.suggestedOpener).toContain('FitMeet');
    expect(result.riskWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('智能推荐解释暂时不可用'),
      ]),
    );
    expect(result.scoreBreakdown).toMatchObject({
      distance: 25,
      time: 20,
      aiReasoningConfidence: 45,
      aiReasoningDegraded: 1,
    });
  });
});
