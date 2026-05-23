import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

const repo = () => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
});

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: '帮我找一个跑步搭子',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Assist,
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

function makeService() {
  const taskRepo = repo();
  const eventRepo = repo();
  const connectionRepo = repo();
  const candidateRepo = repo();
  const paymentIntentRepo = repo();
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const actionLogs = {
    logAgentAction: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const socialProfiles = {
    get: jest.fn(),
    generateQuestions: jest.fn(),
    saveAnswer: jest.fn(),
    saveAiDraft: jest.fn(),
    generateAiDraft: jest.fn(),
  };
  const socialRequests = {
    create: jest.fn(),
    createFromNaturalLanguage: jest.fn(),
  };
  const matchService = {
    runMatch: jest.fn(),
    searchNearby: jest.fn(),
  };
  const matchReasoner = { explain: jest.fn() };
  const ai = {
    explainMatchFor: jest.fn(),
    generateInviteMessage: jest.fn(),
  };
  const messages = {
    startConversation: jest.fn(),
    sendMessage: jest.fn(),
    createAgentInboxEvent: jest.fn(),
    getAgentInboxMessages: jest.fn(),
    getAgentInboxEvents: jest.fn(),
    sendAgentReply: jest.fn(),
  };
  const friends = { ensureFollowing: jest.fn() };
  const activities = { create: jest.fn() };

  const service = new SocialAgentToolExecutorService(
    taskRepo as never,
    eventRepo as never,
    connectionRepo as never,
    candidateRepo as never,
    paymentIntentRepo as never,
    config as never,
    actionLogs as never,
    new AgentPermissionService(),
    socialProfiles as never,
    socialRequests as never,
    matchService as never,
    matchReasoner as never,
    ai as never,
    messages as never,
    friends as never,
    activities as never,
  );

  return {
    service,
    taskRepo,
    eventRepo,
    connectionRepo,
    candidateRepo,
    paymentIntentRepo,
    config,
    actionLogs,
    socialProfiles,
    socialRequests,
    matchService,
    matchReasoner,
    ai,
    messages,
    friends,
    activities,
  };
}

describe('SocialAgentToolExecutorService', () => {
  it('executes a permitted send_message step through MessagesService', async () => {
    const { service, taskRepo, messages, actionLogs } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          action: 'send_message',
          status: 'planned',
          input: { targetUserId: 2, text: '你好，一起跑步吗？' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_1' });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_1',
      text: '你好，一起跑步吗？',
    });

    const result = await service.executeTask(100);

    expect(result).toMatchObject({
      executedSteps: 1,
      succeededSteps: 1,
      failedSteps: 0,
      blockedSteps: 0,
    });
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ agentConnectionId: 7, ownerUserId: 1 }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv_1',
      1,
      '你好，一起跑步吗？',
      expect.objectContaining({
        senderType: 'agent',
        senderAgentId: 7,
        agentConnectionId: 7,
        ownerUserId: 1,
        actorUserId: 1,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'step_1',
          userId: 1,
        }),
      }),
    );
    expect(task.memory).toMatchObject({
      socialLoop: {
        taskId: 100,
        conversationId: 'conv_1',
        targetUserId: 2,
        lastMessageId: 'msg_1',
        lastAgentMessageId: 'msg_1',
      },
      shortTerm: {
        taskId: 100,
        currentGoal: '帮我找一个跑步搭子',
        permissionMode: AgentTaskPermissionMode.Assist,
        conversationId: 'conv_1',
        targetUserId: 2,
        currentStatus: AgentTaskStatus.WaitingReply,
        sentMessages: [
          expect.objectContaining({
            id: 'msg_1',
            conversationId: 'conv_1',
            targetUserId: 2,
            textPreview: '你好，一起跑步吗？',
            toolName: SocialAgentToolName.SendMessage,
          }),
        ],
      },
    });
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'send_message',
        actionStatus: 'executed',
        targetUserId: 2,
        payload: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'step_1',
          userId: 1,
          toolName: SocialAgentToolName.SendMessage,
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 7,
        ownerUserId: 1,
        eventType: 'agent.action.succeeded',
        unread: true,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          status: 'succeeded',
        }),
      }),
    );
    expect(task.plan[0]).toMatchObject({ status: 'succeeded' });
    expect(task.status).toBe(AgentTaskStatus.WaitingReply);
  });

  it('runs the waiting reply loop and sends the decided reply', async () => {
    const { service, taskRepo, messages } = makeService();
    const task = makeTask({
      status: AgentTaskStatus.WaitingReply,
      memory: {
        socialLoop: {
          taskId: 100,
          conversationId: 'conv_1',
          targetUserId: 2,
          lastMessageId: 'msg_1',
          lastAgentMessageId: 'msg_1',
        },
      },
    });
    taskRepo.findOne.mockResolvedValue(task);
    messages.getAgentInboxMessages.mockResolvedValue([
      {
        id: 'msg_1',
        conversationId: 'conv_1',
        text: '今晚一起跑步吗？',
        senderType: 'agent',
        senderId: 1,
      },
      {
        id: 'msg_2',
        conversationId: 'conv_1',
        text: '可以，我想先确认路线和集合点。',
        senderType: 'user',
        senderId: 2,
      },
    ]);
    messages.sendAgentReply.mockResolvedValue({
      id: 'msg_3',
      conversationId: 'conv_1',
      text: '可以，我们先把时间、地点和路线确认清楚。',
      recipientUserId: 2,
    });

    const result = await service.runNext(100, 1);

    expect(result).toMatchObject({
      executedSteps: 4,
      succeededSteps: 4,
      handledReply: true,
      status: AgentTaskStatus.WaitingReply,
    });
    expect(messages.getAgentInboxMessages).toHaveBeenCalledWith('conv_1', 7, {
      limit: 50,
    });
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent.message.received',
        conversationId: 'conv_1',
        messageId: 'msg_2',
        fromUserId: 2,
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'social_agent.reply.summarized' }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent.next_action.decided',
      }),
    );
    expect(messages.sendAgentReply).toHaveBeenCalledWith(
      'conv_1',
      7,
      expect.stringContaining('时间'),
      expect.objectContaining({
        ownerUserId: 1,
        metadata: expect.objectContaining({ agentTaskId: 100 }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent.reply.sent',
        conversationId: 'conv_1',
        messageId: 'msg_3',
        fromUserId: 2,
      }),
    );
    expect(task.memory).toMatchObject({
      socialLoop: {
        conversationId: 'conv_1',
        targetUserId: 2,
        lastReceivedMessageId: 'msg_2',
        lastReadMessageId: 'msg_2',
        lastAgentMessageId: 'msg_3',
      },
      shortTerm: {
        taskId: 100,
        conversationId: 'conv_1',
        targetUserId: 2,
        currentStatus: AgentTaskStatus.WaitingReply,
        receivedReplies: [
          expect.objectContaining({
            id: 'msg_2',
            fromUserId: 2,
            textPreview: '可以，我想先确认路线和集合点。',
          }),
        ],
        sentMessages: [
          expect.objectContaining({
            id: 'msg_3',
            conversationId: 'conv_1',
            targetUserId: 2,
            toolName: SocialAgentToolName.ReplyMessage,
          }),
        ],
        replySummary: expect.any(Object),
        nextActionDecision: expect.any(Object),
      },
    });
  });

  it('blocks a tool when the task permission mode does not allow its action', async () => {
    const { service, taskRepo, matchService, actionLogs } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SearchMatches,
          action: 'search_profiles',
          status: 'planned',
          input: { city: '北京' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({
      executedSteps: 1,
      succeededSteps: 0,
      blockedSteps: 1,
    });
    expect(matchService.searchNearby).not.toHaveBeenCalled();
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'run_match',
        actionStatus: 'failed',
        payload: expect.objectContaining({
          agentTaskId: 100,
          toolName: SocialAgentToolName.SearchMatches,
          error: expect.objectContaining({ code: 'tool_permission_blocked' }),
        }),
      }),
    );
    expect(task.plan[0]).toMatchObject({ status: 'blocked' });
    expect(task.status).toBe(AgentTaskStatus.Failed);
  });

  it('executes add_friend through FriendsService and records the action result', async () => {
    const { service, taskRepo, friends, actionLogs, messages } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.AddFriend,
          action: 'add_friend',
          status: 'planned',
          input: { targetUserId: 2 },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    friends.ensureFollowing.mockResolvedValue({
      followerId: 1,
      followingId: 2,
    });

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(friends.ensureFollowing).toHaveBeenCalledWith(1, 2);
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'add_friend',
        actionStatus: 'executed',
        targetUserId: 2,
        payload: expect.objectContaining({
          agentTaskId: 100,
          userId: 1,
          toolName: SocialAgentToolName.AddFriend,
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 7,
        ownerUserId: 1,
        eventType: 'agent.action.succeeded',
        fromUserId: 2,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          toolName: SocialAgentToolName.AddFriend,
        }),
      }),
    );
  });

  it('fails real social actions explicitly when the task is not bound to an agent connection', async () => {
    const { service, taskRepo, messages, actionLogs } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          action: 'send_message',
          status: 'planned',
          input: { targetUserId: 2, text: '你好' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({ failedSteps: 1, blockedSteps: 0 });
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: null,
        actionType: 'send_message',
        actionStatus: 'failed',
        reason: expect.stringContaining('agentConnectionId'),
      }),
    );
    expect(task.plan[0]).toMatchObject({
      status: 'failed',
      error: expect.objectContaining({
        code: 'tool_execution_failed',
        message: expect.stringContaining('agentConnectionId'),
      }),
    });
  });

  it('executes offline_meeting by creating an activity and sending an invite message', async () => {
    const { service, taskRepo, activities, messages, actionLogs } =
      makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.LimitedAuto,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.OfflineMeeting,
          action: 'offline_meet',
          status: 'planned',
          input: {
            targetUserId: 2,
            title: '周末跑步见面',
            locationName: '朝阳公园西门',
            city: '北京',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    activities.create.mockResolvedValue({
      id: 33,
      title: '周末跑步见面',
      status: 'pending_confirm',
      city: '北京',
      locationName: '朝阳公园西门',
      startTime: null,
    });
    messages.startConversation.mockResolvedValue({
      conversationId: 'conv_meet',
    });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_meet',
      conversationId: 'conv_meet',
    });

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(activities.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: '周末跑步见面',
        invitedUserId: 2,
        city: '北京',
        locationName: '朝阳公园西门',
      }),
    );
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({
        agentConnectionId: 7,
        ownerUserId: 1,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'step_1',
          toolName: SocialAgentToolName.OfflineMeeting,
          activityId: 33,
        }),
      }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv_meet',
      1,
      expect.stringContaining('线下见面安排'),
      expect.objectContaining({
        senderType: 'agent',
        senderAgentId: 7,
        agentConnectionId: 7,
        ownerUserId: 1,
        actorUserId: 1,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          stepId: 'step_1',
          userId: 1,
          toolName: SocialAgentToolName.OfflineMeeting,
          activityId: 33,
        }),
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'offline_meeting',
        actionStatus: 'executed',
        riskLevel: 'high',
        targetUserId: 2,
        relatedActivityId: 33,
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 7,
        ownerUserId: 1,
        conversationId: 'conv_meet',
        messageId: 'msg_meet',
        fromUserId: 2,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          toolName: SocialAgentToolName.OfflineMeeting,
          status: 'succeeded',
        }),
      }),
    );
  });

  it('creates a payment intent for payment steps and records it for review', async () => {
    const { service, taskRepo, paymentIntentRepo, actionLogs, messages } =
      makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.LimitedAuto,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.Payment,
          action: 'payment',
          status: 'planned',
          input: {
            amount: 88.5,
            currency: 'cny',
            payeeUserId: 2,
            description: '场地订金',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    paymentIntentRepo.save.mockImplementation(async (value) => ({
      id: 88,
      ...value,
    }));

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(paymentIntentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentConnectionId: 7,
        agentTaskId: 100,
        stepId: 'step_1',
        targetUserId: 2,
        amount: '88.50',
        currency: 'CNY',
        description: '场地订金',
        status: 'created',
        provider: 'manual_intent',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'payment',
        actionStatus: 'executed',
        riskLevel: 'high',
        targetUserId: 2,
        payload: expect.objectContaining({
          agentTaskId: 100,
          userId: 1,
          toolName: SocialAgentToolName.Payment,
          permissionMode: AgentTaskPermissionMode.LimitedAuto,
          policy: expect.objectContaining({
            highRisk: true,
            dailyLimit: 3,
            executionContract: 'create_payment_intent_only',
          }),
          output: expect.objectContaining({ paymentIntentId: 88 }),
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 7,
        ownerUserId: 1,
        fromUserId: 2,
        metadata: expect.objectContaining({
          agentTaskId: 100,
          toolName: SocialAgentToolName.Payment,
          status: 'succeeded',
          output: expect.objectContaining({
            paymentIntentId: 88,
            status: 'created',
            amount: '88.50',
            currency: 'CNY',
            auditPolicy: 'payment_intent_only_no_silent_charge',
          }),
          policy: expect.objectContaining({
            highRisk: true,
            dailyLimit: 3,
          }),
        }),
      }),
    );
  });

  it('blocks high-risk tools after their daily per-task limit', async () => {
    const { service, taskRepo, paymentIntentRepo, actionLogs } = makeService();
    const existingCalls = [0, 1, 2].map((index) => ({
      id: `old_${index}`,
      stepId: `old_${index}`,
      toolName: SocialAgentToolName.Payment,
      status: 'succeeded',
      input: {},
      output: {},
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 1,
    }));
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.LimitedAuto,
      toolCalls: existingCalls,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.Payment,
          action: 'payment',
          status: 'planned',
          input: {
            amount: 88.5,
            currency: 'cny',
            payeeUserId: 2,
            description: '鍦哄湴璁㈤噾',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({ blockedSteps: 1, succeededSteps: 0 });
    expect(paymentIntentRepo.create).not.toHaveBeenCalled();
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'payment',
        actionStatus: 'failed',
        riskLevel: 'high',
        payload: expect.objectContaining({
          policy: expect.objectContaining({
            highRisk: true,
            dailyLimit: 3,
          }),
          error: expect.objectContaining({
            code: 'tool_permission_blocked',
            message: expect.stringContaining(
              'daily_high_risk_tool_limit_exceeded',
            ),
          }),
        }),
      }),
    );
  });

  it('reuses SocialRequestsService when creating a social request', async () => {
    const { service, taskRepo, connectionRepo, socialRequests } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Confirm,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.CreateSocialRequest,
          action: 'send_invite',
          status: 'planned',
          input: { rawText: '周末找人一起跑步' },
        },
      ],
    });
    const agent = { id: 7, userId: 1 };
    taskRepo.findOne.mockResolvedValue(task);
    connectionRepo.findOne.mockResolvedValue(agent);
    socialRequests.createFromNaturalLanguage.mockResolvedValue({ id: 55 });

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(socialRequests.createFromNaturalLanguage).toHaveBeenCalledWith(
      '周末找人一起跑步',
      1,
      agent,
    );
  });

  it('does not fail a completed social action when its audit log is unavailable', async () => {
    const {
      service,
      taskRepo,
      connectionRepo,
      actionLogs,
      socialRequests,
    } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Confirm,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.CreateSocialRequest,
          action: 'send_invite',
          status: 'planned',
          input: { rawText: 'Find a running partner tonight' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    connectionRepo.findOne.mockResolvedValue({ id: 7, userId: 1 });
    socialRequests.createFromNaturalLanguage.mockResolvedValue({ id: 55 });
    actionLogs.logAgentAction.mockResolvedValue(null);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({ succeededSteps: 1, failedSteps: 0 });
    expect(task.status).toBe(AgentTaskStatus.Succeeded);
  });
});
