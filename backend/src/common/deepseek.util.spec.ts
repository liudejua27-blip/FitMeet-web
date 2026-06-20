import {
  DEFAULT_DEEPSEEK_MODEL,
  callDeepSeekChatCompletion,
  resolveDeepSeekModel,
} from './deepseek.util';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('resolveDeepSeekModel', () => {
  it('uses the supported reasoning model by default', () => {
    expect(resolveDeepSeekModel()).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(resolveDeepSeekModel('')).toBe(DEFAULT_DEEPSEEK_MODEL);
  });

  it('normalizes the old pre-release v4 model name to the reasoning model', () => {
    expect(resolveDeepSeekModel('deepseek-v4')).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(resolveDeepSeekModel('deepseek-v4')).toBe('deepseek-v4-pro');
  });

  it('rejects legacy aliases and fast models on the shared quality path', () => {
    expect(resolveDeepSeekModel('deepseek-chat')).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(resolveDeepSeekModel('deepseek-v4-flash')).toBe(
      DEFAULT_DEEPSEEK_MODEL,
    );
    expect(resolveDeepSeekModel('deepseek-v4-lite')).toBe(
      DEFAULT_DEEPSEEK_MODEL,
    );
  });

  it('keeps an explicit supported model name', () => {
    expect(resolveDeepSeekModel(' deepseek-v4-pro ')).toBe('deepseek-v4-pro');
  });
});

describe('callDeepSeekChatCompletion', () => {
  it('uses the shared DeepSeek completion request shape for text and JSON calls', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn((_url, init: RequestInit = {}) => {
      if (typeof init.body === 'string') {
        requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      } as Response);
    }) as jest.MockedFunction<typeof fetch>;

    const result = await callDeepSeekChatCompletion({
      apiKey: 'test-key',
      baseUrl: 'https://deepseek.test/',
      model: 'deepseek-v4-pro',
      timeoutMs: 12_000,
      responseFormat: { type: 'json_object' },
      messages: [
        { role: 'system', content: '输出 JSON。' },
        { role: 'user', content: '你好' },
      ],
    });

    expect(result).toBe('{"ok":true}');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://deepseek.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(requestBodies[0]).toMatchObject({
      model: 'deepseek-v4-pro',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '输出 JSON。' },
        { role: 'user', content: '你好' },
      ],
    });
  });

  it('does not turn parent aborts into timeout failures', async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    await expect(
      callDeepSeekChatCompletion({
        apiKey: 'test-key',
        model: 'deepseek-v4-pro',
        timeoutMs: 12_000,
        signal: controller.signal,
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('client_aborted');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('retries transient HTTP failures when explicitly configured', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '重试后成功' } }],
        }),
      } as Response) as jest.MockedFunction<typeof fetch>;

    await expect(
      callDeepSeekChatCompletion({
        apiKey: 'test-key',
        model: 'deepseek-v4-pro',
        timeoutMs: 12_000,
        retryAttempts: 2,
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).resolves.toBe('重试后成功');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries timeout-like failures when explicitly configured', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('DeepSeek timeout after 12000ms'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '超时重试后成功' } }],
        }),
      } as Response) as jest.MockedFunction<typeof fetch>;

    await expect(
      callDeepSeekChatCompletion({
        apiKey: 'test-key',
        model: 'deepseek-v4-pro',
        timeoutMs: 12_000,
        retryAttempts: 2,
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).resolves.toBe('超时重试后成功');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry client aborted requests', async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    await expect(
      callDeepSeekChatCompletion({
        apiKey: 'test-key',
        model: 'deepseek-v4-pro',
        timeoutMs: 12_000,
        retryAttempts: 3,
        signal: controller.signal,
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('client_aborted');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
