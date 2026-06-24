import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';

describe('SocialAgentLlmOutputCacheService', () => {
  let cache: SocialAgentLlmOutputCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-22T00:00:00.000Z'));
    cache = new SocialAgentLlmOutputCacheService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reuses exact cached answers before ttl expires', () => {
    cache.set('final:prompt', '我会继续处理。', {
      ttlMs: 1000,
      approxPromptChars: 2048,
    });

    expect(cache.get('final:prompt')).toBe('我会继续处理。');
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 0,
      writes: 1,
      size: 1,
      savedApproxPromptChars: 2048,
    });
  });

  it('expires cached answers and records misses', () => {
    cache.set('final:prompt', '旧回复', { ttlMs: 1000 });
    jest.setSystemTime(new Date('2026-06-22T00:00:02.000Z'));

    expect(cache.get('final:prompt')).toBeNull();
    expect(cache.stats()).toMatchObject({
      hits: 0,
      misses: 1,
      evictions: 1,
      size: 0,
    });
  });

  it('shares exact LLM answers through Redis when distributed cache is enabled', async () => {
    const redisStore = new Map<string, string>();
    const redis = {
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        redisStore.set(key, value);
        return 'OK';
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'SOCIAL_AGENT_CACHE_BACKEND' ? 'redis' : undefined,
      ),
    };
    const redisService = { getClient: jest.fn(() => redis) };
    const writer = new SocialAgentLlmOutputCacheService(
      config as never,
      redisService as never,
    );
    const reader = new SocialAgentLlmOutputCacheService(
      config as never,
      redisService as never,
    );

    await writer.setAsync('planner:prompt', '共享计划', {
      ttlMs: 1500,
      approxPromptChars: 4096,
    });

    await expect(reader.getAsync('planner:prompt')).resolves.toBe('共享计划');
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^fitmeet:social-agent:llm-output-cache:/),
      2,
      expect.stringContaining('"answer":"共享计划"'),
    );
    expect(reader.stats()).toMatchObject({
      misses: 1,
      distributedHits: 1,
      savedApproxPromptChars: 4096,
    });
  });
});
