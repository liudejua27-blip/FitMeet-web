import { AgentLoopService } from './agent-loop.service';
import { FitMeetSubagentWorkerService } from './fitmeet-subagent-worker.service';
import {
  buildFitMeetSubagentWorkerCommand,
  isFitMeetSubagentWorkerCommand,
  normalizeSubagentWorkerPayload,
} from './fitmeet-subagent-worker-command.contract';
import { SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS } from './social-agent-context-window';

function makeConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('FitMeetSubagentWorkerService', () => {
  it('runs a subagent as an independent worker with tool budget and handoff memory', async () => {
    const l5Runtime = {
      recordSubagentMemory: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      l5Runtime as never,
    );
    const runner = jest.fn().mockResolvedValue({
      candidateCount: 2,
      explanation: 'same city and low-pressure running',
    });

    const result = await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Match Agent',
      goal: '找低压力跑步搭子',
      plannerInput: { city: '青岛', activityType: '跑步' },
      memoryScope: 'matching.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      tools: [
        {
          toolName: 'search_real_candidates',
          input: { city: '青岛' },
        },
      ],
      runner,
    });

    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Match Agent',
        toolName: 'search_real_candidates',
        input: { city: '青岛' },
        attempt: 0,
      }),
    );
    expect(result.loop.toolBudget).toEqual(
      expect.objectContaining({
        maxToolCalls: 1,
        usedToolCalls: 1,
      }),
    );
    expect(result.handoff).toEqual(
      expect.objectContaining({
        agent: 'Match Agent',
        memoryScope: 'matching.worker_memory',
        evalHints: expect.objectContaining({
          independentWorker: true,
          usedToolCalls: 1,
          evalRunner: 'match_recall_ranking_and_meet_loop_eval_v1',
          failureReviewPolicy:
            'cluster_recall_ranking_or_state_transition_failures',
          workerRuntime: expect.objectContaining({
            queueName: 'fitmeet.subagent.match-agent',
            timeoutMs: 30000,
            crashIsolation: false,
            scalable: false,
            modelUseCase: 'candidate_summary',
            model: 'deepseek-v4-pro',
          }),
        }),
      }),
    );
    expect(l5Runtime.recordSubagentMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        agentName: 'Match Agent',
        memoryScope: 'matching.worker_memory',
        evalHints: expect.objectContaining({
          evalRunner: 'match_recall_ranking_and_meet_loop_eval_v1',
          failureReview: expect.objectContaining({
            nextStep: 'store_as_successful_subagent_trace',
          }),
        }),
      }),
    );
  });

  it('records bounded subagent memory without raw private context or contact data', async () => {
    const l5Runtime = {
      recordSubagentMemory: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      l5Runtime as never,
    );
    const recentMessages = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content:
        index === 2
          ? '私聊内容：我的手机号是15253005312，邮箱15253005312@163.com'
          : `历史消息-${index}`,
    }));
    const taskSlots = {
      activity: { value: '散步', state: 'completed' },
      time_window: { value: '今天晚上', state: 'completed' },
      location_text: { value: '青岛大学附近', state: 'completed' },
      candidate_preference: {
        value: '公开资料里有舞蹈相关标签的人优先',
        state: 'answered',
      },
    };

    await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Match Agent',
      goal: '找今晚青岛大学散步搭子',
      plannerInput: {
        route: { intent: 'social_search' },
        hydratedContext: {
          threadId: 'agent-task:101',
          recentMessages,
          taskSlots,
          taskSlotSummary: {
            时间: '今天晚上',
            地点: '青岛大学附近',
            活动: '散步',
            候选偏好: '公开资料里有舞蹈相关标签的人优先',
          },
          pendingApprovals: [{ id: 'approval-1' }],
          candidateActions: { savedIds: [22] },
          lifeGraphSummary: { stablePreference: '公共场所优先' },
        },
      },
      tools: [
        {
          toolName: 'recommendation_candidate_search',
          requiresApproval: false,
          input: {
            recentMessages,
            contactPhone: '15253005312',
            contactEmail: '15253005312@163.com',
            secret: 'raw-private-token',
          },
        },
      ],
      runner: jest.fn().mockResolvedValue({
        handled: true,
        candidateCount: 3,
        explanation: '同城、低强度、公开资料匹配',
        phone: '15253005312',
        email: '15253005312@163.com',
        privateConversation: recentMessages,
        results: Array.from({ length: 20 }, (_, index) => ({
          id: index,
          privateNote: `raw-private-note-${index}`,
        })),
      }),
    });

    const memoryPayload = l5Runtime.recordSubagentMemory.mock.calls[0]?.[0];
    const serialized = JSON.stringify(memoryPayload);
    expect(serialized).not.toContain('15253005312');
    expect(serialized).not.toContain('15253005312@163.com');
    expect(serialized).not.toContain('raw-private-token');
    expect(serialized).not.toContain('私聊内容');
    expect(serialized).not.toContain('raw-private-note');
    const recordedToolCall = memoryPayload.toolCalls[0] as {
      inputKeys?: string[];
    };
    expect(recordedToolCall.inputKeys).toEqual(
      expect.arrayContaining(['hydratedContext', 'route']),
    );
    expect(recordedToolCall.inputKeys).toEqual(
      expect.not.arrayContaining([
        'contactEmail',
        'contactPhone',
        'recentMessages',
        'secret',
      ]),
    );
    expect(memoryPayload).toEqual(
      expect.objectContaining({
        plannerInput: expect.objectContaining({
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'activity',
              'time_window',
              'location_text',
              'candidate_preference',
            ]),
            userVisibleSummary: expect.stringContaining('地点：青岛大学附近'),
          }),
          contextSummary: expect.objectContaining({
            contextSource: 'hydratedContext',
            recentTurnCount: 40,
            hasRecentMessages: true,
            knownSlotCount: 4,
            doNotAskAgainCount: 4,
            pendingApprovalCount: 1,
            hasLifeGraphSummary: true,
          }),
        }),
        toolCalls: [
          expect.objectContaining({
            toolName: 'recommendation_candidate_search',
          }),
        ],
        observation: expect.objectContaining({
          candidateCount: 3,
          summary: '同城、低强度、公开资料匹配',
          resultCount: 20,
          knownTaskSlotConstraints: expect.objectContaining({
            userVisibleSummary: expect.stringContaining('活动：散步'),
          }),
        }),
        handoffOutput: expect.objectContaining({
          workerTrace: expect.objectContaining({
            knownTaskSlotConstraints: expect.objectContaining({
              knownSlots: expect.arrayContaining([
                expect.objectContaining({
                  key: 'location_text',
                  value: '青岛大学附近',
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it('keeps high-risk subagent tools behind approval boundaries', async () => {
    const service = new FitMeetSubagentWorkerService(new AgentLoopService());
    const runner = jest.fn();

    const result = await service.run({
      agent: 'Match Agent',
      goal: '直接发送邀请',
      plannerInput: { candidateUserId: 22 },
      tools: [
        {
          toolName: 'send_message_to_candidate',
          input: { candidateUserId: 22 },
          requiresApproval: true,
        },
      ],
      runner,
    });

    expect(runner).not.toHaveBeenCalled();
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        independentWorker: true,
        requiresApproval: true,
        failureReview: expect.objectContaining({
          reason: 'approval_boundary',
          nextStep: 'wait_for_user_or_admin_approval',
        }),
      }),
    );
    expect(result.handoff.handoffOutput).toEqual(
      expect.objectContaining({
        answerBoundary: expect.objectContaining({
          fromObservationsOnly: true,
          requiresApproval: true,
        }),
        failureReview: expect.objectContaining({
          reason: 'approval_boundary',
          nextStep: 'wait_for_user_or_admin_approval',
        }),
      }),
    );
    expect(result.loop.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'blocked',
          observation: expect.objectContaining({
            approvalRequired: true,
          }),
        }),
      ]),
    );
  });

  it('runs through the resident worker runtime when available', async () => {
    const workerRuntime = {
      submit: jest.fn(({ agent, runId, signal, job }) =>
        job({
          workerId: 'subagent:match-agent:resident',
          agent,
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.match-agent',
          timeoutMs: 15000,
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-worker-test',
          runId,
          signal,
        }),
      ),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      workerRuntime as never,
    );

    const result = await service.run({
      agent: 'Match Agent',
      goal: '找一个周末咖啡搭子',
      plannerInput: { city: '上海', activityType: '咖啡' },
      tools: [
        {
          toolName: 'rank_candidates',
          input: { city: '上海' },
        },
      ],
      runner: jest.fn().mockResolvedValue({ candidateCount: 3 }),
    });

    expect(workerRuntime.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'Match Agent',
        runId: expect.stringContaining('subagent:match-agent'),
      }),
    );
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        residentWorker: true,
        workerRuntime: expect.objectContaining({
          workerId: 'subagent:match-agent:resident',
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.match-agent',
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-worker-test',
        }),
      }),
    );
    expect(result.handoff.handoffOutput).toEqual(
      expect.objectContaining({
        workerRuntime: expect.objectContaining({
          workerId: 'subagent:match-agent:resident',
        }),
      }),
    );
  });

  it('serializes hydrated context into the worker command snapshot before queue dispatch', async () => {
    const workerRuntime = {
      submit: jest.fn(({ agent, runId, signal, job }) =>
        job({
          workerId: 'subagent:match-agent:resident',
          agent,
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.match-agent',
          timeoutMs: 30000,
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-v4-pro',
          runId,
          signal,
        }),
      ),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      workerRuntime as never,
    );
    const hydratedContext = {
      threadId: 'agent-task:101',
      recentMessages: [{ role: 'user', text: '今天晚上青岛大学散步' }],
      taskMemory: {
        currentGoal: '今晚青岛大学附近散步',
        preferences: { activity: '散步', intensity: '低强度' },
        boundaries: { publicPlaceOnly: true },
      },
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
      pendingApprovals: [{ id: 'approval-1', action: 'send_invite' }],
      candidateActions: { savedIds: [22] },
      lifeGraphSummary: { preferences: { activity: '散步' } },
    };

    const result = await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Match Agent',
      goal: '可以，帮我找人',
      plannerInput: {
        route: { intent: 'social_search' },
        taskContext: { recentMessages: [] },
        hydratedContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: {},
        },
      ],
      runner: jest.fn().mockResolvedValue({ queued: true }),
    });

    const submitPayload = workerRuntime.submit.mock.calls[0]?.[0] as {
      serializedPayload?: Record<string, unknown>;
    };
    expect(
      isFitMeetSubagentWorkerCommand(submitPayload.serializedPayload),
    ).toBe(true);
    expect(submitPayload.serializedPayload).toEqual(
      expect.objectContaining({
        contract: 'fitmeet.subagent.worker.command',
        commandType: 'route_branch.execute',
        agentName: 'Match Agent',
        queueName: 'fitmeet.subagent.match-agent',
        runtimeIdentity: expect.objectContaining({
          threadId: 'agent-task:101',
          taskId: 101,
        }),
        safety: {
          highRiskToolsRequireApproval: true,
          answerFromObservationsOnly: true,
        },
      }),
    );
    const normalized = normalizeSubagentWorkerPayload(
      submitPayload.serializedPayload!,
    );
    expect(normalized).toEqual(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        contextSnapshot: expect.objectContaining({
          threadId: 'agent-task:101',
          recentMessages: hydratedContext.recentMessages,
          taskMemory: hydratedContext.taskMemory,
          taskSlots: hydratedContext.taskSlots,
          taskSlotSummary: hydratedContext.taskSlotSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
              'candidate_preference',
            ]),
            userVisibleSummary:
              expect.stringContaining('候选偏好：女生、舞蹈相关'),
            candidatePreferencePolicy:
              expect.stringContaining('公开可发现资料'),
          }),
          pendingApprovals: hydratedContext.pendingApprovals,
          candidateActions: hydratedContext.candidateActions,
          lifeGraphSummary: hydratedContext.lifeGraphSummary,
        }),
      }),
    );
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        workerTrace: expect.objectContaining({
          knownTaskSlotConstraints: expect.objectContaining({
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

  it('serializes only the protected context window into queue worker payloads', async () => {
    const workerRuntime = {
      submit: jest.fn(({ agent, runId, signal, job }) =>
        job({
          workerId: 'subagent:match-agent:resident',
          agent,
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.match-agent',
          timeoutMs: 30000,
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-v4-pro',
          runId,
          signal,
        }),
      ),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      workerRuntime as never,
    );
    const recentMessages = Array.from({ length: 86 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${index}`,
    }));

    await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Match Agent',
      goal: '继续找人',
      plannerInput: {
        hydratedContext: {
          threadId: 'agent-task:101',
          recentMessages,
        },
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: {},
        },
      ],
      runner: jest.fn().mockResolvedValue({ queued: true }),
    });

    const submitPayload = workerRuntime.submit.mock.calls[0]?.[0] as {
      serializedPayload?: Record<string, unknown>;
    };
    expect(
      isFitMeetSubagentWorkerCommand(submitPayload.serializedPayload),
    ).toBe(true);
    const normalized = normalizeSubagentWorkerPayload(
      submitPayload.serializedPayload!,
    );
    const submittedMessages = normalized?.contextSnapshot?.recentMessages ?? [];
    expect(submittedMessages).toHaveLength(SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS);
    expect(submittedMessages[0]).toMatchObject({ content: 'turn-6' });
    expect(submittedMessages.at(-1)).toMatchObject({ content: 'turn-85' });
  });

  it('uses the configured long context window when serializing queued worker commands', async () => {
    const workerRuntime = {
      submit: jest.fn(({ agent, runId, signal, job }) =>
        job({
          workerId: 'subagent:match-agent:resident',
          agent,
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.match-agent',
          timeoutMs: 30000,
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-v4-pro',
          runId,
          signal,
        }),
      ),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      workerRuntime as never,
      undefined,
      undefined,
      makeConfig({ SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '80' }) as never,
    );
    const recentMessages = Array.from({ length: 90 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${index}`,
    }));

    await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Match Agent',
      goal: '继续找人',
      plannerInput: {
        hydratedContext: {
          threadId: 'agent-task:101',
          recentMessages,
        },
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: {},
        },
      ],
      runner: jest.fn().mockResolvedValue({ queued: true }),
    });

    const submitPayload = workerRuntime.submit.mock.calls[0]?.[0] as {
      serializedPayload?: Record<string, unknown>;
    };
    expect(
      isFitMeetSubagentWorkerCommand(submitPayload.serializedPayload),
    ).toBe(true);
    const normalized = normalizeSubagentWorkerPayload(
      submitPayload.serializedPayload!,
    );
    const submittedMessages = normalized?.contextSnapshot?.recentMessages ?? [];
    expect(submittedMessages).toHaveLength(80);
    expect(submittedMessages[0]).toMatchObject({ content: 'turn-10' });
    expect(submittedMessages.at(-1)).toMatchObject({ content: 'turn-89' });
  });

  it('promotes nested task memory into queued worker commands when top-level slots are absent', async () => {
    const workerRuntime = {
      submit: jest.fn(({ agent, runId, signal, job }) =>
        job({
          workerId: 'subagent:match-agent:resident',
          agent,
          mode: 'resident_in_process',
          queueName: 'fitmeet.subagent.match-agent',
          timeoutMs: 30000,
          crashIsolation: false,
          scalable: false,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-v4-pro',
          runId,
          signal,
        }),
      ),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      workerRuntime as never,
    );
    const hydratedContext = {
      threadId: 'agent-task:101',
      recentMessages: [{ role: 'user', content: '可以，帮我找人' }],
      taskMemory: {
        currentGoal: '今晚青岛大学附近散步',
        taskSlots: {
          time_window: { value: '今晚', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
          candidate_preference: {
            value: '女生、舞蹈相关',
            state: 'answered',
          },
        },
        taskSlotSummary: {
          时间: '今晚',
          地点: '青岛大学附近',
          活动: '散步',
          候选偏好: '女生、舞蹈相关',
        },
        pendingActions: [{ id: 'approval-1', action: 'send_invite' }],
        candidateState: { savedIds: [22], skippedIds: [29] },
        lifeGraphSummary: {
          preferences: ['低强度散步'],
          boundaries: ['第一次见面只接受公共场所'],
        },
      },
    };

    await service.run({
      ownerUserId: 7,
      taskId: 101,
      agent: 'Match Agent',
      goal: '可以，帮我找人',
      plannerInput: {
        route: { intent: 'social_search' },
        hydratedContext,
      },
      tools: [
        {
          toolName: 'social_match_search_turn',
          input: {},
        },
      ],
      runner: jest.fn().mockResolvedValue({ queued: true }),
    });

    const submitPayload = workerRuntime.submit.mock.calls[0]?.[0] as {
      serializedPayload?: Record<string, unknown>;
    };
    expect(
      isFitMeetSubagentWorkerCommand(submitPayload.serializedPayload),
    ).toBe(true);
    const normalized = normalizeSubagentWorkerPayload(
      submitPayload.serializedPayload!,
    );
    expect(normalized).toEqual(
      expect.objectContaining({
        taskContext: expect.objectContaining({
          taskSlots: hydratedContext.taskMemory.taskSlots,
          taskSlotSummary: hydratedContext.taskMemory.taskSlotSummary,
          pendingApprovals: hydratedContext.taskMemory.pendingActions,
          candidateActions: hydratedContext.taskMemory.candidateState,
          lifeGraphSummary: hydratedContext.taskMemory.lifeGraphSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
              'candidate_preference',
            ]),
          }),
        }),
        contextSnapshot: expect.objectContaining({
          taskSlots: hydratedContext.taskMemory.taskSlots,
          taskSlotSummary: hydratedContext.taskMemory.taskSlotSummary,
          pendingApprovals: hydratedContext.taskMemory.pendingActions,
          candidateActions: hydratedContext.taskMemory.candidateState,
          lifeGraphSummary: hydratedContext.taskMemory.lifeGraphSummary,
          knownTaskSlotConstraints: expect.objectContaining({
            userVisibleSummary:
              expect.stringContaining('候选偏好：女生、舞蹈相关'),
          }),
        }),
      }),
    );
  });

  it('executes a versioned DB worker command without a main-process closure', async () => {
    const l5Runtime = {
      recordSubagentMemory: jest.fn().mockResolvedValue(undefined),
    };
    const dispatcher = {
      normalizePayload: jest.fn((payload) => ({
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Match Agent',
        goal: '找跑步搭子',
        plannerInput: { route: { intent: 'find_partner' } },
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        memoryScope: 'matching.worker_memory',
        maxToolCalls: 1,
        maxRetries: 0,
        timeoutMs: 15000,
        route: { intent: 'find_partner' },
        ...(payload as Record<string, unknown>),
      })),
      dispatch: jest.fn().mockResolvedValue({
        task: { id: 101 },
        state: { assistantMessage: '已完成搜索' },
        observation: {
          branch: 'search',
          handled: true,
          candidateCount: 2,
        },
      }),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      l5Runtime as never,
      undefined,
      dispatcher as never,
    );
    const taskContext = {
      recentMessages: [{ role: 'user', content: '今晚青岛大学散步' }],
      taskMemory: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今晚', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          geo_area: { value: '崂山区', state: 'inferred' },
          intensity: { value: '低强度', state: 'inferred' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的人优先',
            state: 'answered',
          },
        },
      },
    };
    const payload = buildFitMeetSubagentWorkerCommand({
      runId: 'run-command-1',
      agentName: 'Match Agent',
      queueName: 'fitmeet.subagent.match-agent',
      ownerUserId: 7,
      taskId: 101,
      goal: '找跑步搭子',
      plannerInput: { route: { intent: 'find_partner' }, taskContext },
      tools: [{ toolName: 'social_match_search_turn', input: {} }],
      memoryScope: 'matching.worker_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs: 15000,
      route: { intent: 'find_partner' } as never,
      taskContext,
      workerRuntime: {
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 15000,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
      },
    });

    const result = await service.executeQueuedJob({
      job: {
        id: 55,
        agentName: 'Match Agent',
        queueName: 'fitmeet.subagent.match-agent',
        status: 'running',
        attempts: 1,
        maxAttempts: 3,
        payload,
        runId: 'run-command-1',
        traceId: 'run-command-1',
      } as never,
      context: {
        workerId: 'worker:process:1',
        agent: 'Match Agent',
        mode: 'queue_worker_ready',
        queueName: 'fitmeet.subagent.match-agent',
        timeoutMs: 15000,
        crashIsolation: true,
        scalable: true,
        modelUseCase: 'candidate_summary',
        model: 'deepseek-worker-test',
        runId: 'run-command-1',
      },
    });

    expect(dispatcher.normalizePayload).toHaveBeenCalledWith(payload);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'social_match_search_turn',
      }),
    );
    expect(result.workerOutput).toEqual(
      expect.objectContaining({
        taskId: 101,
        observation: expect.objectContaining({
          handled: true,
          candidateCount: 2,
        }),
        workerTrace: expect.objectContaining({
          source: 'subagent_worker_job',
          workerJobId: 55,
          commandId: payload.commandId,
          commandType: 'route_branch.execute',
          commandContract: 'fitmeet.subagent.worker.command',
          queueName: 'fitmeet.subagent.match-agent',
          runId: 'run-command-1',
          traceId: 'run-command-1',
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'activity',
              'time_window',
              'location_text',
              'candidate_preference',
            ]),
            userVisibleSummary: expect.stringContaining('时间：今晚'),
            knownSlots: expect.arrayContaining([
              expect.objectContaining({
                key: 'geo_area',
                value: '崂山区',
                confirmation: 'inferred_context',
              }),
              expect.objectContaining({
                key: 'intensity',
                value: '低强度',
                confirmation: 'inferred_context',
              }),
            ]),
          }),
        }),
      }),
    );
    expect(result.handoff.evalHints).toEqual(
      expect.objectContaining({
        queueWorkerReady: true,
        externalProcessReady: false,
        workerRuntime: expect.objectContaining({
          workerId: 'worker:process:1',
          mode: 'queue_worker_ready',
        }),
        workerTrace: expect.objectContaining({
          workerJobId: 55,
          commandId: payload.commandId,
          commandVersion: 1,
          workerRuntime: expect.objectContaining({
            workerId: 'worker:process:1',
            mode: 'queue_worker_ready',
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            candidatePreferencePolicy:
              expect.stringContaining('公开可发现资料'),
          }),
        }),
      }),
    );
    expect(result.handoff.handoffOutput).toEqual(
      expect.objectContaining({
        workerTrace: expect.objectContaining({
          workerJobId: 55,
          commandId: payload.commandId,
          knownTaskSlotConstraints: expect.objectContaining({
            instruction: expect.stringContaining('不得重复询问'),
          }),
        }),
      }),
    );
    expect(l5Runtime.recordSubagentMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        agentName: 'Match Agent',
        evalHints: expect.objectContaining({
          workerTrace: expect.objectContaining({
            workerJobId: 55,
            commandId: payload.commandId,
            knownTaskSlotConstraints: expect.objectContaining({
              doNotAskAgainFor: expect.arrayContaining([
                'activity',
                'time_window',
                'location_text',
                'candidate_preference',
              ]),
            }),
          }),
        }),
        handoffOutput: expect.objectContaining({
          workerTrace: expect.objectContaining({
            workerJobId: 55,
            commandId: payload.commandId,
            knownTaskSlotConstraints: expect.objectContaining({
              userVisibleSummary: expect.stringContaining('地点：青岛大学附近'),
            }),
          }),
        }),
      }),
    );
    const workerTrace = result.workerOutput?.workerTrace as Record<
      string,
      unknown
    >;
    const constraints = workerTrace.knownTaskSlotConstraints as Record<
      string,
      unknown
    >;
    expect(constraints.doNotAskAgainFor).toEqual(
      expect.not.arrayContaining(['geo_area', 'intensity']),
    );
  });

  it('uses queued worker context signal to stop before tool dispatch', async () => {
    const dispatcher = {
      normalizePayload: jest.fn((payload) => ({
        kind: 'route_branch',
        ownerUserId: 7,
        taskId: 101,
        agent: 'Match Agent',
        goal: '找跑步搭子',
        plannerInput: { route: { intent: 'find_partner' } },
        tools: [{ toolName: 'social_match_search_turn', input: {} }],
        memoryScope: 'matching.worker_memory',
        maxToolCalls: 1,
        maxRetries: 0,
        timeoutMs: 15000,
        route: { intent: 'find_partner' },
        ...(payload as Record<string, unknown>),
      })),
      dispatch: jest.fn().mockResolvedValue({
        task: { id: 101 },
        state: { assistantMessage: 'should not run' },
        observation: { handled: true },
      }),
    };
    const service = new FitMeetSubagentWorkerService(
      new AgentLoopService(),
      undefined,
      undefined,
      dispatcher as never,
    );
    const controller = new AbortController();
    controller.abort(new Error('queue_cancelled'));

    await expect(
      service.executeQueuedJob({
        job: {
          id: 56,
          agentName: 'Match Agent',
          queueName: 'fitmeet.subagent.match-agent',
          status: 'running',
          attempts: 1,
          maxAttempts: 3,
          payload: buildFitMeetSubagentWorkerCommand({
            runId: 'run-command-aborted',
            agentName: 'Match Agent',
            queueName: 'fitmeet.subagent.match-agent',
            ownerUserId: 7,
            taskId: 101,
            goal: '找跑步搭子',
            plannerInput: { route: { intent: 'find_partner' } },
            tools: [{ toolName: 'social_match_search_turn', input: {} }],
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
          }),
          runId: 'run-command-aborted',
          traceId: 'run-command-aborted',
        } as never,
        context: {
          workerId: 'worker:process:1',
          agent: 'Match Agent',
          mode: 'queue_worker_ready',
          queueName: 'fitmeet.subagent.match-agent',
          timeoutMs: 15000,
          crashIsolation: true,
          scalable: true,
          modelUseCase: 'candidate_summary',
          model: 'deepseek-worker-test',
          runId: 'run-command-aborted',
          signal: controller.signal,
        },
      }),
    ).rejects.toThrow('AgentLoop aborted');

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
