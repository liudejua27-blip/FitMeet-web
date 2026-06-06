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
    generateConversationalAnswer: jest.fn().mockResolvedValue('LLM 直接回答'),
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

    const result = await service.handle({
      ownerUserId: 7,
      task,
      message: '我其实周末下午更有空',
      route: makeRoute({ intent: 'correction_or_clarification' }),
      profile: { city: '青岛' },
      longTermSnapshot: null,
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
    });
    const buildMemoryContext = profileEnrichment.handleTurn.mock.calls[0][0]
      .buildMemoryContext as (currentTask: AgentTask) => unknown;
    expect(buildMemoryContext(task)).toEqual({ summary: 'memory' });
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(task, null);
    expect(chatLlm.generateConversationalAnswer).not.toHaveBeenCalled();
  });

  it('uses the conversational LLM for direct answer intents with memory and tool context', async () => {
    const { chatLlm, profileEnrichment, routeContext, service } = makeHarness();
    const task = makeTask({ goal: '解释 FitMeet' });
    const longTermSnapshot = {
      taskCount: 1,
      profileFacts: {},
      preferences: {},
      boundaries: {},
      socialGoals: [],
      availability: [],
      activityPreferences: [],
      matchSignals: [],
    };
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

    expect(result).toEqual({
      handled: true,
      task,
      assistantMessage: 'LLM 直接回答',
      savedContext: false,
      profileUpdated: false,
      profileUpdateProposal: null,
    });
    expect(chatLlm.generateConversationalAnswer).toHaveBeenCalledWith({
      message: '人物画像是什么？',
      route,
      profile: { city: '青岛' },
      task,
      longTermSnapshot,
      memoryContext: { summary: 'memory' },
      toolResults: brainToolResults,
    });
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      longTermSnapshot,
    );
    expect(profileEnrichment.handleTurn).not.toHaveBeenCalled();
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

    expect(chatLlm.generateConversationalAnswer).not.toHaveBeenCalled();
    expect(profileEnrichment.handleTurn).not.toHaveBeenCalled();
  });
});
