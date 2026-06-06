import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';

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

function makeHarness(options: { longTermFails?: boolean } = {}) {
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
    buildTaskContext: jest.fn().mockReturnValue({ taskId: 101 }),
    applyRagContext: jest.fn().mockResolvedValue(undefined),
  };
  const messageLog = {
    recordIntentRoute: jest.fn().mockResolvedValue(undefined),
  };
  const taskLifecycle = {
    assertTaskOwner: jest.fn((taskId: number, ownerUserId: number) =>
      Promise.resolve(makeTask({ id: taskId, ownerUserId })),
    ),
  };
  const brainDecision = makeBrainDecision(
    makeRoute({
      intent: 'profile_update',
      shouldSearch: false,
      shouldUpdateProfile: true,
      replyStrategy: 'append_context',
    }),
  );
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
  const service = new SocialAgentRouteDecisionService(
    intentRouter as never,
    socialProfiles as never,
    metrics as never,
    longTermMemory as never,
    profileEnrichment as never,
    messageLog as never,
    taskLifecycle as never,
    routeContext as never,
    brain as never,
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

    const result = await service.prepare({
      ownerUserId: 7,
      task,
      body: { taskId: 101, message: '我其实周末下午更有空' },
      message: '我其实周末下午更有空',
    });

    expect(result.route).toBe(brainDecision.route);
    expect(result.longTermSnapshot).toBe(longTermSnapshot);
    expect(result.profile).toMatchObject({
      city: '青岛',
      interestTags: ['跑步'],
      availableTimes: ['周末'],
    });
    expect(intentRouter.route).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '我其实周末下午更有空',
        profile: expect.objectContaining({ city: '青岛' }),
      }),
    );
    expect(brain.planTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '我其实周末下午更有空',
        route: expect.objectContaining({ intent: 'social_search' }),
        memoryContext: { summary: 'memory' },
      }),
    );
    expect(
      profileEnrichment.recordProfileMisunderstanding,
    ).toHaveBeenCalledWith(result.task, 'user_correction');
    expect(messageLog.recordIntentRoute).toHaveBeenCalledWith(
      result.task,
      brainDecision.route,
    );
    expect(metrics.recordIntent).toHaveBeenCalledWith(
      'profile_update',
      'rules',
    );
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
            intent: 'profile_update',
            text: '我其实周末下午更有空',
          }),
        ],
      },
    });
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
    );
  });
});
