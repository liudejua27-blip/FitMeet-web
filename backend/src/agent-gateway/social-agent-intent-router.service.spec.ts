/* eslint-disable @typescript-eslint/require-await */
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import { SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS } from './social-agent-model-router.service';

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

  it.each(['你有什么功能', '介绍一下你的功能', 'FitMeet Agent 有什么能力'])(
    'routes generic Agent capability question "%s" as product help without social tools',
    async (message) => {
      const router = makeRouter();

      const result = await router.route({ message });

      expect(result).toMatchObject({
        intent: 'product_help',
        shouldSearch: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      });
    },
  );

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

  it('keeps social-search corrections in the matching lane when the user refines the target', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '我说的是找个女生舞蹈生散步，你到底懂没懂我的意思',
      taskContext: { hasSearchContext: true, hasCandidates: true },
    });

    expect(result).toMatchObject({
      intent: 'candidate_followup',
      shouldSearch: true,
      shouldReplan: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
  });

  it('routes explicit social corrections without existing task context into search instead of profile correction', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '不是这个意思，我是想找青岛大学附近今晚一起散步的女生',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
  });

  it('keeps first-turn social criteria in rule entities before task memory exists', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '我想在青岛大学附近，今天晚上，找个女舞蹈生散步。',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
      source: 'rules',
      entities: expect.objectContaining({
        city: '青岛',
        activityType: '散步',
        targetGender: '女生',
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
      }),
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
    '请用两句话帮我安排今天的训练恢复，不要帮我找人，也不要推荐活动。',
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
    '请用两句话帮我安排今天的训练恢复，不要帮我找人，也不要推荐活动。',
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

  it.each([
    '为什么要问这些信息？',
    '为什么不能直接找？',
    '你到底懂没懂我的意思？',
  ])(
    'does not treat pending opportunity clarification meta-question "%s" as search execution',
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

  it('keeps explicit continuation commands in pending opportunity clarification on search', async () => {
    const router = makeRouter();

    const result = await router.route({
      message: '可以，帮我找人',
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

    for (const message of [
      '帮我发消息给第一个人',
      '帮我加好友',
      '邀请这个候选人',
    ]) {
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
        conversationHistory: Array.from({ length: 85 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `message-${index + 1}`,
        })),
      });

      expect(result).toMatchObject({
        intent: 'casual_chat',
        shouldSearch: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      });
      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.conversationHistory).toHaveLength(80);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses DeepSeek as the default primary intent router even when rules are confident', async () => {
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
                intent: 'product_help',
                confidence: 0.93,
                shouldSearch: false,
                shouldReplan: false,
                shouldUpdateProfile: false,
                shouldExecuteAction: false,
                replyStrategy: 'conversational_answer',
                entities: {},
              }),
            },
          },
        ],
      }),
    }) as never;

    try {
      const result = await router.route({ message: '你有什么功能' });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        intent: 'product_help',
        shouldSearch: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses the unified DeepSeek client for intent routing when injected', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn() as never;
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          intent: 'social_search',
          confidence: 0.94,
          shouldSearch: true,
          shouldReplan: true,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
          replyStrategy: 'search_candidates',
          entities: {
            city: '青岛',
            activityType: '散步',
            targetGender: '女生',
            timePreference: '今天晚上',
            locationPreference: '青岛大学附近',
          },
        }),
      ),
    };
    const router = new SocialAgentIntentRouterService(
      {
        get: jest.fn((key: string) => {
          if (key === 'DEEPSEEK_API_KEY') return 'test-key';
          if (key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT') return '8';
          if (key === 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS') return '2';
          return undefined;
        }),
      } as never,
      undefined,
      undefined,
      deepSeek as never,
    );

    try {
      const signal = new AbortController().signal;
      const result = await router.route({
        message: '可以，帮我找人',
        taskContext: {
          taskId: 88,
          hasSearchContext: true,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
        conversationHistory: Array.from({ length: 95 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `history-${index + 1}`,
        })),
        signal,
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        intent: 'social_search',
        source: 'deepseek',
        shouldSearch: true,
      });
      expect(deepSeek.complete).toHaveBeenCalledTimes(1);
      const payload = deepSeek.complete.mock.calls[0]?.[0] as {
        useCase: string;
        taskId: number;
        responseFormat?: { type: string };
        retryAttempts?: number;
        signal?: AbortSignal | null;
        messages: Array<Record<string, unknown>>;
      };
      expect(payload).toMatchObject({
        useCase: 'planner',
        taskId: 88,
        responseFormat: { type: 'json_object' },
        retryAttempts: 2,
        signal,
      });
      const userPayload = JSON.parse(
        String(payload.messages[1].content),
      ) as Record<string, unknown>;
      expect(userPayload.conversationHistory).toHaveLength(80);
      expect(userPayload.knownTaskSlots).toMatchObject({
        activity: '散步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
      });
      expect(userPayload.routingConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
        ]),
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('retries transient failures through the injected DeepSeek client before using rules fallback', async () => {
    const deepSeek = {
      complete: jest
        .fn()
        .mockRejectedValueOnce(new Error('DeepSeek HTTP 500'))
        .mockResolvedValueOnce(
          JSON.stringify({
            intent: 'social_search',
            confidence: 0.94,
            shouldSearch: true,
            shouldReplan: false,
            shouldUpdateProfile: false,
            shouldExecuteAction: false,
            replyStrategy: 'search_candidates',
            entities: {
              city: '青岛',
              activityType: '散步',
              targetGender: '女生',
              timePreference: '今天晚上',
              locationPreference: '青岛大学附近',
            },
          }),
        ),
    };
    const router = new SocialAgentIntentRouterService(
      {
        get: jest.fn((key: string) => {
          if (key === 'DEEPSEEK_API_KEY') return 'test-key';
          if (key === 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS') return '2';
          return undefined;
        }),
      } as never,
      undefined,
      undefined,
      deepSeek as never,
    );

    const result = await router.route({
      message: '我想在青岛大学，今天晚上，找个女舞蹈生散步。',
      conversationHistory: Array.from({ length: 95 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `history-${index + 1}`,
      })),
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
      source: 'deepseek',
      entities: expect.objectContaining({
        city: '青岛',
        activityType: '散步',
        targetGender: '女生',
        timePreference: '今天晚上',
      }),
    });
    const retryPayload = deepSeek.complete.mock.calls[1]?.[0] as {
      retryAttempts?: number;
      messages: Array<Record<string, unknown>>;
    };
    expect(retryPayload.retryAttempts).toBe(2);
    const userPayload = JSON.parse(
      String(retryPayload.messages[1].content),
    ) as Record<string, unknown>;
    expect(userPayload.conversationHistory).toHaveLength(80);
  });

  it('normalizes injected DeepSeek timeout messages before falling back to rules', async () => {
    const deepSeek = {
      complete: jest
        .fn()
        .mockRejectedValue(new Error('DeepSeek timeout after 25000ms')),
    };
    const metrics = {
      recordLatency: jest.fn(),
      recordFallback: jest.fn(),
      recordError: jest.fn(),
    };
    const router = new SocialAgentIntentRouterService(
      {
        get: jest.fn((key: string) => {
          if (key === 'DEEPSEEK_API_KEY') return 'test-key';
          if (key === 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS') return '1';
          return undefined;
        }),
      } as never,
      metrics as never,
      undefined,
      deepSeek as never,
    );

    const result = await router.route({
      message: '我想在青岛大学，今天晚上，找个女舞蹈生散步。',
      conversationHistory: Array.from({ length: 95 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `history-${index + 1}`,
      })),
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
      source: 'rules',
    });
    expect(metrics.recordFallback).toHaveBeenCalledWith('deepseek_timeout');
    expect(metrics.recordError).toHaveBeenCalledWith('deepseek_timeout');
    expect(metrics.recordFallback).not.toHaveBeenCalledWith('deepseek_error');
  });

  it('does not fall back to rules when the client aborts DeepSeek intent routing', async () => {
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
    };
    const router = new SocialAgentIntentRouterService(
      {
        get: jest.fn((key: string) =>
          key === 'DEEPSEEK_API_KEY' ? 'test-key' : undefined,
        ),
      } as never,
      undefined,
      undefined,
      deepSeek as never,
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      router.route({
        message: '可以，帮我找人',
        signal: controller.signal,
      }),
    ).rejects.toThrow('client_aborted');
    expect(deepSeek.complete).not.toHaveBeenCalled();
  });

  it('retries a transient DeepSeek intent-router failure before falling back to rules', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        return undefined;
      }),
    } as never);
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'social_search',
                  confidence: 0.94,
                  shouldSearch: true,
                  shouldReplan: false,
                  shouldUpdateProfile: false,
                  shouldExecuteAction: false,
                  replyStrategy: 'search_candidates',
                  entities: {
                    city: '青岛',
                    activityType: '散步',
                    targetGender: '女生',
                    timePreference: '今天晚上',
                    locationPreference: '青岛大学',
                  },
                }),
              },
            },
          ],
        }),
      }) as never;

    try {
      const result = await router.route({
        message: '我想在青岛大学，今天晚上，找个女舞蹈生散步。',
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
        entities: expect.objectContaining({
          city: '青岛',
          activityType: '散步',
          targetGender: '女生',
          timePreference: '今天晚上',
        }),
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('retries a DeepSeek intent-router timeout before falling back to rules', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS') return '2';
        if (key === 'SOCIAL_AGENT_INTENT_TIMEOUT_MS') return '2500';
        return undefined;
      }),
    } as never);
    const originalFetch = global.fetch;
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'social_search',
                  confidence: 0.94,
                  shouldSearch: true,
                  shouldReplan: false,
                  shouldUpdateProfile: false,
                  shouldExecuteAction: false,
                  replyStrategy: 'search_candidates',
                  entities: {
                    city: '青岛',
                    activityType: '散步',
                    targetGender: '女生',
                    timePreference: '今天晚上',
                    locationPreference: '青岛大学',
                  },
                }),
              },
            },
          ],
        }),
      }) as never;

    try {
      const result = await router.route({
        message: '我想在青岛大学，今天晚上，找个女舞蹈生散步。',
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not let legacy hybrid mode short-circuit high-confidence rules before DeepSeek sees context', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'hybrid';
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
                intent: 'product_help',
                confidence: 0.93,
                shouldSearch: false,
                shouldReplan: false,
                shouldUpdateProfile: false,
                shouldExecuteAction: false,
                replyStrategy: 'conversational_answer',
                entities: {},
              }),
            },
          },
        ],
      }),
    }) as never;

    try {
      const result = await router.route({ message: '你有什么功能' });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        intent: 'product_help',
        shouldSearch: false,
        replyStrategy: 'conversational_answer',
        source: 'deepseek',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('only allows explicit rules_only mode to bypass DeepSeek intent routing', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'rules_only';
        return undefined;
      }),
    } as never);
    const originalFetch = global.fetch;
    global.fetch = jest.fn() as never;

    try {
      const result = await router.route({ message: '你有什么功能' });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        intent: 'product_help',
        shouldSearch: false,
        replyStrategy: 'conversational_answer',
        source: 'rules',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses production-grade timeout budgets instead of the old 2.5s cap', () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'SOCIAL_AGENT_INTENT_TIMEOUT_MS') return '2500';
        return undefined;
      }),
    } as never);

    expect(
      (
        router as unknown as {
          deepSeekTimeoutMs: (useCase?: 'planner') => number;
        }
      ).deepSeekTimeoutMs('planner'),
    ).toBe(25000);
  });

  it('does not let stale tiny context env weaken DeepSeek intent routing payloads', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'llm_first';
        if (key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT') return '8';
        if (key === 'SOCIAL_AGENT_INTENT_TIMEOUT_MS') return '2500';
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
                confidence: 0.94,
                shouldSearch: true,
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
      await router.route({
        message: '继续刚才的话题，帮我找人',
        conversationHistory: Array.from({ length: 95 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `history-${index + 1}`,
        })),
      });

      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
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
      expect(
        (
          router as unknown as {
            deepSeekTimeoutMs: (useCase?: 'planner') => number;
          }
        ).deepSeekTimeoutMs('planner'),
      ).toBe(SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not let fast routing mode downgrade the local intent-router planner model', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'llm_first';
        if (key === 'SOCIAL_AGENT_MODEL_ROUTING_MODE') return 'fast';
        if (key === 'DEEPSEEK_FAST_MODEL') return 'deepseek-v4-flash';
        if (key === 'DEEPSEEK_MODEL') return 'deepseek-v4-flash';
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
                confidence: 0.94,
                shouldSearch: true,
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
      await router.route({
        message: '今天晚上在青岛大学附近散步，帮我找人',
      });

      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      expect(body.model).toBe('deepseek-v4-pro');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('sends completed task slots as hard constraints to DeepSeek intent routing', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'llm_first';
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
                confidence: 0.94,
                shouldSearch: true,
                shouldReplan: true,
                shouldUpdateProfile: false,
                shouldExecuteAction: false,
                replyStrategy: 'search_candidates',
                entities: {
                  activityType: '散步',
                  targetGender: '女生',
                  timePreference: '今天晚上',
                  locationPreference: '青岛大学附近',
                },
              }),
            },
          },
        ],
      }),
    }) as never;

    try {
      const result = await router.route({
        message: '可以，帮我找人',
        taskContext: {
          hasSearchContext: true,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            candidate_preference: {
              value: '女生，舞蹈相关公开标签优先',
              state: 'answered',
            },
          },
        },
      });

      expect(result).toMatchObject({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      });
      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      expect(String(messages[0].content)).toContain(
        '只有 routingConstraints.doNotRepeatQuestionsForSlots',
      );
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.knownTaskSlots).toMatchObject({
        activity: '散步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
        candidate_preference: expect.stringContaining('舞蹈相关公开标签优先'),
      });
      expect(userPayload.routingConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
        candidatePreferenceScope:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps short follow-up turns on DeepSeek with hydrated task memory and full context', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'hybrid';
        if (key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT') return '8';
        if (key === 'SOCIAL_AGENT_INTENT_TIMEOUT_MS') return '2500';
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
                confidence: 0.94,
                shouldSearch: true,
                shouldReplan: true,
                shouldUpdateProfile: false,
                shouldExecuteAction: false,
                replyStrategy: 'search_candidates',
                entities: {
                  activityType: '散步',
                  targetGender: '女生',
                  timePreference: '今天晚上',
                  locationPreference: '青岛大学附近',
                },
              }),
            },
          },
        ],
      }),
    }) as never;

    try {
      const result = await router.route({
        message: '可以',
        taskContext: {
          taskId: 118,
          hasSearchContext: true,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            candidate_preference: {
              value: '女生，舞蹈相关公开标签优先',
              state: 'answered',
            },
          },
        },
        conversationHistory: Array.from({ length: 95 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text:
            index === 54
              ? '我想在青岛大学，今天晚上，找个女舞蹈生散步。'
              : `history-${index + 1}`,
        })),
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
        source: 'deepseek',
      });
      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.message).toBe('可以');
      expect(userPayload.conversationHistory).toHaveLength(80);
      expect(userPayload.conversationHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: 'history-16' }),
          expect.objectContaining({
            text: '我想在青岛大学，今天晚上，找个女舞蹈生散步。',
          }),
        ]),
      );
      expect(userPayload.knownTaskSlots).toMatchObject({
        activity: '散步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
        candidate_preference: expect.stringContaining('舞蹈相关公开标签优先'),
      });
      expect(userPayload.routingConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
        candidatePreferenceScope:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      });
      expect(
        (
          router as unknown as {
            deepSeekTimeoutMs: (useCase?: 'planner') => number;
          }
        ).deepSeekTimeoutMs('planner'),
      ).toBe(SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('sends sanitized user text into the DeepSeek router payload', async () => {
    const router = new SocialAgentIntentRouterService({
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_INTENT_ROUTER_MODE') return 'llm_first';
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
                confidence: 0.92,
                shouldSearch: true,
                shouldReplan: true,
                shouldUpdateProfile: false,
                shouldExecuteAction: false,
                replyStrategy: 'search_candidates',
                entities: {
                  activityType: '散步',
                  timePreference: '今天晚上',
                  locationPreference: '青岛大学附近',
                },
              }),
            },
          },
        ],
      }),
    }) as never;

    try {
      await router.route({
        message: '   今天晚上，青岛大学附近，散步   ',
        conversationHistory: [{ role: 'user', text: '前面说过想轻松一点' }],
      });

      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.message).toBe('今天晚上，青岛大学附近，散步');
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

  it('hydrates known slots from nested taskMemory when top-level taskSlots are absent', async () => {
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
                confidence: 0.94,
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
        message: '可以，继续帮我找人',
        taskContext: {
          taskId: 119,
          hasSearchContext: true,
          taskMemory: {
            taskSlots: {
              activity: { value: '散步', state: 'completed' },
              time_window: { value: '今天晚上', state: 'completed' },
              location_text: { value: '青岛大学附近', state: 'completed' },
              geo_area: { value: '崂山区', state: 'inferred' },
              intensity: { value: '低强度', state: 'inferred' },
              candidate_preference: {
                value: '公开资料里有舞蹈相关标签的女生',
                state: 'answered',
              },
            },
          },
        },
      });

      expect(result).toMatchObject({
        intent: 'social_search',
        shouldSearch: true,
        source: 'deepseek',
      });
      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.knownTaskSlots).toMatchObject({
        activity: '散步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
        geo_area: '崂山区',
        intensity: '低强度',
        candidate_preference: expect.stringContaining('舞蹈相关'),
      });
      expect(userPayload.routingConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        knownContextSlots: expect.arrayContaining([
          'geo_area',
          'intensity',
        ]),
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
        inferredSlotsAreContextOnly: true,
      });
      expect(
        (
          userPayload.routingConstraints as {
            doNotRepeatQuestionsForSlots: string[];
          }
        ).doNotRepeatQuestionsForSlots,
      ).toEqual(expect.not.arrayContaining(['geo_area', 'intensity']));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
