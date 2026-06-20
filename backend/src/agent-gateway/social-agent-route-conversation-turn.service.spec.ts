import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '完善画像',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'profile_enrichment',
    confidence: 0.9,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: true,
    shouldExecuteAction: false,
    replyStrategy: 'append_context',
    source: 'rules',
    ...overrides,
  };
}

function makeHarness() {
  const chatLlm = {
    generateConversationalAnswerWithSource: jest
      .fn()
      .mockResolvedValue({ text: 'LLM 直接回答', source: 'llm' }),
  };
  const profileEnrichment = {
    handleTurn: jest.fn().mockResolvedValue({
      task: makeTask({ id: 202 }),
      assistantMessage: '我先保存这条画像线索。',
      savedContext: true,
      profileUpdated: true,
      profileUpdateProposal: { proposedFields: [] },
    }),
  };
  const routeContext = {
    buildMemoryContext: jest.fn().mockReturnValue({ summary: 'memory' }),
    buildTaskContext: jest.fn().mockReturnValue({
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      knownTaskSlotConstraints: {
        completedSlotKeys: ['time_window', 'location_text', 'activity'],
        doNotRepeatQuestionsForSlots: [
          'time_window',
          'location_text',
          'activity',
        ],
      },
      pendingApprovals: [],
      candidateActions: { saved: ['candidate-1'] },
    }),
  };
  const service = new SocialAgentRouteConversationTurnService(
    chatLlm as never,
    profileEnrichment as never,
    routeContext as never,
  );
  return { chatLlm, profileEnrichment, routeContext, service };
}

