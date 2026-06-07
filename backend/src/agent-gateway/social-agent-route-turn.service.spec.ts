import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';

describe('SocialAgentRouteTurnService', () => {
  function makeService(overrides: Record<string, unknown> = {}) {
    const task = {
      id: 101,
      ownerUserId: 7,
      result: {},
    };
    const refreshedTask = {
      ...task,
      statusReason: 'refreshed_after_queue',
    };
    const route = {
      intent: 'social_search',
      replyStrategy: 'search',
      shouldSearch: true,
      shouldReplan: false,
      entities: {},
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(refreshedTask),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({ memory: true }),
    };
    const candidateConfirmations = {
      handle: jest.fn().mockResolvedValue({ handled: false, task }),
    };
    const completions = {
      complete: jest.fn(async (input) => ({ completed: true, ...input })),
    };
    const conversationTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: false,
        task,
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      }),
    };
    const entrance = {
      enter: jest.fn().mockResolvedValue({
        message: 'find a running partner',
        startedAt: '2026-06-07T01:00:00.000Z',
        task,
      }),
    };
    const profileTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: false,
        task,
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      }),
    };
    const searchTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: false,
        savedContext: false,
        activityResults: [],
        queuedRun: null,
        runMode: null,
      }),
    };
    const actionTurns = {
      handle: jest.fn(async (input) => ({
        handled: input.route.intent === 'action_request',
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      })),
    };
    const routeDecisions = {
      prepare: jest.fn().mockResolvedValue({
        task,
        route,
        profile: { city: 'Qingdao' },
        longTermSnapshot: null,
        brainToolResults: [],
      }),
    };
    const deps = {
      task,
      refreshedTask,
      route,
      taskLifecycle,
      routeContext,
      candidateConfirmations,
      completions,
      conversationTurns,
      entrance,
      profileTurns,
      searchTurns,
      actionTurns,
      routeDecisions,
      ...overrides,
    };
    const service = new SocialAgentRouteTurnService(
      deps.taskLifecycle as never,
      deps.routeContext as never,
      deps.candidateConfirmations as never,
      deps.completions as never,
      deps.conversationTurns as never,
      deps.entrance as never,
      deps.profileTurns as never,
      deps.searchTurns as never,
      deps.actionTurns as never,
      deps.routeDecisions as never,
    );

    return { service, deps };
  }

  it('returns entrance early results without preparing a route turn', async () => {
    const earlyResult = {
      action: 'reply',
      assistantMessage: 'Need a message first.',
    };
    const { service, deps } = makeService({
      entrance: {
        enter: jest.fn().mockResolvedValue({ earlyResult }),
      },
    });

    await expect(
      service.handleMessage({
        ownerUserId: 7,
        body: { message: '' },
        replanAndRefresh: jest.fn(),
        queueInitialSearchForTask: jest.fn(),
      }),
    ).resolves.toBe(earlyResult);

    expect(deps.routeDecisions.prepare).not.toHaveBeenCalled();
    expect(deps.completions.complete).not.toHaveBeenCalled();
  });

  it('returns candidate confirmation results before conversation/search/action turns', async () => {
    const candidateResult = {
      action: 'reply',
      assistantMessage: 'Candidate confirmed.',
    };
    const { service, deps } = makeService({
      candidateConfirmations: {
        handle: jest.fn().mockResolvedValue({
          handled: true,
          result: candidateResult,
          task: { id: 101, ownerUserId: 7 },
        }),
      },
    });

    await expect(
      service.handleMessage({
        ownerUserId: 7,
        body: { message: 'yes, that candidate' },
        replanAndRefresh: jest.fn(),
        queueInitialSearchForTask: jest.fn(),
      }),
    ).resolves.toBe(candidateResult);

    expect(deps.conversationTurns.handle).not.toHaveBeenCalled();
    expect(deps.searchTurns.handle).not.toHaveBeenCalled();
    expect(deps.actionTurns.handle).not.toHaveBeenCalled();
    expect(deps.completions.complete).not.toHaveBeenCalled();
  });

  it('refreshes task ownership after queueing a search before completion', async () => {
    const queuedRun = { taskId: 101, runId: 'sar_run_1', status: 'queued' };
    const { service, deps } = makeService({
      searchTurns: {
        handle: jest.fn().mockResolvedValue({
          handled: true,
          assistantMessage: 'Search queued.',
          savedContext: true,
          activityResults: [{ type: 'search', status: 'queued' }],
          queuedRun,
          runMode: 'initial',
        }),
      },
    });

    await expect(
      service.handleMessage({
        ownerUserId: 7,
        body: { message: 'find a running partner' },
        replanAndRefresh: jest.fn(),
        queueInitialSearchForTask: jest.fn(),
      }),
    ).resolves.toMatchObject({ completed: true });

    expect(deps.taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
    expect(deps.actionTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task: deps.refreshedTask,
        assistantMessage: 'Search queued.',
      }),
    );
    expect(deps.completions.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        task: deps.refreshedTask,
        queuedRun,
        runMode: 'initial',
        savedContext: true,
        activityResults: [{ type: 'search', status: 'queued' }],
        startedAt: '2026-06-07T01:00:00.000Z',
      }),
    );
  });
});
