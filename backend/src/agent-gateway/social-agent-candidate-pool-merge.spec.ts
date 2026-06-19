import { CandidateMatchLevel } from '../match/social-request-candidate.entity';
import { mergeSocialAgentCandidatePool } from './social-agent-candidate-pool-merge';
import type { CandidatePoolCandidate } from './social-agent-candidate-pool.service';

function candidate(
  overrides: Partial<CandidatePoolCandidate> = {},
): CandidatePoolCandidate {
  return {
    source: 'profile_candidate',
    isRealData: true,
    targetUserId: 2,
    candidateUserId: 2,
    userId: 2,
    publicIntentId: null,
    socialRequestId: 301,
    activityId: null,
    displayName: 'Candidate',
    nickname: 'Candidate',
    avatar: '',
    color: '#202124',
    city: '青岛',
    interestTags: ['coffee'],
    profileCompleteness: 0.8,
    dataQuality: 'complete',
    matchScore: 72,
    score: 72,
    level: CandidateMatchLevel.Medium,
    matchReasons: ['来自真实注册用户和社交画像。'],
    reasons: ['来自真实注册用户和社交画像。'],
    riskWarnings: [],
    risk: { level: 'low' as never, warnings: [] },
    suggestedOpener: 'Hi',
    suggestedMessage: 'Hi',
    commonTags: ['coffee'],
    distanceKm: null,
    scoreBreakdown: { distance: 14 },
    candidateRecordId: null,
    status: 'suggested' as never,
    matchedSignals: ['coffee'],
    publicReason: '你们都喜欢咖啡',
    privateReason: '周末都有空',
    riskWarning: '',
    nextAction: 'draft_invitation',
    recommendationConsent: {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      sourceLabel: '公开可发现且已允许 Agent 推荐',
      privacyLabel: '资料已脱敏，邀请前需要你确认',
      strangerPolicyLabel: '你已同意查看公开可发现的陌生人机会',
    },
    relationshipGoal: '低压力认识新朋友',
    idealType: '运动搭子',
    invitePolicy: '先生成开场白，你确认后再决定是否邀请',
    coldStartSignals: ['同城：青岛', '共同兴趣：coffee'],
    preferenceHistorySignals: [],
    whyYouMayLike: '你们都喜欢咖啡',
    whyNow: '周末都有空',
    matchPoints: ['咖啡'],
    boundaryNotes: [],
    openerStrategy: '礼貌开场',
    dynamicSignalReasons: ['coffee'],
    continuousFilterHints: [],
    candidateExplanation: {
      suggestedOpener: 'Hi',
      fitReasons: ['你们都喜欢咖啡'],
      awkwardPoints: [],
      safeFirstStep: '站内沟通',
      nextActionSuggestion: 'draft_invitation',
      requiresConfirmation: false,
      lifeGraphExplanation: undefined,
    },
    emotionalInsight: {
      fitReason: '节奏相近',
      openerAdvice: '先轻松问候',
      possibleAwkwardness: '资料较少',
      safeFirstStep: '站内沟通',
      tone: 'gentle',
    },
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeSocialAgentCandidatePool', () => {
  it('deduplicates candidates by user and keeps the highest scoring source', () => {
    const merged = mergeSocialAgentCandidatePool([
      candidate({
        source: 'profile_candidate',
        candidateUserId: 2,
        matchScore: 72,
        publicIntentId: null,
        socialRequestId: 301,
        interestTags: ['coffee', 'running'],
        commonTags: ['coffee'],
        matchReasons: ['profile reason', 'shared coffee'],
        reasons: ['profile reason', 'shared coffee'],
      }),
      candidate({
        source: 'public_intent',
        candidateUserId: 2,
        matchScore: 88,
        publicIntentId: 'intent_2',
        socialRequestId: null,
        interestTags: ['coffee', 'photo'],
        commonTags: ['photo'],
        matchReasons: ['public intent reason', 'shared coffee'],
        reasons: ['public intent reason', 'shared coffee'],
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      source: 'public_intent',
      candidateUserId: 2,
      matchScore: 88,
      publicIntentId: 'intent_2',
      socialRequestId: 301,
      matchReasons: ['profile reason', 'shared coffee', 'public intent reason'],
      reasons: ['profile reason', 'shared coffee', 'public intent reason'],
      interestTags: ['coffee', 'running', 'photo'],
      commonTags: ['coffee', 'photo'],
    });
  });

  it('keeps a stable descending score order after merging', () => {
    const merged = mergeSocialAgentCandidatePool([
      candidate({ candidateUserId: 2, matchScore: 60 }),
      candidate({
        candidateUserId: 3,
        targetUserId: 3,
        userId: 3,
        matchScore: 91,
      }),
      candidate({
        candidateUserId: 4,
        targetUserId: 4,
        userId: 4,
        matchScore: 75,
      }),
    ]);

    expect(merged.map((item) => item.candidateUserId)).toEqual([3, 4, 2]);
  });

  it('caps merged reasons to six user-visible signals', () => {
    const merged = mergeSocialAgentCandidatePool([
      candidate({
        candidateUserId: 2,
        matchReasons: ['r1', 'r2', 'r3', 'r4'],
        reasons: ['r1', 'r2', 'r3', 'r4'],
      }),
      candidate({
        candidateUserId: 2,
        matchReasons: ['r3', 'r5', 'r6', 'r7'],
        reasons: ['r3', 'r5', 'r6', 'r7'],
      }),
    ]);

    expect(merged[0].matchReasons).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
      'r5',
      'r6',
    ]);
  });
});
