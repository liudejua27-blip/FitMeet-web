import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { GeoResolverService } from '../geo/geo-resolver.service';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import { WorkoutEntryArbitrationService } from './workout-entry-arbitration.service';
import type { WorkoutUnderstandingResult } from './workout-understanding.service';

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

describe('WorkoutEntryArbitrationService', () => {
  const router = new FitMeetLoopRouterService();

  it('accepts high-confidence structured workout understanding', async () => {
    const understanding: WorkoutUnderstandingResult = {
      intent: 'workout',
      confidence: 0.91,
      activityType: '健身',
      timePreference: '明晚',
      locationText: '陆家嘴附近',
      city: '上海',
      missing: [],
      assumptions: [],
      needsClarification: false,
    };
    const model = {
      understand: jest.fn().mockResolvedValue(understanding),
      slotsFromUnderstanding: jest.fn().mockReturnValue({
        activityType: '健身',
        timePreference: '明晚',
        locationText: '陆家嘴附近',
        city: '上海',
      }),
    };
    const service = new WorkoutEntryArbitrationService(
      model as never,
      new GeoResolverService(),
    );

    await expect(
      service.arbitrate({
        task: makeTask(),
        message: '明晚陆家嘴健身',
        loopIntent: router.classify('明晚陆家嘴健身'),
      }),
    ).resolves.toMatchObject({
      verdict: 'accept_workout_loop',
      slots: expect.objectContaining({
        activityType: '健身',
        timePreference: '明晚',
        city: '上海',
      }),
    });
  });

  it('keeps high-confidence LLM arbitration slots over weaker rule recall', async () => {
    const understanding: WorkoutUnderstandingResult = {
      intent: 'workout',
      confidence: 0.93,
      activityType: '跑步',
      timePreference: '今晚',
      locationMention: {
        rawText: '市北那边',
        normalizedText: '市北那边',
        cityHint: '青岛',
        relation: 'near',
        needsGeoResolution: true,
      },
      missing: [],
      assumptions: [],
      needsClarification: false,
    };
    const model = {
      understand: jest.fn().mockResolvedValue(understanding),
      slotsFromUnderstanding: jest.fn().mockReturnValue({
        activityType: '跑步',
        timePreference: '今晚',
        locationText: '市北那边',
        city: '青岛',
        slotMeta: {
          locationText: { source: 'llm', confidence: 0.93 },
          city: { source: 'llm', confidence: 0.93 },
        },
      }),
    };
    const service = new WorkoutEntryArbitrationService(model as never);

    await expect(
      service.arbitrate({
        task: makeTask(),
        message: '今晚学校附近跑步，找个搭子',
        loopIntent: router.classify('今晚学校附近跑步，找个搭子'),
      }),
    ).resolves.toMatchObject({
      verdict: 'accept_workout_loop',
      slots: {
        locationText: '市北那边',
        city: '青岛',
        slotMeta: {
          locationText: { source: 'llm', confidence: 0.93 },
          city: { source: 'llm', confidence: 0.93 },
        },
      },
    });
  });

  it('asks clarification for rule-recalled POI workout without LLM', async () => {
    const service = new WorkoutEntryArbitrationService(
      undefined,
      new GeoResolverService(),
    );

    await expect(
      service.arbitrate({
        task: makeTask(),
        message: '明晚陆家嘴健身',
        loopIntent: router.classify('明晚陆家嘴健身'),
      }),
    ).resolves.toMatchObject({
      verdict: 'ask_clarification',
      reason: 'workout_rule_geo_clarification',
      slots: expect.objectContaining({
        city: '上海',
        geoResolution: expect.objectContaining({
          source: 'poi_dictionary',
          needsConfirmation: true,
        }),
      }),
    });
  });

  it('hands keyword-only workout candidates to legacy when no model is available', async () => {
    const service = new WorkoutEntryArbitrationService(
      undefined,
      new GeoResolverService(),
    );

    await expect(
      service.arbitrate({
        task: makeTask(),
        message: '想找个健身伙伴',
        loopIntent: router.classify('想找个健身伙伴'),
      }),
    ).resolves.toMatchObject({
      verdict: 'handoff_legacy',
    });
  });
});
