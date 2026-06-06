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
