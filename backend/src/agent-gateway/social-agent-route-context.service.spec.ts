import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    agentConnectionId: null,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
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

function makeSnapshot(): LongTermMemorySnapshot {
  return {
    userId: 7,
    profileFacts: { city: '青岛', school: '青岛大学' },
    preferences: {
      interests: ['跑步'],
      socialStyle: '低压力',
      communicationStyle: '',
      preferredTraits: [],
      preferenceHistory: [],
    },
    boundaries: {
      excludedGenders: [],
      noNightMeet: true,
      publicPlaceOnly: true,
      noAutoMessage: false,
      noContactExchange: false,
    },
    socialGoals: ['同校跑步搭子'],
    availability: ['周末下午'],
    activityPreferences: {
      favoriteCities: ['青岛'],
      favoriteActivityTypes: ['running'],
      favoriteTimePreferences: ['weekend_afternoon'],
      favoriteLocationPreferences: ['campus'],
    },
    matchSignals: { successfulMatches: [], failedMatches: [] },
    taskCount: 3,
    updatedAt: '2026-06-06T00:00:00.000Z',
  };
}

function makeHarness(
  options: { ragThrows?: boolean; contextLimit?: string } = {},
) {
  const metrics = {
    recordLatency: jest.fn(),
    recordError: jest.fn(),
  };
  const rag = {
    retrieve: jest.fn().mockImplementation(() => {
      if (options.ragThrows) throw new Error('rag offline');
      return Promise.resolve({
        intent: 'social_search',
        retrievedKinds: ['opening_templates', 'user_memory_summary'],
        safetySop: [],
        openingTemplates: [{ title: '低压力开场白' }],
        activitySop: [],
        successfulMatchCases: [{ title: '同校慢跑成功案例' }],
        userMemorySummary: { preferencesSummary: '喜欢跑步' },
      });
    }),
  };
  const memoryContext = {
    build: jest.fn().mockReturnValue({ memory: 'context' }),
  };
  const service = new SocialAgentRouteContextService(
    metrics as never,
    rag as never,
    memoryContext as never,
    options.contextLimit
      ? ({
          get: (key: string) =>
            key === 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT'
              ? options.contextLimit
              : undefined,
        } as never)
      : undefined,
  );
  return { memoryContext, metrics, rag, service };
}

