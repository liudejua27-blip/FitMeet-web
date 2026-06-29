import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import { WorkoutLoopService } from './workout-loop.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找跑步搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeService(task = makeTask()) {
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
  };
  const messageLog = {
    recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
  };
  const draftPublication = {
    stagePrivateDraftForPublish: jest.fn(
      async (_ownerUserId, _taskId, draft) => ({
        task,
        socialRequestId: 501,
        draft: {
          ...draft,
          socialRequestId: 501,
        },
      }),
    ),
    dismissDraft: jest.fn().mockResolvedValue(undefined),
  };
  const service = new WorkoutLoopService(
    taskRepo as never,
    new FitMeetLoopRouterService(),
    messageLog as never,
    draftPublication as never,
  );
  return { draftPublication, messageLog, service, task, taskRepo };
}

describe('WorkoutLoopService', () => {
  it('returns null for non-workout messages so the legacy route can continue', async () => {
    const { service, task } = makeService();

    await expect(
      service.tryHandleEntrance({
        ownerUserId: 7,
        task,
        message: '今天只是想聊聊天',
      }),
    ).resolves.toBeNull();
  });

  it('creates an intake card when required workout slots are missing', async () => {
    const { draftPublication, messageLog, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '帮我找跑步搭子',
    });

    expect(result?.result).toMatchObject({
      action: 'clarify',
      shouldQueueRun: false,
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            missingFields: expect.arrayContaining([
              'timePreference',
              'locationText',
            ]),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect(messageLog.recordAssistantMessage).toHaveBeenCalled();
    expect((task.memory as Record<string, unknown>).workoutLoop).toMatchObject({
      stage: 'intake',
    });
  });

  it('stages a private social request before returning a publishable draft card', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '今晚青岛大学附近轻松跑步，3公里，找同校的人一起',
    });

    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        title: expect.stringContaining('跑步约练'),
        metadata: expect.objectContaining({ loop: 'workout' }),
      }),
    );
    expect(result?.result).toMatchObject({
      action: 'await_confirmation',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.draft',
          data: expect.objectContaining({ socialRequestId: 501 }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: 'workout_draft.publish',
              payload: expect.objectContaining({ socialRequestId: 501 }),
            }),
          ]),
        }),
      ],
    });
    expect((task.memory as Record<string, unknown>).workoutLoop).toMatchObject({
      stage: 'draft_ready',
      socialRequestId: 501,
    });
  });

  it('turns intake submit payload into a staged draft', async () => {
    const { service } = makeService();

    const result = await service.performWorkoutAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_intake.submit' as never,
        payload: {
          slots: {
            activityType: '羽毛球',
            timePreference: '周末下午',
            locationText: '市北体育馆',
            city: '青岛',
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'workout.draft',
      data: expect.objectContaining({ activityType: '羽毛球' }),
    });
  });
});
