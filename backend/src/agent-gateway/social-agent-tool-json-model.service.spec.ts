import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS } from './social-agent-model-router.service';

function makeConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('SocialAgentToolJsonModelService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uses fallback without a DeepSeek API key', async () => {
    const service = new SocialAgentToolJsonModelService(
      makeConfig({}) as never,
    );
    const logger = (
      service as unknown as { logger: { warn: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    global.fetch = jest.fn() as never;

    const result = await service.callJson({
      purpose: 'summarize_reply',
      prompt: 'summarize',
      fallback: () => ({ source: 'fallback', summary: 'ok' }),
      taskId: 10,
    });

    expect(result).toEqual({
      source: 'fallback',
      summary: 'ok',
      purpose: 'summarize_reply',
      fallbackReason: 'DEEPSEEK_API_KEY missing',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not let fallback JSON masquerade as DeepSeek output', async () => {
    const service = new SocialAgentToolJsonModelService(
      makeConfig({}) as never,
    );
    const logger = (
      service as unknown as { logger: { warn: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    global.fetch = jest.fn() as never;

    const result = await service.callJson({
      purpose: 'candidate_summary',
      prompt: 'summarize candidates',
      fallback: () => ({ source: 'deepseek', summary: 'rules result' }),
      taskId: 10,
    });

    expect(result).toEqual({
      source: 'fallback',
      summary: 'rules result',
      purpose: 'candidate_summary',
      fallbackReason: 'DEEPSEEK_API_KEY missing',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requests json_object responses and annotates parsed output', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test/',
      AGENT_CARD_MODEL: 'card-model',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as { logger: { log: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => ({
        choices: [{ message: { content: '{"summary":"works"}' } }],
      }),
    }) as never;

    const result = await service.callJson({
      purpose: 'social_request_card',
      prompt: 'draft card',
      fallback: () => ({ source: 'fallback' }),
      taskId: 12,
    });

    expect(result).toEqual({
      summary: 'works',
      source: 'deepseek',
      purpose: 'social_request_card',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://deepseek.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
          'content-type': 'application/json',
        }),
      }),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect(JSON.parse(request.body ?? '{}')).toMatchObject({
      model: 'card-model',
      response_format: { type: 'json_object' },
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'draft card' }),
      ]),
    });
  });

  it('uses the shared DeepSeek client when injected so tool JSON follows the common runtime policy', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      AGENT_CARD_MODEL: 'card-model',
    });
    const deepSeek = {
      complete: jest.fn().mockResolvedValue('{"summary":"via shared client"}'),
    };
    const abortController = new AbortController();
    const service = new SocialAgentToolJsonModelService(
      config as never,
      undefined,
      deepSeek as never,
    );
    global.fetch = jest.fn() as never;

    const result = await service.callJson({
      purpose: 'social_request_card',
      prompt: 'draft card',
      fallback: () => ({ source: 'fallback' }),
      taskId: 12,
      signal: abortController.signal,
      traceId: 'trace-tool-json',
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(deepSeek.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'card_generation',
        taskId: 12,
        intent: 'social_request_card',
        fallbackTemperature: 0.2,
        responseFormat: { type: 'json_object' },
        retryAttempts: 1,
        signal: abortController.signal,
        timeoutMs: SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
        traceId: 'trace-tool-json',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({
            role: 'user',
            content: 'draft card',
          }),
        ]),
      }),
    );
    expect(result).toEqual({
      summary: 'via shared client',
      source: 'deepseek',
      purpose: 'social_request_card',
    });
  });

  it('does not let stale short timeout config weaken DeepSeek tool JSON calls', async () => {
    jest.useFakeTimers();
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS: '1',
      SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '2500',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as {
        logger: {
          log: (message: string) => void;
          warn: (message: string) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    let requestSignal: AbortSignal | null = null;
    const currentRequestSignal = () => {
      if (!requestSignal) throw new Error('Expected fetch request signal');
      return requestSignal;
    };
    const fallback = jest.fn(() => ({ source: 'fallback' }));
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          requestSignal = init.signal ?? null;
          init.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as never;

    const pending = service.callJson({
      purpose: 'candidate_summary',
      prompt: 'summarize',
      fallback,
      taskId: 32,
    });

    await jest.advanceTimersByTimeAsync(2499);
    expect(currentRequestSignal().aborted).toBe(false);
    expect(fallback).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS - 2500);
    expect(currentRequestSignal().aborted).toBe(false);
    expect(fallback).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      source: 'fallback',
      purpose: 'candidate_summary',
      fallbackReason: 'deepseek_timeout',
    });
    expect(currentRequestSignal().aborted).toBe(true);
  });

  it('treats user aborts as client cancellation instead of fallback output', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS: '2',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as {
        logger: {
          log: (message: string) => void;
          warn: (message: string) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const abortController = new AbortController();
    const fallback = jest.fn(() => ({ source: 'fallback' }));
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as never;

    const pending = service.callJson({
      purpose: 'decide_next_social_action',
      prompt: 'decide',
      fallback,
      taskId: 33,
      signal: abortController.signal,
    });
    abortController.abort();

    await expect(pending).rejects.toThrow('client_aborted');
    expect(fallback).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries retryable DeepSeek HTTP failures before falling back', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '2',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as {
        logger: {
          log: (message: string) => void;
          warn: (message: string) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => ({
          choices: [{ message: { content: '{"summary":"after retry"}' } }],
        }),
      }) as never;

    const result = await service.callJson({
      purpose: 'candidate_summary',
      prompt: 'summarize',
      fallback: () => ({ source: 'fallback' }),
      taskId: 22,
    });

    expect(result).toEqual({
      summary: 'after retry',
      source: 'deepseek',
      purpose: 'candidate_summary',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('deepseek.call_retrying'),
    );
  });

  it('retries malformed JSON once so transient model formatting does not weaken tools', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as {
        logger: {
          log: (message: string) => void;
          warn: (message: string) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => ({
          choices: [{ message: { content: 'not json' } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => ({
          choices: [{ message: { content: '{"summary":"valid"}' } }],
        }),
      }) as never;

    const result = await service.callJson({
      purpose: 'summarize_reply',
      prompt: 'summarize',
      fallback: () => ({ source: 'fallback' }),
      taskId: 23,
    });

    expect(result).toEqual({
      summary: 'valid',
      source: 'deepseek',
      purpose: 'summarize_reply',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries DeepSeek tool JSON timeouts before falling back to rules', async () => {
    const config = makeConfig({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      SOCIAL_AGENT_TOOL_JSON_RETRY_ATTEMPTS: '2',
      SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '9000',
    });
    const service = new SocialAgentToolJsonModelService(config as never);
    const logger = (
      service as unknown as {
        logger: {
          log: (message: string) => void;
          warn: (message: string) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        json: () => ({
          choices: [{ message: { content: '{"summary":"after timeout"}' } }],
        }),
      }) as never;

    const result = await service.callJson({
      purpose: 'candidate_summary',
      prompt: 'summarize candidates',
      fallback: () => ({ source: 'fallback' }),
      taskId: 24,
    });

    expect(result).toEqual({
      summary: 'after timeout',
      source: 'deepseek',
      purpose: 'candidate_summary',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('deepseek.call_retrying'),
    );
  });
});
