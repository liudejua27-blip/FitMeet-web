import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { buildFitMeetSubagentWorkerCommand } from './fitmeet-subagent-worker-command.contract';
import { FitMeetSubagentWorkerDispatcherService } from './fitmeet-subagent-worker-dispatcher.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 42,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: '周末青岛大学散步搭子',
    goal: '周末下午，散步，青岛大学附近',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Planning,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
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

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'social_search',
    confidence: 0.93,
    entities: {
      city: '青岛',
      activityType: 'walking',
      targetGender: '',
      timePreference: '周末下午',
      locationPreference: '青岛大学附近',
    },
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
    source: 'deepseek',
    ...overrides,
  };
}

describe('FitMeetSubagentWorkerDispatcherService', () => {
  it('keeps Life Graph long-term memory when dispatching the search worker branch', async () => {
    const task = makeTask();
    const longTermSnapshot = {
      userId: 7,
      taskCount: 3,
      profileFacts: { city: '青岛' },
      preferences: {
        interests: ['散步'],
        socialStyle: '轻松',
        communicationStyle: '先站内聊',
        preferredTraits: ['同城'],
        preferenceHistory: [],
      },
      boundaries: {
        excludedGenders: [],
        noNightMeet: false,
        publicPlaceOnly: true,
        noAutoMessage: true,
        noContactExchange: true,
      },
      socialGoals: ['找轻松散步搭子'],
      availability: ['周末下午'],
      activityPreferences: {
        favoriteCities: ['青岛'],
        favoriteActivityTypes: ['散步'],
        favoriteTimePreferences: ['周末下午'],
        favoriteLocationPreferences: ['青岛大学附近'],
      },
      matchSignals: {
        successfulMatches: [],
        failedMatches: [],
      },
      updatedAt: '2026-06-17T00:00:00.000Z',
    } satisfies LongTermMemorySnapshot;
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({
        longTerm: { preferences: longTermSnapshot.preferences },
      }),
    };
    const searchTurns = {
      handle: jest.fn().mockImplementation((input) => {
        input.buildMemoryContext(task);
        return {
          handled: true,
          assistantMessage: '我会按你的偏好筛选公开候选。',
          savedContext: true,
          activityResults: [],
          queuedRun: null,
          runMode: null,
        };
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      routeContext as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'social_match_search_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Social Match Agent',
        goal: '帮我找周末下午青岛大学附近散步搭子',
        plannerInput: {},
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: makeRoute(),
        taskContext: {
          taskSlots: {
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            activity: { value: '散步', state: 'completed' },
          },
        },
        profile: { city: '青岛' },
        longTermSnapshot,
        brainToolResults: [],
        state: { assistantMessage: '我会继续帮你找。' },
      },
    });

    expect(taskRepo.findOne).toHaveBeenCalledWith({
      where: { id: 42, ownerUserId: 7 },
    });
    expect(searchTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '帮我找周末下午青岛大学附近散步搭子',
        route: expect.objectContaining({ intent: 'social_search' }),
        buildMemoryContext: expect.any(Function),
      }),
    );
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      longTermSnapshot,
      expect.objectContaining({
        taskSlots: expect.objectContaining({
          time_window: expect.objectContaining({ value: '今晚' }),
          location_text: expect.objectContaining({ value: '青岛大学附近' }),
          activity: expect.objectContaining({ value: '散步' }),
        }),
      }),
    );
    expect(result.observation).toMatchObject({
      branch: 'search',
      handled: true,
    });
  });

  it('executes serialized subagent worker branches through AgentLoop instead of bypassing the loop', async () => {
    const task = makeTask();
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({
        longTerm: { preferences: { interests: ['散步'] } },
      }),
    };
    const searchTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        assistantMessage: '我会按统一 loop 继续筛选。',
        savedContext: true,
        activityResults: [],
        queuedRun: null,
        runMode: null,
      }),
    };
    const agentLoop = {
      execute: jest.fn().mockImplementation(async (input) => {
        const observation = await input.runner({
          runId: 'loop-run-search',
          traceId: 'trace-worker-loop',
          taskId: 42,
          agent: 'Social Match Agent',
          toolName: 'route_search_turn',
          input: {},
          attempt: 0,
          signal: null,
        });
        return {
          loop: {
            runId: 'loop-run-search',
            traceId: 'trace-worker-loop',
            taskId: 42,
            goal: input.goal,
            status: 'completed',
            steps: [],
            toolBudget: {
              maxToolCalls: 1,
              usedToolCalls: 1,
              maxRetries: 0,
              timeoutMs: 20000,
            },
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
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      routeContext as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
      agentLoop as never,
    );

    const result = await service.dispatch({
      toolName: 'social_match_search_turn',
      job: {
        queueName: 'fitmeet.subagent.social-match-agent',
        traceId: 'trace-worker-loop',
      } as never,
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Social Match Agent',
        goal: '发布到发现后，帮我找公开可发现的人',
        plannerInput: {},
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: makeRoute(),
        taskContext: {
          taskSlots: {
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            activity: { value: '散步', state: 'completed' },
          },
        },
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '我会继续帮你找。' },
        traceId: 'trace-worker-loop',
      },
    });

    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 42,
        goal: '发布到发现后，帮我找公开可发现的人',
        agent: 'Social Match Agent',
        traceId: 'trace-worker-loop',
        maxToolCalls: 1,
        maxRetries: 0,
        timeoutMs: 25000,
        plan: expect.objectContaining({
          tools: [
            expect.objectContaining({
              agent: 'Social Match Agent',
              toolName: 'route_search_turn',
              requiresApproval: false,
              input: expect.objectContaining({
                workerToolName: 'social_match_search_turn',
                routeIntent: 'social_search',
              }),
            }),
          ],
        }),
        runner: expect.any(Function),
      }),
    );
    expect(searchTurns.handle).toHaveBeenCalledTimes(1);
    expect(result.loop).toEqual(
      expect.objectContaining({
        runId: 'loop-run-search',
        traceId: 'trace-worker-loop',
      }),
    );
    expect(result.state.agentLoop).toEqual(result.loop);
    expect(result.observation).toMatchObject({
      branch: 'search',
      handled: true,
      agentLoop: {
        runId: 'loop-run-search',
        traceId: 'trace-worker-loop',
        status: 'completed',
        workerToolName: 'social_match_search_turn',
        toolName: 'route_search_turn',
        usedToolCalls: 1,
      },
    });
  });

  it('skips stale search worker commands when the route is no longer social execution', async () => {
    const task = makeTask();
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const searchTurns = {
      handle: jest.fn(),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'social_match_search_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Social Match Agent',
        goal: '你有什么功能',
        plannerInput: {},
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: makeRoute({
          intent: 'casual_chat',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '正在思考。' },
      },
    });

    expect(searchTurns.handle).not.toHaveBeenCalled();
    expect(result.observation).toMatchObject({
      branch: 'search',
      handled: false,
      skipped: true,
      reason: 'social_intent_gate_blocked',
      subagentWorkerPolicy: 'blocked_before_branch_execution',
    });
  });

  it('skips stale action worker commands without explicit side-effect intent', async () => {
    const task = makeTask();
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const actionTurns = {
      handle: jest.fn(),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      actionTurns as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'meet_loop_action_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Meet Loop Agent',
        goal: '为什么需要确认',
        plannerInput: {},
        tools: [{ toolName: 'meet_loop_action_turn', input: {} }],
        route: makeRoute({
          intent: 'action_request',
          shouldSearch: false,
          shouldExecuteAction: true,
          replyStrategy: 'execute_action',
        }),
        profile: null,
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '正在确认。' },
      },
    });

    expect(actionTurns.handle).not.toHaveBeenCalled();
    expect(result.observation).toMatchObject({
      branch: 'action',
      handled: false,
      skipped: true,
      reason: 'side_effect_intent_gate_blocked',
      subagentWorkerPolicy: 'blocked_before_branch_execution',
    });
  });

  it('blocks side-effect worker actions when only slot memory exists without candidate context', async () => {
    const task = makeTask();
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const actionTurns = {
      handle: jest.fn(),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      actionTurns as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'meet_loop_action_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Meet Loop Agent',
        goal: '邀请她一起散步',
        plannerInput: {},
        tools: [{ toolName: 'meet_loop_action_turn', input: {} }],
        route: makeRoute({
          intent: 'action_request',
          shouldSearch: false,
          shouldExecuteAction: true,
          replyStrategy: 'execute_action',
        }),
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        contextSnapshot: {
          threadId: 'agent-task:42',
          taskId: 42,
          taskSlots: {
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            activity: { value: '散步', state: 'completed' },
          },
          pendingApprovals: [],
          candidateActions: {},
          lifeGraphSummary: null,
        },
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(actionTurns.handle).not.toHaveBeenCalled();
    expect(result.observation).toMatchObject({
      branch: 'action',
      handled: false,
      skipped: true,
      reason: 'side_effect_intent_gate_blocked',
      subagentWorkerPolicy: 'blocked_before_branch_execution',
    });
  });

  it('normalizes the versioned worker command and dispatches it without losing runtime context', async () => {
    const task = makeTask();
    const taskContext = {
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        geo_area: { value: '崂山区', state: 'inferred' },
        intensity: { value: '低强度', state: 'inferred' },
      },
      knownSlotsAreHardConstraints: true,
      doNotRepeatQuestionsForSlots: [
        'time_window',
        'location_text',
        'activity',
      ],
      pendingApprovals: [
        {
          approvalId: 'approval-worker-command',
          action: 'send_invite',
          state: 'waiting',
        },
      ],
      candidateState: {
        saved: ['candidate-saved'],
        skipped: ['candidate-skipped'],
        invited: ['candidate-invited'],
      },
      lifeGraphSummary: {
        preferences: {
          activity: '散步',
          time: '今天晚上',
          intensity: '低强度',
        },
        boundaries: {
          publicPlaceOnly: true,
        },
      },
    };
    const route = makeRoute({
      entities: {
        city: '青岛',
        activityType: '散步',
        targetGender: '',
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
      },
    });
    const command = buildFitMeetSubagentWorkerCommand({
      runId: 'run-worker-command',
      traceId: 'trace-worker-command',
      commandId: 'cmd-worker-command',
      submittedAt: '2026-06-17T00:00:00.000Z',
      agentName: 'Social Match Agent',
      queueName: 'fitmeet.subagent.social-match-agent',
      ownerUserId: 7,
      taskId: 42,
      goal: '今天晚上，青岛大学附近，散步，帮我找公开可发现的人',
      plannerInput: {
        route,
        taskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: {
            taskContext,
          },
        },
      ],
      memoryScope: 'social_match.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs: 15000,
      route,
      taskContext,
      profile: { city: '青岛' },
      longTermSnapshot: null,
      brainToolResults: [{ name: 'get_user_profile', status: 'succeeded' }],
      state: { assistantMessage: '我会继续按已补齐的信息找。' },
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.social-match-agent',
        timeoutMs: 15000,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-v4-pro',
        runId: 'run-worker-command',
      },
    });
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({ summary: 'memory' }),
    };
    const searchTurns = {
      handle: jest.fn().mockImplementation((input) => {
        input.buildMemoryContext(task);
        return {
          handled: true,
          assistantMessage: '我会按已补齐的信息筛选公开候选。',
          savedContext: true,
          activityResults: [],
          queuedRun: { runId: 'queued-search-run' },
          runMode: 'candidate_search',
        };
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      routeContext as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const normalized = service.normalizePayload(command);
    expect(normalized).toEqual(
      expect.objectContaining({
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Social Match Agent',
        runId: 'run-worker-command',
        traceId: 'trace-worker-command',
        workerRuntime: expect.objectContaining({
          mode: 'queue_worker_ready',
          crashIsolation: true,
          scalable: true,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-v4-pro',
        }),
        plannerInput: expect.objectContaining({
          taskContext: expect.objectContaining(taskContext),
        }),
        taskContext: expect.objectContaining(taskContext),
        contextSnapshot: expect.objectContaining({
          taskSlots: taskContext.taskSlots,
          pendingApprovals: taskContext.pendingApprovals,
          candidateActions: taskContext.candidateState,
          lifeGraphSummary: taskContext.lifeGraphSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
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
      }),
    );
    expect(
      (
        normalized?.contextSnapshot?.knownTaskSlotConstraints as {
          doNotAskAgainFor?: string[];
        }
      )?.doNotAskAgainFor,
    ).toEqual(expect.not.arrayContaining(['geo_area', 'intensity']));

    const result = await service.dispatch({
      toolName: 'social_match_search_turn',
      payload: normalized!,
    });

    expect(searchTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '今天晚上，青岛大学附近，散步，帮我找公开可发现的人',
        route,
      }),
    );
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      null,
      expect.objectContaining({
        userId: 7,
        threadId: 'agent-task:42',
        taskId: 42,
        taskSlots: taskContext.taskSlots,
        pendingApprovals: taskContext.pendingApprovals,
        candidateActions: taskContext.candidateState,
        lifeGraphSummary: taskContext.lifeGraphSummary,
        knownTaskSlotConstraints: expect.objectContaining({
          treatAsHardConstraints: true,
          doNotAskAgainFor: expect.arrayContaining([
            'time_window',
            'location_text',
            'activity',
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
    );
    expect(result.observation).toMatchObject({
      branch: 'search',
      handled: true,
      queuedRun: 'queued-search-run',
      runMode: 'candidate_search',
    });
  });

  it('replaces generic worker search handoff copy with task slot context', async () => {
    const task = makeTask({
      goal: '今天晚上，青岛大学附近，散步，找公开资料里有舞蹈相关标签的女生',
    });
    const taskContext = {
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '女生、舞蹈相关',
          state: 'answered',
        },
      },
      taskSlotSummary: {
        时间: '今天晚上',
        地点: '青岛大学附近',
        活动: '散步',
        候选偏好: '女生、舞蹈相关',
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const searchTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        savedContext: true,
        activityResults: [],
        queuedRun: null,
        runMode: null,
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'social_match_search_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Social Match Agent',
        goal: '可以，帮我找人',
        plannerInput: {},
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: makeRoute({
          entities: {
            city: '青岛',
            activityType: '散步',
            targetGender: '女',
            timePreference: '今天晚上',
            locationPreference: '青岛大学附近',
          },
        }),
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        taskContext,
        state: { assistantMessage: '我会继续帮你找。' },
      },
    });

    expect(result.state.assistantMessage).toContain('今天晚上');
    expect(result.state.assistantMessage).toContain('青岛大学附近');
    expect(result.state.assistantMessage).toContain('散步');
    expect(result.state.assistantMessage).toContain('舞蹈相关');
    expect(result.state.assistantMessage).toContain('公开可发现的人');
    expect(result.state.assistantMessage).not.toBe('我会继续帮你找。');
  });

  it('passes serialized context snapshot into the conversation worker branch', async () => {
    const task = makeTask({
      goal: '今天晚上，青岛大学附近，散步',
    });
    const contextSnapshot = {
      threadId: 'agent-task:42',
      taskId: 42,
      recentMessages: [
        { role: 'user', content: '今天晚上，青岛大学附近，散步' },
        { role: 'assistant', content: '我已经记住这几个条件。' },
      ],
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      pendingApprovals: [{ approvalId: 'approval-1', action: 'send_invite' }],
      candidateActions: { saved: ['candidate-1'], skipped: [] },
      lifeGraphSummary: {
        preferences: { intensity: '低强度' },
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const conversationTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        task,
        assistantMessage: '我会基于刚才的信息继续。',
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      conversationTurns as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'life_graph_conversation_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Life Graph Agent',
        goal: '继续刚才的安排',
        plannerInput: {},
        tools: [{ toolName: 'life_graph_conversation_turn', input: {} }],
        route: makeRoute({
          intent: 'product_help',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        contextSnapshot,
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(conversationTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '继续刚才的安排',
        hydratedContext: expect.objectContaining({
          userId: 7,
          threadId: 'agent-task:42',
          taskId: 42,
          recentMessages: contextSnapshot.recentMessages,
          taskSlots: contextSnapshot.taskSlots,
          pendingApprovals: contextSnapshot.pendingApprovals,
          candidateActions: contextSnapshot.candidateActions,
          lifeGraphSummary: contextSnapshot.lifeGraphSummary,
        }),
      }),
    );
    expect(result.observation).toMatchObject({
      branch: 'conversation',
      handled: true,
    });
  });

  it('passes serialized context snapshot into the profile worker branch', async () => {
    const task = makeTask({
      goal: '完善安全边界',
    });
    const contextSnapshot = {
      threadId: 'agent-task:42',
      taskId: 42,
      recentMessages: [
        { role: 'user', content: '第一次见面只接受公共场所' },
      ],
      taskSlots: {
        safety_boundary: { value: '公共场所优先', state: 'answered' },
      },
      pendingApprovals: [],
      candidateActions: { saved: ['candidate-1'] },
      lifeGraphSummary: {
        boundaries: { firstMeet: '公共场所优先' },
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const profileTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        task,
        assistantMessage: '我会把这个边界作为画像提案。',
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: { proposedFields: [] },
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      profileTurns as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'life_graph_profile_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Life Graph Agent',
        goal: '第一次见面只接受公共场所',
        plannerInput: {},
        tools: [{ toolName: 'life_graph_profile_turn', input: {} }],
        route: makeRoute({
          intent: 'safety_or_boundary',
          shouldSearch: false,
          shouldUpdateProfile: true,
          replyStrategy: 'append_context',
        }),
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        contextSnapshot,
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(profileTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '第一次见面只接受公共场所',
        hydratedContext: expect.objectContaining({
          userId: 7,
          threadId: 'agent-task:42',
          taskId: 42,
          recentMessages: contextSnapshot.recentMessages,
          taskSlots: contextSnapshot.taskSlots,
          pendingApprovals: contextSnapshot.pendingApprovals,
          candidateActions: contextSnapshot.candidateActions,
          lifeGraphSummary: contextSnapshot.lifeGraphSummary,
        }),
      }),
    );
    expect(result.observation).toMatchObject({
      branch: 'profile',
      handled: true,
      savedContext: true,
    });
  });

  it('passes serialized context snapshot into the action worker runtime context', async () => {
    const task = makeTask({
      goal: '邀请候选人一起散步',
    });
    const contextSnapshot = {
      threadId: 'agent-task:42',
      taskId: 42,
      recentMessages: [
        { role: 'user', content: '今晚青岛大学附近散步' },
      ],
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      taskMemory: {
        currentGoal: '今晚青岛大学附近散步',
        preferences: { activity: '散步', intensity: '低强度' },
        boundaries: { publicPlaceOnly: true },
      },
      pendingApprovals: [{ approvalId: 'approval-1' }],
      candidateActions: { saved: ['candidate-1'] },
      lifeGraphSummary: {
        preferences: { intensity: '低强度' },
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const actionTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        assistantMessage: '发送邀请前需要你确认。',
        pendingApproval: {
          id: 88,
          type: 'join_activity',
          actionType: 'invite_candidate',
          summary: '邀请候选人一起散步',
          riskLevel: 'medium',
        },
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      actionTurns as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    const result = await service.dispatch({
      toolName: 'meet_loop_action_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Meet Loop Agent',
        goal: '邀请她一起散步',
        plannerInput: {},
        tools: [{ toolName: 'meet_loop_action_turn', input: {} }],
        route: makeRoute({
          intent: 'action_request',
          shouldSearch: false,
          shouldExecuteAction: true,
          replyStrategy: 'execute_action',
        }),
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [{ toolName: 'candidate_confirmation_check' }],
        contextSnapshot,
        state: { assistantMessage: '我会先等你确认。' },
      },
    });

    expect(actionTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '邀请她一起散步',
        runtimeContext: expect.objectContaining({
          hydratedContext: expect.objectContaining({
            userId: 7,
            threadId: 'agent-task:42',
            taskId: 42,
            recentMessages: contextSnapshot.recentMessages,
            taskMemory: contextSnapshot.taskMemory,
            taskSlots: contextSnapshot.taskSlots,
            pendingApprovals: contextSnapshot.pendingApprovals,
            candidateActions: contextSnapshot.candidateActions,
            lifeGraphSummary: contextSnapshot.lifeGraphSummary,
          }),
          brainToolResults: [{ toolName: 'candidate_confirmation_check' }],
        }),
      }),
    );
    expect(result.observation).toMatchObject({
      branch: 'action',
      handled: true,
      pendingApprovalId: 88,
      requiresConfirmation: true,
    });
  });

  it('passes contextual action handoff copy instead of generic worker fallback', async () => {
    const task = makeTask({
      goal: '今晚青岛大学附近散步，邀请候选人',
    });
    const contextSnapshot = {
      threadId: 'agent-task:42',
      taskId: 42,
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        safety_boundary: {
          value: '首次见面优先公共场所，先在平台内沟通',
          state: 'answered',
        },
      },
      pendingApprovals: [],
      candidateActions: { saved: ['candidate-1'] },
      lifeGraphSummary: null,
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const actionTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        assistantMessage: '发送邀请前需要你确认。',
        pendingApproval: {
          id: 99,
          type: 'join_activity',
          actionType: 'invite_candidate',
          summary: '邀请候选人一起散步',
          riskLevel: 'medium',
        },
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      actionTurns as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    await service.dispatch({
      toolName: 'meet_loop_action_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Meet Loop Agent',
        goal: '邀请她一起散步',
        plannerInput: {},
        tools: [{ toolName: 'meet_loop_action_turn', input: {} }],
        route: makeRoute({
          intent: 'action_request',
          shouldSearch: false,
          shouldExecuteAction: true,
          replyStrategy: 'execute_action',
        }),
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        contextSnapshot,
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(actionTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessage: expect.stringContaining('今晚'),
      }),
    );
    expect(actionTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessage: expect.stringContaining('确认前不会联系对方'),
      }),
    );
    expect(actionTurns.handle).not.toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessage: '我会继续处理。',
      }),
    );
  });

  it('restores task slot summary from nested task context for legacy worker payloads', async () => {
    const task = makeTask({
      goal: '今晚青岛大学附近散步',
    });
    const taskContext = {
      recentMessages: [
        { role: 'user', content: '今晚青岛大学附近散步' },
        { role: 'assistant', content: '我已经记住时间地点和活动。' },
      ],
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      taskSlotSummary: {
        时间: '今晚',
        地点: '青岛大学附近',
        活动: '散步',
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const conversationTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        task,
        assistantMessage: '我会按这些信息继续。',
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      conversationTurns as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    await service.dispatch({
      toolName: 'life_graph_conversation_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Life Graph Agent',
        goal: '继续刚才的信息',
        plannerInput: {},
        tools: [{ toolName: 'life_graph_conversation_turn', input: {} }],
        route: makeRoute({
          intent: 'product_help',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
        taskContext,
        contextSnapshot: {
          threadId: 'agent-task:42',
          taskId: 42,
          recentMessages: [{ role: 'user', content: '今晚青岛大学附近散步' }],
          taskSlots: taskContext.taskSlots,
          pendingApprovals: [],
          candidateActions: {},
          lifeGraphSummary: null,
        },
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(conversationTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        hydratedContext: expect.objectContaining({
          taskSlots: taskContext.taskSlots,
          taskSlotSummary: taskContext.taskSlotSummary,
        }),
      }),
    );
  });

  it('restores social runtime state from task context for legacy worker payloads', async () => {
    const task = makeTask({
      goal: '今晚青岛大学附近散步',
    });
    const taskContext = {
      recentMessages: [
        { role: 'user', content: '今晚青岛大学附近散步' },
        { role: 'assistant', content: '我已经记住时间地点和活动。' },
      ],
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      pendingApprovals: [{ approvalId: 'approval-legacy' }],
      candidateState: {
        saved: ['candidate-1'],
        skipped: ['candidate-2'],
      },
      lifeGraphSummary: {
        preferences: {
          activity: '散步',
          time: '周末下午',
        },
        boundaries: {
          publicPlaceOnly: true,
        },
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const conversationTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        task,
        assistantMessage: '我会按这些信息继续。',
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      conversationTurns as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    await service.dispatch({
      toolName: 'life_graph_conversation_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Life Graph Agent',
        goal: '继续刚才的信息',
        plannerInput: {},
        tools: [{ toolName: 'life_graph_conversation_turn', input: {} }],
        route: makeRoute({
          intent: 'product_help',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
        taskContext,
        contextSnapshot: {
          threadId: 'agent-task:42',
          taskId: 42,
        },
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(conversationTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        hydratedContext: expect.objectContaining({
          recentMessages: taskContext.recentMessages,
          taskSlots: taskContext.taskSlots,
          pendingApprovals: taskContext.pendingApprovals,
          candidateActions: taskContext.candidateState,
          lifeGraphSummary: taskContext.lifeGraphSummary,
        }),
      }),
    );
  });

  it('restores social runtime state from nested taskMemory in worker payloads', async () => {
    const task = makeTask({
      goal: '今晚青岛大学附近散步',
    });
    const taskMemory = {
      taskSlots: {
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料里有舞蹈相关标签的人优先',
          state: 'answered',
        },
      },
      taskSlotSummary: {
        time_window: '今晚',
        location_text: '青岛大学附近',
        activity: '散步',
        candidate_preference: '公开资料里有舞蹈相关标签的人优先',
      },
      pendingApprovals: [{ approvalId: 'approval-task-memory' }],
      candidateState: {
        saved: ['candidate-1'],
        skipped: ['candidate-2'],
      },
      lifeGraphSummary: {
        preferences: {
          activity: '散步',
          time: '今晚',
        },
        boundaries: {
          publicPlaceOnly: true,
        },
      },
      knownTaskSlotConstraints: {
        treatAsHardConstraints: true,
        doNotAskAgainFor: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
      },
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const conversationTurns = {
      handle: jest.fn().mockResolvedValue({
        handled: true,
        task,
        assistantMessage: '我会按这些信息继续。',
        savedContext: false,
        profileUpdated: false,
        profileUpdateProposal: null,
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      conversationTurns as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    await service.dispatch({
      toolName: 'life_graph_conversation_turn',
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Life Graph Agent',
        goal: '继续刚才的信息',
        plannerInput: {},
        tools: [{ toolName: 'life_graph_conversation_turn', input: {} }],
        route: makeRoute({
          intent: 'product_help',
          shouldSearch: false,
          replyStrategy: 'conversational_answer',
        }),
        taskContext: { taskMemory },
        contextSnapshot: {
          threadId: 'agent-task:42',
          taskId: 42,
        },
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '我会继续处理。' },
      },
    });

    expect(conversationTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        hydratedContext: expect.objectContaining({
          taskMemory,
          taskSlots: taskMemory.taskSlots,
          taskSlotSummary: taskMemory.taskSlotSummary,
          pendingApprovals: taskMemory.pendingApprovals,
          candidateActions: taskMemory.candidateState,
          lifeGraphSummary: taskMemory.lifeGraphSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
              'candidate_preference',
            ]),
          }),
        }),
      }),
    );
  });

  it('passes queued worker cancellation signal into search branch callbacks', async () => {
    const task = makeTask();
    const signal = new AbortController().signal;
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({ summary: 'memory' }),
    };
    const initialSearchQueue = {
      queueInitialSearchForTask: jest.fn().mockResolvedValue({
        taskId: task.id,
        runId: 'queued-initial',
      }),
    };
    const replanFacade = {
      replanAndRefresh: jest.fn().mockResolvedValue({
        taskId: task.id,
        runId: 'queued-replan',
      }),
    };
    const searchTurns = {
      handle: jest.fn().mockImplementation(async (input) => {
        await input.queueInitialSearchForTask(7, task, '继续找');
        await input.replanAndRefresh(7, task.id, {
          userMessage: '继续找',
        });
        return {
          handled: true,
          assistantMessage: '我会按已补齐的信息筛选公开候选。',
          savedContext: true,
          activityResults: [],
          queuedRun: { runId: 'queued-search-run' },
          runMode: 'initial',
        };
      }),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      routeContext as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      initialSearchQueue as never,
      replanFacade as never,
    );

    await service.dispatch({
      toolName: 'social_match_search_turn',
      signal,
      payload: {
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 42,
        agent: 'Social Match Agent',
        goal: '继续找',
        plannerInput: {},
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        route: makeRoute(),
        taskContext: {
          taskSlots: {
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            activity: { value: '散步', state: 'completed' },
          },
        },
        profile: { city: '青岛' },
        longTermSnapshot: null,
        brainToolResults: [],
        state: { assistantMessage: '我会继续帮你找。' },
      },
    });

    expect(searchTurns.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        signal,
      }),
    );
    expect(initialSearchQueue.queueInitialSearchForTask).toHaveBeenCalledWith(
      expect.objectContaining({
        signal,
      }),
    );
    expect(replanFacade.replanAndRefresh).toHaveBeenCalledWith(
      7,
      task.id,
      expect.objectContaining({ userMessage: '继续找' }),
      expect.objectContaining({ signal }),
    );
  });

  it('does not dispatch branch work when queued worker signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('queue_cancelled'));
    const taskRepo = {
      findOne: jest.fn(),
    };
    const searchTurns = {
      handle: jest.fn(),
    };
    const service = new FitMeetSubagentWorkerDispatcherService(
      taskRepo as never,
      { buildMemoryContext: jest.fn() } as never,
      { handle: jest.fn() } as never,
      { handle: jest.fn() } as never,
      searchTurns as never,
      { handle: jest.fn() } as never,
      { queueInitialSearchForTask: jest.fn() } as never,
      { replanAndRefresh: jest.fn() } as never,
    );

    await expect(
      service.dispatch({
        toolName: 'social_match_search_turn',
        signal: controller.signal,
        payload: {
          kind: 'route_branch',
          ownerUserId: 7,
          taskId: 42,
          agent: 'Social Match Agent',
          goal: '继续找',
          plannerInput: {},
          tools: [{ toolName: 'social_match_search_turn', input: {} }],
          route: makeRoute(),
          profile: null,
          longTermSnapshot: null,
          brainToolResults: [],
          state: { assistantMessage: '我会继续帮你找。' },
        },
      }),
    ).rejects.toThrow('Subagent worker job cancelled.');

    expect(taskRepo.findOne).not.toHaveBeenCalled();
    expect(searchTurns.handle).not.toHaveBeenCalled();
  });
});
