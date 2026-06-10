import { CandidateMatchLevel } from '../match/social-request-candidate.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
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
      riskWarning: '第一次建议先站内沟通，选择公共场所，不共享精确位置。',
      emotionalInsight: {
        fitReason: '你们都喜欢跑步',
        openerAdvice: '周末要不要一起慢跑？',
        tone: 'gentle',
      },
    });
    expect(candidate.matchedSignals).toEqual(['跑步']);
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
