import { SocialAgentRagService } from './social-agent-rag.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';

function emptySnapshot(userId: number): LongTermMemorySnapshot {
  return {
    userId,
    profileFacts: {},
    preferences: {
      interests: [],
      socialStyle: '',
      communicationStyle: '',
      preferredTraits: [],
    },
    boundaries: {
      excludedGenders: [],
      noNightMeet: false,
      publicPlaceOnly: false,
      noAutoMessage: false,
      noContactExchange: false,
    },
    socialGoals: [],
    availability: [],
    activityPreferences: {
      favoriteCities: [],
      favoriteActivityTypes: [],
      favoriteTimePreferences: [],
      favoriteLocationPreferences: [],
    },
    matchSignals: { successfulMatches: [], failedMatches: [] },
    taskCount: 0,
    updatedAt: null,
  };
}

function makeService(snapshot: LongTermMemorySnapshot = emptySnapshot(1)) {
  const longTerm = {
    readSnapshot: jest.fn().mockResolvedValue(snapshot),
    summarizeTask: jest.fn(),
  } as never;
  return new SocialAgentRagService(longTerm);
}

describe('SocialAgentRagService', () => {
  it('returns empty context for casual_chat intent', async () => {
    const service = makeService();
    const ctx = await service.retrieve({
      intent: 'casual_chat',
      ownerUserId: 1,
      message: '你好',
    });
    expect(ctx.retrievedKinds).toEqual([]);
    expect(ctx.safetySop).toEqual([]);
    expect(ctx.userMemorySummary).toBeNull();
  });

  it('returns safety SOP for safety_or_boundary intent', async () => {
    const service = makeService();
    const ctx = await service.retrieve({
      intent: 'safety_or_boundary',
      ownerUserId: 1,
      message: '我不想夜间见面',
    });
    expect(ctx.retrievedKinds).toEqual(['safety_sop']);
    expect(ctx.safetySop.length).toBeGreaterThan(0);
    expect(ctx.safetySop[0].kind).toBe('safety_sop');
  });

  it('returns opening templates + cases + user memory for social_search', async () => {
    const snapshot = emptySnapshot(7);
    snapshot.taskCount = 3;
    snapshot.preferences.interests = ['跑步'];
    const service = makeService(snapshot);
    const ctx = await service.retrieve({
      intent: 'social_search',
      ownerUserId: 7,
      message: '帮我找跑步搭子',
      activityType: 'running',
    });
    expect(ctx.retrievedKinds).toEqual(
      expect.arrayContaining([
        'opening_templates',
        'successful_match_cases',
        'user_memory_summary',
      ]),
    );
    expect(ctx.openingTemplates.length).toBeGreaterThan(0);
    expect(ctx.successfulMatchCases.length).toBeGreaterThan(0);
    expect(ctx.userMemorySummary).not.toBeNull();
    expect(ctx.userMemorySummary!.preferencesSummary).toContain('跑步');
  });

  it('returns activity SOP for activity_search and skips user memory when none', async () => {
    const service = makeService();
    const ctx = await service.retrieve({
      intent: 'activity_search',
      ownerUserId: 1,
      message: '附近有什么徒步活动',
      activityType: 'hiking',
    });
    expect(ctx.retrievedKinds).toEqual(
      expect.arrayContaining(['activity_sop', 'user_memory_summary']),
    );
    expect(ctx.activitySop.length).toBeGreaterThan(0);
    expect(ctx.userMemorySummary).toBeNull();
  });
});
