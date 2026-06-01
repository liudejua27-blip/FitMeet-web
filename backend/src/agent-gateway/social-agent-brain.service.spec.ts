/* eslint-disable @typescript-eslint/require-await */
import { SocialAgentBrainService } from './social-agent-brain.service';
import { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function route(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'casual_chat',
    confidence: 0.8,
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

describe('SocialAgentBrainService', () => {
  const service = new SocialAgentBrainService();

  it('downgrades rich profile facts with a social goal instead of searching immediately', () => {
    const decision = service.reviewTurn({
      message:
        '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、infp。常住在崂山区青岛大学，想找个同校的女生',
      route: route({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      }),
    });

    expect(decision.route.intent).toBe('profile_enrichment');
    expect(decision.route.shouldSearch).toBe(false);
    expect(decision.route.replyStrategy).toBe('conversational_answer');
    expect(decision.conversationMode).toBe('profile_enrichment');
    expect(decision.notes).toEqual(
      expect.arrayContaining(['rich_profile_facts_detected']),
    );
  });

  it('treats user repair as correction before any previous intent', () => {
    const decision = service.reviewTurn({
      message: '不是不是，上面是我的人物画像，你帮我完善。',
      route: route({
        intent: 'product_help',
      }),
    });

    expect(decision.route.intent).toBe('correction_or_clarification');
    expect(decision.route.shouldSearch).toBe(false);
    expect(decision.conversationMode).toBe('profile_correction');
  });

  it('routes explicit profile save requests to profile update tool mode', () => {
    const decision = service.reviewTurn({
      message: '对，你调用工具去帮我完善ai画像',
      route: route({
        intent: 'product_help',
      }),
    });

    expect(decision.route.intent).toBe('profile_enrichment_request');
    expect(decision.route.shouldUpdateProfile).toBe(true);
    expect(decision.conversationMode).toBe('profile_update_tool');
  });

  it('answers workflow questions without search', () => {
    const decision = service.reviewTurn({
      message: '我是先完成人物画像然后再进行约练？还是直接发布需求就可以',
      route: route({
        intent: 'product_help',
      }),
    });

    expect(decision.route.intent).toBe('workflow_help');
    expect(decision.route.shouldSearch).toBe(false);
    expect(decision.route.replyStrategy).toBe('conversational_answer');
  });

  it('uses DeepSeek JSON plan when available and keeps tools behind whitelist', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        return undefined;
      }),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                userIntent: 'profile_enrichment',
                reason:
                  'User mainly provided profile facts; social goal is not an immediate search command.',
                shouldCallTool: true,
                tools: [
                  {
                    name: 'update_profile_from_agent_context',
                    arguments: {
                      city: 'Qingdao',
                      mbti: 'INFP',
                      targetPreference: 'same-school women',
                    },
                  },
                  {
                    name: 'unsafe_unlisted_tool',
                    arguments: {},
                  },
                ],
                needUserConfirmation: false,
                responseGoal:
                  'Tell user the profile was extracted and ask whether to search now.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message:
          'I am male, 18, 181cm, studying in Qingdao, INFP, want to meet same-school women.',
        route: route({
          intent: 'casual_chat',
        }),
      });

      expect(decision.plannerSource).toBe('deepseek');
      expect(decision.route.intent).toBe('profile_enrichment');
      expect(decision.shouldExecuteTool).toBe(true);
      expect(decision.tools).toEqual([
        expect.objectContaining({
          name: 'update_profile_from_agent_context',
        }),
      ]);
      expect(decision.tools).toHaveLength(1);
      expect(decision.reason).toContain('profile facts');
      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      expect(body.model).toBe('deepseek-v4-flash');
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.availableTools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'update_profile_from_agent_context',
          }),
          expect.objectContaining({ name: 'search_real_candidates' }),
          expect.objectContaining({ name: 'send_message_to_candidate' }),
          expect.objectContaining({ name: 'get_conversation_history' }),
        ]),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('canonicalizes tool aliases before exposing planned tools', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        return undefined;
      }),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                userIntent: 'social_search',
                reason: 'User explicitly asked to search candidates now.',
                shouldCallTool: true,
                tools: [
                  { name: 'search_candidates', arguments: { city: 'Qingdao' } },
                ],
                needUserConfirmation: false,
                responseGoal: 'Search candidates and summarize results.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '现在帮我搜索青岛跑步搭子',
        route: route({ intent: 'social_search', shouldSearch: true }),
      });

      expect(decision.route.intent).toBe('social_search');
      expect(decision.tools).toEqual([
        expect.objectContaining({ name: 'search_real_candidates' }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('accepts the model-facing planner schema fields', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        return undefined;
      }),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'profile_enrichment',
                reason: '用户主要是在提供人物画像。',
                state: 'profile_building',
                shouldCallTools: true,
                toolCalls: [
                  {
                    name: 'update_profile_from_agent_context',
                    arguments: { city: '青岛', mbti: 'INFP' },
                  },
                ],
                needUserConfirmation: false,
                responseGoal: '告诉用户已提取画像，并询问是否现在开始搜索',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '我是白羊男，18，在青岛大学，INFP，想找同校女生',
        route: route({ intent: 'casual_chat' }),
      });

      expect(decision.plannerSource).toBe('deepseek');
      expect(decision.route.intent).toBe('profile_enrichment');
      expect(decision.shouldExecuteTool).toBe(true);
      expect(decision.responseGoal).toBe(
        '告诉用户已提取画像，并询问是否现在开始搜索',
      );
      expect(decision.tools).toEqual([
        expect.objectContaining({
          name: 'update_profile_from_agent_context',
          arguments: expect.objectContaining({ city: '青岛' }),
        }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
