import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';

function makeRouter() {
  return new SocialAgentIntentRouterService({
    get: jest.fn().mockReturnValue(undefined),
  } as never);
}

describe('SocialAgentIntentRouterService', () => {
  it('routes profile/persona explanation as product help, not profile update', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '人物画像是什么',
    });

    expect(result).toMatchObject({
      intent: 'product_help',
      shouldSearch: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
      source: 'rules',
    });
  });

  it('routes profile-building help as profile enrichment request without writing preferences', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '你可以帮我完善人物画像吗',
    });

    expect(result).toMatchObject({
      intent: 'profile_enrichment_request',
      shouldSearch: false,
      shouldUpdateProfile: false,
      replyStrategy: 'conversational_answer',
      source: 'rules',
    });
  });

  it('routes concrete preference statements as profile updates', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '我在青岛，周末下午有空，喜欢跑步和咖啡',
    });

    expect(result).toMatchObject({
      intent: 'profile_update',
      shouldSearch: false,
      shouldUpdateProfile: true,
      replyStrategy: 'append_context',
      source: 'rules',
    });
  });

  it('routes profile versus workout workflow questions as workflow help', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '我是先完成人物画像然后再进行约练？还是直接发布需求就可以',
    });

    expect(result).toMatchObject({
      intent: 'workflow_help',
      shouldSearch: false,
      replyStrategy: 'conversational_answer',
    });
  });

  it('routes rich profile facts as profile enrichment even with a social goal', async () => {
    const router = makeRouter();

    const result = await router.route({
      message:
        '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、infp。常住在崂山区青岛大学，想找个同校的女生',
    });

    expect(result).toMatchObject({
      intent: 'profile_enrichment',
      shouldSearch: false,
      shouldUpdateProfile: true,
      replyStrategy: 'conversational_answer',
    });
  });

  it('routes correction and profile save requests without searching', async () => {
    const router = makeRouter();

    const correction = await router.route({
      message: '不是不是，上面是我的人物画像，你帮我完善。',
    });
    expect(correction).toMatchObject({
      intent: 'correction_or_clarification',
      shouldSearch: false,
      replyStrategy: 'conversational_answer',
    });

    const saveRequest = await router.route({
      message: '对，你调用工具去帮我完善ai画像',
    });
    expect(saveRequest).toMatchObject({
      intent: 'profile_enrichment_request',
      shouldSearch: false,
      replyStrategy: 'conversational_answer',
    });
  });

  it('prioritizes candidate search when the user asks not to send messages', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '帮我找青岛今晚一起跑步的真实用户，推荐几个人，先不要自动发消息',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('keeps explicit no-approval candidate list requests on social search', async () => {
    const router = makeRouter();

    const result = await router.route({
      message:
        '搜索青岛今晚跑步搭子，返回真实候选人列表，不要发送消息，不要创建待确认动作',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('still routes explicit send requests to action confirmation', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '帮我发消息给第一个人',
      taskContext: { hasCandidates: true },
    });

    expect(result).toMatchObject({
      intent: 'action_request',
      shouldSearch: false,
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
      source: 'rules',
    });
  });

  it('normalizes invalid DeepSeek casual chat search strategy to conversational answer', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        return undefined;
      }),
    } as never);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'casual_chat',
                confidence: 0.88,
                shouldSearch: false,
                shouldReplan: false,
                shouldUpdateProfile: false,
                shouldExecuteAction: false,
                replyStrategy: 'search_candidates',
                entities: {},
              }),
            },
          },
        ],
      }),
    }) as never;

    try {
      const result = await router.route({
        message: '这个情况有点复杂',
      });

      expect(result).toMatchObject({
        intent: 'casual_chat',
        shouldSearch: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
