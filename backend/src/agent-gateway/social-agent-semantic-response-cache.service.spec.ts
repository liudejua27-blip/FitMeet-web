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
});
