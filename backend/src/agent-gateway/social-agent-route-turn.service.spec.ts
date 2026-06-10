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
    const candidateConfirmations = {
      handle: jest.fn().mockResolvedValue({ handled: false, task }),
    };
    const completions = {
      complete: jest.fn((input) => ({ completed: true, ...input })),
    };
    const entrance = {
      enter: jest.fn().mockResolvedValue({
        message: 'find a running partner',
        startedAt: '2026-06-07T01:00:00.000Z',
        task,
      }),
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
    const routeLoopRunner = {
      run: jest.fn().mockResolvedValue({
        task,
        state: {
          savedContext: false,
          profileUpdated: false,
          queuedRun: null,
          runMode: null,
          assistantMessage: '好的，我来处理。',
          activityResults: [],
          profileUpdateProposal: null,
          assistantStreamed: false,
          agentLoop: { runId: 'loop_1', steps: [] },
          subagentHandoffs: [],
        },
        loop: { runId: 'loop_1', steps: [] },
        actionTurn: {
          handled: false,
          assistantMessage: '好的，我来处理。',
          pendingApproval: null,
        },
        subagentHandoffs: [],
      }),
    };
    const deps = {
      task,
      refreshedTask,
      route,
      candidateConfirmations,
      completions,
      entrance,
      routeDecisions,
      routeLoopRunner,
      ...overrides,
    };
    const service = new SocialAgentRouteTurnService(
      deps.candidateConfirmations as never,
      deps.completions as never,
      deps.entrance as never,
      deps.routeDecisions as never,
      deps.routeLoopRunner as never,
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

  it('returns candidate confirmation results before route loop execution', async () => {
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

    expect(deps.routeLoopRunner.run).not.toHaveBeenCalled();
    expect(deps.completions.complete).not.toHaveBeenCalled();
  });

  it('passes route loop output to completion', async () => {
    const queuedRun = { taskId: 101, runId: 'sar_run_1', status: 'queued' };
    const { service, deps } = makeService({
      routeLoopRunner: {
        run: jest.fn().mockResolvedValue({
          task: {
            id: 101,
            ownerUserId: 7,
            result: {},
            statusReason: 'refreshed_after_queue',
          },
          state: {
            savedContext: true,
            profileUpdated: false,
            queuedRun,
            runMode: 'initial',
            assistantMessage: 'Search queued.',
            activityResults: [{ type: 'search', status: 'queued' }],
            profileUpdateProposal: null,
            assistantStreamed: false,
            agentLoop: { runId: 'loop_1', steps: [] },
            subagentHandoffs: [],
          },
          loop: { runId: 'loop_1', steps: [] },
          actionTurn: {
            handled: false,
            assistantMessage: 'Search queued.',
            pendingApproval: null,
          },
          subagentHandoffs: [{ agent: 'Social Match Agent' }],
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

    expect(deps.routeLoopRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task: deps.task,
        message: 'find a running partner',
        decision: expect.objectContaining({ route: deps.route }),
      }),
    );
    expect(deps.completions.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        task: deps.refreshedTask,
        queuedRun,
        runMode: 'initial',
        savedContext: true,
        activityResults: [{ type: 'search', status: 'queued' }],
        subagentHandoffs: [{ agent: 'Social Match Agent' }],
        startedAt: '2026-06-07T01:00:00.000Z',
      }),
    );
  });
});
