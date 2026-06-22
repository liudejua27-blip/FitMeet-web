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
});
