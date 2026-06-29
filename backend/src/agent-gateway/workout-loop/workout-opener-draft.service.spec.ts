import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { WorkoutOpenerDraftService } from './workout-opener-draft.service';

function makeTask(): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '约练',
    memory: {
      workoutLoop: {
        stage: 'candidates_ready',
        slots: {
          activityType: '跑步',
          timePreference: '今晚',
          locationText: '青岛大学附近',
        },
      },
    },
    result: {},
    status: AgentTaskStatus.AwaitingConfirmation,
    permissionMode: AgentTaskPermissionMode.Confirm,
  } as unknown as AgentTask;
}

describe('WorkoutOpenerDraftService', () => {
  it('falls back when the JSON model runtime is unavailable', async () => {
    const service = new WorkoutOpenerDraftService();

    await expect(
      service.draft({
        task: makeTask(),
        candidate: { displayName: '小林' },
        payload: {},
        fallbackDraft: '今晚先在青岛大学附近轻松跑一段吗？',
      }),
    ).resolves.toBe('今晚先在青岛大学附近轻松跑一段吗？');
  });

  it('uses a safe DeepSeek opener when available', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        message: '看到你也喜欢轻松跑，今晚可以先站内聊聊节奏吗？',
      }),
    };
    const service = new WorkoutOpenerDraftService(toolJson as never);

    await expect(
      service.draft({
        task: makeTask(),
        candidate: {
          displayName: '小林',
          matchReasons: ['都喜欢轻松跑'],
        },
        payload: {
          socialRequestId: 301,
        },
        fallbackDraft: '今晚先在青岛大学附近轻松跑一段吗？',
      }),
    ).resolves.toBe('看到你也喜欢轻松跑，今晚可以先站内聊聊节奏吗？');
    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'workout_opener_draft',
        taskId: 101,
      }),
    );
  });

  it('falls back when DeepSeek returns contact information or precise location', async () => {
    const toolJson = {
      callJson: jest
        .fn()
        .mockResolvedValueOnce({
          message: '加我微信聊，手机号13812345678',
        })
        .mockResolvedValueOnce({
          message: '今晚到青岛大学3号楼201室见面吧',
        }),
    };
    const service = new WorkoutOpenerDraftService(toolJson as never);
    const fallbackDraft = '今晚先在青岛大学附近轻松跑一段吗？';

    await expect(
      service.draft({
        task: makeTask(),
        candidate: { displayName: '小林' },
        payload: {},
        fallbackDraft,
      }),
    ).resolves.toBe(fallbackDraft);
    await expect(
      service.draft({
        task: makeTask(),
        candidate: { displayName: '小林' },
        payload: {},
        fallbackDraft,
      }),
    ).resolves.toBe(fallbackDraft);
  });
});
