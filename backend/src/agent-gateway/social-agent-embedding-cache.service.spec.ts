import { SocialAgentEmbeddingCacheService } from './social-agent-embedding-cache.service';

describe('SocialAgentEmbeddingCacheService', () => {
  it('reuses embeddings for equivalent normalized text', async () => {
    const cache = new SocialAgentEmbeddingCacheService();
    const first = await cache.getOrSetWithMeta(
      {
        namespace: 'profile',
        model: 'fitmeet-lexical-v1',
        text: '  青岛 大学 散步  ',
        dimensions: 3,
      },
      () => [1, 2, 3],
    );
    const second = await cache.getOrSetWithMeta(
      {
        namespace: 'profile',
        model: 'fitmeet-lexical-v1',
        text: '青岛 大学 散步',
        dimensions: 3,
      },
      () => [9, 9, 9],
    );

    expect(first.hit).toBe(false);
    expect(second.hit).toBe(true);
    expect(second.vector).toEqual([1, 2, 3]);
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
      savedApproxInputChars: expect.any(Number),
    });
  });

  it('scopes cache entries by namespace, model and dimensions', async () => {
    const cache = new SocialAgentEmbeddingCacheService();
    const input = {
      namespace: 'profile',
      model: 'fitmeet-lexical-v1',
      text: '羽毛球 周末 下午',
      dimensions: 3,
    };

    await cache.getOrSetWithMeta(input, () => [1, 0, 0]);
    const differentNamespace = await cache.getOrSetWithMeta(
      { ...input, namespace: 'candidate' },
      () => [0, 1, 0],
    );
    const differentDimensions = await cache.getOrSetWithMeta(
      { ...input, dimensions: 4 },
      () => [0, 0, 1, 0],
    );

    expect(differentNamespace.hit).toBe(false);
    expect(differentDimensions.hit).toBe(false);
    expect(cache.stats()).toMatchObject({
      hits: 0,
      misses: 3,
      writes: 3,
      size: 3,
    });
  });

  it('expires stale embeddings', async () => {
    const cache = new SocialAgentEmbeddingCacheService();
    await cache.getOrSetWithMeta(
      {
        namespace: 'profile',
        model: 'fitmeet-lexical-v1',
        text: '跑步',
      },
      () => [1],
      { ttlMs: 1 },
    );

    await new Promise((resolve) => setTimeout(resolve, 5));
    const next = await cache.getOrSetWithMeta(
      {
        namespace: 'profile',
        model: 'fitmeet-lexical-v1',
        text: '跑步',
      },
      () => [2],
    );

    expect(next.hit).toBe(false);
    expect(next.vector).toEqual([2]);
    expect(cache.stats().evictions).toBeGreaterThanOrEqual(1);
  });
});
