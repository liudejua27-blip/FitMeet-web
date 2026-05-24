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
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';

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

function makeHarness() {
  const savedEvents: Array<Record<string, unknown>> = [];
  let latestTask: AgentTask | null = null;
  const taskRepo = {
    create: jest.fn((input) => input),
    findOne: jest.fn(async () => latestTask),
    save: jest.fn(async (input) => {
      if (!input.id) input.id = 101;
      latestTask = input as AgentTask;
      return input;
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
    save: jest.fn(async (input) => {
      savedEvents.push(input);
      return input;
    }),
    find: jest.fn(async () => savedEvents),
  };
  const connectionRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const planner = {
    planExistingTask: jest.fn(async (task: AgentTask) => {
      task.plan = [
        {
          id: 'search',
          action: SocialAgentAction.SearchProfiles,
          status: 'planned',
        },
      ];
      return {
        taskId: task.id,
        permissionMode: task.permissionMode,
        allowedActions: [SocialAgentAction.SearchProfiles],
        plan: task.plan,
        source: 'fallback',
        fallbackReason: 'DEEPSEEK_API_KEY missing',
      };
    }),
    replanTask: jest.fn(
      async (taskId: number, options: Record<string, unknown>) => ({
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
    executeToolAction: jest.fn(
      async (
        _taskId: number,
        toolName: SocialAgentToolName,
        input: Record<string, unknown>,
      ) => {
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'ai_draft'
        ) {
          return {
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
          };
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
  };
  const messages = {
    createAgentInboxEvent: jest.fn().mockResolvedValue({ id: 'inbox-event-1' }),
  };
  const approvals = {
    create: jest
      .fn()
      .mockImplementation(async (input: Record<string, unknown>) => ({
        id: 9001,
        type: input.type,
        actionType: input.actionType ?? input.type,
        summary: input.summary,
        riskLevel: input.riskLevel,
        payload: input.payload,
        expiresAt: new Date(Date.now() + 60_000),
      })),
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
    longTermMemory,
    rag,
  };
}

async function flushAsync(times = 8): Promise<void> {
  for (let iteration = 0; iteration < times; iteration += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('SocialAgentChatService', () => {
  it('routes casual chat without running tools', async () => {
    const { service, executor, socialProfiles, savedEvents } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '你好，你能做什么？',
    });

    expect(result).toMatchObject({
      intent: 'casual_chat',
      action: 'reply',
      shouldQueueRun: false,
      taskId: 101,
    });
    expect(result.assistantMessage).toContain('正常聊天');
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: '用户发送 Social Agent 消息' }),
        expect.objectContaining({ summary: 'Social Agent 已完成意图路由' }),
        expect.objectContaining({ summary: 'Social Agent 回复消息' }),
      ]),
    );
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
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
    eventRepo.save.mockImplementation(async (input) => {
      if (input.eventType === AgentTaskEventType.SocialAgentContextAppended) {
        throw new Error('invalid input value for enum agent_task_event_type_enum');
      }
      return input;
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
      message: '我想找青岛周末一起喝咖啡健身交流的人，只要公开地点，先不要发送消息',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'queue_search',
      shouldQueueRun: true,
      runMode: 'initial',
    });
    expect(result.queuedRun?.taskId).toBe(result.taskId);
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
      action: 'clarify',
      shouldQueueRun: false,
    });
    expect(result.assistantMessage).toContain('还不确定');
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
      taskId: 101,
      targetUserId: 22,
      following: true,
      conversationId: 'conv-22',
    });
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
