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
    const agentLoop = {
      execute: jest.fn(async (input) => {
        const observation = await input.runner({
          runId: 'loop_candidate',
          traceId: 'trace_candidate',
          taskId: task.id,
          agent: 'Social Match Agent',
          toolName: 'candidate_confirmation_check',
          input: { taskId: task.id },
          attempt: 1,
        });
        return {
          loop: {
            runId: 'loop_candidate',
            traceId: 'trace_candidate',
            taskId: task.id,
            goal: input.goal,
            status: 'completed',
            steps: [],
          },
          observations: [observation],
          answerBoundary: {
            fromObservationsOnly: true,
            requiresApproval: false,
            canContinue: true,
            status: 'ready',
          },
        };
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
      agentLoop,
      ...overrides,
    };
    const service = new SocialAgentRouteTurnService(
      deps.candidateConfirmations as never,
      deps.completions as never,
      deps.entrance as never,
      deps.routeDecisions as never,
      deps.routeLoopRunner as never,
      deps.agentLoop as never,
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
      entrance: {
        enter: jest.fn().mockResolvedValue({
          message: '确认发送',
          startedAt: '2026-06-07T01:00:00.000Z',
          task: { id: 101, ownerUserId: 7, result: {} },
        }),
      },
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
        body: { message: '确认发送' },
        replanAndRefresh: jest.fn(),
        queueInitialSearchForTask: jest.fn(),
      }),
    ).resolves.toBe(candidateResult);

    expect(deps.routeLoopRunner.run).not.toHaveBeenCalled();
    expect(deps.completions.complete).not.toHaveBeenCalled();
  });

  it('executes explicit candidate confirmation through AgentLoop even when route loop is skipped', async () => {
    const candidateResult = {
      action: 'reply',
      assistantMessage: 'Candidate confirmed.',
    };
    const { service, deps } = makeService({
      entrance: {
        enter: jest.fn().mockResolvedValue({
          message: '确认发送',
          startedAt: '2026-06-07T01:00:00.000Z',
          task: { id: 101, ownerUserId: 7, result: {} },
        }),
      },
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
        body: { message: '确认发送' },
        replanAndRefresh: jest.fn(),
        queueInitialSearchForTask: jest.fn(),
      }),
    ).resolves.toBe(candidateResult);

    expect(deps.agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        goal: '确认发送',
        agent: 'FitMeet Main Agent',
        plan: expect.objectContaining({
          tools: [
            expect.objectContaining({
              agent: 'Social Match Agent',
              toolName: 'candidate_confirmation_check',
              input: expect.objectContaining({ taskId: 101 }),
            }),
          ],
        }),
        maxToolCalls: 1,
        maxRetries: 0,
      }),
    );
    expect(deps.candidateConfirmations.handle).toHaveBeenCalled();
    expect(deps.routeLoopRunner.run).not.toHaveBeenCalled();
    expect(deps.completions.complete).not.toHaveBeenCalled();
  });

  it('does not run candidate confirmation checks for non-confirmation follow-up messages', async () => {
    const { service, deps } = makeService({
      entrance: {
        enter: jest.fn().mockResolvedValue({
          message: '为什么需要确认？',
          startedAt: '2026-06-07T01:00:00.000Z',
          task: { id: 101, ownerUserId: 7, result: {} },
        }),
      },
      routeDecisions: {
        prepare: jest.fn().mockResolvedValue({
          task: { id: 101, ownerUserId: 7, result: {} },
          route: {
            intent: 'action_request',
            replyStrategy: 'execute_action',
            shouldSearch: false,
            shouldReplan: false,
            shouldExecuteAction: true,
            entities: {},
          },
          profile: { city: 'Qingdao' },
          longTermSnapshot: null,
          brainToolResults: [],
        }),
      },
    });

    await service.handleMessage({
      ownerUserId: 7,
      body: { message: '为什么需要确认？' },
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.candidateConfirmations.handle).not.toHaveBeenCalled();
    expect(deps.routeLoopRunner.run).toHaveBeenCalled();
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
        assistantMessageSource: 'fallback',
        queuedRun,
        runMode: 'initial',
        savedContext: true,
        activityResults: [{ type: 'search', status: 'queued' }],
        subagentHandoffs: [{ agent: 'Social Match Agent' }],
        startedAt: '2026-06-07T01:00:00.000Z',
      }),
    );
  });

  it('does not let deterministic route branch copy masquerade as LLM output', async () => {
    const { service, deps } = makeService({
      routeLoopRunner: {
        run: jest.fn().mockResolvedValue({
          task: {
            id: 101,
            ownerUserId: 7,
            result: {},
          },
          state: {
            savedContext: true,
            profileUpdated: false,
            queuedRun: null,
            runMode: null,
            assistantMessage: '还需要补充活动时间。',
            assistantMessageSource: 'fallback',
            activityResults: [],
            profileUpdateProposal: null,
            assistantStreamed: false,
            agentLoop: { runId: 'loop_1', steps: [] },
            subagentHandoffs: [],
          },
          loop: { runId: 'loop_1', steps: [] },
          actionTurn: {
            handled: false,
            assistantMessage: '还需要补充活动时间。',
            pendingApproval: null,
          },
          subagentHandoffs: [],
        }),
      },
    });

    await service.handleMessage({
      ownerUserId: 7,
      body: { message: '找个散步搭子' },
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.completions.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessage: '还需要补充活动时间。',
        assistantMessageSource: 'fallback',
        assistantStreamed: false,
      }),
    );
  });
});
