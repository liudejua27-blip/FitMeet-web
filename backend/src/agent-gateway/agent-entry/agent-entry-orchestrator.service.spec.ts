import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { FitMeetLoopRouterService } from '../loop-router/fitmeet-loop-router.service';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { AgentEntryOrchestratorService } from './agent-entry-orchestrator.service';

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

function makeResult(
  overrides: Partial<SocialAgentIntentRouteResult> = {},
): SocialAgentIntentRouteResult {
  return {
    intent: 'social_search',
    confidence: 1,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'ask_clarifying_question',
    source: 'rules',
    action: 'clarify',
    taskId: 101,
    assistantMessage: '已进入约练流程',
    savedContext: true,
    profileUpdated: false,
    shouldQueueRun: false,
    runMode: null,
    queuedRun: null,
    pendingApproval: null,
    activityResults: [],
    profileUpdateProposal: null,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  };
}

function makeHarness() {
  const workoutLoop = {
    confirmArbitratedWorkout: jest.fn(),
    continueEntrance: jest.fn(),
    tryHandleEntrance: jest.fn(),
  };
  const legacy = {
    handleFallback: jest.fn(),
  };
  const profileLoop = {
    tryHandleEntrance: jest.fn(),
  };
  const workoutArbitration = {
    arbitrate: jest.fn(),
  };
  const friendLoop = {
    continueEntrance: jest.fn(),
    tryHandleEntrance: jest.fn(),
  };
  const travelLoop = {
    continueEntrance: jest.fn(),
    tryHandleEntrance: jest.fn(),
  };
  const service = new AgentEntryOrchestratorService(
    new FitMeetLoopRouterService(),
    workoutLoop as never,
    legacy as never,
    profileLoop as never,
    workoutArbitration as never,
    friendLoop as never,
    travelLoop as never,
  );
  return {
    friendLoop,
    legacy,
    profileLoop,
    service,
    workoutArbitration,
    workoutLoop,
    travelLoop,
  };
}

