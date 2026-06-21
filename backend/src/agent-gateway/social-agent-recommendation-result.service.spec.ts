import {
  AgentTask,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentRecommendationResultService } from './social-agent-recommendation-result.service';
import type {
  SocialAgentCandidateSearchResult,
  SocialAgentChatCandidate,
  SocialAgentRequestDraft,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';
import { SocialRequestType } from '../social-requests/social-request.entity';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeDraft(): SocialAgentRequestDraft {
  return {
    agentTaskId: 101,
    rawText: '今晚青岛轻松跑步',
    title: '今晚青岛轻松跑步',
    description: '公开地点，低压力，一起轻松跑。',
    type: SocialRequestType.RunningPartner,
    city: '青岛',
    activityType: 'running',
    socialRequestId: 301,
    mode: 'draft',
    interestTags: ['跑步', '低压力'],
    radiusKm: 5,
    metadata: { source: 'test' },
  } as SocialAgentRequestDraft;
}

function makeCandidate(
  overrides: Partial<SocialAgentChatCandidate> = {},
): SocialAgentChatCandidate {
  return {
    agentTaskId: 101,
    source: 'profile_candidate',
    isRealData: true,
    socialRequestId: 301,
    targetUserId: 22,
    userId: 22,
    candidateUserId: 22,
    publicIntentId: null,
    displayName: '小林',
    candidateRecordId: 501,
    nickname: '小林',
    avatar: '',
    color: '#168a55',
    city: '青岛',
    score: 87,
    level: 'high',
    distanceKm: 2.1,
    commonTags: ['跑步'],
    reasons: ['距离近', '都喜欢夜跑'],
    interestTags: ['跑步'],
    matchScore: 87,
    matchReasons: ['距离近'],
    riskWarnings: [],
    risk: { level: 'low', warnings: [] },
    suggestedOpener: '今晚方便一起慢跑一圈吗？',
    suggestedMessage: '今晚方便一起慢跑一圈吗？',
    ...overrides,
  };
}

function makeSearchResult(
  overrides: Partial<SocialAgentCandidateSearchResult> = {},
): SocialAgentCandidateSearchResult {
  return {
    candidates: [makeCandidate()],
    emptyReason: null,
    message: '找到 1 位候选人',
    debugReasons: { accepted: 1 } as never,
    ...overrides,
  };
}

function makeHarness(task = makeTask()) {
  const savedEvents: Array<Record<string, unknown>> = [
    {
      id: 1,
      taskId: 101,
      ownerUserId: 7,
      eventType: AgentTaskEventType.TaskCreated,
      actor: AgentTaskEventActor.Agent,
      summary: 'created',
      payload: {},
      createdAt: new Date(0),
    },
  ];
  const taskRepo = {
    save: jest.fn().mockResolvedValue(task),
  };
  const eventRepo = {
    create: jest.fn((input: Record<string, unknown>) => ({
      id: savedEvents.length + 1,
      createdAt: new Date(savedEvents.length),
      ...input,
    })),
    save: jest.fn((input: Record<string, unknown>) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
    find: jest.fn().mockImplementation(() => Promise.resolve(savedEvents)),
  };
  const finalResponses = {
    generate: jest.fn().mockResolvedValue('最终推荐回复'),
  };
  const lifeGraph = {
    getUnifiedMatchSignals: jest.fn().mockResolvedValue({
      dynamicSignals: { shouldPreferLowPressure: true },
    }),
  };
  const alphaAgent = {
    buildResultCards: jest.fn().mockReturnValue([
      {
        id: 'candidate_card:101:22',
        type: 'candidate_card',
        data: { targetUserId: 22 },
      },
    ]),
  };
  const tonePolicy = {
    safeAssistantMessage: jest.fn((message: string) => message),
  };
  const agentQuality = {
    evaluate: jest.fn().mockReturnValue({
      passed: true,
      score: 100,
      checks: [],
      suggestions: [],
    }),
  };
  const service = new SocialAgentRecommendationResultService(
    taskRepo as never,
    eventRepo as never,
    finalResponses as never,
    lifeGraph as never,
    alphaAgent as never,
    tonePolicy as never,
    agentQuality as never,
  );
  return {
    agentQuality,
    alphaAgent,
    eventRepo,
    finalResponses,
    lifeGraph,
    savedEvents,
    service,
    task,
    taskRepo,
    tonePolicy,
  };
}

describe('SocialAgentRecommendationResultService', () => {
  it('persists recommendation results and returns user-facing cards', async () => {
    const {
      agentQuality,
      alphaAgent,
      finalResponses,
      lifeGraph,
      savedEvents,
      service,
      task,
      taskRepo,
      tonePolicy,
    } = makeHarness();
    const emitted: Array<Record<string, unknown>> = [];
    const visibleSteps: SocialAgentVisibleStep[] = [
      { id: 'search', label: '正在筛选合适的人', status: 'done' },
    ];
    const draft = makeDraft();
    const candidate = makeCandidate();
    const searchResult = makeSearchResult({ candidates: [candidate] });

    const result = await service.completeRecommendationResult({
      ownerUserId: 7,
      task,
      visibleSteps,
      draft,
      candidates: [candidate],
      searchResult,
      statusReason: 'recommendations_ready_waiting_user_confirmation',
      emit: (event) => {
        emitted.push(event as unknown as Record<string, unknown>);
      },
      alphaTurn: {
        traceId: 'trace-1',
        safety: { blocked: false, reason: null } as never,
        cards: [],
        agentTrace: { plan: 'ok' } as never,
        structuredIntent: { requiresSearch: true } as never,
        assistantMessage: '',
      },
      buildMemoryContext: () => ({ memory: 'context' }),
      toEventDto: (event) => ({
        id: event.id,
        eventType: event.eventType,
        summary: event.summary,
      }),
    });

    expect(task.status).toBe(AgentTaskStatus.AwaitingConfirmation);
    expect(task.result).toMatchObject({
      chatRun: {
        socialRequestId: 301,
        candidateCount: 1,
        topCandidateUserId: 22,
        statusReason: 'recommendations_ready_waiting_user_confirmation',
      },
    });
    expect(task.memory).toMatchObject({
      shortTerm: {
        socialRequestId: 301,
        candidates: [expect.objectContaining({ userId: 22, nickname: '小林' })],
      },
      socialAgentChat: {
        socialRequestId: 301,
        candidates: [expect.objectContaining({ userId: 22 })],
      },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: AgentTaskEventType.SocialAgentCandidatesReturned,
          summary: 'Social Agent 返回候选卡片',
        }),
      ]),
    );
    expect(lifeGraph.getUnifiedMatchSignals).toHaveBeenCalledWith(7);
    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'candidate_search',
        memoryContext: { memory: 'context' },
        toolResults: [
          expect.objectContaining({
            tool: 'search_real_candidates',
            candidateCount: 1,
          }),
        ],
      }),
      expect.objectContaining({
        onDelta: expect.any(Function),
      }),
    );
    expect(tonePolicy.safeAssistantMessage).toHaveBeenCalledWith(
      '最终推荐回复',
      '找到 1 位候选人',
    );
    expect(alphaAgent.buildResultCards).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        candidates: [expect.objectContaining({ userId: 22 })],
        lifeGraphSignals: expect.objectContaining({
          dynamicSignals: expect.objectContaining({
            shouldPreferLowPressure: true,
          }),
        }),
      }),
    );
    expect(agentQuality.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessage: '最终推荐回复',
        candidates: [expect.objectContaining({ userId: 22 })],
      }),
    );
    expect(result).toMatchObject({
      taskId: 101,
      status: AgentTaskStatus.AwaitingConfirmation,
      assistantMessage: '最终推荐回复',
      candidates: [expect.objectContaining({ userId: 22 })],
      approvalRequiredActions: [],
      cards: [expect.objectContaining({ type: 'candidate_card' })],
      traceId: 'trace-1',
    });
    expect(emitted).toEqual([
      expect.objectContaining({
        type: 'result',
        result: expect.objectContaining({ taskId: 101 }),
      }),
    ]);
  });

  it('streams recommendation text with a run-scoped assistant message id', async () => {
    const { finalResponses, service, task } = makeHarness();
    finalResponses.generate.mockImplementationOnce(
      async (_input: unknown, options: { onDelta?: (delta: string) => void }) => {
        options.onDelta?.('最终');
        options.onDelta?.('推荐');
        return '最终推荐回复';
      },
    );
    const emitted: Array<Record<string, unknown>> = [];

    const result = await service.completeRecommendationResult({
      ownerUserId: 7,
      task,
      visibleSteps: [],
      draft: makeDraft(),
      candidates: [makeCandidate()],
      searchResult: makeSearchResult(),
      statusReason: 'recommendations_ready_waiting_user_confirmation',
      runId: 'run-abc',
      emit: (event) => {
        emitted.push(event as unknown as Record<string, unknown>);
      },
      buildMemoryContext: () => ({}),
      toEventDto: (event) => ({ id: event.id }),
    });

    expect(result.runtime).toMatchObject({
      runId: 'run-abc',
      messageId: 'agent-message:101:run-abc',
    });
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'assistant_delta',
          messageId: 'agent-message:101:run-abc',
        }),
        expect.objectContaining({
          type: 'assistant_done',
          messageId: 'agent-message:101:run-abc',
        }),
        expect.objectContaining({
          type: 'result',
          result: expect.objectContaining({
            runtime: expect.objectContaining({
              messageId: 'agent-message:101:run-abc',
            }),
          }),
        }),
      ]),
    );
  });

  it('uses hydrated taskContext for final recommendation LLM replies', async () => {
    const { finalResponses, service, task } = makeHarness();
    const taskContext = {
      conversationHistory: [
        {
          role: 'user',
          text: '今天晚上青岛大学附近散步，优先舞蹈相关公开标签',
        },
        {
          role: 'assistant',
          text: '我已经记住时间、地点、活动和候选偏好。',
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
        doNotAskAgainFor: [
          'time_window',
          'location_text',
          'activity',
          'candidate_preference',
        ],
      },
      pendingApprovals: [{ actionType: 'send_invite' }],
      candidateActions: { savedIds: [22], rejectedIds: [19] },
    };

    await service.completeRecommendationResult({
      ownerUserId: 7,
      task,
      visibleSteps: [],
      draft: makeDraft(),
      candidates: [makeCandidate()],
      searchResult: makeSearchResult(),
      statusReason: 'recommendations_ready_waiting_user_confirmation',
      buildMemoryContext: () => ({ memory: 'hydrated' }),
      taskContext,
      toEventDto: (event) => ({ id: event.id }),
    });

    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: taskContext.conversationHistory,
        memoryContext: { memory: 'hydrated' },
        taskContext,
      }),
      expect.any(Object),
    );
  });

  it('uses the recommendation fallback when final response service is absent', async () => {
    const { service, task } = makeHarness();
    Reflect.set(service, 'finalResponses', undefined);

    const result = await service.completeRecommendationResult({
      ownerUserId: 7,
      task,
      visibleSteps: [],
      draft: makeDraft(),
      candidates: [makeCandidate()],
      searchResult: makeSearchResult({ message: null }),
      statusReason: 'recommendations_ready_waiting_user_confirmation',
      buildMemoryContext: () => ({}),
      toEventDto: (event) => ({ id: event.id }),
    });

    expect(result.assistantMessage).toContain('小林');
  });

  it('uses a product fallback instead of raw tool text for empty candidate results', async () => {
    const { service, task } = makeHarness();
    Reflect.set(service, 'finalResponses', undefined);
    const draft = {
      ...makeDraft(),
      activityType: 'walking',
      interestTags: ['散步', '舞蹈'],
      metadata: {
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
        candidatePreference: '公开资料含舞蹈相关标签优先',
      },
    } as SocialAgentRequestDraft;

    const result = await service.completeRecommendationResult({
      ownerUserId: 7,
      task,
      visibleSteps: [],
      draft,
      candidates: [],
      searchResult: makeSearchResult({
        candidates: [],
        emptyReason: 'no_real_candidates',
        message: 'no_real_candidates: pool=0 debug raw_tool_output',
        debugReasons: { accepted: 0 } as never,
      }),
      statusReason: 'empty_candidates_waiting_user_refinement',
      buildMemoryContext: () => ({}),
      toEventDto: (event) => ({ id: event.id }),
    });

    expect(result.assistantMessage).toContain('真实、公开可发现');
    expect(result.assistantMessage).toContain('今天晚上');
    expect(result.assistantMessage).toContain('青岛大学附近');
    expect(result.assistantMessage).toContain('舞蹈');
    expect(result.assistantMessage).toContain('发布到发现');
    expect(result.assistantMessage).not.toContain('pool=0');
    expect(result.assistantMessage).not.toContain('debug');
    expect(result.assistantMessage).not.toContain('raw_tool_output');
    expect(task.memory).toMatchObject({
      shortTerm: {
        hasSearched: true,
        lastSearchIntent: 'social_search',
        lastSearchCandidateCount: 0,
        lastSearchEmptyReason: 'no_real_candidates',
        lastSearchNextStep: '放宽条件、换时间范围，或确认发布约练卡到发现',
      },
    });
  });

  it('constrains final response generation with the product empty-candidate fallback', async () => {
    const { finalResponses, service, task } = makeHarness();
    const draft = {
      ...makeDraft(),
      activityType: 'walking',
      metadata: {
        timePreference: '周末下午',
        locationPreference: '崂山区',
      },
    } as SocialAgentRequestDraft;

    await service.completeRecommendationResult({
      ownerUserId: 7,
      task,
      visibleSteps: [],
      draft,
      candidates: [],
      searchResult: makeSearchResult({
        candidates: [],
        emptyReason: 'no_real_candidates',
        message: 'no_real_candidates: pool=0 debug raw_tool_output',
        debugReasons: { accepted: 0 } as never,
      }),
      statusReason: 'empty_candidates_waiting_user_refinement',
      buildMemoryContext: () => ({}),
      toEventDto: (event) => ({ id: event.id }),
    });

    const [request] = finalResponses.generate.mock.calls[0];
    expect(request).toEqual(
      expect.objectContaining({
        fallbackReply: expect.stringContaining('真实、公开可发现'),
        responseGoal:
          '自然说明当前没有找到真实候选人，并给出放宽条件、补充信息或发布需求的下一步。',
      }),
    );
    expect(request.fallbackReply).toContain('周末下午');
    expect(request.fallbackReply).toContain('崂山区');
    expect(request.fallbackReply).not.toContain('pool=0');
    expect(request.fallbackReply).not.toContain('debug');
    expect(request.fallbackReply).not.toContain('raw_tool_output');
  });
});
