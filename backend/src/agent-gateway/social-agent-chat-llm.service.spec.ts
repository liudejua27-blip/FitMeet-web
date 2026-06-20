import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import {
  SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
} from './social-agent-model-router.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function makeConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'product_help',
    confidence: 0.92,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'conversational_answer',
    source: 'rules',
    ...overrides,
  };
}

function makeService(
  configValues: Record<string, string | undefined>,
  metrics: { recordError: jest.Mock } = { recordError: jest.fn() },
  selfImprove?: { publishedLifeGraphExtractionRules: jest.Mock },
): SocialAgentChatLlmService {
  return new SocialAgentChatLlmService(
    metrics as never,
    new SocialAgentChatDeepSeekClientService(makeConfig(configValues) as never),
    undefined,
    selfImprove as never,
  );
}

describe('SocialAgentChatLlmService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('calls DeepSeek for product help when configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '你说得对，普通问题应该由大模型回答。我可以解释 FitMeet 的画像、匹配和社交偏好问题。',
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    const service = makeService({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
    });

    const answer = await service.generateConversationalAnswer({
      message: '为什么你不会回答问题？我不是调用的 deepseek 的 api 吗？',
      route: makeRoute(),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://deepseek.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
        }),
      }),
    );
    expect(answer).toContain('大模型回答');
    expect(answer).not.toContain('等你明确说要找人');
    expect(
      JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
      ).model,
    ).toBe('deepseek-v4-pro');
  });

  it('uses DeepSeek chat model as the final answer generator for persona questions', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '人物画像是 FitMeet 用来理解城市、兴趣、可约时间和社交边界的偏好模型。',
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    const service = makeService({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_MODEL: 'deepseek-v4-flash',
    });

    const answer = await service.generateConversationalAnswer({
      message: '人物画像是什么？',
      route: makeRoute(),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
      ).model,
    ).toBe('deepseek-v4-pro');
    expect(answer).toBe(
      '人物画像是 FitMeet 用来理解城市、兴趣、可约时间和社交边界的偏好模型。',
    );
    expect(answer).not.toContain('等你明确说要找人');
  });

  it('uses DeepSeek chat model for casual chat', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '当然可以，我们可以先聊你的运动习惯，再慢慢整理成适合匹配的偏好。',
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    const service = makeService({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
    });

    const answer = await service.generateConversationalAnswer({
      message: '你好，今天可以随便聊聊吗？',
      route: makeRoute({ intent: 'casual_chat' }),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
      ).model,
    ).toBe('deepseek-v4-pro');
    expect(answer).toContain('运动习惯');
    expect(answer).not.toContain('等你明确说要找人');
  });

  it('retries a transient direct chat failure before falling back', async () => {
    const metrics = { recordError: jest.fn() };
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content:
                    '我懂你的意思：你想找的是今晚青岛大学附近、偏舞蹈标签的女生一起散步。',
                },
              },
            ],
          }),
      });
    global.fetch = fetchMock as never;
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      },
      metrics,
    );

    const answer = await service.generateConversationalAnswer({
      message: '我说的是找个女舞蹈生散步，你到底懂没懂',
      route: makeRoute({ intent: 'casual_chat' }),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(answer).toContain('偏舞蹈标签');
    expect(metrics.recordError).not.toHaveBeenCalledWith(
      'social_agent_chat_deepseek_failed',
    );
  });

  it('uses a relevant fallback when direct DeepSeek chat fails', async () => {
    const metrics = { recordError: jest.fn() };
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as never;
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      },
      metrics,
    );

    const answer = await service.generateConversationalAnswer({
      message: '为什么你不会回答问题？我不是调用的 deepseek 的 api 吗？',
      route: makeRoute(),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(answer).toContain('普通问题我应该直接回答');
    expect(answer).not.toContain('调用大模型失败');
    expect(answer).not.toContain('等你明确说要找人');
    expect(metrics.recordError).toHaveBeenCalledWith(
      'social_agent_chat_deepseek_failed',
    );
  });

  it('returns explicit answer sources so fallback copy cannot masquerade as LLM output', async () => {
    const metrics = { recordError: jest.fn() };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '我是 DeepSeek 正式生成的自然回复。',
                },
              },
            ],
          }),
      })
      .mockRejectedValueOnce(new Error('network down'));
    global.fetch = fetchMock as never;
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1',
      },
      metrics,
    );

    await expect(
      service.generateConversationalAnswerWithSource({
        message: '你有什么功能？',
        route: makeRoute(),
        profile: null,
        task: makeTask(),
        longTermSnapshot: null,
        memoryContext: null,
      }),
    ).resolves.toEqual({
      text: '我是 DeepSeek 正式生成的自然回复。',
      source: 'llm',
    });

    const fallback = await service.generateConversationalAnswerWithSource({
      message: '你有什么功能？',
      route: makeRoute(),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(fallback.source).toBe('fallback');
    expect(fallback.text).not.toContain('调用大模型失败');
  });

  it('passes traceId through direct and brain DeepSeek answer generation', async () => {
    const metrics = { recordError: jest.fn() };
    const deepSeek = {
      complete: jest
        .fn()
        .mockResolvedValueOnce('直接回复')
        .mockResolvedValueOnce('大脑回复'),
      configReader: () =>
        makeConfig({
          SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '80',
        }),
    };
    const service = new SocialAgentChatLlmService(
      metrics as never,
      deepSeek as never,
    );
    const task = makeTask();

    await expect(
      service.generateConversationalAnswerWithSource({
        message: '你能做什么？',
        traceId: 'agent:trace-direct',
        route: makeRoute(),
        profile: null,
        task,
        longTermSnapshot: null,
        memoryContext: null,
      }),
    ).resolves.toEqual({ text: '直接回复', source: 'llm' });

    await expect(
      service.generateAgentBrainReplyWithSource({
        message: '我在青岛大学，周末下午有空',
        traceId: 'agent:trace-brain',
        task,
        intent: 'profile_enrichment',
        mode: 'profile_extraction',
        extractedProfile: {},
        sourceMessage: '我在青岛大学，周末下午有空',
        fallbackReply: '我先记录这些信息。',
        memoryContext: null,
      }),
    ).resolves.toEqual({ text: '大脑回复', source: 'llm' });

    expect(deepSeek.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        traceId: 'agent:trace-direct',
      }),
    );
    expect(deepSeek.complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        traceId: 'agent:trace-brain',
      }),
    );
  });

  it('preserves the configured long context window for final-response generation', async () => {
    const metrics = { recordError: jest.fn() };
    const finalResponses = {
      generate: jest.fn().mockResolvedValue('我会接着完整上下文回复。'),
    };
    const deepSeek = {
      configReader: () =>
        makeConfig({
          SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '80',
        }),
    };
    const service = new SocialAgentChatLlmService(
      metrics as never,
      deepSeek as never,
      finalResponses as never,
    );
    const task = makeTask();
    const conversationHistory = Array.from({ length: 90 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `turn-${index}`,
    }));

    await service.generateConversationalAnswerWithSource({
      message: '接着刚才的约练需求继续',
      route: makeRoute(),
      profile: null,
      task,
      longTermSnapshot: null,
      memoryContext: null,
      conversationHistory,
    });

    await service.generateAgentBrainReplyWithSource({
      message: '继续刚才的画像补全',
      task,
      intent: 'profile_enrichment',
      mode: 'profile_extraction',
      extractedProfile: {},
      sourceMessage: '继续刚才的画像补全',
      fallbackReply: '我先记录这些信息。',
      memoryContext: null,
      conversationHistory,
    });

    const directInput = finalResponses.generate.mock.calls[0]?.[0] as {
      conversationHistory?: Array<Record<string, unknown>>;
    };
    const brainInput = finalResponses.generate.mock.calls[1]?.[0] as {
      conversationHistory?: Array<Record<string, unknown>>;
    };
    expect(directInput.conversationHistory).toHaveLength(80);
    expect(directInput.conversationHistory?.[0]).toMatchObject({
      text: 'turn-10',
    });
    expect(brainInput.conversationHistory).toHaveLength(80);
    expect(brainInput.conversationHistory?.[0]).toMatchObject({
      text: 'turn-10',
    });
  });

  it('uses the release-quality token budget for legacy direct and brain answer paths', async () => {
    const metrics = { recordError: jest.fn() };
    const deepSeek = {
      complete: jest
        .fn()
        .mockResolvedValueOnce('直接回复')
        .mockResolvedValueOnce('大脑回复'),
      configReader: () =>
        makeConfig({
          SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS: '500',
        }),
    };
    const service = new SocialAgentChatLlmService(
      metrics as never,
      deepSeek as never,
    );
    const task = makeTask();

    await service.generateConversationalAnswerWithSource({
      message: '你能做什么？',
      route: makeRoute(),
      profile: null,
      task,
      longTermSnapshot: null,
      memoryContext: null,
    });

    await service.generateAgentBrainReplyWithSource({
      message: '我在青岛大学，周末下午有空',
      task,
      intent: 'profile_enrichment',
      mode: 'profile_extraction',
      extractedProfile: {},
      sourceMessage: '我在青岛大学，周末下午有空',
      fallbackReply: '我先记录这些信息。',
      memoryContext: null,
    });

    expect(deepSeek.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxTokens: 900 }),
    );
    expect(deepSeek.complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxTokens: 900 }),
    );
  });

  it('does not convert client-aborted direct chat into fallback text', async () => {
    const metrics = { recordError: jest.fn() };
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
      configReader: () => makeConfig(),
    };
    const service = new SocialAgentChatLlmService(
      metrics as never,
      deepSeek as never,
    );

    await expect(
      service.generateConversationalAnswerWithSource({
        message: '停止生成',
        route: makeRoute({ intent: 'casual_chat' }),
        profile: null,
        task: makeTask(),
        longTermSnapshot: null,
        memoryContext: null,
      }),
    ).rejects.toThrow('client_aborted');

    expect(metrics.recordError).not.toHaveBeenCalledWith(
      'social_agent_chat_deepseek_failed',
    );
  });

  it('does not convert client-aborted Agent Brain replies into fallback text', async () => {
    const metrics = { recordError: jest.fn() };
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
      configReader: () => makeConfig(),
    };
    const service = new SocialAgentChatLlmService(
      metrics as never,
      deepSeek as never,
    );

    await expect(
      service.generateAgentBrainReplyWithSource({
        message: '停止生成',
        task: makeTask(),
        intent: 'profile_enrichment',
        mode: 'profile_extraction',
        extractedProfile: {},
        sourceMessage: '停止生成',
        fallbackReply: '我先保留当前上下文。',
        memoryContext: null,
      }),
    ).rejects.toThrow('client_aborted');

    expect(metrics.recordError).not.toHaveBeenCalledWith(
      'social_agent_brain_deepseek_failed',
    );
  });

  it('uses a relevant fallback when direct DeepSeek chat times out', async () => {
    const metrics = { recordError: jest.fn() };
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as never;
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      },
      metrics,
    );

    const answer = await service.generateConversationalAnswer({
      message: '人物画像是什么？',
      route: makeRoute(),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(answer).toContain('人物画像是 FitMeet 用来理解');
    expect(answer).not.toContain('等你明确说要找人');
    expect(metrics.recordError).toHaveBeenCalledWith(
      'social_agent_chat_deepseek_failed',
    );
  });

  it('does not downgrade casual chat to the legacy five-second timeout budget', async () => {
    jest.useFakeTimers();
    const metrics = { recordError: jest.fn() };
    const aborts: number[] = [];
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborts.push(Date.now());
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as never;
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS: '5000',
        SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1',
      },
      metrics,
    );

    const answer = service.generateConversationalAnswer({
      message: '你好，我们随便聊聊。',
      route: makeRoute({ intent: 'casual_chat' }),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS - 1);
    expect(aborts).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    const fallbackAnswer = await answer;
    expect(fallbackAnswer).toContain('FitMeet 的 AI 社交助理');
    expect(fallbackAnswer).not.toContain('等你明确说要找人');
    expect(aborts).toHaveLength(1);
    expect(metrics.recordError).toHaveBeenCalledWith(
      'social_agent_chat_deepseek_failed',
    );
  });

  it('retries a no-delta DeepSeek timeout before falling back to rules', async () => {
    const metrics = { recordError: jest.fn() };
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        json: () => ({
          choices: [
            {
              message: {
                content: '我记得你刚才在问人物画像，我会接着上下文回答。',
              },
            },
          ],
        }),
      }) as never;
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '2',
      },
      metrics,
    );

    const answer = await service.generateConversationalAnswer({
      message: '人物画像为什么老是忘？',
      route: makeRoute(),
      profile: null,
      task: makeTask(),
      longTermSnapshot: null,
      memoryContext: null,
    });

    expect(answer).toContain('接着上下文回答');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(metrics.recordError).not.toHaveBeenCalledWith(
      'social_agent_chat_deepseek_failed',
    );
  });

  it('does not let stale shared timeout env weaken tool-model extraction lanes', async () => {
    jest.useFakeTimers();
    const aborts: number[] = [];
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborts.push(Date.now());
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as never;
    const service = makeService({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_TIMEOUT_MS: '2500',
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
      AGENT_EXTRACTOR_MODEL: 'deepseek-v4-pro',
      SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1',
    });

    const extraction = service.extractProfileFieldsWithLlm(
      makeTask(),
      '我在青岛大学，喜欢周末下午低强度散步。',
    );
    await Promise.resolve();

    const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect(JSON.parse(request.body ?? '{}').model).toBe('deepseek-v4-pro');
    await jest.advanceTimersByTimeAsync(SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS - 1);
    expect(aborts).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    await expect(extraction).resolves.toEqual({});
    expect(aborts).toHaveLength(1);
  });

  it('does not let stale first-chunk env abort streaming before the quality budget', async () => {
    jest.useFakeTimers();
    const aborts: number[] = [];
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        Promise.resolve({
          ok: true,
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              init.signal?.addEventListener('abort', () => {
                aborts.push(Date.now());
                const error = new Error('Aborted');
                error.name = 'AbortError';
                controller.error(error);
              });
            },
          }),
        }),
    ) as never;
    const client = new SocialAgentChatDeepSeekClientService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS: '3500',
        SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1',
      }) as never,
    );

    const completion = client
      .complete({
        useCase: 'casual_chat',
        taskId: 101,
        intent: 'casual_chat',
        fallbackTemperature: 0.6,
        messages: [{ role: 'user', content: '我们先正常聊聊。' }],
        onDelta: jest.fn(),
      })
      .catch((error: unknown) => error);
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(
      SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS - 1,
    );
    expect(aborts).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    const error = await completion;
    expect(error).toEqual(expect.any(Error));
    expect(error).toMatchObject({ message: 'deepseek_timeout' });
    expect(aborts).toHaveLength(1);
  });

  it('retries a no-delta streaming first-chunk timeout before falling back', async () => {
    jest.useFakeTimers();
    const aborts: number[] = [];
    const encoded = new TextEncoder().encode(
      [
        'data: {"choices":[{"delta":{"content":"我已经接上上下文"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    );
    let fetchCount = 0;
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return Promise.resolve({
            ok: true,
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                // No chunks before the quality first-token budget: this simulates
                // DeepSeek first-token jitter without any emitted user-visible text.
                init.signal?.addEventListener('abort', () => {
                  aborts.push(Date.now());
                  const error = new Error('Aborted');
                  error.name = 'AbortError';
                  controller.error(error);
                });
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoded);
              controller.close();
            },
          }),
        });
      },
    ) as never;
    const client = new SocialAgentChatDeepSeekClientService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '2',
      }) as never,
    );
    const deltas: string[] = [];

    const completion = client.complete({
      useCase: 'casual_chat',
      taskId: 101,
      intent: 'casual_chat',
      fallbackTemperature: 0.6,
      messages: [{ role: 'user', content: '继续刚才的上下文。' }],
      onDelta: (delta) => {
        deltas.push(delta);
      },
    });
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS);
    await expect(completion).resolves.toBe('我已经接上上下文');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(aborts).toHaveLength(1);
    expect(deltas).toEqual(['我已经接上上下文']);
  });

  it('does not let legacy flash model or stale timeout env weaken planner lanes without model router', async () => {
    jest.useFakeTimers();
    const aborts: number[] = [];
    global.fetch = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborts.push(Date.now());
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as never;
    const client = new SocialAgentChatDeepSeekClientService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        AGENT_PLANNER_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_TIMEOUT_MS: '2500',
        DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS: '3500',
        SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1',
      }) as never,
    );

    const planner = client
      .complete({
        useCase: 'planner',
        taskId: 101,
        intent: 'social_search',
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: '今晚青岛大学附近找人散步，偏公开舞蹈标签。',
          },
        ],
      })
      .catch((error: unknown) => error);
    await Promise.resolve();

    const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect(JSON.parse(request.body ?? '{}').model).toBe('deepseek-v4-pro');
    await jest.advanceTimersByTimeAsync(
      SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS - 1,
    );
    expect(aborts).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    const error = await planner;
    expect(error).toEqual(expect.any(Error));
    expect(error).toMatchObject({ message: 'deepseek_timeout' });
    expect(aborts).toHaveLength(1);
  });

  it('rejects legacy deepseek-chat aliases in the shared DeepSeek client fallback path', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '我会继续自然回答。' } }],
      }),
    });
    global.fetch = fetchMock as never;
    const client = new SocialAgentChatDeepSeekClientService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
        DEEPSEEK_MODEL: 'deepseek-chat',
      }) as never,
    );

    await client.complete({
      useCase: 'casual_chat',
      taskId: 101,
      intent: 'casual_chat',
      fallbackTemperature: 0.6,
      messages: [{ role: 'user', content: '继续刚才的话题' }],
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    expect(JSON.parse(request.body ?? '{}').model).toBe('deepseek-v4-pro');
  });

  it('uses quality model for structured profile extraction by default', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  city: '青岛',
                  school: '青岛大学',
                  mbti: 'INFP',
                }),
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    const service = makeService({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
    });

    const extracted = await service.extractProfileFieldsWithLlm(
      makeTask(),
      '我是白羊男，18，青岛大学，INFP，想找同校女生。',
    );

    expect(extracted).toMatchObject({
      city: '青岛',
      school: '青岛大学',
      mbti: 'INFP',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://deepseek.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key',
        }),
      }),
    );
    expect(
      JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
      ).model,
    ).toBe('deepseek-v4-pro');
    expect(
      JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
      ).thinking,
    ).toEqual({ type: 'disabled' });
  });

  it('does not let explicit fast mode downgrade structured profile extraction', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  city: '青岛',
                  school: '青岛大学',
                }),
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    const service = makeService({
      DEEPSEEK_API_KEY: 'test-key',
      DEEPSEEK_BASE_URL: 'https://deepseek.test',
      SOCIAL_AGENT_MODEL_ROUTING_MODE: 'fast',
      DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
    });

    await service.extractProfileFieldsWithLlm(
      makeTask(),
      '我是白羊男，18，青岛大学，想找同校女生。',
    );

    expect(
      JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
      ).model,
    ).toBe('deepseek-v4-pro');
  });

  it('injects published life graph extraction rules into structured extraction', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ city: '青岛' }) } }],
        }),
    });
    global.fetch = fetchMock as never;
    const selfImprove = {
      publishedLifeGraphExtractionRules: jest
        .fn()
        .mockResolvedValue(['Extract availableTimes only when explicit.']),
    };
    const service = makeService(
      {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      },
      { recordError: jest.fn() },
      selfImprove,
    );

    await service.extractProfileFieldsWithLlm(makeTask(), '我在青岛。');

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
    ) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0].content).toContain(
      'Self-improve rule: Extract availableTimes only when explicit.',
    );
  });
});
