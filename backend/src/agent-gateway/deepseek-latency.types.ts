export interface DeepSeekUsageMetrics {
  promptTokens: number | null;
  promptCacheHitTokens: number | null;
  promptCacheMissTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
}

export interface DeepSeekStreamMetrics extends DeepSeekUsageMetrics {
  httpHeadersLatencyMs: number | null;
  firstSseChunkLatencyMs: number | null;
  firstReasoningDeltaLatencyMs: number | null;
  firstContentDeltaLatencyMs: number | null;
  systemFingerprint: string | null;
}

export interface DeepSeekStreamResult extends DeepSeekStreamMetrics {
  content: string;
  firstTokenLatencyMs: number | null;
  tokenCount: number;
}

export const emptyDeepSeekUsageMetrics = (): DeepSeekUsageMetrics => ({
  promptTokens: null,
  promptCacheHitTokens: null,
  promptCacheMissTokens: null,
  completionTokens: null,
  reasoningTokens: null,
});

export const emptyDeepSeekStreamMetrics = (
  httpHeadersLatencyMs: number | null = null,
): DeepSeekStreamMetrics => ({
  httpHeadersLatencyMs,
  firstSseChunkLatencyMs: null,
  firstReasoningDeltaLatencyMs: null,
  firstContentDeltaLatencyMs: null,
  systemFingerprint: null,
  ...emptyDeepSeekUsageMetrics(),
});
