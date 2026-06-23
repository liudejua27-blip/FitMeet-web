import {
  buildFitMeetSubagentWorkerCommand,
  FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT,
  isFitMeetSubagentWorkerCommand,
  normalizeSubagentWorkerPayload,
  workerRuntimeFromSubagentPayload,
} from './fitmeet-subagent-worker-command.contract';
import { SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS } from './social-agent-context-window';

describe('fitmeet subagent worker command contract', () => {
  const buildValidCommand = (
    overrides: Partial<
      Parameters<typeof buildFitMeetSubagentWorkerCommand>[0]
    > = {},
  ) =>
    buildFitMeetSubagentWorkerCommand({
      runId: 'run-1',
      traceId: 'trace-1',
      agentName: 'Match Agent',
      queueName: 'fitmeet.subagent.match-agent',
      ownerUserId: 7,
      taskId: 101,
      threadId: 'agent-task:101',
      goal: '找周末跑步搭子',
      plannerInput: { route: { intent: 'find_partner' } },
      tools: [
        { toolName: 'social_match_search_turn', input: { city: '青岛' } },
      ],
      memoryScope: 'matching.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs: 15000,
      route: { intent: 'find_partner' } as never,
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 15000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
      },
      ...overrides,
    });

  it('builds a versioned command that a worker process can normalize and execute', () => {
    const command = buildValidCommand();

    expect(command).toEqual(
      expect.objectContaining({
        contract: FITMEET_SUBAGENT_WORKER_COMMAND_CONTRACT,
        version: 1,
        commandType: 'route_branch.execute',
        owner: { userId: 7 },
        task: { taskId: 101 },
        runtimeIdentity: expect.objectContaining({
          threadId: 'agent-task:101',
          taskId: 101,
          runId: 'run-1',
        }),
        safety: {
          highRiskToolsRequireApproval: true,
          answerFromObservationsOnly: true,
        },
      }),
    );
    expect(isFitMeetSubagentWorkerCommand(command)).toBe(true);
    expect(normalizeSubagentWorkerPayload(command)).toEqual(
      expect.objectContaining({
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        runtimeIdentity: expect.objectContaining({
          threadId: 'agent-task:101',
          taskId: 101,
        }),
        agent: 'Match Agent',
        goal: '找周末跑步搭子',
        tools: [
          { toolName: 'social_match_search_turn', input: { city: '青岛' } },
        ],
      }),
    );
    expect(workerRuntimeFromSubagentPayload(command)).toEqual(
      expect.objectContaining({
        mode: 'queue_worker_ready',
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
      }),
    );
  });

  it('preserves task context for external subagent workers', () => {
    const taskContext = {
      taskMemory: {
        currentGoal: '今晚找青岛大学附近散步搭子',
        preferences: { intensity: '低强度' },
        boundaries: { firstMeetPublicPlaceOnly: true },
      },
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      taskSlotSummary: '今天晚上 · 青岛大学附近 · 散步',
    };
    const command = buildValidCommand({
      taskContext,
      contextSnapshot: {
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [{ role: 'user', content: '今天晚上散步' }],
        taskSlots: taskContext.taskSlots,
        taskSlotSummary: { 已确认: '今天晚上 · 青岛大学附近 · 散步' },
        pendingApprovals: [],
        candidateActions: { liked: [22] },
        lifeGraphSummary: { preferences: ['公共场所优先'] },
      },
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: { taskContext },
        },
      ],
    });

    expect(command.routeBranch.taskContext).toEqual(
      expect.objectContaining({
        ...taskContext,
        knownTaskSlotConstraints: expect.objectContaining({
          doNotAskAgainFor: expect.arrayContaining([
            'time_window',
            'location_text',
            'activity',
          ]),
          knownSlots: expect.arrayContaining([
            expect.objectContaining({
              key: 'time_window',
              confirmation: 'user_confirmed',
            }),
          ]),
        }),
      }),
    );
    expect(command.routeBranch.contextSnapshot).toEqual(
      expect.objectContaining({
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [{ role: 'user', content: '今天晚上散步' }],
        taskMemory: taskContext.taskMemory,
        taskSlots: taskContext.taskSlots,
        taskSlotSummary: { 已确认: '今天晚上 · 青岛大学附近 · 散步' },
        candidateActions: { liked: [22] },
      }),
    );
    expect(normalizeSubagentWorkerPayload(command)).toEqual(
      expect.objectContaining({
        runtimeIdentity: expect.objectContaining({
          threadId: 'agent-task:101',
        }),
        contextSnapshot: expect.objectContaining({
          threadId: 'agent-task:101',
          recentMessages: [{ role: 'user', content: '今天晚上散步' }],
          taskMemory: taskContext.taskMemory,
          taskSlots: taskContext.taskSlots,
          taskSlotSummary: { 已确认: '今天晚上 · 青岛大学附近 · 散步' },
        }),
        taskContext: expect.objectContaining({
          taskMemory: taskContext.taskMemory,
          taskSlots: taskContext.taskSlots,
          taskSlotSummary: taskContext.taskSlotSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
            ]),
          }),
        }),
        plannerInput: expect.objectContaining({
          taskContext: expect.objectContaining({
            taskSlots: taskContext.taskSlots,
          }),
        }),
        tools: expect.arrayContaining([
          expect.objectContaining({
            toolName: 'social_match_search_turn',
            input: expect.objectContaining({
              taskContext: expect.objectContaining({
                taskSlots: taskContext.taskSlots,
              }),
            }),
          }),
        ]),
      }),
    );
  });

  it('builds context snapshot from task context when legacy callers omit snapshot', () => {
    const taskContext = {
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [
        { role: 'user', content: '今晚青岛大学附近散步' },
        { role: 'assistant', content: '我已经记住时间地点和活动。' },
      ],
      taskMemory: {
        currentGoal: '今晚找青岛大学附近散步搭子',
      },
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
      pendingApprovals: [{ approvalId: 'approval-legacy' }],
      candidateState: {
        saved: ['candidate-1'],
        skipped: ['candidate-2'],
      },
      lifeGraphSummary: {
        preferences: { activity: '散步' },
        boundaries: { publicPlaceOnly: true },
      },
    };
    const command = buildValidCommand({
      taskContext,
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: { taskContext },
        },
      ],
    });

    expect(command.routeBranch.contextSnapshot).toEqual(
      expect.objectContaining({
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: taskContext.recentMessages,
        taskMemory: taskContext.taskMemory,
        taskSlots: taskContext.taskSlots,
        taskSlotSummary: taskContext.taskSlotSummary,
        pendingApprovals: taskContext.pendingApprovals,
        candidateActions: taskContext.candidateState,
        lifeGraphSummary: taskContext.lifeGraphSummary,
      }),
    );
    expect(normalizeSubagentWorkerPayload(command)).toEqual(
      expect.objectContaining({
        contextSnapshot: expect.objectContaining({
          recentMessages: taskContext.recentMessages,
          pendingApprovals: taskContext.pendingApprovals,
          candidateActions: taskContext.candidateState,
          lifeGraphSummary: taskContext.lifeGraphSummary,
        }),
      }),
    );
  });

  it('does not let narrow tool task context erase approvals, candidate actions, or memory', () => {
    const plannerTaskContext = {
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [{ role: 'user', content: '今晚青岛大学散步，帮我找人' }],
      taskMemory: {
        currentGoal: '今晚青岛大学附近散步',
        preferences: { intensity: '低强度' },
      },
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
      pendingApprovals: [{ approvalId: 'approval-planner' }],
      candidateActions: {
        savedIds: [22],
      },
      lifeGraphSummary: {
        preferences: ['低强度散步'],
      },
    };
    const narrowToolContext = {
      recentMessages: [
        { role: 'assistant', content: '我已经开始筛选公开候选。' },
      ],
      taskMemory: {
        lastTool: 'social_match_search_turn',
      },
      taskSlots: {
        candidate_preference: {
          value: '女生、舞蹈相关',
          state: 'answered',
        },
      },
      pendingApprovals: [],
      candidateActions: {
        skippedIds: [29],
      },
      lifeGraphSummary: {
        boundaries: ['公共场所优先'],
      },
    };
    const command = buildValidCommand({
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext: plannerTaskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: { taskContext: narrowToolContext },
        },
      ],
    });
    const normalized = normalizeSubagentWorkerPayload(command);
    if (!normalized) {
      throw new Error('Expected normalized subagent worker payload.');
    }

    expect(command.routeBranch.taskContext).toEqual(
      expect.objectContaining({
        taskMemory: expect.objectContaining({
          currentGoal: '今晚青岛大学附近散步',
          preferences: { intensity: '低强度' },
          lastTool: 'social_match_search_turn',
        }),
        taskSlots: expect.objectContaining({
          time_window: plannerTaskContext.taskSlots.time_window,
          location_text: plannerTaskContext.taskSlots.location_text,
          activity: plannerTaskContext.taskSlots.activity,
          candidate_preference:
            narrowToolContext.taskSlots.candidate_preference,
        }),
        pendingApprovals: plannerTaskContext.pendingApprovals,
        candidateActions: {
          savedIds: [22],
          skippedIds: [29],
        },
        lifeGraphSummary: {
          preferences: ['低强度散步'],
          boundaries: ['公共场所优先'],
        },
        recentMessages: expect.arrayContaining([
          expect.objectContaining({
            content: '今晚青岛大学散步，帮我找人',
          }),
          expect.objectContaining({
            content: '我已经开始筛选公开候选。',
          }),
        ]),
      }),
    );
    expect(normalized.contextSnapshot).toEqual(
      expect.objectContaining({
        pendingApprovals: plannerTaskContext.pendingApprovals,
        candidateActions: {
          savedIds: [22],
          skippedIds: [29],
        },
        lifeGraphSummary: {
          preferences: ['低强度散步'],
          boundaries: ['公共场所优先'],
        },
        knownTaskSlotConstraints: expect.objectContaining({
          doNotAskAgainFor: expect.arrayContaining([
            'time_window',
            'location_text',
            'activity',
            'candidate_preference',
          ]),
        }),
      }),
    );
  });

  it('promotes nested task memory state into the queue worker context snapshot', () => {
    const taskContext = {
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [{ role: 'user', content: '可以，继续找人' }],
      taskMemory: {
        currentGoal: '今晚青岛大学附近散步',
        taskSlots: {
          time_window: { value: '今晚', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
          geo_area: {
            value: '崂山区',
            state: 'inferred',
          },
          candidate_preference: {
            value: '女生、舞蹈相关',
            state: 'answered',
          },
        },
        taskSlotSummary: {
          时间: '今晚',
          地点: '青岛大学附近',
          活动: '散步',
          区域: '崂山区',
          候选偏好: '女生、舞蹈相关',
        },
        pendingActions: [
          {
            approvalId: 'approval-1',
            action: 'publish_social_request',
          },
        ],
        candidateState: {
          savedIds: [22],
          skippedIds: [29],
        },
        lifeGraphSummary: {
          preferences: ['低强度散步'],
          boundaries: ['第一次见面只接受公共场所'],
        },
      },
    };

    const command = buildValidCommand({
      taskContext,
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: { taskContext },
        },
      ],
    });
    const normalized = normalizeSubagentWorkerPayload(command);
    if (!normalized) {
      throw new Error('Expected normalized subagent worker payload.');
    }

    expect(command.routeBranch.contextSnapshot).toEqual(
      expect.objectContaining({
        recentMessages: taskContext.recentMessages,
        taskMemory: taskContext.taskMemory,
        taskSlots: taskContext.taskMemory.taskSlots,
        taskSlotSummary: taskContext.taskMemory.taskSlotSummary,
        knownTaskSlotConstraints: expect.objectContaining({
          treatAsHardConstraints: true,
          doNotAskAgainFor: expect.arrayContaining([
            'time_window',
            'location_text',
            'activity',
            'candidate_preference',
          ]),
          knownSlots: expect.arrayContaining([
            expect.objectContaining({
              key: 'geo_area',
              value: '崂山区',
              confirmation: 'inferred_context',
            }),
            expect.objectContaining({
              key: 'candidate_preference',
              value: '女生、舞蹈相关',
              confirmation: 'user_confirmed',
            }),
          ]),
          userVisibleSummary: expect.stringContaining('时间：今晚'),
          candidatePreferencePolicy: expect.stringContaining('公开可发现资料'),
        }),
        pendingApprovals: taskContext.taskMemory.pendingActions,
        candidateActions: taskContext.taskMemory.candidateState,
        lifeGraphSummary: taskContext.taskMemory.lifeGraphSummary,
      }),
    );
    expect(command.routeBranch.taskContext).toEqual(
      expect.objectContaining({
        taskSlots: taskContext.taskMemory.taskSlots,
        taskSlotSummary: taskContext.taskMemory.taskSlotSummary,
        knownTaskSlotConstraints: expect.objectContaining({
          doNotAskAgainFor: expect.arrayContaining([
            'time_window',
            'location_text',
            'activity',
            'candidate_preference',
          ]),
        }),
        pendingApprovals: taskContext.taskMemory.pendingActions,
        candidateActions: taskContext.taskMemory.candidateState,
        lifeGraphSummary: taskContext.taskMemory.lifeGraphSummary,
      }),
    );
    expect(normalized).toEqual(
      expect.objectContaining({
        contextSnapshot: expect.objectContaining({
          taskSlots: taskContext.taskMemory.taskSlots,
          taskSlotSummary: taskContext.taskMemory.taskSlotSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
              'candidate_preference',
            ]),
            knownSlots: expect.arrayContaining([
              expect.objectContaining({
                key: 'geo_area',
                value: '崂山区',
                confirmation: 'inferred_context',
              }),
            ]),
            userVisibleSummary:
              expect.stringContaining('候选偏好：女生、舞蹈相关'),
            instruction: expect.stringContaining('不得重复询问'),
          }),
          pendingApprovals: taskContext.taskMemory.pendingActions,
          candidateActions: taskContext.taskMemory.candidateState,
          lifeGraphSummary: taskContext.taskMemory.lifeGraphSummary,
        }),
      }),
    );
    const constraints = normalized.contextSnapshot
      ?.knownTaskSlotConstraints as Record<string, unknown>;
    expect(constraints.doNotAskAgainFor).toEqual(
      expect.not.arrayContaining(['geo_area']),
    );
  });

  it('keeps canonical nested task memory approvals and candidate actions for external workers', () => {
    const taskContext = {
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [{ role: 'user', content: '我喜欢 22，先别再推 29' }],
      taskMemory: {
        currentGoal: '今晚青岛大学附近散步',
        pendingApprovals: [
          {
            approvalId: 'approval-canonical',
            action: 'send_invite',
          },
        ],
        candidateActions: {
          savedIds: [22],
          skippedIds: [29],
        },
        lifeGraphSummary: {
          preferences: ['低强度散步'],
        },
      },
    };

    const command = buildValidCommand({
      taskContext,
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: { taskContext },
        },
      ],
    });
    const normalized = normalizeSubagentWorkerPayload(command);
    if (!normalized) {
      throw new Error('Expected normalized subagent worker payload.');
    }

    expect(command.routeBranch.taskContext).toEqual(
      expect.objectContaining({
        pendingApprovals: taskContext.taskMemory.pendingApprovals,
        candidateActions: taskContext.taskMemory.candidateActions,
        lifeGraphSummary: taskContext.taskMemory.lifeGraphSummary,
      }),
    );
    expect(command.routeBranch.contextSnapshot).toEqual(
      expect.objectContaining({
        pendingApprovals: taskContext.taskMemory.pendingApprovals,
        candidateActions: taskContext.taskMemory.candidateActions,
        lifeGraphSummary: taskContext.taskMemory.lifeGraphSummary,
      }),
    );
    expect(normalized.contextSnapshot).toEqual(
      expect.objectContaining({
        pendingApprovals: taskContext.taskMemory.pendingApprovals,
        candidateActions: taskContext.taskMemory.candidateActions,
        lifeGraphSummary: taskContext.taskMemory.lifeGraphSummary,
      }),
    );
  });

  it('normalizes subagent context snapshots through the protected Agent context window', () => {
    const recentMessages = Array.from({ length: 85 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${index}`,
    }));
    const command = buildValidCommand({
      contextSnapshot: {
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages,
      },
    });

    const normalized = normalizeSubagentWorkerPayload(command);
    if (!normalized) {
      throw new Error('Expected normalized subagent worker payload.');
    }

    expect(normalized.contextSnapshot?.recentMessages).toHaveLength(
      SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
    );
    expect(normalized.contextSnapshot?.recentMessages?.[0]).toMatchObject({
      content: 'turn-5',
    });
    expect(normalized.contextSnapshot?.recentMessages?.at(-1)).toMatchObject({
      content: 'turn-84',
    });
  });

  it('does not allow callers to shrink external worker context below the protected default', () => {
    const recentMessages = Array.from({ length: 95 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `protected-turn-${index + 1}`,
    }));
    const command = buildValidCommand({
      contextTurnLimit: 8,
      contextSnapshot: {
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages,
      },
    });

    const normalized = normalizeSubagentWorkerPayload(command);
    if (!normalized) {
      throw new Error('Expected normalized subagent worker payload.');
    }

    expect(normalized.contextSnapshot?.recentMessages).toHaveLength(
      SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
    );
    expect(normalized.contextSnapshot?.recentMessages?.[0]).toMatchObject({
      content: 'protected-turn-16',
    });
    expect(normalized.contextSnapshot?.recentMessages?.at(-1)).toMatchObject({
      content: 'protected-turn-95',
    });
  });

  it('merges stale snapshot messages with refreshed task context for external workers', () => {
    const taskContext = {
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [
        {
          role: 'user',
          content: '今天晚上，青岛大学，散步，找舞蹈相关公开标签的人',
          at: '2026-06-18T10:05:00.000Z',
        },
        {
          role: 'user',
          content: '不是周末，我刚才说的是今天晚上',
          at: '2026-06-18T10:06:00.000Z',
        },
      ],
    };
    const command = buildValidCommand({
      contextSnapshot: {
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [
          {
            role: 'user',
            content: '旧问题：周末找跑步搭子',
            at: '2026-06-18T09:00:00.000Z',
          },
        ],
      },
      taskContext,
      plannerInput: {
        route: { intent: 'find_partner' },
        taskContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: { taskContext },
        },
      ],
    });

    const normalized = normalizeSubagentWorkerPayload(command);
    if (!normalized) {
      throw new Error('Expected normalized subagent worker payload.');
    }

    expect(normalized.contextSnapshot?.recentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '旧问题：周末找跑步搭子' }),
        expect.objectContaining({
          content: '不是周末，我刚才说的是今天晚上',
        }),
      ]),
    );
    expect(normalized.contextSnapshot?.recentMessages?.at(-1)).toMatchObject({
      content: '不是周末，我刚才说的是今天晚上',
    });
  });

  it('rejects queue commands that remove the safety boundary', () => {
    const command = buildValidCommand();
    const unsafe = {
      ...command,
      safety: {
        ...command.safety,
        highRiskToolsRequireApproval: false,
      },
    };

    expect(isFitMeetSubagentWorkerCommand(unsafe)).toBe(false);
    expect(normalizeSubagentWorkerPayload(unsafe)).toBeNull();
  });

  it('forces high-risk subagent tools to carry approval before queue execution', () => {
    const command = buildValidCommand({
      tools: [
        {
          toolName: 'send_invite',
          input: { candidateId: 22, message: '今晚一起散步吗？' },
          requiresApproval: false,
        },
      ],
    });

    expect(command.toolPlan.tools).toEqual([
      expect.objectContaining({
        toolName: 'send_invite',
        requiresApproval: true,
      }),
    ]);
    expect(isFitMeetSubagentWorkerCommand(command)).toBe(true);

    const missingApproval = {
      ...command,
      toolPlan: {
        tools: [
          {
            toolName: 'send_invite',
            input: { candidateId: 22, message: '今晚一起散步吗？' },
          },
        ],
      },
    };
    const explicitBypass = {
      ...command,
      toolPlan: {
        tools: [
          {
            toolName: 'connect_candidate',
            input: { candidateId: 22 },
            requiresApproval: false,
          },
        ],
      },
    };

    expect(isFitMeetSubagentWorkerCommand(missingApproval)).toBe(false);
    expect(normalizeSubagentWorkerPayload(missingApproval)).toBeNull();
    expect(isFitMeetSubagentWorkerCommand(explicitBypass)).toBe(false);
    expect(normalizeSubagentWorkerPayload(explicitBypass)).toBeNull();
  });

  it('keeps worker route wrappers executable while protecting direct side effects', () => {
    const command = buildValidCommand({
      agentName: 'Match Agent',
      tools: [
        {
          toolName: 'meet_loop_action_turn',
          input: {
            taskId: 101,
            intent: 'action_request',
            message: '帮我发邀请',
          },
        },
      ],
    });

    expect(command.toolPlan.tools).toEqual([
      expect.objectContaining({
        toolName: 'meet_loop_action_turn',
      }),
    ]);
    expect(command.toolPlan.tools[0].requiresApproval).toBeUndefined();
    expect(isFitMeetSubagentWorkerCommand(command)).toBe(true);
  });

  it('rejects unsafe legacy worker payloads before dispatcher normalization', () => {
    const command = buildValidCommand();
    const legacy = normalizeSubagentWorkerPayload(command);
    if (!legacy) {
      throw new Error('Expected normalized legacy payload.');
    }
    const unsafeLegacy = {
      ...legacy,
      tools: [
        {
          toolName: 'publish_social_request',
          input: { taskId: 101 },
        },
      ],
    };

    expect(normalizeSubagentWorkerPayload(unsafeLegacy)).toBeNull();
  });

  it('rejects malformed worker commands before they reach an external process', () => {
    const command = buildValidCommand();

    expect(
      isFitMeetSubagentWorkerCommand({
        ...command,
        agentName: 'Unknown Agent',
      }),
    ).toBe(false);
    expect(
      isFitMeetSubagentWorkerCommand({
        ...command,
        toolPlan: { tools: [{ toolName: '', input: {} }] },
      }),
    ).toBe(false);
    expect(
      isFitMeetSubagentWorkerCommand({
        ...command,
        toolPlan: { tools: [] },
      }),
    ).toBe(false);
  });

  it('only builds JSON-serializable command payloads for DB queue workers', () => {
    expect(() =>
      buildValidCommand({
        tools: [],
      }),
    ).toThrow('requires at least one tool');
    expect(() =>
      buildValidCommand({
        tools: [{ toolName: ' ', input: {} }],
      }),
    ).toThrow('missing toolName');
    expect(() =>
      buildValidCommand({
        plannerInput: { invalid: BigInt(1) } as never,
      }),
    ).toThrow('plannerInput must be JSON serializable');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      buildValidCommand({
        tools: [{ toolName: 'social_match_search_turn', input: circular }],
      }),
    ).toThrow('tools.0.input must be JSON serializable');
  });
});
