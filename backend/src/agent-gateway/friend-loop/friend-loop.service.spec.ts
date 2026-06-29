import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { MatchingJobStatus } from '../entities/matching-job.entity';
import { FriendAgentBrainService } from './friend-agent-brain.service';
import { FriendLoopService } from './friend-loop.service';
import { FriendUnderstandingService } from './friend-understanding.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '认识新朋友',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeService(
  task = makeTask(),
  friendBrain?: {
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
        socialRequestId: 701,
        draft: { ...draft, socialRequestId: 701 },
      }),
    ),
    dismissDraft: jest.fn().mockResolvedValue(undefined),
  };
  const matchingJobs = {
    enqueue: jest.fn().mockResolvedValue({
      job: {
        id: 9001,
        publicIntentId: 'private-friend:101:701',
        sourceVersion: 'friend-private:青岛|认识新朋友',
        status: MatchingJobStatus.Queued,
      },
      reused: false,
    }),
  };
  const service = new FriendLoopService(
    taskRepo as never,
    messageLog as never,
    draftPublication as never,
    matchingJobs as never,
    friendBrain as never,
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

describe('FriendLoopService', () => {
  it('routes friend entrance through FriendAgentBrain when available', async () => {
    const friendBrain = {
      decideEntrance: jest.fn().mockImplementation(({ slots }) => ({
        loopKind: 'friend',
        action: 'ASK_INTAKE',
        reason: 'test_friend_brain_entrance',
        slots: {
          ...slots,
          scenePreference: '先站内聊聊',
        },
        missing: [],
      })),
    };
    const { service, task } = makeService(makeTask(), friendBrain);

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '想认识青岛同城朋友，咖啡聊天，周末有空',
    });

    expect(friendBrain.decideEntrance).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: expect.objectContaining({
          friendGoal: '认识新朋友',
          city: '青岛',
        }),
      }),
    );
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        scenePreference: '先站内聊聊',
      }),
    });
  });

  it('returns a prefilled friend intake card from natural language', async () => {
    const { draftPublication, service, task } = makeService();

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '想认识青岛同城朋友，咖啡聊天，周末有空',
    });

    expect(result.result).toMatchObject({
      action: 'clarify',
      cards: [
        expect.objectContaining({
          schemaType: 'friend.intake',
          data: expect.objectContaining({
            friendGoal: '认识新朋友',
            city: '青岛',
            topicTags: expect.arrayContaining(['咖啡', '聊天', '同城']),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect((task.memory as Record<string, unknown>).friendLoop).toMatchObject({
      stage: 'intake',
    });
  });

  it('uses friend understanding to fill slots that rules miss', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'friend',
        confidence: 0.88,
        friendGoal: '认识同城朋友',
        city: '上海',
        topicTags: ['咖啡', '低压力社交'],
        scenePreference: '先站内聊聊',
        timePreference: '周末',
        candidatePreference: '兴趣相近',
        missing: [],
        assumptions: [],
        needsClarification: false,
      }),
    };
    const friendBrain = new FriendAgentBrainService(
      new FriendUnderstandingService(toolJson as never),
    );
    const { draftPublication, service } = makeService(
      makeTask(),
      friendBrain as never,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task: makeTask(),
      message: '想在魔都认识同城咖啡朋友，周末先站内聊',
    });

    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'friend_understanding' }),
    );
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        friendGoal: '认识同城朋友',
        city: '上海',
        topicTags: expect.arrayContaining(['咖啡', '低压力社交']),
        scenePreference: '先站内聊聊',
        timePreference: '周末',
        candidatePreference: '兴趣相近',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('updates an active friend loop from natural-language follow-up slots', async () => {
    const task = makeTask({
      memory: {
        friendLoop: {
          stage: 'intake',
          slots: {
            friendGoal: '认识新朋友',
          },
        },
      },
    });
    const { draftPublication, service } = makeService(task);

    const result = await service.continueEntrance({
      ownerUserId: 7,
      task,
      message: '改成上海，周末咖啡聊天',
    });

    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        friendGoal: '认识新朋友',
        city: '上海',
        topicTags: expect.arrayContaining(['咖啡', '聊天']),
        timePreference: '周末',
        missingFields: [],
      }),
    });
    expect((task.memory as Record<string, unknown>).friendLoop).toMatchObject({
      stage: 'intake',
      slots: expect.objectContaining({
        city: '上海',
        timePreference: '周末',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('keeps friend understanding fallback conservative when model runtime is unavailable', async () => {
    const friendBrain = new FriendAgentBrainService(
      new FriendUnderstandingService(),
    );
    const { draftPublication, service } = makeService(
      makeTask(),
      friendBrain as never,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task: makeTask(),
      message: '想在魔都认识同城朋友',
    });

    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        friendGoal: '认识新朋友',
        missingFields: expect.arrayContaining(['city']),
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('keeps intake when required friend slots are missing', async () => {
    const { draftPublication, service } = makeService();

    const result = await service.performFriendAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'friend_intake.submit' as never,
        payload: {
          slots: {
            friendGoal: '认识新朋友',
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        missingFields: expect.arrayContaining(['city']),
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('turns completed friend intake into a staged friend draft', async () => {
    const { draftPublication, service } = makeService();

    const result = await service.performFriendAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'friend_intake.submit' as never,
        payload: {
          slots: {
            friendGoal: '认识新朋友',
            city: '青岛',
            topicTags: ['咖啡', '电影'],
            scenePreference: '先站内聊天',
          },
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'friend.draft',
      data: expect.objectContaining({
        friendGoal: '认识新朋友',
        city: '青岛',
        socialRequestId: 701,
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        type: 'coffee_chat',
        city: '青岛',
        metadata: expect.objectContaining({
          loop: 'friend',
          friendLoopStage: 'draft_ready',
        }),
      }),
    );
  });

  it('routes friend intake submit through FriendAgentBrain before drafting', async () => {
    const friendBrain = {
      decideIntakeSubmit: jest.fn().mockImplementation(({ slots }) => ({
        loopKind: 'friend',
        action: 'CREATE_DRAFT',
        reason: 'test_friend_brain_ready',
        slots: {
          ...slots,
          candidatePreference: '同城、节奏舒服',
        },
        missing: [],
      })),
    };
    const { draftPublication, service } = makeService(makeTask(), friendBrain);

    const result = await service.performFriendAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'friend_intake.submit' as never,
        payload: {
          slots: {
            friendGoal: '认识新朋友',
            city: '青岛',
          },
        },
      },
    });

    expect(friendBrain.decideIntakeSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        validation: { valid: true, missing: [] },
      }),
    );
    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'friend.draft',
      data: expect.objectContaining({
        candidatePreference: '同城、节奏舒服',
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).toHaveBeenCalledWith(
      7,
      101,
      expect.objectContaining({
        metadata: expect.objectContaining({
          candidatePreference: '同城、节奏舒服',
        }),
      }),
    );
  });

  it('queues durable private matching from a friend draft', async () => {
    const task = makeTask({
      memory: {
        friendLoop: {
          stage: 'draft_ready',
          slots: {
            friendGoal: '认识新朋友',
            city: '青岛',
            topicTags: ['咖啡'],
          },
        },
      },
    });
    const { matchingJobs, service } = makeService(task);

    const result = await service.performFriendAction({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'friend_draft.private_match' as never,
        payload: {
          socialRequestId: 701,
          slots: {
            friendGoal: '认识新朋友',
            city: '青岛',
            topicTags: ['咖啡'],
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
        schemaVersion: 'fitmeet.friend-loop.v1',
        mode: 'private_candidate_search',
        privateMatchMode: true,
        matchingJobId: 9001,
      }),
    });
    expect(matchingJobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        linkedSocialRequestId: 701,
        publicIntentId: 'private-friend:101:701',
        metadata: expect.objectContaining({
          source: 'friend_private_match',
          privateMatchMode: true,
        }),
      }),
    );
    expect(task.status).toBe(AgentTaskStatus.WaitingResult);
  });
});
