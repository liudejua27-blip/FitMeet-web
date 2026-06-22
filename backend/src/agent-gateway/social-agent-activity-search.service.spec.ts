import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛跑步活动',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentTask;
}

function makeActivityRoute(): SocialAgentIntentRouterResult {
  return {
    intent: 'activity_search',
    confidence: 0.9,
    entities: {
      city: '青岛',
      activityType: 'running',
      targetGender: '',
      timePreference: '今晚',
      locationPreference: '青岛大学',
    },
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_activities',
    source: 'rules',
  };
}

describe('SocialAgentActivitySearchService', () => {
  it('maps real activity results and writes activity memory', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockResolvedValue({
        activityResults: [
          {
            id: 'activity-701',
            source: 'activity',
            isRealData: true,
            activityId: 701,
            publicIntentId: null,
            title: '青岛大学夜跑',
            description: '公开操场轻松跑。',
            city: '青岛',
            loc: '青岛大学',
            requestType: 'running',
            interestTags: ['跑步', '公开场所'],
            timePreference: '今晚',
            ownerUserId: 22,
            status: 'open',
            createdAt: '2026-06-01T12:00:00.000Z',
            matchScore: 91,
            matchReasons: ['同城', '时间匹配'],
          },
        ],
      }),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
    );
    const task = makeTask();

    const result = await service.handleActivitySearch({
      ownerUserId: 7,
      task,
      route: makeActivityRoute(),
      message: '今晚青岛大学附近有什么跑步活动',
      buildMemoryContext: () => null,
    });

    expect(candidatePool.searchActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        city: '青岛',
        activityType: 'running',
        locationPreference: '青岛大学',
        timePreference: '今晚',
        limit: 5,
      }),
    );
    expect(metrics.recordActivitySearch).toHaveBeenCalledWith(true, 1);
    expect(result.activityResults).toEqual([
      expect.objectContaining({
        id: 'activity-701',
        source: 'activity',
        title: '青岛大学夜跑',
        ownerUserId: 22,
        matchScore: 91,
      }),
    ]);
    expect(result.assistantMessage).toContain('已为你找到 1 条');
    expect(task.memory).toMatchObject({
      taskMemory: {
        activityState: {
          recommendedIds: ['activity-701'],
        },
        candidateState: {
          recommendedIds: [22],
        },
        currentTask: {
          state: 'showing_candidates',
          stateReason: 'activity_search_returned',
          waitingFor: 'activity_selection',
        },
      },
    });
  });

  it('uses restored taskMemory slots when route entities are empty', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockResolvedValue({
        activityResults: [],
      }),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
    );
    const task = makeTask({
      memory: {
        taskMemory: {
          taskSlots: {
            geo_area: {
              key: 'geo_area',
              value: '崂山区',
              state: 'inferred',
              source: 'location_parser',
            },
            activity: {
              key: 'activity',
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              key: 'time_window',
              value: '今天晚上',
              state: 'completed',
              source: 'user_message',
            },
            location_text: {
              key: 'location_text',
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
            },
          },
        },
      },
    });

    await service.handleActivitySearch({
      ownerUserId: 7,
      task,
      route: {
        ...makeActivityRoute(),
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      },
      message: '可以，帮我看看活动',
      buildMemoryContext: () => null,
    });

    expect(candidatePool.searchActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        city: '青岛',
        activityType: '散步',
        locationPreference: '青岛大学附近',
        timePreference: '今天晚上',
        limit: 5,
      }),
    );
  });

  it('uses known task slot constraints for restored activity search criteria', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockResolvedValue({
        activityResults: [],
      }),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
    );
    const task = makeTask({
      memory: {
        taskMemory: {
          knownTaskSlotConstraints: {
            treatAsHardConstraints: true,
            knownSlots: [
              { key: 'geo_area', label: '区域', value: '崂山区' },
              { key: 'activity', label: '活动', value: '散步' },
              { key: 'time_window', label: '时间', value: '今天晚上' },
              { key: 'location_text', label: '地点', value: '青岛大学附近' },
            ],
            doNotAskAgainFor: [
              'geo_area',
              'activity',
              'time_window',
              'location_text',
            ],
          },
        },
      },
    });

    await service.handleActivitySearch({
      ownerUserId: 7,
      task,
      route: {
        ...makeActivityRoute(),
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      },
      message: '继续找活动',
      buildMemoryContext: () => null,
    });

    expect(candidatePool.searchActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        city: '青岛',
        activityType: '散步',
        locationPreference: '青岛大学附近',
        timePreference: '今天晚上',
      }),
    );
  });

  it('uses hydrated task context for activity criteria and final LLM reply context', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockResolvedValue({
        activityResults: [
          {
            id: 'public-intent-901',
            source: 'public_intent',
            isRealData: true,
            activityId: null,
            publicIntentId: 901,
            title: '青岛大学附近散步',
            description: '今晚低强度散步。',
            city: '青岛',
            loc: '青岛大学',
            requestType: 'walking',
            interestTags: ['散步'],
            timePreference: '今天晚上',
            ownerUserId: 29,
            status: 'open',
            createdAt: '2026-06-01T12:00:00.000Z',
            matchScore: 88,
            matchReasons: ['时间匹配', '地点匹配'],
          },
        ],
      }),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const finalResponses = {
      generate: jest.fn().mockResolvedValue('我按刚才的信息找到了 1 个公开机会。'),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
      finalResponses as never,
    );
    const taskContext = {
      conversationHistory: [
        {
          role: 'user',
          text: '今天晚上，青岛大学附近，散步，优先舞蹈相关标签',
        },
        {
          role: 'assistant',
          text: '已记住时间、地点、活动和候选偏好。',
        },
      ],
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料含舞蹈相关标签优先',
          state: 'answered',
        },
      },
      knownTaskSlotConstraints: {
        treatAsHardConstraints: true,
        knownSlots: [
          { key: 'time_window', label: '时间', value: '今天晚上' },
          { key: 'location_text', label: '地点', value: '青岛大学附近' },
          { key: 'activity', label: '活动', value: '散步' },
          {
            key: 'candidate_preference',
            label: '候选偏好',
            value: '公开资料含舞蹈相关标签优先',
          },
        ],
        doNotAskAgainFor: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
      },
    };

    const result = await service.handleActivitySearch({
      ownerUserId: 7,
      task: makeTask(),
      route: {
        ...makeActivityRoute(),
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      },
      message: '可以，帮我找人',
      buildMemoryContext: () => ({ memory: 'hydrated' }),
      taskContext,
    });

    expect(candidatePool.searchActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        city: '青岛',
        activityType: '散步',
        locationPreference: '青岛大学附近',
        timePreference: '今天晚上',
      }),
    );
    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: taskContext.conversationHistory,
        taskContext,
        memoryContext: { memory: 'hydrated' },
      }),
    );
    expect(result.assistantMessage).toBe(
      '我按刚才的信息找到了 1 个公开机会。',
    );
  });

  it('returns an empty activity response when the candidate pool fails', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockRejectedValue(new Error('db offline')),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
    );

    const result = await service.handleActivitySearch({
      ownerUserId: 7,
      task: makeTask(),
      route: makeActivityRoute(),
      message: '找活动',
      buildMemoryContext: () => null,
    });

    expect(metrics.recordError).toHaveBeenCalledWith('activity_search_failed');
    expect(metrics.recordActivitySearch).toHaveBeenCalledWith(false, 0);
    expect(result.activityResults).toEqual([]);
    expect(result.assistantMessage).toContain('当前没有找到符合条件');
    expect(result.assistantMessage).toContain('不会编造活动');
    expect(result.assistantMessage).toContain('发布约练卡到发现');
  });

  it('skips final response generation for empty activity results', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockResolvedValue({ activityResults: [] }),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const finalResponses = {
      generate: jest.fn().mockResolvedValue('LLM 空活动回复'),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
      finalResponses as never,
    );

    const result = await service.handleActivitySearch({
      ownerUserId: 7,
      task: makeTask(),
      route: makeActivityRoute(),
      message: '今晚青岛大学附近有什么活动',
      buildMemoryContext: () => null,
    });

    expect(finalResponses.generate).not.toHaveBeenCalled();
    expect(metrics.recordDeterministicRouteReply).toHaveBeenCalledWith(
      'activity_search.empty_results',
      { estimatedAvoidedLlmCalls: 1 },
    );
    expect(result.activityResults).toEqual([]);
    expect(result.assistantMessage).toContain('真实活动或公开约练卡片');
    expect(result.assistantMessage).toContain('发布约练卡到发现');
  });

  it('records empty activity search state for the next turn', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockResolvedValue({ activityResults: [] }),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordDeterministicRouteReply: jest.fn(),
    };
    const service = new SocialAgentActivitySearchService(
      candidatePool as never,
      metrics as never,
    );
    const task = makeTask();

    const result = await service.handleActivitySearch({
      ownerUserId: 7,
      task,
      route: makeActivityRoute(),
      message: '今晚青岛大学附近有什么散步活动',
      buildMemoryContext: () => null,
    });

    expect(result.activityResults).toEqual([]);
    expect(task.memory).toMatchObject({
      shortTerm: {
        hasSearched: true,
        lastSearchIntent: 'activity_search',
        lastSearchCandidateCount: 0,
        lastSearchEmptyReason: 'no_real_candidates',
        lastSearchNextStep:
          '换城市、时间或活动类型，或确认发布约练卡到发现',
      },
      taskMemory: {
        currentTask: {
          state: 'showing_candidates',
          stateReason: 'activity_search_returned',
          waitingFor: 'search_refinement',
        },
      },
    });
  });
});
