import { ConfigService } from '@nestjs/config';

import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';
import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import { SocialAgentPlannerService } from './social-agent-planner.service';

const taskRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn().mockResolvedValue({}),
});

const eventRepo = () => ({
  create: jest.fn((input) => input),
  save: jest.fn().mockResolvedValue({}),
});

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 10,
    ownerUserId: 1,
    agentConnectionId: 2,
    taskType: 'social_goal',
    title: 'Find a running buddy',
    goal: '帮我找一个周末跑步搭子',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    permissionMode: AgentTaskPermissionMode.Confirm,
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

function serviceWith(
  config: ConfigService,
  deepSeek?: { complete: jest.Mock },
  contextHydrator?: { hydrateContext: jest.Mock },
  llmOutputCache?: SocialAgentLlmOutputCacheService,
) {
  const tasks = taskRepo();
  const events = eventRepo();
  const service = new SocialAgentPlannerService(
    tasks as never,
    events as never,
    config,
    new AgentPermissionService(),
    new FitMeetAgentToolRegistryService(),
    undefined,
    deepSeek as never,
    contextHydrator as never,
    llmOutputCache,
  );
  return { service, tasks, events };
}

describe('SocialAgentPlannerService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('clamps stale low DeepSeek planner timeout configs to the release-quality budget', () => {
    const { service } = serviceWith(
      makeConfig({
        SOCIAL_AGENT_PLANNER_TIMEOUT_MS: '2500',
      }),
    );

    expect(
      (
        service as unknown as {
          deepSeekTimeoutMs: (useCase?: 'planner') => number;
        }
      ).deepSeekTimeoutMs('planner'),
    ).toBe(25000);
  });

  it('calls DeepSeek, keeps social actions for risk gating, writes task plan and event', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  { id: 'blocked', action: 'payment', title: 'Pay' },
                  {
                    id: 'allowed',
                    action: 'send_message',
                    title: 'Say hello',
                    input: { text: 'hi' },
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks, events } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Assist }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('deepseek');
    expect(
      JSON.parse(
        ((global.fetch as jest.Mock).mock.calls[0]?.[1] as { body?: string })
          .body ?? '{}',
      ).model,
    ).toBe('deepseek-v4-pro');
    expect(result.plan).toHaveLength(2);
    expect(result.plan[0]).toMatchObject({
      id: 'blocked',
      action: SocialAgentAction.Payment,
      status: 'planned',
      requiresUserConfirmation: true,
    });
    expect(result.plan[1]).toMatchObject({
      id: 'allowed',
      action: SocialAgentAction.SendMessage,
      status: 'planned',
      requiresUserConfirmation: true,
    });
    expect(tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, plan: result.plan }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 10,
        ownerUserId: 1,
        eventType: AgentTaskEventType.PlanGenerated,
        actor: AgentTaskEventActor.Agent,
        payload: expect.objectContaining({
          source: 'deepseek',
          permissionMode: AgentTaskPermissionMode.Assist,
          stepCount: 2,
        }),
      }),
    );
    expect(events.save).toHaveBeenCalledTimes(1);
  });

  it('uses the shared DeepSeek client when available so planner follows the same quality runtime policy', async () => {
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          steps: [
            {
              id: 'search',
              action: 'search_profiles',
              title: 'Search public candidates',
            },
          ],
        }),
      ),
    };

    const { service, tasks } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_PLANNER_RETRY_ATTEMPTS: '3',
      }),
      deepSeek,
    );
    tasks.findOne.mockResolvedValue(makeTask());
    const signal = new AbortController().signal;

    const result = await service.planTask(10, { signal });

    expect(global.fetch).toBe(originalFetch);
    expect(deepSeek.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: 'planner',
        taskId: 10,
        intent: 'social_goal',
        fallbackTemperature: 0.15,
        responseFormat: { type: 'json_object' },
        retryAttempts: 3,
        signal,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
    );
    expect(result.source).toBe('deepseek');
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0]).toMatchObject({
      id: 'search',
      action: SocialAgentAction.SearchProfiles,
    });
  });

  it('caches repeated task planner output for identical task context', async () => {
    const deepSeek = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify({
          steps: [
            {
              id: 'search',
              action: 'search_profiles',
              title: 'Search public candidates',
            },
          ],
        }),
      ),
    };
    const cache = new SocialAgentLlmOutputCacheService();
    const { service, tasks } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_TASK_PLANNER_CACHE_TTL_MS: '60000',
      }),
      deepSeek,
      undefined,
      cache,
    );
    tasks.findOne.mockImplementation(() => Promise.resolve(makeTask()));

    await expect(service.planTask(10)).resolves.toMatchObject({
      source: 'deepseek',
      plan: [expect.objectContaining({ id: 'search' })],
    });
    await expect(service.planTask(10)).resolves.toMatchObject({
      source: 'deepseek',
      plan: [expect.objectContaining({ id: 'search' })],
    });

    expect(deepSeek.complete).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({
      hits: 1,
      misses: 1,
      writes: 1,
    });
  });

  it('does not convert a client-aborted planner run into a fallback plan', async () => {
    const deepSeek = {
      complete: jest.fn().mockRejectedValue(new Error('client_aborted')),
    };
    const { service, tasks, events } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
      deepSeek,
    );
    tasks.findOne.mockResolvedValue(makeTask());

    await expect(service.planTask(10)).rejects.toThrow('client_aborted');
    expect(events.save).not.toHaveBeenCalled();
  });

  it('does not let stale low context window config shorten DeepSeek planner memory', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'continue',
                    action: 'search_profiles',
                    title: 'Continue search',
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '30',
      }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({
        plan: Array.from({ length: 95 }, (_, index) => ({
          id: `plan-${index + 1}`,
          action: SocialAgentAction.SearchProfiles,
          status: 'planned',
          toolName: 'search_real_candidates',
        })),
        toolCalls: Array.from({ length: 95 }, (_, index) => ({
          id: `tool-${index + 1}`,
          stepId: `plan-${index + 1}`,
          toolName: 'search_real_candidates',
          status: 'done',
        })),
        memory: {
          brain: {
            turns: Array.from({ length: 95 }, (_, index) => ({
              role: index % 2 === 0 ? 'user' : 'assistant',
              text: `brain-${index + 1}`,
            })),
          },
        },
      } as never),
    );

    await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '继续刚才的约练任务',
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
    const brainMemory = userPayload.brainMemory as Record<string, unknown>;

    expect(userPayload.priorPlan).toHaveLength(80);
    expect(userPayload.priorPlan).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'plan-16' })]),
    );
    expect(userPayload.recentToolCalls).toHaveLength(80);
    expect(userPayload.recentToolCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'tool-16' })]),
    );
    expect(brainMemory.turns).toHaveLength(80);
    expect(brainMemory.turns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'brain-17' }),
        expect.objectContaining({ text: '继续刚才的约练任务' }),
      ]),
    );
    expect(brainMemory.previousPlanSummary).toHaveLength(80);
    expect(brainMemory.previousToolSummary).toHaveLength(80);
  });

  it('hydrates the legacy planner path with the same Social Codex context contract before calling DeepSeek', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'continue',
                    action: 'search_profiles',
                    title: 'Continue from saved context',
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);
    const recentMessages = Array.from({ length: 85 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      text:
        index === 44
          ? '可以，继续按今晚青岛大学散步和舞蹈公开标签找人'
          : `turn-${index + 1}`,
      at: `2026-06-17T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }));
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 1,
        threadId: 'agent-task:10',
        taskId: 10,
        recentMessages,
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          currentTask: {
            state: 'searching_candidates',
            nextStep: 'search_candidates',
            shouldSearchNow: true,
          },
          pendingActions: [{ action: 'publish_social_request' }],
          candidateState: { savedIds: [23], skippedIds: [29] },
        },
        taskSlots: {
          activity: { key: 'activity', value: '散步', state: 'completed' },
          time_window: {
            key: 'time_window',
            value: '今天晚上',
            state: 'completed',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'completed',
          },
          candidate_preference: {
            key: 'candidate_preference',
            value: '舞蹈相关公开标签优先',
            state: 'answered',
          },
        },
        taskSlotSummary: {
          活动: '散步',
          时间: '今天晚上',
          地点: '青岛大学附近',
          候选偏好: '舞蹈相关公开标签优先',
        },
        knownTaskSlotConstraints: {
          treatAsHardConstraints: true,
          knownSlots: [
            { key: 'activity', label: '活动', value: '散步' },
            { key: 'time_window', label: '时间', value: '今天晚上' },
            { key: 'location_text', label: '地点', value: '青岛大学附近' },
            {
              key: 'candidate_preference',
              label: '候选偏好',
              value: '舞蹈相关公开标签优先',
            },
          ],
          doNotAskAgainFor: [
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ],
          userVisibleSummary:
            '活动：散步；时间：今天晚上；地点：青岛大学附近；候选偏好：舞蹈相关公开标签优先',
          candidatePreferencePolicy:
            'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
          instruction:
            'planner/router/Brain/subagent 必须基于 knownSlots 继续推进；除非用户主动修改，否则不得重复询问 doNotAskAgainFor 中的字段。',
        },
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [
          '常在周末或晚上安排低强度散步',
        ],
        lifeGraphGovernanceSummary: {
          total: 1,
          autoSaveCount: 1,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
        lifeGraphSummary: {
          preferences: ['低强度散步'],
          boundaries: ['第一次见面优先公共场所'],
        },
        pendingApprovals: [{ action: 'publish_social_request' }],
        candidateActions: { savedIds: [23], skippedIds: [29] },
      }),
    };

    const { service, tasks } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '8',
      }),
      undefined,
      contextHydrator,
    );
    tasks.findOne.mockResolvedValue(
      makeTask({
        goal: '今晚青岛大学附近散步，优先舞蹈公开标签',
        memory: {
          taskSlots: {
            activity: { key: 'activity', value: '散步', state: 'completed' },
          },
        },
      } as never),
    );

    const result = await service.planTask(10);

    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 1,
      taskId: 10,
      threadId: 'agent-task:10',
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.source).toBe('workflow');
    expect(result.fallbackReason).toBeNull();
    expect(result.plan.map((step) => step.action)).toEqual([
      SocialAgentAction.SearchProfiles,
      SocialAgentAction.GenerateContent,
      SocialAgentAction.DraftMessage,
    ]);
    expect(result.plan[0]).toMatchObject({
      status: 'planned',
      requiresUserConfirmation: false,
      riskLevel: 'low',
      input: expect.objectContaining({
        taskSlotSummary: expect.objectContaining({
          活动: '散步',
          时间: '今天晚上',
          地点: '青岛大学附近',
          候选偏好: '舞蹈相关公开标签优先',
        }),
        knownTaskSlotConstraints: expect.objectContaining({
          treatAsHardConstraints: true,
          doNotAskAgainFor: expect.arrayContaining([
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ]),
        }),
        candidateActions: { savedIds: [23], skippedIds: [29] },
      }),
    });
  });

  it('does not let an empty hydrated planner context erase stored task memory', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'continue_search',
                    action: 'search_profiles',
                    title: 'Continue from stored slots',
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 1,
        threadId: 'agent-task:10',
        taskId: 10,
        recentMessages: [],
        taskMemory: {},
        taskSlots: {},
        taskSlotSummary: {},
        knownTaskSlotConstraints: {},
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {},
        lifeGraphSummary: {},
        pendingApprovals: [],
        candidateActions: {},
      }),
    };
    const { service, tasks } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
      undefined,
      contextHydrator,
    );
    tasks.findOne.mockResolvedValue(
      makeTask({
        goal: '今晚青岛大学附近散步，优先舞蹈相关公开标签',
        memory: {
          socialAgentConversation: {
            turns: [
              {
                role: 'user',
                text: '我想在青岛大学，今天晚上，找个女生散步，最好是舞蹈生。',
              },
              {
                role: 'assistant',
                text: '我会按公开可发现资料里的舞蹈相关标签优先筛选。',
              },
            ],
          },
          taskSlots: {
            activity: {
              key: 'activity',
              value: '散步',
              state: 'completed',
            },
            time_window: {
              key: 'time_window',
              value: '今天晚上',
              state: 'completed',
            },
            location_text: {
              key: 'location_text',
              value: '青岛大学附近',
              state: 'completed',
            },
            candidate_preference: {
              key: 'candidate_preference',
              value: '舞蹈相关公开标签优先',
              state: 'answered',
            },
          },
          taskSlotSummary: {
            活动: '散步',
            时间: '今天晚上',
            地点: '青岛大学附近',
            候选偏好: '舞蹈相关公开标签优先',
          },
          knownTaskSlotConstraints: {
            treatAsHardConstraints: true,
            doNotAskAgainFor: [
              'activity',
              'time_window',
              'location_text',
              'candidate_preference',
            ],
          },
          taskMemory: {
            currentGoal: '今晚青岛大学附近散步',
            currentTask: {
              nextStep: 'search_candidates',
              shouldSearchNow: true,
            },
            candidateState: {
              savedIds: [23],
            },
            pendingApprovals: [{ action: 'publish_social_request' }],
          },
        },
      } as never),
    );

    const result = await service.planTask(10);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.source).toBe('workflow');
    expect(result.plan.map((step) => step.action)).toEqual([
      SocialAgentAction.SearchProfiles,
      SocialAgentAction.GenerateContent,
      SocialAgentAction.DraftMessage,
    ]);
    expect(result.plan[0].input).toMatchObject({
      taskSlotSummary: expect.objectContaining({
        时间: '今天晚上',
        地点: '青岛大学附近',
        候选偏好: '舞蹈相关公开标签优先',
      }),
      knownTaskSlotConstraints: expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
      }),
      candidateActions: expect.objectContaining({
        savedIds: [23],
      }),
    });
  });

  it('passes the refreshed task goal and latest follow-up to DeepSeek instead of only the short user reply', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'search',
                    action: 'search_profiles',
                    title: 'Search public candidates',
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({
        goal: '今晚青岛大学附近散步',
        memory: {
          shortTerm: {
            currentGoal: '过期目标：周末下午跑步',
            latestUserFollowUp: '过期补充',
          },
        },
      } as never),
    );

    await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '可以，帮我找人',
      refreshedGoal:
        '原需求：今晚青岛大学附近散步\n用户补充：优先公开资料里有舞蹈相关标签的人',
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
    const brainMemory = userPayload.brainMemory as Record<string, unknown>;

    expect(userPayload.activeGoal).toContain('舞蹈相关标签');
    expect(brainMemory.currentGoal).toContain('舞蹈相关标签');
    expect(brainMemory.currentGoal).not.toContain('过期目标');
    expect(brainMemory.latestUserFollowUp).toBe('可以，帮我找人');
    expect(brainMemory.latestUserFollowUp).not.toBe('过期补充');
    expect(userPayload.replanningRules).toEqual(
      expect.arrayContaining([
        expect.stringContaining('latest user follow-up'),
        expect.stringContaining('strongest instruction'),
      ]),
    );
  });

  it('uses deterministic workflow planning when completed task slots already indicate candidate search', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'search',
                    action: 'search_profiles',
                    title: 'Search public candidates',
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({
        goal: '今晚青岛大学附近散步，优先舞蹈相关公开标签',
        memory: {
          taskSlots: {
            activity: {
              key: 'activity',
              value: '散步',
              state: 'completed',
              source: 'user_message',
              updatedAt: '2026-06-17T00:00:00.000Z',
              completedAt: '2026-06-17T00:00:00.000Z',
            },
            time_window: {
              key: 'time_window',
              value: '今天晚上',
              state: 'completed',
              source: 'user_message',
              updatedAt: '2026-06-17T00:00:00.000Z',
              completedAt: '2026-06-17T00:00:00.000Z',
            },
            location_text: {
              key: 'location_text',
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
              updatedAt: '2026-06-17T00:00:00.000Z',
              completedAt: '2026-06-17T00:00:00.000Z',
            },
            candidate_preference: {
              key: 'candidate_preference',
              value: '舞蹈相关公开标签优先',
              state: 'answered',
              source: 'user_message',
              updatedAt: '2026-06-17T00:00:00.000Z',
            },
          },
          taskSlotSummary: {
            活动: '散步',
            时间: '今天晚上',
            地点: '青岛大学附近',
            候选偏好: '舞蹈相关公开标签优先',
          },
          taskMemory: {
            currentGoal: '今晚青岛大学附近散步',
            currentTask: {
              state: 'searching_candidates',
              objective: 'social_match',
              nextStep: 'search_candidates',
              shouldSearchNow: true,
              clarificationAskedFields: ['activity', 'time_window'],
            },
            candidateState: {
              savedIds: [23],
              rejectedIds: [29],
            },
          },
        },
      } as never),
    );

    const result = await service.planTask(10);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.source).toBe('workflow');
    expect(result.fallbackReason).toBeNull();
    expect(result.plan.map((step) => step.action)).toEqual([
      SocialAgentAction.SearchProfiles,
      SocialAgentAction.GenerateContent,
      SocialAgentAction.DraftMessage,
    ]);
    expect(result.plan.every((step) => !step.requiresUserConfirmation)).toBe(
      true,
    );
    expect(result.plan[0].input).toMatchObject({
      goal: '今晚青岛大学附近散步，优先舞蹈相关公开标签',
      taskSlotSummary: {
        活动: '散步',
        时间: '今天晚上',
        地点: '青岛大学附近',
        候选偏好: '舞蹈相关公开标签优先',
      },
      candidateActions: expect.objectContaining({
        savedIds: [23],
        rejectedIds: [29],
      }),
    });
  });

  it('defers tool execution when DeepSeek returns an invalid JSON plan', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'not-json' } }],
      }),
    } as never);

    const { service, tasks, events } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockImplementation(() =>
      Promise.resolve(
        makeTask({ permissionMode: AgentTaskPermissionMode.Confirm }),
      ),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('deepseek_json_parse_failed');
    expect(result.plan).toEqual([
      expect.objectContaining({
        action: SocialAgentAction.GenerateContent,
        status: 'skipped',
        input: expect.objectContaining({
          executionDeferred: true,
          recoveryMessage: expect.stringContaining('已保留上下文'),
        }),
        rationale: expect.stringContaining(
          'context was preserved instead of executing deterministic tools',
        ),
      }),
    ]);
    expect(result.plan.map((step) => step.action)).not.toEqual(
      expect.arrayContaining([
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.FavoriteCandidate,
        SocialAgentAction.WriteInbox,
        SocialAgentAction.SendMessage,
        SocialAgentAction.SendInvite,
        SocialAgentAction.AddFriend,
        SocialAgentAction.OfflineMeet,
        SocialAgentAction.Payment,
      ]),
    );
    expect(
      result.plan.every((step) => result.allowedActions.includes(step.action)),
    ).toBe(true);
    expect(tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          brain: expect.objectContaining({
            lastPlanSource: 'fallback',
            lastPlanReason: 'initial',
          }),
        }),
      }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.PlanGenerated,
        payload: expect.objectContaining({
          source: 'fallback',
          fallbackReason: 'deepseek_json_parse_failed',
          reason: 'initial',
        }),
      }),
    );
  });

  it('does not resurrect filtered model actions through deterministic fallback', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'unsafe_or_unknown',
                    action: 'publish_precise_location',
                    title: 'Publish precise location',
                    input: { location: '青岛大学某具体宿舍楼' },
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks, events } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({
        permissionMode: AgentTaskPermissionMode.Confirm,
        goal: '今晚青岛大学附近找女生散步，最好舞蹈生',
      }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe(
      'deepseek_plan_empty_after_permission_filter',
    );
    expect(result.plan).toEqual([
      expect.objectContaining({
        action: SocialAgentAction.GenerateContent,
        status: 'skipped',
        input: expect.objectContaining({
          executionDeferred: true,
          recoveryMessage: expect.stringContaining('已保留上下文'),
        }),
        rationale: expect.stringContaining(
          'context was preserved instead of executing deterministic tools',
        ),
      }),
    ]);
    expect(result.plan.map((step) => step.action)).not.toEqual(
      expect.arrayContaining([
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.SendMessage,
        SocialAgentAction.SendInvite,
        SocialAgentAction.AddFriend,
        SocialAgentAction.OfflineMeet,
        SocialAgentAction.Payment,
      ]),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.PlanGenerated,
        payload: expect.objectContaining({
          source: 'fallback',
          fallbackReason: 'deepseek_plan_empty_after_permission_filter',
        }),
      }),
    );
  });

  it('does not treat non-search-only slots as candidate search context in model fallback mode', async () => {
    const { service, tasks } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        taskType: 'profile_enrichment',
        title: '完善安全边界',
        goal: '第一次见面只接受公共场所，先在平台内沟通',
        memory: {
          taskSlots: {
            safety_boundary: {
              key: 'safety_boundary',
              value: '首次见面优先公共场所，先在平台内沟通',
              state: 'answered',
              source: 'user_message',
              updatedAt: '2026-06-17T00:00:00.000Z',
            },
          },
          taskSlotSummary: {
            安全边界: '首次见面优先公共场所，先在平台内沟通',
          },
        },
      }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('DEEPSEEK_API_KEY missing');
    expect(result.plan.map((step) => step.action)).not.toContain(
      SocialAgentAction.SearchProfiles,
    );
    expect(result.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: SocialAgentAction.GenerateContent }),
        expect.objectContaining({ action: SocialAgentAction.DraftMessage }),
      ]),
    );
  });

  it('does not let stale search task memory trigger model fallback search for an ordinary follow-up', async () => {
    const { service, tasks } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        goal: '帮我找周末跑步搭子',
        memory: {
          taskMemory: {
            currentTask: {
              objective: 'search',
              nextStep: 'search_candidates',
              shouldSearchNow: true,
              state: 'searching_candidates',
            },
          },
        },
      }),
    );

    const result = await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '你先介绍一下 FitMeet 有哪些功能？',
    });

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('DEEPSEEK_API_KEY missing');
    expect(result.plan.map((step) => step.action)).not.toContain(
      SocialAgentAction.SearchProfiles,
    );
    expect(result.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: SocialAgentAction.GenerateContent }),
        expect.objectContaining({ action: SocialAgentAction.DraftMessage }),
      ]),
    );
  });

  it('keeps model fallback search when the latest follow-up explicitly continues candidate search', async () => {
    const { service, tasks } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        goal: '帮我找周末跑步搭子',
        memory: {
          taskMemory: {
            currentTask: {
              objective: 'search',
              nextStep: 'search_candidates',
              shouldSearchNow: true,
              state: 'searching_candidates',
            },
          },
        },
      }),
    );

    const result = await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '可以，继续帮我找人',
    });

    expect(result.source).toBe('workflow');
    expect(result.fallbackReason).toBeNull();
    expect(result.plan.map((step) => step.action)).toEqual(
      expect.arrayContaining([
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.GenerateContent,
        SocialAgentAction.DraftMessage,
      ]),
    );
  });

  it('retries transient planner JSON formatting failures before falling back', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'not-json' } }],
        }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  steps: [
                    {
                      id: 'search',
                      action: 'search_profiles',
                      title: 'Search public candidates',
                      input: { activity: '散步' },
                    },
                  ],
                }),
              },
            },
          ],
        }),
      } as never);

    const cache = new SocialAgentLlmOutputCacheService();
    const { service, tasks } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_PLANNER_RETRY_ATTEMPTS: '2',
        SOCIAL_AGENT_TASK_PLANNER_CACHE_TTL_MS: '60000',
      }),
      undefined,
      undefined,
      cache,
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Confirm }),
    );

    const result = await service.planTask(10);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('deepseek');
    expect(result.fallbackReason).toBeNull();
    expect(result.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: SocialAgentAction.SearchProfiles,
          input: expect.objectContaining({ activity: '散步' }),
        }),
      ]),
    );
    expect(cache.stats()).toMatchObject({
      misses: 2,
      writes: 1,
      size: 1,
    });
  });

  it('keeps outbound DeepSeek plan steps approval-gated even in limited auto mode', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                steps: [
                  {
                    id: 'draft',
                    action: 'draft_message',
                    title: 'Draft opener',
                    requiresUserConfirmation: false,
                  },
                  {
                    id: 'send',
                    action: 'send_message',
                    title: 'Send opener',
                    requiresUserConfirmation: false,
                  },
                  {
                    id: 'meet',
                    action: 'offline_meet',
                    title: 'Arrange meet',
                    requiresUserConfirmation: false,
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as never);

    const { service, tasks } = serviceWith(
      makeConfig({ DEEPSEEK_API_KEY: 'key' }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.LimitedAuto }),
    );

    const result = await service.planTask(10);

    expect(result.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: SocialAgentAction.DraftMessage,
          requiresUserConfirmation: false,
        }),
        expect.objectContaining({
          action: SocialAgentAction.SendMessage,
          requiresUserConfirmation: true,
        }),
        expect.objectContaining({
          action: SocialAgentAction.OfflineMeet,
          requiresUserConfirmation: true,
        }),
      ]),
    );
  });

  it('defers deterministic tools and writes a timeout event when DeepSeek planning aborts', async () => {
    const abortError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const { service, tasks, events } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '20000',
      }),
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Confirm }),
    );

    const result = await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '那青岛拍照搭子有吗',
    });

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('deepseek_timeout');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.SocialAgentLlmTimeout,
        summary: '分析时间较长，已保留上下文并生成安全恢复计划。',
        payload: expect.objectContaining({
          timeoutMs: 25000,
          fallbackMessage:
            '分析时间较长，我已保留当前上下文；请重试或继续补充，我会从当前任务恢复。',
          degradedPlan: true,
        }),
      }),
    );
    expect(tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          brain: expect.objectContaining({
            lastPlanSource: 'fallback',
            lastPlanReason: 'user_follow_up',
          }),
        }),
      }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.PlanGenerated,
        payload: expect.objectContaining({
          source: 'fallback',
          fallbackReason: 'deepseek_timeout',
          reason: 'user_follow_up',
        }),
      }),
    );
    expect(result.plan).toEqual([
      expect.objectContaining({
        action: SocialAgentAction.GenerateContent,
        status: 'skipped',
        input: expect.objectContaining({
          executionDeferred: true,
          recoveryMessage: expect.stringContaining('已保留上下文'),
        }),
      }),
    ]);
    expect(result.plan.map((step) => step.action)).not.toEqual(
      expect.arrayContaining([
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.FavoriteCandidate,
        SocialAgentAction.WriteInbox,
        SocialAgentAction.SendMessage,
        SocialAgentAction.SendInvite,
        SocialAgentAction.AddFriend,
        SocialAgentAction.OfflineMeet,
        SocialAgentAction.Payment,
      ]),
    );
  });

  it('normalizes shared DeepSeek client timeout messages into the safe recovery path', async () => {
    const deepSeek = {
      complete: jest
        .fn()
        .mockRejectedValue(new Error('DeepSeek timeout after 25000ms')),
    };
    const { service, tasks, events } = serviceWith(
      makeConfig({
        DEEPSEEK_API_KEY: 'key',
        SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '20000',
      }),
      deepSeek,
    );
    tasks.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Confirm }),
    );

    const result = await service.replanTask(10, {
      reason: 'user_follow_up',
      userMessage: '继续帮我找青岛大学附近散步搭子',
    });

    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('deepseek_timeout');
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.SocialAgentLlmTimeout,
        payload: expect.objectContaining({
          degradedPlan: true,
        }),
      }),
    );
    expect(result.plan).toEqual([
      expect.objectContaining({
        action: SocialAgentAction.GenerateContent,
        status: 'skipped',
        input: expect.objectContaining({
          executionDeferred: true,
          recoveryMessage: expect.stringContaining('已保留上下文'),
        }),
      }),
    ]);
    expect(result.plan.map((step) => step.action)).not.toEqual(
      expect.arrayContaining([
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.SendMessage,
        SocialAgentAction.SendInvite,
        SocialAgentAction.AddFriend,
        SocialAgentAction.OfflineMeet,
        SocialAgentAction.Payment,
      ]),
    );
  });

  it('keeps model fallback plans low-risk while preserving safe social search', async () => {
    const { service, tasks } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
        goal: '帮我安排线下约练并支付场地费',
      }),
    );

    const result = await service.planTask(10);

    expect(result.source).toBe('fallback');
    expect(result.plan.map((step) => step.action)).toEqual(
      expect.arrayContaining([
        SocialAgentAction.SearchProfiles,
        SocialAgentAction.GenerateContent,
        SocialAgentAction.DraftMessage,
      ]),
    );
    expect(result.plan.map((step) => step.action)).not.toEqual(
      expect.arrayContaining([
        SocialAgentAction.FavoriteCandidate,
        SocialAgentAction.WriteInbox,
        SocialAgentAction.SendMessage,
        SocialAgentAction.SendInvite,
        SocialAgentAction.AddFriend,
        SocialAgentAction.OfflineMeet,
        SocialAgentAction.Payment,
      ]),
    );
    expect(result.plan.every((step) => step.requiresUserConfirmation)).toBe(
      false,
    );
    expect(
      result.plan.every((step) => result.allowedActions.includes(step.action)),
    ).toBe(true);
  });

  it('replans with short-term brain memory after a failed tool call', async () => {
    const { service, tasks, events } = serviceWith(makeConfig({}));
    tasks.findOne.mockResolvedValue(
      makeTask({
        permissionMode: AgentTaskPermissionMode.Confirm,
        plan: [
          {
            id: 'old_send',
            action: SocialAgentAction.SendMessage,
            status: 'planned',
            toolName: 'send_message',
          },
        ],
        toolCalls: [
          {
            id: 'old_send:send_message:1',
            stepId: 'old_send',
            toolName: 'send_message',
            action: SocialAgentAction.SendMessage,
            status: 'failed',
            error: { code: 'message_send_failed', message: 'network timeout' },
          },
        ],
        result: {
          lastToolCall: {
            stepId: 'old_send',
            toolName: 'send_message',
            action: SocialAgentAction.SendMessage,
            status: 'failed',
            error: {
              code: 'message_send_failed',
              message: 'network timeout',
            },
          },
        },
      }),
    );

    const result = await service.replanTask(10, {
      userMessage: '先生成草稿，不要直接发送。',
    });

    expect(result.reason).toBe('failure_recovery');
    expect(result.replanAttempt).toBe(1);
    expect(result.plan.every((step) => step.status === 'replanned')).toBe(true);
    expect(result.plan.map((step) => step.action)).not.toContain(
      SocialAgentAction.SendMessage,
    );
    expect(tasks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          brain: expect.objectContaining({
            replanAttempt: 1,
            lastFailure: expect.objectContaining({
              toolName: 'send_message',
              status: 'failed',
            }),
          }),
        }),
      }),
    );
    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AgentTaskEventType.PlanGenerated,
        payload: expect.objectContaining({
          reason: 'failure_recovery',
          replanAttempt: 1,
        }),
      }),
    );
  });
});
