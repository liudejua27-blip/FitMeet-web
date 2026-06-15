import { CandidateMatchLevel } from '../match/social-request-candidate.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  LifeGraphAuditAction,
  LifeGraphFieldCategory,
  LifeGraphFieldSource,
} from '../life-graph/life-graph.enums';
import type { CandidateExplanation } from './candidate-explanation.service';
import { buildCandidatePoolCandidate } from './social-agent-candidate-card.presenter';

const now = new Date('2026-05-23T08:00:00.000Z');

function user(overrides: Partial<User> = {}): User {
  return {
    id: 42,
    name: 'Alex',
    avatar: 'https://cdn.fitmeet.app/avatar.png',
    color: '#168a55',
    city: '青岛',
    verified: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as User;
}

function profile(
  overrides: Partial<UserSocialProfile> = {},
): UserSocialProfile {
  return {
    userId: 42,
    city: '青岛',
    nickname: 'Alex',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
    wantToMeet: ['运动搭子'],
    preferredTraits: ['边界感清晰'],
    relationshipGoals: ['低压力认识新朋友'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as UserSocialProfile;
}

function explanation(
  overrides: Partial<CandidateExplanation> = {},
): CandidateExplanation {
  return {
    fitReasons: ['你们都喜欢跑步'],
    suggestedOpener: '周末要不要一起慢跑？',
    awkwardPoints: ['先确认时间和强度'],
    safeFirstStep: '先在公共场所见面',
    nextActionSuggestion: '先发一条轻量消息',
    requiresConfirmation: false,
    ...overrides,
  };
}

function sceneRisk(riskLevel: 'low' | 'high' = 'low') {
  return {
    normalizeScene: jest.fn(() => 'fitness' as const),
    evaluate: jest.fn(() => ({
      riskLevel,
      requiresConfirmation: riskLevel === 'high',
      requiresDoubleConfirmation: false,
      blockedActions: [],
      safetyPrompts:
        riskLevel === 'high' ? ['建议先确认公共场所和同行边界'] : [],
      sceneType: 'fitness' as const,
      actionType: 'send_message' as const,
      permissionMode: 'limited_auto' as const,
    })),
  };
}

describe('buildCandidatePoolCandidate', () => {
  it('assembles the Web/iOS visible candidate card fields', () => {
    const risk = sceneRisk('low');
    const candidate = buildCandidatePoolCandidate({
      source: 'profile_candidate',
      user: user(),
      profile: profile(),
      city: '青岛',
      displayName: 'Alex',
      interestTags: ['跑步', '咖啡'],
      profileCompleteness: 0.92,
      matchScore: 82,
      scoreBreakdown: {
        distance: 14,
        interestSimilarity: 20,
        lifeRhythm: 10,
      },
      commonTags: ['跑步'],
      matchReasons: ['同城', '都喜欢跑步'],
      publicIntentId: null,
      socialRequestId: 100,
      activityId: null,
      query: { acceptsStrangers: true },
      lifeGraphSignals: {
        identitySignals: {},
        socialIntentSignals: {},
        lifestyleSignals: { availableTimes: ['周末下午'] },
        fitnessSignals: {},
        behaviorSignals: {
          activityLevel: 'quiet',
          socialEnergy: 'sports',
          completionTrend: 'reliable',
          cancellationPattern: 'rare',
          pressurePreference: 'low',
          nightBoundary: 'avoids_late_private',
          locationPreference: 'same_school_or_area',
          feedbackPattern: [],
          scores: {
            rhythmConfidence: 0.8,
            sportsAffinity: 0.8,
            lowPressureFit: 0.8,
            safetyBoundaryClarity: 0.8,
            reliability: 0.8,
          },
          recommendationWeights: {
            sameSchoolOrArea: 80,
            sameCity: 80,
            commonInterest: 80,
            lowPressure: 80,
            sports: 80,
            reliability: 80,
            recency: 40,
            safetyBoundary: 80,
          },
          matchingGuidance: {
            shouldPreferSameSchoolOrArea: true,
            shouldPreferSameCity: true,
            shouldPreferCommonInterest: true,
            shouldPreferLowPressure: true,
            shouldPreferSports: true,
            shouldAvoidNight: true,
            shouldUsePublicPlace: true,
            shouldReduceDisturbance: true,
            suggestedFilters: [],
            rankingNotes: [],
          },
          summary: '',
          insights: [],
        },
        safetySignals: {
          realNameRequired: false,
          publicPlaceOnly: true,
          strictConfirmationRequired: true,
          blockedScenarios: [],
          locationSharingAllowed: false,
          acceptsNightMeet: false,
        },
        confidence: { overall: 0.9, byField: {} },
        missingCriticalFields: [],
        preferenceHistory: {
          'lifestyle.availableTimes': [
            {
              category: LifeGraphFieldCategory.Lifestyle,
              fieldKey: 'availableTimes',
              oldValue: ['工作日晚上'],
              newValue: ['周末下午'],
              source: LifeGraphFieldSource.AiInferred,
              confidence: 0.86,
              action: LifeGraphAuditAction.Confirmed,
              reason: '用户确认周末下午更方便。',
              taskId: 101,
              messageId: 'msg-1',
              confirmedByUser: true,
              createdAt: '2026-06-15T00:00:00.000Z',
            },
          ],
        },
      },
      sceneRisk: risk,
      candidateExplanation: { explain: jest.fn(() => explanation()) },
    });

    expect(candidate).toMatchObject({
      source: 'profile_candidate',
      isRealData: true,
      targetUserId: 42,
      candidateUserId: 42,
      userId: 42,
      displayName: 'Alex',
      nickname: 'Alex',
      avatar: 'https://cdn.fitmeet.app/avatar.png',
      city: '青岛',
      dataQuality: 'complete',
      matchScore: 82,
      score: 82,
      level: CandidateMatchLevel.High,
      suggestedOpener: '周末要不要一起慢跑？',
      suggestedMessage: '周末要不要一起慢跑？',
      nextAction: '先发一条轻量消息',
      recommendationConsent: {
        profileDiscoverable: true,
        agentCanRecommendMe: true,
        sourceLabel: '公开可发现且已允许 Agent 推荐',
        privacyLabel: '资料已脱敏，不展示手机号、精确位置或私聊内容',
        strangerPolicyLabel: '你已同意查看公开可发现的陌生人机会',
      },
      relationshipGoal: '低压力认识新朋友',
      idealType: '运动搭子',
      invitePolicy: '仅在你确认后，由 Agent 发送站内邀请',
      riskWarning: '第一次建议选择校园操场、公园或其他公共场所。',
      emotionalInsight: {
        fitReason: '你们都喜欢跑步',
        openerAdvice: '周末要不要一起慢跑？',
        tone: 'gentle',
      },
    });
    expect(candidate.matchedSignals).toEqual(
      expect.arrayContaining([
        '跑步',
        expect.stringContaining('最近确认的可约时间变化'),
      ]),
    );
    expect(candidate.coldStartSignals).toEqual(
      expect.arrayContaining([
        '同城：青岛',
        '你已同意查看公开可发现的陌生人机会',
        '共同兴趣：跑步',
      ]),
    );
    expect(candidate.preferenceHistorySignals).toEqual(
      expect.arrayContaining([
        expect.stringContaining('最近确认的可约时间变化'),
        expect.stringContaining('周末下午'),
      ]),
    );
    expect(candidate.recommendationConsent.privacyLabel).toContain('不展示手机号');
    expect(candidate.recommendationConsent.privacyLabel).toContain('精确位置');
    expect(candidate.recommendationConsent.privacyLabel).toContain('私聊内容');
    expect(candidate.whyYouMayLike).toContain('Alex');
    expect(candidate.whyYouMayLike).toContain('青岛');
    expect(risk.normalizeScene).toHaveBeenCalledWith(
      null,
      expect.stringContaining('跑步'),
    );
  });

  it('keeps high-risk card tone and warning copy on the card', () => {
    const candidate = buildCandidatePoolCandidate({
      source: 'public_intent',
      user: user({ verified: false }),
      profile: profile(),
      city: '青岛',
      displayName: 'Alex',
      interestTags: ['深夜跑步'],
      profileCompleteness: 0.3,
      matchScore: 38,
      scoreBreakdown: { safetyRisk: 3 },
      commonTags: [],
      matchReasons: ['资料较少'],
      publicIntentId: 'intent_1',
      socialRequestId: null,
      activityId: null,
      sceneRisk: sceneRisk('high'),
      candidateExplanation: {
        explain: jest.fn(() => explanation({ requiresConfirmation: true })),
      },
    });

    expect(candidate.level).toBe(CandidateMatchLevel.Low);
    expect(candidate.riskWarnings).toEqual(
      expect.arrayContaining([
        '资料较少，建议先站内沟通确认。',
        '建议先确认公共场所和同行边界',
      ]),
    );
    expect(candidate.riskWarning).toContain('资料较少');
    expect(candidate.emotionalInsight.tone).toBe('careful');
    expect(candidate.status).toBe('suggested');
  });
});