describe('SocialAgentRouteContextService', () => {
  it('builds route task context from candidates, run result and long-term signals', () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
        },
        taskSlotSummary: {
          text: '今天晚上 · 青岛大学附近 · 散步',
          completedRequiredSlots: ['time_window', 'location_text', 'activity'],
        },
        taskMemory: {
          currentGoal: '今晚在青岛大学附近找散步搭子',
          currentTask: {
            state: 'searching_candidates',
            objective: '找公开可发现的散步搭子',
            nextStep: 'search_candidates',
          },
          preferences: {
            interests: ['散步'],
            socialStyle: '低压力',
            communicationStyle: '',
            preferredTraits: ['公开资料含舞蹈标签优先'],
          },
          boundaries: {
            excludedGenders: [],
            acceptsStrangers: true,
            publicActivityAllowed: true,
            noNightMeet: false,
            publicPlaceOnly: true,
            noAutoMessage: true,
            noContactExchange: true,
          },
          candidateActions: {
            22: {
              targetUserId: 22,
              status: 'saved',
            },
          },
          pendingApprovals: [
            {
              id: 88,
              actionType: 'send_invite',
              summary: '给候选人发送今晚青岛大学散步邀请',
            },
          ],
        },
        shortTerm: {
          candidates: [{ candidateUserId: 22 }, { candidateUserId: 23 }],
        },
      },
      result: {
        chatRun: {
          candidateCount: 9,
          socialRequestId: 301,
        },
      },
    });

    const context = service.buildTaskContext({
      task,
      body: { message: '换一批', hasCandidates: false },
      longTermSnapshot: makeSnapshot(),
      memoryContext: { shortTerm: { candidateCount: 2 } } as never,
    });

    expect(context).toMatchObject({
      taskId: 101,
      taskType: 'social_agent_chat',
      status: AgentTaskStatus.Pending,
      goal: '今晚青岛轻松跑步',
      agentState: 'searching_candidates',
      currentGoal: '今晚在青岛大学附近找散步搭子',
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
      },
      taskSlotSummary: {
        text: '今天晚上 · 青岛大学附近 · 散步',
        completedRequiredSlots: ['time_window', 'location_text', 'activity'],
      },
      knownTaskSlotConstraints: expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining([
          'time_window',
          'location_text',
          'activity',
        ]),
        userVisibleSummary: expect.stringContaining('地点：青岛大学附近'),
      }),
      preferences: {
        interests: ['散步'],
        socialStyle: '低压力',
        preferredTraits: ['公开资料含舞蹈标签优先'],
      },
      boundaries: {
        publicPlaceOnly: true,
        noAutoMessage: true,
        noContactExchange: true,
      },
      pendingApprovals: [
        {
          id: 88,
          actionType: 'send_invite',
          summary: '给候选人发送今晚青岛大学散步邀请',
        },
      ],
      candidateActions: {
        22: {
          targetUserId: 22,
          status: 'saved',
        },
      },
      hasSearchContext: true,
      hasCandidates: true,
      candidateCount: 2,
      socialRequestId: 301,
      longTermSignals: {
        taskCount: 3,
        profileFacts: { city: '青岛', school: '青岛大学' },
        socialGoals: ['同校跑步搭子'],
      },
      memoryContext: { shortTerm: { candidateCount: 2 } },
    });
  });

  it('uses chat run counts when no stored candidate summary exists', () => {
    const { service } = makeHarness();

    const context = service.buildTaskContext({
      task: makeTask({
        result: { chatRun: { candidateCount: 4, socialRequestId: 302 } },
      }),
      body: { message: '继续找' },
      longTermSnapshot: null,
    });

    expect(context).toMatchObject({
      hasCandidates: false,
      candidateCount: 4,
      socialRequestId: 302,
      longTermSignals: null,
      memoryContext: null,
    });
  });

  it('exposes empty candidate search memory to router and Brain task context', () => {
    const { service } = makeHarness();

    const context = service.buildTaskContext({
      task: makeTask({
        memory: {
          shortTerm: {
            hasSearched: true,
            lastSearchAt: '2026-06-18T10:00:00.000Z',
            lastSearchIntent: 'social_search',
            lastSearchCandidateCount: 0,
            lastSearchEmptyReason: 'no_real_candidates',
            lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
            candidates: [],
          },
        },
      }),
      body: { message: '那怎么办' },
      longTermSnapshot: null,
    });

    expect(context).toMatchObject({
      taskMemory: {
        lastSearch: {
          intent: 'social_search',
          candidateCount: 0,
          emptyReason: 'no_real_candidates',
          nextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
        },
      },
      lastSearch: {
        intent: 'social_search',
        candidateCount: 0,
        emptyReason: 'no_real_candidates',
        nextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
      },
    });
  });

  it('merges hydrated runtime context for router and Brain consumers', () => {
    const { service } = makeHarness();
    const context = service.buildTaskContext({
      task: makeTask({
        memory: {
          taskSlots: {
            activity: { value: '跑步', state: 'answered' },
          },
          taskMemory: {
            pendingActions: [{ id: 'legacy-pending' }],
            candidateState: { savedIds: [1] },
          },
        },
      }),
      body: { message: '继续' },
      longTermSnapshot: null,
      hydratedContext: {
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [
          { role: 'user', text: '周末下午，青岛大学，散步' },
          { role: 'assistant', text: '我已经记住这些信息。' },
        ],
        taskMemory: null,
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '周末下午', state: 'completed' },
        },
        taskSlotSummary: {
          活动: '散步',
          时间: '周末下午',
        },
        knownTaskSlotConstraints: {
          treatAsHardConstraints: true,
          knownSlots: [
            { key: 'activity', label: '活动', value: '散步' },
            { key: 'time_window', label: '时间', value: '周末下午' },
          ],
          doNotAskAgainFor: ['activity', 'time_window'],
          userVisibleSummary: '活动：散步；时间：周末下午',
          candidatePreferencePolicy:
            'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
          instruction:
            'planner/router/Brain/subagent 必须基于 knownSlots 继续推进；除非用户主动修改，否则不得重复询问 doNotAskAgainFor 中的字段。',
        },
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [{ title: '偏好周末下午' }],
        lifeGraphGovernanceSummary: {
          total: 1,
          autoSaveCount: 1,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
        lifeGraphSummary: { preferences: { time: '周末下午' } },
        pendingApprovals: [{ id: 'approval-1', action: 'send_invite' }],
        candidateActions: {
          '22': {
            status: 'saved',
            targetUserId: 22,
            reason: '用户想继续看这个候选人',
          },
          '29': {
            status: 'skipped',
            targetUserId: 29,
          },
        },
      } as never,
    });

    expect(context).toMatchObject({
      threadId: 'agent-task:101',
      hydratedTaskId: 101,
      recentMessages: [
        { role: 'user', text: '周末下午，青岛大学，散步' },
        { role: 'assistant', text: '我已经记住这些信息。' },
      ],
      conversationHistory: [
        { role: 'user', text: '周末下午，青岛大学，散步' },
        { role: 'assistant', text: '我已经记住这些信息。' },
      ],
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
        time_window: { value: '周末下午', state: 'completed' },
      },
      taskSlotSummary: {
        活动: '散步',
        时间: '周末下午',
      },
      knownTaskSlotConstraints: expect.objectContaining({
        doNotAskAgainFor: ['activity', 'time_window'],
        userVisibleSummary: '活动：散步；时间：周末下午',
      }),
      lifeGraphSummary: { preferences: { time: '周末下午' } },
      pendingApprovals: [{ id: 'approval-1', action: 'send_invite' }],
      candidateActions: {
        '22': {
          status: 'saved',
          targetUserId: 22,
          reason: '用户想继续看这个候选人',
        },
        '29': {
          status: 'skipped',
          targetUserId: 29,
        },
      },
      candidateState: {
        recommendedIds: [],
        savedIds: [1],
        messagedIds: [],
        rejectedIds: [],
      },
    });
  });

  it('does not let empty hydrated context erase persisted task memory', () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
        socialAgentConversation: {
          turns: [
            {
              role: 'user',
              text: '今天晚上，青岛大学附近，散步，优先舞蹈相关标签',
            },
            {
              role: 'assistant',
              text: '已记住时间、地点、活动和候选偏好。',
            },
          ],
        },
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
          candidate_preference: {
            value: '公开资料含舞蹈相关标签优先',
            state: 'answered',
          },
        },
        taskSlotSummary: {
          text: '今天晚上 · 青岛大学附近 · 散步 · 舞蹈相关标签优先',
          completedRequiredSlots: ['time_window', 'location_text', 'activity'],
        },
        taskMemory: {
          pendingActions: [
            {
              id: 'publish-approval',
              actionType: 'publish_social_request',
              summary: '发布今晚青岛大学附近散步约练卡',
            },
          ],
          candidateState: {
            recommendedIds: [22, 23],
            savedIds: [22],
            messagedIds: [],
            rejectedIds: [],
          },
        },
      },
    });

    const context = service.buildTaskContext({
      task,
      body: { message: '可以，帮我找人' },
      longTermSnapshot: null,
      hydratedContext: {
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [],
        taskMemory: null,
        taskSlots: {},
        taskSlotSummary: {},
        knownTaskSlotConstraints: null,
        pendingApprovals: [],
        candidateActions: {
          recommendedIds: [],
          savedIds: [],
          messagedIds: [],
          rejectedIds: [],
        },
        lifeGraphSummary: {},
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
      },
    });

    expect(context).toMatchObject({
      taskSlots: {
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        activity: { value: '散步', state: 'completed' },
        candidate_preference: {
          value: '公开资料含舞蹈相关标签优先',
          state: 'answered',
        },
      },
      taskSlotSummary: {
        text: '今天晚上 · 青岛大学附近 · 散步 · 舞蹈相关标签优先',
      },
      knownTaskSlotConstraints: expect.objectContaining({
        doNotAskAgainFor: expect.arrayContaining([
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ]),
        userVisibleSummary: expect.stringContaining('地点：青岛大学附近'),
      }),
      pendingApprovals: [
        expect.objectContaining({
          actionType: 'publish_social_request',
          summary: '发布今晚青岛大学附近散步约练卡',
        }),
      ],
      candidateActions: {
        recommendedIds: [22, 23],
        savedIds: [22],
        messagedIds: [],
        rejectedIds: [],
      },
      recentMessages: [
        {
          role: 'user',
          text: '今天晚上，青岛大学附近，散步，优先舞蹈相关标签',
        },
        {
          role: 'assistant',
          text: '已记住时间、地点、活动和候选偏好。',
        },
      ],
    });
  });

  it('delegates layered memory context construction', () => {
    const { memoryContext, service } = makeHarness();
    const task = makeTask({
      memory: {
        socialAgentChat: {
          history: [{ role: 'user', text: '我喜欢跑步' }],
        },
      },
    });

    expect(service.buildMemoryContext(task, makeSnapshot())).toEqual({
      memory: 'context',
    });
    expect(memoryContext.build).toHaveBeenCalledWith(
      expect.objectContaining({
        task,
        longTermSnapshot: expect.objectContaining({ taskCount: 3 }),
      }),
    );
  });

  it('passes the configured context window into layered memory construction', () => {
    const { memoryContext, service } = makeHarness({ contextLimit: '80' });
    const task = makeTask({
      memory: {
        socialAgentConversation: {
          turns: Array.from({ length: 88 }, (_, index) => ({
            role: 'user',
            text: `第 ${index + 1} 条上下文`,
          })),
        },
      },
    });

    service.buildMemoryContext(task, makeSnapshot());

    expect(memoryContext.build).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: expect.arrayContaining([
          expect.objectContaining({ text: '第 9 条上下文' }),
          expect.objectContaining({ text: '第 88 条上下文' }),
        ]),
      }),
    );
    const call = memoryContext.build.mock.calls.at(-1)?.[0] as {
      conversationHistory: unknown[];
    };
    expect(call.conversationHistory).toHaveLength(80);
  });

  it('uses hydrated recent messages for layered memory when server restore has newer context', () => {
    const { memoryContext, service } = makeHarness();
    const task = makeTask({
      memory: {
        socialAgentConversation: {
          turns: [
            { role: 'user', text: '旧的本地任务记忆' },
            { role: 'assistant', text: '旧回复' },
          ],
        },
      },
    });

    service.buildMemoryContext(task, makeSnapshot(), {
      userId: 7,
      threadId: 'agent-task:101',
      taskId: 101,
      recentMessages: [
        { role: 'user', text: '今天晚上青岛大学散步，优先舞蹈相关标签' },
        { role: 'assistant', text: '已记住时间、地点和候选偏好。' },
      ],
      taskMemory: null,
      taskSlots: {},
      taskSlotSummary: {},
      knownTaskSlotConstraints: null,
      pendingApprovals: [],
      candidateActions: {
        recommendedIds: [],
        savedIds: [],
        messagedIds: [],
        rejectedIds: [],
      },
      lifeGraphSummary: null,
      lifeGraphFactProposals: [],
      lifeGraphFactDisplaySummaries: [],
      lifeGraphGovernanceSummary: {
        total: 0,
        autoSaveCount: 0,
        confirmationRequiredCount: 0,
        blockedCount: 0,
        sensitiveCount: 0,
        expiringFactKeys: [],
      },
    });

    expect(memoryContext.build).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          { role: 'user', text: '今天晚上青岛大学散步，优先舞蹈相关标签' },
          { role: 'assistant', text: '已记住时间、地点和候选偏好。' },
        ],
      }),
    );
  });

  it('stores retrieved RAG context on task memory', async () => {
    const { metrics, rag, service } = makeHarness();
    const task = makeTask({ memory: { shortTerm: { hasSearched: true } } });

    await service.applyRagContext({
      task,
      route: {
        intent: 'social_search',
        entities: { activityType: 'running' },
      } as never,
      message: '帮我找跑步搭子',
      longTermSnapshot: makeSnapshot(),
    });

    expect(rag.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'social_search',
        ownerUserId: 7,
        activityType: 'running',
      }),
    );
    expect(metrics.recordLatency).toHaveBeenCalledWith(
      'rag_retrieve',
      expect.any(Number),
    );
    expect(task.memory).toMatchObject({
      shortTerm: { hasSearched: true },
      lastRagContext: {
        intent: 'social_search',
        retrievedKinds: ['opening_templates', 'user_memory_summary'],
        openingTemplates: [{ title: '低压力开场白' }],
        userMemorySummary: { preferencesSummary: '喜欢跑步' },
      },
    });
  });

  it('records an error when RAG retrieval fails without mutating memory', async () => {
    const { metrics, service } = makeHarness({ ragThrows: true });
    const task = makeTask({ memory: { shortTerm: { hasSearched: true } } });

    await service.applyRagContext({
      task,
      route: { intent: 'social_search', entities: {} } as never,
      message: '帮我找跑步搭子',
      longTermSnapshot: null,
    });

    expect(metrics.recordError).toHaveBeenCalledWith('rag_retrieve_failed');
    expect(task.memory).toEqual({ shortTerm: { hasSearched: true } });
  });
});
