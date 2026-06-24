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
      assistantMessageSource: 'llm',
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
  const taskRepo = {
    save: jest.fn(async (task: AgentTask) => task),
  };
  const service = new SocialAgentRouteSearchTurnService(
    taskRepo as never,
    profileEnrichment as never,
    activitySearch as never,
    profileGate as never,
  );
  return { activitySearch, profileEnrichment, profileGate, service, taskRepo };
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
      assistantMessageSource: 'deterministic_route',
      activityResults: [],
      queuedRun: null,
      runMode: null,
    });
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
    expect(result.assistantMessage).toContain('确认前不会公开');
    expect(result.assistantMessage).toContain('不会替你联系别人');
    expect(activitySearch.handleActivitySearch).not.toHaveBeenCalled();
  });

  it('delegates clarified activity search and returns activity cards without queueing a run', async () => {
    const { activitySearch, service } = makeHarness();
    const task = makeTask();
    const buildMemoryContext = jest.fn().mockReturnValue({ summary: 'memory' });
    const taskContext = {
      taskSlots: {
        activity: { value: '跑步', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
      },
    };

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
      taskContext,
    });

    expect(result).toMatchObject({
      handled: true,
      assistantMessage: '找到 1 条活动',
      assistantMessageSource: 'llm',
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
        taskContext,
      }),
    );
  });

  it('creates an OpportunityCard before candidate search for find-partner requests', async () => {
    const { profileGate, service } = makeHarness();
    profileGate.evaluateForSocialExecution.mockResolvedValue({
      passed: false,
      missing: ['publicAuthorization'],
      assistantMessage: '缺少公开授权',
      profileCompleteness: 10,
    });
    const task = makeTask({
      goal: '今天晚上青岛大学附近找轻松跑步搭子',
      memory: {
        taskSlots: {
          activity: { value: '跑步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          intensity: { value: '轻松', state: 'completed' },
          safety_boundary: {
            value: '公共场所，先站内聊',
            state: 'completed',
          },
        },
      },
    });
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
        },
      }),
      message: '今天晚上青岛大学附近找轻松跑步搭子，先站内聊',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(profileGate.evaluateForSocialExecution).not.toHaveBeenCalled();
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
      runMode: null,
      activityResults: [],
      cards: [
        expect.objectContaining({
          schemaType: 'social_match.activity',
          status: 'waiting_confirmation',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            activityType: '跑步',
            time: '今天晚上',
            locationName: '青岛大学附近',
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              label: '发布卡片',
              schemaAction: 'publish_to_discover',
            }),
            expect.objectContaining({
              label: '修改卡片',
              schemaAction: 'activity.modify_time',
            }),
            expect.objectContaining({
              label: '暂不发布',
              schemaAction: 'activity.skip_publish',
            }),
          ]),
        }),
      ],
    });
  });

  it('continues candidate search after an opportunity card has already been published', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      goal: '今天晚上青岛大学附近找轻松跑步搭子',
      memory: {
        shortTerm: {
          publishStatus: 'published',
          publicIntentId: 'public-intent:walk-qdu',
        },
        taskSlots: {
          activity: { value: '跑步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          intensity: { value: '轻松', state: 'completed' },
          safety_boundary: {
            value: '公共场所，先站内聊',
            state: 'completed',
          },
        },
      },
      result: {
        publishSocialRequest: {
          status: 'published',
          publicIntentId: 'public-intent:walk-qdu',
        },
      },
    });
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
          timePreference: '今天晚上',
          locationPreference: '青岛大学附近',
        },
      }),
      message: '根据这张已发布的约练卡继续匹配候选',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(queueInitialSearchForTask).toHaveBeenCalledTimes(1);
    expect(result.cards).toEqual([]);
    expect(result).toMatchObject({
      handled: true,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('已确认');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('跑步');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain(
      '青岛大学附近',
    );
  });

  it('does not repeat activity search after an empty activity result without changed criteria', async () => {
    const { activitySearch, service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
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
        shortTerm: {
          hasSearched: true,
          lastSearchIntent: 'activity_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '换城市、时间或活动类型，或确认发布约练卡到发现',
        },
      },
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'activity_search',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        replyStrategy: 'search_activities',
      }),
      message: '继续找活动',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: null,
      runMode: null,
      savedContext: true,
      assistantMessageSource: 'deterministic_route',
    });
    expect(result.assistantMessage).toContain('没有找到真实、公开可发现');
    expect(result.assistantMessage).toContain('活动或公开约练卡片');
    expect(result.assistantMessage).toContain('避免重复空搜');
    expect(activitySearch.handleActivitySearch).not.toHaveBeenCalled();
  });

  it('allows activity search after empty results when the user changes criteria', async () => {
    const { activitySearch, service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
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
        shortTerm: {
          hasSearched: true,
          lastSearchIntent: 'activity_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '换城市、时间或活动类型，或确认发布约练卡到发现',
        },
      },
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'activity_search',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        replyStrategy: 'search_activities',
      }),
      message: '那改到周末下午，范围扩大一点',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      activityResults: [{ id: 'activity-1', title: '周末晨跑' }],
    });
    expect(activitySearch.handleActivitySearch).toHaveBeenCalled();
  });

  it('ignores stale Life Graph clarification when search-critical fields are already confirmed', async () => {
    const { profileEnrichment, service } = makeHarness();
    profileEnrichment.lifeGraphSearchClarification.mockResolvedValue(
      '先补充一下你的可约时间，我再开始找。',
    );
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute(),
      message:
        '先不发布卡片，只推荐候选：帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: false,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(result.assistantMessage).toBeUndefined();
    expect(queueInitialSearchForTask).toHaveBeenCalledTimes(1);
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('周末下午');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('跑步');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('先不发布');
  });

  it('ignores Life Graph district follow-up when city is already confirmed', async () => {
    const { profileEnrichment, service } = makeHarness();
    profileEnrichment.lifeGraphSearchClarification.mockResolvedValue(
      '你大概在青岛哪个区、或者平时习惯在哪一带跑？',
    );
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ status: 'queued', taskId: 101 });

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '今天晚上',
          locationPreference: '',
        },
      }),
      message:
        '先不发布卡片，只推荐候选：青岛今天晚上，轻松跑步，只在公共场所，先站内聊，发送前确认',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: false,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(result.assistantMessage).toBeUndefined();
    expect(queueInitialSearchForTask).toHaveBeenCalledTimes(1);
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('青岛');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('今天晚上');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('跑步');
  });

  it('keeps non-stale Life Graph safety clarification before queueing search', async () => {
    const { profileEnrichment, service } = makeHarness();
    profileEnrichment.lifeGraphSearchClarification.mockResolvedValue(
      '为了安全，我需要先确认：第一次见面是否只接受公共场所、是否先站内沟通？',
    );
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute(),
      message:
        '先不发布卡片，只推荐候选：帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      assistantMessage:
        '为了安全，我需要先确认：第一次见面是否只接受公共场所、是否先站内沟通？',
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
      assistantMessage:
        '为了让推荐更准，也避免误公开你的需求，我还需要补齐公开授权。',
      profileCompleteness: 42,
    });
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task: makeTask(),
      route: makeRoute(),
      message:
        '先不发布卡片，只推荐候选：帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人',
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

  it('asks for search-critical context before starting candidate search', async () => {
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
    expect(result.assistantMessage).toContain('确认前不会公开');
    expect(result.assistantMessage).toContain('不会替你联系别人');
    expect(result.assistantMessage).not.toContain('是否接受陌生人');
    expect(result.assistantMessage).not.toContain('是否公开发起活动');
    expect(result.assistantMessage).not.toContain('运动强度');
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
    expect(result.assistantMessage).toContain('目标：新朋友');
    expect(result.assistantMessage).toContain('偏好：新朋友');
    expect(result.assistantMessage).toContain('运动或见面场景');
    expect(result.assistantMessage).not.toContain('是否接受陌生人');
    expect(result.assistantMessage).not.toContain('是否公开发起活动');
    expect(result.assistantMessage).not.toContain('运动强度');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('asks for city and time for vague low-pressure social requests', async () => {
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
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
    expect(result.assistantMessage).toContain('运动或见面场景');
    expect(result.assistantMessage).not.toContain('是否接受陌生人');
    expect(result.assistantMessage).not.toContain('是否公开发起活动');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('continues private candidate search after the user answers clarification and skips publishing', async () => {
    const { profileEnrichment, service } = makeHarness();
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
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，先不发布到发现',
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
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，先不发布到发现',
      ),
      { signal: null, waitForCompletionMs: 45_000 },
    );
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain(
      '已确认：青岛、周末下午、跑步、轻松/低压力、同城周末有空、愿意先运动再慢慢熟悉',
    );
    expect(profileEnrichment.lifeGraphSearchClarification).toHaveBeenCalledWith(
      7,
      expect.stringContaining(
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，先不发布到发现',
      ),
    );
    expect(profileEnrichment.lifeGraphSearchClarification).toHaveBeenCalledWith(
      7,
      expect.stringContaining('已确认'),
    );
  });

  it('does not hold candidate search until stranger and public-activity policy are known', async () => {
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
      savedContext: false,
      queuedRun: { status: 'queued', taskId: 101 },
      runMode: 'initial',
    });
    expect(result.assistantMessage).toBeUndefined();
    expect(queueInitialSearchForTask).toHaveBeenCalledTimes(1);
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).toContain('公共场所');
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).not.toContain(
      '接受陌生人',
    );
    expect(queueInitialSearchForTask.mock.calls[0]?.[2]).not.toContain(
      '可公开发起活动',
    );
  });

  it('creates a publish confirmation card after clarification answer allows public activity', async () => {
    const { service, taskRepo } = makeHarness();
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
          locationPreference: '青岛大学操场',
        },
      }),
      message:
        '青岛周末下午，青岛大学操场，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，可以公开发起活动，发送前确认',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      savedContext: true,
      queuedRun: null,
      runMode: null,
      cards: [
        expect.objectContaining({
          schemaType: 'social_match.activity',
          title: '约练卡待发布',
          status: 'waiting_confirmation',
          data: expect.objectContaining({
            opportunityCard: true,
            publishStatus: 'draft',
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              label: '发布卡片',
              schemaAction: 'publish_to_discover',
            }),
            expect.objectContaining({
              label: '修改卡片',
              schemaAction: 'activity.modify_time',
            }),
            expect.objectContaining({
              label: '暂不发布',
              schemaAction: 'activity.skip_publish',
            }),
          ]),
        }),
      ],
    });
    expect(result.assistantMessage).toContain('约练卡片');
    expect(result.assistantMessage).toContain('确认后再发布');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(task.result).toMatchObject({
      chatRun: {
        socialRequestDraft: expect.objectContaining({
          activityType: '跑步',
          timePreference: '周末下午',
          locationName: '青岛大学',
        }),
        publishStatus: 'draft',
      },
    });
    expect(task.memory).toMatchObject({
      socialAgentChat: {
        socialRequestDraft: expect.objectContaining({
          activityType: '跑步',
        }),
        publishStatus: 'draft',
      },
      shortTerm: {
        publishStatus: 'draft',
      },
    });
    expect(
      result.cards?.[0]?.actions?.map((action) => action.label),
    ).not.toContain('删除卡片');
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
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，先不发布到发现',
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
    expect(searchGoal).toContain('已确认：青岛、周末下午、跑步、轻松/低压力');
    expect(searchGoal).toContain('同城周末有空');
    expect(searchGoal).toContain('公共场所');
    expect(searchGoal).toContain('先站内沟通');
    expect(searchGoal).toContain('接受陌生人');
    expect(searchGoal).toContain('先不发布到发现');
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
        '先不发布卡片，只推荐候选：帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人',
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
      '先不发布卡片，只推荐候选：帮我找青岛周末下午轻松跑步搭子，想认识同城周末有空、先运动再慢慢熟悉的人，公共场所先站内聊，接受陌生人（已确认：青岛、周末、跑步、轻松/低压力、同城周末有空、先运动再慢慢熟悉、公共场所、先站内沟通、接受陌生人）',
      { signal: null, waitForCompletionMs: 45_000 },
    );
    expect(replanAndRefresh).not.toHaveBeenCalled();
  });

  it('does not repeat the same search after an empty real-candidate result without changed criteria', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
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
        shortTerm: {
          hasSearched: true,
          lastSearchIntent: 'social_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
        },
      },
    });
    const replanAndRefresh = jest.fn();
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '可以，帮我找人',
      replanAndRefresh,
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: null,
      runMode: null,
      savedContext: true,
    });
    expect(result.assistantMessage).toContain('没有找到真实、公开可发现');
    expect(result.assistantMessage).toContain('避免重复空搜');
    expect(result.assistantMessage).toContain('发布到发现');
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
    expect(replanAndRefresh).not.toHaveBeenCalled();
  });

  it('allows a new search after empty results when the user changes or broadens criteria', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
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
        shortTerm: {
          hasSearched: true,
          lastSearchIntent: 'social_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
        },
      },
    });
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ runId: 'run-broadened' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '那扩大到 10 公里，舞蹈标签也可以放宽',
      replanAndRefresh: jest.fn(),
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { runId: 'run-broadened' },
      runMode: 'initial',
    });
    expect(queueInitialSearchForTask).toHaveBeenCalled();
  });

  it('does not replan candidate follow-up after an empty result unless criteria changed', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
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
        shortTerm: {
          hasSearched: true,
          lastSearchIntent: 'social_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
        },
      },
      result: {
        chatRun: {
          candidateCount: 0,
          socialRequestId: 301,
          socialRequestDraft: { title: '今晚青岛大学散步' },
        },
      },
    });
    const replanAndRefresh = jest.fn();
    const queueInitialSearchForTask = jest.fn();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      message: '可以，继续帮我找',
      replanAndRefresh,
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: null,
      runMode: null,
      savedContext: true,
    });
    expect(result.assistantMessage).toContain('避免重复空搜');
    expect(replanAndRefresh).not.toHaveBeenCalled();
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('allows candidate follow-up replan after empty results when criteria are broadened', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        shortTerm: {
          hasSearched: true,
          lastSearchIntent: 'social_search',
          lastSearchCandidateCount: 0,
          lastSearchEmptyReason: 'no_real_candidates',
          lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
        },
      },
      result: {
        chatRun: {
          candidateCount: 0,
          socialRequestId: 301,
          socialRequestDraft: { title: '今晚青岛大学散步' },
        },
      },
    });
    const replanAndRefresh = jest
      .fn()
      .mockResolvedValue({ runId: 'run-follow-up-broadened' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      message: '那就放宽到 10 公里，时间也可以换成周末下午',
      replanAndRefresh,
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { runId: 'run-follow-up-broadened' },
      runMode: 'follow_up',
    });
    expect(replanAndRefresh).toHaveBeenCalled();
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
    expect(replanAndRefresh).toHaveBeenCalledWith(
      7,
      101,
      {
        userMessage: '换成周末下午的人（已确认：青岛、周末、跑步）',
        reason: 'user_follow_up',
      },
      { signal: null },
    );
    expect(queueInitialSearchForTask).not.toHaveBeenCalled();
  });

  it('preserves completed slots and candidate preference on short follow-up search turns', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '今天晚上',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          candidate_preference: {
            key: 'candidate_preference',
            value: '女生、舞蹈相关公开标签优先',
            state: 'answered',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
        },
      },
      result: { chatRun: { candidateCount: 1 } },
    });
    const replanAndRefresh = jest
      .fn()
      .mockResolvedValue({ runId: 'run-follow-up' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      message: '可以，帮我找人',
      replanAndRefresh,
      queueInitialSearchForTask: jest.fn(),
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { runId: 'run-follow-up' },
      runMode: 'follow_up',
    });
    const userMessage = replanAndRefresh.mock.calls[0]?.[2]?.userMessage ?? '';
    expect(userMessage).toContain('可以，帮我找人');
    expect(userMessage).toContain('今天晚上');
    expect(userMessage).toContain('青岛大学附近');
    expect(userMessage).toContain('散步');
    expect(userMessage).toContain('女生、舞蹈相关公开标签优先');
  });

  it('uses restored taskMemory slots for first search without forcing a replan', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步，优先舞蹈相关公开标签',
          taskSlots: {
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
            candidate_preference: {
              key: 'candidate_preference',
              value: '女生、舞蹈相关公开标签优先',
              state: 'answered',
              source: 'user_message',
            },
          },
        },
      },
    });
    const replanAndRefresh = jest
      .fn()
      .mockResolvedValue({ runId: 'run-follow-up' });
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ runId: 'run-initial' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      message: '可以，帮我找人',
      replanAndRefresh,
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { runId: 'run-initial' },
      runMode: 'initial',
    });
    expect(replanAndRefresh).not.toHaveBeenCalled();
    const userMessage = queueInitialSearchForTask.mock.calls[0]?.[2] ?? '';
    expect(userMessage).toContain('可以，帮我找人');
    expect(userMessage).toContain('今天晚上');
    expect(userMessage).toContain('青岛大学附近');
    expect(userMessage).toContain('散步');
    expect(userMessage).toContain('女生、舞蹈相关公开标签优先');
  });

  it('does not treat inferred-only taskMemory slots as enough search context', async () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskMemory: {
          taskSlots: {
            activity: { value: '散步', state: 'inferred' },
            time_window: { value: '今天晚上', state: 'inferred' },
            location_text: { value: '青岛大学附近', state: 'inferred' },
          },
        },
      },
    });
    const replanAndRefresh = jest.fn();
    const queueInitialSearchForTask = jest
      .fn()
      .mockResolvedValue({ runId: 'run-initial' });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      }),
      message: '继续找',
      replanAndRefresh,
      queueInitialSearchForTask,
      buildMemoryContext: jest.fn(),
    });

    expect(result).toMatchObject({
      handled: true,
      queuedRun: { runId: 'run-initial' },
      runMode: 'initial',
    });
    expect(replanAndRefresh).not.toHaveBeenCalled();
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
