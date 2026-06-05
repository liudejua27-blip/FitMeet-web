import {
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentAction } from './agent-permission.service';
import { SocialAgentChatService } from './social-agent-chat.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';

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

function makeHarness(options: Record<string, unknown> = {}) {
  const savedEvents: Array<Record<string, unknown>> = [];
  let latestTask: AgentTask | null = null;
  const taskRepo = {
    create: jest.fn((input) => input),
    findOne: jest.fn(() => Promise.resolve(latestTask)),
    save: jest.fn((input) => {
      if (!input.id) input.id = 101;
      latestTask = input as AgentTask;
      return Promise.resolve(input);
    }),
  };
  const eventRepo = {
    create: jest.fn((input) => ({
      id: savedEvents.length + 1,
      stepId: null,
      toolCallId: null,
      createdAt: new Date(savedEvents.length),
      ...input,
    })),
    save: jest.fn((input) => {
      savedEvents.push(input);
      return Promise.resolve(input);
    }),
    find: jest.fn(() => Promise.resolve(savedEvents)),
  };
  const connectionRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const planner = {
    planExistingTask: jest.fn((task: AgentTask) => {
      task.plan = [
        {
          id: 'search',
          action: SocialAgentAction.SearchProfiles,
          status: 'planned',
        },
      ];
      return Promise.resolve({
        taskId: task.id,
        permissionMode: task.permissionMode,
        allowedActions: [SocialAgentAction.SearchProfiles],
        plan: task.plan,
        source: 'fallback',
        fallbackReason: 'DEEPSEEK_API_KEY missing',
      });
    }),
    replanTask: jest.fn((taskId: number, options: Record<string, unknown>) =>
      Promise.resolve({
        taskId,
        permissionMode: AgentTaskPermissionMode.Confirm,
        allowedActions: [SocialAgentAction.SearchProfiles],
        plan: [
          {
            id: 'replan_search',
            action: SocialAgentAction.SearchProfiles,
            status: 'replanned',
            requiresUserConfirmation: false,
            riskLevel: 'low',
            toolName: SocialAgentToolName.SearchMatches,
            input: {},
            rationale: 'follow-up refresh',
          },
        ],
        source: 'fallback',
        fallbackReason: 'DEEPSEEK_API_KEY missing',
        reason: options.reason ?? 'user_follow_up',
        replanAttempt: 1,
      }),
    ),
  };
  const executor = {
    resolveCandidateTargetUser: jest.fn((input: Record<string, unknown>) => {
      const candidate =
        typeof input.candidate === 'object' && input.candidate !== null
          ? (input.candidate as Record<string, unknown>)
          : {};
      return Promise.resolve(
        Number(
          input.targetUserId ??
            input.candidateUserId ??
            input.userId ??
            candidate.targetUserId ??
            candidate.candidateUserId ??
            candidate.userId,
        ),
      );
    }),
    executeToolAction: jest.fn(
      (
        _taskId: number,
        toolName: SocialAgentToolName,
        input: Record<string, unknown>,
      ) => {
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'ai_draft'
        ) {
          return Promise.resolve({
            id: 'action_create_social_request_draft_1',
            toolName,
            status: 'succeeded',
            output: {
              draft: {
                type: SocialRequestType.RunningPartner,
                rawText: input.rawText,
                title: '今晚青岛轻松跑步',
                description: '公开地点，低压力，一起轻松跑。',
                city: '青岛',
                activityType: 'running',
                interestTags: ['跑步', '低压力'],
                radiusKm: 5,
                safetyRequirement: SocialRequestSafety.LowRiskOnly,
              },
              card: { title: '今晚青岛轻松跑步' },
              profileUsed: { city: '青岛' },
            },
            error: null,
          });
        }
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'publish'
        ) {
          return {
            id: 'action_create_social_request_publish_1',
            toolName,
            status: 'succeeded',
            output: {
              id: 301,
              socialRequestId: 301,
              publicIntentId: 'social_request_301',
              synced: true,
              socialRequest: {
                id: 301,
                status: UserSocialRequestStatus.Matching,
              },
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.CreateSocialRequest) {
          return {
            id: 'action_create_social_request_private_1',
            toolName,
            status: 'succeeded',
            output: {
              id: 301,
              socialRequestId: 301,
              status: UserSocialRequestStatus.Draft,
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.SearchMatches) {
          return {
            id: 'action_search_matches_1',
            toolName,
            status: 'succeeded',
            output: {
              socialRequestId: 301,
              candidates: [
                {
                  userId: 22,
                  candidateRecordId: 501,
                  nickname: '小林',
                  avatar: '',
                  color: '#168a55',
                  score: 87.4,
                  level: 'high',
                  distanceKm: 2.1,
                  commonTags: ['跑步', '低压力'],
                  reasons: ['同城且时间匹配', '都偏好低压力运动'],
                  risk: { level: 'low', warnings: [] },
                  suggestedMessage: '今晚想在公开地点轻松跑一段吗？',
                  status: 'suggested',
                },
              ],
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.SendMessage) {
          return {
            id: 'action_send_message_1',
            stepId: 'action_send_message',
            toolName,
            status: 'succeeded',
            input,
            output: {
              id: 'msg-22',
              messageId: 'msg-22',
              conversationId: 'conv-22',
              status: 'sent',
              candidate: { status: 'messaged' },
            },
            error: null,
            startedAt: new Date(0).toISOString(),
            completedAt: new Date(1).toISOString(),
            durationMs: 1,
          };
        }
        if (toolName === SocialAgentToolName.SendMessageToCandidate) {
          return {
            id: 'action_send_candidate_message_1',
            stepId: 'action_send_candidate_message',
            toolName,
            status: 'succeeded',
            input,
            output: {
              id: 'msg-22',
              messageId: 'msg-22',
              conversationId: 'conv-22',
              status: 'sent',
              candidateUserId: input.candidateUserId,
              candidate: { status: 'messaged' },
            },
            error: null,
            startedAt: new Date(0).toISOString(),
            completedAt: new Date(1).toISOString(),
            durationMs: 1,
          };
        }
        if (toolName === SocialAgentToolName.AddFriend) {
          return {
            id: 'action_add_friend_1',
            toolName,
            status: 'succeeded',
            output: {
              id: 601,
              followId: 601,
              status: 'following',
              conversationId: input.openConversation ? 'conv-22' : null,
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.UpdateProfileFromAgentContext) {
          return {
            id: 'action_update_profile_1',
            toolName,
            status: 'succeeded',
            input,
            output: {
              success: true,
              updatedFields: ['gender', 'ageRange', 'city', 'nearbyArea'],
              memoryFields: ['height', 'weight', 'school', 'targetPreference'],
              missingFields: ['availableTimes', 'privacyBoundary'],
            },
            error: null,
          };
        }
        return {
          id: 'action_save_candidate_1',
          toolName,
          status: 'succeeded',
          output: { id: 501, status: 'approved' },
          error: null,
        };
      },
    ),
  };
  const socialProfiles = {
    get: jest.fn().mockResolvedValue({
      city: '青岛',
      interestTags: ['跑步'],
      availableTimes: ['今晚'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    }),
    saveAnswer: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const messages = {
    createAgentInboxEvent: jest.fn().mockResolvedValue({ id: 'inbox-event-1' }),
  };
  const approvals = {
    create: jest.fn().mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({
        id: 9001,
        type: input.type,
        actionType: input.actionType ?? input.type,
        summary: input.summary,
        riskLevel: input.riskLevel,
        payload: input.payload,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ),
    getPendingForTask: jest.fn().mockResolvedValue([]),
  };
  const publicIntentRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };
  const candidatePool = {
    searchActivity: jest.fn().mockResolvedValue({
      activityResults: [],
      emptyReason: 'no_real_candidates',
      message:
        '当前没有找到符合条件的真实活动或公开约练卡片，可以换个城市、时间或活动类型再试。',
      debugReasons: {},
    }),
  };
  const metrics = {
    recordIntent: jest.fn(),
    recordAction: jest.fn(),
    recordQueuedRun: jest.fn(),
    recordApproval: jest.fn(),
    recordActivitySearch: jest.fn(),
    recordError: jest.fn(),
    recordFallback: jest.fn(),
    recordLatency: jest.fn(),
    observeRouteLatency: jest.fn(),
    snapshot: jest.fn().mockReturnValue({}),
  };
  const intentRouter = new SocialAgentIntentRouterService({
    get: jest.fn().mockReturnValue(undefined),
  } as never);

  const longTermMemory = {
    summarizeTask: jest.fn().mockResolvedValue(null),
    readSnapshot: jest.fn().mockResolvedValue(null),
  };

  const rag = {
    retrieve: jest.fn().mockResolvedValue({
      intent: 'casual_chat',
      retrievedKinds: [],
      safetySop: [],
      openingTemplates: [],
      activitySop: [],
      successfulMatchCases: [],
      userMemorySummary: null,
    }),
  };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  };
  const chatLlm =
    (options.chatLlm as SocialAgentChatLlmService | undefined) ??
    new SocialAgentChatLlmService(
      config as never,
      metrics as never,
      options.finalResponses as never,
      options.modelRouter as never,
    );
  const runState =
    (options.runState as SocialAgentRunStateService | undefined) ??
    new SocialAgentRunStateService(
      taskRepo as never,
      eventRepo as never,
      messages as never,
    );
  const followUpContext =
    (options.followUpContext as
      | SocialAgentFollowUpContextService
      | undefined) ??
    new SocialAgentFollowUpContextService(
      taskRepo as never,
      eventRepo as never,
    );
  const replanProgress =
    (options.replanProgress as SocialAgentReplanProgressService | undefined) ??
    new SocialAgentReplanProgressService(eventRepo as never, runState as never);
  const profileEnrichment =
    (options.profileEnrichment as
      | SocialAgentProfileEnrichmentService
      | undefined) ??
    new SocialAgentProfileEnrichmentService(
      taskRepo as never,
      executor as never,
      chatLlm as never,
      metrics as never,
      options.lifeGraph as never,
    );
  const meetLoop =
    (options.meetLoop as SocialAgentMeetLoopService | undefined) ??
    new SocialAgentMeetLoopService(
      taskRepo as never,
      eventRepo as never,
      approvals as never,
      metrics as never,
      options.sessionAssembler as never,
      options.lifeGraph as never,
      options.activities as never,
    );
  const candidateActions =
    (options.candidateActions as
      | SocialAgentCandidateActionService
      | undefined) ??
    new SocialAgentCandidateActionService(
      taskRepo as never,
      eventRepo as never,
      approvals as never,
      executor as never,
      options.sessionAssembler as never,
      longTermMemory as never,
    );
  const draftPublication =
    (options.draftPublication as
      | SocialAgentDraftPublicationService
      | undefined) ??
    new SocialAgentDraftPublicationService(
      taskRepo as never,
      eventRepo as never,
      executor as never,
      longTermMemory as never,
    );
  const draftSearch =
    (options.draftSearch as SocialAgentDraftSearchService | undefined) ??
    new SocialAgentDraftSearchService(executor as never);

  const service = new SocialAgentChatService(
    taskRepo as never,
    eventRepo as never,
    connectionRepo as never,
    planner as never,
    intentRouter,
    executor as never,
    socialProfiles as never,
    messages as never,
    approvals as never,
    publicIntentRepo as never,
    candidatePool as never,
    metrics as never,
    longTermMemory as never,
    rag as never,
    chatLlm as never,
    runState as never,
    followUpContext as never,
    replanProgress as never,
    profileEnrichment as never,
    meetLoop as never,
    candidateActions as never,
    draftPublication as never,
    draftSearch as never,
    options.brain as never,
    undefined,
    options.finalResponses as never,
    options.lifeGraph as never,
    undefined,
    options.fitMeetRuntime as never,
    options.alphaAgent as never,
    options.tonePolicy as never,
    options.agentQuality as never,
    options.sessionAssembler as never,
    options.activities as never,
  );

  return {
    service,
    savedEvents,
    eventRepo,
    taskRepo,
    connectionRepo,
    planner,
    executor,
    socialProfiles,
    messages,
    approvals,
    publicIntentRepo,
    candidatePool,
    metrics,
    chatLlm,
    longTermMemory,
    rag,
    config,
    profileEnrichment,
    meetLoop,
    candidateActions,
    draftPublication,
    draftSearch,
  };
}

async function flushAsync(times = 8): Promise<void> {
  for (let iteration = 0; iteration < times; iteration += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('SocialAgentChatService', () => {
  it.each(['只看同校', '不要晚上', '换成散步', '只看低压力', '不想要这个类型'])(
    'routes candidate filter refinement "%s" to follow-up replan',
    (message) => {
      const router = new SocialAgentIntentRouterService({
        get: jest.fn().mockReturnValue(undefined),
      } as never);

      const result = router.routeByRules({
        message,
        taskContext: { hasSearchContext: true, hasCandidates: true },
      });

      expect(result).toMatchObject({
        intent: 'candidate_followup',
        shouldSearch: true,
        shouldReplan: true,
        replyStrategy: 'search_candidates',
      });
    },
  );

  it('routes casual chat without running tools', async () => {
    const { service, executor, socialProfiles, savedEvents } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '你好，聊聊今天状态',
    });

    expect(result).toMatchObject({
      intent: 'casual_chat',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      shouldQueueRun: false,
      taskId: 101,
    });
    expect(result.assistantMessage).toContain('FitMeet');
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: AgentTaskEventType.SocialAgentMessageUser,
          summary: '用户发送 Social Agent 消息',
          payload: expect.objectContaining({ message: '你好，聊聊今天状态' }),
        }),
        expect.objectContaining({ summary: 'Social Agent 已完成意图路由' }),
        expect.objectContaining({
          eventType: AgentTaskEventType.SocialAgentMessageAssistant,
          summary: 'Social Agent 回复消息',
        }),
      ]),
    );
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
  });

  it('answers profile explanation as product help without updating profile or searching', async () => {
    const { service, executor, socialProfiles } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '人物画像是什么',
    });

    expect(result).toMatchObject({
      intent: 'product_help',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      shouldSearch: false,
      shouldQueueRun: false,
      savedContext: false,
      profileUpdated: false,
      activityResults: [],
    });
    expect(result.assistantMessage).toContain('人物画像');
    expect(result.assistantMessage).not.toContain('已记住你的偏好');
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('guides profile completion without writing preference memory', async () => {
    const { service, socialProfiles } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '你可以帮我完善人物画像吗',
    });

    expect(result).toMatchObject({
      intent: 'profile_enrichment_request',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
    });
    expect(result.assistantMessage).toContain('城市');
    expect(result.assistantMessage).toContain('可约时间');
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
  });

  it('calls DeepSeek for product help when configured', async () => {
    const { service, config, socialProfiles } = makeHarness();
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '你说得对，普通问题应该由大模型回答。我可以解释 FitMeet 的画像、匹配和社交偏好问题。',
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    config.get.mockImplementation((key: string) => {
      if (key === 'DEEPSEEK_API_KEY') return 'test-key';
      if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
      if (key === 'DEEPSEEK_MODEL') return 'deepseek-chat';
      return undefined;
    });

    try {
      const result = await service.routeMessage(7, {
        message: '为什么你不会回答问题？我不是调用的 deepseek 的 api 吗？',
      });

      expect(result.intent).toBe('product_help');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://deepseek.test/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-key',
          }),
        }),
      );
      expect(result.assistantMessage).toContain('大模型回答');
      expect(result.assistantMessage).not.toContain('等你明确说要找人');
      expect(
        JSON.parse(
          (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
        ).model,
      ).toBe('deepseek-chat');
      expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses DeepSeek as the final answer generator for persona questions', async () => {
    const { service, config, socialProfiles, executor } = makeHarness();
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '人物画像是 FitMeet 用来理解城市、兴趣、可约时间和社交边界的偏好模型。',
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    config.get.mockImplementation((key: string) => {
      if (key === 'DEEPSEEK_API_KEY') return 'test-key';
      if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
      if (key === 'DEEPSEEK_MODEL') return 'deepseek-v4-flash';
      return undefined;
    });

    try {
      const result = await service.routeMessage(7, {
        message: '人物画像是什么？',
      });

      expect(result).toMatchObject({
        intent: 'product_help',
        action: 'answer',
        replyStrategy: 'conversational_answer',
        shouldSearch: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
        shouldQueueRun: false,
        pendingApproval: null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(
          (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
        ).model,
      ).toBe('deepseek-chat');
      expect(result.assistantMessage).toBe(
        '人物画像是 FitMeet 用来理解城市、兴趣、可约时间和社交边界的偏好模型。',
      );
      expect(result.assistantMessage).not.toContain('等你明确说要找人');
      expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
      expect(executor.executeToolAction).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses DeepSeek as the final answer generator for casual chat', async () => {
    const { service, config, executor } = makeHarness();
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '当然可以，我们可以先聊你的运动习惯，再慢慢整理成适合匹配的偏好。',
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    config.get.mockImplementation((key: string) => {
      if (key === 'DEEPSEEK_API_KEY') return 'test-key';
      if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
      return undefined;
    });

    try {
      const result = await service.routeMessage(7, {
        message: '你好，今天可以随便聊聊吗？',
      });

      expect(result).toMatchObject({
        intent: 'casual_chat',
        action: 'answer',
        replyStrategy: 'conversational_answer',
        shouldSearch: false,
        shouldUpdateProfile: false,
        shouldExecuteAction: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(
          (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
        ).model,
      ).toBe('deepseek-chat');
      expect(result.assistantMessage).toContain('运动习惯');
      expect(result.assistantMessage).not.toContain('等你明确说要找人');
      expect(executor.executeToolAction).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses deepseek-v4-flash for structured profile extraction', async () => {
    const { chatLlm, config } = makeHarness();
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  city: '青岛',
                  school: '青岛大学',
                  mbti: 'INFP',
                }),
              },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    config.get.mockImplementation((key: string) => {
      if (key === 'DEEPSEEK_API_KEY') return 'test-key';
      if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
      if (key === 'DEEPSEEK_FAST_MODEL') return 'deepseek-v4-flash';
      return undefined;
    });

    try {
      const extracted = await chatLlm.extractProfileFieldsWithLlm(
        makeTask(),
        '我是白羊男，18，青岛大学，INFP，想找同校女生。',
      );

      expect(extracted).toMatchObject({
        city: '青岛',
        school: '青岛大学',
        mbti: 'INFP',
      });
      expect(
        JSON.parse(
          (fetchMock.mock.calls[0]?.[1] as { body?: string }).body ?? '{}',
        ).model,
      ).toBe('deepseek-v4-flash');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('executes safe read tools planned by Agent Brain before final reply', async () => {
    const finalResponses = {
      // eslint-disable-next-line @typescript-eslint/require-await
      generate: jest.fn(async () => '我看了你的画像，现在还缺可约时间。'),
    };
    const brain = {
      // eslint-disable-next-line @typescript-eslint/require-await
      planTurn: jest.fn(async ({ route }: Record<string, unknown>) => ({
        route: {
          ...(route as Record<string, unknown>),
          intent: 'product_help',
          replyStrategy: 'conversational_answer',
          shouldSearch: false,
          shouldReplan: false,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
        },
        conversationMode: 'answer',
        shouldExecuteTool: true,
        shouldAskClarifyingQuestion: false,
        plannerSource: 'deepseek',
        userIntent: 'product_help',
        reason: 'Need current profile before answering.',
        responseGoal: 'Answer from profile context.',
        needUserConfirmation: false,
        tools: [{ name: 'get_user_profile', arguments: {} }],
        notes: ['llm_planner_used'],
      })),
    };
    const { service, executor } = makeHarness({ brain, finalResponses });

    const result = await service.routeMessage(7, {
      message: '我的画像现在缺什么？',
    });

    expect(result.assistantMessage).toBe('我看了你的画像，现在还缺可约时间。');
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.GetMyProfile,
      expect.objectContaining({ userId: 7 }),
      7,
    );
    expect(finalResponses.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolResults: expect.arrayContaining([
          expect.objectContaining({
            name: 'get_user_profile',
            executorToolName: SocialAgentToolName.GetMyProfile,
          }),
        ]),
      }),
    );
  });

  it('uses a relevant fallback when direct DeepSeek chat fails', async () => {
    const { service, config } = makeHarness();
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as never;
    config.get.mockImplementation((key: string) => {
      if (key === 'DEEPSEEK_API_KEY') return 'test-key';
      if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
      return undefined;
    });

    try {
      const result = await service.routeMessage(7, {
        message: '为什么你不会回答问题？我不是调用的 deepseek 的 api 吗？',
      });

      expect(result.intent).toBe('product_help');
      expect(result.assistantMessage).toContain('普通问题我应该直接回答');
      expect(result.assistantMessage).not.toContain('调用大模型失败');
      expect(result.assistantMessage).not.toContain('等你明确说要找人');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('uses a relevant fallback when direct DeepSeek chat times out', async () => {
    const { service, config } = makeHarness();
    const originalFetch = global.fetch;
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as never;
    config.get.mockImplementation((key: string) => {
      if (key === 'DEEPSEEK_API_KEY') return 'test-key';
      if (key === 'DEEPSEEK_BASE_URL') return 'https://deepseek.test';
      return undefined;
    });

    try {
      const result = await service.routeMessage(7, {
        message: '人物画像是什么？',
      });

      expect(result.intent).toBe('product_help');
      expect(result.assistantMessage).toContain('人物画像是 FitMeet 用来理解');
      expect(result.assistantMessage).not.toContain('等你明确说要找人');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('answers workflow help without returning persona definition or searching', async () => {
    const { service, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '我是先完成人物画像然后再进行约练？还是直接发布需求就可以',
    });

    expect(result).toMatchObject({
      intent: 'workflow_help',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      shouldSearch: false,
      shouldQueueRun: false,
    });
    expect(result.assistantMessage).toContain('两种都可以');
    expect(result.assistantMessage).toContain('直接发布需求');
    expect(result.assistantMessage).not.toContain('不是公开简历');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('extracts rich profile facts without immediately searching', async () => {
    const { service, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、infp。常住在崂山区青岛大学，想找个同校的女生',
    });

    expect(result).toMatchObject({
      intent: 'profile_enrichment',
      action: 'answer',
      shouldSearch: false,
      shouldQueueRun: false,
    });
    expect(result.assistantMessage).toContain('已提取');
    expect(result.assistantMessage).toContain('白羊座');
    expect(result.assistantMessage).toContain('青岛大学');
    expect(result.assistantMessage).toContain('同校的女生');
    expect(result.assistantMessage).toContain('保存到 AI 画像');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('returns a confirmable Life Graph proposal card for profile completion', async () => {
    const lifeGraph = {
      extractFromChat: jest.fn().mockResolvedValue({
        proposalId: 77,
        userId: 7,
        taskId: 101,
        messageId: null,
        status: 'proposed',
        aiSummary: '识别到周末下午、跑步搭子和附近偏好。',
        confirmationRequired: true,
        createdAt: new Date(0).toISOString(),
        confirmedAt: null,
        rejectedAt: null,
        missingFields: [],
        proposedFields: [
          {
            proposalFieldId: 'lifestyle:availableTimes:1',
            category: 'lifestyle',
            fieldKey: 'availableTimes',
            fieldValue: ['周末下午'],
            source: 'ai_inferred',
            confidence: 0.9,
            reason: '用户提到周末下午一般有空',
            requiresUserConfirmation: true,
            status: 'proposed',
            conflict: false,
            oldValue: null,
          },
          {
            proposalFieldId: 'fitness_activity:sportsPreferences:1',
            category: 'fitness_activity',
            fieldKey: 'sportsPreferences',
            fieldValue: ['跑步'],
            source: 'ai_inferred',
            confidence: 0.9,
            reason: '用户提到跑步搭子',
            requiresUserConfirmation: true,
            status: 'proposed',
            conflict: false,
            oldValue: null,
          },
        ],
      }),
    };
    const { service, executor } = makeHarness({ lifeGraph });

    const result = await service.routeMessage(7, {
      message: '请帮我完善人物画像：我周末下午一般有空，喜欢跑步。',
    });

    expect([
      'profile_enrichment',
      'profile_enrichment_request',
      'profile_update',
    ]).toContain(result.intent);
    expect(result.profileUpdated).toBe(false);
    expect(result.profileUpdateProposal).toMatchObject({
      proposalId: 77,
      confirmationRequired: true,
    });
    expect(result.assistantMessage).toContain('我识别到以下画像信息');
    expect(result.assistantMessage).toContain('是否保存到你的 Life Graph');
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.UpdateProfileFromAgentContext,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('uses previous profile facts when the user corrects the agent', async () => {
    const { service, executor } = makeHarness();

    await service.routeMessage(7, {
      message:
        '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、infp。常住在崂山区青岛大学，想找个同校的女生',
    });
    const result = await service.routeMessage(7, {
      message: '不是不是，上面是我的人物画像，你帮我完善。',
      taskId: 101,
    });

    expect(result.intent).toBe('correction_or_clarification');
    expect(result.shouldSearch).toBe(false);
    expect(result.assistantMessage).toContain('刚才那段是你的画像信息');
    expect(result.assistantMessage).toContain('青岛大学');
    expect(result.assistantMessage).not.toContain('人物画像是 FitMeet');
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('calls profile update tool when the user explicitly asks to complete AI profile', async () => {
    const { service, executor, taskRepo } = makeHarness();

    await service.routeMessage(7, {
      message:
        '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、infp。常住在崂山区青岛大学，想找个同校的女生',
    });
    const result = await service.routeMessage(7, {
      message: '对，你调用工具去帮我完善ai画像',
      taskId: 101,
    });

    expect(result.intent).toBe('profile_enrichment_request');
    expect(result.shouldSearch).toBe(false);
    expect(result.profileUpdated).toBe(true);
    expect(result.assistantMessage).toContain('已帮你把刚才的信息写入 AI 画像');
    expect(result.assistantMessage).toContain('已保存到画像字段');
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.UpdateProfileFromAgentContext,
      expect.objectContaining({
        extractedProfile: expect.objectContaining({
          zodiac: '白羊座',
          mbti: 'INFP',
          city: '青岛',
          school: '青岛大学',
        }),
      }),
      7,
    );
    const savedTaskWithToolResult = taskRepo.save.mock.calls
      .map((call) => call[0] as AgentTask)
      .find((task) => {
        const memory = task.memory as Record<string, unknown>;
        const brain = memory?.conversationBrain as Record<string, unknown>;
        return Boolean(brain?.lastToolResult);
      });
    expect(savedTaskWithToolResult?.memory).toEqual(
      expect.objectContaining({
        conversationBrain: expect.objectContaining({
          lastToolResult: expect.objectContaining({
            name: SocialAgentToolName.UpdateProfileFromAgentContext,
            status: 'succeeded',
            output: expect.objectContaining({
              success: true,
            }),
          }),
        }),
      }),
    );
  });

  it('restores the latest social agent task session from persisted task memory and events', async () => {
    const { service, approvals } = makeHarness();

    await service.routeMessage(7, {
      message: '你好，你能做什么？',
    });

    const snapshot = await service.getLatestSession(7);

    expect(snapshot).toMatchObject({
      hasSession: true,
      activeTaskId: 101,
      task: expect.objectContaining({ id: 101 }),
    });
    expect(snapshot.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: '你好，你能做什么？',
        }),
        expect.objectContaining({ role: 'assistant' }),
      ]),
    );
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(approvals.getPendingForTask).toHaveBeenCalledWith(7, 101);
  });

  it('returns current task and timeline from persisted events, result, and memory', async () => {
    const { service, approvals } = makeHarness();

    const routed = await service.routeMessage(7, {
      message: '帮我找青岛附近的跑步搭子',
    });
    expect(routed.queuedRun?.taskId).toBe(101);

    await flushAsync();

    const current = await service.getCurrentTask(7);
    expect(current).toMatchObject({
      taskId: 101,
      taskType: 'social_agent_chat',
      goal: '帮我找青岛附近的跑步搭子',
    });

    const timeline = await service.getTaskTimeline(7, 101);

    expect(timeline).toMatchObject({
      taskId: 101,
      task: expect.objectContaining({ id: 101 }),
      memory: expect.any(Object),
      result: expect.objectContaining({ taskId: 101 }),
      events: expect.any(Array),
    });
    expect(timeline.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          kind: 'text',
          text: '帮我找青岛附近的跑步搭子',
        }),
        expect.objectContaining({
          role: 'assistant',
          kind: 'candidates',
          candidates: expect.arrayContaining([
            expect.objectContaining({ targetUserId: 22 }),
          ]),
        }),
      ]),
    );
    expect(timeline.result?.candidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ targetUserId: 22 })]),
    );
    expect(timeline.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        AgentTaskEventType.SocialAgentMessageUser,
        AgentTaskEventType.SocialAgentMessageAssistant,
        AgentTaskEventType.SocialAgentCandidatesReturned,
      ]),
    );
    expect(approvals.getPendingForTask).toHaveBeenCalledWith(7, 101);
  });

  it('blocks timeline reads for tasks owned by another user', async () => {
    const { service, taskRepo } = makeHarness();
    taskRepo.findOne.mockImplementation(
      (options: { where?: { ownerUserId?: number } }) => {
        if (options.where?.ownerUserId !== 7) return null;
        return Promise.resolve(makeTask());
      },
    );

    await expect(service.getTaskTimeline(8, 101)).rejects.toThrow(
      'Social agent task 101 not found',
    );
  });

  it('safe truncates long social agent timeline event summaries', async () => {
    const { service, savedEvents } = makeHarness();
    await (
      service as unknown as {
        writeEvent: (
          task: AgentTask,
          eventType: AgentTaskEventType,
          summary: string,
          payload: Record<string, unknown>,
        ) => Promise<void>;
      }
    ).writeEvent(
      makeTask(),
      AgentTaskEventType.SocialAgentMessageAssistant,
      'summary_'.repeat(100),
      { message: '完整内容放在 payload 里' },
    );

    expect(String(savedEvents[0].summary).length).toBeLessThanOrEqual(500);
    expect(savedEvents[0].payload).toMatchObject({
      message: '完整内容放在 payload 里',
    });
  });

  it('routes profile updates into profile storage and context memory', async () => {
    const { service, executor, socialProfiles, savedEvents } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '我喜欢拍照和跑步',
    });

    expect(result).toMatchObject({
      intent: 'profile_update',
      action: 'save_context',
      shouldQueueRun: false,
      savedContext: true,
      profileUpdated: true,
      taskId: 101,
    });
    expect(socialProfiles.saveAnswer).toHaveBeenCalledWith(
      7,
      'interestTags',
      '我喜欢拍照和跑步',
    );
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(savedEvents.map((event) => event.eventType)).toContain(
      AgentTaskEventType.SocialAgentContextAppended,
    );
  });

  it('routes safety boundaries into profile storage without searching', async () => {
    const { service, executor, socialProfiles } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '不要夜间见面，也别自动发消息',
    });

    expect(result).toMatchObject({
      intent: 'safety_or_boundary',
      action: 'save_context',
      shouldQueueRun: false,
      profileUpdated: true,
    });
    expect(socialProfiles.saveAnswer).toHaveBeenCalledWith(
      7,
      'avoidTraits',
      '不要夜间见面，也别自动发消息',
    );
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('keeps safety-boundary replies successful when context event enum is missing', async () => {
    const { service, eventRepo } = makeHarness();
    eventRepo.save.mockImplementation((input) => {
      if (input.eventType === AgentTaskEventType.SocialAgentContextAppended) {
        throw new Error(
          'invalid input value for enum agent_task_event_type_enum',
        );
      }
      return Promise.resolve(input);
    });

    const result = await service.routeMessage(7, {
      message: '不要夜间见面，也别自动发送消息',
    });

    expect(result.intent).toBe('safety_or_boundary');
    expect(result.savedContext).toBe(true);
    expect(result.assistantMessage).toContain('已记住这条安全边界');
  });

  it('routes search requests with safety constraints to candidate search', async () => {
    const { service } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '我想找青岛周末一起喝咖啡健身交流的人，只要公开地点，先不要发送消息',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'queue_search',
      shouldQueueRun: true,
      runMode: 'initial',
    });
    expect(result.queuedRun?.taskId).toBe(result.taskId);
  });

  it('routes no-send candidate searches without creating send-message approvals', async () => {
    const { service, approvals, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '帮我找青岛今晚一起跑步的真实用户，推荐几个人，先不要自动发消息',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'queue_search',
      shouldQueueRun: true,
      runMode: 'initial',
      pendingApproval: null,
    });
    expect(result.queuedRun?.taskId).toBe(result.taskId);
    expect(approvals.create).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SendMessage,
      expect.any(Object),
    );
  });

  it('routes social searches to the async search path', async () => {
    const { service } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '帮我找青岛附近的跑步搭子',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'queue_search',
      shouldQueueRun: true,
      runMode: 'initial',
      taskId: 101,
      queuedRun: expect.objectContaining({ status: 'queued', taskId: 101 }),
    });
  });

  it('routes gendered search requests as searches rather than boundaries', async () => {
    const { service } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '帮我找青岛附近女生拍照搭子',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'queue_search',
      shouldQueueRun: true,
    });
  });

  it('routes real-user profile and public-card searches instead of action confirmation', async () => {
    const { service } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '帮我找青岛附近的跑步搭子，优先真实用户、有AI人物画像或发布过约练卡片的人',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'queue_search',
      shouldQueueRun: true,
      runMode: 'initial',
    });
  });

  it('asks for critical Life Graph fields before blind social search', async () => {
    const lifeGraph = {
      getUnifiedMatchSignals: jest.fn().mockResolvedValue({
        identitySignals: { city: '青岛' },
        socialIntentSignals: { currentSocialGoal: '找跑步搭子' },
        lifestyleSignals: {},
        fitnessSignals: {},
        safetySignals: {
          publicPlaceOnly: false,
          locationSharingAllowed: false,
          strictConfirmationRequired: false,
          realNameRequired: false,
          acceptsNightMeet: null,
        },
        confidence: { overall: 0.4, byField: {} },
        missingCriticalFields: [
          { label: '可约时间' },
          { label: '公共场所边界' },
        ],
      }),
    };
    const { service } = makeHarness({ lifeGraph });

    const result = await service.routeMessage(7, {
      message: '帮我找附近跑步搭子',
    });

    expect(result.intent).toBe('social_search');
    expect(result.shouldQueueRun).toBe(false);
    expect(result.assistantMessage).toContain('一般什么时候有空');
    expect(result.assistantMessage).toContain('公共场所');
  });

  it('routes action requests to explicit confirmation instead of execution', async () => {
    const { service, executor, taskRepo } = makeHarness();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        memory: {
          shortTerm: {
            candidates: [
              {
                userId: 22,
                nickname: '小林',
                candidateRecordId: 501,
                score: 87,
              },
            ],
          },
        },
      }),
    );

    const result = await service.routeMessage(7, {
      message: '帮我发消息给第一个人',
      taskId: 101,
    });

    expect(result).toMatchObject({
      intent: 'action_request',
      action: 'await_confirmation',
      shouldQueueRun: false,
      taskId: 101,
    });
    expect(result.assistantMessage).toContain('不会自动执行');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('answers candidate follow-up from existing candidates without full search', async () => {
    const { service, executor, taskRepo } = makeHarness();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        memory: {
          shortTerm: {
            candidates: [
              {
                userId: 22,
                nickname: '小林',
                candidateRecordId: 501,
                score: 87,
                reasons: ['同城且时间匹配', '都喜欢拍照'],
                risk: { warnings: [] },
              },
            ],
          },
        },
      }),
    );

    const result = await service.handleMessage(7, {
      message: '第一个人为什么匹配',
      taskId: 101,
    });

    expect(result).toMatchObject({
      intent: 'candidate_followup',
      action: 'reply',
      shouldQueueRun: false,
      taskId: 101,
    });
    expect(result.assistantMessage).toContain('同城且时间匹配');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('asks a clarification question for unknown intent', async () => {
    const { service, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '这个情况有点复杂',
    });

    expect(result).toMatchObject({
      intent: 'unknown',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      shouldQueueRun: false,
    });
    expect(result.assistantMessage).toContain('城市、兴趣、可约时间');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('creates a private draft request, persists candidates, and returns confirmation actions', async () => {
    const { service, taskRepo, savedEvents, executor } = makeHarness();

    const result = await service.run(7, {
      goal: '帮我找一个今晚在青岛可以轻松跑步的人',
      permissionMode: AgentTaskPermissionMode.Confirm,
    });

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskType: 'social_agent_chat',
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
        requireUserConfirmation: true,
      }),
      7,
    );
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({ socialRequestId: 301, limit: 10 }),
      7,
    );
    expect(result.status).toBe(AgentTaskStatus.AwaitingConfirmation);
    expect(result.socialRequestDraft).toMatchObject({
      agentTaskId: 101,
      socialRequestId: 301,
      mode: 'draft',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
      requireUserConfirmation: true,
    });
    expect(result.candidates[0]).toMatchObject({
      agentTaskId: 101,
      socialRequestId: 301,
      candidateRecordId: 501,
      userId: 22,
      nickname: '小林',
      score: 87,
    });
    expect(result.approvalRequiredActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'save_candidate',
          candidateRecordId: 501,
        }),
        expect.objectContaining({ type: 'send_message', targetUserId: 22 }),
        expect.objectContaining({ type: 'add_friend', targetUserId: 22 }),
        expect.objectContaining({
          type: 'publish_social_request',
          socialRequestId: 301,
        }),
      ]),
    );
    expect(savedEvents.map((event) => event.eventType)).toContain(
      AgentTaskEventType.TaskCreated,
    );
    const finalSavedTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
    const shortTermMemory = finalSavedTask.memory.shortTerm;
    expect(shortTermMemory).toMatchObject({
      taskId: 101,
      currentGoal: '帮我找一个今晚在青岛可以轻松跑步的人',
      permissionMode: AgentTaskPermissionMode.Confirm,
      currentStatus: AgentTaskStatus.AwaitingConfirmation,
      socialRequestId: 301,
    });
    expect(shortTermMemory?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'understand', status: 'done' }),
        expect.objectContaining({ id: 'search', status: 'done' }),
        expect.objectContaining({ id: 'awaiting_confirmation' }),
      ]),
    );
    expect(shortTermMemory?.candidates).toEqual([
      expect.objectContaining({
        userId: 22,
        nickname: '小林',
        candidateRecordId: 501,
        score: 87,
      }),
    ]);
  });

  it('keeps the recommendation to opener to activity flow behind user confirmations', async () => {
    const alphaAgent = {
      prepareTurn: jest.fn().mockResolvedValue(null),
      buildResultCards: jest.fn((input: Record<string, unknown>) => {
        const candidates = Array.isArray(input.candidates)
          ? (input.candidates as Array<Record<string, unknown>>)
          : [];
        const draft =
          input.socialRequestDraft &&
          typeof input.socialRequestDraft === 'object'
            ? (input.socialRequestDraft as Record<string, unknown>)
            : {};
        const candidate = candidates[0] ?? {};
        return [
          {
            id: 'candidate_card:101:22',
            type: 'candidate_card',
            title: '小林',
            status: 'waiting_confirmation',
            data: {
              targetUserId: candidate.targetUserId ?? candidate.userId,
              recommendationLine:
                '我推荐小林，是因为你们的活动区域、时间和运动偏好都比较接近。',
              fitReasons: ['青岛大学附近活动', '偏轻松跑步', '接受公共场所'],
              whyNow: '你这次明确想找今晚附近的轻松跑步搭子。',
              safetyBoundary: '第一次建议选择校园操场或公共公园。',
              suggestedOpener:
                candidate.suggestedMessage ?? '这周末方便一起慢跑一圈吗？',
              nextActions: ['生成开场白', '看看更多', '只看同校', '创建约练'],
            },
            actions: [
              {
                id: 'generate_opener',
                label: '生成开场白',
                action: 'generate_opener',
                requiresConfirmation: false,
                payload: { taskId: input.taskId, candidate },
              },
              {
                id: 'create_activity',
                label: '创建约练',
                action: 'create_activity',
                requiresConfirmation: true,
                payload: { taskId: input.taskId, candidate },
              },
            ],
          },
          {
            id: 'activity_plan:101',
            type: 'activity_plan',
            title: '约练计划待确认',
            status: 'waiting_confirmation',
            data: {
              taskId: input.taskId,
              socialRequestId: draft.socialRequestId ?? null,
              time: '周六 15:00',
              locationName: '青岛大学附近公共场所',
              participants: '你和小林',
              publicPlaceOnly: true,
              noPreciseLocation: true,
              safetyBoundary: '不共享精确位置，第一次只选公共场所。',
              lifeGraphUpdatePreview: '完成后会更新你对周末轻运动社交的偏好。',
              trustScoreUpdatePreview:
                '完成和评价会写入 trust score，用于后续推荐可信度。',
            },
            actions: [
              {
                id: 'confirm_create_activity',
                label: '确认创建',
                action: 'create_activity',
                requiresConfirmation: true,
                payload: { taskId: input.taskId, draft, candidate },
              },
            ],
          },
        ];
      }),
    };
    const lifeGraph = {
      getUnifiedMatchSignals: jest.fn().mockResolvedValue({
        dynamicSignals: {
          lifeUnderstandingSummary: '你更适合周末下午的低压力运动社交。',
          recommendationWeights: {
            sameSchoolOrArea: 0.9,
            lowPressure: 0.85,
            sports: 0.8,
            safetyBoundary: 0.9,
          },
          matchingGuidance: {
            shouldPreferSameSchoolOrArea: true,
            shouldPreferLowPressure: true,
            shouldUsePublicPlace: true,
            suggestedFilters: ['只看同校', '只看低压力'],
          },
        },
      }),
    };
    const { service, executor } = makeHarness({ alphaAgent, lifeGraph });

    const recommendation = await service.run(7, {
      goal: '今晚想找青岛大学附近跑步搭子',
      permissionMode: AgentTaskPermissionMode.Confirm,
    });

    expect(recommendation.candidates[0]).toMatchObject({
      userId: 22,
      nickname: '小林',
    });
    expect(lifeGraph.getUnifiedMatchSignals).toHaveBeenCalledWith(7);
    expect(alphaAgent.buildResultCards).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        candidates: expect.arrayContaining([
          expect.objectContaining({ userId: 22 }),
        ]),
        lifeGraphSignals: expect.objectContaining({
          dynamicSignals: expect.objectContaining({
            matchingGuidance: expect.objectContaining({
              shouldPreferSameSchoolOrArea: true,
            }),
          }),
        }),
      }),
    );
    expect(recommendation.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'candidate_card',
          data: expect.objectContaining({
            recommendationLine: expect.stringContaining('小林'),
            fitReasons: expect.arrayContaining(['青岛大学附近活动']),
            whyNow: expect.stringContaining('今晚'),
            safetyBoundary: expect.stringContaining('公共'),
            suggestedOpener: expect.any(String),
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: 'create_activity',
              requiresConfirmation: true,
            }),
          ]),
        }),
        expect.objectContaining({
          type: 'activity_plan',
          data: expect.objectContaining({
            publicPlaceOnly: true,
            noPreciseLocation: true,
            lifeGraphUpdatePreview: expect.stringContaining('更新'),
            trustScoreUpdatePreview: expect.stringContaining('trust score'),
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: 'create_activity',
              requiresConfirmation: true,
            }),
          ]),
        }),
      ]),
    );

    const callsAfterRecommendation =
      executor.executeToolAction.mock.calls.length;
    const opener = await service.routeMessage(7, {
      message: '帮我给第一个人发消息',
      taskId: recommendation.taskId,
    });

    expect(opener).toMatchObject({
      intent: 'action_request',
      action: 'await_confirmation',
      shouldQueueRun: false,
      pendingApproval: expect.objectContaining({
        actionType: 'send_candidate_message',
      }),
    });
    expect(executor.executeToolAction.mock.calls).toHaveLength(
      callsAfterRecommendation,
    );

    const activityPlan = await service.routeMessage(7, {
      message: '帮我邀请第一个人参加约练',
      taskId: recommendation.taskId,
    });

    expect(activityPlan).toMatchObject({
      intent: 'action_request',
      action: 'await_confirmation',
      shouldQueueRun: false,
      pendingApproval: expect.objectContaining({
        actionType: 'invite_candidate',
      }),
    });
    expect(
      executor.executeToolAction.mock.calls.some(
        (call) =>
          call[1] === SocialAgentToolName.CreateActivity ||
          call[1] === SocialAgentToolName.InviteActivity,
      ),
    ).toBe(false);
  });

  it('does not search when Main Agent asks a low-pressure clarification', async () => {
    const alphaAgent = {
      prepareTurn: jest.fn().mockResolvedValue({
        traceId: 'trace-low-pressure',
        safety: {
          blocked: false,
          level: 'low',
          reasons: [],
          boundaryNotes: ['第一次见面建议选择公共场所'],
          requiredConfirmations: ['发送消息'],
        },
        agentTrace: {
          traceId: 'trace-low-pressure',
          sdkEnabled: false,
          model: 'local',
          agentPath: ['FitMeet Main Agent'],
          handoffs: [],
          guardrails: [],
        },
        cards: [],
        structuredIntent: {
          intent: 'general_social_need',
          readiness: 'clarify',
          requiresSearch: false,
          clarifyingQuestion:
            '可以。我先帮你找轻松一点、不需要太强社交压力的散步搭子。你更想今晚附近走走，还是周末下午找个时间？',
        },
      }),
    };
    const { service, executor } = makeHarness({ alphaAgent });

    const result = await service.run(7, {
      goal: '最近有点无聊，想找个人走走',
      permissionMode: AgentTaskPermissionMode.Confirm,
    });

    expect(result.assistantMessage).toContain('今晚附近走走');
    expect(result.candidates).toHaveLength(0);
    expect(result.socialRequestDraft).toBeNull();
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(result.structuredIntent).toMatchObject({ requiresSearch: false });
  });

  it('streams visible steps before returning the final result', async () => {
    const { service } = makeHarness();
    const events: Array<Record<string, unknown>> = [];

    const result = await service.runStream(
      7,
      {
        goal: '今晚青岛轻松跑步',
        permissionMode: AgentTaskPermissionMode.Confirm,
      },
      (event) => {
        events.push(event);
      },
    );

    expect(events.map((event) => event.type)).toContain('step');
    expect(events.at(-1)).toMatchObject({ type: 'result' });
    expect(result.taskId).toBe(101);
  });

  it('publishes the staged draft only after explicit user confirmation', async () => {
    const { service, taskRepo, executor } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask());

    const result = await service.publishDraft(7, 101, {
      socialRequestId: 301,
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛轻松跑步',
      title: '今晚青岛轻松跑步',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        socialRequestId: 301,
        mode: 'publish',
        publish: true,
        visibility: SocialRequestVisibility.Public,
        status: UserSocialRequestStatus.Matching,
        requireUserConfirmation: true,
        metadata: expect.objectContaining({
          agentTaskId: 101,
          confirmationSource: 'social_agent_chat',
        }),
      }),
      7,
    );
    expect(result.socialRequest).toMatchObject({ id: 301 });
    expect(result).toMatchObject({
      taskId: 101,
      socialRequestId: 301,
      publicIntentId: 'social_request_301',
      toolCallId: 'action_create_social_request_publish_1',
    });
  });

  it('queues a follow-up replan and refreshes the draft plus candidates in the background', async () => {
    const { service, taskRepo, planner, executor } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask({ goal: '今晚青岛轻松跑步' }));

    const queued = await service.replanAndRefresh(7, 101, {
      userMessage: '改成明天杭州瑜伽搭子，先生成草稿，不要直接发',
      reason: 'user_follow_up',
    });

    expect(queued).toMatchObject({
      taskId: 101,
      status: 'queued',
      phase: 'queued',
    });

    await flushAsync();

    const result = await service.getRunStatus(7, 101, queued.runId);

    expect(planner.replanTask).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        reason: 'user_follow_up',
        userMessage: '改成明天杭州瑜伽搭子，先生成草稿，不要直接发',
      }),
    );
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'ai_draft',
        rawText: expect.stringContaining('用户补充：改成明天杭州瑜伽搭子'),
      }),
      7,
    );
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({ socialRequestId: 301, limit: 10 }),
      7,
    );
    expect(result.status).toBe('completed');
    expect(
      (result.result as { replan?: { replanAttempt?: number } } | undefined)
        ?.replan?.replanAttempt,
    ).toBe(1);
    expect(result.result?.socialRequestDraft).toMatchObject({
      agentTaskId: 101,
      socialRequestId: 301,
      mode: 'draft',
    });
    expect(result.result?.candidates).toHaveLength(1);
  });

  it('saves a persisted candidate through the SaveCandidate tool', async () => {
    const { service, taskRepo, executor } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask());

    await service.saveCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SaveCandidate,
      expect.objectContaining({
        candidateRecordId: 501,
        socialRequestId: 301,
        targetUserId: 22,
      }),
      7,
    );
  });

  it('connects a candidate through AddFriend and opens a real conversation', async () => {
    const { service, taskRepo, executor, connectionRepo } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask({ agentConnectionId: 9 }));
    connectionRepo.findOne.mockResolvedValue({ id: 9, userId: 7 });

    const result = await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      targetUserId: 22,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.AddFriend,
      expect.objectContaining({
        targetUserId: 22,
        candidateRecordId: 501,
        openConversation: true,
      }),
      7,
    );
    expect(result).toMatchObject({
      success: true,
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      status: 'connected',
      following: true,
      friendRequestId: '601',
      conversationId: 'conv-22',
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId: 22,
        candidateUserId: 22,
        following: true,
        conversationId: 'conv-22',
        friendRequestId: '601',
      },
      toolCall: expect.objectContaining({
        toolName: SocialAgentToolName.AddFriend,
        status: 'succeeded',
      }),
    });
  });

  it('resolves nested candidate user ids when connecting from a candidate card', async () => {
    const { service, taskRepo, executor } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask({ agentConnectionId: 9 }));

    await service.connectCandidate(7, 101, {
      socialRequestId: 301,
      candidateRecordId: 501,
      candidate: { candidateUserId: 23 },
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.AddFriend,
      expect.objectContaining({
        targetUserId: 23,
        candidateRecordId: 501,
        socialRequestId: 301,
        openConversation: true,
      }),
      7,
    );
  });

  it('surfaces send-message tool failures to callers', async () => {
    const { service, taskRepo, executor } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask({ agentConnectionId: 9 }));
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_send_message_1',
      toolName: SocialAgentToolName.SendMessage,
      status: 'failed',
      output: undefined,
      error: { message: 'Mongo conversation write failed' },
    } as never);

    await expect(
      service.sendCandidateMessage(7, 101, {
        targetUserId: 22,
        message: '你好，今晚一起跑步吗？',
      }),
    ).rejects.toThrow('Mongo conversation write failed');
  });

  it('returns normalized send candidate message success details', async () => {
    const { service, taskRepo } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask({ agentConnectionId: 9 }));

    const result = await service.sendCandidateMessage(7, 101, {
      targetUserId: 22,
      candidateUserId: 22,
      message: 'hello, run tonight?',
    });

    expect(result).toMatchObject({
      success: true,
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      messageId: 'msg-22',
      conversationId: 'conv-22',
      status: 'sent',
      candidateStatus: 'messaged',
      messageAction: {
        status: 'sent',
        conversationId: 'conv-22',
        messageId: 'msg-22',
      },
      toolCall: expect.objectContaining({
        id: 'action_send_message_1',
        status: 'succeeded',
      }),
    });

    const snapshot = await service.getTaskSession(7, 101);
    expect(snapshot.candidateActions['22']).toMatchObject({
      send: 'sent',
      conversationId: 'conv-22',
      messageId: 'msg-22',
    });
  });

  describe('real conversation acceptance suite', () => {
    it('passes the fixed A-J multi-turn social agent conversation', async () => {
      const { service, executor, taskRepo } = makeHarness();
      const toolCallsBeforeChat = executor.executeToolAction.mock.calls.length;

      const a = await service.routeMessage(7, {
        message: '你好，你能做什么？',
      });
      expect(a.shouldQueueRun).toBe(false);
      expect(executor.executeToolAction).toHaveBeenCalledTimes(
        toolCallsBeforeChat,
      );
      expect(a.assistantMessage).toContain('完善画像');
      expect(a.assistantMessage).toContain('推荐候选');
      expect(a.assistantMessage).toContain('发起约练');
      expect(a.assistantMessage).toContain('开场白');

      const b = await service.routeMessage(7, {
        message: '人物画像是什么？',
        taskId: a.taskId,
      });
      expect(b).toMatchObject({
        intent: 'product_help',
        shouldSearch: false,
        shouldQueueRun: false,
        profileUpdated: false,
      });
      expect(b.assistantMessage).toContain('人物画像');
      expect(executor.executeToolAction).toHaveBeenCalledTimes(
        toolCallsBeforeChat,
      );

      const c = await service.routeMessage(7, {
        message: '我是先完善人物画像再约练，还是直接发布需求就可以？',
        taskId: a.taskId,
      });
      expect(c).toMatchObject({
        intent: 'workflow_help',
        shouldSearch: false,
        shouldQueueRun: false,
      });
      expect(c.assistantMessage).toContain('两种都可以');
      expect(c.assistantMessage).toContain('直接发布需求');
      expect(c.assistantMessage).toContain('先完善画像');
      expect(c.assistantMessage).toContain('我在__');

      const d = await service.routeMessage(7, {
        message:
          '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、INFP，常住在崂山区青岛大学，想找个同校的女生。',
        taskId: a.taskId,
      });
      expect(d).toMatchObject({
        intent: 'profile_enrichment',
        shouldSearch: false,
        shouldQueueRun: false,
        profileUpdated: false,
      });
      expect(d.assistantMessage).toContain('已提取');
      expect(d.assistantMessage).toContain('白羊座');
      expect(d.assistantMessage).toContain('青岛大学');
      expect(d.assistantMessage).toContain('同校的女生');
      expect(executor.executeToolAction).toHaveBeenCalledTimes(
        toolCallsBeforeChat,
      );

      const e = await service.routeMessage(7, {
        message: '不是不是，上面是我的人物画像，你帮我完善。',
        taskId: a.taskId,
      });
      expect(e.intent).toBe('correction_or_clarification');
      expect(e.shouldSearch).toBe(false);
      expect(e.assistantMessage).toContain('刚才那段是你的画像信息');
      expect(e.assistantMessage).not.toContain('人物画像是 FitMeet');
      expect(executor.executeToolAction).toHaveBeenCalledTimes(
        toolCallsBeforeChat,
      );

      const f = await service.routeMessage(7, {
        message: '对，你调用工具去帮我完善 AI 画像。',
        taskId: a.taskId,
      });
      expect(f).toMatchObject({
        intent: 'profile_enrichment_request',
        shouldSearch: false,
        profileUpdated: true,
      });
      expect(executor.executeToolAction).toHaveBeenCalledWith(
        a.taskId,
        SocialAgentToolName.UpdateProfileFromAgentContext,
        expect.objectContaining({
          extractedProfile: expect.objectContaining({
            zodiac: '白羊座',
            mbti: 'INFP',
            city: '青岛',
            school: '青岛大学',
          }),
        }),
        7,
      );
      expect(f.assistantMessage).toContain('已保存到画像字段');
      expect(f.assistantMessage).toContain('作为补充偏好记录');
      expect(f.assistantMessage).toContain('还缺少');

      const g = await service.routeMessage(7, {
        message: '那我还缺什么？',
        taskId: a.taskId,
      });
      expect(g.shouldSearch).toBe(false);
      expect(g.shouldQueueRun).toBe(false);
      expect(g.assistantMessage).toContain('可约时间');
      expect(g.assistantMessage).toContain('具体活动类型');
      expect(g.assistantMessage).toContain('边界要求');
      expect(g.assistantMessage).toContain('校内/公共场所');

      const h = await service.routeMessage(7, {
        message: '现在帮我找青岛大学同校女生。',
        taskId: a.taskId,
      });
      expect(h).toMatchObject({
        intent: 'social_search',
        action: 'queue_search',
        shouldQueueRun: true,
      });
      await flushAsync();
      expect(executor.executeToolAction).toHaveBeenCalledWith(
        h.taskId,
        SocialAgentToolName.SearchMatches,
        expect.objectContaining({ limit: 10 }),
        7,
      );
      const searchRun = await service.getRunStatus(
        7,
        h.taskId as number,
        h.queuedRun?.runId ?? '',
      );
      expect(searchRun.status).toBe('completed');
      expect(searchRun.result?.candidates?.[0]).toMatchObject({
        userId: 22,
        nickname: '小林',
      });
      expect(searchRun.result?.assistantMessage).toContain('小林');

      const i = await service.routeMessage(7, {
        message: '帮我给第一个人发消息。',
        taskId: h.taskId,
      });
      expect(i).toMatchObject({
        intent: 'action_request',
        action: 'await_confirmation',
        shouldQueueRun: false,
      });
      expect(i.assistantMessage).toContain('开场白');
      expect(i.assistantMessage).toContain('确认后我再发送');
      expect(
        executor.executeToolAction.mock.calls.some(
          (call) => call[1] === SocialAgentToolName.SendMessageToCandidate,
        ),
      ).toBe(false);

      const j = await service.routeMessage(7, {
        message: '确认发送。',
        taskId: h.taskId,
      });
      expect(j).toMatchObject({
        intent: 'action_request',
        action: 'reply',
      });
      expect(executor.executeToolAction).toHaveBeenCalledWith(
        h.taskId,
        SocialAgentToolName.SendMessageToCandidate,
        expect.objectContaining({
          targetUserId: 22,
          message: expect.any(String),
        }),
        7,
      );
      expect(j.assistantMessage).toContain('已确认发送');

      const finalTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
      expect(finalTask.memory).toBeTruthy();
    });
  });

  describe('short-term task memory', () => {
    function readTaskMemory(taskRepo: {
      save: jest.Mock;
    }): Record<string, unknown> {
      const lastCall = taskRepo.save.mock.calls.at(-1);
      const saved = lastCall?.[0] as {
        memory?: { taskMemory?: Record<string, unknown> };
      };
      return saved?.memory?.taskMemory ?? {};
    }

    it('appends every routed user message into lastUserMessages with a cap', async () => {
      const { service, taskRepo } = makeHarness();
      await service.routeMessage(7, { message: '你好，你能做什么？' });
      const memory = readTaskMemory(taskRepo) as {
        lastUserMessages: Array<{ text: string; intent: string }>;
      };
      expect(memory.lastUserMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: '你好，你能做什么？',
            intent: 'casual_chat',
          }),
        ]),
      );
      expect(memory.lastUserMessages.length).toBeLessThanOrEqual(20);
    });

    it('writes preferences when the intent is profile_update', async () => {
      const { service, taskRepo } = makeHarness();
      await service.routeMessage(7, { message: '我喜欢拍照和跑步，比较慢热' });
      const memory = readTaskMemory(taskRepo) as {
        preferences: { interests: string[]; socialStyle: string };
      };
      expect(memory.preferences.interests).toEqual(
        expect.arrayContaining(['拍照', '跑步']),
      );
      expect(memory.preferences.socialStyle).toBe('slow_warm');
    });

    it('writes boundaries when the intent is safety_or_boundary', async () => {
      const { service, taskRepo } = makeHarness();
      await service.routeMessage(7, {
        message: '不要夜间见面，也别自动发消息，请只在公开场所见面',
      });
      const memory = readTaskMemory(taskRepo) as {
        boundaries: Record<string, unknown>;
      };
      expect(memory.boundaries).toMatchObject({
        noNightMeet: true,
        noAutoMessage: true,
        publicPlaceOnly: true,
      });
    });

    it('writes currentGoal and activeEntities for social_search intents', async () => {
      const { service, taskRepo } = makeHarness();
      await service.routeMessage(7, { message: '帮我找青岛附近的跑步搭子' });
      const memory = readTaskMemory(taskRepo) as {
        currentGoal: string;
        activeEntities: { city: string; activityType: string };
      };
      expect(memory.currentGoal).toContain('青岛');
      expect(memory.activeEntities.city).toBe('青岛');
      expect(memory.activeEntities.activityType).toBeTruthy();
    });

    it('records a pending action when an action_request creates an approval', async () => {
      const { service, taskRepo } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  nickname: '小林',
                  candidateRecordId: 501,
                  score: 87,
                },
              ],
            },
          },
        }),
      );

      await service.handleMessage(7, {
        message: '帮我发消息给第一个人',
        taskId: 101,
      });

      const memory = readTaskMemory(taskRepo) as {
        pendingActions: Array<Record<string, unknown>>;
      };
      expect(memory.pendingActions.length).toBeGreaterThan(0);
      expect(memory.pendingActions.at(-1)).toMatchObject({
        id: 9001,
        actionType: 'send_candidate_message',
      });
    });

    it('creates an opener approval from a canonical candidate.generate_opener card action', async () => {
      const { service, taskRepo, approvals } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  nickname: '小林',
                  candidateRecordId: 501,
                  suggestedMessage: '你好，这周末要不要在公共场所慢跑一圈？',
                },
              ],
            },
          },
        }),
      );

      const result = await service.performCardAction(7, 101, {
        action: 'candidate.generate_opener',
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidate: {
            userId: 22,
            nickname: '小林',
            candidateRecordId: 501,
            suggestedOpener: '你好，这周末要不要在公共场所慢跑一圈？',
          },
        },
      });

      expect(approvals.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          agentTaskId: 101,
          type: 'send_message',
          actionType: 'send_candidate_message',
        }),
      );
      expect(result).toMatchObject({
        action: 'await_confirmation',
        pendingApproval: expect.objectContaining({
          id: 9001,
          actionType: 'send_candidate_message',
        }),
        cards: [
          expect.objectContaining({
            type: 'opener_approval',
            data: expect.objectContaining({
              loopStage: 'opener_draft_created',
              targetUserId: 22,
            }),
            actions: [
              expect.objectContaining({
                schemaAction: 'opener.confirm_send',
                loopStage: 'opener_draft_created',
              }),
              expect.objectContaining({
                schemaAction: 'opener.regenerate',
              }),
            ],
          }),
        ],
      });
      const memory = readTaskMemory(taskRepo) as {
        pendingActions: Array<Record<string, unknown>>;
      };
      expect(memory.pendingActions.at(-1)).toMatchObject({
        id: 9001,
        actionType: 'send_candidate_message',
      });
    });

    it('runs the canonical meet loop from activity confirmation to review and Life Graph update', async () => {
      const lifeGraph = {
        recordBehaviorEvent: jest.fn().mockResolvedValue({
          id: 1,
          eventType: LifeGraphBehaviorEventType.ActivityCreated,
        }),
      };
      const { service, taskRepo, approvals } = makeHarness({ lifeGraph });
      await taskRepo.save(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  nickname: '小林',
                  candidateRecordId: 501,
                  socialRequestId: 301,
                },
              ],
            },
          },
        }),
      );

      const activityDraft = await service.performCardAction(7, 101, {
        action: 'activity.confirm_create',
        payload: {
          taskId: 101,
          candidateUserId: 22,
          socialRequestId: 301,
          activityType: 'running',
          locationName: '青岛大学附近公共场所',
          timeText: '周六 15:00',
        },
      });

      expect(approvals.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          agentTaskId: 101,
          type: 'create_activity',
          actionType: 'create_activity',
        }),
      );
      expect(activityDraft).toMatchObject({
        action: 'await_confirmation',
        cards: [
          expect.objectContaining({
            type: 'activity_plan',
            data: expect.objectContaining({
              loopStage: 'activity_draft_created',
              publicPlaceOnly: true,
              noPreciseLocation: true,
            }),
            actions: [
              expect.objectContaining({
                schemaAction: 'activity.confirm_create',
                loopStage: 'activity_draft_created',
                requiresConfirmation: true,
              }),
            ],
          }),
        ],
      });

      const confirmPayload =
        activityDraft.cards?.[0]?.actions[0]?.payload ?? {};
      const checkinStep = await service.performCardAction(7, 101, {
        action: 'activity.confirm_create',
        payload: confirmPayload,
      });

      expect(checkinStep).toMatchObject({
        action: 'reply',
        cards: [
          expect.objectContaining({
            type: 'checkin_card',
            data: expect.objectContaining({
              loopStage: 'activity_confirmed',
              publicPlaceOnly: true,
              noPreciseLocation: true,
            }),
            actions: [
              expect.objectContaining({
                schemaAction: 'activity.check_in',
                loopStage: 'activity_confirmed',
              }),
            ],
          }),
        ],
      });
      expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          eventType: LifeGraphBehaviorEventType.ActivityCreated,
          taskId: 101,
          candidateUserId: 22,
        }),
      );

      const checkinPayload = checkinStep.cards?.[0]?.actions[0]?.payload ?? {};
      const completionStep = await service.performCardAction(7, 101, {
        action: 'activity.check_in',
        payload: checkinPayload,
      });

      expect(completionStep.cards?.[0]).toMatchObject({
        type: 'checkin_card',
        data: expect.objectContaining({
          loopStage: 'activity_checked_in',
        }),
        actions: [
          expect.objectContaining({
            schemaAction: 'activity.complete',
            loopStage: 'activity_checked_in',
          }),
        ],
      });

      const completePayload =
        completionStep.cards?.[0]?.actions[0]?.payload ?? {};
      const reviewStep = await service.performCardAction(7, 101, {
        action: 'activity.complete',
        payload: completePayload,
      });

      expect(reviewStep.cards?.[0]).toMatchObject({
        type: 'review_card',
        data: expect.objectContaining({
          loopStage: 'activity_completed',
          lifeGraphUpdatePreview: expect.any(String),
          trustScoreUpdatePreview: expect.any(String),
        }),
        actions: [
          expect.objectContaining({
            schemaAction: 'review.submit',
            loopStage: 'activity_completed',
          }),
        ],
      });
      expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          eventType: LifeGraphBehaviorEventType.ActivityCompleted,
          taskId: 101,
          candidateUserId: 22,
        }),
      );

      const reviewPayload = reviewStep.cards?.[0]?.actions[0]?.payload ?? {};
      const updateStep = await service.performCardAction(7, 101, {
        action: 'review.submit',
        payload: {
          ...reviewPayload,
          rating: 5,
          comment: '这次约练顺利完成，节奏很舒服。',
        },
      });

      expect(updateStep.cards?.[0]).toMatchObject({
        type: 'audit_update',
        status: 'completed',
        data: expect.objectContaining({
          loopStage: 'trust_score_updated',
          lifeGraphUpdatePreview: expect.any(String),
          trustScoreUpdatePreview: expect.stringContaining('+2'),
          canView: true,
          canCorrect: true,
          canRevoke: true,
        }),
        actions: [
          expect.objectContaining({
            schemaAction: 'life_graph.accept_update',
            loopStage: 'trust_score_updated',
          }),
          expect.objectContaining({
            schemaAction: 'life_graph.reject_update',
            loopStage: 'trust_score_updated',
          }),
        ],
      });
      expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          eventType: LifeGraphBehaviorEventType.ActivityReviewedPositive,
          taskId: 101,
          candidateUserId: 22,
          metadata: expect.objectContaining({ rating: 5 }),
        }),
      );

      const savedTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
      expect(savedTask.result).toMatchObject({
        meetLoop: expect.objectContaining({
          status: 'review_submitted',
          loopStage: 'trust_score_updated',
          lifeGraphUpdated: true,
          trustScoreDelta: 2,
        }),
      });
    });

    it('persists the canonical meet loop through ActivitiesService when a real activity path is available', async () => {
      const activities = {
        create: jest.fn().mockResolvedValue({
          id: 700,
          participantIds: [7, 22],
          status: 'pending_confirm',
        }),
        confirm: jest.fn().mockResolvedValue({
          id: 700,
          participantIds: [7, 22],
          status: 'pending_confirm',
          invitedUserId: 22,
        }),
        checkin: jest.fn().mockResolvedValue({
          activity: {
            id: 700,
            status: 'in_progress',
          },
          proof: { id: 800 },
        }),
        complete: jest.fn().mockResolvedValue({
          id: 700,
          status: 'completed',
        }),
        review: jest.fn().mockResolvedValue({ ok: true }),
      };
      const lifeGraph = {
        recordBehaviorEvent: jest.fn().mockResolvedValue({
          id: 1,
          eventType: LifeGraphBehaviorEventType.ActivityCreated,
        }),
      };
      const { service, taskRepo } = makeHarness({ activities, lifeGraph });
      await taskRepo.save(makeTask());

      const draft = await service.performCardAction(7, 101, {
        action: 'activity.confirm_create',
        payload: {
          taskId: 101,
          candidateUserId: 22,
          socialRequestId: 301,
          candidateRecordId: 501,
          activityType: 'running',
          title: '周末慢跑',
          city: '青岛',
          locationName: '青岛大学附近公共场所',
          startTime: '2026-06-06T15:00:00.000Z',
        },
      });

      const confirm = await service.performCardAction(7, 101, {
        action: 'activity.confirm_create',
        payload: draft.cards?.[0]?.actions[0]?.payload ?? {},
      });

      expect(activities.create).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          type: 'running',
          title: '周末慢跑',
          city: '青岛',
          locationName: '青岛大学附近公共场所',
          socialRequestId: 301,
          matchedCandidateId: 501,
          invitedUserId: 22,
          proofRequired: true,
          proofPolicy: 'mutual_or_proof',
        }),
      );
      expect(activities.confirm).toHaveBeenCalledWith(700, 7);
      expect(confirm.cards?.[0]).toMatchObject({
        type: 'checkin_card',
        data: expect.objectContaining({
          activityId: 700,
          realActivityPersisted: true,
          loopStage: 'activity_confirmed',
        }),
        actions: [
          expect.objectContaining({
            schemaAction: 'activity.check_in',
            payload: expect.objectContaining({ activityId: 700 }),
          }),
        ],
      });

      const checkin = await service.performCardAction(7, 101, {
        action: 'activity.check_in',
        payload: confirm.cards?.[0]?.actions[0]?.payload ?? {},
      });
      expect(activities.checkin).toHaveBeenCalledWith(
        700,
        7,
        expect.objectContaining({ locationApprox: expect.any(String) }),
      );

      const complete = await service.performCardAction(7, 101, {
        action: 'activity.complete',
        payload: checkin.cards?.[0]?.actions[0]?.payload ?? {},
      });
      expect(activities.complete).toHaveBeenCalledWith(700, 7);

      await service.performCardAction(7, 101, {
        action: 'review.submit',
        payload: {
          ...(complete.cards?.[0]?.actions[0]?.payload ?? {}),
          rating: 5,
          comment: '真实活动顺利完成。',
        },
      });
      expect(activities.review).toHaveBeenCalledWith(
        700,
        7,
        5,
        '真实活动顺利完成。',
      );
      expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledTimes(1);
      expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          eventType: LifeGraphBehaviorEventType.ActivityCreated,
          activityId: 700,
          candidateUserId: 22,
        }),
      );
    });

    it('reads existing recommendedIds and moves them to rejectedIds when the user asks for a fresh batch', async () => {
      const { service, taskRepo } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  nickname: '小林',
                  candidateRecordId: 501,
                  score: 87,
                },
              ],
            },
            taskMemory: {
              currentGoal: '青岛跑步搭子',
              activeEntities: { city: '青岛', activityType: 'running' },
              candidateState: {
                recommendedIds: [22, 33],
                savedIds: [],
                messagedIds: [],
                rejectedIds: [],
              },
            },
          },
        }),
      );

      await service.handleMessage(7, { message: '换一批人', taskId: 101 });

      const memory = readTaskMemory(taskRepo) as {
        candidateState: { recommendedIds: number[]; rejectedIds: number[] };
      };
      expect(memory.candidateState.recommendedIds).toEqual([]);
      expect(memory.candidateState.rejectedIds).toEqual(
        expect.arrayContaining([22, 33]),
      );
    });
  });
});
