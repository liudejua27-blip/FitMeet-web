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
    replanTask: jest.fn(async (taskId: number, options: Record<string, unknown>) => ({
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
    })),
  };
  const executor = {
    executeToolAction: jest.fn(
      async (_taskId: number, toolName: SocialAgentToolName, input: Record<string, unknown>) => {
      if (toolName === SocialAgentToolName.CreateSocialRequest && input.mode === 'ai_draft') {
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
      if (toolName === SocialAgentToolName.CreateSocialRequest && input.mode === 'publish') {
        return {
          id: 'action_create_social_request_publish_1',
          toolName,
          status: 'succeeded',
          output: {
            id: 301,
            socialRequestId: 301,
            publicIntentId: 'social_request_301',
            synced: true,
            socialRequest: { id: 301, status: UserSocialRequestStatus.Matching },
          },
          error: null,
        };
      }
      if (toolName === SocialAgentToolName.CreateSocialRequest) {
        return {
          id: 'action_create_social_request_private_1',
          toolName,
          status: 'succeeded',
          output: { id: 301, socialRequestId: 301, status: UserSocialRequestStatus.Draft },
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
  };

  const service = new SocialAgentChatService(
    taskRepo as never,
    eventRepo as never,
    connectionRepo as never,
    planner as never,
    executor as never,
    socialProfiles as never,
  );

  return {
    service,
    savedEvents,
    taskRepo,
    connectionRepo,
    planner,
    executor,
  };
}

describe('SocialAgentChatService', () => {
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
        expect.objectContaining({ type: 'save_candidate', candidateRecordId: 501 }),
        expect.objectContaining({ type: 'send_message', targetUserId: 22 }),
        expect.objectContaining({ type: 'add_friend', targetUserId: 22 }),
        expect.objectContaining({ type: 'publish_social_request', socialRequestId: 301 }),
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

  it('replans a follow-up and refreshes the draft plus candidates through tools', async () => {
    const { service, taskRepo, planner, executor } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask({ goal: '今晚青岛轻松跑步' }));

    const result = await service.replanAndRefresh(7, 101, {
      userMessage: '改成明天杭州瑜伽搭子，先生成草稿，不要直接发',
      reason: 'user_follow_up',
    });

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
    expect(result.replan.replanAttempt).toBe(1);
    expect(result.socialRequestDraft).toMatchObject({
      agentTaskId: 101,
      socialRequestId: 301,
      mode: 'draft',
    });
    expect(result.candidates).toHaveLength(1);
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
});
