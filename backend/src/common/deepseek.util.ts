export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-pro';

export type DeepSeekChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type DeepSeekChatCompletionOptions = {
  apiKey: string;
  baseUrl?: string | null;
  model: string;
  temperature?: number;
  responseFormat?: { type: 'json_object' };
  messages: DeepSeekChatMessage[];
  timeoutMs: number;
  signal?: AbortSignal | null;
  timeoutMessage?: string;
  retryAttempts?: number;
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

export async function callDeepSeekChatCompletion(
  options: DeepSeekChatCompletionOptions,
): Promise<string> {
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
): Promise<string> {
  assertNotClientAborted(options.signal);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', abortFromParent, { once: true });
  }

  try {
    const baseUrl = options.baseUrl || 'https://api.deepseek.com';
    const res = await fetch(
      `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          temperature: options.temperature ?? 0.4,
          ...(options.responseFormat
            ? { response_format: options.responseFormat }
            : {}),
          messages: options.messages,
        }),
      },
    );
    if (!res.ok) {
      throw new DeepSeekHttpError(res.status);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        options.signal?.aborted
          ? 'client_aborted'
          : options.timeoutMessage ??
              `DeepSeek timeout after ${options.timeoutMs}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
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
