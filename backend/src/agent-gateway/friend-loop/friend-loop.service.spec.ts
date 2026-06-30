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
  geoResolver?: { resolveAsync: jest.Mock },
  agentLoop?: { execute: jest.Mock },
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
    geoResolver as never,
    agentLoop as never,
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

function makeAgentLoopHarness(expectedToolName: string) {
  return {
    execute: jest.fn(async (input) => {
      const firstDecision = await input.brain.decide({
        loop: {} as never,
        observations: [],
        remainingToolCalls: 2,
      });
      expect(firstDecision.tool?.toolName).toBe(expectedToolName);
      const observation = await input.runner({
        runId: 'friend-loop-run',
        traceId: 'friend-loop-trace',
        taskId: 101,
        agent: 'Agent Brain',
        toolName: firstDecision.tool?.toolName ?? expectedToolName,
        input: firstDecision.tool?.input ?? {},
        attempt: 1,
      });
      const finalDecision = await input.brain.decide({
        loop: {} as never,
        observations: [observation],
        remainingToolCalls: 1,
      });
      expect(finalDecision.done).toBe(true);
      return {
        loop: {} as never,
        observations: [observation],
        answerBoundary: {
          fromObservationsOnly: true,
          requiresApproval: false,
          canContinue: true,
          status: 'ready',
        },
      };
    }),
  };
}

