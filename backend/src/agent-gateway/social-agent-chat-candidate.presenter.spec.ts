import type { MatchedCandidateView } from '../match/match.service';
import {
  candidateExplanationFromRecord,
  emotionalInsightFromRecord,
  toSocialAgentChatCandidate,
} from './social-agent-chat-candidate.presenter';

describe('social-agent-chat-candidate.presenter', () => {
  it('normalizes candidate explanation records for chat cards', () => {
    expect(
      candidateExplanationFromRecord({
        fitReasons: ['同城', '', '都喜欢跑步'],
        awkwardPoints: ['时间还要确认'],
        suggestedOpener: '周末一起慢跑吗？',
        safeFirstStep: '先在站内确认时间地点',
        requiresConfirmation: true,
      }),
    ).toEqual({
      fitReasons: ['同城', '都喜欢跑步'],
      awkwardPoints: ['时间还要确认'],
      suggestedOpener: '周末一起慢跑吗？',
      safeFirstStep: '先在站内确认时间地点',
      nextActionSuggestion: '确认后发送轻量开场',
      requiresConfirmation: true,
    });
  });

  it('drops incomplete emotional insights before they reach the client', () => {
    expect(
      emotionalInsightFromRecord({
        fitReason: '训练节奏接近',
        openerAdvice: '',
        safeFirstStep: '先公开场所见面',
      }),
    ).toBeUndefined();
  });

  it('maps matched candidate views into social agent chat candidates', () => {
    const candidate = {
      userId: 21,
      candidateUserId: 22,
      candidateRecordId: 33,
      nickname: 'Ava',
      avatar: 'https://cdn.test/avatar.png',
      color: '',
      score: 87.4,
      level: 'high',
      distanceKm: 1.8,
      commonTags: ['跑步', ''],
      reasons: ['同城', '目标接近'],
      risk: { level: 'low', warnings: ['先站内沟通'] },
      suggestedMessage: '周末一起慢跑吗？',
      source: 'public_intent',
      isRealData: true,
      socialRequestId: 44,
      publicIntentId: 'intent_1',
      activityId: 55,
      city: '青岛',
      matchScore: 92,
      interestTags: ['跑步', '咖啡'],
      profileCompleteness: 80,
      dataQuality: 'complete',
      candidateExplanation: {
        fitReasons: ['距离近'],
        suggestedOpener: '你这周末想跑多远？',
        safeFirstStep: '先约公开路线',
      },
      emotionalInsight: {
        fitReason: '兴趣相近',
        openerAdvice: '轻松开场',
        safeFirstStep: '先聊路线',
        tone: 'gentle',
      },
      status: 'recommended',
    } as unknown as MatchedCandidateView;

    expect(toSocialAgentChatCandidate(7, null, candidate)).toMatchObject({
      agentTaskId: 7,
      source: 'public_intent',
      isRealData: true,
      socialRequestId: 44,
      targetUserId: 22,
      userId: 22,
      candidateUserId: 22,
      publicIntentId: 'intent_1',
      activityId: 55,
      displayName: 'Ava',
      nickname: 'Ava',
      color: '#202124',
      city: '青岛',
      score: 92,
      matchScore: 92,
      commonTags: ['跑步'],
      matchReasons: ['同城', '目标接近'],
      riskWarnings: ['先站内沟通'],
      interestTags: ['跑步', '咖啡'],
      profileCompleteness: 80,
      dataQuality: 'complete',
      suggestedMessage: '周末一起慢跑吗？',
      status: 'recommended',
      candidateExplanation: {
        fitReasons: ['距离近'],
        suggestedOpener: '你这周末想跑多远？',
      },
      emotionalInsight: {
        fitReason: '兴趣相近',
        openerAdvice: '轻松开场',
        tone: 'gentle',
      },
    });
  });
});
