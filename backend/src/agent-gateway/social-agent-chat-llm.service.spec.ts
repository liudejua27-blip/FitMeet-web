import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

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

describe('SocialAgentChatLlmService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
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
    const service = new SocialAgentChatLlmService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_MODEL: 'deepseek-chat',
      }) as never,
      { recordError: jest.fn() } as never,
    );

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
    ).toBe('deepseek-chat');
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
    const service = new SocialAgentChatLlmService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
      }) as never,
      { recordError: jest.fn() } as never,
    );

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
    ).toBe('deepseek-chat');
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
    const service = new SocialAgentChatLlmService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
      { recordError: jest.fn() } as never,
    );

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
    ).toBe('deepseek-chat');
    expect(answer).toContain('运动习惯');
    expect(answer).not.toContain('等你明确说要找人');
  });

  it('uses a relevant fallback when direct DeepSeek chat fails', async () => {
    const metrics = { recordError: jest.fn() };
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as never;
    const service = new SocialAgentChatLlmService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
      metrics as never,
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

  it('uses a relevant fallback when direct DeepSeek chat times out', async () => {
    const metrics = { recordError: jest.fn() };
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as never;
    const service = new SocialAgentChatLlmService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
      }) as never,
      metrics as never,
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

  it('uses deepseek-v4-flash for structured profile extraction', async () => {
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
    const service = new SocialAgentChatLlmService(
      makeConfig({
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://deepseek.test',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }) as never,
      { recordError: jest.fn() } as never,
    );

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
    ).toBe('deepseek-v4-flash');
  });
});
