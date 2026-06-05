import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '今晚青岛轻松跑步',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    ...overrides,
  } as AgentTask;
}

function makeHarness(task = makeTask()) {
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
  const service = new SocialAgentFollowUpContextService(
    taskRepo as never,
    eventRepo as never,
  );
  return { eventRepo, savedEvents, service, task, taskRepo };
}

describe('SocialAgentFollowUpContextService', () => {
  it('appends a follow-up, refreshes the goal, and stores short-term context', async () => {
    const { savedEvents, service, task, taskRepo } = makeHarness();

    const context = await service.appendFollowUpContext(
      task,
      '改成明天下午低压力散步',
    );

    expect(context).toMatchObject({
      task,
      userMessage: '改成明天下午低压力散步',
      previousGoal: '今晚青岛轻松跑步',
      alreadyAppended: false,
    });
    expect(context.refreshedGoal).toContain('原需求：今晚青岛轻松跑步');
    expect(context.refreshedGoal).toContain('用户补充：改成明天下午低压力散步');
    expect(task.goal).toBe(context.refreshedGoal);
    expect(task.result).toMatchObject({
      latestFollowUp: expect.objectContaining({
        userMessage: '改成明天下午低压力散步',
      }),
      followUps: [
        expect.objectContaining({ userMessage: '改成明天下午低压力散步' }),
      ],
    });
    expect(task.memory?.shortTerm).toMatchObject({
      latestUserFollowUp: '改成明天下午低压力散步',
      previousGoal: '今晚青岛轻松跑步',
      currentGoal: context.refreshedGoal,
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(savedEvents).toEqual([
      expect.objectContaining({
        actor: AgentTaskEventActor.User,
        eventType: AgentTaskEventType.SocialAgentContextAppended,
        ownerUserId: 7,
        taskId: 101,
      }),
    ]);
  });

  it('returns a recent matching follow-up without writing duplicate records', async () => {
    const appendedAt = new Date().toISOString();
    const task = makeTask({
      result: {
        latestFollowUp: {
          userMessage: '再找近一点',
          previousGoal: '跑步',
          refreshedGoal: '跑步 + 再找近一点',
          appendedAt,
        },
      },
    });
    const { savedEvents, service, taskRepo } = makeHarness(task);

    const context = await service.appendFollowUpContext(task, '再找近一点');

    expect(context).toMatchObject({
      alreadyAppended: true,
      refreshedGoal: '跑步 + 再找近一点',
      userMessage: '再找近一点',
    });
    expect(taskRepo.save).not.toHaveBeenCalled();
    expect(savedEvents).toEqual([]);
  });

  it('reads only valid latest follow-up context records', () => {
    const { service, task } = makeHarness(
      makeTask({
        result: {
          latestFollowUp: {
            userMessage: '换到周末',
            previousGoal: '约练',
            refreshedGoal: '约练 + 周末',
            receivedAt: '2026-06-05T00:00:00.000Z',
          },
        },
      }),
    );

    expect(service.readLatestFollowUpContext(task)).toMatchObject({
      userMessage: '换到周末',
      previousGoal: '约练',
      refreshedGoal: '约练 + 周末',
      appendedAt: '2026-06-05T00:00:00.000Z',
    });
    expect(service.readLatestFollowUpContext(task, '别的消息')).toBeNull();
    expect(
      service.readLatestFollowUpContext(
        makeTask({ result: { latestFollowUp: { userMessage: '' } } }),
      ),
    ).toBeNull();
  });
});
