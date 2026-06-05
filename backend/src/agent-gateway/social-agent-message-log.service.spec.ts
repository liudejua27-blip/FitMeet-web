import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: 11,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天',
    goal: '帮我找跑步搭子',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
    updatedAt: new Date('2026-06-05T00:00:00.000Z'),
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouteResult> = {},
): SocialAgentIntentRouteResult {
  const pendingApproval = overrides.pendingApproval ?? null;
  return {
    intent: 'action_request',
    confidence: 0.92,
    entities: {
      city: '青岛',
      activityType: '跑步',
      targetGender: '',
      timePreference: '周末',
      locationPreference: '操场',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: true,
    replyStrategy: 'direct_reply',
    source: 'rules',
    action: 'reply',
    taskId: 101,
    assistantMessage: '我先帮你拟一条开场白。',
    savedContext: false,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval,
    activityResults: [],
    profileUpdateProposal: null,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  };
}

function makePendingApproval(): SocialAgentPendingApprovalSnapshot {
  return {
    id: 301,
    type: 'send_message' as never,
    actionType: 'send_message',
    summary: '发送第一条消息',
    riskLevel: 'low' as never,
    payload: { targetUserId: 22 },
    expiresAt: '2026-06-05T01:00:00.000Z',
  };
}

function makeHarness() {
  const savedEvents: Array<Record<string, unknown>> = [];
  const taskRepo = {
    save: jest.fn((input: AgentTask) => Promise.resolve(input)),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const service = new SocialAgentMessageLogService(
    taskRepo as never,
    eventRepo as never,
  );
  return { eventRepo, savedEvents, service, taskRepo };
}

describe('SocialAgentMessageLogService', () => {
  it('records user messages into conversation memory, short-term memory, and task events', async () => {
    const task = makeTask();
    const { savedEvents, service, taskRepo } = makeHarness();

    await service.recordUserMessage(task, '帮我找青岛附近的跑步搭子');

    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(task.statusReason).toBe('user_message_received');
    expect(task.memory).toMatchObject({
      socialAgentConversation: {
        turns: [
          expect.objectContaining({
            role: 'user',
            text: '帮我找青岛附近的跑步搭子',
          }),
        ],
      },
      shortTerm: {
        recentTurns: [
          expect.objectContaining({
            role: 'user',
            text: '帮我找青岛附近的跑步搭子',
          }),
        ],
      },
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.User,
        eventType: AgentTaskEventType.SocialAgentMessageUser,
        payload: expect.objectContaining({
          message: '帮我找青岛附近的跑步搭子',
          createdAt: expect.any(String),
        }),
        taskId: 101,
      }),
    ]);
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });

  it('records intent route decisions as system events', async () => {
    const task = makeTask();
    const { savedEvents, service } = makeHarness();

    await service.recordIntentRoute(
      task,
      makeRoute({ intent: 'social_search' }),
    );

    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.System,
        eventType: AgentTaskEventType.Note,
        payload: expect.objectContaining({
          intent: 'social_search',
          confidence: 0.92,
          replyStrategy: 'direct_reply',
        }),
      }),
    ]);
  });

  it('records assistant messages with pending approval, latest route, and timeline payload', async () => {
    const task = makeTask();
    const { savedEvents, service, taskRepo } = makeHarness();
    const pendingApproval = makePendingApproval();
    const queuedRun = {
      runId: 'sar_message_1',
      taskId: 101,
      status: 'queued',
      phase: 'queued',
      message: '已排队',
      visibleSteps: [],
      queuedAt: '2026-06-05T00:00:00.000Z',
      startedAt: null,
      updatedAt: '2026-06-05T00:00:00.000Z',
      completedAt: null,
      failedAt: null,
      pollAfterMs: 1500,
      error: null,
      replan: null,
      result: null,
    } as never;
    const route = makeRoute({
      pendingApproval,
      queuedRun,
      shouldQueueRun: true,
      action: 'queue_search',
      activityResults: [{ id: 'activity_1', title: '周末慢跑局' } as never],
    });

    await service.recordAssistantMessage(task, '我先帮你拟一条开场白。', route);

    expect(task.memory).toMatchObject({
      socialAgentConversation: {
        turns: [
          expect.objectContaining({
            role: 'assistant',
            text: '我先帮你拟一条开场白。',
            kind: 'approval',
            pendingApproval: expect.objectContaining({ id: 301 }),
            activityResults: [expect.objectContaining({ id: 'activity_1' })],
          }),
        ],
      },
      shortTerm: {
        lastAgentActions: [
          expect.objectContaining({
            action: 'queue_search',
            intent: 'action_request',
            status: 'queued',
          }),
        ],
      },
    });
    expect(task.result).toMatchObject({
      latestMessageRoute: {
        intent: 'action_request',
        confidence: 0.92,
        action: 'queue_search',
        shouldQueueRun: true,
        runId: 'sar_message_1',
        at: expect.any(String),
      },
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.Agent,
        eventType: AgentTaskEventType.SocialAgentMessageAssistant,
        payload: expect.objectContaining({
          message: '我先帮你拟一条开场白。',
          action: 'queue_search',
          queuedRunId: 'sar_message_1',
          pendingApproval: expect.objectContaining({ id: 301 }),
          activityResults: [expect.objectContaining({ id: 'activity_1' })],
        }),
      }),
    ]);
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });

  it('adds safety advice for safety boundary assistant messages', async () => {
    const task = makeTask();
    const { savedEvents, service } = makeHarness();

    await service.recordAssistantMessage(
      task,
      '这个请求不适合继续。',
      makeRoute({
        intent: 'safety_or_boundary',
        action: 'answer',
        shouldExecuteAction: false,
      }),
    );

    expect(savedEvents[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          riskAdvice: '首次线下见面建议选择公开场所，并保留平台内沟通记录。',
        }),
      }),
    );
  });
});
