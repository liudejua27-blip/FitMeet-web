import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import { WorkoutAgentBrainService } from './workout-agent-brain.service';

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
  } as unknown as AgentTask;
}

describe('WorkoutAgentBrainService', () => {
  const router = new FitMeetLoopRouterService();

  it('decides to ask intake with LLM-filled slots instead of drafting on entrance', async () => {
    const understanding = {
      shouldCall: jest.fn().mockReturnValue(true),
      understand: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.9,
      }),
      slotsFromUnderstanding: jest.fn().mockReturnValue({
        activityType: '羽毛球',
        timePreference: '明晚',
        locationText: '华师大附近',
        city: '广州',
      }),
    };
    const geoResolver = {
      resolveAsync: jest.fn().mockResolvedValue({
        rawText: '华师大附近',
        locationText: '广州天河区华南师范大学',
        city: '广州',
        district: '天河区',
        poiName: '华南师范大学',
        source: 'amap',
        confidence: 0.88,
        needsConfirmation: false,
      }),
    };
    const brain = new WorkoutAgentBrainService(
      understanding as never,
      geoResolver as never,
    );

    await expect(
      brain.decideEntrance({
        task: makeTask(),
        message: '明晚华师大附近打羽毛球，找水平差不多的搭子',
        loopIntent: router.classify(
          '明晚华师大附近打羽毛球，找水平差不多的搭子',
        ),
      }),
    ).resolves.toMatchObject({
      action: 'ASK_INTAKE',
      missing: [],
      slots: {
        activityType: '羽毛球',
        timePreference: '明晚',
        city: '广州',
        district: '天河区',
        poiName: '华南师范大学',
      },
      geoResolution: {
        source: 'amap',
        needsConfirmation: false,
      },
    });
  });

  it('asks for location confirmation when nationwide geo resolution is ambiguous', async () => {
    const geoResolver = {
      resolveAsync: jest.fn().mockResolvedValue({
        rawText: '太古里',
        locationText: '成都锦江区太古里',
        city: '成都',
        district: '锦江区',
        poiName: '太古里',
        source: 'amap',
        confidence: 0.72,
        needsConfirmation: true,
        confirmationQuestion: '我查到多个太古里，这次是在成都太古里吗？',
        candidates: [
          {
            name: '成都远洋太古里',
            address: '成都市锦江区中纱帽街',
            city: '成都',
            district: '锦江区',
            level: 'poi',
            source: 'amap',
            confidence: 0.72,
          },
          {
            name: '三里屯太古里',
            address: '北京市朝阳区三里屯路',
            city: '北京',
            district: '朝阳区',
            level: 'poi',
            source: 'amap',
            confidence: 0.68,
          },
        ],
      }),
    };
    const brain = new WorkoutAgentBrainService(undefined, geoResolver as never);

    const decision = await brain.decideEntrance({
      task: makeTask(),
      message: '明晚太古里健身',
      loopIntent: router.classify('明晚太古里健身'),
      prefilledSlots: {
        activityType: '健身',
        timePreference: '明晚',
        locationText: '太古里',
      },
    });

    expect(decision).toMatchObject({
      action: 'ASK_LOCATION_CONFIRMATION',
      clarificationQuestion: '我查到多个太古里，这次是在成都太古里吗？',
      geoCandidates: expect.arrayContaining([
        expect.objectContaining({ name: '成都远洋太古里', source: 'amap' }),
        expect.objectContaining({ name: '三里屯太古里', source: 'amap' }),
      ]),
      yesPatch: expect.objectContaining({
        city: '成都',
        district: '锦江区',
        geoResolution: expect.objectContaining({
          source: 'user_confirmed',
          needsConfirmation: false,
        }),
      }),
    });
  });

  it('only creates a draft decision after intake submit validates required slots', async () => {
    const brain = new WorkoutAgentBrainService();

    await expect(
      brain.decideIntakeSubmit({
        task: makeTask(),
        message: '青岛大学附近',
        slots: {
          activityType: '跑步',
          timePreference: '明晚',
          locationText: '青岛大学附近',
          city: '青岛',
        },
      }),
    ).resolves.toMatchObject({
      action: 'CREATE_WORKOUT_DRAFT',
      missing: [],
    });
  });
});
