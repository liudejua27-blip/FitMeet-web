import { SocialAgentRouteAgentLoopRunnerService } from './social-agent-route-agent-loop-runner.service';
import { createSocialAgentRouteTurnState } from './social-agent-route-turn-state';

describe('SocialAgentRouteAgentLoopRunnerService', () => {
  function makeRoute(overrides: Record<string, unknown> = {}) {
    return {
      intent: 'social_search',
      replyStrategy: 'search_candidates',
      source: 'rules',
      shouldExecuteAction: false,
      ...overrides,
    } as never;
  }

  function makeWorker() {
    return {
      run: jest.fn(async (input) => {
        const observation = await input.runner({
          agent: input.agent,
          toolName: input.tools[0].toolName,
          input: input.tools[0].input ?? {},
          attempt: 0,
        });
        return {
          loop: {
            runId: `worker:${input.agent}`,
            taskId: input.taskId,
            goal: input.goal,
            status: 'completed',
            steps: [],
            finalObservation: observation,
          },
          handoff: {
            agent: input.agent,
            memoryScope: input.memoryScope,
            input: input.plannerInput,
            plannerInput: input.plannerInput,
            toolCalls: [
              {
                toolName: input.tools[0].toolName,
                input: input.tools[0].input ?? {},
                status: 'observed',
              },
            ],
            observation,
            observations: [observation],
            critique: 'worker ok',
            handoffOutput: { workerRunId: `worker:${input.agent}` },
            evalHints: { independentWorker: true },
          },
        };
      }),
    };
  }

  function makeAgentLoop(options: { runTools?: boolean } = {}) {
    const runTools = options.runTools ?? true;
    return {
      execute: jest.fn(async (input) => {
        const observations: unknown[] = [];
        if (runTools) {
          for (const tool of input.plan.tools) {
            observations.push(
              await input.runner({
                agent: tool.agent,
                toolName: tool.toolName,
                input: tool.input ?? {},
                attempt: 0,
              }),
            );
          }
        }
        return {
          loop: {
            runId: 'loop:route-turn',
            taskId: input.taskId,
            goal: input.goal,
            status: 'completed',
            steps: input.plan.tools.map((tool) => ({
              agent: tool.agent,
              toolName: tool.toolName,
              status: 'observed',
            })),
            finalObservation: observations.at(-1) ?? null,
          },
        };
      }),
    };
  }

  function makeService(overrides: Record<string, unknown> = {}) {
    const task = { id: 101, ownerUserId: 7, result: {} };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({ memory: true }),
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
        handled: true,
        assistantMessage: 'Search queued.',
        savedContext: true,
        activityResults: [],
        queuedRun: null,
        runMode: null,
      }),
    };
    const actionTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        assistantMessage: '需要你确认后我再发送。',
        pendingApproval: {
          id: 88,
          actionType: 'send_message',
          type: 'candidate_message',
          summary: '发送开场白',
          riskLevel: 'medium',
        },
      }),
    };
    const subagentWorker = makeWorker();
    const agentLoop = makeAgentLoop();
    const deps = {
      task,
      taskLifecycle,
      routeContext,
      conversationTurns,
      profileTurns,
      searchTurns,
      actionTurns,
      subagentWorker,
      agentLoop,
      ...overrides,
    };
    const service = new SocialAgentRouteAgentLoopRunnerService(
      deps.taskLifecycle as never,
      deps.routeContext as never,
      deps.conversationTurns as never,
      deps.profileTurns as never,
      deps.searchTurns as never,
      deps.actionTurns as never,
      deps.subagentWorker as never,
      deps.agentLoop as never,
    );
    return { service, deps };
  }

  it('keeps relevant route/search/profile branches behind AgentLoopService.execute', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我来处理。'),
      message: '今晚找跑步搭子',
      decision: {
        task: deps.task,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ toolName: 'route_conversation_turn' }),
            expect.objectContaining({ toolName: 'route_profile_turn' }),
            expect.objectContaining({ toolName: 'route_search_turn' }),
          ]),
        }),
      }),
    );
    const plan = deps.agentLoop.execute.mock.calls[0][0].plan.tools;
    expect(plan).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
    expect(deps.conversationTurns.handle).not.toHaveBeenCalled();
    expect(deps.profileTurns.handle).not.toHaveBeenCalled();
    expect(deps.searchTurns.handle).not.toHaveBeenCalled();
    expect(deps.actionTurns.handle).not.toHaveBeenCalled();
    expect(deps.subagentWorker.run).not.toHaveBeenCalled();
  });

  it('does not plan search or action branches for normal conversation', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我来回答。'),
      message: '我不想交友，只想问一个普通问题',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'casual_chat',
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    const plan = deps.agentLoop.execute.mock.calls[0][0].plan.tools;
    expect(plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_conversation_turn' }),
        expect.objectContaining({ toolName: 'route_profile_turn' }),
      ]),
    );
    expect(plan).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_search_turn' }),
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
  });

  it('plans search when the user wants candidates but forbids automatic messages', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我会先找候选人。'),
      message:
        '青岛周末下午，轻松跑步，只在公共场所，先站内聊，接受陌生人，先推荐真实用户，不要自动发消息',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'social_search',
          replyStrategy: 'search_candidates',
          shouldSearch: true,
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    const plan = deps.agentLoop.execute.mock.calls[0][0].plan.tools;
    expect(plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_search_turn' }),
      ]),
    );
    expect(plan).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
  });

  it('does not plan candidate follow-up search without existing candidate context', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先正常回答。'),
      message: '第二个更合适吗？',
      decision: {
        task: deps.task,
        taskContext: { hasCandidates: false, hasSearchContext: false },
        route: makeRoute({
          intent: 'candidate_followup',
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    const plan = deps.agentLoop.execute.mock.calls[0][0].plan.tools;
    expect(plan).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_search_turn' }),
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
  });

  it('allows candidate follow-up search only when candidate context exists', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我基于刚才候选继续比较。'),
      message: '第二个更合适吗？',
      decision: {
        task: deps.task,
        taskContext: { hasCandidates: true, hasSearchContext: true },
        route: makeRoute({
          intent: 'candidate_followup',
          replyStrategy: 'search_candidates',
          shouldSearch: true,
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    const plan = deps.agentLoop.execute.mock.calls[0][0].plan.tools;
    expect(plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'route_search_turn' }),
      ]),
    );
  });

  it('executes Social Match search through the subagent worker by default', async () => {
    const { service, deps } = makeService();

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('先帮你筛选合适的人。'),
      message: '今晚找跑步搭子',
      decision: {
        task: deps.task,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.subagentWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Social Match Agent',
        memoryScope: 'matching.worker_search_turn',
      }),
    );
    expect(deps.searchTurns.handle).toHaveBeenCalled();
    expect(result.subagentHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'Social Match Agent',
          evalHints: expect.objectContaining({ independentWorker: true }),
        }),
      ]),
    );
  });

  it('propagates checkpoint resume context into AgentLoop tools and worker handoff', async () => {
    const { service, deps } = makeService();
    const clientContext = {
      source: 'web',
      threadId: 'agent-task:101',
      checkpointId: 202,
      parentCheckpointId: 101,
      sourceCheckpointId: 101,
      sourceStepId: 'search',
      resumeMode: 'replay',
      resumeIdempotencyKey:
        'agent-checkpoint:replay:agent-task:101:checkpoint:202:step:search',
      checkpointAction: 'replay',
      resumeCursor: {
        threadId: 'agent-task:101',
        checkpointId: 202,
        parentCheckpointId: 101,
        action: 'replay',
        stepId: 'search',
      },
    } as const;

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我会从保存的匹配步骤继续。'),
      message: '重新运行刚才找青岛周末跑步搭子的匹配排序',
      clientContext,
      decision: {
        task: deps.task,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    const resumeContext = {
      threadId: 'agent-task:101',
      checkpointId: 202,
      parentCheckpointId: 101,
      sourceCheckpointId: 101,
      sourceStepId: 'search',
      resumeMode: 'replay',
      checkpointAction: 'replay',
      decision: null,
      idempotencyKey:
        'agent-checkpoint:replay:agent-task:101:checkpoint:202:step:search',
      sourceStep: null,
      stepScope: null,
      sideEffectPolicy: null,
    };
    expect(deps.agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'route_search_turn',
              input: expect.objectContaining({ resumeContext }),
            }),
          ]),
        }),
      }),
    );
    expect(deps.subagentWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        plannerInput: expect.objectContaining({ resumeContext }),
        tools: expect.arrayContaining([
          expect.objectContaining({
            input: expect.objectContaining({ resumeContext }),
          }),
        ]),
      }),
    );
    expect(result.subagentHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'Social Match Agent',
          observation: expect.objectContaining({ resumeContext }),
        }),
      ]),
    );
  });

  it('executes Life Graph profile enrichment through the subagent worker', async () => {
    const { service, deps } = makeService({
      conversationTurns: {
        handle: jest.fn().mockResolvedValue({
          handled: true,
          task: { id: 101, ownerUserId: 7, result: {} },
          assistantMessage: '我整理成一条画像提案。',
          savedContext: true,
          profileUpdated: false,
          profileUpdateProposal: { proposedFields: [{ key: 'pace' }] },
        }),
      },
    });

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我来整理你的画像。'),
      message: '我跑步比较慢热',
      decision: {
        task: deps.task,
        route: makeRoute({ intent: 'profile_enrichment' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.subagentWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Life Graph Agent',
        memoryScope: 'life_graph.worker_conversation_turn',
      }),
    );
    expect(result.subagentHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'Life Graph Agent',
          evalHints: expect.objectContaining({ independentWorker: true }),
        }),
      ]),
    );
  });

  it('executes Meet Loop action approval through the worker without pre-blocking', async () => {
    const { service, deps } = makeService();

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先准备开场白。'),
      message: '帮我发给这个人',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'action_request',
          shouldExecuteAction: true,
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.subagentWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Meet Loop Agent',
        memoryScope: 'meet_loop.worker_action_turn',
      }),
    );
    expect(deps.actionTurns.handle).toHaveBeenCalled();
    expect(result.actionTurn.pendingApproval).toEqual(
      expect.objectContaining({ id: 88 }),
    );
  });
});
