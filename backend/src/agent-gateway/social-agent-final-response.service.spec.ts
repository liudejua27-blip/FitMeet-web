/* eslint-disable @typescript-eslint/require-await */
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS } from './social-agent-model-router.service';

function makeConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('SocialAgentFinalResponseService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('uses DeepSeek to generate the final natural response with tool context', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '我已经帮你完善了画像，还缺可约时间和见面边界。',
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
      }) as never,
    );

    const result = await service.generate({
      userMessage: '我是白羊男，18，在青岛大学，想找同校女生',
      intent: 'profile_enrichment',
      agentState: 'profile_saved',
      conversationHistory: [{ role: 'user', text: '上面是画像' }],
      memoryContext: {
        longTerm: { city: '青岛' },
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      taskContext: {
        currentTask: '完善人物画像',
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          candidate_preference: { value: '女生、舞蹈相关', state: 'answered' },
        },
      },
      plannerDecision: { shouldCallTools: true },
      toolResults: [
        {
          tool: 'update_profile_from_agent_context',
          success: true,
          updatedFields: ['city', 'nearbyArea'],
          missingFields: ['availableTimes', 'privacyBoundary'],
        },
      ],
      safetyRules: ['发私信前必须用户确认'],
      responseGoal: '说明画像保存结果，并询问缺失信息。',
      fallbackReply: '画像已更新。',
    });

    expect(result).toBe('我已经帮你完善了画像，还缺可约时间和见面边界。');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://deepseek.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer key',
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as {
      model?: string;
      thinking?: unknown;
      max_tokens?: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('deepseek-v4-pro');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBe(1200);
    expect(body.messages[0].content).toContain(
      'taskContext.taskSlots 和 memoryContext.taskSlots 是用户已回答/已确认的信息硬约束',
    );
    expect(body.messages[0].content).toContain('不能重复追问');
    expect(body.messages[0].content).toContain(
      'taskContext.candidateActions/candidateState 是候选人操作事实',
    );
    expect(body.messages[0].content).toContain(
      'taskContext.pendingApprovals/pendingActions 是待用户确认的动作事实',
    );
    expect(body.messages[0].content).toContain(
      '最新用户修正优先于旧 fallbackReply',
    );
    const userPayload = JSON.parse(body.messages[1].content) as Record<
      string,
      unknown
    >;
    expect(userPayload).toMatchObject({
      userMessage: '我是白羊男，18，在青岛大学，想找同校女生',
      intent: 'profile_enrichment',
      agentState: 'profile_saved',
      responseGoal: '说明画像保存结果，并询问缺失信息。',
      memoryContext: expect.objectContaining({
        taskSlots: expect.objectContaining({
          time_window: expect.objectContaining({ value: '今天晚上' }),
          location_text: expect.objectContaining({ value: '青岛大学附近' }),
        }),
      }),
      taskContext: expect.objectContaining({
        taskSlots: expect.objectContaining({
          activity: expect.objectContaining({ value: '散步' }),
          candidate_preference: expect.objectContaining({
            value: '女生、舞蹈相关',
          }),
        }),
      }),
      knownTaskSlotConstraints: expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining([
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ]),
        userVisibleSummary: expect.stringContaining('时间：今天晚上'),
        candidatePreferencePolicy: expect.stringContaining('公开可发现资料'),
      }),
    });
    expect(
      (
        userPayload.knownTaskSlotConstraints as {
          knownSlots: Array<{ key: string; value: string }>;
        }
      ).knownSlots,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'time_window', value: '今天晚上' }),
        expect.objectContaining({
          key: 'location_text',
          value: '青岛大学附近',
        }),
        expect.objectContaining({ key: 'activity', value: '散步' }),
        expect.objectContaining({
          key: 'candidate_preference',
          value: '女生、舞蹈相关',
        }),
      ]),
    );
    expect(userPayload.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'update_profile_from_agent_context',
          success: true,
        }),
      ]),
    );
    expect(userPayload.safetyRules).toEqual(['发私信前必须用户确认']);
  });

  it('records final-response LLM calls with traceId without adding it to the model prompt', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '我会接着处理。' } }],
      }),
    });
    global.fetch = fetchMock as never;
    const observability = { recordLlmCall: jest.fn() };
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
      undefined,
      undefined,
      observability as never,
    );

    await expect(
      service.generate({
        userMessage: '继续帮我找人',
        traceId: 'agent:trace-final',
        intent: 'social_search',
        fallbackReply: '我会继续。',
      }),
    ).resolves.toBe('我会接着处理。');

    expect(observability.recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'agent:trace-final',
        success: true,
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as {
      messages: Array<{ content: string }>;
    };
    const userPayload = JSON.parse(body.messages[1].content) as Record<
      string,
      unknown
    >;
    expect(userPayload).not.toHaveProperty('traceId');
    expect(body.messages[0].content).not.toContain('agent:trace-final');
  });

  it('uses the shared streaming DeepSeek client when injected without weakening final responses', async () => {
    global.fetch = jest.fn() as never;
    const deltas: string[] = [];
    const deepSeek = {
      complete: jest.fn(
        async (input: {
          onDelta?: (delta: string) => void | Promise<void>;
        }) => {
          await input.onDelta?.('我已经');
          await input.onDelta?.('理解你的需求。');
          return '我已经理解你的需求。';
        },
      ),
    };
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
      }) as never,
      undefined,
      undefined,
      undefined,
      deepSeek as never,
    );

    const result = await service.generate(
      {
        userMessage: '继续帮我找人',
        traceId: 'agent:trace-final-shared',
        intent: 'social_search',
        taskContext: {
          taskId: 88,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
          },
        },
        fallbackReply: '我会继续。',
      },
      {
        onDelta: (delta) => {
          deltas.push(delta);
        },
      },
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toBe('我已经理解你的需求。');
    expect(deltas).toEqual(['我已经', '理解你的需求。']);
    expect(deepSeek.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'final_response',
        taskId: 88,
        intent: 'social_search',
        fallbackTemperature: 0.6,
        maxTokens: 1200,
        retryAttempts: 1,
        timeoutMs: SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
        traceId: 'agent:trace-final-shared',
        onDelta: expect.any(Function),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('不能重复追问'),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('今天晚上'),
          }),
        ]),
      }),
    );
  });

  it('retries injected DeepSeek timeout messages before using final response fallback', async () => {
    global.fetch = jest.fn() as never;
    const deepSeek = {
      complete: jest
        .fn()
        .mockRejectedValueOnce(new Error('DeepSeek timeout after 25000ms'))
        .mockResolvedValueOnce(
          '明白，你想今晚在青岛大学附近，优先找公开资料里有舞蹈相关标签的人一起散步。',
        ),
    };
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
        SOCIAL_AGENT_FINAL_RESPONSE_RETRY_ATTEMPTS: '2',
      }) as never,
      undefined,
      undefined,
      undefined,
      deepSeek as never,
    );

    await expect(
      service.generate({
        userMessage: '今晚青岛大学附近散步，最好找舞蹈生',
        intent: 'social_search',
        taskContext: {
          taskId: 88,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
        fallbackReply: '我先记录你的需求。',
      }),
    ).resolves.toBe(
      '明白，你想今晚在青岛大学附近，优先找公开资料里有舞蹈相关标签的人一起散步。',
    );
    expect(deepSeek.complete).toHaveBeenCalledTimes(2);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps inferred slots as context without making them do-not-ask-again final response constraints', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '我会先按这些线索继续确认。' } }],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
    );

    await service.generate({
      userMessage: '可以，继续',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          time_window: { value: '今天晚上', state: 'answered' },
          geo_area: { value: '崂山区', state: 'inferred' },
          intensity: { value: '低强度', state: 'inferred' },
        },
      },
      fallbackReply: '我会继续处理。',
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(body.messages[1].content) as Record<
      string,
      unknown
    >;
    const constraints = userPayload.knownTaskSlotConstraints as {
      knownSlots: Array<{
        key: string;
        value: string;
        confirmation?: string;
      }>;
      doNotAskAgainFor: string[];
    };
    expect(constraints.knownSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'time_window',
          value: '今天晚上',
          confirmation: 'user_confirmed',
        }),
        expect.objectContaining({
          key: 'geo_area',
          value: '崂山区',
          confirmation: 'inferred_context',
        }),
        expect.objectContaining({
          key: 'intensity',
          value: '低强度',
          confirmation: 'inferred_context',
        }),
      ]),
    );
    expect(constraints.doNotAskAgainFor).toEqual(['time_window']);
  });

  it('does not repeat stale clarification when actionable slots are inferred from context', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const result = await service.generate({
      userMessage: '可以，帮我找人',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'inferred' },
          time_window: { value: '今天晚上', state: 'inferred' },
          location_text: { value: '青岛大学附近', state: 'inferred' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的女生',
            state: 'inferred',
          },
        },
      },
      fallbackReply:
        '你更想今晚就近试试，还是周末下午找个时间？告诉我这个，我就能继续筛人啦。',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).toContain('舞蹈相关');
    expect(result).not.toContain('今晚就近试试，还是周末下午');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses a release-quality configurable final response token budget', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '我会用更完整的上下文继续。' } }],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS: '500',
      }) as never,
    );

    await expect(
      service.generate({
        userMessage: '继续帮我找人',
        intent: 'social_search',
        fallbackReply: '我会继续。',
      }),
    ).resolves.toBe('我会用更完整的上下文继续。');

    let request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    let body = JSON.parse(request.body ?? '{}') as { max_tokens?: number };
    expect(body.max_tokens).toBe(900);

    fetchMock.mockClear();
    const wideService = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS: '1800',
      }) as never,
    );

    await wideService.generate({
      userMessage: '请结合候选人、约练卡和安全边界给我自然回复',
      intent: 'social_search',
      fallbackReply: '我会继续。',
    });

    request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    body = JSON.parse(request.body ?? '{}') as { max_tokens?: number };
    expect(body.max_tokens).toBe(1800);
  });

  it('returns fallback when no DeepSeek key is configured', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const result = await service.generate({
      userMessage: '帮我找同校女生',
      fallbackReply: '我可以先帮你补齐画像。',
    });

    expect(result).toBe('我可以先帮你补齐画像。');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not return stale slot clarification fallback when completed slots are available', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const result = await service.generate({
      userMessage: '可以，帮我找人',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的女生',
            state: 'answered',
          },
        },
      },
      fallbackReply:
        '你更想今晚就近试试，还是周末下午找个时间？告诉我这个，我就能继续筛人啦。',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).not.toContain('今晚就近试试，还是周末下午');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends context-aware fallback into DeepSeek instead of stale clarification copy', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '我会按你已补齐的信息继续筛选候选人。',
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
    );

    await service.generate({
      userMessage: '可以，帮我找人',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的女生',
            state: 'answered',
          },
        },
      },
      fallbackReply:
        '你更想今晚就近试试，还是周末下午找个时间？告诉我这个，我就能继续筛人啦。',
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(body.messages[1].content) as Record<
      string,
      unknown
    >;
    expect(userPayload.fallbackReply).toContain('我记得你已经补充了');
    expect(userPayload.fallbackReply).toContain('今天晚上');
    expect(userPayload.fallbackReply).toContain('青岛大学附近');
    expect(userPayload.fallbackReply).toContain('舞蹈相关');
    expect(userPayload.fallbackReply).not.toContain('今晚就近试试，还是周末下午');
  });

  it('does not repeat stale clarification when slots only exist in taskMemory', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const result = await service.generate({
      userMessage: '可以，继续帮我找人',
      intent: 'social_search',
      taskContext: {
        taskMemory: {
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            candidate_preference: {
              value: '公开资料里有舞蹈相关标签的女生',
              state: 'answered',
            },
          },
        },
      },
      fallbackReply:
        '你更想今晚就近试试，还是周末下午找个时间？告诉我这个，我就能继续筛人啦。',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).toContain('舞蹈相关');
    expect(result).not.toContain('今晚就近试试，还是周末下午');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not repeat stale clarification when only known slot constraints are available', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const knownTaskSlotConstraints = {
      treatAsHardConstraints: true,
      knownSlots: [
        { key: 'activity', label: '活动', value: '散步' },
        { key: 'time_window', label: '时间', value: '今天晚上' },
        { key: 'location_text', label: '地点', value: '青岛大学附近' },
        {
          key: 'candidate_preference',
          label: '候选偏好',
          value: '公开资料里有舞蹈相关标签的女生',
        },
      ],
      doNotAskAgainFor: [
        'activity',
        'time_window',
        'location_text',
        'candidate_preference',
      ],
      userVisibleSummary:
        '活动：散步；时间：今天晚上；地点：青岛大学附近；候选偏好：公开资料里有舞蹈相关标签的女生',
      candidatePreferencePolicy:
        'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息。',
      instruction: '不得重复询问已知字段。',
    };

    const result = await service.generate({
      userMessage: '可以，帮我找人',
      intent: 'social_search',
      taskContext: {
        taskMemory: {
          knownTaskSlotConstraints,
        },
      },
      fallbackReply:
        '你更想今晚就近试试，还是周末下午找个时间？告诉我这个，我就能继续筛人啦。',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).toContain('舞蹈相关');
    expect(result).not.toContain('今晚就近试试，还是周末下午');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not fall back to generic onboarding copy when actionable social slots already exist', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const result = await service.generate({
      userMessage: '你到底懂没懂，我说的是找个女舞蹈生散步',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的女生',
            state: 'answered',
          },
        },
      },
      fallbackReply:
        '可以，我先帮你补齐人物画像。你可以告诉我城市、兴趣、可约时间、想认识什么样的人和边界要求。',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).toContain('舞蹈相关');
    expect(result).not.toContain('补齐人物画像');
    expect(result).not.toContain('告诉我城市');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not expose generic saved-conversation fallback when task slots are actionable', async () => {
    global.fetch = jest.fn() as never;
    const service = new SocialAgentFinalResponseService(makeConfig() as never);

    const result = await service.generate({
      userMessage: '我的记忆呢，怎么没了',
      intent: 'social_search',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的女生',
            state: 'answered',
          },
        },
      },
      fallbackReply: '我已经保留当前对话。你可以稍后再试一次。',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).toContain('舞蹈相关');
    expect(result).not.toContain('稍后再试');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses context-aware fallback after DeepSeek final response fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_FINAL_RESPONSE_RETRY_ATTEMPTS: '1',
      }) as never,
    );

    const result = await service.generate({
      userMessage: '可以，帮我找人',
      intent: 'social_search',
      memoryContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      fallbackReply:
        '还缺一点关键信息：你更想今晚还是周末下午？地点在哪里？',
    });

    expect(result).toContain('我记得你已经补充了');
    expect(result).toContain('散步');
    expect(result).toContain('今天晚上');
    expect(result).toContain('青岛大学附近');
    expect(result).not.toContain('还缺一点关键信息');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns fallback for empty model content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '   ' } }],
      }),
    }) as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS: '5000',
      }) as never,
    );

    await expect(
      service.generate({
        userMessage: '没有候选人',
        fallbackReply: '当前没有找到真实候选人。',
      }),
    ).resolves.toBe('当前没有找到真实候选人。');
  });

  it('retries a transient DeepSeek final-response failure before using fallback', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '明白，你想今晚在青岛大学附近找公开资料里有舞蹈相关标签的人一起散步。',
              },
            },
          ],
        }),
      });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
    );

    await expect(
      service.generate({
        userMessage: '今晚青岛大学附近散步，最好找舞蹈生',
        fallbackReply: '我先记录你的需求。',
      }),
    ).resolves.toBe(
      '明白，你想今晚在青岛大学附近找公开资料里有舞蹈相关标签的人一起散步。',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses release-quality timeout budget when the model router is not injected', async () => {
    jest.useFakeTimers();
    const aborts: number[] = [];
    const fetchMock = jest.fn(
      (_url: string, init: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborts.push(Date.now());
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_FINAL_RESPONSE_RETRY_ATTEMPTS: '1',
      }) as never,
    );

    const result = service.generate({
      userMessage: '我想找今晚青岛大学附近的散步搭子',
      fallbackReply: '我先保留你的需求，稍后可以继续。',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS - 1);
    expect(aborts).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('我先保留你的需求，稍后可以继续。');
    expect(aborts).toHaveLength(1);
  });

  it('retries a DeepSeek final-response timeout before using fallback', async () => {
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '明白，你想今晚在青岛大学附近，优先找公开资料里有舞蹈相关标签的人一起散步。',
              },
            },
          ],
        }),
      });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_FINAL_RESPONSE_RETRY_ATTEMPTS: '2',
        SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS: '2500',
      }) as never,
    );

    await expect(
      service.generate({
        userMessage: '今晚青岛大学附近散步，最好找舞蹈生',
        fallbackReply: '我先记录你的需求。',
      }),
    ).resolves.toBe(
      '明白，你想今晚在青岛大学附近，优先找公开资料里有舞蹈相关标签的人一起散步。',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the shared production context window for final DeepSeek answers', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '我会接着刚才的上下文继续。',
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '8',
      }) as never,
    );

    await service.generate({
      userMessage: '继续刚才的话题',
      conversationHistory: Array.from({ length: 95 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `history-${index + 1}`,
      })),
      fallbackReply: '我会继续。',
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPayload = JSON.parse(body.messages[1].content) as Record<
      string,
      unknown
    >;
    expect(userPayload.conversationHistory).toHaveLength(80);
    expect(userPayload.conversationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'history-16' }),
        expect.objectContaining({ text: 'history-95' }),
      ]),
    );
  });

  it('defaults final natural replies to the quality model when no chat model env is set', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '我会接着上下文继续回答。' } }],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
      }) as never,
    );

    await service.generate({
      userMessage: '继续刚才的话题',
      intent: 'casual_chat',
      fallbackReply: '我可以继续。',
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as { model?: string };
    expect(body.model).toBe('deepseek-v4-pro');
  });

  it('rejects legacy deepseek-chat aliases on the final response fallback path', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '我会用稳定模型继续回答。' } }],
      }),
    });
    global.fetch = fetchMock as never;
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
        DEEPSEEK_MODEL: 'deepseek-chat',
      }) as never,
    );

    await service.generate({
      userMessage: '继续刚才的话题',
      intent: 'casual_chat',
      fallbackReply: '我可以继续。',
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(request.body ?? '{}') as { model?: string };
    expect(body.model).toBe('deepseek-v4-pro');
  });

  it('streams DeepSeek response deltas while returning the final content', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'data: {"choices":[{"delta":{"content":"我已经"}}]}',
              '',
              'data: {"choices":[{"delta":{"content":"找到候选人。"}}]}',
              '',
              'data: [DONE]',
              '',
              '',
            ].join('\n'),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });
    global.fetch = fetchMock as never;
    const deltas: string[] = [];
    const service = new SocialAgentFinalResponseService(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
    );

    const result = await service.generate(
      {
        userMessage: '今晚想跑步',
        fallbackReply: '找到候选人。',
      },
      {
        onDelta: (delta) => {
          deltas.push(delta);
        },
      },
    );

    expect(result).toBe('我已经找到候选人。');
    expect(deltas).toEqual(['我已经', '找到候选人。']);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
    ) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.thinking).toEqual({ type: 'disabled' });
  });
});
