import { SocialAgentRagService } from './social-agent-rag.service';
import { SocialAgentEmbeddingCacheService } from './social-agent-embedding-cache.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
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
      preferenceHistory: [],
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

function makeService(
  snapshot: LongTermMemorySnapshot = emptySnapshot(1),
  embeddingCache?: SocialAgentEmbeddingCacheService,
  metrics?: SocialAgentMetricsService,
) {
  const longTerm = {
    readSnapshot: jest.fn().mockResolvedValue(snapshot),
    summarizeTask: jest.fn(),
  } as never;
  return new SocialAgentRagService(longTerm, embeddingCache, metrics);
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
    snapshot.preferences.preferenceHistory = [
      {
        field: 'interest',
        value: '跑步',
        source: 'task_memory',
        taskId: 1,
        outcome: 'succeeded',
        confirmed: true,
        at: '2026-05-20T00:00:00.000Z',
      },
      {
        field: 'availability',
        value: '周末下午',
        source: 'stable_profile_fact',
        taskId: 2,
        outcome: 'failed',
        confirmed: false,
        at: '2026-05-21T00:00:00.000Z',
      },
      {
        field: 'preferredTrait',
        value: '同城运动搭子',
        source: 'stable_profile_fact',
        taskId: 3,
        outcome: 'succeeded',
        confirmed: true,
        at: '2026-05-22T00:00:00.000Z',
      },
    ];
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
    expect(ctx.userMemorySummary!.preferenceHistorySummary).toContain(
      '兴趣:跑步',
    );
    expect(ctx.userMemorySummary!.preferenceHistorySummary).toContain(
      '理想特质:同城运动搭子',
    );
    expect(ctx.userMemorySummary!.preferenceHistorySummary).not.toContain(
      '周末下午',
    );
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

  it('reuses cached lexical embeddings for repeated RAG retrieval', async () => {
    const embeddingCache = new SocialAgentEmbeddingCacheService();
    const metrics = new SocialAgentMetricsService();
    const service = makeService(emptySnapshot(1), embeddingCache, metrics);

    await service.retrieve({
      intent: 'social_search',
      ownerUserId: 1,
      message: '帮我找跑步搭子',
      activityType: 'running',
    });
    await service.retrieve({
      intent: 'social_search',
      ownerUserId: 1,
      message: '帮我找跑步搭子',
      activityType: 'running',
    });

    expect(embeddingCache.stats().hits).toBeGreaterThan(0);
    expect(metrics.snapshot()).toMatchObject({
      embeddingCacheSummary: {
        rag_query: expect.objectContaining({
          hits: expect.any(Number),
          misses: expect.any(Number),
        }),
        rag_doc: expect.objectContaining({
          hits: expect.any(Number),
          misses: expect.any(Number),
        }),
      },
    });
  });
});
