import { AgentApprovalService } from './agent-approval.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
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

function makeHarness(
  options: {
    approvalsReject?: boolean;
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
          : Promise.resolve([makeApproval()]),
      ),
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
  );
  return { approvals, eventRepo, service, task, taskRepo };
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
