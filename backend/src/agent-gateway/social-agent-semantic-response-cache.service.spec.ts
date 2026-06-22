import { SocialAgentSemanticResponseCacheService } from './social-agent-semantic-response-cache.service';

describe('SocialAgentSemanticResponseCacheService', () => {
  let cache: SocialAgentSemanticResponseCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-22T00:00:00.000Z'));
    cache = new SocialAgentSemanticResponseCacheService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hits equivalent product help questions without another model call', () => {
    cache.set(
      {
        userMessage: '你都可以干什么',
        answer: '我可以帮你找搭子、整理约练卡和管理安全确认。',
        intent: 'product_help',
        model: 'deepseek-v4-pro',
        promptPrefixHash: 'prefix-a',
      },
      { ttlMs: 1000, approxPromptChars: 4096 },
    );

    const hit = cache.get(
      {
        userMessage: '你有什么功能',
        intent: 'product_help',
        model: 'deepseek-v4-pro',
        promptPrefixHash: 'prefix-a',
      },
      { threshold: 0.78 },
    );

    expect(hit).toMatchObject({
      answer: '我可以帮你找搭子、整理约练卡和管理安全确认。',
      alias: 'capability_help',
    });
    expect(hit?.similarity).toBeGreaterThanOrEqual(0.9);
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 0,
      writes: 1,
      size: 1,
      savedApproxPromptChars: 4096,
    });
  });

  it('does not cross intent/model/prompt scopes', () => {
    cache.set({
      userMessage: '你都可以干什么',
      answer: '能力说明',
      intent: 'product_help',
      model: 'deepseek-v4-pro',
      promptPrefixHash: 'prefix-a',
    });

    expect(
      cache.get({
        userMessage: '你有什么功能',
        intent: 'safety_or_boundary',
        model: 'deepseek-v4-pro',
        promptPrefixHash: 'prefix-a',
      }),
    ).toBeNull();
    expect(
      cache.get({
        userMessage: '你有什么功能',
        intent: 'product_help',
        model: 'deepseek-v4-flash',
        promptPrefixHash: 'prefix-a',
      }),
    ).toBeNull();
    expect(
      cache.get({
        userMessage: '你有什么功能',
        intent: 'product_help',
        model: 'deepseek-v4-pro',
        promptPrefixHash: 'prefix-b',
      }),
    ).toBeNull();
  });

  it('expires semantic entries', () => {
    cache.set(
      {
        userMessage: '你都可以干什么',
        answer: '能力说明',
        intent: 'product_help',
        model: 'deepseek-v4-pro',
        promptPrefixHash: 'prefix-a',
      },
      { ttlMs: 1000 },
    );
    jest.setSystemTime(new Date('2026-06-22T00:00:02.000Z'));

    expect(
      cache.get({
        userMessage: '你有什么功能',
        intent: 'product_help',
        model: 'deepseek-v4-pro',
        promptPrefixHash: 'prefix-a',
      }),
    ).toBeNull();
    expect(cache.stats()).toMatchObject({
      evictions: 1,
      misses: 1,
      size: 0,
    });
  });

  it('shares semantic answers through Redis when distributed cache is enabled', async () => {
    const store = new Map<string, string>();
    const redis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setex: jest.fn((key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'SOCIAL_AGENT_CACHE_BACKEND' ? 'redis' : undefined,
      ),
    };
    const redisService = { getClient: jest.fn(() => redis) };
    const writer = new SocialAgentSemanticResponseCacheService(
      config as never,
      redisService as never,
    );
    const reader = new SocialAgentSemanticResponseCacheService(
      config as never,
      redisService as never,
    );

    await expect(
      writer.setAsync(
        {
          userMessage: '你都可以干什么',
          answer: '我可以帮你找搭子、整理约练卡和管理安全确认。',
          intent: 'product_help',
          model: 'deepseek-v4-pro',
          promptPrefixHash: 'prefix-a',
        },
        { ttlMs: 30_000, approxPromptChars: 4096 },
      ),
    ).resolves.toBe('我可以帮你找搭子、整理约练卡和管理安全确认。');

    await expect(
      reader.getAsync(
        {
          userMessage: '你有什么功能',
          intent: 'product_help',
          model: 'deepseek-v4-pro',
          promptPrefixHash: 'prefix-a',
        },
        { threshold: 0.78 },
      ),
    ).resolves.toMatchObject({
      answer: '我可以帮你找搭子、整理约练卡和管理安全确认。',
      alias: 'capability_help',
    });

    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^fitmeet:social-agent:semantic-response-cache:/),
      30,
      expect.stringContaining('"answer":"我可以帮你找搭子'),
    );
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(
        /^fitmeet:social-agent:semantic-response-cache-index:/,
      ),
      30,
      expect.any(String),
    );
    expect(reader.stats()).toMatchObject({
      distributedHits: 1,
      distributedErrors: 0,
      savedApproxPromptChars: 4096,
    });
  });
});
