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

function makeHarness(options: { ragThrows?: boolean } = {}) {
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
  );
  return { memoryContext, metrics, rag, service };
}

describe('SocialAgentRouteContextService', () => {
  it('builds route task context from candidates, run result and long-term signals', () => {
    const { service } = makeHarness();
    const task = makeTask({
      memory: {
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
