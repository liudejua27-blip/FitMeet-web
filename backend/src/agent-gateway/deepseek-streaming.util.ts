import { cleanDisplayText } from '../common/display-text.util';
import {
  DeepSeekStreamMetrics,
  DeepSeekStreamResult,
  DeepSeekUsageMetrics,
  emptyDeepSeekStreamMetrics,
} from './deepseek-latency.types';

export async function readDeepSeekStreamedContent(input: {
  response: Response;
  onDelta: (delta: string) => void | Promise<void>;
  startedAt: number;
  httpHeadersLatencyMs: number | null;
  firstChunkTimeoutMs: number;
  abortController?: AbortController | null;
}): Promise<DeepSeekStreamResult> {
  if (!input.response.body) {
    return {
      content: '',
      firstTokenLatencyMs: null,
      tokenCount: 0,
      ...emptyDeepSeekStreamMetrics(input.httpHeadersLatencyMs),
    };
  }
  const reader = input.response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let tokenCount = 0;
  const metrics = emptyDeepSeekStreamMetrics(input.httpHeadersLatencyMs);
  let firstChunkTimer: ReturnType<typeof setTimeout> | null = null;
  if (input.firstChunkTimeoutMs > 0) {
    firstChunkTimer = setTimeout(() => {
      input.abortController?.abort();
    }, input.firstChunkTimeoutMs);
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (metrics.firstSseChunkLatencyMs == null) {
        metrics.firstSseChunkLatencyMs = Date.now() - input.startedAt;
        if (firstChunkTimer) clearTimeout(firstChunkTimer);
        firstChunkTimer = null;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const parsed = readDeepSeekStreamChunk(chunk);
        mergeStreamMetrics(metrics, parsed.metrics);
        if (
          parsed.reasoningDelta &&
          metrics.firstReasoningDeltaLatencyMs == null
        ) {
          metrics.firstReasoningDeltaLatencyMs = Date.now() - input.startedAt;
        }
        if (!parsed.contentDelta) continue;
        content += parsed.contentDelta;
        if (metrics.firstContentDeltaLatencyMs == null) {
          metrics.firstContentDeltaLatencyMs = Date.now() - input.startedAt;
        }
        tokenCount += countApproxTokens(parsed.contentDelta);
        await input.onDelta(cleanDisplayText(parsed.contentDelta, ''));
      }
    }
    if (buffer.trim()) {
      const parsed = readDeepSeekStreamChunk(buffer);
      mergeStreamMetrics(metrics, parsed.metrics);
      if (
        parsed.reasoningDelta &&
        metrics.firstReasoningDeltaLatencyMs == null
      ) {
        metrics.firstReasoningDeltaLatencyMs = Date.now() - input.startedAt;
      }
      if (parsed.contentDelta) {
        content += parsed.contentDelta;
        if (metrics.firstContentDeltaLatencyMs == null) {
          metrics.firstContentDeltaLatencyMs = Date.now() - input.startedAt;
        }
        tokenCount += countApproxTokens(parsed.contentDelta);
        await input.onDelta(cleanDisplayText(parsed.contentDelta, ''));
      }
    }
  } finally {
    if (firstChunkTimer) clearTimeout(firstChunkTimer);
    try {
      await reader.cancel();
    } catch {
      // Stream may already be closed.
    }
  }

  return {
    content: cleanDisplayText(content, '').trim(),
    firstTokenLatencyMs: metrics.firstContentDeltaLatencyMs,
    tokenCount,
    ...metrics,
  };
}

export function readDeepSeekUsageMetrics(
  payload: Record<string, unknown>,
): DeepSeekUsageMetrics {
  const usage = isRecord(payload.usage) ? payload.usage : {};
  const details = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : {};
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {};
  return {
    promptTokens: numberValue(usage.prompt_tokens),
    promptCacheHitTokens:
      numberValue(usage.prompt_cache_hit_tokens) ??
      numberValue(details.cached_tokens),
    promptCacheMissTokens: numberValue(usage.prompt_cache_miss_tokens),
    completionTokens: numberValue(usage.completion_tokens),
    reasoningTokens:
      numberValue(usage.reasoning_tokens) ??
      numberValue(completionDetails.reasoning_tokens),
  };
}

export function readDeepSeekSystemFingerprint(
  payload: Record<string, unknown>,
): string | null {
  return stringValue(payload.system_fingerprint);
}

function readDeepSeekStreamChunk(chunk: string): {
  contentDelta: string;
  reasoningDelta: string;
  metrics: Partial<DeepSeekStreamMetrics>;
} {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  let contentDelta = '';
  let reasoningDelta = '';
  const metrics: Partial<DeepSeekStreamMetrics> = {};
  for (const line of lines) {
    if (!line || line === '[DONE]') continue;
    try {
      const payload = JSON.parse(line) as Record<string, unknown>;
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = isRecord(choices[0]) ? choices[0] : {};
      const deltaPayload = isRecord(first.delta) ? first.delta : {};
      const content = deltaPayload.content;
      const reasoning = deltaPayload.reasoning_content;
      if (typeof content === 'string') contentDelta += content;
      if (typeof reasoning === 'string') reasoningDelta += reasoning;
      const usage = readDeepSeekUsageMetrics(payload);
      Object.assign(metrics, usage);
      const fingerprint = readDeepSeekSystemFingerprint(payload);
      if (fingerprint) metrics.systemFingerprint = fingerprint;
    } catch {
      continue;
    }
  }
  return { contentDelta, reasoningDelta, metrics };
}

function mergeStreamMetrics(
  target: DeepSeekStreamMetrics,
  source: Partial<DeepSeekStreamMetrics>,
): void {
  for (const key of [
    'promptTokens',
    'promptCacheHitTokens',
    'promptCacheMissTokens',
    'completionTokens',
    'reasoningTokens',
    'systemFingerprint',
  ] as const) {
    if (source[key] != null) target[key] = source[key] as never;
  }
}

export function countApproxTokens(delta: string): number {
  return delta.match(/[\u4e00-\u9fff]|[a-zA-Z0-9_]+|[^\s]/g)?.length ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
