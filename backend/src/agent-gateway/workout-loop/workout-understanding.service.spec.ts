import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import { WorkoutUnderstandingService } from './workout-understanding.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '约练',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

describe('WorkoutUnderstandingService', () => {
  const router = new FitMeetLoopRouterService();

  it('falls back conservatively when no JSON model runtime is available', async () => {
    const service = new WorkoutUnderstandingService();

    await expect(
      service.understand({
        task: makeTask(),
        message: '想找个健身伙伴',
        ruleSlots: { activityType: '健身' },
        loopIntent: router.classify('想找个健身伙伴'),
      }),
    ).resolves.toMatchObject({
      intent: 'uncertain',
      confidence: 0,
      missing: expect.arrayContaining(['timePreference', 'locationText']),
      source: 'fallback',
    });
  });

  it('validates and normalizes JSON model output into workout slots', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.86,
        activityType: '跑步',
        timePreference: '明晚',
        locationText: '金鸡湖附近',
        city: '苏州',
        radiusKm: 5,
        missing: [],
        assumptions: [],
        needsClarification: false,
      }),
    };
    const service = new WorkoutUnderstandingService(toolJson as never);
    const result = await service.understand({
      task: makeTask(),
      message: '苏州金鸡湖夜跑',
      ruleSlots: {},
      loopIntent: router.classify('苏州金鸡湖夜跑'),
    });

    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'workout_understanding' }),
    );
    expect(service.slotsFromUnderstanding(result)).toMatchObject({
      activityType: '跑步',
      timePreference: '明晚',
      locationText: '金鸡湖附近',
      city: '苏州',
      radiusKm: 5,
    });
  });

  it('passes the task goal into DeepSeek context for multi-turn workout understanding', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.82,
        activityType: '跑步',
        locationMention: {
          rawText: '附近',
          normalizedText: '附近',
          relation: 'near',
          needsGeoResolution: true,
        },
        candidatePreference: '喜欢宠物的',
        missing: ['timePreference'],
        assumptions: ['上一轮用户询问附近活动'],
        needsClarification: true,
      }),
    };
    const service = new WorkoutUnderstandingService(toolJson as never);

    await service.understand({
      task: makeTask({
        goal: '附近有玩x的吗',
        memory: {
          socialAgentConversation: {
            turns: [
              {
                role: 'user',
                text: '附近有玩x的吗',
                at: '2026-06-30T01:00:00.000Z',
              },
              {
                role: 'assistant',
                text: '你是想找运动、桌游还是其他活动搭子？',
                at: '2026-06-30T01:00:01.000Z',
              },
              {
                role: 'user',
                text: '就是搭子',
                at: '2026-06-30T01:00:02.000Z',
              },
            ],
          },
        },
      }),
      message: '我想找跑步搭子，喜欢宠物的',
      ruleSlots: { activityType: '跑步', candidatePreference: '喜欢宠物的' },
      loopIntent: router.classify('我想找跑步搭子，喜欢宠物的'),
    });

    const prompt = JSON.parse(toolJson.callJson.mock.calls[0][0].prompt);
    expect(prompt).toMatchObject({
      userMessage: '我想找跑步搭子，喜欢宠物的',
      conversationContext: {
        taskGoal: '附近有玩x的吗',
        recentUserMessages: [
          '附近有玩x的吗',
          '就是搭子',
          '我想找跑步搭子，喜欢宠物的',
        ],
      },
    });
    expect(prompt.conversationContext.recentConversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', text: '附近有玩x的吗' }),
        expect.objectContaining({ role: 'user', text: '就是搭子' }),
        expect.objectContaining({
          role: 'user',
          text: '我想找跑步搭子，喜欢宠物的',
        }),
      ]),
    );
    expect(prompt.conversationContext.interpretationPolicy.join(' ')).toContain(
      'recentConversation',
    );
  });

  it('normalizes null optional DeepSeek fields instead of failing workout entrance', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.81,
        activityType: '跑步',
        timePreference: null,
        locationMention: {
          rawText: '附近',
          normalizedText: '附近',
          cityHint: null,
          districtHint: null,
          poiHint: null,
          relation: 'near',
          needsGeoResolution: null,
        },
        radiusKm: null,
        intensity: null,
        candidatePreference: '喜欢宠物的',
        missing: ['timePreference'],
        assumptions: [],
        needsClarification: true,
        clarificationQuestion: null,
      }),
    };
    const service = new WorkoutUnderstandingService(toolJson as never);

    const result = await service.understand({
      task: makeTask({ goal: '附近有玩x的吗' }),
      message: '我想找跑步搭子，喜欢宠物的',
      ruleSlots: { activityType: '跑步', candidatePreference: '喜欢宠物的' },
      loopIntent: router.classify('我想找跑步搭子，喜欢宠物的'),
    });

    expect(result.fallbackReason).toBeUndefined();
    expect(result.timePreference).toBeUndefined();
    expect(result.intensity).toBeUndefined();
    expect(result.locationMention).toMatchObject({
      rawText: '附近',
      normalizedText: '附近',
      relation: 'near',
      needsGeoResolution: true,
    });
    expect(result.locationMention?.cityHint).toBeUndefined();
    expect(service.slotsFromUnderstanding(result)).toMatchObject({
      activityType: '跑步',
      locationText: '附近',
      candidatePreference: '喜欢宠物的',
    });
  });

  it('normalizes unexpected location relation values instead of failing continuation', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.82,
        activityType: '篮球',
        timePreference: '明天下午3点',
        locationMention: {
          rawText: '北京大学',
          normalizedText: '北京大学',
          cityHint: '北京',
          districtHint: '海淀区',
          poiHint: '北京大学',
          relation: 'nearby_place',
          needsGeoResolution: true,
        },
        missing: [],
        assumptions: [],
        needsClarification: false,
      }),
    };
    const service = new WorkoutUnderstandingService(toolJson as never);

    const result = await service.understand({
      task: makeTask(),
      message: '明天下午3点北京大学篮球',
      ruleSlots: {},
      loopIntent: router.classify('明天下午3点北京大学篮球'),
    });

    expect(result.locationMention?.relation).toBe('unknown');
    expect(service.slotsFromUnderstanding(result)).toMatchObject({
      activityType: '篮球',
      timePreference: '明天下午3点',
      locationText: '北京大学',
      city: '北京',
      district: '海淀区',
      poiName: '北京大学',
    });
  });

  it('calls the model for arbitration candidates, incomplete draft slots, or uncertain locations', () => {
    const service = new WorkoutUnderstandingService();

    expect(
      service.shouldCall({
        slots: {
          activityType: '篮球',
          timePreference: '明天下午3点',
          locationText: '北京大学',
          city: '北京',
        },
        loopIntent: router.classify(
          '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
        ),
      }),
    ).toBe(false);

    expect(
      service.shouldCall({
        slots: { activityType: '健身' },
        loopIntent: router.classify('想找个健身伙伴'),
      }),
    ).toBe(true);

    expect(
      service.shouldCall({
        slots: {
          activityType: '跑步',
          timePreference: '下班后',
          locationText: '市北那边',
        },
        loopIntent: router.classify('下班后市北那边动一动'),
      }),
    ).toBe(true);

    expect(
      service.shouldCall({
        slots: {
          activityType: '健身',
          timePreference: '明晚',
          locationText: '陆家嘴',
          city: '上海',
          geoResolution: {
            rawText: '陆家嘴',
            locationText: '陆家嘴',
            city: '上海',
            source: 'poi_dictionary',
            confidence: 0.8,
            needsConfirmation: true,
          },
        },
        loopIntent: router.classify('明晚陆家嘴健身'),
      }),
    ).toBe(true);
  });
});
