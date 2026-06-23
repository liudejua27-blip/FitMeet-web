import {
  isRetryableSocialAgentDeepSeekFailure,
  isSocialAgentAbortError,
  socialAgentDeepSeekFailureReason,
  socialAgentDeepSeekRetryAttempts,
} from './social-agent-deepseek-resilience';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('social-agent-deepseek-resilience', () => {
  it('uses shared retry attempts with specific override and bounded max', () => {
    expect(
      socialAgentDeepSeekRetryAttempts(
        config({ SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS: '3' }),
        { specificKey: 'SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS' },
      ),
    ).toBe(3);
    expect(
      socialAgentDeepSeekRetryAttempts(
        config({ SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS: '9' }),
        { specificKey: 'SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS' },
      ),
    ).toBe(3);
    expect(
      socialAgentDeepSeekRetryAttempts(
        config({
          SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS: undefined,
          SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '2',
        }),
        { specificKey: 'SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS' },
      ),
    ).toBe(2);
    expect(
      socialAgentDeepSeekRetryAttempts(
        config({ SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1' }),
      ),
    ).toBe(1);
  });

  it('classifies transient DeepSeek failures without retrying permanent failures', () => {
    expect(isRetryableSocialAgentDeepSeekFailure('DeepSeek HTTP 503')).toBe(
      true,
    );
    expect(isRetryableSocialAgentDeepSeekFailure('DeepSeek HTTP 429')).toBe(
      true,
    );
    expect(isRetryableSocialAgentDeepSeekFailure('deepseek_timeout')).toBe(
      false,
    );
    expect(
      isRetryableSocialAgentDeepSeekFailure('deepseek_timeout', {
        includeTimeoutFailures: true,
      }),
    ).toBe(true);
    expect(
      isRetryableSocialAgentDeepSeekFailure('Unexpected token < in JSON', {
        includeJsonFormatErrors: true,
      }),
    ).toBe(true);
    expect(isRetryableSocialAgentDeepSeekFailure('DeepSeek HTTP 401')).toBe(
      false,
    );
    expect(
      isRetryableSocialAgentDeepSeekFailure('Unexpected token < in JSON'),
    ).toBe(false);
  });

  it('normalizes abort errors into DeepSeek timeout reasons', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(isSocialAgentAbortError(error)).toBe(true);
    expect(socialAgentDeepSeekFailureReason(error)).toBe('deepseek_timeout');
    expect(
      socialAgentDeepSeekFailureReason(new Error('deepseek_timeout')),
    ).toBe('deepseek_timeout');
    expect(
      socialAgentDeepSeekFailureReason(
        new Error('DeepSeek timeout after 18000ms'),
      ),
    ).toBe('deepseek_timeout');
    expect(socialAgentDeepSeekFailureReason(new Error('network down'))).toBe(
      'network down',
    );
  });
});
