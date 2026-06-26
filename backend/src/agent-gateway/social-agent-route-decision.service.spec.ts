import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找跑步搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'social_search',
    confidence: 0.9,
    entities: {
      city: '青岛',
      activityType: '跑步',
      targetGender: '',
      timePreference: '周末',
      locationPreference: '',
    },
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
    source: 'rules',
    ...overrides,
  };
}

function makeBrainDecision(
  route: SocialAgentIntentRouterResult,
  overrides: Partial<SocialAgentBrainTurnDecision> = {},
): SocialAgentBrainTurnDecision {
  return {
    route,
    conversationMode: 'profile_correction',
    shouldExecuteTool: true,
    shouldAskClarifyingQuestion: false,
    plannerSource: 'rules',
    userIntent: route.intent,
    reason: 'user_correction',
    responseGoal: '修正画像后再继续',
    needUserConfirmation: false,
    tools: [{ name: 'get_user_profile', arguments: {} }],
    notes: [],
    ...overrides,
  };
}

function makeHarness(
  options: {
    brainDecision?: SocialAgentBrainTurnDecision;
    brainDisabled?: boolean;
    contextLimit?: string;
    longTermFails?: boolean;
    ownedTask?: AgentTask;
    hydratedContext?: Record<string, unknown> | null;
    routeTaskContext?: Record<string, unknown>;
    workflowRouter?: { route: jest.Mock };
  } = {},
) {
  const socialProfiles = {
    get: jest.fn().mockResolvedValue({
      city: '青岛市',
      interestTags: ['跑步'],
      availableTimes: ['周末'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    }),
  };
  const metrics = {
    recordError: jest.fn(),
    recordIntent: jest.fn(),
    recordWorkflowRoute: jest.fn(),
  };
  const longTermSnapshot = {
    taskCount: 2,
    profileFacts: {},
    preferences: {},
    boundaries: {},
    socialGoals: [],
    availability: [],
    activityPreferences: [],
    matchSignals: [],
  };
  const longTermMemory = {
    readSnapshot: options.longTermFails
      ? jest.fn().mockRejectedValue(new Error('memory unavailable'))
      : jest.fn().mockResolvedValue(longTermSnapshot),
  };
  const routed = makeRoute();
  const intentRouter = {
    route: jest.fn().mockResolvedValue(routed),
  };
  const routeContext = {
    buildMemoryContext: jest.fn().mockReturnValue({ summary: 'memory' }),
    buildTaskContext: jest
      .fn()
      .mockReturnValue(options.routeTaskContext ?? { taskId: 101 }),
    applyRagContext: jest.fn().mockResolvedValue(undefined),
  };
  const messageLog = {
    recordIntentRoute: jest.fn().mockResolvedValue(undefined),
  };
  const taskLifecycle = {
    assertTaskOwner: jest.fn((taskId: number, ownerUserId: number) =>
      Promise.resolve(
        options.ownedTask ?? makeTask({ id: taskId, ownerUserId }),
      ),
    ),
  };
  const brainDecision =
    options.brainDecision === undefined
      ? makeBrainDecision(
          makeRoute({
            intent: 'profile_update',
            shouldSearch: false,
            shouldUpdateProfile: true,
            replyStrategy: 'append_context',
          }),
        )
      : options.brainDecision;
  const brain = {
    planTurn: jest.fn().mockResolvedValue(brainDecision),
  };
  const profileEnrichment = {
    recordProfileMisunderstanding: jest.fn(),
    rememberCurrentTaskFromBrain: jest.fn(),
    executeConversationBrainReadTools: jest
      .fn()
      .mockResolvedValue([{ name: 'get_user_profile', status: 'succeeded' }]),
  };
  const contextHydrator =
    options.hydratedContext === undefined
      ? undefined
      : {
          hydrateContext: jest.fn().mockResolvedValue(options.hydratedContext),
        };
  const service = new SocialAgentRouteDecisionService(
    intentRouter as never,
    socialProfiles as never,
    metrics as never,
    longTermMemory as never,
    profileEnrichment as never,
    messageLog as never,
    taskLifecycle as never,
    routeContext as never,
    options.brainDisabled ? undefined : (brain as never),
    options.contextLimit
      ? ({
          get: (key: string) =>
            key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT'
              ? options.contextLimit
              : undefined,
        } as never)
      : undefined,
    contextHydrator as never,
    undefined,
    options.workflowRouter as never,
  );
  return {
    brain,
    brainDecision,
    intentRouter,
    longTermMemory,
    longTermSnapshot,
    messageLog,
    metrics,
    profileEnrichment,
    routeContext,
    routed,
    service,
    socialProfiles,
    taskLifecycle,
    contextHydrator,
  };
}

describe('SocialAgentRouteDecisionService', () => {
  it('prepares route, brain decision, memory, RAG, and read tools before branch handling', async () => {
    const {
      brain,
      brainDecision,
      intentRouter,
      longTermSnapshot,
      messageLog,
      metrics,
      profileEnrichment,
      routeContext,
      service,
    } = makeHarness();
    const task = makeTask();
    const signal = new AbortController().signal;

    const result = await service.prepare({
      ownerUserId: 7,
      task,
      body: { taskId: 101, message: '帮我找周末下午能一起跑步的人' },
      message: '帮我找周末下午能一起跑步的人',
      signal,
    });

    expect(result.route).toBe(brainDecision.route);
    expect(result.route).toMatchObject({
      intent: 'social_search',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
    });
    expect(result.longTermSnapshot).toBe(longTermSnapshot);
    expect(result.profile).toMatchObject({
      city: '青岛',
      interestTags: ['跑步'],
      availableTimes: ['周末'],
    });
    expect(intentRouter.route).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '帮我找周末下午能一起跑步的人',
        profile: expect.objectContaining({ city: '青岛' }),
        signal,
      }),
    );
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '帮我找周末下午能一起跑步的人',
        route: expect.objectContaining({ intent: 'social_search' }),
        memoryContext: { summary: 'memory' },
        signal,
      }),
    );
    expect(
      profileEnrichment.recordProfileMisunderstanding,
    ).toHaveBeenCalledWith(result.task, 'user_correction');
    expect(messageLog.recordIntentRoute).toHaveBeenCalledWith(
      result.task,
      brainDecision.route,
    );
    expect(metrics.recordIntent).toHaveBeenCalledWith('social_search', 'rules');
    expect(routeContext.applyRagContext).toHaveBeenCalledWith(
      expect.objectContaining({
        task: result.task,
        route: brainDecision.route,
        longTermSnapshot,
      }),
    );
    expect(
      profileEnrichment.executeConversationBrainReadTools,
    ).toHaveBeenCalledWith(7, result.task, brainDecision);
    expect(result.brainToolResults).toEqual([
      { name: 'get_user_profile', status: 'succeeded' },
    ]);
    expect(result.task.memory).toMatchObject({
      taskMemory: {
        lastUserMessages: [
          expect.objectContaining({
            intent: 'social_search',
            text: '帮我找周末下午能一起跑步的人',
          }),
        ],
      },
    });
  });

  it('uses deterministic workflow routing without calling LLM intent routing or Brain', async () => {
    const workflowRoute = makeRoute({
      intent: 'social_search',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
    });
    const workflowRouter = {
      route: jest.fn().mockReturnValue({
        route: workflowRoute,
        reason: 'explicit_social_workflow',
        skipBrain: true,
      }),
    };
    const { brain, intentRouter, metrics, profileEnrichment, service } =
      makeHarness({ workflowRouter });

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask(),
      body: {
        taskId: 101,
        message: '帮我找今晚青岛大学附近散步搭子',
        conversationIntent: 'social',
      },
      message: '帮我找今晚青岛大学附近散步搭子',
    });

    expect(result.route).toStrictEqual(workflowRoute);
    expect(workflowRouter.route).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '帮我找今晚青岛大学附近散步搭子',
        conversationIntent: 'social',
      }),
    );
    expect(intentRouter.route).not.toHaveBeenCalled();
    expect(brain.planTurn).not.toHaveBeenCalled();
    expect(metrics.recordWorkflowRoute).toHaveBeenCalledWith(
      'social_search',
      'explicit_social_workflow',
      { skipBrain: true },
    );
    expect(
      profileEnrichment.executeConversationBrainReadTools,
    ).toHaveBeenCalledWith(7, result.task, undefined);
  });

  it('uses the configured context window for intent routing and brain planning', async () => {
    const ownedTask = makeTask({
      memory: {
        socialAgentConversation: {
          turns: Array.from({ length: 88 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            text: `第 ${index + 1} 条上下文`,
          })),
        },
      },
    });
    const { brain, intentRouter, service } = makeHarness({
      contextLimit: '80',
      ownedTask,
    });

    await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: { taskId: 101, message: '继续刚才青岛大学散步搭子的事' },
      message: '继续刚才青岛大学散步搭子的事',
    });

    expect(intentRouter.route).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({ text: '第 9 条上下文' }),
          expect.objectContaining({ text: '第 88 条上下文' }),
        ]),
      }),
    );
    const routedInput = intentRouter.route.mock.calls.at(-1)?.[0] as {
      conversationHistory: unknown[];
    };
    expect(routedInput.conversationHistory).toHaveLength(80);
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({ text: '第 9 条上下文' }),
          expect.objectContaining({ text: '第 88 条上下文' }),
        ]),
      }),
    );
    const brainInput = brain.planTurn.mock.calls.at(-1)?.[0] as {
      conversationHistory: unknown[];
    };
    expect(brainInput.conversationHistory).toHaveLength(80);
  });

  it('uses hydrated context as the single history source for router and Brain', async () => {
    const hydratedContext = {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [
        { role: 'user', text: '今天晚上青岛大学散步，优先舞蹈相关标签' },
        { role: 'assistant', text: '已记住时间、地点和候选偏好。' },
      ],
      taskMemory: null,
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
      },
      pendingApprovals: [{ id: 'approval-1' }],
      candidateActions: { savedIds: [22] },
      lifeGraphSummary: { preferences: { activity: '散步' } },
      lifeGraphFactProposals: [],
      lifeGraphFactDisplaySummaries: [],
      lifeGraphGovernanceSummary: {
        total: 0,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      },
    };
    const {
      brain,
      contextHydrator,
      intentRouter,
      longTermSnapshot,
      routeContext,
      service,
    } = makeHarness({ hydratedContext });

    await service.prepare({
      ownerUserId: 7,
      task: makeTask(),
      body: { taskId: 101, message: '可以，继续找人' },
      message: '可以，继续找人',
    });

    expect(contextHydrator?.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 101,
      threadId: 101,
    });
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      expect.any(Object),
      longTermSnapshot,
      hydratedContext,
    );
    expect(routeContext.buildTaskContext).toHaveBeenCalledWith(
      expect.objectContaining({ hydratedContext }),
    );
    expect(intentRouter.route).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: hydratedContext.recentMessages,
      }),
    );
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: hydratedContext.recentMessages,
      }),
    );
  });

  it('falls back to stored task history when hydrated recent messages are empty', async () => {
    const ownedTask = makeTask({
      memory: {
        socialAgentConversation: {
          turns: [
            {
              role: 'user',
              text: '今天晚上青岛大学附近散步，优先舞蹈相关标签',
            },
            {
              role: 'assistant',
              text: '已记住时间、地点、活动和候选偏好。',
            },
          ],
        },
      },
    });
    const hydratedContext = {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [],
      taskMemory: null,
      taskSlots: {},
      taskSlotSummary: {},
      knownTaskSlotConstraints: null,
      pendingApprovals: [],
      candidateActions: null,
      lifeGraphSummary: null,
      lifeGraphFactProposals: [],
      lifeGraphFactDisplaySummaries: [],
      lifeGraphGovernanceSummary: {
        total: 0,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      },
    };
    const { brain, intentRouter, service } = makeHarness({
      ownedTask,
      hydratedContext,
    });

    await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: { taskId: 101, message: '可以，继续找人' },
      message: '可以，继续找人',
    });

    expect(intentRouter.route).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          {
            role: 'user',
            text: '今天晚上青岛大学附近散步，优先舞蹈相关标签',
          },
          {
            role: 'assistant',
            text: '已记住时间、地点、活动和候选偏好。',
          },
        ],
      }),
    );
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          {
            role: 'user',
            text: '今天晚上青岛大学附近散步，优先舞蹈相关标签',
          },
          {
            role: 'assistant',
            text: '已记住时间、地点、活动和候选偏好。',
          },
        ],
      }),
    );
  });

  it('passes user-filled task slots to router and brain as hard constraints', async () => {
    const ownedTask = makeTask({
      goal: '今晚青岛大学附近散步',
      taskType: 'social_match',
    });
    new SocialAgentTaskMemoryStateMachineService().applyUserMessage(
      ownedTask,
      '今天晚上在青岛大学附近，找个女舞蹈生散步。',
    );
    const metrics = {
      recordError: jest.fn(),
      recordIntent: jest.fn(),
      recordLatency: jest.fn(),
    };
    const rag = {
      retrieve: jest.fn().mockResolvedValue({
        intent: 'social_search',
        retrievedKinds: [],
      }),
    };
    const routeContext = new SocialAgentRouteContextService(
      metrics as never,
      rag as never,
      undefined,
      {
        get: (key: string) =>
          key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT' ? '40' : undefined,
      } as never,
    );
    const route = makeRoute({
      intent: 'social_search',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
    });
    const intentRouter = {
      route: jest.fn().mockResolvedValue(route),
    };
    const brainDecision = makeBrainDecision(route, {
      conversationMode: 'action',
      shouldExecuteTool: true,
      shouldAskClarifyingQuestion: false,
      plannerSource: 'deepseek',
      userIntent: 'social_search',
      reason: 'all required slots already exist',
      responseGoal: 'search using existing slots',
      tools: [{ name: 'search_public_candidates', arguments: {} }],
    });
    const brain = {
      planTurn: jest.fn().mockResolvedValue(brainDecision),
    };
    const service = new SocialAgentRouteDecisionService(
      intentRouter as never,
      {
        get: jest.fn().mockResolvedValue({
          city: '青岛市',
          interestTags: ['散步'],
          availableTimes: ['晚上'],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      } as never,
      metrics as never,
      {
        readSnapshot: jest.fn().mockResolvedValue(null),
      } as never,
      {
        recordProfileMisunderstanding: jest.fn(),
        rememberCurrentTaskFromBrain: jest.fn(),
        executeConversationBrainReadTools: jest.fn().mockResolvedValue([]),
      } as never,
      {
        recordIntentRoute: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        assertTaskOwner: jest.fn().mockResolvedValue(ownedTask),
      } as never,
      routeContext,
      brain as never,
      {
        get: (key: string) =>
          key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT' ? '40' : undefined,
      } as never,
    );

    await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: { taskId: 101, message: '可以，帮我找人' },
      message: '可以，帮我找人',
    });

    const routedInput = intentRouter.route.mock.calls.at(-1)?.[0] as {
      taskContext: Record<string, unknown>;
    };
    expect(routedInput.taskContext.taskSlots).toMatchObject({
      activity: expect.objectContaining({ value: '散步', state: 'completed' }),
      time_window: expect.objectContaining({
        value: '今天晚上',
        state: 'completed',
      }),
      location_text: expect.objectContaining({
        value: '青岛大学附近',
        state: 'completed',
      }),
      candidate_preference: expect.objectContaining({
        value: expect.stringContaining('舞蹈相关'),
        state: 'answered',
      }),
    });
    expect(routedInput.taskContext.taskSlotSummary).toMatchObject({
      活动: '散步',
      时间: '今天晚上',
      地点: '青岛大学附近',
      候选偏好: expect.stringContaining('舞蹈相关'),
    });
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
          }),
        }),
      }),
    );
  });

  it('applies the current user message to task slots before routing even when hydration is stale', async () => {
    const ownedTask = makeTask({
      goal: '找搭子',
      taskType: 'social_match',
      memory: {},
    });
    const metrics = {
      recordError: jest.fn(),
      recordIntent: jest.fn(),
      recordLatency: jest.fn(),
    };
    const rag = {
      retrieve: jest.fn().mockResolvedValue({
        intent: 'social_search',
        retrievedKinds: [],
      }),
    };
    const routeContext = new SocialAgentRouteContextService(
      metrics as never,
      rag as never,
      undefined,
      {
        get: (key: string) =>
          key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT' ? '40' : undefined,
      } as never,
    );
    const route = makeRoute({
      intent: 'social_search',
      entities: {
        city: '',
        activityType: '',
        targetGender: '',
        timePreference: '',
        locationPreference: '',
      },
      shouldSearch: true,
      replyStrategy: 'search_candidates',
    });
    const intentRouter = {
      route: jest.fn().mockResolvedValue(route),
    };
    const brainDecision = makeBrainDecision(route, {
      conversationMode: 'action',
      shouldExecuteTool: true,
      shouldAskClarifyingQuestion: false,
      plannerSource: 'deepseek',
      userIntent: 'social_search',
      reason: 'current user message fills required slots',
      responseGoal: 'search using newly extracted slots',
      tools: [{ name: 'search_public_candidates', arguments: {} }],
    });
    const brain = {
      planTurn: jest.fn().mockResolvedValue(brainDecision),
    };
    const staleHydratedContext = {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [],
      taskMemory: null,
      taskSlots: {},
      taskSlotSummary: {},
      knownTaskSlotConstraints: {
        treatAsHardConstraints: true,
        knownSlots: [{ key: 'time_window', label: '时间', value: '周末下午' }],
        doNotAskAgainFor: ['time_window'],
        userVisibleSummary: '时间：周末下午',
        candidatePreferencePolicy: 'old policy',
        instruction: 'old instruction',
      },
      pendingApprovals: [],
      candidateActions: null,
      lifeGraphSummary: null,
      lifeGraphFactProposals: [],
      lifeGraphFactDisplaySummaries: [],
      lifeGraphGovernanceSummary: {
        total: 0,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      },
    };
    const service = new SocialAgentRouteDecisionService(
      intentRouter as never,
      {
        get: jest.fn().mockResolvedValue({
          city: '青岛市',
          interestTags: [],
          availableTimes: [],
          profileDiscoverable: true,
          agentCanRecommendMe: true,
        }),
      } as never,
      metrics as never,
      {
        readSnapshot: jest.fn().mockResolvedValue(null),
      } as never,
      {
        recordProfileMisunderstanding: jest.fn(),
        rememberCurrentTaskFromBrain: jest.fn(),
        executeConversationBrainReadTools: jest.fn().mockResolvedValue([]),
      } as never,
      {
        recordIntentRoute: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        assertTaskOwner: jest.fn().mockResolvedValue(ownedTask),
      } as never,
      routeContext,
      brain as never,
      {
        get: (key: string) =>
          key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT' ? '40' : undefined,
      } as never,
      {
        hydrateContext: jest.fn().mockResolvedValue(staleHydratedContext),
      } as never,
      new SocialAgentTaskMemoryStateMachineService(),
    );

    await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: {
        taskId: 101,
        message: '今天晚上在青岛大学附近，找个女舞蹈生散步。',
      },
      message: '今天晚上在青岛大学附近，找个女舞蹈生散步。',
    });

    const routedInput = intentRouter.route.mock.calls.at(-1)?.[0] as {
      taskContext: Record<string, unknown>;
    };
    expect(routedInput.taskContext.taskSlots).toMatchObject({
      activity: expect.objectContaining({ value: '散步', state: 'completed' }),
      time_window: expect.objectContaining({
        value: '今天晚上',
        state: 'completed',
      }),
      location_text: expect.objectContaining({
        value: '青岛大学附近',
        state: 'completed',
      }),
      candidate_preference: expect.objectContaining({
        value: expect.stringContaining('舞蹈相关'),
        state: 'answered',
      }),
    });
    expect(routedInput.taskContext.taskSlotSummary).toMatchObject({
      活动: '散步',
      时间: '今天晚上',
      地点: '青岛大学附近',
      候选偏好: expect.stringContaining('舞蹈相关'),
    });
    expect(routedInput.taskContext.knownTaskSlotConstraints).toMatchObject({
      treatAsHardConstraints: true,
      doNotAskAgainFor: expect.arrayContaining([
        'activity',
        'time_window',
        'location_text',
        'candidate_preference',
      ]),
      knownSlots: expect.arrayContaining([
        expect.objectContaining({ key: 'time_window', value: '今天晚上' }),
        expect.objectContaining({ key: 'activity', value: '散步' }),
        expect.objectContaining({
          key: 'location_text',
          value: '青岛大学附近',
        }),
        expect.objectContaining({
          key: 'candidate_preference',
          value: expect.stringContaining('舞蹈相关'),
        }),
      ]),
    });
    expect(
      JSON.stringify(routedInput.taskContext.knownTaskSlotConstraints),
    ).not.toContain('周末下午');
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        taskContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            doNotAskAgainFor: expect.arrayContaining(['time_window']),
          }),
        }),
      }),
    );
  });

  it('does not write task slots for ordinary conversation turns inside an existing social task', async () => {
    const ownedTask = makeTask({
      goal: '今晚青岛大学散步搭子',
      taskType: 'social_match',
      memory: {},
    });
    const { service } = makeHarness({
      brainDisabled: true,
      ownedTask,
    });

    const result = await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: {
        taskId: 101,
        message: '我想找回之前的聊天记录',
        conversationIntent: 'conversation',
      },
      message: '我想找回之前的聊天记录',
    });

    expect(result.task.memory).not.toHaveProperty('taskSlots');
    expect(result.task.memory).not.toHaveProperty('taskSlotSummary');
    expect(result.task.memory.taskMemory).toMatchObject({
      taskSlots: {},
      taskSlotSummary: {},
    });
  });

  it('keeps pending opportunity slot completion writable even when the UI marks the turn as conversation', async () => {
    const ownedTask = makeTask({
      goal: '今晚青岛大学散步搭子',
      taskType: 'social_match',
      memory: {
        taskMemory: {
          currentTask: {
            waitingFor: 'opportunity_slot_completion',
          },
          pendingOpportunityDraft: {
            status: 'collecting_slots',
          },
        },
      },
    });
    const { service } = makeHarness({
      brainDisabled: true,
      ownedTask,
    });

    const result = await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: {
        taskId: 101,
        message: '只在公共场所，先平台内沟通',
        conversationIntent: 'conversation',
      },
      message: '只在公共场所，先平台内沟通',
    });

    expect(result.task.memory.taskSlots).toMatchObject({
      safety_boundary: expect.objectContaining({
        value: '首次见面优先公共场所，先在平台内沟通',
        state: 'answered',
      }),
    });
    expect(result.task.memory.knownTaskSlotConstraints).toMatchObject({
      doNotAskAgainFor: expect.arrayContaining(['safety_boundary']),
    });
  });

  it('still writes task slots when a conversation-marked turn explicitly asks for social execution', async () => {
    const ownedTask = makeTask({
      goal: '今晚青岛大学散步搭子',
      taskType: 'social_match',
      memory: {},
    });
    const { service } = makeHarness({
      brainDisabled: true,
      ownedTask,
    });

    const result = await service.prepare({
      ownerUserId: 7,
      task: ownedTask,
      body: {
        taskId: 101,
        message: '今天晚上在青岛大学附近散步，帮我找人',
        conversationIntent: 'conversation',
      },
      message: '今天晚上在青岛大学附近散步，帮我找人',
    });

    expect(result.task.memory.taskSlots).toMatchObject({
      activity: expect.objectContaining({ value: '散步' }),
      time_window: expect.objectContaining({ value: '今天晚上' }),
      location_text: expect.objectContaining({
        value: expect.stringContaining('青岛大学附近'),
      }),
    });
    expect(result.task.memory.knownTaskSlotConstraints).toMatchObject({
      doNotAskAgainFor: expect.arrayContaining([
        'activity',
        'time_window',
        'location_text',
      ]),
    });
  });

  it('keeps candidate refinement follow-ups inside the existing social task instead of answering generically', async () => {
    const casualRoute = makeRoute({
      intent: 'casual_chat',
      shouldSearch: false,
      replyStrategy: 'conversational_answer',
    });
    const brainDecision = makeBrainDecision(casualRoute, {
      conversationMode: 'answer',
      shouldExecuteTool: false,
      tools: [],
      userIntent: 'casual_chat',
      reason: 'model downgraded candidate preference',
      responseGoal: 'answer normally',
    });
    const { service } = makeHarness({
      brainDecision,
      routeTaskContext: {
        taskId: 101,
        hasCandidates: true,
        candidateCount: 4,
      },
    });

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask({ goal: '青岛散步搭子' }),
      body: { taskId: 101, message: '有没有女生' },
      message: '有没有女生',
    });

    expect(result.route).toMatchObject({
      intent: 'candidate_followup',
      shouldSearch: true,
      replyStrategy: 'search_candidates',
    });
    expect(result.brainDecision?.route).toBe(result.route);
  });

  it('records long-term memory failures and continues with a null snapshot', async () => {
    const { metrics, routeContext, service } = makeHarness({
      longTermFails: true,
    });

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask(),
      body: { message: '帮我找跑步搭子' },
      message: '帮我找跑步搭子',
    });

    expect(result.longTermSnapshot).toBeNull();
    expect(metrics.recordError).toHaveBeenCalledWith(
      'long_term_memory_read_failed',
    );
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      expect.any(Object),
      null,
      null,
    );
  });

  it('downgrades a brain-planned social search when the user only asks a normal question', async () => {
    const misclassifiedRoute = makeRoute({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    });
    const brainDecision = makeBrainDecision(misclassifiedRoute, {
      conversationMode: 'answer',
      shouldExecuteTool: false,
      tools: [],
      userIntent: 'social_search',
      reason: 'misclassified normal question',
      responseGoal: 'answer normally',
    });
    const {
      brain,
      messageLog,
      metrics,
      profileEnrichment,
      routeContext,
      service,
    } = makeHarness({ brainDecision });

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask({ goal: '普通聊天' }),
      body: { taskId: 101, message: '你觉得今天工作压力大应该怎么调整？' },
      message: '你觉得今天工作压力大应该怎么调整？',
    });

    expect(brain.planTurn).toHaveBeenCalled();
    expect(result.route).toMatchObject({
      intent: 'casual_chat',
      shouldSearch: false,
      shouldReplan: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
    expect(brainDecision.route).toBe(result.route);
    expect(messageLog.recordIntentRoute).toHaveBeenCalledWith(
      result.task,
      expect.objectContaining({
        intent: 'casual_chat',
        shouldSearch: false,
      }),
    );
    expect(metrics.recordIntent).toHaveBeenCalledWith('casual_chat', 'rules');
    expect(routeContext.applyRagContext).toHaveBeenCalledWith(
      expect.objectContaining({
        route: expect.objectContaining({ intent: 'casual_chat' }),
      }),
    );
    expect(profileEnrichment.rememberCurrentTaskFromBrain).toHaveBeenCalledWith(
      result.task,
      expect.objectContaining({ intent: 'casual_chat' }),
    );
  });

  it('removes social execution tools after Brain search plans are downgraded to ordinary chat', async () => {
    const misclassifiedRoute = makeRoute({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    });
    const brainDecision = makeBrainDecision(misclassifiedRoute, {
      conversationMode: 'search',
      shouldExecuteTool: true,
      tools: [{ name: 'search_public_candidates', arguments: {} }],
      userIntent: 'social_search',
      reason: 'misclassified ordinary chat as search',
      responseGoal: 'answer normally',
    });
    const { profileEnrichment, service } = makeHarness({ brainDecision });

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask({ goal: '普通聊天' }),
      body: { taskId: 101, message: '你能介绍一下 FitMeet 有哪些功能吗？' },
      message: '你能介绍一下 FitMeet 有哪些功能吗？',
    });

    expect(result.route).toMatchObject({
      intent: 'casual_chat',
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
    expect(result.brainDecision).toMatchObject({
      conversationMode: 'answer',
      shouldExecuteTool: false,
      tools: [],
    });
    expect(
      profileEnrichment.executeConversationBrainReadTools,
    ).toHaveBeenCalledWith(
      7,
      result.task,
      expect.objectContaining({
        shouldExecuteTool: false,
        tools: [],
      }),
    );
  });

  it('preserves safe context read tools after downgrading a Brain plan but removes side-effect tools', async () => {
    const misclassifiedRoute = makeRoute({
      intent: 'social_search',
      shouldSearch: true,
      shouldExecuteAction: false,
      replyStrategy: 'search_candidates',
    });
    const brainDecision = makeBrainDecision(misclassifiedRoute, {
      conversationMode: 'search',
      shouldExecuteTool: true,
      tools: [
        { name: 'get_conversation_history', arguments: {} },
        { name: 'get_candidate_detail', arguments: { candidateId: 22 } },
        { name: 'send_message_to_candidate', arguments: { candidateId: 22 } },
      ],
      userIntent: 'social_search',
      reason: 'misclassified context follow-up as social action',
      responseGoal: 'answer from existing context',
    });
    const { profileEnrichment, service } = makeHarness({ brainDecision });

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask({ goal: '普通聊天' }),
      body: { taskId: 101, message: '刚才我们说到哪了？' },
      message: '刚才我们说到哪了？',
    });

    expect(result.route).toMatchObject({
      intent: 'casual_chat',
      shouldSearch: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
    expect(result.brainDecision).toMatchObject({
      conversationMode: 'answer',
      shouldExecuteTool: true,
      tools: [
        { name: 'get_conversation_history', arguments: {} },
        { name: 'get_candidate_detail', arguments: { candidateId: 22 } },
      ],
    });
    expect(JSON.stringify(result.brainDecision?.tools)).not.toContain(
      'send_message_to_candidate',
    );
    expect(
      profileEnrichment.executeConversationBrainReadTools,
    ).toHaveBeenCalledWith(
      7,
      result.task,
      expect.objectContaining({
        shouldExecuteTool: true,
        tools: [
          { name: 'get_conversation_history', arguments: {} },
          { name: 'get_candidate_detail', arguments: { candidateId: 22 } },
        ],
      }),
    );
  });

  it('downgrades an initial router social search when Brain is absent and the user asks a normal question', async () => {
    const {
      intentRouter,
      messageLog,
      metrics,
      profileEnrichment,
      routeContext,
      service,
    } = makeHarness({ brainDisabled: true });
    intentRouter.route.mockResolvedValueOnce(
      makeRoute({
        intent: 'social_search',
        shouldSearch: true,
        shouldExecuteAction: false,
        replyStrategy: 'search_candidates',
      }),
    );

    const result = await service.prepare({
      ownerUserId: 7,
      task: makeTask({ goal: '普通聊天' }),
      body: { taskId: 101, message: '今天有点焦虑，你能陪我聊聊吗？' },
      message: '今天有点焦虑，你能陪我聊聊吗？',
    });

    expect(result.route).toMatchObject({
      intent: 'casual_chat',
      shouldSearch: false,
      shouldReplan: false,
      shouldExecuteAction: false,
      replyStrategy: 'conversational_answer',
    });
    expect(messageLog.recordIntentRoute).toHaveBeenCalledWith(
      result.task,
      expect.objectContaining({
        intent: 'casual_chat',
        shouldSearch: false,
      }),
    );
    expect(metrics.recordIntent).toHaveBeenCalledWith('casual_chat', 'rules');
    expect(routeContext.applyRagContext).toHaveBeenCalledWith(
      expect.objectContaining({
        route: expect.objectContaining({ intent: 'casual_chat' }),
      }),
    );
    expect(profileEnrichment.rememberCurrentTaskFromBrain).toHaveBeenCalledWith(
      result.task,
      expect.objectContaining({ intent: 'casual_chat' }),
    );
  });
});
