import { AgentApprovalService } from './agent-approval.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import {
  AgentRunCheckpointStatus,
  AgentRunCheckpointType,
} from './entities/agent-run-checkpoint.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { withSocialAgentStoredRun } from './social-agent-chat-run.presenter';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentSessionRestoreService } from './social-agent-session-restore.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  const task = {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天',
    goal: '帮我找跑步搭子',
    status: AgentTaskStatus.AwaitingConfirmation,
    statusReason: 'recommendations_ready',
    memory: {
      socialAgentChat: {
        conversation: [
          {
            id: 'turn_user_1',
            role: 'user',
            content: '帮我找跑步搭子',
            at: '2026-06-05T00:00:00.000Z',
          },
        ],
      },
      shortTerm: {
        candidateActions: {
          22: { targetUserId: 22, send: 'drafted' },
        },
      },
    },
    result: {},
    updatedAt: new Date('2026-06-05T00:04:00.000Z'),
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
    ...overrides,
  } as unknown as AgentTask;
  task.result = withSocialAgentStoredRun(task.result, {
    taskId: task.id,
    runId: 'sar_restore_1',
    status: 'completed',
    phase: 'completed',
    message: '已完成',
    visibleSteps: [{ id: 'done', label: '完成', status: 'done' }],
    queuedAt: '2026-06-05T00:00:00.000Z',
    startedAt: '2026-06-05T00:01:00.000Z',
    updatedAt: '2026-06-05T00:03:00.000Z',
    completedAt: '2026-06-05T00:03:00.000Z',
    failedAt: null,
    pollAfterMs: 1500,
    error: null,
    replan: null,
    result: {
      taskId: task.id,
      status: task.status,
      visibleSteps: [{ id: 'done', label: '完成', status: 'done' }],
      assistantMessage: '我找到了一个合适候选人',
      socialRequestDraft: null,
      candidates: [{ userId: 22, nickname: 'Alex' } as never],
      approvalRequiredActions: [],
      events: [],
    },
  });
  return task;
}

function makeEvent(): AgentTaskEvent {
  return {
    id: 501,
    taskId: 101,
    ownerUserId: 7,
    eventType: AgentTaskEventType.SocialAgentCandidatesReturned,
    actor: AgentTaskEventActor.Agent,
    summary: '已返回候选卡片',
    payload: {
      candidates: [{ userId: 22, nickname: 'Alex' } as never],
      message: '我找到了一个合适候选人',
    },
    stepId: null,
    toolCallId: null,
    createdAt: new Date('2026-06-05T00:03:00.000Z'),
  } as unknown as AgentTaskEvent;
}

function makeApprovalDecisionEvent(): AgentTaskEvent {
  return {
    id: 502,
    taskId: 101,
    ownerUserId: 7,
    eventType: AgentTaskEventType.ConfirmationReceived,
    actor: AgentTaskEventActor.User,
    summary: '用户已批准：发送第一条消息',
    payload: {
      approvalId: 301,
      actionType: 'send_message',
      status: 'approved',
      decision: 'approved',
    },
    stepId: null,
    toolCallId: null,
    createdAt: new Date('2026-06-05T00:05:00.000Z'),
  } as unknown as AgentTaskEvent;
}

function makeApproval(): AgentApprovalRequest {
  return {
    id: 301,
    type: ApprovalType.SendMessage,
    actionType: 'send_message',
    summary: '发送第一条消息',
    riskLevel: ApprovalRiskLevel.Low,
    payload: { targetUserId: 22 },
    expiresAt: new Date('2026-06-05T01:00:00.000Z'),
  } as unknown as AgentApprovalRequest;
}

function makeCheckpoint() {
  return {
    id: 909,
    ownerUserId: 7,
    agentTaskId: 101,
    parentCheckpointId: null,
    type: AgentRunCheckpointType.Interrupt,
    status: AgentRunCheckpointStatus.Active,
    resumePrompt: '继续刚才保存的 Agent 步骤。',
    steps: [{ id: 'approval', label: '等待确认', status: 'pending' }],
  };
}

