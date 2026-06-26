import {
  DEFAULT_DEEPSEEK_FAST_MODEL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_DEEPSEEK_STRICT_TOOL_BASE_URL,
  callDeepSeekChatCompletion,
  callDeepSeekChatCompletionWithUsage,
  resolveDeepSeekModel,
  resolveDeepSeekModelForMode,
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

  it('uses fast models for structured and tool modes', () => {
    expect(resolveDeepSeekModelForMode('structured')).toBe(
      DEFAULT_DEEPSEEK_FAST_MODEL,
    );
    expect(resolveDeepSeekModelForMode('tool')).toBe(
      DEFAULT_DEEPSEEK_FAST_MODEL,
    );
    expect(resolveDeepSeekModelForMode('structured', 'deepseek-chat')).toBe(
      DEFAULT_DEEPSEEK_FAST_MODEL,
    );
  });

  it('keeps the quality path for copy and reasoning modes', () => {
    expect(resolveDeepSeekModelForMode('copy')).toBe(DEFAULT_DEEPSEEK_MODEL);
    expect(resolveDeepSeekModelForMode('reasoning')).toBe(
      DEFAULT_DEEPSEEK_MODEL,
    );
    expect(resolveDeepSeekModelForMode('copy', 'deepseek-v4-flash')).toBe(
      DEFAULT_DEEPSEEK_MODEL,
    );
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

  it('returns DeepSeek usage and cache-hit token metrics for non-streaming calls', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          system_fingerprint: 'fp-cache-a',
          usage: {
            prompt_tokens: 120,
            prompt_cache_hit_tokens: 80,
            prompt_cache_miss_tokens: 40,
            completion_tokens: 16,
            completion_tokens_details: { reasoning_tokens: 5 },
          },
          choices: [{ message: { content: '带 usage 的结果' } }],
        }),
      } as Response),
    ) as unknown as jest.MockedFunction<typeof fetch>;

    await expect(
      callDeepSeekChatCompletionWithUsage({
        apiKey: 'test-key',
        model: 'deepseek-v4-pro',
        timeoutMs: 12_000,
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).resolves.toEqual({
      content: '带 usage 的结果',
      toolCalls: [],
      systemFingerprint: 'fp-cache-a',
      usage: {
        promptTokens: 120,
        promptCacheHitTokens: 80,
        promptCacheMissTokens: 40,
        completionTokens: 16,
        reasoningTokens: 5,
      },
    });
  });

  it('reads OpenAI-compatible cached token details when DeepSeek cache fields are absent', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          usage: {
            prompt_tokens: 90,
            prompt_tokens_details: { cached_tokens: 42 },
            completion_tokens: 9,
            reasoning_tokens: 3,
          },
          choices: [{ message: { content: '兼容 usage 的结果' } }],
        }),
      } as Response),
    ) as unknown as jest.MockedFunction<typeof fetch>;

    const result = await callDeepSeekChatCompletionWithUsage({
      apiKey: 'test-key',
      model: 'deepseek-v4-pro',
      timeoutMs: 12_000,
      messages: [{ role: 'user', content: '你好' }],
    });

    expect(result.usage).toEqual({
      promptTokens: 90,
      promptCacheHitTokens: 42,
      promptCacheMissTokens: null,
      completionTokens: 9,
      reasoningTokens: 3,
    });
    expect(result.toolCalls).toEqual([]);
  });

  it('applies mode-specific defaults and reasoning controls', async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn((_url, init: RequestInit = {}) => {
      if (typeof init.body === 'string') {
        requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
        }),
      } as Response);
    }) as jest.MockedFunction<typeof fetch>;

    await callDeepSeekChatCompletion({
      apiKey: 'test-key',
      model: 'deepseek-v4-flash',
      mode: 'structured',
      timeoutMs: 12_000,
      messages: [{ role: 'user', content: '结构化' }],
    });
    await callDeepSeekChatCompletion({
      apiKey: 'test-key',
      model: 'deepseek-v4-pro',
      mode: 'copy',
      timeoutMs: 12_000,
      messages: [{ role: 'user', content: '文案' }],
    });
    await callDeepSeekChatCompletion({
      apiKey: 'test-key',
      model: 'deepseek-v4-pro',
      mode: 'reasoning',
      thinking: { type: 'enabled' },
      reasoningEffort: 'high',
      timeoutMs: 12_000,
      messages: [{ role: 'user', content: '复盘' }],
    });

    expect(requestBodies[0]).toMatchObject({ temperature: 0.1 });
    expect(requestBodies[1]).toMatchObject({ temperature: 0.3 });
    expect(requestBodies[2]).toMatchObject({
      temperature: 0.2,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
  });

  it('uses the beta endpoint for strict tool calls by default', async () => {
    const tool = {
      type: 'function',
      function: {
        name: 'extract_slots',
        strict: true,
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    };
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '',
                tool_calls: [{ id: 'call-1', type: 'function' }],
              },
            },
          ],
        }),
      } as Response),
    ) as jest.MockedFunction<typeof fetch>;

    const result = await callDeepSeekChatCompletionWithUsage({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      mode: 'tool',
      tools: [tool],
      toolChoice: { type: 'function', function: { name: 'extract_slots' } },
      strictTools: true,
      timeoutMs: 12_000,
      messages: [{ role: 'user', content: '青岛散步' }],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `${DEFAULT_DEEPSEEK_STRICT_TOOL_BASE_URL}/v1/chat/completions`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.toolCalls).toEqual([{ id: 'call-1', type: 'function' }]);
  });

  it('fails closed when deepseek-reasoner is configured with tools', async () => {
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

    await expect(
      callDeepSeekChatCompletion({
        apiKey: 'test-key',
        model: 'deepseek-reasoner',
        mode: 'tool',
        tools: [{ type: 'function', function: { name: 'x' } }],
        timeoutMs: 12_000,
        messages: [{ role: 'user', content: '你好' }],
      }),
    ).rejects.toThrow('deepseek-reasoner does not support Function Calling');
    expect(global.fetch).not.toHaveBeenCalled();
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
