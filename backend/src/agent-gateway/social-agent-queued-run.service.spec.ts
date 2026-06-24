import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';

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

function makeHarness() {
  const savedEvents: Array<Record<string, unknown>> = [];
  const eventRepo = {
    create: jest.fn((input) => ({
      id: savedEvents.length + 1,
      stepId: null,
      toolCallId: null,
      createdAt: new Date(savedEvents.length),
      ...input,
    })),
    save: jest.fn((input) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
  };
  const service = new SocialAgentQueuedRunService(
    eventRepo as never,
    {} as never,
    {} as never,
  );

  return { eventRepo, savedEvents, service };
}

function makeQueuedHarness() {
  const task = makeTask();
  const eventRepo = {
    create: jest.fn((input) => input),
    save: jest.fn().mockResolvedValue({}),
  };
  const runState = {
    queueChatRun: jest.fn().mockResolvedValue({
      taskId: task.id,
      runId: 'sar_test_run',
      status: 'queued',
    }),
    updateRunSnapshot: jest.fn().mockResolvedValue(task),
    markRunFailed: jest.fn().mockResolvedValue(undefined),
  };
  const taskLifecycle = {
    createOrReuseTask: jest.fn().mockResolvedValue(task),
    assertTaskOwner: jest.fn().mockResolvedValue(task),
  };
  const service = new SocialAgentQueuedRunService(
    eventRepo as never,
    runState as never,
    taskLifecycle as never,
  );

  return { eventRepo, runState, service, task, taskLifecycle };
}

describe('SocialAgentQueuedRunService', () => {
  it('safe truncates long social agent timeline event summaries', async () => {
    const { eventRepo, savedEvents, service } = makeHarness();

    await (
      service as unknown as {
        writeEvent: (
          task: AgentTask,
          eventType: AgentTaskEventType,
          summary: string,
          payload: Record<string, unknown>,
        ) => Promise<void>;
      }
    ).writeEvent(
      makeTask(),
      AgentTaskEventType.SocialAgentMessageAssistant,
      'summary_'.repeat(100),
      { message: '完整内容放在 payload 里' },
    );

    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        ownerUserId: 7,
        eventType: AgentTaskEventType.SocialAgentMessageAssistant,
      }),
    );
    expect(String(savedEvents[0].summary).length).toBeLessThanOrEqual(500);
    expect(savedEvents[0].summary).toMatch(/…$/);
    expect(savedEvents[0].payload).toMatchObject({
      message: '完整内容放在 payload 里',
    });
  });

  it('binds queued runs to the requested task instead of creating a fresh conversation task', async () => {
    const { runState, service, task, taskLifecycle } = makeQueuedHarness();
    const executeRun = jest.fn().mockResolvedValue({
      taskId: task.id,
      visibleSteps: [],
      candidates: [],
    });

    const queued = await service.runQueued({
      ownerUserId: 7,
      body: {
        goal: '继续找今晚青岛大学附近散步搭子',
        taskId: task.id,
      },
      executeRun,
      visibleStepLabel: (_id, label) => label,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(queued).toMatchObject({ taskId: task.id, runId: 'sar_test_run' });
    expect(taskLifecycle.createOrReuseTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: task.id,
      }),
    );
    expect(runState.queueChatRun).toHaveBeenCalledWith(
      expect.objectContaining({ task }),
    );
    expect(executeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: '继续找今晚青岛大学附近散步搭子',
        taskId: task.id,
      }),
      expect.any(Function),
    );
  });

  it('binds queued runs to task ids encoded in assistant-ui thread ids', async () => {
    const { service, taskLifecycle } = makeQueuedHarness();

    await service.runQueued({
      ownerUserId: 7,
      body: {
        goal: '继续当前约练任务',
        clientContext: { threadId: `agent-task:${101}` },
      },
      executeRun: jest.fn().mockResolvedValue({
        taskId: 101,
        visibleSteps: [],
        candidates: [],
      }),
      visibleStepLabel: (_id, label) => label,
    });

    expect(taskLifecycle.createOrReuseTask).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
      }),
    );
  });

  it('keeps queued search recoverable when run snapshot persistence is missing', async () => {
    const { runState, service, task, taskLifecycle } = makeQueuedHarness();
    runState.updateRunSnapshot.mockRejectedValue(new Error('run not found'));
    taskLifecycle.assertTaskOwner.mockResolvedValue(task);

    const queued = await service.runQueued({
      ownerUserId: 7,
      body: {
        goal: '今晚青岛大学附近轻松跑步',
        taskId: task.id,
      },
      waitForCompletionMs: 100,
      executeRun: jest.fn().mockResolvedValue({
        taskId: task.id,
        assistantMessage: '已找到候选人。',
        assistantMessageSource: 'deterministic_route',
        visibleSteps: [],
        candidates: [],
        cards: [],
      }),
      visibleStepLabel: (_id, label) => label,
    });

    expect(queued).toMatchObject({
      taskId: task.id,
      status: 'completed',
      result: expect.objectContaining({
        assistantMessage: '已找到候选人。',
      }),
    });
    expect(String(queued.runId)).toMatch(/^sar_/);
    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(task.id, 7);
    expect(runState.markRunFailed).not.toHaveBeenCalled();
  });

  it('recovers cards from the latest completed stored chat run when the wrapper fails', async () => {
    const { runState, service, task, taskLifecycle } = makeQueuedHarness();
    task.result = {
      latestRunId: 'sar_completed',
      chatRuns: {
        sar_completed: {
          taskId: task.id,
          runId: 'sar_completed',
          status: 'completed',
          phase: 'completed',
          message: '已完成搜索并刷新候选人',
          visibleSteps: [],
          queuedAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
          completedAt: new Date(0).toISOString(),
          result: {
            taskId: task.id,
            assistantMessage: '已找到 3 个合适机会。',
            visibleSteps: [],
            candidates: [],
            cards: [{ id: 'candidate_card:101:22' }],
            approvalRequiredActions: [],
            events: [],
          },
        },
      },
    };
    taskLifecycle.assertTaskOwner.mockResolvedValue(task);

    const queued = await service.runQueued({
      ownerUserId: 7,
      body: {
        goal: '今晚青岛大学附近轻松跑步',
        taskId: task.id,
      },
      waitForCompletionMs: 100,
      executeRun: jest
        .fn()
        .mockRejectedValue(
          new Error('Recommendation AgentLoop completed without final result.'),
        ),
      visibleStepLabel: (_id, label) => label,
    });

    expect(queued).toMatchObject({
      taskId: task.id,
      runId: 'sar_completed',
      status: 'completed',
      result: expect.objectContaining({
        assistantMessage: '已找到 3 个合适机会。',
        cards: [{ id: 'candidate_card:101:22' }],
      }),
    });
    expect(runState.markRunFailed).not.toHaveBeenCalled();
  });
});
