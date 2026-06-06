import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天',
    goal: '帮我找青岛附近的跑步搭子',
    status: AgentTaskStatus.Executing,
    memory: {
      taskMemory: {
        currentTask: {
          state: 'search_started',
          objective: '找青岛跑步搭子',
          nextStep: '返回候选人',
          shouldSearchNow: true,
        },
      },
      privateNote: 'not for users',
    },
    result: {
      candidates: [{ targetUserId: 22 }],
    },
    updatedAt: new Date('2026-06-06T08:00:00.000Z'),
    createdAt: new Date('2026-06-06T07:00:00.000Z'),
    ...overrides,
  } as AgentTask;
}

function makeHarness(options: { task?: AgentTask | null; run?: unknown } = {}) {
  const task = options.task === undefined ? makeTask() : options.task;
  const runState = {
    readStoredRun: jest.fn((_task, _runId, visibleStepLabel) =>
      options.run === undefined
        ? {
            taskId: 101,
            runId: 'sar_1',
            status: 'running',
            phase: 'executing',
            message: '执行中',
            visibleSteps: [
              {
                id: 'search',
                label: visibleStepLabel('search', '内部搜索候选人'),
                status: 'running',
              },
            ],
            queuedAt: '2026-06-06T08:00:00.000Z',
            startedAt: null,
            updatedAt: '2026-06-06T08:00:01.000Z',
            completedAt: null,
            failedAt: null,
            pollAfterMs: undefined,
            error: null,
            replan: null,
            result: null,
          }
        : options.run,
    ),
  };
  const sessionRestore = {
    findLatestRestorableTask: jest.fn().mockResolvedValue(task),
    buildSessionSnapshot: jest.fn(
      ({ task: currentTask, visibleStepLabel }) => ({
        hasSession: Boolean(currentTask),
        activeTaskId: currentTask?.id ?? null,
        messages: [],
        visibleLabel: visibleStepLabel('restore', '恢复会话'),
      }),
    ),
    buildTaskTimeline: jest.fn(({ task: currentTask, visibleStepLabel }) => ({
      taskId: currentTask.id,
      events: [],
      visibleLabel: visibleStepLabel('timeline', '读取时间线'),
    })),
  };
  const taskLifecycle = {
    assertTaskOwner: jest.fn().mockImplementation(() => {
      if (!task) throw new Error('Social agent task 101 not found');
      return Promise.resolve(task);
    }),
  };
  const tonePolicy = {
    userStatus: jest.fn((id: string, label: string) => `${id}:${label}`),
  };
  const service = new SocialAgentSessionQueryService(
    runState as never,
    sessionRestore as never,
    taskLifecycle as never,
    tonePolicy as never,
  );

  return { service, runState, sessionRestore, task, taskLifecycle, tonePolicy };
}

describe('SocialAgentSessionQueryService', () => {
  it('returns stored run status with task status and user-facing step labels', async () => {
    const { service, runState, taskLifecycle, tonePolicy } = makeHarness();

    const result = await service.getRunStatus(7, 101, 'sar_1');

    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
    expect(runState.readStoredRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: 101 }),
      'sar_1',
      expect.any(Function),
    );
    expect(tonePolicy.userStatus).toHaveBeenCalledWith(
      'search',
      '内部搜索候选人',
    );
    expect(result).toMatchObject({
      taskId: 101,
      runId: 'sar_1',
      taskStatus: AgentTaskStatus.Executing,
      pollAfterMs: 1500,
      visibleSteps: [
        expect.objectContaining({ label: 'search:内部搜索候选人' }),
      ],
    });
  });

  it('rejects unknown stored run ids after confirming task ownership', async () => {
    const { service, taskLifecycle } = makeHarness({ run: null });

    await expect(service.getRunStatus(7, 101, 'missing')).rejects.toThrow(
      'Social agent run missing not found',
    );
    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
  });

  it('delegates latest and task session snapshots through session restore', async () => {
    const { service, sessionRestore, taskLifecycle } = makeHarness();

    await expect(service.getLatestSession(7)).resolves.toMatchObject({
      hasSession: true,
      activeTaskId: 101,
      visibleLabel: 'restore:恢复会话',
    });
    await expect(service.getTaskSession(7, 101)).resolves.toMatchObject({
      activeTaskId: 101,
      visibleLabel: 'restore:恢复会话',
    });

    expect(sessionRestore.findLatestRestorableTask).toHaveBeenCalledWith(7);
    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
    expect(sessionRestore.buildSessionSnapshot).toHaveBeenCalledTimes(2);
  });

  it('returns the current task from persisted task memory and display-safe fields', async () => {
    const { service, sessionRestore } = makeHarness({
      task: makeTask({
        title: '',
        memory: {
          taskMemory: {
            currentTask: {
              state: 'showing_candidates',
              stateReason: 'candidates_returned',
              objective: '找青岛跑步搭子',
            },
          },
        },
      }),
    });

    const current = await service.getCurrentTask(7);

    expect(sessionRestore.findLatestRestorableTask).toHaveBeenCalledWith(7);
    expect(current).toMatchObject({
      taskId: 101,
      status: AgentTaskStatus.Executing,
      agentState: 'showing_candidates',
      taskType: 'social_agent_chat',
      title: 'FitMeet Social Agent 聊天',
      goal: '帮我找青岛附近的跑步搭子',
      memory: expect.any(Object),
      result: expect.any(Object),
      updatedAt: '2026-06-06T08:00:00.000Z',
      createdAt: '2026-06-06T07:00:00.000Z',
    });
  });

  it('returns null current task when no restorable session exists', async () => {
    const { service } = makeHarness({ task: null });

    await expect(service.getCurrentTask(7)).resolves.toBeNull();
  });

  it('delegates task timelines only after task ownership is confirmed', async () => {
    const { service, sessionRestore, taskLifecycle } = makeHarness();

    await expect(service.getTaskTimeline(7, 101)).resolves.toMatchObject({
      taskId: 101,
      visibleLabel: 'timeline:读取时间线',
    });

    expect(taskLifecycle.assertTaskOwner).toHaveBeenCalledWith(101, 7);
    expect(sessionRestore.buildTaskTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task: expect.objectContaining({ id: 101 }),
        visibleStepLabel: expect.any(Function),
      }),
    );
  });
});
