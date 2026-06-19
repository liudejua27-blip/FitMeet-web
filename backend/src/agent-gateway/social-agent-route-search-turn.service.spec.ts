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
  const profileGate = {
    evaluateForSocialExecution: jest.fn().mockResolvedValue({
      passed: true,
      missing: [],
      assistantMessage: '',
      profileCompleteness: 82,
    }),
  };
  const service = new SocialAgentRouteSearchTurnService(
    profileEnrichment as never,
    activitySearch as never,
    profileGate as never,
  );
  return { activitySearch, profileEnrichment, profileGate, service };
}

describe('SocialAgentRouteSearchTurnService', () => {
  it('asks for missing context before starting activity search', async () => {
    const { activitySearch, service } = makeHarness();
    const task = makeTask();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'activity_search',
        entities: {
          city: '',
          activityType: '跑步',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        replyStrategy: 'search_activities',
      }),
      message: '附近有没有跑步活动',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      activityResults: [],
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
    expect(result.assistantMessage).toContain('运动强度');
    expect(result.assistantMessage).toContain('社交边界');
    expect(activitySearch.handleActivitySearch).not.toHaveBeenCalled();
  });

  it('delegates clarified activity search and returns activity cards without queueing a run', async () => {
    const { activitySearch, service } = makeHarness();
    const task = makeTask();
    const buildMemoryContext = jest.fn().mockReturnValue({ summary: 'memory' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'activity_search',
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
        replyStrategy: 'search_activities',
      }),
      message:
        '青岛周末下午，青岛大学附近，轻松跑步，只在公共场所，先站内聊，接受陌生人，可以公开发起活动，找周末晨跑活动',
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
        message:
          '青岛周末下午，青岛大学附近，轻松跑步，只在公共场所，先站内聊，接受陌生人，可以公开发起活动，找周末晨跑活动（已确认：青岛、青岛大学附近、周末下午、跑步、轻松/低压力、公共场所、先站内沟通、接受陌生人、可公开发起活动）',
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
      message:
        '帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人，可以公开发起活动',
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

  it('blocks clarified social search when the minimum profile gate is missing', async () => {
    const { profileGate, service } = makeHarness();
    profileGate.evaluateForSocialExecution.mockResolvedValue({
      passed: false,
      missing: ['publicAuthorization'],
      assistantMessage: '为了让推荐更准，也避免误公开你的需求，我还需要补齐公开授权。',
      profileCompleteness: 42,
    });
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute(),
      message:
        '帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人，可以公开发起活动',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
      runMode: null,
      assistantMessage: expect.stringContaining('公开授权'),
    });
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('asks for city, time, intensity and boundary before starting candidate search', async () => {
    const { service } = makeHarness();
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute({
        entities: {
          city: '',
          activityType: '跑步',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '我想找跑步搭子',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
    expect(result.assistantMessage).toContain('运动强度');
    expect(result.assistantMessage).toContain('社交边界');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('asks for concrete context before searching from a broad new-friend request', async () => {
    const { service } = makeHarness();
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask({ goal: '认识新朋友' }),
      route: makeRoute({
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '我想认识一些新朋友',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
    expect(result.assistantMessage).toContain('场景：新朋友');
    expect(result.assistantMessage).toContain('运动强度');
    expect(result.assistantMessage).toContain('社交边界');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('asks about stranger and public-activity boundaries for vague low-pressure social requests', async () => {
    const { service } = makeHarness();
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask({ goal: '低压力社交' }),
      route: makeRoute({
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '我想尝试低压力社交，认识一些新朋友',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('是否接受陌生人');
    expect(result.assistantMessage).toContain('是否公开发起活动');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('continues queued candidate search after the user answers opportunity clarification', async () => {
    const { service } = makeHarness();
    const task = makeTask();
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });

    const first = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '',
          activityType: '跑步',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '我想找跑步搭子',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(first).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
    });
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();

    const second = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
      }),
      message:
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(second).toMatchObject({
      handled: true,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(queueInitialSearchForTask).toHaveBeenCalledTimes(1);
    expect(queueInitialSearchForTask).toHaveBeenCalledWith(
      7,
      task,
      expect.stringContaining(
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
      ),
    );
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain(
      '已确认：青岛、周末下午、跑步、轻松/低压力、同城周末有空、愿意先运动再慢慢熟悉',
    );
  });

  it('keeps clarifying when stranger and public-activity boundaries are missing', async () => {
    const { service } = makeHarness();
    const task = makeTask();
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
      }),
      message: '青岛周末下午，轻松跑步，只在公共场所，先站内聊，发送前确认',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('是否接受陌生人');
    expect(result.assistantMessage).toContain('是否公开发起活动');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('treats stranger and public-activity answers as completed opportunity boundaries', async () => {
    const { service } = makeHarness();
    const task = makeTask();
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });

    await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '',
          activityType: '跑步',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '我想找跑步搭子',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
      }),
      message:
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，接受陌生人，可以公开发起活动，发送前确认',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(queueInitialSearchForTask).toHaveBeenCalledTimes(1);
    const searchGoal = queueInitialSearchForTask.mock.calls[0]?.[2] ?? '';
    expect(searchGoal).toContain('已确认：青岛、周末下午、跑步、轻松/低压力');
    expect(searchGoal).toContain('同城周末有空');
    expect(searchGoal).toContain('接受陌生人');
    expect(searchGoal).toContain('可公开发起活动');
  });

  it('queues the clarified search from text even when route entities are empty', async () => {
    const { service } = makeHarness();
    const task = makeTask();
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });
    const emptyEntities = {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    };

    await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({ entities: emptyEntities }),
      message: '我想找人一起跑步',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({ entities: emptyEntities }),
      message:
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    const searchGoal = queueInitialSearchForTask.mock.calls[0]?.[2] ?? '';
    expect(searchGoal).toContain('已确认：青岛、周末、跑步、轻松/低压力');
    expect(searchGoal).toContain('同城周末有空');
    expect(searchGoal).toContain('公共场所');
    expect(searchGoal).toContain('先站内沟通');
    expect(searchGoal).toContain('接受陌生人');
    expect(searchGoal).toContain('可公开发起活动');
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
      message:
        '帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人，可以公开发起活动',
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
      '帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人，可以公开发起活动（已确认：青岛、周末、跑步、轻松/低压力、同城周末有空、先运动再慢慢熟悉、公共场所、先站内沟通、接受陌生人、可公开发起活动）',
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
