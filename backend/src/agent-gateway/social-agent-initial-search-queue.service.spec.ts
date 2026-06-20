import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  StreamEmit,
} from './social-agent-chat.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '旧目标',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.AwaitingFeedback,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: 'existing-key',
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

function makeQueuedRun(
  overrides: Partial<SocialAgentAsyncRunSnapshot> = {},
): SocialAgentAsyncRunSnapshot {
  return {
    taskId: 101,
    runId: 'sar_initial_1',
    status: 'queued',
    phase: 'queued',
    message: '已收到需求，正在后台搜索候选人。',
    visibleSteps: [],
    queuedAt: '2026-06-06T00:00:00.000Z',
    startedAt: null,
    updatedAt: '2026-06-06T00:00:00.000Z',
    completedAt: null,
    failedAt: null,
    pollAfterMs: 1500,
    error: null,
    result: null,
    ...overrides,
  };
}

function makeRunResult(
  overrides: Partial<SocialAgentChatRunResult> = {},
): SocialAgentChatRunResult {
  return {
    taskId: 101,
    status: AgentTaskStatus.Succeeded,
    visibleSteps: [],
    assistantMessage: '已找到合适候选人',
    socialRequestDraft: null,
    candidates: [],
    approvalRequiredActions: [],
    events: [],
    ...overrides,
  };
}

function makeHarness(queuedRun = makeQueuedRun()) {
  const taskRepo = {
    save: jest.fn((task: AgentTask) => Promise.resolve(task)),
  };
  const queuedRuns = {
    runQueued: jest.fn().mockResolvedValue(queuedRun),
  };
  const runOrchestrator = {
    run: jest.fn().mockResolvedValue(makeRunResult()),
  };
  const tonePolicy = {
    userStatus: jest.fn((_id: string, label: string) => `用户可见：${label}`),
  };
  const service = new SocialAgentInitialSearchQueueService(
    taskRepo as never,
    queuedRuns as never,
    runOrchestrator as never,
    tonePolicy as never,
  );
  return {
    queuedRun,
    queuedRuns,
    runOrchestrator,
    service,
    taskRepo,
    tonePolicy,
  };
}

describe('SocialAgentInitialSearchQueueService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates the existing task state and queues a real initial search with the current idempotency key', async () => {
    const task = makeTask({
      input: { preserved: true },
      idempotencyKey: 'task-key-101',
    });
    const {
      queuedRun,
      queuedRuns,
      runOrchestrator,
      service,
      taskRepo,
      tonePolicy,
    } = makeHarness();

    const result = await service.queueInitialSearchForTask({
      ownerUserId: 7,
      task,
      goal: '今晚想找一个青岛跑步搭子',
    });

    expect(result).toBe(queuedRun);
    expect(task).toMatchObject({
      goal: '今晚想找一个青岛跑步搭子',
      taskType: 'social_agent_chat',
      idempotencyKey: 'task-key-101',
      input: {
        preserved: true,
        source: 'social_agent_chat',
        executionBoundary: 'conversation_then_tools',
        latestSearchMessage: '今晚想找一个青岛跑步搭子',
      },
    });
    expect(readSocialAgentTaskMemory(task).currentTask).toMatchObject({
      state: 'searching_candidates',
      stateReason: 'search_started',
      objective: 'search',
      nextStep: '搜索真实候选人并展示结果',
      shouldSearchNow: true,
      awaitingSearchConfirmation: false,
      waitingFor: 'search_results',
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(queuedRuns.runQueued).toHaveBeenCalledWith({
      ownerUserId: 7,
      body: {
        goal: '今晚想找一个青岛跑步搭子',
        permissionMode: AgentTaskPermissionMode.Confirm,
        idempotencyKey: 'task-key-101',
      },
      executeRun: expect.any(Function),
      signal: null,
      visibleStepLabel: expect.any(Function),
    });

    const runInput = queuedRuns.runQueued.mock.calls[0][0] as {
      executeRun: (
        body: SocialAgentChatRunBody,
        emit?: StreamEmit,
      ) => Promise<SocialAgentChatRunResult>;
      visibleStepLabel: (id: string, label: string) => string;
    };
    const emit = jest.fn();
    await runInput.executeRun({ goal: '后台搜索' }, emit);
    expect(runOrchestrator.run).toHaveBeenCalledWith(
      7,
      { goal: '后台搜索' },
      emit,
      { signal: null },
    );
    expect(runInput.visibleStepLabel('search', '正在搜索候选人')).toBe(
      '用户可见：正在搜索候选人',
    );
    expect(tonePolicy.userStatus).toHaveBeenCalledWith(
      'search',
      '正在搜索候选人',
    );
  });

  it('generates an idempotency key and defaults permission mode for tasks without one', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const task = makeTask({
      id: 202,
      idempotencyKey: null,
      permissionMode: undefined,
    });
    const { queuedRuns, service } = makeHarness(makeQueuedRun({ taskId: 202 }));

    await service.queueInitialSearchForTask({
      ownerUserId: 9,
      task,
      goal: '周末下午羽毛球',
    });

    expect(task.idempotencyKey).toBe('social-agent-chat:202:1700000000000:i');
    expect(queuedRuns.runQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 9,
        body: {
          goal: '周末下午羽毛球',
          permissionMode: AgentTaskPermissionMode.Confirm,
          idempotencyKey: 'social-agent-chat:202:1700000000000:i',
        },
      }),
    );
  });
});
