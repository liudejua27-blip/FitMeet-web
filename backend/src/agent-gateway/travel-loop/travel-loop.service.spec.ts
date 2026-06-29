import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { MatchingJobStatus } from '../entities/matching-job.entity';
import { TravelAgentBrainService } from './travel-agent-brain.service';
import { TravelLoopService } from './travel-loop.service';
import { TravelUnderstandingService } from './travel-understanding.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找旅行搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeService(
  task = makeTask(),
  travelBrain?: {
    decideEntrance?: jest.Mock;
    decideIntakeSubmit?: jest.Mock;
  },
  geoResolver?: { resolveAsync?: jest.Mock },
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
        socialRequestId: 801,
        draft: { ...draft, socialRequestId: 801 },
      }),
    ),
    dismissDraft: jest.fn().mockResolvedValue(undefined),
  };
  const matchingJobs = {
    enqueue: jest.fn().mockResolvedValue({
      job: {
        id: 9101,
        publicIntentId: 'private-travel:101:801',
        sourceVersion: 'travel-private:成都|周末|1000元|高铁',
        status: MatchingJobStatus.Queued,
      },
      reused: false,
    }),
  };
  const service = new TravelLoopService(
    taskRepo as never,
    messageLog as never,
    draftPublication as never,
    matchingJobs as never,
    travelBrain as never,
    geoResolver as never,
  );
  return {
    draftPublication,
    matchingJobs,
    messageLog,
    service,
    task,
    taskRepo,
  };
}

