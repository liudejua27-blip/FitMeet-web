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

function makeHarness(alphaTurn?: FitMeetAlphaTurnDecision) {
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
      cards: [{ id: 'safety', type: 'safety_boundary', data: {}, actions: [] }],
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
