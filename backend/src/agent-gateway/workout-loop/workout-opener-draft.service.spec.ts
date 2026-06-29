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

function makeFriendTask(): AgentTask {
  return {
    ...makeTask(),
    goal: '交友',
    memory: {
      friendLoop: {
        stage: 'candidates_ready',
        slots: {
          friendGoal: '认识同城朋友',
          city: '上海',
          topicTags: ['咖啡', '展览'],
        },
      },
    },
  } as unknown as AgentTask;
}

function makeTravelTask(): AgentTask {
  return {
    ...makeTask(),
    goal: '旅行搭子',
    memory: {
      travelLoop: {
        stage: 'candidates_ready',
        slots: {
          destination: '成都',
          departureTime: '五一',
          budgetRange: '3000以内',
          transportMode: '高铁',
        },
      },
    },
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

  it('uses a friend-specific opener purpose and prompt for friend loop tasks', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        message: '看到你也喜欢展览，可以先站内轻松聊聊周末安排吗？',
      }),
    };
    const service = new WorkoutOpenerDraftService(toolJson as never);

    await expect(
      service.draft({
        task: makeFriendTask(),
        candidate: {
          displayName: '小周',
          metadata: { loop: 'friend' },
          matchReasons: ['都喜欢展览'],
        },
        payload: {},
        fallbackDraft: '',
      }),
    ).resolves.toBe('看到你也喜欢展览，可以先站内轻松聊聊周末安排吗？');

    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'friend_opener_draft',
        taskId: 101,
      }),
    );
    const prompt = JSON.parse(toolJson.callJson.mock.calls[0][0].prompt);
    expect(prompt).toMatchObject({
      loopKind: 'friend',
      loopContext: expect.objectContaining({
        stage: 'candidates_ready',
      }),
    });
    expect(prompt.instruction).toContain('friend-making');
    expect(prompt.constraints).toEqual(
      expect.arrayContaining([
        '围绕共同兴趣、同城或聊天节奏开场',
        '不要直接提身材、颜值、性暗示或关系压力',
      ]),
    );
  });

  it('uses travel-specific safe defaults and rejects unsafe travel openers', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        message: '加我微信，直接发酒店地址给你',
      }),
    };
    const service = new WorkoutOpenerDraftService(toolJson as never);

    await expect(
      service.draft({
        task: makeTravelTask(),
        candidate: { displayName: '阿宁' },
        payload: {},
        fallbackDraft: '',
      }),
    ).resolves.toBe('你好，看到你也在找旅行搭子，可以先站内聊聊时间和路线吗？');
    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'travel_opener_draft',
        taskId: 101,
      }),
    );
    const prompt = JSON.parse(toolJson.callJson.mock.calls[0][0].prompt);
    expect(prompt).toMatchObject({ loopKind: 'travel' });
    expect(prompt.instruction).toContain('travel companion');
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
