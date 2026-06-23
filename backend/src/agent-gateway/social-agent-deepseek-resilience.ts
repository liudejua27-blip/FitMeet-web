export interface SocialAgentDeepSeekRetryConfigReader {
  get(key: string): string | undefined;
}

export interface SocialAgentDeepSeekRetryOptions {
  specificKey?: string;
  fallbackAttempts?: number;
  maxAttempts?: number;
}

export interface SocialAgentDeepSeekRetryableOptions {
  includeJsonFormatErrors?: boolean;
  includeTimeoutFailures?: boolean;
}

export function socialAgentDeepSeekRetryAttempts(
  config?: SocialAgentDeepSeekRetryConfigReader | null,
  options: SocialAgentDeepSeekRetryOptions = {},
): number {
  const configured = Number(
    (options.specificKey ? config?.get(options.specificKey) : null) ??
      config?.get('SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS') ??
      `${options.fallbackAttempts ?? 2}`,
  );
  if (!Number.isFinite(configured) || configured <= 1) return 1;
  return Math.min(
    Math.floor(configured),
    Math.max(1, options.maxAttempts ?? 3),
  );
}

export function socialAgentDeepSeekFailureReason(error: unknown): string {
  if (isSocialAgentAbortError(error)) return 'deepseek_timeout';
  if (error instanceof Error) {
    return isSocialAgentTimeoutMessage(error.message)
      ? 'deepseek_timeout'
      : error.message;
  }
  return String(error);
}

export function isSocialAgentAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isRetryableSocialAgentDeepSeekFailure(
  reason: string,
  options: SocialAgentDeepSeekRetryableOptions = {},
): boolean {
  if (/^DeepSeek HTTP (429|5\d\d)$/i.test(reason)) return true;
  if (options.includeTimeoutFailures && /deepseek_timeout/i.test(reason)) {
    return true;
  }
  if (
    /fetch failed|network|econnreset|etimedout|eai_again|socket|terminated|connection/i.test(
      reason,
    )
  ) {
    return true;
  }
  if (!options.includeJsonFormatErrors) return false;
  return /json|parse|unexpected token/i.test(reason);
}

function isSocialAgentTimeoutMessage(message: string): boolean {
  return /^(deepseek_timeout|DeepSeek timeout after \d+ms)$/i.test(
    message.trim(),
  );
}
