import { BadRequestException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentFollowUpContext,
} from './social-agent-chat.types';

jest.mock('./social-agent-chat-run.presenter', () => ({
  createSocialAgentRunId: jest.fn(() => 'sar_facade_1'),
}));

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
    status: AgentTaskStatus.AwaitingFeedback,
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

function makeFollowUp(
  task = makeTask(),
  overrides: Partial<SocialAgentFollowUpContext> = {},
): SocialAgentFollowUpContext {
  return {
    task,
    userMessage: '改成明天下午低压力散步',
    previousGoal: '今晚青岛轻松跑步',
    refreshedGoal: '原需求：今晚青岛轻松跑步\n用户补充：改成明天下午低压力散步',
    appendedAt: '2026-06-06T00:00:00.000Z',
    alreadyAppended: false,
    ...overrides,
  };
}

function makeQueuedRun(
  overrides: Partial<SocialAgentAsyncRunSnapshot> = {},
): SocialAgentAsyncRunSnapshot {
  return {
    taskId: 101,
    runId: 'sar_facade_1',
    status: 'queued',
    phase: 'queued',
    message: '已收到补充，正在后台重新规划。',
    visibleSteps: [],
    queuedAt: '2026-06-06T00:00:00.000Z',
    startedAt: null,
    updatedAt: '2026-06-06T00:00:00.000Z',
    completedAt: null,
    failedAt: null,
    pollAfterMs: 1500,
    error: null,
    replan: null,
    result: null,
    ...overrides,
  };
}

function makeHarness(options: { executeRejects?: boolean } = {}) {
  const task = makeTask();
  const followUp = makeFollowUp(task);
  const queuedRun = makeQueuedRun();
  const runState = {
    queueReplanRun: jest.fn().mockResolvedValue(queuedRun),
    markRunFailed: jest.fn().mockResolvedValue(undefined),
  };
  const followUpContext = {
    appendFollowUpContext: jest.fn().mockResolvedValue(followUp),
    readLatestFollowUpContext: jest.fn().mockReturnValue(followUp),
  };
  const taskLifecycle = {
    assertTaskOwner: jest.fn().mockResolvedValue(task),
  };
  const replanRuns = {
    execute: options.executeRejects
      ? jest.fn().mockRejectedValue(new Error('planner offline'))
      : jest.fn().mockResolvedValue({ taskId: 101 }),
  };
  const tonePolicy = {
    userStatus: jest.fn((_id: string, label: string) => `用户可见：${label}`),
  };
  const service = new SocialAgentReplanFacadeService(
    runState as never,
    followUpContext as never,
    taskLifecycle as never,
    replanRuns as never,
    tonePolicy as never,
  );
  return {
    followUp,
    followUpContext,
    queuedRun,
    replanRuns,
    runState,
    service,
    task,
    taskLifecycle,
    tonePolicy,
  };
}

describe('SocialAgentReplanFacadeService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects empty append context requests before touching the task', async () => {
    const { service, taskLifecycle } = makeHarness();

    await expect(
      service.appendContext(7, 101, { userMessage: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(taskLifecycle.assertTaskOwner).not.toHaveBeenCalled();
  });

  it('appends follow-up context and returns an App-friendly saved payload', async () => {
    const { followUp, followUpContext, service, task, taskLifecycle } =
      makeHarness();

    await expect(
      service.appendContext(7, 101, {
        userMessage: '  改成明天下午低压力散步  ',
      }),
    ).resolves.toEqual({
      taskId: 101,
      saved: true,
      eventType: AgentTaskEventType.SocialAgentContextAppended,
      userMessage: followUp.userMessage,
      previousGoal: followUp.previousGoal,
      refreshedGoal: followUp.refreshedGoal,
      appendedAt: followUp.appendedAt,
    });
    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
    expect(followUpContext.appendFollowUpContext).toHaveBeenCalledWith(
      task,
      '改成明天下午低压力散步',
    );
  });

  it('queues a replan run and starts the background executor with normalized follow-up text', async () => {
    const {
      followUp,
      followUpContext,
      queuedRun,
      replanRuns,
      runState,
      service,
      task,
      tonePolicy,
    } = makeHarness();

    await expect(
      service.replanAndRefresh(7, 101, {
        userMessage: '  改成明天下午低压力散步  ',
        reason: 'user_follow_up',
      }),
    ).resolves.toBe(queuedRun);

    expect(followUpContext.appendFollowUpContext).toHaveBeenCalledWith(
      task,
      '改成明天下午低压力散步',
    );
    expect(runState.queueReplanRun).toHaveBeenCalledWith({
      task,
      runId: 'sar_facade_1',
      followUp,
    });
    expect(replanRuns.execute).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      body: {
        userMessage: followUp.userMessage,
        reason: 'user_follow_up',
      },
      runId: 'sar_facade_1',
      signal: null,
      visibleStepLabel: expect.any(Function),
    });
    const executeInput = replanRuns.execute.mock.calls[0][0] as {
      visibleStepLabel: (id: string, label: string) => string;
    };
    expect(executeInput.visibleStepLabel('replan', '正在重新规划')).toBe(
      '用户可见：正在重新规划',
    );
    expect(tonePolicy.userStatus).toHaveBeenCalledWith(
      'replan',
      '正在重新规划',
    );
  });

  it('uses the latest stored follow-up and marks the run failed when background execution fails', async () => {
    const { followUp, followUpContext, replanRuns, runState, service, task } =
      makeHarness({ executeRejects: true });
    const loggerSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation();

    await expect(
      service.replanAndRefresh(7, 101, { reason: 'user_follow_up' }),
    ).resolves.toEqual(expect.objectContaining({ runId: 'sar_facade_1' }));
    await Promise.resolve();

    expect(followUpContext.readLatestFollowUpContext).toHaveBeenCalledWith(
      task,
      undefined,
    );
    expect(replanRuns.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          reason: 'user_follow_up',
          userMessage: followUp.userMessage,
        },
      }),
    );
    expect(runState.markRunFailed).toHaveBeenCalledWith(
      7,
      101,
      'sar_facade_1',
      expect.any(Error),
      expect.any(Function),
      {},
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('social_agent.replan.background_failed'),
    );
  });
});