function completeFriendSlots(overrides: Record<string, unknown> = {}) {
  return {
    friendGoal: '认识新朋友',
    city: '青岛',
    locationText: '青岛市南区',
    topicTags: ['咖啡', '电影'],
    genderPreference: '不限性别',
    bodyPreference: '身材不限',
    appearancePreference: '外貌不限，看聊得来',
    scenePreference: '先站内聊天',
    ...overrides,
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

  it('runs friend entrance brain decisions through AgentLoop when available', async () => {
    const friendBrain = {
      decideEntrance: jest.fn().mockImplementation(({ slots }) => ({
        loopKind: 'friend',
        action: 'ASK_INTAKE',
        reason: 'test_friend_agent_loop_entrance',
        slots: {
          ...slots,
          scenePreference: '先站内聊聊',
        },
        missing: [],
      })),
    };
    const agentLoop = makeAgentLoopHarness('friend_agent.entrance');
    const { service, task } = makeService(
      makeTask(),
      friendBrain,
      undefined,
      agentLoop,
    );

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message: '想认识青岛同城朋友，咖啡聊天，周末有空',
    });

    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        goal: 'Friend agent decides the next safe card-driven loop step.',
        brain: expect.any(Object),
      }),
    );
    expect(friendBrain.decideEntrance).toHaveBeenCalledTimes(1);
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
            locationText: expect.stringContaining('青岛'),
            topicTags: expect.arrayContaining(['咖啡', '聊天', '同城']),
            missingFields: expect.arrayContaining([
              'genderPreference',
              'bodyPreference',
              'appearancePreference',
            ]),
          }),
        }),
      ],
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
    expect((task.memory as Record<string, unknown>).friendLoop).toMatchObject({
      stage: 'intake',
    });
  });

  it('returns geo candidate selection when friend location is ambiguous', async () => {
    const geoResolver = {
      resolveAsync: jest.fn().mockResolvedValue({
        rawText: '太古里',
        locationText: '成都锦江区成都远洋太古里',
        city: '成都',
        district: '锦江区',
        poiName: '成都远洋太古里',
        source: 'amap',
        confidence: 0.72,
        needsConfirmation: true,
        confirmationQuestion:
          '我查到多个城市可能匹配“太古里”，请选择这次交友所在地点。',
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
    const { service, task } = makeService(makeTask(), undefined, geoResolver);

    const result = await service.tryHandleEntrance({
      ownerUserId: 7,
      task,
      message:
        '想在太古里附近认识同城朋友，咖啡聊天，不限性别，身材不限，外貌不限',
    });

    expect(geoResolver.resolveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        locationText: expect.stringContaining('太古里'),
      }),
    );
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'clarification.geo_candidates',
      data: expect.objectContaining({
        inferredIntent: 'friend',
        noFallback: 'friend_intake',
        candidates: expect.arrayContaining([
          expect.objectContaining({ name: '成都远洋太古里', source: 'amap' }),
          expect.objectContaining({ name: '三里屯太古里', source: 'amap' }),
        ]),
      }),
    });
    expect((task.memory as Record<string, unknown>).friendLoop).toMatchObject({
      stage: 'intake',
      slots: expect.objectContaining({
        geoResolution: expect.objectContaining({
          source: 'amap',
          needsConfirmation: true,
        }),
      }),
    });
  });

  it('applies selected friend geo candidates back to friend intake', async () => {
    const task = makeTask({
      memory: {
        friendLoop: {
          stage: 'intake',
          slots: completeFriendSlots({
            city: undefined,
            locationText: '太古里',
          }),
        },
      },
    });
    const { service } = makeService(task);

    const result = await service.applySelectedSlots({
      ownerUserId: 7,
      taskId: 101,
      payload: {
        inferredSlots: {
          friendGoal: '认识新朋友',
          locationText: '太古里',
          topicTags: ['咖啡'],
          genderPreference: '不限性别',
          bodyPreference: '身材不限',
          appearancePreference: '外貌不限，看聊得来',
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
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        city: '成都',
        locationText: '成都锦江区成都远洋太古里',
        district: '锦江区',
        poiName: '成都远洋太古里',
        geoResolution: expect.objectContaining({
          source: 'user_confirmed',
          needsConfirmation: false,
        }),
      }),
    });
    expect((task.memory as Record<string, unknown>).friendLoop).toMatchObject({
      stage: 'intake',
      slots: expect.objectContaining({
        city: '成都',
        geoResolution: expect.objectContaining({ source: 'user_confirmed' }),
      }),
    });
  });

  it('uses friend understanding to fill slots that rules miss', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'friend',
        confidence: 0.88,
        friendGoal: '认识同城朋友',
        locationMention: {
          rawText: '魔都同城',
          normalizedText: '上海市区',
          cityHint: '上海',
          districtHint: '静安区',
          poiHint: '静安寺',
          relation: 'near',
          needsGeoResolution: true,
        },
        topicTags: ['咖啡', '低压力社交'],
        genderPreference: '不限性别',
        bodyPreference: '身材不限',
        appearancePreference: '外貌不限，看聊得来',
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
        district: '静安区',
        poiName: '静安寺',
        locationText: '上海市区',
        topicTags: expect.arrayContaining(['咖啡', '低压力社交']),
        genderPreference: '不限性别',
        bodyPreference: '身材不限',
        appearancePreference: '外貌不限，看聊得来',
        scenePreference: '先站内聊聊',
        timePreference: '周末',
        candidatePreference: '兴趣相近',
      }),
    });
    expect(
      (result.task.memory as Record<string, unknown>).friendLoop,
    ).toMatchObject({
      slots: expect.objectContaining({
        slotMeta: expect.objectContaining({
          locationText: { source: 'llm', confidence: 0.88 },
          city: { source: 'llm', confidence: 0.88 },
          district: { source: 'llm', confidence: 0.88 },
          poiName: { source: 'llm', confidence: 0.88 },
        }),
      }),
    });
    expect(draftPublication.stagePrivateDraftForPublish).not.toHaveBeenCalled();
  });

  it('keeps user-confirmed friend location above later LLM guesses', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'friend',
        confidence: 0.86,
        friendGoal: '认识同城朋友',
        locationMention: {
          rawText: '帝都太古里',
          normalizedText: '三里屯太古里',
          cityHint: '北京',
          districtHint: '朝阳区',
          poiHint: '三里屯太古里',
          relation: 'near',
          needsGeoResolution: true,
        },
        topicTags: ['咖啡'],
        genderPreference: '不限性别',
        bodyPreference: '身材不限',
        appearancePreference: '外貌不限，看聊得来',
        missing: [],
        assumptions: [],
        needsClarification: false,
      }),
    };
    const friendBrain = new FriendAgentBrainService(
      new FriendUnderstandingService(toolJson as never),
    );
    const task = makeTask({
      memory: {
        friendLoop: {
          stage: 'intake',
          slots: {
            friendGoal: '认识同城朋友',
            city: '成都',
            locationText: '成都锦江区成都远洋太古里',
            topicTags: ['咖啡'],
            genderPreference: '不限性别',
            bodyPreference: '身材不限',
            appearancePreference: '外貌不限，看聊得来',
            slotMeta: {
              city: { source: 'user_confirmed', confidence: 1 },
              locationText: { source: 'user_confirmed', confidence: 1 },
            },
          },
        },
      },
    });
    const { service } = makeService(task, friendBrain as never);

    const result = await service.continueEntrance({
      ownerUserId: 7,
      task,
      message: '还是帝都太古里吧',
    });

    expect(toolJson.callJson).toHaveBeenCalled();
    expect(result.result.cards?.[0]).toMatchObject({
      schemaType: 'friend.intake',
      data: expect.objectContaining({
        city: '成都',
        locationText: '成都锦江区成都远洋太古里',
      }),
    });
    expect((task.memory as Record<string, unknown>).friendLoop).toMatchObject({
      slots: expect.objectContaining({
        slotMeta: expect.objectContaining({
          city: { source: 'user_confirmed', confidence: 1 },
          locationText: { source: 'user_confirmed', confidence: 1 },
        }),
      }),
    });
  });

  it('updates an active friend loop from natural-language follow-up slots', async () => {
    const task = makeTask({
      memory: {
        friendLoop: {
          stage: 'intake',
          slots: {
            friendGoal: '认识新朋友',
            locationText: '上海市区',
            topicTags: ['咖啡'],
            genderPreference: '不限性别',
            bodyPreference: '身材不限',
            appearancePreference: '外貌不限，看聊得来',
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
        missingFields: expect.arrayContaining([
          'genderPreference',
          'bodyPreference',
          'appearancePreference',
        ]),
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
        missingFields: expect.arrayContaining([
          'locationText',
          'topicTags',
          'genderPreference',
          'bodyPreference',
          'appearancePreference',
        ]),
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
          slots: completeFriendSlots(),
        },
      },
    });

    expect(result.cards?.[0]).toMatchObject({
      schemaType: 'friend.draft',
      data: expect.objectContaining({
        friendGoal: '认识新朋友',
        city: '青岛',
        locationText: '青岛市南区',
        genderPreference: '不限性别',
        bodyPreference: '身材不限',
        appearancePreference: '外貌不限，看聊得来',
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
          slots: completeFriendSlots({ topicTags: ['咖啡'] }),
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
          slots: completeFriendSlots({ topicTags: ['咖啡'] }),
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
          slots: completeFriendSlots({ topicTags: ['咖啡'] }),
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
