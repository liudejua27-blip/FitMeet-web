import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import { SocialAgentMainAgentTurnEventsService } from './social-agent-main-agent-turn-events.service';
import { SocialAgentMainAgentTurnResultService } from './social-agent-main-agent-turn-result.service';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: AgentTaskRiskLevel.Low,
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

function makeDecision(
  overrides: Partial<FitMeetAlphaTurnDecision> = {},
): FitMeetAlphaTurnDecision {
  return {
    traceId: 'trace-main-agent',
    safety: {
      blocked: false,
      level: 'low',
      reasons: [],
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    agentTrace: {
      traceId: 'trace-main-agent',
      sdkEnabled: false,
      model: 'local',
      agentPath: ['FitMeet Main Agent'],
      handoffs: [],
      guardrails: [],
    },
    cards: [],
    structuredIntent: {},
    ...overrides,
  };
}

function makeHarness(
  alphaTurn?: FitMeetAlphaTurnDecision,
  overrides: { contextHydrator?: Record<string, unknown> | null } = {},
) {
  const savedEvents: Array<Record<string, unknown>> = [];
  const taskRepo = {
    save: jest.fn((task: AgentTask) => Promise.resolve(task)),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
    find: jest.fn(() =>
      Promise.resolve(
        savedEvents.map((event, index) => ({
          id: index + 1,
          stepId: null,
          toolCallId: null,
          createdAt: new Date(index),
          ...event,
        })),
      ),
    ),
  };
  const messageLog = {
    recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
  };
  const metrics = {
    observeRouteLatency: jest.fn(),
    recordAction: jest.fn(),
  };
  const alphaAgent = {
    prepareTurn: jest.fn().mockResolvedValue(alphaTurn),
  };
  const tonePolicy = {
    safeAssistantMessage: jest.fn(
      (question: string, fallback: string) => question || fallback,
    ),
  };
  const turnResults = new SocialAgentMainAgentTurnResultService(
    taskRepo as never,
    new SocialAgentMainAgentTurnEventsService(eventRepo as never),
    messageLog as never,
    metrics as never,
    tonePolicy as never,
  );
  const service = new SocialAgentMainAgentTurnService(
    turnResults as never,
    alphaAgent as never,
    undefined,
    overrides.contextHydrator as never,
  );
  return {
    alphaAgent,
    eventRepo,
    messageLog,
    metrics,
    savedEvents,
    service,
    taskRepo,
    tonePolicy,
  };
}

describe('SocialAgentMainAgentTurnService', () => {
  it('returns null when Main Agent has no early route decision', async () => {
    const { alphaAgent, service, taskRepo } = makeHarness(
      makeDecision({ structuredIntent: { requiresSearch: true } }),
    );
    const task = makeTask();

    const result = await service.handleRouteTurn({
      ownerUserId: 7,
      task,
      message: '帮我找跑步搭子',
      hasCandidates: false,
      startedAt: Date.now(),
    });

    expect(result).toMatchObject({ task, result: null });
    expect(alphaAgent.prepareTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        message: '帮我找跑步搭子',
        context: { hasCandidates: false },
      }),
    );
    expect(taskRepo.save).not.toHaveBeenCalled();
  });

  it('hydrates task memory into Alpha Agent context before route decisions', async () => {
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        recentMessages: [
          { role: 'user', text: '今晚青岛大学散步，找女生舞蹈生' },
        ],
        taskMemory: {
          currentGoal: '今晚青岛大学散步',
          pendingActions: [],
        },
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
        knownTaskSlotConstraints: {
          treatAsHardConstraints: true,
          knownSlots: [
            {
              key: 'time_window',
              label: '时间',
              value: '今晚',
              state: 'completed',
              confirmation: 'user_confirmed',
            },
            {
              key: 'location_text',
              label: '地点',
              value: '青岛大学附近',
              state: 'completed',
              confirmation: 'user_confirmed',
            },
            {
              key: 'activity',
              label: '活动',
              value: '散步',
              state: 'completed',
              confirmation: 'user_confirmed',
            },
            {
              key: 'candidate_preference',
              label: '候选偏好',
              value: '女生、舞蹈相关',
              state: 'answered',
              confirmation: 'user_confirmed',
            },
          ],
          doNotAskAgainFor: [
            'time_window',
            'location_text',
            'activity',
            'candidate_preference',
          ],
          userVisibleSummary:
            '时间：今晚；地点：青岛大学附近；活动：散步；候选偏好：女生、舞蹈相关',
          candidatePreferencePolicy:
            'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
          instruction:
            'planner/router/Brain/subagent 必须基于 knownSlots 继续推进；除非用户主动修改，否则不得重复询问 doNotAskAgainFor 中的字段。',
        },
        pendingApprovals: [],
        candidateActions: { recommendedIds: [12] },
        lifeGraphSummary: { preferences: { intensity: '低强度' } },
        lifeGraphGovernanceSummary: {
          total: 2,
          autoSaveCount: 1,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
      }),
    };
    const { alphaAgent, service } = makeHarness(
      makeDecision({ structuredIntent: { requiresSearch: true } }),
      { contextHydrator },
    );
    const task = makeTask();

    await service.handleRouteTurn({
      ownerUserId: 7,
      task,
      message: '可以，帮我找人',
      hasCandidates: true,
      startedAt: Date.now(),
    });

    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 101,
      threadId: 'agent-task:101',
      mode: 'answer',
    });
    expect(alphaAgent.prepareTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          hasCandidates: true,
          taskSlots: expect.objectContaining({
            time_window: expect.objectContaining({ value: '今晚' }),
            location_text: expect.objectContaining({
              value: '青岛大学附近',
            }),
            activity: expect.objectContaining({ value: '散步' }),
            candidate_preference: expect.objectContaining({
              value: '女生、舞蹈相关',
            }),
          }),
          taskSlotSummary: expect.objectContaining({
            时间: '今晚',
            地点: '青岛大学附近',
            活动: '散步',
            候选偏好: '女生、舞蹈相关',
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'time_window',
              'location_text',
              'activity',
              'candidate_preference',
            ]),
            candidatePreferencePolicy:
              expect.stringContaining('公开可发现资料'),
            instruction: expect.stringContaining('不得重复询问'),
          }),
          lifeGraphGovernanceSummary: expect.objectContaining({
            autoSaveCount: 1,
          }),
          recentMessages: expect.arrayContaining([
            expect.objectContaining({ text: '今晚青岛大学散步，找女生舞蹈生' }),
          ]),
          pendingApprovals: [],
        }),
      }),
    );
  });

  it('passes through the Main Agent decision when run turns continue normally', async () => {
    const { service } = makeHarness(
      makeDecision({ structuredIntent: { requiresSearch: true } }),
    );

    const result = await service.handleRunTurn({
      ownerUserId: 7,
      task: makeTask(),
      message: '帮我找跑步搭子',
      permissionMode: AgentTaskPermissionMode.Confirm,
      visibleSteps: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result).toMatchObject({ result: null });
    expect(result.alphaTurn).toMatchObject({
      structuredIntent: { requiresSearch: true },
    });
  });

  it('blocks unsafe Main Agent turns and records the assistant message', async () => {
    const blockedTurn = makeDecision({
      assistantMessage: '这个请求不符合 FitMeet 的安全边界。',
      safety: {
        blocked: true,
        level: 'blocked',
        reasons: ['unsafe_request'],
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      cards: [
        {
          id: 'safety',
          type: 'safety_boundary',
          title: '安全提醒',
          data: {},
          actions: [],
        },
      ],
      structuredIntent: { intent: 'unsafe' },
    });
    const { messageLog, metrics, savedEvents, service, taskRepo } =
      makeHarness(blockedTurn);
    const task = makeTask();

    const { result } = await service.handleRouteTurn({
      ownerUserId: 7,
      task,
      message: '危险请求',
      hasCandidates: false,
      startedAt: Date.now(),
    });

    expect(result).toMatchObject({
      intent: 'safety_or_boundary',
      action: 'answer',
      assistantMessage: '这个请求不符合 FitMeet 的安全边界。',
      savedContext: true,
      shouldQueueRun: false,
      traceId: 'trace-main-agent',
    });
    expect(task.status).toBe(AgentTaskStatus.Failed);
    expect(task.riskLevel).toBe(AgentTaskRiskLevel.Blocked);
    expect(task.statusReason).toBe('main_agent_guardrail_blocked');
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(savedEvents).toEqual([
      expect.objectContaining({
        eventType: AgentTaskEventType.TaskFailed,
        summary: 'Main Agent 已拦截不安全请求',
      }),
    ]);
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '这个请求不符合 FitMeet 的安全边界。',
      result,
    );
    expect(metrics.observeRouteLatency).toHaveBeenCalledWith(
      expect.any(Number),
    );
  });

  it('asks a clarification without queueing search when Main Agent needs more context', async () => {
    const clarifyingTurn = makeDecision({
      structuredIntent: {
        readiness: 'clarify',
        requiresSearch: false,
        clarifyingQuestion: '你更想今晚附近走走，还是周末下午？',
      },
    });
    const { messageLog, metrics, savedEvents, service, taskRepo, tonePolicy } =
      makeHarness(clarifyingTurn);
    const task = makeTask();

    const { result } = await service.handleRouteTurn({
      ownerUserId: 7,
      task,
      message: '想找轻松一点的人',
      hasCandidates: false,
      startedAt: Date.now(),
    });

    expect(result).toMatchObject({
      intent: 'unknown',
      action: 'clarify',
      replyStrategy: 'ask_clarifying_question',
      assistantMessage: '你更想今晚附近走走，还是周末下午？',
      shouldQueueRun: false,
      cards: [],
    });
    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(task.statusReason).toBe('main_agent_waiting_for_clarification');
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(savedEvents).toEqual([
      expect.objectContaining({
        eventType: AgentTaskEventType.Note,
        summary: 'Main Agent 正在等待用户补充需求',
      }),
    ]);
    expect(tonePolicy.safeAssistantMessage).toHaveBeenCalled();
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '你更想今晚附近走走，还是周末下午？',
      result,
    );
    expect(metrics.recordAction).toHaveBeenCalledWith('clarify');
  });

  it('returns a blocked run result and emits stream updates', async () => {
    const blockedTurn = makeDecision({
      assistantMessage: '这个请求不符合 FitMeet 的安全边界。',
      safety: {
        blocked: true,
        level: 'blocked',
        reasons: ['unsafe_request'],
        boundaryNotes: [],
        requiredConfirmations: [],
      },
    });
    const { savedEvents, service, taskRepo } = makeHarness(blockedTurn);
    const task = makeTask();
    const visibleSteps = [];
    const emitted: Array<Record<string, unknown>> = [];

    const { result } = await service.handleRunTurn({
      ownerUserId: 7,
      task,
      message: '危险请求',
      permissionMode: AgentTaskPermissionMode.Confirm,
      visibleSteps,
      emit: (event) => {
        emitted.push(event as unknown as Record<string, unknown>);
      },
      visibleStepLabel: (_, label) => label,
    });

    expect(result).toMatchObject({
      taskId: 101,
      assistantMessage: '这个请求不符合 FitMeet 的安全边界。',
      candidates: [],
      socialRequestDraft: null,
      traceId: 'trace-main-agent',
    });
    expect(task.status).toBe(AgentTaskStatus.Failed);
    expect(task.riskLevel).toBe(AgentTaskRiskLevel.Blocked);
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(savedEvents[0]).toMatchObject({
      eventType: AgentTaskEventType.TaskFailed,
    });
    expect(visibleSteps).toEqual([
      expect.objectContaining({ id: 'main_agent_safety', status: 'failed' }),
    ]);
    expect(emitted).toEqual([
      expect.objectContaining({ type: 'step' }),
      expect.objectContaining({ type: 'result' }),
    ]);
  });

  it('returns a clarification run result and completes runtime callback', async () => {
    const clarifyingTurn = makeDecision({
      structuredIntent: {
        readiness: 'clarify',
        requiresSearch: false,
        clarifyingQuestion: '你更想今晚附近走走，还是周末下午？',
      },
    });
    const { savedEvents, service } = makeHarness(clarifyingTurn);
    const completeRuntimeClarification = jest.fn().mockResolvedValue(undefined);
    const task = makeTask();
    const visibleSteps = [];

    const { result } = await service.handleRunTurn({
      ownerUserId: 7,
      task,
      message: '想找轻松一点的人',
      permissionMode: AgentTaskPermissionMode.Confirm,
      visibleSteps,
      emit: jest.fn(),
      visibleStepLabel: (id, label) => `${id}:${label}`,
      completeRuntimeClarification,
    });

    expect(result).toMatchObject({
      taskId: 101,
      assistantMessage: '你更想今晚附近走走，还是周末下午？',
      candidates: [],
      socialRequestDraft: null,
      structuredIntent: {
        readiness: 'clarify',
        requiresSearch: false,
      },
    });
    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(visibleSteps).toEqual([
      expect.objectContaining({
        id: 'clarify',
        label: 'clarify:正在等待你补充需求',
      }),
    ]);
    expect(savedEvents[0]).toMatchObject({
      eventType: AgentTaskEventType.Note,
    });
    expect(completeRuntimeClarification).toHaveBeenCalledWith(result);
  });
});
