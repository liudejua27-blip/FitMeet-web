import { describe, expect, it } from 'vitest';

import {
  detailHrefForDiscoverMeet,
  publicIntentToDiscoverMeet,
} from '../pages/DiscoverPage';
import type { PublicSocialIntent } from '../types';

describe('Discover closure links', () => {
  it('routes public social intents to real detail pages instead of focusScene anchors', () => {
    const linked = publicIntentToDiscoverMeet(
      publicIntent({
        id: 'intent:linked-run',
        linkedSocialRequestId: 301,
      }),
      0,
    );
    const standalone = publicIntentToDiscoverMeet(
      publicIntent({
        id: 'intent:standalone-run',
        linkedSocialRequestId: null,
      }),
      1,
    );

    expect(detailHrefForDiscoverMeet(linked)).toBe('/social-request/301');
    expect(detailHrefForDiscoverMeet(standalone)).toBe(
      '/public-intent/intent%3Astandalone-run',
    );
    expect(detailHrefForDiscoverMeet(linked)).not.toContain('focusScene');
    expect(detailHrefForDiscoverMeet(standalone)).not.toContain('focusScene');
  });

  it('keeps real activity and meet cards on their detail pages', () => {
    expect(
      detailHrefForDiscoverMeet({
        id: 88,
        activityId: 9,
        title: '周末羽毛球',
        sourceKind: 'meet',
      } as never),
    ).toBe('/activity/9');
    expect(
      detailHrefForDiscoverMeet({
        id: 88,
        title: '周末羽毛球',
        sourceKind: 'meet',
      } as never),
    ).toBe('/meet/88');
  });

  it('keeps fallback cards out of fake Discover focus links', () => {
    expect(
      detailHrefForDiscoverMeet({
        id: -1,
        title: '今晚慢跑',
        sourceKind: 'fallback',
      } as never),
    ).toBe('/agent/chat?scene=%E4%BB%8A%E6%99%9A%E6%85%A2%E8%B7%91');
  });
});

function publicIntent(
  overrides: Partial<PublicSocialIntent> = {},
): PublicSocialIntent {
  return {
    id: 'intent:qingdao-run',
    userId: 7,
    linkedSocialRequestId: null,
    source: 'agent',
    mode: 'public',
    requestType: 'running',
    title: '青岛周末慢跑',
    description: '想找一个周末下午一起慢跑的人，先站内聊。',
    interestTags: ['跑步', '低压力'],
    city: '青岛',
    loc: '市南区',
    locationPreference: '市南区公共路线',
    socialGoal: '找跑步搭子',
    lat: null,
    lng: null,
    radiusKm: 5,
    timePreference: '周末下午',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    filters: {},
    candidateUserIds: [11, 12, 13],
    matchedCount: 3,
    matchSignal: {
      score: 86,
      confidence: 'high',
      source: 'fitmeet',
      reasons: ['同城', '时间匹配'],
      updatedAt: '2026-06-15T00:00:00.000Z',
    },
    status: 'active',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}
