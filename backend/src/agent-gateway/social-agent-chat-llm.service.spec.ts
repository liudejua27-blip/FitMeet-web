import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';

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

describe('SocialAgentChatLlmService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
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
