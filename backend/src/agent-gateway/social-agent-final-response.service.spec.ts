/* eslint-disable @typescript-eslint/require-await */
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';

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
      memoryContext: { longTerm: { city: '青岛' } },
      taskContext: { currentTask: '完善人物画像' },
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
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('deepseek-v4-pro');
    const userPayload = JSON.parse(body.messages[1].content) as Record<
      string,
      unknown
    >;
    expect(userPayload).toMatchObject({
      userMessage: '我是白羊男，18，在青岛大学，想找同校女生',
      intent: 'profile_enrichment',
      agentState: 'profile_saved',
      responseGoal: '说明画像保存结果，并询问缺失信息。',
    });
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
      }) as never,
    );

    await expect(
      service.generate({
        userMessage: '没有候选人',
        fallbackReply: '当前没有找到真实候选人。',
      }),
    ).resolves.toBe('当前没有找到真实候选人。');
  });
});
