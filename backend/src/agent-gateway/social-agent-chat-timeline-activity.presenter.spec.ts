import {
  normalizePendingApprovalSnapshot,
  readSocialAgentActivityResults,
} from './social-agent-chat-timeline-activity.presenter';

describe('social-agent-chat-timeline-activity.presenter', () => {
  it('normalizes persisted activity results for restored chat timelines', () => {
    expect(
      readSocialAgentActivityResults([
        {
          id: 'intent_1',
          source: 'public_intent',
          title: '青岛大学夜跑',
          description: '操场 3km',
          locationName: '青岛大学操场',
          type: 'run',
          interestTags: ['跑步', '', '夜跑'],
          matchScore: '88',
          matchReasons: ['同城', '时间匹配'],
          isRealData: true,
        },
        {
          source: 'activity',
          activityId: '42',
          title: '',
          requestType: 'photography',
        },
        { title: 'missing id should be dropped' },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: 'intent_1',
        source: 'public_intent',
        title: '青岛大学夜跑',
        loc: '青岛大学操场',
        requestType: 'run',
        interestTags: ['跑步', '夜跑'],
        matchScore: 88,
        matchReasons: ['同城', '时间匹配'],
        isRealData: true,
      }),
      expect.objectContaining({
        id: '',
        source: 'activity',
        activityId: 42,
        title: '活动',
        requestType: 'photography',
      }),
    ]);
  });

  it('normalizes pending approval cards without trusting malformed records', () => {
    expect(
      normalizePendingApprovalSnapshot({
        id: '501',
        type: 'send_message',
        actionType: 'send_candidate_message',
        summary: '确认发送给 Alex',
        riskLevel: '',
        payload: { targetUserId: 22 },
        expiresAt: '',
      }),
    ).toEqual({
      id: 501,
      type: 'send_message',
      actionType: 'send_candidate_message',
      summary: '确认发送给 Alex',
      riskLevel: 'medium',
      payload: { targetUserId: 22 },
      expiresAt: null,
    });

    expect(normalizePendingApprovalSnapshot({ id: 501 })).toBeUndefined();
    expect(normalizePendingApprovalSnapshot(null)).toBeUndefined();
  });
});
