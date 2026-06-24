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
    const replanAndRefresh = jest.fn();
    const queueInitialSearchForTask = jest.fn();

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
      replanAndRefresh,
      queueInitialSearchForTask,
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
    expect(replanAndRefresh).not.toHaveBeenCalled();
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('blocks stale search/action branch tool names when the route was downgraded to ordinary chat', async () => {
    const forcedObservations: unknown[] = [];
    const forcedAgentLoop = {
      execute: jest.fn(async (input) => {
        forcedObservations.push(
          await input.runner({
            agent: 'Match Agent',
            toolName: 'route_search_turn',
            input: {},
            attempt: 0,
          }),
        );
        forcedObservations.push(
          await input.runner({
            agent: 'Match Agent',
            toolName: 'route_action_turn',
            input: {},
            attempt: 0,
          }),
        );
        return {
          loop: {
            runId: 'loop:forced-stale-branches',
            taskId: input.taskId,
            goal: input.goal,
            status: 'completed',
            steps: [],
            finalObservation: forcedObservations,
          },
        };
      }),
    };
    const { service, deps } = makeService({ agentLoop: forcedAgentLoop });

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('普通聊天回复。'),
      message: '你能介绍一下 FitMeet 有哪些功能吗？',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'casual_chat',
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldExecuteAction: false,
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.searchTurns.handle).not.toHaveBeenCalled();
    expect(deps.actionTurns.handle).not.toHaveBeenCalled();
    expect(result.loop.finalObservation).toEqual([
      expect.objectContaining({
        branch: 'search',
        handled: false,
        skipped: true,
        reason: 'social_intent_gate_blocked',
      }),
      expect.objectContaining({
        branch: 'action',
        handled: false,
        skipped: true,
        reason: 'side_effect_intent_gate_blocked',
      }),
    ]);
  });

  it('keeps Life Graph long-term memory available when the search branch builds memory context', async () => {
    const longTermSnapshot = {
      taskCount: 3,
      profileFacts: { preferredArea: '青岛大学附近' },
      preferences: { intensity: '低强度' },
      boundaries: { publicPlaceOnly: true },
      socialGoals: [],
      availability: ['周末下午'],
      activityPreferences: {
        favoriteActivityTypes: ['散步'],
        favoriteTimePreferences: ['周末下午'],
      },
      matchSignals: {},
    };
    const searchTurns = {
      handle: jest.fn((input) => {
        input.buildMemoryContext(input.task);
        return {
          handled: true,
          assistantMessage: 'Search queued.',
          savedContext: true,
          activityResults: [],
          queuedRun: null,
          runMode: null,
        };
      }),
    };
    const { service, deps } = makeService({ searchTurns });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我来处理。'),
      message: '周末下午在青岛大学附近找散步搭子',
      decision: {
        task: deps.task,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(searchTurns.handle).toHaveBeenCalled();
    expect(deps.routeContext.buildMemoryContext).toHaveBeenCalledWith(
      deps.task,
      longTermSnapshot,
      null,
    );
  });

  it('passes hydrated task context into local search memory building so completed slots are hard constraints', async () => {
    const taskContext = {
      threadId: 'agent-task:101',
      recentMessages: [
        { role: 'user', text: '今天晚上在青岛大学散步' },
        { role: 'assistant', text: '已记住时间、地点和活动。' },
      ],
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      pendingApprovals: [{ id: 'approval-1', action: 'send_invite' }],
      candidateActions: { savedIds: [22] },
      lifeGraphSummary: {
        preferences: { activity: '散步' },
      },
    };
    const searchTurns = {
      handle: jest.fn((input) => {
        input.buildMemoryContext(input.task);
        return {
          handled: true,
          assistantMessage: 'Search queued.',
          savedContext: true,
          activityResults: [],
          queuedRun: null,
          runMode: null,
        };
      }),
    };
    const { service, deps } = makeService({ searchTurns });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我会基于已记住的信息继续。'),
      message: '可以，帮我找人',
      decision: {
        task: deps.task,
        taskContext,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(searchTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        taskContext,
      }),
    );
    expect(deps.routeContext.buildMemoryContext).toHaveBeenCalledWith(
      deps.task,
      null,
      expect.objectContaining({
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: taskContext.recentMessages,
        taskSlots: taskContext.taskSlots,
        knownTaskSlotConstraints: expect.objectContaining({
          treatAsHardConstraints: true,
          doNotAskAgainFor: expect.arrayContaining([
            'time_window',
            'location_text',
            'activity',
          ]),
          userVisibleSummary: expect.stringContaining('地点：青岛大学附近'),
        }),
        pendingApprovals: taskContext.pendingApprovals,
        candidateActions: taskContext.candidateActions,
        lifeGraphSummary: taskContext.lifeGraphSummary,
      }),
    );
  });

  it('passes the client abort signal through the search branch', async () => {
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
    const { service, deps } = makeService({ searchTurns });
    const controller = new AbortController();

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我会基于已记住的信息继续。'),
      message: '今晚青岛大学附近散步，帮我找人',
      decision: {
        task: deps.task,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      signal: controller.signal,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(searchTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
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

  it('does not plan stale social branches when the client marks the turn as conversation', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我来回答。'),
      message: '为什么我的记忆没了？',
      conversationIntent: 'conversation',
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

  it('uses product language for visible AgentLoop step labels instead of internal route tool names', () => {
    const { service } = makeService();
    const labelFor = (
      phase: 'plan' | 'tool' | 'observe' | 'replan' | 'answer',
      toolName?: string | null,
    ) =>
      (
        service as unknown as {
          loopStepLabel: (step: {
            phase: typeof phase;
            toolName?: string | null;
            agent: string;
            status: string;
          }) => string;
        }
      ).loopStepLabel({
        phase,
        toolName,
        agent: 'FitMeet Main Agent',
        status: 'running',
      });

    expect(labelFor('tool', 'route_search_turn')).toBe(
      '正在筛选公开可发现的人',
    );
    expect(labelFor('observe', 'route_search_turn')).toBe('已整理候选机会');
    expect(labelFor('tool', 'route_action_turn')).toBe(
      '正在准备需要你确认的动作',
    );
    expect(labelFor('tool', 'route_conversation_turn')).toBe('正在组织回复');
    expect(labelFor('tool', 'unknown_internal_tool')).toBe('正在整理当前信息');
    expect(labelFor('tool', 'route_search_turn')).not.toContain('route_');
  });

  it('does not let a misclassified social route bypass the explicit user intent gate', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我按普通对话回答。'),
      message: '请安排训练恢复，不要帮我找人，也不要推荐活动。',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'social_search',
          replyStrategy: 'search_candidates',
          shouldSearch: true,
          shouldReplan: false,
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

  it('does not plan action branch when the router misclassifies an action help question', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先解释流程。'),
      message: '为什么不能自动发消息给别人？发邀请的流程是什么？',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'action_request',
          replyStrategy: 'execute_action',
          shouldExecuteAction: true,
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
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
    expect(deps.actionTurns.handle).not.toHaveBeenCalled();
    expect(deps.subagentWorker.run).not.toHaveBeenCalled();
  });

  it('does not plan action branch for explicit side-effect copy without executable context', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先确认具体对象。'),
      message: '帮我发给这个人',
      decision: {
        task: deps.task,
        taskContext: {
          hasCandidates: false,
          hasSearchContext: false,
          candidateCount: 0,
        },
        route: makeRoute({
          intent: 'action_request',
          replyStrategy: 'execute_action',
          shouldExecuteAction: true,
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
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
    expect(deps.actionTurns.handle).not.toHaveBeenCalled();
    expect(deps.subagentWorker.run).not.toHaveBeenCalled();
  });

  it('plans publish action branch when a publish request has completed task slots', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先生成发布确认卡。'),
      message: '那你帮我发布到发现',
      decision: {
        task: deps.task,
        taskContext: {
          hasCandidates: false,
          hasSearchContext: false,
          taskSlots: {
            activity: { value: '健身', state: 'completed' },
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        },
        route: makeRoute({
          intent: 'action_request',
          replyStrategy: 'execute_action',
          shouldExecuteAction: true,
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
        expect.objectContaining({ toolName: 'route_action_turn' }),
      ]),
    );
  });

  it('plans publish action branch for a fresh publish request so missing fields can be asked', async () => {
    const { service, deps } = makeService({
      agentLoop: makeAgentLoop({ runTools: false }),
    });

    await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先确认发布信息。'),
      message: '帮我发布约练卡片',
      decision: {
        task: deps.task,
        taskContext: null,
        route: makeRoute({
          intent: 'action_request',
          replyStrategy: 'execute_action',
          shouldExecuteAction: true,
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

  it('executes Match Agent search through the subagent worker by default', async () => {
    const { service, deps } = makeService();
    const taskContext = {
      currentTask: {
        state: 'slot_filling',
      },
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        geo_area: { value: '崂山区', state: 'inferred' },
        intensity: { value: '低强度', state: 'inferred' },
        candidate_preference: {
          value: '公开资料带舞蹈相关标签的女生优先',
          state: 'answered',
        },
      },
      taskSlotSummary: '今天晚上 · 青岛大学附近 · 散步 · 舞蹈相关公开标签优先',
      hasSearchContext: true,
      hasCandidates: false,
    };

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('先帮你筛选合适的人。'),
      message: '今晚找跑步搭子',
      decision: {
        task: deps.task,
        taskContext,
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
        agent: 'Match Agent',
        memoryScope: 'matching.worker_search_turn',
        plannerInput: expect.objectContaining({
          taskContext,
          hydratedContext: expect.objectContaining({
            knownTaskSlotConstraints: expect.objectContaining({
              doNotAskAgainFor: expect.arrayContaining([
                'time_window',
                'location_text',
                'activity',
                'candidate_preference',
              ]),
              candidatePreferencePolicy:
                expect.stringContaining('公开可发现资料'),
              knownSlots: expect.arrayContaining([
                expect.objectContaining({
                  key: 'geo_area',
                  confirmation: 'inferred_context',
                }),
                expect.objectContaining({
                  key: 'intensity',
                  confirmation: 'inferred_context',
                }),
              ]),
            }),
          }),
        }),
        tools: expect.arrayContaining([
          expect.objectContaining({
            input: expect.objectContaining({
              taskContext,
              hydratedContext: expect.objectContaining({
                knownTaskSlotConstraints: expect.objectContaining({
                  doNotAskAgainFor: expect.arrayContaining([
                    'time_window',
                    'location_text',
                    'activity',
                    'candidate_preference',
                  ]),
                  knownSlots: expect.arrayContaining([
                    expect.objectContaining({
                      key: 'geo_area',
                      confirmation: 'inferred_context',
                    }),
                    expect.objectContaining({
                      key: 'intensity',
                      confirmation: 'inferred_context',
                    }),
                  ]),
                }),
              }),
              profile: null,
              longTermSnapshot: null,
              brainToolResults: [],
            }),
          }),
        ]),
      }),
    );
    expect(deps.agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'route_search_turn',
              input: expect.objectContaining({ taskContext }),
            }),
          ]),
        }),
      }),
    );
    expect(deps.searchTurns.handle).toHaveBeenCalled();
    expect(result.subagentHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'Match Agent',
          evalHints: expect.objectContaining({ independentWorker: true }),
        }),
      ]),
    );
  });

  it('falls back to the main search branch when the worker queue fails', async () => {
    const failingWorker = {
      run: jest.fn().mockRejectedValue(new Error('queue unavailable')),
    };
    const { service, deps } = makeService({ subagentWorker: failingWorker });
    const taskContext = {
      currentTask: {
        state: 'slot_filling',
      },
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料带舞蹈相关标签的女生优先',
          state: 'answered',
        },
      },
      hasSearchContext: true,
      hasCandidates: false,
    };

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('先帮你筛选合适的人。'),
      message: '今晚找跑步搭子',
      decision: {
        task: deps.task,
        taskContext,
        route: makeRoute({ intent: 'social_search' }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
      } as never,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(failingWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Match Agent',
        memoryScope: 'matching.worker_search_turn',
      }),
    );
    expect(deps.searchTurns.handle).toHaveBeenCalledTimes(1);
    expect(result.loop.finalObservation).toEqual(
      expect.objectContaining({
        branch: 'search',
        handled: true,
        subagentWorker: true,
        workerFallback: true,
        workerFailure: 'queue unavailable',
      }),
    );
    expect(result.subagentHandoffs).toEqual([]);
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
          agent: 'Match Agent',
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

  it('executes Life Graph profile updates through the subagent worker lane', async () => {
    const profileTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        task: { id: 101, ownerUserId: 7, result: {} },
        savedContext: true,
        profileUpdated: true,
        profileUpdateProposal: null,
      }),
    };
    const { service, deps } = makeService({ profileTurns });
    const profile = {
      publicName: 'FitMeet 用户',
      city: '青岛',
    };
    const longTermSnapshot = {
      preferences: { activity: '散步' },
      boundaries: { publicPlaceOnly: true },
    };
    const controller = new AbortController();

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我来更新你的画像。'),
      message: '以后第一次见面只安排公共场所',
      decision: {
        task: deps.task,
        route: makeRoute({
          intent: 'profile_update',
          replyStrategy: 'profile_update',
        }),
        profile,
        longTermSnapshot,
        brainToolResults: [],
      } as never,
      signal: controller.signal,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'route_profile_turn',
              input: expect.objectContaining({ intent: 'profile_update' }),
            }),
          ]),
        }),
      }),
    );
    expect(deps.subagentWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Life Graph Agent',
        memoryScope: 'life_graph.worker_profile_turn',
        signal: controller.signal,
        plannerInput: expect.objectContaining({
          message: '以后第一次见面只安排公共场所',
          intent: 'profile_update',
          profile,
          longTermSnapshot,
          branchToolName: 'life_graph_profile_turn',
        }),
        tools: expect.arrayContaining([
          expect.objectContaining({
            toolName: 'life_graph_profile_turn',
            input: expect.objectContaining({
              intent: 'profile_update',
              message: '以后第一次见面只安排公共场所',
              profile,
              longTermSnapshot,
            }),
          }),
        ]),
      }),
    );
    expect(profileTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
    expect(result.subagentHandoffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent: 'Life Graph Agent',
          evalHints: expect.objectContaining({ independentWorker: true }),
          observation: expect.objectContaining({
            branch: 'profile',
            subagentWorker: true,
          }),
        }),
      ]),
    );
  });

  it('executes Meet Loop action approval through the worker without pre-blocking', async () => {
    const { service, deps } = makeService();
    const taskContext = {
      taskSlotSummary: '今晚 · 青岛大学附近 · 散步 · 舞蹈相关公开标签优先',
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料带舞蹈相关标签的女生优先',
          state: 'answered',
        },
      },
      hasCandidates: true,
      hasSearchContext: true,
    };
    const longTermSnapshot = {
      preferences: { intensity: '低强度' },
      boundaries: { publicPlaceOnly: true },
    };
    const profile = {
      publicName: 'FitMeet 用户',
      city: '青岛',
    };
    const brainToolResults = [{ toolName: 'candidate_confirmation_check' }];
    const controller = new AbortController();

    const result = await service.run({
      ownerUserId: 7,
      task: deps.task as never,
      state: createSocialAgentRouteTurnState('我先准备开场白。'),
      message: '帮我发给这个人',
      decision: {
        task: deps.task,
        taskContext,
        route: makeRoute({
          intent: 'action_request',
          shouldExecuteAction: true,
        }),
        profile,
        longTermSnapshot,
        brainToolResults,
      } as never,
      signal: controller.signal,
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
    });

    expect(deps.subagentWorker.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Match Agent',
        memoryScope: 'meet_loop.worker_action_turn',
        signal: controller.signal,
        plannerInput: expect.objectContaining({
          taskContext,
          profile,
          longTermSnapshot,
          brainToolResults,
        }),
        tools: expect.arrayContaining([
          expect.objectContaining({
            input: expect.objectContaining({
              taskContext,
              profile,
              longTermSnapshot,
              brainToolResults,
            }),
          }),
        ]),
      }),
    );
    expect(deps.actionTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
        runtimeContext: expect.objectContaining({
          taskContext,
          profile,
          longTermSnapshot,
          brainToolResults,
        }),
      }),
    );
    expect(result.loop.finalObservation).toEqual(
      expect.objectContaining({
        branch: 'action',
        hasTaskContext: true,
        hasProfileContext: true,
        hasLongTermMemoryContext: true,
        brainToolResultCount: 1,
      }),
    );
    expect(result.actionTurn.pendingApproval).toEqual(
      expect.objectContaining({ id: 88 }),
    );
  });
});