describe('TravelLoopService', () => {
  it('routes travel entrance through TravelAgentBrain when available', async () => {
    const travelBrain = {
      decideEntrance: jest.fn().mockImplementation(({ slots }) => ({
        loopKind: 'travel',
        action: 'ASK_INTAKE',
        reason: 'test_travel_brain_entrance',
        slots: {
          ...slots,
          foodPreference: '川菜和本地小吃',
        },
        missing: [],
      })),
    };
    const { service, task } = makeService(makeTask(), travelBrain);

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '周末想去成都旅游，预算1000元，高铁，找会拍照的搭子',
    });

    expect(travelBrain.decideEntrance).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: expect.objectContaining({
          destination: '成都',
          departureTime: '周末',
        }),
      }),
    );
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        foodPreference: '川菜和本地小吃',
      }),
    });
  });

  it('returns a prefilled travel intake card from natural language', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '周末想去成都旅游，预算1000元，高铁，找会拍照的搭子',
    });

    expect(result.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'travel.intake',
          data: expect.objectContaining({
            destination: '成都',
            departureTime: '周末',
            budgetRange: '1000元',
            transportMode: '高铁',
            photoPreference: '会拍照优先',
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect((task.memory as Record<string, unknown>).travelLoop).toMatchObject({
      stage: 'intake',
    });
  });

  it('does not infer arbitrary destination text as a city without GeoResolver', async () => {
    const { service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '周末去西湖玩，预算1000元，高铁，找会拍照的搭子',
    });

    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        destination: '西湖',
        city: null,
      }),
    });
  });

  it('uses travel understanding to normalize aliases and fill optional slots', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'travel',
        confidence: 0.9,
        locationMention: {
          rawText: '蓉城',
          normalizedText: '成都',
          cityHint: '成都',
          districtHint: '锦江区',
          poiHint: '成都远洋太古里',
          relation: 'city_only',
          needsGeoResolution: true,
        },
        departureTime: '周末',
        duration: '两天一晚',
        budgetRange: '1000元',
        transportMode: '高铁',
        tags: ['美食', '拍照'],
        photoPreference: '会拍照优先',
        foodPreference: '川菜和本地小吃',
        candidatePreference: '不赶路',
        missing: [],
        assumptions: [],
        needsClarification: false,
      }),
    };
    const travelBrain = new TravelAgentBrainService(
      new TravelUnderstandingService(toolJson as never),
    );
    const { draftPublication, service } = makeService(
      makeTask(),
      travelBrain as never,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task: makeTask(),
      message: '周末去蓉城玩，高铁，预算1000，找会拍照的搭子',
    });

    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'travel_understanding' }),
    );
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        destination: '成都',
        city: '成都',
        district: '锦江区',
        poiName: '成都远洋太古里',
        departureTime: '周末',
        duration: '两天一晚',
        budgetRange: '1000元',
        transportMode: '高铁',
        tags: expect.arrayContaining(['美食', '拍照']),
        photoPreference: '会拍照优先',
        foodPreference: '川菜和本地小吃',
        candidatePreference: '不赶路',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('resolves travel destination through GeoResolver and carries city into the draft', async () => {
    const geoResolver = {
      resolveAsync: jest.fn().mockResolvedValue({
        rawText: '西湖',
        locationText: '杭州西湖风景名胜区',
        city: '杭州',
        district: '西湖区',
        poiName: '西湖风景名胜区',
        source: 'amap',
        confidence: 0.88,
        needsConfirmation: false,
      }),
    };
    const travelBrain = new TravelAgentBrainService(
      undefined,
      geoResolver as never,
    );
    const task = makeTask();
    const { draftPublication, service } = makeService(
      task,
      travelBrain as never,
    );

    const entrance = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '周末去西湖玩，预算1000元，高铁，找会拍照的搭子',
    });

    expect(geoResolver.resolveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        locationText: '西湖',
      }),
    );
    expect(entrance.result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        destination: '杭州西湖风景名胜区',
        city: '杭州',
        geoResolution: expect.objectContaining({
          source: 'amap',
          city: '杭州',
        }),
        missingFields: [],
      }),
    });

    const memory = task.memory as {
      travelLoop?: { slots?: Record<string, unknown> };
    };
    await service.performTravelAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'travel_intake.submit' as never,
        payload: {
          slots: memory.travelLoop?.slots,
        },
      },
    });

    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        city: '杭州',
        locationName: '杭州西湖风景名胜区',
        metadata: expect.objectContaining({
          city: '杭州',
          geoResolution: expect.objectContaining({
            source: 'amap',
            city: '杭州',
          }),
        }),
      }),
    );
  });

  it('returns geo candidate clarification when travel destination is ambiguous', async () => {
    const task = makeTask();
    const geoResolver = {
      resolveAsync: jest.fn().mockResolvedValue({
        rawText: '太古里',
        locationText: '太古里',
        source: 'amap',
        confidence: 0.62,
        needsConfirmation: true,
        confirmationQuestion: '我查到几个太古里，你这次旅行想去哪个？',
        candidates: [
          {
            name: '成都远洋太古里',
            address: '成都市锦江区中纱帽街',
            province: '四川省',
            city: '成都',
            district: '锦江区',
            level: 'poi',
            source: 'amap',
            confidence: 0.82,
          },
          {
            name: '三里屯太古里',
            address: '北京市朝阳区三里屯路',
            province: '北京市',
            city: '北京',
            district: '朝阳区',
            level: 'poi',
            source: 'amap',
            confidence: 0.78,
          },
        ],
      }),
    };
    const { service } = makeService(task, undefined, geoResolver);

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '周末去太古里玩，预算1000元，高铁，找会拍照的搭子',
    });

    expect(geoResolver.resolveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        locationText: '太古里',
      }),
    );
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'clarification.geo_candidates',
      title: '选择旅行目的地',
      data: expect.objectContaining({
        inferredIntent: 'travel',
        noFallback: 'travel_intake',
        candidates: [
          expect.objectContaining({ name: '成都远洋太古里', source: 'amap' }),
          expect.objectContaining({ name: '三里屯太古里', source: 'amap' }),
        ],
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          action: 'clarification.select',
          payload: expect.objectContaining({
            inferredIntent: 'travel',
            noFallback: 'travel_intake',
          }),
        }),
      ]),
    });
    expect((task.memory as Record<string, unknown>).travelLoop).toMatchObject({
      stage: 'intake',
      slots: expect.objectContaining({
        destination: '太古里',
        geoResolution: expect.objectContaining({
          source: 'amap',
          needsConfirmation: true,
        }),
      }),
    });
  });

  it('applies a selected travel geo candidate back into the intake card', async () => {
    const task = makeTask({
      memory: {
        travelLoop: {
          stage: 'intake',
          slots: {
            destination: '太古里',
            departureTime: '周末',
            budgetRange: '1000元',
            transportMode: '高铁',
          },
        },
      },
    });
    const { service } = makeService(task);

    const result = await service.applySelectedSlots({
      ownerUserId: 7,
      taskId: 101,
      payload: {
        inferredIntent: 'travel',
        inferredSlots: {
          destination: '太古里',
          departureTime: '周末',
          budgetRange: '1000元',
          transportMode: '高铁',
        },
        selectedPatch: {
          locationText: '成都锦江区成都远洋太古里',
          city: '成都',
          district: '锦江区',
          poiName: '成都远洋太古里',
          geoResolution: {
            rawText: '成都远洋太古里',
            locationText: '成都锦江区成都远洋太古里',
            city: '成都',
            district: '锦江区',
            poiName: '成都远洋太古里',
            source: 'user_confirmed',
            confidence: 1,
            needsConfirmation: false,
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        destination: '成都锦江区成都远洋太古里',
        city: '成都',
        district: '锦江区',
        poiName: '成都远洋太古里',
        geoResolution: expect.objectContaining({
          source: 'user_confirmed',
          city: '成都',
        }),
        missingFields: [],
      }),
    });
  });

  it('updates an active travel loop from natural-language follow-up slots', async () => {
    const task = makeTask({
      memory: {
        travelLoop: {
          stage: 'intake',
          slots: {
            destination: '成都',
            departureTime: '周末',
          },
        },
      },
    });
    const { draftPublication, service } = makeService(task);

    const result = await service.continueEntrance({
      ownerUserId: 7,
      task,
      message: '预算改成1500元，高铁，找会拍照的',
    });

    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        destination: '成都',
        departureTime: '周末',
        budgetRange: '1500元',
        transportMode: '高铁',
        photoPreference: '会拍照优先',
        missingFields: [],
      }),
    });
    expect((task.memory as Record<string, unknown>).travelLoop).toMatchObject({
      stage: 'intake',
      slots: expect.objectContaining({
        budgetRange: '1500元',
        transportMode: '高铁',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('keeps travel understanding fallback conservative when model runtime is unavailable', async () => {
    const travelBrain = new TravelAgentBrainService(
      new TravelUnderstandingService(),
    );
    const { draftPublication, service } = makeService(
      makeTask(),
      travelBrain as never,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task: makeTask(),
      message: '周末去蓉城玩',
    });

    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        destination: '蓉城',
        departureTime: '周末',
        missingFields: expect.arrayContaining(['budgetRange', 'transportMode']),
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('keeps intake when required travel slots are missing', async () => {
    const { draftPublication, service } = makeService();

    const result = await service.performTravelAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'travel_intake.submit' as never,
        payload: {
          slots: {
            destination: '成都',
            departureTime: '周末',
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'travel.intake',
      data: expect.objectContaining({
        missingFields: expect.arrayContaining(['budgetRange', 'transportMode']),
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('turns completed travel intake into a staged travel companion draft', async () => {
    const { draftPublication, service } = makeService();

    const result = await service.performTravelAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'travel_intake.submit' as never,
        payload: {
          slots: {
            destination: '成都',
            departureTime: '周末',
            duration: '两天一晚',
            budgetRange: '1000元',
            transportMode: '高铁',
            tags: ['美食', '拍照'],
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'travel.companion_draft',
      data: expect.objectContaining({
        destination: '成都',
        socialRequestId: 801,
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        type: 'custom',
        city: '成都',
        activityType: '结伴旅行',
        metadata: expect.objectContaining({
          loop: 'travel',
          travelLoopStage: 'draft_ready',
        }),
      }),
    );
  });

  it('routes travel intake submit through TravelAgentBrain before drafting', async () => {
    const travelBrain = {
      decideIntakeSubmit: jest.fn().mockImplementation(({ slots }) => ({
        loopKind: 'travel',
        action: 'CREATE_DRAFT',
        reason: 'test_travel_brain_ready',
        slots: {
          ...slots,
          foodPreference: '川菜和本地小吃',
        },
        missing: [],
      })),
    };
    const { draftPublication, service } = makeService(makeTask(), travelBrain);

    const result = await service.performTravelAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'travel_intake.submit' as never,
        payload: {
          slots: {
            destination: '成都',
            departureTime: '周末',
            budgetRange: '1000元',
            transportMode: '高铁',
          },
        },
      },
    });

    expect(travelBrain.decideIntakeSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        validation: { valid: true, missing: [] },
      }),
    );
    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'travel.companion_draft',
      data: expect.objectContaining({
        foodPreference: '川菜和本地小吃',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        metadata: expect.objectContaining({
          foodPreference: '川菜和本地小吃',
        }),
      }),
    );
  });

  it('queues durable private matching from a travel companion draft', async () => {
    const task = makeTask({
      memory: {
        travelLoop: {
          stage: 'draft_ready',
          slots: {
            destination: '成都',
            departureTime: '周末',
            budgetRange: '1000元',
            transportMode: '高铁',
          },
        },
      },
    });
    const { matchingJobs, service } = makeService(task);

    const result = await service.performTravelAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'travel_draft.private_match' as never,
        payload: {
          socialRequestId: 801,
          slots: {
            destination: '成都',
            departureTime: '周末',
            budgetRange: '1000元',
            transportMode: '高铁',
          },
        },
      },
    });

    expect(result).toMatchObject({
      shouldSearch: true,
      shouldQueueRun: true,
      replyStrategy: 'search_candidates',
      publicLoop: { stage: 'matching_queued' },
      structuredIntent: expect.objectContaining({
        schemaVersion: 'fitmeet.travel-loop.v1',
        mode: 'private_candidate_search',
        privateMatchMode: true,
        matchingJobId: 9101,
      }),
    });
    expect(matchingJobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        linkedSocialRequestId: 801,
        publicIntentId: 'private-travel:101:801',
        metadata: expect.objectContaining({
          source: 'travel_private_match',
          privateMatchMode: true,
        }),
      }),
    );
    expect(task.status).toBe(AgentTaskStatus.WaitingResult);
  });
});
