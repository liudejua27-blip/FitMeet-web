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

  it('returns an empty activity response when the candidate pool fails', async () => {
    const candidatePool = {
      searchActivity: jest.fn().mockRejectedValue(new Error('db offline')),
    };
    const metrics = {
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
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
  });
});
