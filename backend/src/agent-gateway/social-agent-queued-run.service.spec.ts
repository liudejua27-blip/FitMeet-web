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
});
