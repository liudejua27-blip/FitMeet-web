import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找跑步搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'social_search',
    confidence: 0.9,
    entities: {
      city: '青岛',
      activityType: '跑步',
      targetGender: '',
      timePreference: '周末',
      locationPreference: '',
    },
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
    source: 'rules',
    ...overrides,
  };
}

function makeHarness() {
  const profileEnrichment = {
    lifeGraphSearchClarification: jest.fn().mockResolvedValue(null),
  };
  const activitySearch = {
    handleActivitySearch: jest.fn().mockResolvedValue({
      activityResults: [{ id: 'activity-1', title: '周末晨跑' }],
      assistantMessage: '找到 1 条活动',
    }),
  };
  const service = new SocialAgentRouteSearchTurnService(
    profileEnrichment as never,
    activitySearch as never,
  );
  return { activitySearch, profileEnrichment, service };
}

describe('SocialAgentRouteSearchTurnService', () => {
  it('delegates activity search and returns activity cards without queueing a run', async () => {
    const { activitySearch, service } = makeHarness();
    const task = makeTask();
    const buildMemoryContext = jest.fn().mockReturnValue({ summary: 'memory' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'activity_search',
        replyStrategy: 'search_activities',
      }),
      message: '找周末晨跑活动',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext,
    });

    expect(result).toMatchObject({
      handled: true,
      assistantMessage: '找到 1 条活动',
      activityResults: [{ id: 'activity-1', title: '周末晨跑' }],
      queuedRun: null,
      runMode: null,
    });
    expect(activitySearch.handleActivitySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        task,
        message: '找周末晨跑活动',
        buildMemoryContext,
      }),
    );
  });

  it('answers social search with Life Graph clarification before queueing search', async () => {
    const { profileEnrichment, service } = makeHarness();
    profileEnrichment.lifeGraphSearchClarification.mockResolvedValue(
      '先补充一下你的可约时间，我再开始找。',
    );
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute(),
      message: '帮我找跑步搭子',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      assistantMessage: '先补充一下你的可约时间，我再开始找。',
      savedContext: true,
      queuedRun: null,
      runMode: null,
    });
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('queues initial social searches with the user message as the search goal', async () => {
    const { service } = makeHarness();
    const task = makeTask();
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });
    const replanAndRefresh = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '帮我找青岛附近的跑步搭子',
      replanAndRefresh,
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(queueInitialSearchForTask).toHaveBeenCalledWith(
      7,
      task,
      '帮我找青岛附近的跑步搭子',
    );
    expect(replanAndRefresh).not.toHaveBeenCalled();
  });

  it('queues a follow-up replan when candidate follow-up has search context', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      result: { chatRun: { candidateCount: 3 } },
    });
    const replanAndRefresh = jest
      .fn()
      .mockResolvedValue({ runId: 'run-follow-up' });
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        shouldSearch: false,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      message: '换成周末下午的人',
      replanAndRefresh,
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { runId: 'run-follow-up' },
      runMode: 'follow_up',
    });
    expect(replanAndRefresh).toHaveBeenCalledWith(7, 101, {
      userMessage: '换成周末下午的人',
      reason: 'user_follow_up',
    });
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('answers candidate follow-up questions without starting a run', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        shortTerm: {
          candidates: [
            {
              nickname: 'Mia',
              reasons: ['时间一致', '都喜欢跑步'],
              risk: { warnings: [] },
            },
          ],
        },
      },
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        shouldSearch: false,
        shouldReplan: false,
        replyStrategy: 'direct_reply',
      }),
      message: '为什么匹配',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('Mia 的主要匹配点是');
  });
});
