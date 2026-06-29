import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { MatchingJobStatus } from '../entities/matching-job.entity';
import { TravelLoopService } from './travel-loop.service';

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