function makeHarness(
  options: {
    approvals?: AgentApprovalRequest[];
    approvalsReject?: boolean;
    checkpoint?: ReturnType<typeof makeCheckpoint> | null;
    contextTurnLimit?: number;
    events?: AgentTaskEvent[];
    task?: AgentTask | null;
  } = {},
) {
  const task = options.task === undefined ? makeTask() : options.task;
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
  };
  const eventRepo = {
    find: jest
      .fn()
      .mockResolvedValue(task ? (options.events ?? [makeEvent()]) : []),
  };
  const approvals = {
    getPendingForTask: jest
      .fn()
      .mockImplementation(() =>
        options.approvalsReject
          ? Promise.reject(new Error('approval db offline'))
          : Promise.resolve(options.approvals ?? [makeApproval()]),
      ),
  };
  const checkpoints = {
    latestForTask: jest.fn().mockResolvedValue(options.checkpoint ?? null),
  };
  const assembler = new AgentSessionAssemblerService();
  const runState = new SocialAgentRunStateService(
    {} as never,
    {} as never,
    {} as never,
  );
  const service = new SocialAgentSessionRestoreService(
    taskRepo as never,
    eventRepo as never,
    approvals as unknown as AgentApprovalService,
    runState,
    assembler,
    checkpoints as never,
    options.contextTurnLimit
      ? ({
          get: jest.fn((key: string) =>
            key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT'
              ? String(options.contextTurnLimit)
              : undefined,
          ),
        } as never)
      : undefined,
  );
  return { approvals, checkpoints, eventRepo, service, task, taskRepo };
}

