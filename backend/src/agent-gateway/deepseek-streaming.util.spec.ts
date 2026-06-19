import { readDeepSeekStreamedContent } from './deepseek-streaming.util';

describe('DeepSeek streaming latency utilities', () => {
  it('tracks SSE, reasoning, visible content, cache metrics and fingerprint', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"system_fingerprint":"fp_1","choices":[{"delta":{"reasoning_content":"先想一下"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"你好"}}]}',
              '',
              'data: {"usage":{"prompt_tokens":100,"prompt_cache_hit_tokens":80,"prompt_cache_miss_tokens":20,"completion_tokens":8,"reasoning_tokens":3},"choices":[]}',
              '',
              'data: [DONE]',
              '',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    const deltas: string[] = [];

    const result = await readDeepSeekStreamedContent({
      response: { body: stream } as Response,
      onDelta: (delta) => {
        deltas.push(delta);
      },
      startedAt: Date.now() - 50,
      httpHeadersLatencyMs: 12,
      firstChunkTimeoutMs: 1000,
    });

    expect(deltas).toEqual(['你好']);
    expect(result.content).toBe('你好');
    expect(result.httpHeadersLatencyMs).toBe(12);
    expect(result.firstSseChunkLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.firstReasoningDeltaLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.firstContentDeltaLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.promptTokens).toBe(100);
    expect(result.promptCacheHitTokens).toBe(80);
    expect(result.promptCacheMissTokens).toBe(20);
    expect(result.completionTokens).toBe(8);
    expect(result.reasoningTokens).toBe(3);
    expect(result.systemFingerprint).toBe('fp_1');
  });
});
