import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  detailHrefForDiscoverMeet,
  publicIntentToDiscoverMeet,
} from '../pages/discoverMeetPresenter';
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

    expect(detailHrefForDiscoverMeet(linked)).toBe('/public-intent/intent%3Alinked-run');
    expect(detailHrefForDiscoverMeet(standalone)).toBe('/public-intent/intent%3Astandalone-run');
    expect(detailHrefForDiscoverMeet(linked)).not.toContain('focusScene');
    expect(detailHrefForDiscoverMeet(standalone)).not.toContain('focusScene');
  });

  it('does not revive retired activity or meet detail routes for legacy cards', () => {
    expect(
      detailHrefForDiscoverMeet({
        id: 88,
        activityId: 9,
        title: '周末羽毛球',
        sourceKind: 'meet',
      } as never),
    ).toBe('/agent/chat?scene=%E5%91%A8%E6%9C%AB%E7%BE%BD%E6%AF%9B%E7%90%83');
    expect(
      detailHrefForDiscoverMeet({
        id: 88,
        title: '周末羽毛球',
        sourceKind: 'meet',
      } as never),
    ).toBe('/agent/chat?scene=%E5%91%A8%E6%9C%AB%E7%BE%BD%E6%AF%9B%E7%90%83');
  });

  it('does not keep built-in fallback Discover cards in the production page source', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/DiscoverPage.tsx'), 'utf8');

    expect(source).not.toContain('fallbackMeets');
    expect(source).not.toContain('VITE_ENABLE_DISCOVER_FALLBACK');
    expect(source).not.toContain("sourceKind: 'fallback'");
    expect(source).toContain('data-testid="discover-real-empty-state"');
  });

  it('keeps public intent cards product-safe without leaking internal ids or fake recency', () => {
    const meet = publicIntentToDiscoverMeet(
      publicIntent({
        id: 'intent:visible-owner',
        userId: 912,
        city: '上海',
        radiusKm: 3,
      }),
      0,
    );
    const source = readFileSync(join(process.cwd(), 'src/pages/DiscoverPage.tsx'), 'utf8');

    expect(meet.username).toBe('同频发起人');
    expect(meet.username).not.toContain('912');
    expect(meet.city).toBe('上海');
    expect(source).not.toContain('青岛 · {resolvedDistance}');
    expect(source).not.toContain('`${(index + 1) * 10} 分钟前`');
    expect(source).toContain("formatRelativePublishedTime(meet.createdAt, '刚刚更新')");
  });

  it('records real Discover and profile clicks as recommendation behavior signals', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/DiscoverPage.tsx'), 'utf8');

    expect(source).toContain('recordInterestEvent');
    expect(source).toContain("eventType: 'discover_click'");
    expect(source).toContain("eventType: 'view_profile'");
    expect(source).toContain("source: 'discover_page'");
    expect(source).toContain("source: 'discover_people_list'");
  });

  it('records public intent detail and profile opens as recommendation behavior signals', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/pages/PublicIntentDetailPage.tsx'),
      'utf8',
    );

    expect(source).toContain('recordInterestEvent');
    expect(source).toContain("eventType: 'discover_click'");
    expect(source).toContain("eventType: 'view_profile'");
    expect(source).toContain("source: 'public_intent_detail_page'");
    expect(source).toContain("source: 'public_intent_detail_dwell'");
    expect(source).toContain("source: 'public_intent_detail_owner_link'");
    expect(source).toContain("source: 'public_intent_detail_candidate_link'");
    expect(source).toContain('publicIntentId');
  });
});

function publicIntent(overrides: Partial<PublicSocialIntent> = {}): PublicSocialIntent {
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