describe('SocialAgentSessionRestoreService', () => {
  it('finds the latest non-cancelled restorable social agent task', async () => {
    const { service, task, taskRepo } = makeHarness();

    await expect(service.findLatestRestorableTask(7)).resolves.toBe(task);

    expect(taskRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 7,
          taskType: expect.any(Object),
          status: expect.any(Object),
        }),
        order: { updatedAt: 'DESC' },
      }),
    );
    const query = taskRepo.findOne.mock.calls[0]?.[0] as {
      where?: { status?: { _value?: AgentTaskStatus[] } };
    };
    expect(query.where?.status?._value).toEqual(
      expect.arrayContaining([
        AgentTaskStatus.AwaitingConfirmation,
        AgentTaskStatus.WaitingResult,
        AgentTaskStatus.WaitingReply,
      ]),
    );
    expect(query.where?.status?._value).toEqual(
      expect.not.arrayContaining([
        AgentTaskStatus.AwaitingFeedback,
        AgentTaskStatus.Succeeded,
        AgentTaskStatus.Failed,
      ]),
    );
    const taskTypeQuery = taskRepo.findOne.mock.calls[0]?.[0] as {
      where?: { taskType?: { _value?: string[] } };
    };
    expect(taskTypeQuery.where?.taskType?._value).toEqual(
      expect.arrayContaining(['social_agent_chat', 'social_search']),
    );
    expect(taskTypeQuery.where?.taskType?._value).not.toEqual(
      expect.arrayContaining(['social_agent_demo']),
    );
  });

  it('does not restore failed unbound legacy tasks into the chat shell', async () => {
    const legacyTask = makeTask({
      status: AgentTaskStatus.Failed,
      statusReason: 'task_conversation_unbound',
    });
    const { service } = makeHarness({ task: legacyTask });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: legacyTask,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: false,
      activeTaskId: null,
      result: null,
      messages: [],
    });
  });

  it('does not restore legacy waiting-reply tasks without an agent connection', async () => {
    const legacyTask = makeTask({
      agentConnectionId: null,
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'next_action_executed_waiting_reply',
    });
    const { service } = makeHarness({ task: legacyTask });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: legacyTask,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: false,
      activeTaskId: null,
      result: null,
      messages: [],
    });
  });

  it('does not restore stale feedback-only tasks into the chat shell', async () => {
    const staleTask = makeTask({
      status: AgentTaskStatus.AwaitingFeedback,
      statusReason: 'main_agent_waiting_for_clarification',
    });
    const { service } = makeHarness({ task: staleTask });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: staleTask,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: false,
      activeTaskId: null,
      result: null,
      messages: [],
    });
  });

  it('builds a restorable session snapshot from events, approvals, and latest run', async () => {
    const { approvals, eventRepo, service } = makeHarness();

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: makeTask(),
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: true,
      activeTaskId: 101,
      result: expect.objectContaining({
        taskId: 101,
        assistantMessage: '我找到了一个合适候选人',
      }),
      latestRun: expect.objectContaining({ runId: 'sar_restore_1' }),
      pendingApprovals: [
        expect.objectContaining({
          id: 301,
          actionType: 'send_message',
        }),
      ],
    });
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: '帮我找跑步搭子',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '我找到了一个合适候选人',
        }),
      ]),
    );
    expect(eventRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: 101, ownerUserId: 7 },
        take: 500,
      }),
    );
    expect(approvals.getPendingForTask).toHaveBeenCalledWith(7, 101);
  });

  it('keeps assistant message source metadata on restored conversation turns', async () => {
    const task = makeTask({
      memory: {
        socialAgentConversation: {
          turns: [
            {
              id: 'turn_user_1',
              role: 'user',
              content: '继续刚才的约练',
              at: '2026-06-05T00:00:00.000Z',
            },
            {
              id: 'turn_assistant_fallback',
              role: 'assistant',
              content: '我会保守处理这一步。',
              assistantMessageSource: 'fallback',
              at: '2026-06-05T00:01:00.000Z',
            },
          ],
        },
      },
    });
    const { service } = makeHarness({ approvals: [], task });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    expect(
      snapshot.messages.find(
        (message) => message.id === 'turn_assistant_fallback',
      ),
    ).toMatchObject({
      role: 'assistant',
      assistantMessageSource: 'fallback',
    });
  });

  it('keeps assistant message source metadata on restored latest result messages', async () => {
    const task = makeTask();
    task.result = withSocialAgentStoredRun({}, {
      taskId: task.id,
      runId: 'sar_restore_fallback',
      status: 'completed',
      phase: 'completed',
      message: '已完成',
      visibleSteps: [],
      queuedAt: '2026-06-05T00:00:00.000Z',
      startedAt: '2026-06-05T00:01:00.000Z',
      updatedAt: '2026-06-05T00:03:00.000Z',
      completedAt: '2026-06-05T00:03:00.000Z',
      failedAt: null,
      pollAfterMs: 1500,
      error: null,
      replan: null,
      result: {
        taskId: task.id,
        status: task.status,
        visibleSteps: [],
        assistantMessage: '我会先保守保留这次处理结果。',
        assistantMessageSource: 'fallback',
        socialRequestDraft: null,
        candidates: [],
        approvalRequiredActions: [],
        events: [],
      },
    });
    const { service } = makeHarness({ approvals: [], events: [], task });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot.messages.at(-1)).toMatchObject({
      id: `task_${task.id}_latest_result`,
      role: 'assistant',
      assistantMessageSource: 'fallback',
    });
  });

  it('restores chat messages with the configured unified context window', async () => {
    const conversation = Array.from({ length: 88 }, (_, index) => ({
      id: `turn_user_${index + 1}`,
      role: 'user',
      text: `第 ${index + 1} 条上下文`,
      at: `2026-06-05T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }));
    const task = makeTask({
      memory: {
        socialAgentConversation: { turns: conversation },
      },
    });
    const { service } = makeHarness({
      approvals: [],
      contextTurnLimit: 80,
      task,
    });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    const restoredUserMessages = snapshot.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content);
    expect(restoredUserMessages).toHaveLength(79);
    expect(restoredUserMessages[0]).toBe('第 10 条上下文');
    expect(restoredUserMessages.at(-1)).toBe('第 88 条上下文');
    expect(restoredUserMessages).not.toContain('第 9 条上下文');
  });

  it('does not regress to a short restore window when legacy env config asks for 8 turns', async () => {
    const conversation = Array.from({ length: 95 }, (_, index) => ({
      id: `turn_user_${index + 1}`,
      role: 'user',
      text: `第 ${index + 1} 条上下文`,
      at: `2026-06-05T01:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }));
    const task = makeTask({
      memory: {
        socialAgentConversation: { turns: conversation },
      },
    });
    const { service } = makeHarness({
      approvals: [],
      contextTurnLimit: 8,
      task,
    });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    const restoredUserMessages = snapshot.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content);
    expect(restoredUserMessages).toHaveLength(79);
    expect(restoredUserMessages[0]).toBe('第 17 条上下文');
    expect(restoredUserMessages.at(-1)).toBe('第 95 条上下文');
    expect(restoredUserMessages).not.toContain('第 16 条上下文');
  });

  it('builds timeline messages and preserves candidate action state', async () => {
    const { service } = makeHarness({
      events: [makeEvent(), makeApprovalDecisionEvent()],
    });

    const timeline = await service.buildTaskTimeline({
      ownerUserId: 7,
      task: makeTask(),
      visibleStepLabel: (_, label) => label,
    });

    expect(timeline).toMatchObject({
      taskId: 101,
      result: expect.objectContaining({ taskId: 101 }),
      latestRun: expect.objectContaining({ runId: 'sar_restore_1' }),
      candidateActions: {
        22: expect.objectContaining({ send: 'drafted' }),
      },
    });
    expect(timeline.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          kind: 'candidates',
          text: '我找到了一个合适候选人',
        }),
        expect.objectContaining({
          role: 'system',
          kind: 'status',
          text: '用户已批准：发送第一条消息',
        }),
      ]),
    );
  });

  it('restores candidate actions from canonical task memory aliases', async () => {
    const task = makeTask({
      memory: {
        taskMemory: {
          candidateActions: {
            22: {
              targetUserId: 22,
              status: 'saved',
              note: '用户想先保留这位候选人',
            },
          },
          candidateState: {
            29: {
              targetUserId: 29,
              status: 'skipped',
              note: '用户明确跳过这位候选人',
            },
          },
        },
      },
    });
    const { service } = makeHarness({ approvals: [], task });

    const timeline = await service.buildTaskTimeline({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    expect(timeline.candidateActions).toEqual(
      expect.objectContaining({
        22: expect.objectContaining({
          targetUserId: 22,
          status: 'saved',
        }),
        29: expect.objectContaining({
          targetUserId: 29,
          status: 'skipped',
        }),
      }),
    );
  });

  it('falls back to an empty pending approval list when approval restore fails', async () => {
    const { service } = makeHarness({ approvalsReject: true });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: makeTask(),
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot.pendingApprovals).toEqual([]);
    expect(snapshot.hasSession).toBe(true);
  });

  it('adds the latest checkpoint runtime to restored results', async () => {
    const { checkpoints, service } = makeHarness({
      checkpoint: makeCheckpoint(),
    });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: makeTask(),
      visibleStepLabel: (_, label) => label,
    });

    expect(checkpoints.latestForTask).toHaveBeenCalledWith(7, 101);
    expect(snapshot.result).toMatchObject({
      runtime: {
        checkpointId: 909,
        checkpointType: AgentRunCheckpointType.Interrupt,
        canResume: true,
        canReplay: true,
        canFork: true,
        parentCheckpointId: null,
      },
    });
  });

  it('silences generic stale checkpoint sessions from latest restore', async () => {
    const task = makeTask({
      goal: '你有什么功能',
      status: AgentTaskStatus.WaitingReply,
      memory: {
        socialAgentChat: {
          conversation: [
            {
              id: 'turn_user_generic',
              role: 'user',
              content: '你有什么功能',
              at: '2026-06-05T00:00:00.000Z',
            },
          ],
        },
      },
      result: {},
    });
    task.result = {};
    const { service } = makeHarness({
      approvals: [],
      approvalsReject: false,
      checkpoint: {
        ...makeCheckpoint(),
        resumePrompt:
          '从已保存的步骤继续：正在等待你确认。原始目标：你有什么功能',
      },
      events: [],
      task,
    });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: false,
      activeTaskId: null,
      result: null,
      messages: [],
    });
  });

  it('silences ordinary product-help checkpoint sessions from latest restore', async () => {
    const task = makeTask({
      goal: '为什么我的记忆没了，怎么使用这个 Agent',
      status: AgentTaskStatus.WaitingReply,
      memory: {
        socialAgentChat: {
          conversation: [
            {
              id: 'turn_user_help',
              role: 'user',
              content: '为什么我的记忆没了，怎么使用这个 Agent',
              at: '2026-06-05T00:00:00.000Z',
            },
          ],
        },
      },
      result: {},
    });
    task.result = {};
    const { service } = makeHarness({
      approvals: [],
      approvalsReject: false,
      checkpoint: {
        ...makeCheckpoint(),
        resumePrompt:
          '从已保存的步骤继续：正在等待你确认。原始目标：为什么我的记忆没了，怎么使用这个 Agent',
      },
      events: [],
      task,
    });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: false,
      activeTaskId: null,
      result: null,
      messages: [],
    });
  });

  it('returns an empty session when no restorable task exists', async () => {
    const { service } = makeHarness({ task: null });

    const snapshot = await service.buildSessionSnapshot({
      ownerUserId: 7,
      task: null,
      visibleStepLabel: (_, label) => label,
    });

    expect(snapshot).toMatchObject({
      hasSession: false,
      activeTaskId: null,
      messages: [],
      result: null,
    });
  });
});
