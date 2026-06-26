export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';
export const DEFAULT_DEEPSEEK_FAST_MODEL = 'deepseek-v4-flash';
export const DEFAULT_DEEPSEEK_STRICT_TOOL_BASE_URL =
  'https://api.deepseek.com/beta';

export type DeepSeekMode = 'structured' | 'copy' | 'reasoning' | 'tool';

export type DeepSeekChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type DeepSeekChatCompletionOptions = {
  apiKey: string;
  baseUrl?: string | null;
  model: string;
  mode?: DeepSeekMode;
  temperature?: number;
  responseFormat?: { type: 'json_object' };
  tools?: unknown[];
  toolChoice?: unknown;
  strictTools?: boolean;
  strictToolBaseUrl?: string | null;
  thinking?: { type: 'enabled' | 'disabled' };
  reasoningEffort?: 'low' | 'medium' | 'high';
  messages: DeepSeekChatMessage[];
  timeoutMs: number;
  signal?: AbortSignal | null;
  timeoutMessage?: string;
  retryAttempts?: number;
};

export type DeepSeekChatCompletionUsage = {
  promptTokens: number | null;
  promptCacheHitTokens: number | null;
  promptCacheMissTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
};

export type DeepSeekChatCompletionResult = {
  content: string;
  toolCalls: unknown[];
  usage: DeepSeekChatCompletionUsage;
  systemFingerprint: string | null;
};

class DeepSeekHttpError extends Error {
  constructor(readonly status: number) {
    super(`DeepSeek HTTP ${status}`);
  }
}

export function resolveDeepSeekModel(value?: string | null): string {
  const configured = value?.trim();

  // Older FitMeet env files used this pre-release name. DeepSeek now requires
  // an explicit model id. Prefer the reasoning-capable production default when
  // the env is missing or stale, instead of silently weakening to a fast model.
  if (
    !configured ||
    configured === 'deepseek-v4' ||
    /^deepseek-chat$/i.test(configured) ||
    /(^|[-_])(flash|fast|lite)([-_]|$)/i.test(configured)
  ) {
    return DEFAULT_DEEPSEEK_MODEL;
  }

  return configured;
}

export function resolveDeepSeekModelForMode(
  mode: DeepSeekMode,
  configured?: string | null,
): string {
  const explicit = configured?.trim();
  if (explicit && (mode === 'structured' || mode === 'tool')) {
    if (/^deepseek-chat$/i.test(explicit)) return DEFAULT_DEEPSEEK_FAST_MODEL;
    if (explicit === 'deepseek-v4') return DEFAULT_DEEPSEEK_FAST_MODEL;
    return explicit;
  }
  if (explicit) return resolveDeepSeekModel(explicit);
  if (mode === 'structured' || mode === 'tool') {
    return DEFAULT_DEEPSEEK_FAST_MODEL;
  }
  return DEFAULT_DEEPSEEK_MODEL;
}

export async function callDeepSeekChatCompletion(
  options: DeepSeekChatCompletionOptions,
): Promise<string> {
  return (await callDeepSeekChatCompletionWithUsage(options)).content;
}

export async function callDeepSeekChatCompletionWithUsage(
  options: DeepSeekChatCompletionOptions,
): Promise<DeepSeekChatCompletionResult> {
  const attempts = positiveInteger(options.retryAttempts, 1);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callDeepSeekChatCompletionOnce(options);
    } catch (error) {
      lastError = error;
      if (!shouldRetryDeepSeekCompletion(error) || attempt >= attempts) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callDeepSeekChatCompletionOnce(
  options: DeepSeekChatCompletionOptions,
): Promise<DeepSeekChatCompletionResult> {
  assertNotClientAborted(options.signal);
  assertDeepSeekToolCompatibility(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  try {
    const baseUrl =
      options.strictTools && options.tools?.length
        ? options.strictToolBaseUrl || DEFAULT_DEEPSEEK_STRICT_TOOL_BASE_URL
        : options.baseUrl || 'https://api.deepseek.com';
    const requestBody = buildDeepSeekRequestBody(options);
    const res = await fetch(
      `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      },
    );
    if (!res.ok) {
      throw new DeepSeekHttpError(res.status);
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      content: readDeepSeekCompletionContent(data),
      toolCalls: readDeepSeekToolCalls(data),
      usage: readDeepSeekCompletionUsage(data),
      systemFingerprint: stringValue(data.system_fingerprint),
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        options.signal?.aborted
          ? 'client_aborted'
          : (options.timeoutMessage ??
              `DeepSeek timeout after ${options.timeoutMs}ms`),
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
}

function buildDeepSeekRequestBody(
  options: DeepSeekChatCompletionOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model,
    temperature: options.temperature ?? defaultTemperatureForMode(options.mode),
    messages: options.messages,
  };
  if (options.responseFormat) body.response_format = options.responseFormat;
  if (options.tools?.length) body.tools = options.tools;
  if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
  if (options.thinking) body.thinking = options.thinking;
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;
  return body;
}

function defaultTemperatureForMode(mode: DeepSeekMode | undefined): number {
  if (mode === 'structured' || mode === 'tool') return 0.1;
  if (mode === 'copy') return 0.3;
  if (mode === 'reasoning') return 0.2;
  return 0.4;
}

function assertDeepSeekToolCompatibility(
  options: DeepSeekChatCompletionOptions,
): void {
  if (!options.tools?.length) return;
  if (/^deepseek-reasoner$/i.test(options.model.trim())) {
    throw new Error('deepseek-reasoner does not support Function Calling');
  }
}

function readDeepSeekCompletionContent(data: Record<string, unknown>): string {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(first.message) ? first.message : {};
  return typeof message.content === 'string' ? message.content : '';
}

function readDeepSeekToolCalls(data: Record<string, unknown>): unknown[] {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(first.message) ? first.message : {};
  return Array.isArray(message.tool_calls) ? message.tool_calls : [];
}

function readDeepSeekCompletionUsage(
  data: Record<string, unknown>,
): DeepSeekChatCompletionUsage {
  const usage = isRecord(data.usage) ? data.usage : {};
  const promptDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : {};
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {};
  return {
    promptTokens: numberValue(usage.prompt_tokens),
    promptCacheHitTokens:
      numberValue(usage.prompt_cache_hit_tokens) ??
      numberValue(promptDetails.cached_tokens),
    promptCacheMissTokens: numberValue(usage.prompt_cache_miss_tokens),
    completionTokens: numberValue(usage.completion_tokens),
    reasoningTokens:
      numberValue(usage.reasoning_tokens) ??
      numberValue(completionDetails.reasoning_tokens),
  };
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

function shouldRetryDeepSeekCompletion(error: unknown) {
  if (error instanceof DeepSeekHttpError) {
    return error.status === 429 || error.status >= 500;
  }
  const message = (error as Error | undefined)?.message ?? '';
  if (message === 'client_aborted') return false;
  return /timeout|fetch failed|network|econnreset|etimedout|eai_again|socket|terminated|connection/i.test(
    message,
  );
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function assertNotClientAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new Error('client_aborted');
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error as Error | undefined)?.name === 'AbortError' ||
    (error as Error | undefined)?.message === 'aborted'
  );
}
