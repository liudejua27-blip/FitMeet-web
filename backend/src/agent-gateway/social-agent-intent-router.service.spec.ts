/* eslint-disable @typescript-eslint/require-await */
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

  it('routes fitness math questions without searching or writing profile data', async () => {
    const router = makeRouter();

    const samples = [
      '5公里30分钟配速是多少？',
      '身高175cm体重70kg体重指数怎么算？',
      '每周跑3次每次5公里，周跑量是多少？',
    ];

    for (const message of samples) {
      const result = await router.route({ message });

      expect(result).toMatchObject({
        intent: 'fitness_math',
        shouldSearch: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      });
    }
  });

  it('does not route generic product calculations as fitness math', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '你们是怎么计算匹配度的？',
    });

    expect(result.intent).not.toBe('fitness_math');
    expect(result).toMatchObject({
      intent: 'product_help',
      shouldSearch: false,
      replyStrategy: 'conversational_answer',
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

  it.each([
    '怎么参加活动比较安全？',
    '如何加好友不会打扰别人？',
    '发邀请的流程是什么？',
    '新用户怎么找搭子？',
    '创建活动需要先完善画像吗？',
  ])(
    'routes workflow guidance "%s" without social execution',
    async (message) => {
      const router = makeRouter();

      const result = await router.route({ message });

      expect(result).toMatchObject({
        intent: 'workflow_help',
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      });
    },
  );

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

  it('routes rich profile facts with an explicit immediate search command to social search', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '我是青岛大学男生，周末下午喜欢跑步，现在帮我找同校跑步搭子',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldUpdateProfile: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
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

  it.each([
    '我不想交友，只想问一个普通问题',
    '怎么找跑步搭子比较自然？',
    '怎么认识新朋友更自然？',
    '如何认识新朋友但不尴尬？',
    '你能陪我聊聊天吗，先不要推荐用户',
    '今天和朋友吵架了，我只是想聊聊，不要帮我找人',
    '最近参加活动有点累，我想先安静聊会儿',
    '我只是想说说最近交友压力，不需要推荐任何人',
    '先别约练，也别搜索用户，我只是心情不好',
    '今天运动完很累，陪我普通聊聊天',
    '推荐一本适合跑步新手看的书',
    '推荐一些适合周末放松的电影，不是推荐用户',
    '推荐一些适合我的运动搭子类型，不要给真实用户',
    '帮我分析一下我的理想型，先不要搜索候选人',
    '根据我的画像判断我适合认识哪类朋友，不要推荐真实用户',
  ])(
    'keeps non-execution conversation "%s" out of social tools',
    async (message) => {
      const router = makeRouter();

      const result = await router.route({ message });

      expect(result).toMatchObject({
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      });
      expect([
        'social_search',
        'activity_search',
        'candidate_followup',
        'action_request',
      ]).not.toContain(result.intent);
    },
  );

  it('allows explicit social discovery after the user asks to find people', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '帮我找青岛周末一起跑步的搭子，推荐几个真实用户',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
  });

  it.each([
    ['户外搭子', '帮我找青岛周末一起徒步或者户外搭子', 'social_search'],
    ['篮球搭子', '我想找青岛今晚一起打篮球的搭子', 'social_search'],
    ['认识新朋友', '我想在青岛认识一些周末能一起运动的新朋友', 'social_search'],
    ['低压力社交', '我想尝试低压力社交，认识一些新朋友', 'social_search'],
    ['参加活动', '推荐青岛周末可以参加的户外活动', 'activity_search'],
  ] as const)(
    'routes explicit %s requests into the opportunity search lane without executing actions',
    async (_label, message, intent) => {
      const router = makeRouter();

      const result = await router.route({ message });

      expect(result).toMatchObject({
        intent,
        shouldSearch: true,
        shouldExecuteAction: false,
        source: 'rules',
      });
      expect(['search_candidates', 'search_activities']).toContain(
        result.replyStrategy,
      );
    },
  );

  it('continues a pending opportunity clarification answer into social search', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '青岛，周末下午，轻松跑步，只在公共场所，先站内聊',
      taskContext: {
        currentTask: {
          awaitingSearchConfirmation: true,
          waitingFor: 'opportunity_clarification',
        },
      },
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
  });

  it.each([
    '先不找了，今天有点焦虑，只想和你聊聊',
    '不需要推荐真实用户，先帮我分析一下怎么和人相处',
    '我们先聊聊别的，不要搜索候选人',
  ])(
    'stops pending opportunity clarification when the user returns to ordinary chat: "%s"',
    async (message) => {
      const router = makeRouter();

      const result = await router.route({
        message,
        taskContext: {
          currentTask: {
            awaitingSearchConfirmation: true,
            waitingFor: 'opportunity_clarification',
          },
        },
      });

      expect(result).toMatchObject({
        intent: 'casual_chat',
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      });
    },
  );

  it('routes public-place safety constrained matching as search, not action execution', async () => {
    const router = makeRouter();

    const result = await router.route({
      message:
        '我想找青岛周末一起喝咖啡健身交流的人，只要公开地点，先不要发送消息',
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

  it('does not execute send or friend actions when no candidate context exists', async () => {
    const router = makeRouter();

    for (const message of ['帮我发消息给第一个人', '帮我加好友', '邀请这个候选人']) {
      const result = await router.route({ message });

      expect(result).toMatchObject({
        intent: 'candidate_followup',
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'direct_reply',
        source: 'rules',
      });
    }
  });

  it.each(['只看同校', '不要晚上', '换成散步', '只看低压力', '不想要这个类型'])(
    'routes candidate filter refinement "%s" to follow-up replan',
    (message) => {
      const router = makeRouter();

      const result = router.routeByRules({
        message,
        taskContext: { hasSearchContext: true, hasCandidates: true },
      });

      expect(result).toMatchObject({
        intent: 'candidate_followup',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      });
    },
  );

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

  it('clamps DeepSeek social-search misclassification when user did not ask to find people', async () => {
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
                intent: 'social_search',
                confidence: 0.91,
                shouldSearch: true,
                shouldReplan: true,
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
        message: '这个情况有点复杂，先帮我分析一下',
      });

      expect(result).toMatchObject({
        intent: 'casual_chat',
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
