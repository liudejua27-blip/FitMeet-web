import { SocialAgentBrainService } from './social-agent-brain.service';
import { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';

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

  it('keeps explicit immediate search commands on Social Search even with profile facts', () => {
    const decision = service.reviewTurn({
      message: '我是青岛大学男生，周末下午喜欢跑步，现在帮我找同校跑步搭子',
      route: route({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      }),
    });

    expect(decision.route.intent).toBe('social_search');
    expect(decision.route.shouldSearch).toBe(true);
    expect(decision.conversationMode).toBe('search');
    expect(decision.notes).not.toContain('rich_profile_facts_detected');
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

  it('keeps social target repair in search mode when an active task exists', () => {
    const decision = service.reviewTurn({
      message: '我说的是找个女生舞蹈生散步，你到底懂没懂我的意思',
      route: route({
        intent: 'correction_or_clarification',
        shouldSearch: false,
        replyStrategy: 'conversational_answer',
      }),
      taskContext: { hasSearchContext: true, hasCandidates: true },
    });

    expect(decision.route).toMatchObject({
      intent: 'candidate_followup',
      shouldSearch: true,
      shouldReplan: true,
      replyStrategy: 'search_candidates',
    });
    expect(decision.conversationMode).toBe('search');
    expect(decision.shouldExecuteTool).toBe(true);
    expect(decision.notes).toEqual(
      expect.arrayContaining(['social_search_repair_detected']),
    );
  });

  it('treats candidate follow-up as a search turn, not a generic answer', () => {
    const decision = service.reviewTurn({
      message: '只看青岛大学附近的女生，最好有舞蹈相关标签',
      route: route({
        intent: 'candidate_followup',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      taskContext: { hasSearchContext: true, hasCandidates: true },
    });

    expect(decision.conversationMode).toBe('search');
    expect(decision.route.shouldSearch).toBe(true);
    expect(decision.route.replyStrategy).toBe('search_candidates');
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

  it('asks for the target instead of executing action requests without candidate context', () => {
    const decision = service.reviewTurn({
      message: '帮我发给这个人',
      route: route({
        intent: 'action_request',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      }),
      taskContext: {
        hasCandidates: false,
        hasSearchContext: false,
        candidateCount: 0,
      },
    });

    expect(decision.route).toMatchObject({
      intent: 'action_request',
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'ask_clarifying_question',
    });
    expect(decision.conversationMode).toBe('clarify');
    expect(decision.shouldExecuteTool).toBe(false);
    expect(decision.notes).toEqual(
      expect.arrayContaining(['action_context_missing']),
    );
  });

  it('uses DeepSeek JSON plan when available and keeps tools behind whitelist', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
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
        conversationHistory: Array.from({ length: 85 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `turn-${index + 1}`,
        })),
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
      expect(body.model).toBe('deepseek-v4-pro');
      const messages = body.messages as Array<Record<string, unknown>>;
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.conversationHistory).toHaveLength(80);
      expect(userPayload.conversationHistory).toEqual(
        expect.arrayContaining([expect.objectContaining({ text: 'turn-6' })]),
      );
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

  it('clamps DeepSeek planner social-search misclassification for ordinary chat', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
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
                reason:
                  'The model incorrectly interpreted a product question as search.',
                shouldCallTool: true,
                tools: [
                  {
                    name: 'search_real_candidates',
                    arguments: { city: '青岛' },
                  },
                ],
                needUserConfirmation: false,
                responseGoal: 'Search candidates.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '你有什么功能？我先了解一下。',
        route: route({
          intent: 'product_help',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
      });

      expect(decision.plannerSource).toBe('deepseek');
      expect(decision.route).toMatchObject({
        intent: 'product_help',
        shouldSearch: false,
        shouldExecuteAction: false,
        replyStrategy: 'conversational_answer',
      });
      expect(decision.conversationMode).toBe('answer');
      expect(decision.shouldExecuteTool).toBe(false);
      expect(decision.tools).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('clamps DeepSeek planner action requests when no executable context exists', async () => {
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          userIntent: 'action_request',
          reason: 'The model incorrectly tried to send a message.',
          shouldCallTool: true,
          tools: [
            {
              name: 'send_message_to_candidate',
              arguments: { content: '你好，想一起散步吗？' },
            },
          ],
          needUserConfirmation: true,
          responseGoal: 'Ask for confirmation before sending.',
        }),
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    };
    const plannedService = new SocialAgentBrainService(
      config as never,
      undefined,
      undefined,
      deepSeek as never,
    );

    const decision = await plannedService.planTurn({
      message: '帮我发给这个人',
      route: route({
        intent: 'action_request',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      }),
      taskContext: {
        hasCandidates: false,
        hasSearchContext: false,
        candidateCount: 0,
      },
    });

    expect(decision.plannerSource).toBe('deepseek');
    expect(decision.route).toMatchObject({
      intent: 'unknown',
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
    expect(decision.conversationMode).toBe('clarify');
    expect(decision.shouldExecuteTool).toBe(false);
    expect(decision.tools).toEqual([]);
  });

  it('skips DeepSeek brain planning for hydrated social search continuation by default', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn() as never;
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          userIntent: 'social_search',
          shouldCallTool: true,
          tools: [{ name: 'search_real_candidates', arguments: {} }],
        }),
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        return undefined;
      }),
    };

    try {
      const plannedService = new SocialAgentBrainService(
        config as never,
        undefined,
        undefined,
        deepSeek as never,
      );
      const decision = await plannedService.planTurn({
        message: '可以，继续帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
        taskContext: {
          taskId: 91,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(deepSeek.complete).not.toHaveBeenCalled();
      expect(decision).toMatchObject({
        plannerSource: 'rules',
        conversationMode: 'search',
        shouldExecuteTool: true,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses the unified DeepSeek client for brain planning when injected', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn() as never;
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          userIntent: 'social_search',
          reason: 'Continue the candidate search with known task slots.',
          shouldCallTool: true,
          tools: [
            {
              name: 'search_real_candidates',
              arguments: {
                activity: '散步',
                timeWindow: '今天晚上',
                location: '青岛大学附近',
              },
            },
          ],
          needUserConfirmation: false,
          responseGoal: 'Search candidates without repeating completed slots.',
        }),
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT') return '8';
        if (key === 'SOCIAL_AGENT_BRAIN_RETRY_ATTEMPTS') return '2';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };

    try {
      const signal = new AbortController().signal;
      const plannedService = new SocialAgentBrainService(
        config as never,
        undefined,
        undefined,
        deepSeek as never,
      );
      const decision = await plannedService.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
        taskContext: {
          taskId: 91,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            geo_area: { value: '崂山区', state: 'inferred' },
            intensity: { value: '低强度', state: 'inferred' },
          },
        },
        conversationHistory: Array.from({ length: 95 }, (_, index) => ({
          role: index % 2 === 0 ? 'user' : 'assistant',
          text: `history-${index + 1}`,
        })),
        signal,
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(deepSeek.complete).toHaveBeenCalledTimes(1);
      expect(decision).toMatchObject({
        plannerSource: 'deepseek',
        conversationMode: 'search',
        shouldExecuteTool: true,
      });
      const payload = deepSeek.complete.mock.calls[0]?.[0] as {
        useCase: string;
        taskId: number;
        responseFormat?: { type: string };
        retryAttempts?: number;
        signal?: AbortSignal | null;
        messages: Array<Record<string, unknown>>;
      };
      expect(payload).toMatchObject({
        useCase: 'brain',
        taskId: 91,
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
        geo_area: '崂山区',
        intensity: '低强度',
      });
      expect(userPayload.plannerConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        knownContextSlots: expect.arrayContaining(['geo_area', 'intensity']),
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
        ]),
        inferredSlotsAreContextOnly: true,
      });
      expect(
        (
          userPayload.plannerConstraints as {
            doNotRepeatQuestionsForSlots: string[];
          }
        ).doNotRepeatQuestionsForSlots,
      ).toEqual(expect.not.arrayContaining(['geo_area', 'intensity']));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('caches repeated brain planner output for identical context', async () => {
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          userIntent: 'social_search',
          reason: 'Continue search from completed slots.',
          shouldCallTool: true,
          tools: [
            {
              name: 'search_real_candidates',
              arguments: {
                activity: '散步',
                timeWindow: '今天晚上',
                location: '青岛大学附近',
              },
            },
          ],
          needUserConfirmation: false,
          responseGoal: 'Search candidates without repeating completed slots.',
        }),
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_BRAIN_PLANNER_CACHE_TTL_MS') return '60000';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };
    const cache = new SocialAgentLlmOutputCacheService();
    const plannedService = new SocialAgentBrainService(
      config as never,
      undefined,
      undefined,
      deepSeek as never,
      cache,
    );
    const input = {
      message: '可以，帮我找人',
      route: route({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      }),
      taskContext: {
        taskId: 91,
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      conversationHistory: [
        { role: 'user', text: '我想在青岛大学附近散步' },
        { role: 'assistant', text: '我已经记录时间、地点和活动。' },
      ],
    };

    await expect(plannedService.planTurn(input)).resolves.toMatchObject({
      plannerSource: 'deepseek',
      conversationMode: 'search',
      shouldExecuteTool: true,
    });
    await expect(plannedService.planTurn(input)).resolves.toMatchObject({
      plannerSource: 'deepseek',
      conversationMode: 'search',
      shouldExecuteTool: true,
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
    });
  });

  it('uses a local brain planner exact cache when no shared cache is injected', async () => {
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          userIntent: 'social_search',
          reason: 'Continue search from completed slots.',
          shouldCallTool: true,
          tools: [
            {
              name: 'search_real_candidates',
              arguments: {
                activity: '散步',
                timeWindow: '今天晚上',
                location: '青岛大学附近',
              },
            },
          ],
          needUserConfirmation: false,
          responseGoal: 'Search candidates without repeating completed slots.',
        }),
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_BRAIN_PLANNER_CACHE_TTL_MS') return '60000';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };
    const plannedService = new SocialAgentBrainService(
      config as never,
      undefined,
      undefined,
      deepSeek as never,
    );
    const input = {
      message: '可以，帮我找人',
      route: route({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      }),
      taskContext: {
        taskId: 91,
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
      conversationHistory: [
        { role: 'user', text: '我想在青岛大学附近散步' },
        { role: 'assistant', text: '我已经记录时间、地点和活动。' },
      ],
    };

    await expect(plannedService.planTurn(input)).resolves.toMatchObject({
      plannerSource: 'deepseek',
      conversationMode: 'search',
      shouldExecuteTool: true,
    });
    await expect(plannedService.planTurn(input)).resolves.toMatchObject({
      plannerSource: 'deepseek',
      conversationMode: 'search',
      shouldExecuteTool: true,
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(1);
  });

  it('does not convert a client-aborted brain planning run into a rule fallback', async () => {
    const service = new SocialAgentBrainService(
      {
        get: jest.fn((key: string) =>
          key === 'DEEPSEEK_API_KEY' ? 'test-key' : undefined,
        ),
      } as never,
      undefined,
      undefined,
      {
        complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
      } as never,
    );

    await expect(
      service.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
      }),
    ).rejects.toThrow('client_aborted');
  });

  it('retries shared DeepSeek brain JSON formatting failures before falling back to rules', async () => {
    const deepSeek = {
      complete: jest
        .fn()
        .mockResolvedValueOnce('not-json')
        .mockResolvedValueOnce(
          JSON.stringify({
            userIntent: 'social_search',
            reason:
              'Known slots are complete and the user asked to continue candidate discovery.',
            shouldCallTool: true,
            tools: [
              {
                name: 'search_real_candidates',
                arguments: {
                  activity: '散步',
                  timeWindow: '今天晚上',
                  location: '青岛大学附近',
                },
              },
            ],
            needUserConfirmation: false,
            responseGoal: 'Search candidates without repeating known slots.',
          }),
        ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_BRAIN_RETRY_ATTEMPTS') return '2';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };
    const plannedService = new SocialAgentBrainService(
      config as never,
      undefined,
      undefined,
      deepSeek as never,
    );

    const decision = await plannedService.planTurn({
      message: '可以，帮我找人',
      route: route({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      }),
      taskContext: {
        taskId: 91,
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(2);
    expect(deepSeek.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ retryAttempts: 2 }),
    );
    expect(decision).toMatchObject({
      plannerSource: 'deepseek',
      conversationMode: 'search',
      shouldExecuteTool: true,
    });
    expect(decision.tools).toEqual([
      expect.objectContaining({ name: 'search_real_candidates' }),
    ]);
  });

  it('preserves a validated social search route when DeepSeek brain planning fails', async () => {
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('network down')),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_BRAIN_RETRY_ATTEMPTS') return '1';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };
    const plannedService = new SocialAgentBrainService(
      config as never,
      undefined,
      undefined,
      deepSeek as never,
    );

    const decision = await plannedService.planTurn({
      message: '可以，帮我找人',
      route: route({
        intent: 'social_search',
        shouldSearch: true,
        replyStrategy: 'search_candidates',
      }),
      taskContext: {
        taskId: 91,
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
        },
      },
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(1);
    expect(decision).toMatchObject({
      plannerSource: 'rules',
      conversationMode: 'search',
      shouldExecuteTool: true,
      shouldAskClarifyingQuestion: false,
      reason: expect.stringContaining('validated social search route'),
      responseGoal: expect.stringContaining('不要重复追问已完成字段'),
    });
    expect(decision.route).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    });
    expect(decision.notes).toEqual(
      expect.arrayContaining([
        'llm_planner_degraded',
        'llm_planner_degraded:network down',
        'rules_fallback_preserved_for_search',
      ]),
    );
  });

  it('preserves explicit action routes behind approval when DeepSeek brain planning fails', async () => {
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('network down')),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_BRAIN_RETRY_ATTEMPTS') return '1';
        return undefined;
      }),
    };
    const plannedService = new SocialAgentBrainService(
      config as never,
      undefined,
      undefined,
      deepSeek as never,
    );

    const decision = await plannedService.planTurn({
      message: '帮我给刚才那个候选人发邀请',
      route: route({
        intent: 'action_request',
        shouldSearch: false,
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      }),
      taskContext: {
        hasCandidates: true,
        hasSearchContext: true,
        candidateCount: 1,
      },
    });

    expect(decision).toMatchObject({
      plannerSource: 'rules',
      conversationMode: 'action',
      shouldExecuteTool: true,
      shouldAskClarifyingQuestion: true,
      needUserConfirmation: true,
      reason: expect.stringContaining('kept it behind approval'),
      responseGoal: expect.stringContaining('确认前不得发送邀请'),
    });
    expect(decision.route).toMatchObject({
      intent: 'action_request',
      shouldSearch: false,
      shouldExecuteAction: true,
      replyStrategy: 'execute_action',
    });
    expect(decision.notes).toEqual(
      expect.arrayContaining([
        'llm_planner_degraded',
        'llm_planner_degraded:network down',
        'rules_fallback_preserved_for_approval_action',
      ]),
    );
  });

  it('retries a transient DeepSeek brain planner failure before using rule fallback', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  userIntent: 'social_search',
                  reason:
                    'User has a complete walking request and wants candidate discovery.',
                  shouldCallTool: true,
                  tools: [
                    {
                      name: 'search_real_candidates',
                      arguments: {
                        city: '青岛',
                        location: '青岛大学',
                        timeWindow: '今天晚上',
                        activity: '散步',
                        candidatePreference: '女生、舞蹈相关',
                      },
                    },
                  ],
                  needUserConfirmation: false,
                  responseGoal:
                    'Search candidates without repeating known slots.',
                }),
              },
            },
          ],
        }),
      } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '我想在青岛大学，今天晚上，找个女舞蹈生散步。',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(decision.plannerSource).toBe('deepseek');
      expect(decision.conversationMode).toBe('search');
      expect(decision.shouldExecuteTool).toBe(true);
      expect(decision.tools).toEqual([
        expect.objectContaining({
          name: 'search_real_candidates',
          arguments: expect.objectContaining({
            location: '青岛大学',
            timeWindow: '今天晚上',
            activity: '散步',
            candidatePreference: '女生、舞蹈相关',
          }),
        }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('retries a DeepSeek brain planner timeout before degrading to rules', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_RETRY_ATTEMPTS') return '2';
        if (key === 'SOCIAL_AGENT_PLANNER_TIMEOUT_MS') return '2500';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
        return undefined;
      }),
    };
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
                  userIntent: 'social_search',
                  reason:
                    'Known slots are complete and the user asked to continue candidate discovery.',
                  shouldCallTool: true,
                  tools: [
                    {
                      name: 'search_real_candidates',
                      arguments: {
                        activity: '散步',
                        timeWindow: '今天晚上',
                        location: '青岛大学附近',
                      },
                    },
                  ],
                  needUserConfirmation: false,
                  responseGoal:
                    'Search candidates without repeating known slots.',
                }),
              },
            },
          ],
        }),
      } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
        taskContext: {
          taskId: 91,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(decision).toMatchObject({
        plannerSource: 'deepseek',
        conversationMode: 'search',
        shouldExecuteTool: true,
      });
      expect(decision.notes).toEqual(
        expect.arrayContaining(['llm_planner_used']),
      );
      expect(decision.tools).toEqual([
        expect.objectContaining({ name: 'search_real_candidates' }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not let stale legacy planner disable flags bypass DeepSeek', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_LLM_PLANNER') return 'false';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
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
                reason: 'Known context requires candidate search.',
                shouldCallTool: true,
                tools: [
                  {
                    name: 'search_real_candidates',
                    arguments: {
                      activity: '散步',
                      timeWindow: '今天晚上',
                      location: '青岛大学附近',
                    },
                  },
                ],
                needUserConfirmation: false,
                responseGoal: 'Search from known slots.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
        taskContext: {
          taskId: 91,
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(decision).toMatchObject({
        plannerSource: 'deepseek',
        conversationMode: 'search',
        shouldExecuteTool: true,
      });
      expect(decision.notes).toEqual(
        expect.arrayContaining(['llm_planner_used']),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('allows an explicit rules-only runtime to bypass the DeepSeek brain planner', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'SOCIAL_AGENT_MODEL_ROUTING_MODE') return 'rules_only';
        return undefined;
      }),
    };
    global.fetch = jest.fn() as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(decision).toMatchObject({
        plannerSource: 'rules',
        conversationMode: 'search',
        shouldExecuteTool: true,
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('prevents sub-production context windows while honoring production planner timeout budgets', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT') return '50';
        if (key === 'SOCIAL_AGENT_PLANNER_TIMEOUT_MS') return '2500';
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
                intent: 'casual_chat',
                reason: 'Answer from context.',
                state: 'answer',
                shouldCallTools: false,
                toolCalls: [],
                needUserConfirmation: false,
                responseGoal: 'Answer directly.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      await plannedService.planTurn({
        message: '继续刚才的话题',
        route: route({ intent: 'casual_chat' }),
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
      expect(
        (
          plannedService as unknown as {
            plannerTimeoutMs: (useCase?: 'planner') => number;
          }
        ).plannerTimeoutMs('planner'),
      ).toBe(25000);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('does not let fast routing mode downgrade the local brain planner fallback model', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_MODEL_ROUTING_MODE') return 'fast';
        if (key === 'DEEPSEEK_FAST_MODEL') return 'deepseek-v4-flash';
        if (key === 'DEEPSEEK_MODEL') return 'deepseek-v4-flash';
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
                intent: 'casual_chat',
                reason: 'Answer from quality planner.',
                state: 'answer',
                shouldCallTools: false,
                toolCalls: [],
                needUserConfirmation: false,
                responseGoal: 'Answer directly.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      await plannedService.planTurn({
        message: '继续刚才的话题',
        route: route({ intent: 'casual_chat' }),
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

  it('sends completed task slots as hard constraints to the DeepSeek planner', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
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
                intent: 'social_search',
                reason:
                  'User asked to continue candidate search using completed slots.',
                state: 'searching',
                shouldCallTools: true,
                toolCalls: [
                  {
                    name: 'search_real_candidates',
                    arguments: {
                      activity: '散步',
                      timeWindow: '今天晚上',
                      location: '青岛大学附近',
                    },
                  },
                ],
                needUserConfirmation: false,
                responseGoal: 'Search without repeating completed fields.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
        taskContext: {
          candidateActions: {
            'candidate-42': {
              status: 'skipped',
              targetUserId: 42,
              reason: '用户明确说不合适',
            },
            'candidate-43': {
              status: 'saved',
              targetUserId: 43,
              reason: '舞蹈公开标签匹配',
            },
          },
          pendingApprovals: [
            {
              approvalId: 'approval-send-43',
              actionType: 'send_invite',
              targetUserId: 43,
              state: 'waiting',
            },
          ],
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            candidate_preference: {
              value: '女生，舞蹈相关公开标签优先',
              state: 'answered',
            },
            safety_boundary: {
              value: '第一次见面只接受公共场所',
              state: 'completed',
            },
          },
        },
      });

      expect(decision.plannerSource).toBe('deepseek');
      const request = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
        body?: string;
      };
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      const messages = body.messages as Array<Record<string, unknown>>;
      expect(String(messages[0].content)).toContain(
        '只有 plannerConstraints.doNotRepeatQuestionsForSlots',
      );
      expect(String(messages[0].content)).toContain(
        'taskContext.candidateActions/candidateState',
      );
      expect(String(messages[0].content)).toContain(
        'taskContext.pendingApprovals/pendingActions',
      );
      const userPayload = JSON.parse(String(messages[1].content)) as Record<
        string,
        unknown
      >;
      expect(userPayload.taskContext).toMatchObject({
        candidateActions: {
          'candidate-42': {
            status: 'skipped',
            targetUserId: 42,
          },
          'candidate-43': {
            status: 'saved',
            targetUserId: 43,
          },
        },
        pendingApprovals: [
          {
            approvalId: 'approval-send-43',
            actionType: 'send_invite',
            targetUserId: 43,
          },
        ],
      });
      expect(userPayload.knownTaskSlots).toMatchObject({
        activity: '散步',
        time_window: '今天晚上',
        location_text: '青岛大学附近',
        candidate_preference: '女生，舞蹈相关公开标签优先',
        safety_boundary: '第一次见面只接受公共场所',
      });
      expect(userPayload.plannerConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        candidatePreferenceScope:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      });
      expect(
        (
          userPayload.plannerConstraints as {
            doNotRepeatQuestionsForSlots?: string[];
          }
        ).doNotRepeatQuestionsForSlots,
      ).toEqual(
        expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
          'safety_boundary',
        ]),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('hydrates planner memory from known slot constraints when raw task slots are absent', async () => {
    const originalFetch = global.fetch;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'DEEPSEEK_API_KEY') return 'test-key';
        if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
        if (key === 'SOCIAL_AGENT_BRAIN_WORKFLOW_SHORTCUTS') return 'false';
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
                reason:
                  'Known slot constraints are enough to continue candidate search.',
                shouldCallTool: true,
                tools: [
                  {
                    name: 'search_real_candidates',
                    arguments: {
                      activity: '散步',
                      timeWindow: '今天晚上',
                      location: '青岛大学附近',
                      candidatePreference: '舞蹈相关公开标签优先',
                    },
                  },
                ],
                needUserConfirmation: false,
                responseGoal:
                  'Continue search without asking known slots again.',
              }),
            },
          },
        ],
      }),
    } as never) as never;

    try {
      const plannedService = new SocialAgentBrainService(config as never);
      const decision = await plannedService.planTurn({
        message: '可以，帮我找人',
        route: route({
          intent: 'social_search',
          shouldSearch: true,
          replyStrategy: 'search_candidates',
        }),
        taskContext: {
          taskMemory: {
            knownTaskSlotConstraints: {
              treatAsHardConstraints: true,
              knownSlots: [
                { key: 'activity', label: '活动', value: '散步' },
                { key: 'time_window', label: '时间', value: '今天晚上' },
                {
                  key: 'location_text',
                  label: '地点',
                  value: '青岛大学附近',
                },
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
              instruction: '不得重复询问已知字段。',
            },
          },
        },
      });

      expect(decision).toMatchObject({
        plannerSource: 'deepseek',
        conversationMode: 'search',
        shouldExecuteTool: true,
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
        candidate_preference: '公开资料里有舞蹈相关标签的女生',
      });
      expect(userPayload.plannerConstraints).toMatchObject({
        treatKnownTaskSlotsAsAnswered: true,
        doNotRepeatQuestionsForSlots: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
      });
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
