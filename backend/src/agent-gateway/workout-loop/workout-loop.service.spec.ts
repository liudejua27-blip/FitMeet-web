import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { GeoResolverService } from '../geo/geo-resolver.service';
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

function makeService(
  task = makeTask(),
  understanding?: {
    shouldCall: jest.Mock;
    understand: jest.Mock;
    slotsFromUnderstanding: jest.Mock;
  },
  brain?: {
    decideEntrance?: jest.Mock;
    decideContinuation?: jest.Mock;
    decideIntakeSubmit?: jest.Mock;
  },
) {
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(task),
    save: jest.fn(async (entity) => entity),
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
    new GeoResolverService(),
    understanding as never,
    brain as never,
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
      message: '帮我创建约练卡，跑步',
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

  it('returns a prefilled intake card for complete workout wording instead of drafting immediately', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '今晚青岛大学附近轻松跑步，3公里，找同校的人一起',
    });

    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect(result?.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            activityType: '跑步',
            timePreference: '今晚',
            locationText: expect.stringContaining('青岛大学'),
            city: '青岛',
          }),
        }),
      ],
    });
    expect((task.memory as Record<string, unknown>).workoutLoop).toMatchObject({
      stage: 'intake',
    });
  });

  it('returns intake for 青岛大学 健身 明天晚上 wording', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '我想在青岛大学找个搭子，健身，明天晚上',
    });

    expect(result?.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            activityType: '健身',
            timePreference: '明天晚上',
            locationText: expect.stringContaining('青岛大学'),
            city: '青岛',
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('returns intake when the user directly asks to publish a workout card', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message:
        '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
    });

    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect(result?.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            activityType: '篮球',
            timePreference: '明天下午3点',
            locationText: '北京大学',
            city: '北京',
            candidatePreference: '男生',
          }),
        }),
      ],
    });
  });

  it('continues an owned workout intake across short follow-up slot messages', async () => {
    const { draftPublication, service, task } = makeService(
      makeTask({
        memory: {
          workoutLoop: {
            stage: 'intake',
            slots: {},
          },
        },
      }),
    );

    const timeOnly = await service.continueEntrance({
      ownerUserId: 7,
      task,
      message: '明天晚上',
    });

    expect(timeOnly.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            missingFields: expect.arrayContaining([
              'activityType',
              'locationText',
            ]),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();

    const updated = await service.continueEntrance({
      ownerUserId: 7,
      task,
      message: '青岛大学附近健身',
    });

    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect(updated.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            activityType: '健身',
            timePreference: '明天晚上',
            locationText: expect.stringContaining('青岛大学'),
          }),
        }),
      ],
    });
  });

  it('prefills intake for inferred POI city instead of defaulting to Qingdao', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '明晚陆家嘴健身',
      bypassRouter: true,
    });

    expect(result?.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            city: '上海',
            locationText: expect.stringContaining('陆家嘴'),
            geoResolution: expect.objectContaining({
              source: 'poi_dictionary',
              needsConfirmation: true,
            }),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('turns a WorkoutAgentBrain location confirmation decision into a geo candidates card when multiple candidates exist', async () => {
    const brain = {
      decideEntrance: jest.fn().mockResolvedValue({
        action: 'ASK_LOCATION_CONFIRMATION',
        reason: 'entrance_geo_confirmation_required',
        slots: {
          activityType: '健身',
          timePreference: '明晚',
          locationText: '成都锦江区太古里',
          city: '成都',
          district: '锦江区',
          poiName: '太古里',
        },
        missing: [],
        understanding: null,
        geoResolution: {
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
        },
        geoCandidates: [
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
        clarificationQuestion: '我查到多个太古里，这次是在成都太古里吗？',
        yesPatch: {
          city: '成都',
          district: '锦江区',
          poiName: '太古里',
          geoResolution: {
            source: 'user_confirmed',
            needsConfirmation: false,
          },
        },
      }),
    };
    const { draftPublication, service, task } = makeService(
      makeTask(),
      undefined,
      brain,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '明晚太古里健身',
      bypassRouter: true,
    });

    expect(brain.decideEntrance).toHaveBeenCalled();
    expect(result?.result).toMatchObject({
      action: 'clarify',
      assistantMessage: '我查到多个太古里，这次是在成都太古里吗？',
      cards: [
        expect.objectContaining({
          schemaType: 'clarification.geo_candidates',
          data: expect.objectContaining({
            questionKey: 'workout_location',
            inferredIntent: 'workout',
            candidates: expect.arrayContaining([
              expect.objectContaining({ name: '成都远洋太古里' }),
              expect.objectContaining({ name: '三里屯太古里' }),
            ]),
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: 'clarification.select',
              payload: expect.objectContaining({
                selectedPatch: expect.objectContaining({ city: '成都' }),
              }),
            }),
          ]),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('returns intake for generic nearby places without inventing a city', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '我想发布约练卡，明晚学校附近跑步',
    });

    expect(result?.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            city: null,
            missingFields: expect.not.arrayContaining(['city']),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('uses workout understanding to fill missing rule slots without direct drafting', async () => {
    const understanding = {
      shouldCall: jest.fn().mockReturnValue(true),
      understand: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.84,
      }),
      slotsFromUnderstanding: jest.fn().mockReturnValue({
        activityType: '健身',
        timePreference: '下班后',
        locationText: '市北那边',
        city: '青岛',
        intensity: '低压力',
        slotMeta: {
          locationText: { source: 'llm', confidence: 0.86 },
          city: { source: 'llm', confidence: 0.82 },
        },
      }),
    };
    const { draftPublication, service, task } = makeService(
      makeTask(),
      understanding,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '下班后青大附近动一动，市北那边',
      bypassRouter: true,
    });

    expect(understanding.understand).toHaveBeenCalled();
    expect(result?.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            activityType: '健身',
            timePreference: '下班后',
            locationText: '市北那边',
            city: '青岛',
            intensity: '低压力',
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('turns intake submit payload into a staged draft', async () => {
    const { draftPublication, service } = makeService();

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
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        activityType: '羽毛球',
        city: '青岛',
        metadata: expect.objectContaining({
          loop: 'workout',
          locationText: '市北体育馆',
        }),
      }),
    );
  });

  it('keeps intake submit on the intake card when one of the three required slots is missing', async () => {
    const { draftPublication, service } = makeService();

    const result = await service.performWorkoutAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_intake.submit' as never,
        payload: {
          slots: {
            activityType: '羽毛球',
            locationText: '市北体育馆',
          },
        },
      },
    });

    expect(result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'workout.intake',
          data: expect.objectContaining({
            missingFields: expect.arrayContaining(['timePreference']),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('allows staged workout drafts without city and does not default to Qingdao', async () => {
    const { draftPublication, service } = makeService();

    const result = await service.performWorkoutAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_intake.submit' as never,
        payload: {
          slots: {
            activityType: '跑步',
            timePreference: '明晚',
            locationText: '学校附近',
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'workout.draft',
      data: expect.objectContaining({
        city: null,
        locationText: '学校附近',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        city: '',
        metadata: expect.objectContaining({
          city: null,
          locationText: '学校附近',
        }),
      }),
    );
  });

  it('queues private matching from a workout draft without publishing to discover', async () => {
    const task = makeTask({
      memory: {
        workoutLoop: {
          stage: 'draft_ready',
          slots: {
            activityType: '健身',
            timePreference: '明天晚上',
            locationText: '青岛大学附近',
            city: '青岛',
          },
          socialRequestId: 501,
        },
      },
    });
    const { messageLog, service, taskRepo } = makeService(task);

    const result = await service.performWorkoutAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'workout_draft.private_match' as never,
        payload: {
          taskId: 101,
          socialRequestId: 501,
          slots: {
            activityType: '健身',
            timePreference: '明天晚上',
            locationText: '青岛大学附近',
            city: '青岛',
          },
        },
      },
    });

    expect(result).toMatchObject({
      action: 'queue_search',
      shouldSearch: true,
      shouldQueueRun: true,
      replyStrategy: 'search_candidates',
      publicLoop: {
        stage: 'matching_queued',
        publicIntentId: null,
      },
      structuredIntent: expect.objectContaining({
        mode: 'private_candidate_search',
        privateMatchMode: true,
        publicDiscoverPublishSkipped: true,
        socialRequestId: 501,
      }),
    });
    expect((task.memory as Record<string, unknown>).workoutLoop).toMatchObject({
      stage: 'matching_queued',
      privateMatchMode: true,
      publicDiscoverPublishSkipped: true,
      socialRequestId: 501,
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      expect.stringContaining('不公开约练卡'),
      expect.objectContaining({ shouldQueueRun: true }),
    );
  });
});
