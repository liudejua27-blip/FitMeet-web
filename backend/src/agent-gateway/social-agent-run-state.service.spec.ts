import { NotFoundException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { withSocialAgentStoredRun } from './social-agent-chat-run.presenter';
import type { SocialAgentAsyncRunSnapshot } from './social-agent-chat.types';

function makeRun(
  overrides: Partial<SocialAgentAsyncRunSnapshot> = {},
): SocialAgentAsyncRunSnapshot {
  return {
    taskId: 101,
    runId: 'sar_test_1',
    status: 'queued',
    phase: 'queued',
    message: 'queued',
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
    ...overrides,
  };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  const task = {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: 11,
    result: {},
    status: AgentTaskStatus.Pending,
    statusReason: null,
    error: null,
    ...overrides,
  } as AgentTask;
  task.result = withSocialAgentStoredRun(task.result, makeRun());
  return task;
}

function makeHarness(task = makeTask()) {
  const savedEvents: Array<Record<string, unknown>> = [];
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
    save: jest.fn((input: AgentTask) => Promise.resolve(input)),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const messages = {
    createAgentInboxEvent: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SocialAgentRunStateService(
    taskRepo as never,
    eventRepo as never,
    messages as never,
  );
  return { eventRepo, messages, savedEvents, service, task, taskRepo };
}

describe('SocialAgentRunStateService', () => {
  it('queues initial chat runs with pollable state and a task event', async () => {
    const task = makeTask({
      result: {},
      status: AgentTaskStatus.Pending,
    });
    const { savedEvents, service, taskRepo } = makeHarness(task);

    const queued = await service.queueChatRun({
      task,
      runId: 'sar_chat_1',
      goal: '今晚想找一个跑步搭子',
    });

    expect(queued).toMatchObject({
      taskId: 101,
      runId: 'sar_chat_1',
      status: 'queued',
      phase: 'queued',
      message: '已收到需求，正在后台搜索候选人。',
      taskStatus: AgentTaskStatus.Pending,
      visibleSteps: [
        {
          id: 'task.created',
          label: '已创建 Social Agent 任务',
          status: 'done',
        },
      ],
    });
    expect(task.status).toBe(AgentTaskStatus.Planning);
    expect(task.statusReason).toBe('chat_run_queued');
    expect(task.result).toMatchObject({
      latestRunId: 'sar_chat_1',
      chatRuns: { sar_chat_1: expect.objectContaining({ status: 'queued' }) },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.Agent,
        eventType: AgentTaskEventType.Note,
        payload: { runId: 'sar_chat_1', goal: '今晚想找一个跑步搭子' },
        taskId: 101,
      }),
    ]);
  });

  it('queues follow-up replan runs with the saved follow-up context', async () => {
    const task = makeTask({
      result: {},
      status: AgentTaskStatus.AwaitingFeedback,
    });
    const { savedEvents, service } = makeHarness(task);

    const queued = await service.queueReplanRun({
      task,
      runId: 'sar_replan_1',
      followUp: {
        task,
        userMessage: '改成周末下午',
        previousGoal: '今晚跑步',
        refreshedGoal: '今晚跑步 + 周末下午',
        appendedAt: '2026-06-05T00:00:00.000Z',
        alreadyAppended: false,
      },
    });

    expect(queued).toMatchObject({
      taskId: 101,
      runId: 'sar_replan_1',
      status: 'queued',
      phase: 'queued',
      message: '已收到补充，正在后台重新规划。',
      visibleSteps: [
        {
          id: 'append_context',
          label: '已写入当前任务上下文',
          status: 'done',
        },
      ],
    });
    expect(task.status).toBe(AgentTaskStatus.Planning);
    expect(task.statusReason).toBe('follow_up_replan_queued');
    expect(task.result).toMatchObject({
      latestRunId: 'sar_replan_1',
      chatRuns: {
        sar_replan_1: expect.objectContaining({ status: 'queued' }),
      },
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.System,
        eventType: AgentTaskEventType.SocialAgentReplanQueued,
        payload: {
          runId: 'sar_replan_1',
          userMessage: '改成周末下午',
          refreshedGoal: '今晚跑步 + 周末下午',
        },
        taskId: 101,
      }),
    ]);
  });

  it('updates run snapshots and mirrors running status onto the task', async () => {
    const { service, task, taskRepo } = makeHarness();

    const saved = await service.updateRunSnapshot(
      7,
      101,
      'sar_test_1',
      {
        status: 'running',
        phase: 'search',
        message: '正在找人',
        visibleSteps: [{ id: 'search', label: '搜索', status: 'done' }],
      },
      (id, label) => `${id}:${label}`,
    );

    const run = service.readStoredRun(task, 'sar_test_1', (_, label) => label);
    expect(saved.status).toBe(AgentTaskStatus.Planning);
    expect(saved.statusReason).toBe('follow_up_replan_search');
    expect(run).toMatchObject({
      status: 'running',
      phase: 'search',
      message: '正在找人',
      visibleSteps: [{ id: 'search', label: '搜索', status: 'done' }],
    });
    expect(run?.startedAt).toEqual(expect.any(String));
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });

  it('marks failed runs, writes a system event, and notifies the agent inbox', async () => {
    const { messages, savedEvents, service, task, taskRepo } = makeHarness();

    await service.markRunFailed(
      7,
      101,
      'sar_test_1',
      { code: 'planner_failed', message: 'planner unavailable' },
      (_, label) => label,
      { statusReason: 'chat_run_failed' },
    );

    const run = service.readStoredRun(task, 'sar_test_1', (_, label) => label);
    expect(run).toMatchObject({
      status: 'failed',
      phase: 'failed',
      error: { code: 'planner_failed', message: 'planner unavailable' },
    });
    expect(task.status).toBe(AgentTaskStatus.AwaitingFeedback);
    expect(task.statusReason).toBe('chat_run_failed');
    expect(task.error).toEqual({
      code: 'planner_failed',
      message: 'planner unavailable',
    });
    expect(savedEvents).toEqual([
      expect.objectContaining({
        eventType: AgentTaskEventType.SocialAgentReplanFailed,
        taskId: 101,
      }),
    ]);
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 11,
        eventType: 'social_agent.replan.failed',
        ownerUserId: 7,
      }),
    );
    expect(taskRepo.save).toHaveBeenCalledTimes(2);
  });

  it('completes replan runs, writes a system event, and notifies the agent inbox', async () => {
    const { messages, savedEvents, service, task, taskRepo } = makeHarness();
    const replan = {
      replanAttempt: 2,
      source: 'fallback',
      fallbackReason: null,
      plan: [],
    };
    const result = {
      taskId: 101,
      status: AgentTaskStatus.AwaitingConfirmation,
      visibleSteps: [{ id: 'done', label: '已完成', status: 'done' as const }],
      assistantMessage: '已刷新候选人',
      socialRequestDraft: null,
      candidates: [{ userId: 22 }],
      approvalRequiredActions: [],
      events: [],
      replan,
    };

    const saved = await service.completeReplanRun({
      ownerUserId: 7,
      taskId: 101,
      runId: 'sar_test_1',
      visibleSteps: result.visibleSteps,
      replan: replan as never,
      result: result as never,
      visibleStepLabel: (_, label) => label,
    });

    const run = service.readStoredRun(task, 'sar_test_1', (_, label) => label);
    expect(saved).toBe(task);
    expect(run).toMatchObject({
      status: 'completed',
      phase: 'completed',
      message: '已根据补充要求刷新计划和候选人',
      visibleSteps: result.visibleSteps,
      replan,
      result,
      error: null,
    });
    expect(run?.completedAt).toEqual(expect.any(String));
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.System,
        eventType: AgentTaskEventType.SocialAgentReplanCompleted,
        taskId: 101,
        payload: {
          runId: 'sar_test_1',
          candidateCount: 1,
          replanAttempt: 2,
        },
      }),
    ]);
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 11,
        eventType: 'social_agent.replan.completed',
        ownerUserId: 7,
        metadata: expect.objectContaining({
          runId: 'sar_test_1',
          candidateCount: 1,
          agentTaskId: 101,
        }),
      }),
    );
    expect(taskRepo.save).toHaveBeenCalledWith(task);
  });

  it('throws when the requested run does not exist', async () => {
    const { service } = makeHarness();

    await expect(
      service.updateRunSnapshot(
        7,
        101,
        'missing',
        { status: 'running' },
        (_, label) => label,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
