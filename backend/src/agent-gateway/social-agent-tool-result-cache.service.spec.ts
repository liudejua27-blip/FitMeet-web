import { SocialAgentToolResultCacheService } from './social-agent-tool-result-cache.service';

describe('SocialAgentToolResultCacheService', () => {
  let cache: SocialAgentToolResultCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-22T00:00:00.000Z'));
    cache = new SocialAgentToolResultCacheService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns cached values before ttl expires', async () => {
    const loader = jest.fn(async () => ({ count: 1 }));

    await expect(
      cache.getOrSet('candidate_pool:test', loader, { ttlMs: 1000 }),
    ).resolves.toEqual({ count: 1 });
    await expect(
      cache.getOrSet('candidate_pool:test', loader, { ttlMs: 1000 }),
    ).resolves.toEqual({ count: 1 });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
      size: 1,
      savedApproxPromptChars: JSON.stringify({ count: 1 }).length,
    });
  });

  it('returns read-through metadata for cache observability', async () => {
    const loader = jest.fn(async () => ({ candidates: ['a', 'b'] }));

    await expect(
      cache.getOrSetWithMeta('candidate_pool:test', loader, { ttlMs: 1000 }),
    ).resolves.toMatchObject({
      hit: false,
      approxStoredChars: JSON.stringify({ candidates: ['a', 'b'] }).length,
    });
    await expect(
      cache.getOrSetWithMeta('candidate_pool:test', loader, { ttlMs: 1000 }),
    ).resolves.toMatchObject({
      hit: true,
      approxStoredChars: JSON.stringify({ candidates: ['a', 'b'] }).length,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
      savedApproxPromptChars: JSON.stringify({ candidates: ['a', 'b'] }).length,
    });
  });

  it('reloads values after ttl expires', async () => {
    const loader = jest
      .fn<Promise<number>, []>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    await expect(
      cache.getOrSet('candidate_pool:test', loader, { ttlMs: 1000 }),
    ).resolves.toBe(1);
    jest.setSystemTime(new Date('2026-06-22T00:00:02.000Z'));
    await expect(
      cache.getOrSet('candidate_pool:test', loader, { ttlMs: 1000 }),
    ).resolves.toBe(2);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.stats()).toMatchObject({
      misses: 2,
      writes: 2,
      evictions: 1,
      size: 1,
    });
  });

  it('evicts oldest entries when the cache reaches capacity', () => {
    for (let index = 0; index < 257; index += 1) {
      cache.set(`key:${index}`, index, { ttlMs: 1000 });
    }

    expect(cache.get('key:0')).toBeNull();
    expect(cache.get('key:256')).toBe(256);
    expect(cache.stats()).toMatchObject({
      evictions: 1,
      size: 256,
    });
  });

  it('can be cleared between runs', () => {
    cache.set('tool:a', { ok: true });
    expect(cache.get('tool:a')).toEqual({ ok: true });

    cache.clear();

    expect(cache.get('tool:a')).toBeNull();
    expect(cache.stats()).toMatchObject({
      hits: 0,
      misses: 1,
      writes: 0,
      size: 0,
    });
  });

  it('uses Redis-backed distributed cache across service instances when enabled', async () => {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      setex: jest.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'SOCIAL_AGENT_CACHE_BACKEND' ? 'redis' : undefined,
      ),
    };
    const redisService = {
      getClient: () => redis,
    };
    const firstProcess = new SocialAgentToolResultCacheService(
      config as never,
      redisService as never,
    );
    const secondProcess = new SocialAgentToolResultCacheService(
      config as never,
      redisService as never,
    );
    const loader = jest.fn(async () => ({ candidates: ['chen'] }));

    await expect(
      firstProcess.getOrSetWithMeta('candidate_pool:qingdao', loader, {
        ttlMs: 15_000,
      }),
    ).resolves.toMatchObject({ hit: false });

    await expect(
      secondProcess.getOrSetWithMeta(
        'candidate_pool:qingdao',
        async () => ({ candidates: ['should-not-load'] }),
        { ttlMs: 15_000 },
      ),
    ).resolves.toMatchObject({
      hit: true,
      value: { candidates: ['chen'] },
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(2);
    expect(secondProcess.stats()).toMatchObject({
      distributedHits: 1,
      distributedErrors: 0,
    });
  });

  it('falls back to loader when Redis is enabled but unavailable', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND' ? 'redis' : undefined,
      ),
    };
    const redisService = {
      getClient: () => {
        throw new Error('redis down');
      },
    };
    const cacheWithBrokenRedis = new SocialAgentToolResultCacheService(
      config as never,
      redisService as never,
    );
    const loader = jest.fn(async () => ({ ok: true }));

    await expect(
      cacheWithBrokenRedis.getOrSetWithMeta('tool:unavailable', loader, {
        ttlMs: 1000,
      }),
    ).resolves.toMatchObject({
      hit: false,
      value: { ok: true },
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(cacheWithBrokenRedis.stats()).toMatchObject({
      distributedErrors: 2,
      writes: 1,
    });
  });
});