describe('AgentEntryOrchestratorService', () => {
  it('routes active workout-owned follow-up turns back to WorkoutLoop', async () => {
    const task = makeTask({
      memory: {
        workoutLoop: {
          stage: 'intake',
          slots: { activityType: '健身' },
        },
      },
    });
    const { legacy, service, workoutLoop } = makeHarness();
    workoutLoop.continueEntrance.mockResolvedValue({
      task,
      result: makeResult({
        cards: [
          {
            id: 'workout_intake:101',
            type: 'workout_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'workout.intake',
            title: '补全约练信息',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '明天晚上' },
      message: '明天晚上',
      startedAt: 123,
    });

    expect(result.source).toBe('workout_loop_owner');
    expect(workoutLoop.continueEntrance).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '明天晚上',
    });
    expect(workoutLoop.tryHandleEntrance).not.toHaveBeenCalled();
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('routes active friend-owned follow-up turns back to FriendLoop', async () => {
    const task = makeTask({
      memory: {
        friendLoop: {
          stage: 'intake',
          slots: { friendGoal: '认识新朋友' },
        },
      },
    });
    const { friendLoop, legacy, service } = makeHarness();
    friendLoop.continueEntrance.mockResolvedValue({
      task,
      result: makeResult({
        cards: [
          {
            id: 'friend_intake:101',
            type: 'friend_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'friend.intake',
            title: '填写本次交友需求',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '改成上海，周末咖啡' },
      message: '改成上海，周末咖啡',
      startedAt: 123,
    });

    expect(result.source).toBe('friend_loop_owner');
    expect(friendLoop.continueEntrance).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '改成上海，周末咖啡',
    });
    expect(friendLoop.tryHandleEntrance).not.toHaveBeenCalled();
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('routes active travel-owned follow-up turns back to TravelLoop', async () => {
    const task = makeTask({
      memory: {
        travelLoop: {
          stage: 'intake',
          slots: { destination: '成都', departureTime: '周末' },
        },
      },
    });
    const { legacy, service, travelLoop } = makeHarness();
    travelLoop.continueEntrance.mockResolvedValue({
      task,
      result: makeResult({
        cards: [
          {
            id: 'travel_intake:101',
            type: 'travel_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'travel.intake',
            title: '填写本次旅行寻伴需求',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '预算改成1500元，高铁' },
      message: '预算改成1500元，高铁',
      startedAt: 123,
    });

    expect(result.source).toBe('travel_loop_owner');
    expect(travelLoop.continueEntrance).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '预算改成1500元，高铁',
    });
    expect(travelLoop.tryHandleEntrance).not.toHaveBeenCalled();
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('routes new workout intent to WorkoutLoop before legacy fallback', async () => {
    const task = makeTask();
    const { legacy, service, workoutLoop } = makeHarness();
    workoutLoop.tryHandleEntrance.mockResolvedValue({
      task,
      result: makeResult({
        action: 'await_confirmation',
        cards: [
          {
            id: 'workout_draft:101:501',
            type: 'workout_draft',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'workout.draft',
            title: '今晚约练',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '我想在青岛大学找个搭子，健身，明天晚上' },
      message: '我想在青岛大学找个搭子，健身，明天晚上',
      startedAt: 123,
    });

    expect(result.source).toBe('workout_loop_intent');
    expect(workoutLoop.tryHandleEntrance).toHaveBeenCalled();
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('uses arbitration for keyword-only workout candidates before legacy fallback', async () => {
    const task = makeTask();
    const { legacy, service, workoutArbitration, workoutLoop } = makeHarness();
    workoutArbitration.arbitrate.mockResolvedValue({
      verdict: 'ask_clarification',
      understanding: null,
      slots: {
        activityType: '健身',
        timePreference: '明晚',
        locationText: '陆家嘴附近',
        city: '上海',
      },
      reason: 'workout_rule_geo_clarification',
    });
    workoutLoop.confirmArbitratedWorkout.mockResolvedValue({
      task,
      result: makeResult({
        cards: [
          {
            id: 'clarification:101',
            type: 'clarification_binary',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'clarification.binary',
            title: '确认地点',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '明晚陆家嘴健身' },
      message: '明晚陆家嘴健身',
      startedAt: 123,
    });

    expect(result.source).toBe('workout_loop_intent');
    expect(workoutArbitration.arbitrate).toHaveBeenCalledWith(
      expect.objectContaining({
        task,
        message: '明晚陆家嘴健身',
        loopIntent: expect.objectContaining({
          disposition: 'needs_arbitration',
          candidateIntent: 'workout',
        }),
      }),
    );
    expect(workoutLoop.confirmArbitratedWorkout).toHaveBeenCalled();
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('falls through to legacy when workout arbitration is not confident', async () => {
    const task = makeTask();
    const { legacy, service, workoutArbitration, workoutLoop } = makeHarness();
    workoutArbitration.arbitrate.mockResolvedValue({
      verdict: 'handoff_legacy',
      understanding: null,
      slots: { activityType: '健身' },
      reason: 'workout_arbitration_not_confident',
    });
    legacy.handleFallback.mockResolvedValue({ task, result: null });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '想找个健身伙伴' },
      message: '想找个健身伙伴',
      startedAt: 123,
    });

    expect(result.source).toBe('legacy_fallback');
    expect(workoutLoop.tryHandleEntrance).not.toHaveBeenCalled();
    expect(workoutLoop.confirmArbitratedWorkout).not.toHaveBeenCalled();
    expect(legacy.handleFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackReason: 'workout_keyword_candidate_defer_to_main_agent',
      }),
    );
  });

  it('routes explicit profile completion to ProfileLoop before legacy fallback', async () => {
    const task = makeTask();
    const { legacy, profileLoop, service } = makeHarness();
    profileLoop.tryHandleEntrance.mockResolvedValue({
      task,
      result: makeResult({
        intent: 'profile_enrichment_request',
        cards: [
          {
            id: 'profile_completion:101',
            type: 'profile_completion',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'profile.completion',
            title: '补全资料',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '帮我完善资料' },
      message: '帮我完善资料',
      startedAt: 123,
    });

    expect(result.source).toBe('profile_loop_intent');
    expect(profileLoop.tryHandleEntrance).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '帮我完善资料',
    });
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('routes friend intent to FriendLoop before legacy fallback', async () => {
    const task = makeTask();
    const { friendLoop, legacy, service } = makeHarness();
    friendLoop.tryHandleEntrance.mockResolvedValue({
      task,
      result: makeResult({
        cards: [
          {
            id: 'friend_intake:101',
            type: 'friend_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'friend.intake',
            title: '填写本次交友需求',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '想认识青岛同城朋友，咖啡聊天' },
      message: '想认识青岛同城朋友，咖啡聊天',
      startedAt: 123,
    });

    expect(result.source).toBe('friend_loop_intent');
    expect(friendLoop.tryHandleEntrance).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '想认识青岛同城朋友，咖啡聊天',
    });
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('routes travel intent to TravelLoop before legacy fallback', async () => {
    const task = makeTask();
    const { legacy, service, travelLoop } = makeHarness();
    travelLoop.tryHandleEntrance.mockResolvedValue({
      task,
      result: makeResult({
        cards: [
          {
            id: 'travel_intake:101',
            type: 'travel_intake',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'travel.intake',
            title: '填写本次结伴旅行需求',
            data: {},
            actions: [],
          },
        ],
      }),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '周末想找人结伴去成都旅游' },
      message: '周末想找人结伴去成都旅游',
      startedAt: 123,
    });

    expect(result.source).toBe('travel_loop_intent');
    expect(travelLoop.tryHandleEntrance).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '周末想找人结伴去成都旅游',
    });
    expect(legacy.handleFallback).not.toHaveBeenCalled();
  });

  it('keeps casual chat on legacy fallback', async () => {
    const task = makeTask();
    const { legacy, service, workoutLoop } = makeHarness();
    legacy.handleFallback.mockResolvedValue({
      task,
      result: null,
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      body: { message: '你好' },
      message: '你好',
      startedAt: 123,
    });

    expect(result.source).toBe('legacy_fallback');
    expect(legacy.handleFallback).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      body: { message: '你好' },
      message: '你好',
      startedAt: 123,
      signal: undefined,
      fallbackReason: 'no_loop_keyword',
    });
    expect(workoutLoop.tryHandleEntrance).not.toHaveBeenCalled();
  });
});