describe('SocialAgentRouteConversationTurnService', () => {
  it('delegates profile enrichment intents to the profile enrichment service', async () => {
    const { chatLlm, profileEnrichment, routeContext, service } = makeHarness();
    const task = makeTask();
    const longTermSnapshot = {
      userId: 7,
      taskCount: 2,
      profileFacts: { city: '青岛' },
      preferences: { preferredTime: '周末下午' },
      boundaries: { firstMeet: '公共场所优先' },
      socialGoals: [],
      availability: ['周末下午'],
      activityPreferences: ['散步'],
      matchSignals: [],
      updatedAt: null,
    } as never;

    const result = await service.handle({
      ownerUserId: 7,
      task,
      message: '我其实周末下午更有空',
      route: makeRoute({ intent: 'correction_or_clarification' }),
      profile: { city: '青岛' },
      longTermSnapshot,
      brainToolResults: [],
    });

    expect(result).toMatchObject({
      handled: true,
      task: expect.objectContaining({ id: 202 }),
      assistantMessage: '我先保存这条画像线索。',
      savedContext: true,
      profileUpdated: true,
      profileUpdateProposal: { proposedFields: [] },
    });
    expect(profileEnrichment.handleTurn).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '我其实周末下午更有空',
      intent: 'correction_or_clarification',
      buildMemoryContext: expect.any(Function),
      buildTaskContext: expect.any(Function),
    });
    const buildMemoryContext = profileEnrichment.handleTurn.mock.calls[0][0]
      .buildMemoryContext as (currentTask: AgentTask) => unknown;
    expect(buildMemoryContext(task)).toEqual({ summary: 'memory' });
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      longTermSnapshot,
    );
    const buildTaskContext = profileEnrichment.handleTurn.mock.calls[0][0]
      .buildTaskContext as (
      currentTask: AgentTask,
      memoryContext: Record<string, unknown> | null,
    ) => unknown;
    expect(buildTaskContext(task, { summary: 'memory' })).toBeNull();
    expect(
      chatLlm.generateConversationalAnswerWithSource,
    ).not.toHaveBeenCalled();
  });

  it('uses the conversational LLM for direct answer intents with memory and tool context', async () => {
    const { chatLlm, profileEnrichment, routeContext, service } = makeHarness();
    const task = makeTask({ goal: '解释 FitMeet' });
    const longTermSnapshot = {
      userId: 7,
      taskCount: 1,
      profileFacts: {},
      preferences: {},
      boundaries: {},
      socialGoals: [],
      availability: [],
      activityPreferences: [],
      matchSignals: [],
      updatedAt: null,
    } as never;
    const brainToolResults = [
      { name: 'get_user_profile', status: 'succeeded' },
    ];
    const route = makeRoute({
      intent: 'product_help',
      shouldUpdateProfile: false,
      replyStrategy: 'conversational_answer',
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      message: '人物画像是什么？',
      route,
      profile: { city: '青岛' },
      longTermSnapshot,
      brainToolResults,
    });

    expect(result).toMatchObject({
      handled: true,
      task,
      assistantMessage: 'LLM 直接回答',
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
    });
    expect(chatLlm.generateConversationalAnswerWithSource).toHaveBeenCalledWith(
      {
        message: '人物画像是什么？',
        route,
        profile: { city: '青岛' },
        task,
        longTermSnapshot,
        memoryContext: { summary: 'memory' },
        conversationHistory: null,
        toolResults: brainToolResults,
      },
    );
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      longTermSnapshot,
    );
    expect(profileEnrichment.handleTurn).not.toHaveBeenCalled();
  });

  it('passes hydrated worker context into direct conversational memory context', async () => {
    const { chatLlm, routeContext, service } = makeHarness();
    const task = makeTask({ goal: '继续约练任务' });
    const recentMessages = [
      { role: 'user', content: '今天晚上，青岛大学附近，散步' },
      { role: 'assistant', content: '我已经记住这几个条件。' },
    ];
    const hydratedContext = {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages,
      taskMemory: null,
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
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
      lifeGraphSummary: {
        preferences: { activity: '散步' },
      },
      pendingApprovals: [],
      candidateActions: {
        saved: ['candidate-1'],
      },
    } as never;
    const route = makeRoute({
      intent: 'product_help',
      shouldUpdateProfile: false,
      replyStrategy: 'conversational_answer',
    });

    await service.handle({
      ownerUserId: 7,
      task,
      message: '继续刚才的安排',
      route,
      profile: { city: '青岛' },
      longTermSnapshot: null,
      hydratedContext,
      brainToolResults: [],
    });

    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      null,
      hydratedContext,
    );
    expect(routeContext.buildTaskContext).toHaveBeenCalledWith({
      task,
      body: { message: '继续刚才的安排' },
      longTermSnapshot: null,
      memoryContext: { summary: 'memory' },
      hydratedContext,
    });
    expect(chatLlm.generateConversationalAnswerWithSource).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryContext: { summary: 'memory' },
        taskContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            activity: { value: '散步', state: 'completed' },
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            doNotRepeatQuestionsForSlots: [
              'time_window',
              'location_text',
              'activity',
            ],
          }),
          candidateActions: { saved: ['candidate-1'] },
        }),
        conversationHistory: recentMessages,
      }),
    );
  });

  it('passes hydrated worker context into profile enrichment memory context', async () => {
    const { profileEnrichment, routeContext, service } = makeHarness();
    const task = makeTask();
    const hydratedContext = {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [{ role: 'user', content: '我周末下午更有空' }],
      taskMemory: null,
      taskSlots: {
        time_window: { value: '周末下午', state: 'answered' },
      },
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
      lifeGraphSummary: null,
      pendingApprovals: [],
      candidateActions: null,
    } as never;

    await service.handle({
      ownerUserId: 7,
      task,
      message: '我周末下午更有空',
      route: makeRoute({ intent: 'profile_enrichment' }),
      profile: null,
      longTermSnapshot: null,
      hydratedContext,
      brainToolResults: [],
    });

    const buildMemoryContext = profileEnrichment.handleTurn.mock.calls[0][0]
      .buildMemoryContext as (currentTask: AgentTask) => unknown;
    expect(buildMemoryContext(task)).toEqual({ summary: 'memory' });
    const buildTaskContext = profileEnrichment.handleTurn.mock.calls[0][0]
      .buildTaskContext as (
      currentTask: AgentTask,
      memoryContext: Record<string, unknown> | null,
    ) => unknown;
    expect(buildTaskContext(task, { summary: 'memory' })).toMatchObject({
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      candidateActions: { saved: ['candidate-1'] },
    });
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      null,
      hydratedContext,
    );
    expect(routeContext.buildTaskContext).toHaveBeenCalledWith({
      task,
      body: { message: '我周末下午更有空' },
      longTermSnapshot: null,
      memoryContext: { summary: 'memory' },
      hydratedContext,
    });
  });

  it('propagates AgentLoop traceId into direct conversational LLM calls', async () => {
    const { chatLlm, service } = makeHarness();
    const route = makeRoute({
      intent: 'product_help',
      shouldUpdateProfile: false,
      replyStrategy: 'conversational_answer',
    });

    await service.handle({
      ownerUserId: 7,
      task: makeTask({ goal: '功能咨询' }),
      traceId: 'agent:trace-direct',
      message: '你有什么功能？',
      route,
      profile: null,
      longTermSnapshot: null,
      brainToolResults: [],
    });

    expect(chatLlm.generateConversationalAnswerWithSource).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'agent:trace-direct',
      }),
    );
  });

  it('marks non-streamed direct-answer fallbacks instead of presenting them as LLM output', async () => {
    const { chatLlm, service } = makeHarness();
    chatLlm.generateConversationalAnswerWithSource.mockResolvedValueOnce({
      text: '我先保留当前对话，你可以稍后继续。',
      source: 'fallback',
    });

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask({ goal: '功能咨询' }),
      message: '你有什么功能？',
      route: makeRoute({
        intent: 'product_help',
        shouldUpdateProfile: false,
        replyStrategy: 'conversational_answer',
      }),
      profile: null,
      longTermSnapshot: null,
      brainToolResults: [],
    });

    expect(result).toMatchObject({
      handled: true,
      assistantMessage: '我先保留当前对话，你可以稍后继续。',
      assistantMessageSource: 'fallback',
      assistantStreamed: false,
    });
  });

  it('marks streamed direct-answer deltas as LLM output', async () => {
    const { chatLlm, service } = makeHarness();
    chatLlm.generateConversationalAnswerWithSource.mockImplementationOnce(
      async ({ onDelta }: { onDelta?: (delta: string) => Promise<void> }) => {
        await onDelta?.('我正在回答');
        return { text: '我正在回答', source: 'llm' };
      },
    );
    const events: Array<Record<string, unknown>> = [];

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask({ goal: '功能咨询' }),
      message: '你有什么功能？',
      route: makeRoute({
        intent: 'product_help',
        shouldUpdateProfile: false,
        replyStrategy: 'conversational_answer',
      }),
      profile: null,
      longTermSnapshot: null,
      brainToolResults: [],
      emit: (event) => {
        events.push(event as unknown as Record<string, unknown>);
      },
    });

    expect(result).toMatchObject({
      assistantMessageSource: 'llm',
      assistantStreamed: true,
    });
    expect(events).toEqual([
      expect.objectContaining({ type: 'assistant_delta', source: 'llm' }),
      expect.objectContaining({ type: 'assistant_done', source: 'llm' }),
    ]);
  });

  it('ignores search/action intents so later turn handlers can process them', async () => {
    const { chatLlm, profileEnrichment, service } = makeHarness();
    const task = makeTask();

    await expect(
      service.handle({
        ownerUserId: 7,
        task,
        message: '帮我找跑步搭子',
        route: makeRoute({
          intent: 'social_search',
          shouldSearch: true,
          shouldUpdateProfile: false,
          replyStrategy: 'search_candidates',
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      }),
    ).resolves.toEqual({
      handled: false,
      task,
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
    });

    expect(
      chatLlm.generateConversationalAnswerWithSource,
    ).not.toHaveBeenCalled();
    expect(profileEnrichment.handleTurn).not.toHaveBeenCalled();
  });

  it('leaves fitness math routes on deterministic fallback copy instead of LLM tools', async () => {
    const { chatLlm, profileEnrichment, service } = makeHarness();
    const task = makeTask();

    await expect(
      service.handle({
        ownerUserId: 7,
        task,
        message: '5公里30分钟配速是多少？',
        route: makeRoute({
          intent: 'fitness_math',
          shouldSearch: false,
          shouldUpdateProfile: false,
          replyStrategy: 'conversational_answer',
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      }),
    ).resolves.toEqual({
      handled: false,
      task,
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
    });

    expect(
      chatLlm.generateConversationalAnswerWithSource,
    ).not.toHaveBeenCalled();
    expect(profileEnrichment.handleTurn).not.toHaveBeenCalled();
  });
});
