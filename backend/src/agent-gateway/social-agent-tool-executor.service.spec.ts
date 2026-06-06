import { AgentPermissionService } from './agent-permission.service';
import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { ActivityProofPolicy } from '../activities/entities/activity-template.entity';
import { ConfirmationGuardService } from './confirmation-guard.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { SocialAgentTargetResolverService } from './social-agent-target-resolver.service';
import { SocialAgentActionSideEffectService } from './social-agent-action-side-effect.service';
import { SocialAgentConfirmationPolicyService } from './social-agent-confirmation-policy.service';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentToolExecutionPolicyService } from './social-agent-tool-execution-policy.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SocialAgentPaymentIntentToolService } from './social-agent-payment-intent-tool.service';
import { SocialAgentMessageToolService } from './social-agent-message-tool.service';
import { SocialAgentActivityToolService } from './social-agent-activity-tool.service';
import { SocialAgentInboxToolService } from './social-agent-inbox-tool.service';
import { SocialAgentConversationToolService } from './social-agent-conversation-tool.service';
import { SocialAgentDecisionToolService } from './social-agent-decision-tool.service';

type MockRepository<T extends object = Record<string, unknown>> = {
  findOne: jest.Mock<Promise<T | null>, [unknown?]>;
  save: jest.Mock<Promise<T>, [T]>;
  create: jest.Mock<T, [Partial<T>]>;
};

type AgentActionAuditInput = {
  inputSummary?: string;
  outputSummary?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

type ApprovalCreateInput = {
  type?: unknown;
  actionType?: unknown;
  summary?: unknown;
  riskLevel?: unknown;
  payload?: unknown;
};

type ApprovalDispatchCallback = (
  approval: Record<string, unknown>,
) => Promise<unknown>;

const repo = <
  T extends object = Record<string, unknown>,
>(): MockRepository<T> => ({
  findOne: jest.fn<Promise<T | null>, [unknown?]>(),
  save: jest.fn<Promise<T>, [T]>((value) => Promise.resolve(value)),
  create: jest.fn<T, [Partial<T>]>((value) => value as T),
});

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string.`);
  }
  return value;
}

function silenceServiceWarns(service: SocialAgentToolExecutorService) {
  const logger = (service as unknown as { logger: { warn: jest.Mock } }).logger;
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: 'find a running partner',
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
  const taskRepo = repo<AgentTask>();
  const eventRepo = repo<Record<string, unknown>>();
  const connectionRepo = repo();
  const candidatePool = {
    searchSocial: jest.fn(),
    searchActivity: jest.fn(),
    debugCandidatePool: jest.fn(),
  };
  const candidateRepo = repo();
  const publicIntentRepo = repo();
  const userSocialRequestRepo = repo();
  const userRepo = {
    ...repo(),
    findOne: jest.fn<
      Promise<{ id: number } | null>,
      [{ where?: { id?: number } }?]
    >((options) =>
      Promise.resolve(options?.where?.id ? { id: options.where.id } : null),
    ),
  };
  const paymentIntentRepo = repo();
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const actionLogs = {
    logAgentAction: jest
      .fn<Promise<{ id: number }>, [AgentActionAuditInput]>()
      .mockResolvedValue({ id: 1 }),
  };
  const socialProfiles = {
    get: jest.fn(),
    upsert: jest.fn(),
    generateQuestions: jest.fn(),
    saveAnswer: jest.fn(),
    saveAiDraft: jest.fn(),
    generateAiDraft: jest.fn(),
  };
  const socialRequests = {
    create: jest.fn(),
    createFromNaturalLanguage: jest.fn(),
    syncPublicIntentById: jest.fn(),
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
    getAgentInboxConversations: jest.fn(),
    getAgentInboxEvents: jest.fn(),
    getAgentInboxEventsForOwner: jest.fn(),
    getConversations: jest.fn(),
    sendAgentReply: jest.fn(),
  };
  const friends = { ensureFollowing: jest.fn() };
  const activities = { create: jest.fn(), join: jest.fn() };
  const safety = {
    getMutualBlockUserIds: jest.fn().mockResolvedValue(new Set<number>()),
  };
  const approvals = {
    create: jest.fn<Promise<Record<string, unknown>>, [ApprovalCreateInput]>(
      (input) =>
        Promise.resolve({
          id: 501,
          type: input.type,
          actionType: input.actionType,
          summary: input.summary,
          riskLevel: input.riskLevel,
          payload: input.payload,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        }),
    ),
    getPending: jest.fn(),
    approve: jest.fn<
      Promise<Record<string, unknown>>,
      [number, number, ApprovalDispatchCallback]
    >(),
    reject: jest.fn<Promise<Record<string, unknown>>, [number, number]>(),
  };
  const approvalDispatcher = {
    dispatch: jest.fn<
      Promise<Record<string, unknown>>,
      [Record<string, unknown>]
    >(),
  };
  const longTermMemory = {
    readSnapshot: jest.fn(),
    summarizeTask: jest.fn(),
  };
  const targetResolver = new SocialAgentTargetResolverService(
    candidateRepo as never,
    publicIntentRepo as never,
    userSocialRequestRepo as never,
    userRepo as never,
    safety as never,
  );
  const toolJsonModel = new SocialAgentToolJsonModelService(config as never);
  const actionSideEffects = new SocialAgentActionSideEffectService(
    actionLogs as never,
    messages as never,
  );
  const permissions = new AgentPermissionService();
  const toolRegistry = new FitMeetAgentToolRegistryService();
  const sceneRisk = new SceneRiskPolicyService();
  const toolExecutionPolicy = new SocialAgentToolExecutionPolicyService(
    permissions,
    toolRegistry,
    sceneRisk,
  );
  const confirmationPolicy = new SocialAgentConfirmationPolicyService(
    new ConfirmationGuardService(),
    targetResolver,
  );
  const toolCallFactory = new SocialAgentToolCallFactoryService(
    permissions,
    toolRegistry,
  );
  const toolInput = new SocialAgentToolInputParserService();
  const paymentIntentTools = new SocialAgentPaymentIntentToolService(
    paymentIntentRepo as never,
    toolInput,
  );
  const messageTools = new SocialAgentMessageToolService(
    messages as never,
    matchService as never,
    confirmationPolicy,
    toolInput,
  );
  const activityTools = new SocialAgentActivityToolService(
    activities as never,
    messages as never,
    toolInput,
  );
  const inboxTools = new SocialAgentInboxToolService(
    messages as never,
    toolInput,
  );
  const conversationTools = new SocialAgentConversationToolService(
    messages as never,
    toolJsonModel,
    toolInput,
  );
  const decisionTools = new SocialAgentDecisionToolService(
    permissions,
    toolJsonModel,
    toolCallFactory,
    toolInput,
  );

  const service = new SocialAgentToolExecutorService(
    taskRepo as never,
    eventRepo as never,
    connectionRepo as never,
    candidateRepo as never,
    permissions,
    approvals as never,
    approvalDispatcher as never,
    longTermMemory as never,
    socialProfiles as never,
    socialRequests as never,
    candidatePool as never,
    matchService as never,
    matchReasoner as never,
    ai as never,
    messages as never,
    friends as never,
    targetResolver,
    toolJsonModel,
    actionSideEffects,
    toolExecutionPolicy,
    confirmationPolicy,
    toolCallFactory,
    toolInput,
    paymentIntentTools,
    messageTools,
    activityTools,
    inboxTools,
    conversationTools,
    decisionTools,
  );

  return {
    service,
    taskRepo,
    eventRepo,
    connectionRepo,
    candidateRepo,
    publicIntentRepo,
    userSocialRequestRepo,
    userRepo,
    paymentIntentRepo,
    config,
    actionLogs,
    socialProfiles,
    socialRequests,
    candidatePool,
    matchService,
    matchReasoner,
    ai,
    messages,
    friends,
    activities,
    safety,
    approvals,
    approvalDispatcher,
    longTermMemory,
    targetResolver,
    toolJsonModel,
    actionSideEffects,
    toolExecutionPolicy,
    confirmationPolicy,
  };
}

describe('SocialAgentToolExecutorService', () => {
  it('updates social profile from extracted agent context', async () => {
    const { service, taskRepo, socialProfiles } = makeService();
    const task = makeTask({ permissionMode: AgentTaskPermissionMode.Assist });
    taskRepo.findOne.mockResolvedValue(task);
    socialProfiles.upsert.mockResolvedValue({ userId: 1, city: 'Qingdao' });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.UpdateProfileFromAgentContext,
      {
        extractedProfile: {
          gender: 'male',
          ageRange: '18',
          city: 'Qingdao',
          nearbyArea: 'Qingdao University',
          zodiac: 'Aries',
          mbti: 'INFP',
          height: '181cm',
          weight: '70kg',
          school: 'Qingdao University',
          targetPreference: 'same-school women',
          wantToMeet: ['same-school women'],
        },
        sourceMessage:
          'I am an Aries male, 18, 181cm, 70kg, studying in Qingdao University.',
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(socialProfiles.upsert).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        gender: 'male',
        ageRange: '18',
        city: 'Qingdao',
        nearbyArea: 'Qingdao University',
        zodiac: 'Aries',
        mbti: 'INFP',
        wantToMeet: ['same-school women'],
        matchSignals: expect.objectContaining({
          agentProfileMemory: expect.objectContaining({
            height: '181cm',
            weight: '70kg',
            school: 'Qingdao University',
            targetPreference: 'same-school women',
          }),
        }),
      }),
    );
    expect(call.output).toMatchObject({
      success: true,
      updatedFields: expect.arrayContaining(['gender', 'city', 'matchSignals']),
      memoryFields: expect.arrayContaining(['height', 'weight', 'school']),
    });
  });

  it('gates send_message as pending approval instead of direct execution', async () => {
    const { service, taskRepo, messages, actionLogs, approvals } =
      makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          action: 'send_message',
          status: 'planned',
          input: { targetUserId: 2, text: 'Want to run together?' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_1' });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_1',
      text: 'Want to run together?',
    });

    const result = await service.executeTask(100);

    expect(result).toMatchObject({
      executedSteps: 1,
      succeededSteps: 1,
      failedSteps: 0,
      blockedSteps: 0,
    });
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        agentTaskId: 100,
        skillName: SocialAgentToolName.SendMessage,
        actionType: 'send_message',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'send_message',
        actionStatus: 'pending_approval',
        agentTaskId: 100,
        inputSummary: expect.stringContaining(SocialAgentToolName.SendMessage),
        outputSummary: expect.stringContaining('succeeded'),
        riskLevel: 'medium',
        status: 'succeeded',
        targetUserId: 2,
        payload: expect.objectContaining({
          userId: 1,
          agentTaskId: 100,
          stepId: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          inputSummary: expect.stringContaining('targetUserId'),
          outputSummary: expect.stringContaining('succeeded'),
          riskLevel: 'medium',
          requiresApproval: true,
          approvalId: 501,
          executed: false,
          status: 'succeeded',
          error: null,
          createdAt: expect.any(String),
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
    expect(task.status).toBe(AgentTaskStatus.Succeeded);
  });

  it('records required audit fields for every registered tool call', async () => {
    const { service, taskRepo, socialProfiles, actionLogs } = makeService();
    const task = makeTask({
      plan: [
        {
          id: 'profile_step',
          toolName: SocialAgentToolName.GetMyProfile,
          status: 'planned',
          input: { userId: 1 },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    socialProfiles.get.mockResolvedValue({ userId: 1, interests: ['running'] });

    await service.executeTask(100);

    expect(actionLogs.logAgentAction).toHaveBeenCalledTimes(1);
    const auditInput = actionLogs.logAgentAction.mock.calls[0][0];
    expect(auditInput).toEqual(
      expect.objectContaining({
        ownerUserId: 1,
        agentTaskId: 100,
        actionType: 'read_profile',
        actionStatus: 'executed',
        riskLevel: 'low',
        status: 'succeeded',
        inputSummary: expect.stringContaining(SocialAgentToolName.GetMyProfile),
        outputSummary: expect.stringContaining('succeeded'),
        payload: expect.objectContaining({
          userId: 1,
          agentTaskId: 100,
          toolName: SocialAgentToolName.GetMyProfile,
          inputSummary: auditInput.inputSummary,
          outputSummary: auditInput.outputSummary,
          riskLevel: 'low',
          requiresApproval: false,
          approvalId: null,
          status: 'succeeded',
          error: null,
          createdAt: expect.any(String),
        }),
      }),
    );
  });

  it('resolves registered canonical tool names before dispatching', async () => {
    const { service, taskRepo, candidatePool } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Confirm,
      plan: [
        {
          id: 'step_1',
          toolName: 'search_real_candidates',
          action: 'search_profiles',
          status: 'planned',
          input: { city: 'Qingdao', rawText: 'find running partner' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    candidatePool.searchSocial.mockResolvedValue({
      candidates: [],
      emptyReason: 'no_real_candidates',
      message: 'No real candidates found.',
      debugReasons: [],
    });

    const result = await service.executeTask(100);

    expect(result.toolCalls[0]).toMatchObject({
      toolName: SocialAgentToolName.SearchMatches,
      status: 'succeeded',
    });
    expect(candidatePool.searchSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'Qingdao',
        rawText: 'find running partner',
      }),
    );
  });

  it('executes first-stage read and search runtime tools', async () => {
    const {
      service,
      taskRepo,
      socialProfiles,
      candidatePool,
      messages,
      approvals,
      longTermMemory,
      actionLogs,
    } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      memory: {
        taskMemory: { currentGoal: 'find Qingdao running partner' },
        shortTerm: { candidates: [{ candidateUserId: 2 }] },
      },
      plan: [
        { id: 'profile', toolName: 'get_my_profile', status: 'planned' },
        {
          id: 'memory',
          toolName: 'get_current_task_memory',
          status: 'planned',
        },
        {
          id: 'public',
          toolName: 'search_public_intents',
          status: 'planned',
          input: { city: 'Qingdao' },
        },
        {
          id: 'activities',
          toolName: 'search_activities',
          status: 'planned',
          input: { city: 'Qingdao' },
        },
        {
          id: 'conversations',
          toolName: 'get_conversations',
          status: 'planned',
        },
        { id: 'inbox', toolName: 'get_agent_inbox', status: 'planned' },
        {
          id: 'approvals',
          toolName: 'get_pending_approvals',
          status: 'planned',
        },
        {
          id: 'long_term',
          toolName: 'read_long_term_memory',
          status: 'planned',
        },
        {
          id: 'summary',
          toolName: 'summarize_current_task',
          status: 'planned',
        },
        {
          id: 'debug',
          toolName: 'get_candidate_pool_debug',
          status: 'planned',
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    socialProfiles.get.mockResolvedValue({ userId: 1, interests: ['running'] });
    candidatePool.searchSocial.mockResolvedValue({
      candidates: [
        { source: 'profile_candidate', candidateUserId: 2 },
        { source: 'public_intent', candidateUserId: 3, publicIntentId: 'p1' },
      ],
      emptyReason: null,
      debugReasons: [],
    });
    candidatePool.searchActivity.mockResolvedValue({
      activityResults: [{ source: 'activity', activityId: 9 }],
      emptyReason: null,
      debug: { finalCandidates: [{ activityId: 9 }] },
    });
    messages.getConversations.mockResolvedValue([{ conversationId: 'conv_1' }]);
    messages.getAgentInboxConversations.mockResolvedValue([
      { conversationId: 'agent_conv_1' },
    ]);
    messages.getAgentInboxEvents.mockResolvedValue([{ id: 'event_1' }]);
    approvals.getPending.mockResolvedValue([{ id: 11 }]);
    longTermMemory.readSnapshot.mockResolvedValue({ userId: 1, taskCount: 2 });
    candidatePool.debugCandidatePool.mockResolvedValue({
      counts: { users: 3 },
    });

    const result = await service.executeTask(100, { stopOnError: false });

    expect(result.succeededSteps).toBe(10);
    expect(result.failedSteps).toBe(0);
    expect(actionLogs.logAgentAction).toHaveBeenCalledTimes(10);
    expect(result.toolCalls.map((call) => call.toolName)).toEqual([
      SocialAgentToolName.GetMyProfile,
      SocialAgentToolName.GetCurrentTaskMemory,
      SocialAgentToolName.SearchPublicIntents,
      SocialAgentToolName.SearchActivities,
      SocialAgentToolName.GetConversations,
      SocialAgentToolName.GetAgentInbox,
      SocialAgentToolName.GetPendingApprovals,
      SocialAgentToolName.ReadLongTermMemory,
      SocialAgentToolName.SummarizeCurrentTask,
      SocialAgentToolName.GetCandidatePoolDebug,
    ]);
    expect(result.toolCalls[2].output?.candidates).toEqual([
      expect.objectContaining({ source: 'public_intent' }),
    ]);
    expect(result.toolCalls[3].output?.activities).toEqual([
      expect.objectContaining({ activityId: 9 }),
    ]);
  });

  it('executes first-stage write tools through existing services', async () => {
    const {
      service,
      taskRepo,
      socialRequests,
      messages,
      friends,
      activities,
      approvals,
      approvalDispatcher,
      actionLogs,
      eventRepo,
    } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.LimitedAuto,
      plan: [
        {
          id: 'publish',
          toolName: 'publish_social_request',
          status: 'planned',
          input: {
            type: 'custom',
            description: 'find Qingdao running partner',
          },
        },
        {
          id: 'message',
          toolName: 'send_message_to_candidate',
          status: 'planned',
          input: { candidateUserId: 2, text: 'Want to run together?' },
        },
        {
          id: 'connect',
          toolName: 'connect_candidate',
          status: 'planned',
          input: { candidateUserId: 2 },
        },
        {
          id: 'create_activity',
          toolName: 'create_activity',
          status: 'planned',
          input: { title: 'weekend running', city: 'Qingdao' },
        },
        {
          id: 'join_activity',
          toolName: 'join_activity',
          status: 'planned',
          input: { activityId: 9 },
        },
        {
          id: 'approve',
          toolName: 'approve_action',
          status: 'planned',
          input: { approvalId: 12 },
        },
        {
          id: 'reject',
          toolName: 'reject_action',
          status: 'planned',
          input: { approvalId: 13 },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    socialRequests.create.mockResolvedValue({ id: 21, status: 'active' });
    socialRequests.syncPublicIntentById.mockResolvedValue({
      id: 'public_21',
      status: 'active',
    });
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_1' });
    messages.sendMessage.mockResolvedValue({ id: 'msg_1' });
    friends.ensureFollowing.mockResolvedValue({ id: 31, followingId: 2 });
    activities.create.mockResolvedValue({ id: 41, status: 'pending_confirm' });
    activities.join.mockResolvedValue({ id: 9, status: 'confirmed' });
    approvalDispatcher.dispatch.mockResolvedValue({ ok: true });
    approvals.approve.mockImplementation(async (_id, _userId, dispatcher) => ({
      approval: { id: 12 },
      dispatched: true,
      dispatchResult: await dispatcher({ id: 12 }),
    }));
    approvals.reject.mockResolvedValue({ id: 13, status: 'rejected' });

    const result = await service.executeTask(100, { stopOnError: false });

    expect(result.succeededSteps).toBe(7);
    expect(actionLogs.logAgentAction).toHaveBeenCalledTimes(7);
    expect(socialRequests.syncPublicIntentById).toHaveBeenCalledWith(21, 1);
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(activities.create).not.toHaveBeenCalled();
    expect(activities.join).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledTimes(4);
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.SendMessageToCandidate,
        actionType: 'send_message',
      }),
    );
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.ConnectCandidate,
        actionType: 'add_friend',
      }),
    );
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.CreateActivity,
        actionType: 'create_activity',
      }),
    );
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.JoinActivity,
        actionType: 'join_activity',
      }),
    );
    expect(approvals.approve).toHaveBeenCalledWith(12, 1, expect.any(Function));
    expect(approvals.reject).toHaveBeenCalledWith(13, 1);
    const toolEvents = eventRepo.save.mock.calls
      .map(([event]) => event)
      .filter((event) => event.toolCallId != null);
    expect(toolEvents.length).toBeGreaterThan(0);
    for (const event of toolEvents) {
      const toolCallId = requireString(event.toolCallId, 'toolCallId');
      expect(toolCallId.length).toBeLessThanOrEqual(80);
      expect(toolCallId).not.toContain(':');
      expect(toolCallId).not.toContain('action_create_social_request');
    }
    const auditInputs = actionLogs.logAgentAction.mock.calls.map(
      ([input]) => input,
    );
    expect(
      auditInputs.find(
        (input) =>
          input.payload?.toolName === SocialAgentToolName.ApproveAction,
      ),
    ).toEqual(
      expect.objectContaining({
        riskLevel: 'low',
        status: 'succeeded',
        payload: expect.objectContaining({
          approvalId: 12,
          requiresApproval: true,
          status: 'succeeded',
          error: null,
        }),
      }),
    );
    expect(
      auditInputs.find(
        (input) => input.payload?.toolName === SocialAgentToolName.RejectAction,
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        payload: expect.objectContaining({
          approvalId: 13,
          requiresApproval: false,
        }),
      }),
    );
  });

  it('runs the waiting reply loop and sends the decided reply', async () => {
    const { service, taskRepo, messages, approvals } = makeService();
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
        text: 'Want to run tonight?',
        senderType: 'agent',
        senderId: 1,
      },
      {
        id: 'msg_2',
        conversationId: 'conv_1',
        text: 'Sure, let us confirm the route and meeting point first.',
        senderType: 'user',
        senderId: 2,
      },
    ]);
    messages.sendAgentReply.mockResolvedValue({
      id: 'msg_3',
      conversationId: 'conv_1',
      text: 'Sure, let us confirm time, place, and route first.',
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
    expect(messages.sendAgentReply).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.ReplyMessage,
        actionType: 'send_message',
        agentTaskId: 100,
      }),
    );
    expect(task.memory).toMatchObject({
      socialLoop: {
        conversationId: 'conv_1',
        targetUserId: 2,
        lastReceivedMessageId: 'msg_2',
        lastReadMessageId: 'msg_2',
        lastAgentMessageId: 'msg_1',
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
            textPreview:
              'Sure, let us confirm the route and meeting point first.',
          }),
        ],
        replySummary: expect.any(Object),
        nextActionDecision: expect.any(Object),
      },
    });
  });

  it('falls back when DeepSeek reply-loop JSON calls time out', async () => {
    const { service, taskRepo, messages, approvals, config } = makeService();
    const logger = (
      service as unknown as { logger: { warn: (message: string) => void } }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    config.get.mockImplementation((key: string) => {
      const env: Record<string, string> = {
        DEEPSEEK_API_KEY: 'test-key',
        SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '10',
      };
      return env[key];
    });
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(abortError as never);
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
        text: 'Want to run tonight?',
        senderType: 'agent',
        senderId: 1,
      },
      {
        id: 'msg_2',
        conversationId: 'conv_1',
        text: 'Sure, public track works for me.',
        senderType: 'user',
        senderId: 2,
      },
    ]);

    const result = await service.runNext(100, 1);

    expect(result).toMatchObject({
      executedSteps: 4,
      succeededSteps: 4,
      handledReply: true,
      status: AgentTaskStatus.WaitingReply,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.ReplyMessage,
        actionType: 'send_message',
      }),
    );
    expect(task.memory).toMatchObject({
      shortTerm: {
        replySummary: expect.objectContaining({ source: 'fallback' }),
        nextActionDecision: expect.objectContaining({
          source: 'fallback',
          toolName: SocialAgentToolName.ReplyMessage,
        }),
      },
    });

    fetchSpy.mockRestore();
  });

  it('turns offline meeting into pending approval in assist/manual mode', async () => {
    const { service, taskRepo, activities, actionLogs, approvals } =
      makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.OfflineMeeting,
          action: 'offline_meet',
          status: 'planned',
          input: { title: 'offline workout', targetUserId: 2 },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({
      executedSteps: 1,
      succeededSteps: 1,
      blockedSteps: 0,
    });
    expect(activities.create).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.OfflineMeeting,
        actionType: 'offline_meeting',
        riskLevel: 'high',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'offline_meeting',
        actionStatus: 'pending_approval',
        status: 'succeeded',
        payload: expect.objectContaining({
          agentTaskId: 100,
          toolName: SocialAgentToolName.OfflineMeeting,
          status: 'succeeded',
          requiresApproval: true,
          executed: false,
          approvalId: 501,
        }),
      }),
    );
    expect(task.plan[0]).toMatchObject({ status: 'succeeded' });
  });

  it('gates add_friend through pending approval and records the action result', async () => {
    const { service, taskRepo, friends, actionLogs, messages, approvals } =
      makeService();
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
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.AddFriend,
        actionType: 'add_friend',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'add_friend',
        actionStatus: 'pending_approval',
        targetUserId: 2,
        payload: expect.objectContaining({
          agentTaskId: 100,
          userId: 1,
          toolName: SocialAgentToolName.AddFriend,
          requiresApproval: true,
          executed: false,
          approvalId: 501,
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.action.succeeded',
        metadata: expect.objectContaining({
          output: expect.objectContaining({
            pendingApproval: true,
            status: 'pending_approval',
          }),
        }),
      }),
    );
  });

  it('sends user-confirmed candidate messages as the user when no agent connection is bound', async () => {
    const { service, taskRepo, messages, actionLogs } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    messages.startConversation.mockResolvedValue({
      conversationId: 'conv_user',
    });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_user',
      conversationId: 'conv_user',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.SendMessageToCandidate,
      {
        targetUserId: 2,
        text: 'Hi, want to grab coffee?',
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ agentConnectionId: null, ownerUserId: 1 }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv_user',
      1,
      'Hi, want to grab coffee?',
      expect.objectContaining({
        senderType: 'user',
        senderAgentId: null,
        agentConnectionId: null,
        ownerUserId: 1,
        actorUserId: 1,
        source: 'user',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: null,
        actionType: 'send_message',
        actionStatus: 'executed',
        status: 'succeeded',
      }),
    );
  });

  it('safely truncates long task event varchar fields while keeping full payload', async () => {
    const { service, eventRepo } = makeService();
    const task = makeTask();
    const longSummary = 'summary_'.repeat(90);
    const longStepId = 'step_'.repeat(40);
    const longToolCallId =
      'send_message_to_candidate_20260524104548_candidate_123_public_intent_'.repeat(
        2,
      );
    const fullPayload = { message: 'hello_'.repeat(200) };

    await expect(
      (
        service as unknown as {
          createTaskEvent: (
            task: AgentTask,
            type: AgentTaskEventType,
            input: {
              summary: string;
              payload: Record<string, unknown>;
              stepId: string;
              toolCallId: string;
            },
          ) => Promise<void>;
        }
      ).createTaskEvent(task, AgentTaskEventType.ToolReturned, {
        summary: longSummary,
        payload: fullPayload,
        stepId: longStepId,
        toolCallId: longToolCallId,
      }),
    ).resolves.toBeUndefined();

    const saved = eventRepo.save.mock.calls[0][0];
    expect(requireString(saved.summary, 'summary').length).toBeLessThanOrEqual(
      500,
    );
    expect(requireString(saved.stepId, 'stepId').length).toBeLessThanOrEqual(
      80,
    );
    expect(
      requireString(saved.toolCallId, 'toolCallId').length,
    ).toBeLessThanOrEqual(80);
    expect(saved.stepId).toEqual(expect.stringContaining('…'));
    expect(saved.toolCallId).toEqual(expect.stringContaining('…'));
    expect(saved.payload).toBe(fullPayload);
  });

  it('does not fail executeToolAction when task event writes fail', async () => {
    const { service, taskRepo, eventRepo, messages, actionLogs } =
      makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    eventRepo.save.mockRejectedValue(
      new Error('value too long for type character varying(80)'),
    );
    silenceServiceWarns(service);
    messages.startConversation.mockResolvedValue({
      conversationId: 'conv_user',
    });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_user',
      conversationId: 'conv_user',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.SendMessageToCandidate,
      {
        targetUserId: 2,
        text: 'hello',
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      success: true,
      taskId: 100,
      targetUserId: 2,
      candidateUserId: 2,
      messageId: 'msg_user',
      conversationId: 'conv_user',
      status: 'sent',
      messageAction: {
        status: 'sent',
        messageId: 'msg_user',
        conversationId: 'conv_user',
      },
    });
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded' }),
    );
  });

  it('keeps connect_candidate successful when task event writes fail', async () => {
    const { service, taskRepo, eventRepo, friends, messages } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    eventRepo.save.mockRejectedValue(
      new Error('value too long for type character varying(80)'),
    );
    silenceServiceWarns(service);
    friends.ensureFollowing.mockResolvedValue({ id: 31, followingId: 2 });
    messages.startConversation.mockResolvedValue({
      conversationId: 'conv_user',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      {
        targetUserId: 2,
        openConversation: true,
        approvalId: 501,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      id: 31,
      targetUserId: 2,
      conversationId: 'conv_user',
    });
  });

  it('keeps long message content out of task event varchar fields', async () => {
    const { service, taskRepo, eventRepo, messages } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    const longMessage = 'long message '.repeat(100);
    taskRepo.findOne.mockResolvedValue(task);
    messages.startConversation.mockResolvedValue({
      conversationId: 'conv_user',
    });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_user',
      conversationId: 'conv_user',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.SendMessageToCandidate,
      {
        targetUserId: 2,
        text: longMessage,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    const savedEvents = eventRepo.save.mock.calls.map(([event]) => event);
    expect(savedEvents.length).toBeGreaterThan(0);
    for (const event of savedEvents) {
      expect(
        requireString(event.summary, 'summary').length,
      ).toBeLessThanOrEqual(500);
      if (event.stepId != null) {
        expect(
          requireString(event.stepId, 'stepId').length,
        ).toBeLessThanOrEqual(80);
      }
      if (event.toolCallId != null) {
        expect(
          requireString(event.toolCallId, 'toolCallId').length,
        ).toBeLessThanOrEqual(80);
      }
    }
    const calledPayload = savedEvents.find(
      (event) => event.eventType === AgentTaskEventType.ToolCalled,
    )?.payload as Record<string, unknown> | undefined;
    expect(calledPayload?.input).toMatchObject({ text: longMessage });
  });

  it('connects user-confirmed candidates as the user when no agent connection is bound', async () => {
    const { service, taskRepo, friends, messages, actionLogs } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    friends.ensureFollowing.mockResolvedValue({ id: 31, followingId: 2 });
    messages.startConversation.mockResolvedValue({
      conversationId: 'conv_user',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      {
        targetUserId: 2,
        openConversation: true,
        approvalId: 501,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(friends.ensureFollowing).toHaveBeenCalledWith(1, 2);
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ agentConnectionId: null, ownerUserId: 1 }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: null,
        actionType: 'add_friend',
        actionStatus: 'executed',
        status: 'succeeded',
      }),
    );
  });

  it('resolves nested candidate ids for connect_candidate tool calls', async () => {
    const { service, taskRepo, friends, messages } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    friends.ensureFollowing.mockResolvedValue({ followId: 33, followingId: 3 });
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_3' });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      {
        candidate: { candidateUserId: 3 },
        openConversation: true,
        approvalId: 501,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(friends.ensureFollowing).toHaveBeenCalledWith(1, 3);
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      3,
      expect.objectContaining({ agentConnectionId: null, ownerUserId: 1 }),
    );
    expect(call.output).toMatchObject({
      success: true,
      followId: 33,
      targetUserId: 3,
      candidateUserId: 3,
      conversationId: 'conv_3',
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId: 3,
        candidateUserId: 3,
        following: true,
        conversationId: 'conv_3',
        friendRequestId: '33',
      },
    });
  });

  it('returns different targets and conversations for different candidate users', async () => {
    const { service, taskRepo, friends, messages } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );
    friends.ensureFollowing.mockImplementation((_ownerId, targetUserId) =>
      Promise.resolve({
        followId: targetUserId + 100,
        followingId: targetUserId,
      }),
    );
    messages.startConversation.mockImplementation((_ownerId, targetUserId) =>
      Promise.resolve({
        conversationId: `conv_${targetUserId}`,
      }),
    );

    const first = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      { candidateUserId: 2, openConversation: true, approvalId: 501 },
      1,
    );
    const second = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      { candidateUserId: 3, openConversation: true, approvalId: 502 },
      1,
    );

    expect(first.output).toMatchObject({
      success: true,
      targetUserId: 2,
      candidateUserId: 2,
      conversationId: 'conv_2',
      friendAction: {
        success: true,
        targetUserId: 2,
        candidateUserId: 2,
        conversationId: 'conv_2',
      },
    });
    expect(second.output).toMatchObject({
      success: true,
      targetUserId: 3,
      candidateUserId: 3,
      conversationId: 'conv_3',
      friendAction: {
        success: true,
        targetUserId: 3,
        candidateUserId: 3,
        conversationId: 'conv_3',
      },
    });
  });

  it('resolves public intent ids to the intent owner user', async () => {
    const { service, taskRepo, publicIntentRepo, friends, messages } =
      makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );
    publicIntentRepo.findOne.mockResolvedValue({ id: 'intent_5', userId: 5 });
    friends.ensureFollowing.mockResolvedValue({ followId: 55, followingId: 5 });
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_5' });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      { publicIntentId: 'intent_5', openConversation: true, approvalId: 501 },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(friends.ensureFollowing).toHaveBeenCalledWith(1, 5);
    expect(call.output).toMatchObject({
      targetUserId: 5,
      candidateUserId: 5,
      conversationId: 'conv_5',
    });
  });

  it('returns a 400 target error instead of using a fallback candidate', async () => {
    const { service, taskRepo, friends } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      { openConversation: true },
      1,
    );

    expect(call.status).toBe('failed');
    expect(call.error).toMatchObject({
      code: 'MISSING_TARGET_USER',
      statusCode: 400,
    });
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
  });

  it('rejects self targets before creating friendships or conversations', async () => {
    const { service, taskRepo, friends, messages } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      { targetUserId: 1, openConversation: true },
      1,
    );

    expect(call.status).toBe('failed');
    expect(call.error).toMatchObject({
      code: 'TARGET_IS_SELF',
      statusCode: 400,
    });
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(messages.startConversation).not.toHaveBeenCalled();
  });

  it('blocks candidate actions when either user has blocked the other', async () => {
    const { service, taskRepo, safety, friends } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );
    safety.getMutualBlockUserIds.mockResolvedValue(new Set([2]));

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      { targetUserId: 2, openConversation: true },
      1,
    );

    expect(call.status).toBe('blocked');
    expect(call.error).toMatchObject({
      code: 'TARGET_BLOCKED',
      statusCode: 403,
    });
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
  });

  it('rejects add_friend without an approved confirmation', async () => {
    const { service, taskRepo, friends, messages } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.AddFriend,
      { targetUserId: 2, openConversation: true },
      1,
    );

    expect(call.status).toBe('blocked');
    expect(call.error).toMatchObject({
      code: 'APPROVAL_REQUIRED',
      statusCode: 403,
    });
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(messages.startConversation).not.toHaveBeenCalled();
  });

  it('rejects create_activity without an approved confirmation', async () => {
    const { service, taskRepo, activities } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.CreateActivity,
      {
        targetUserId: 2,
        title: 'Saturday easy run',
        locationName: 'Qingdao University track',
        city: 'Qingdao',
      },
      1,
    );

    expect(call.status).toBe('blocked');
    expect(call.error).toMatchObject({
      code: 'APPROVAL_REQUIRED',
      statusCode: 403,
    });
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('creates an approved activity with Meet Loop safety defaults', async () => {
    const { service, taskRepo, activities } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: 7,
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
      }),
    );
    activities.create.mockResolvedValue({
      id: 77,
      status: 'pending_confirm',
      participantIds: [1, 2],
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.CreateActivity,
      {
        targetUserId: 2,
        title: 'Saturday easy run',
        city: 'Qingdao',
        lat: 36.0671,
        lng: 120.3826,
        approvalId: 501,
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(activities.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: 'Saturday easy run',
        city: 'Qingdao',
        locationName: '公共场所待确认',
        lat: undefined,
        lng: undefined,
        durationMinutes: 45,
        invitedUserId: 2,
        proofRequired: true,
        proofPolicy: ActivityProofPolicy.MutualOrProof,
        icebreakerTasks: expect.arrayContaining([
          expect.stringContaining('活动结束后'),
        ]),
      }),
    );
  });

  it('rejects share_location without an approved confirmation', async () => {
    const { service, taskRepo } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ShareLocation,
      {
        targetUserId: 2,
        preciseLocation: true,
        locationText: 'current live location',
      },
      1,
    );

    expect(call.status).toBe('blocked');
    expect(call.error).toMatchObject({
      code: 'APPROVAL_REQUIRED',
      statusCode: 403,
    });
    expect(call.output).toBeNull();
  });

  it('drafts an opener as a confirmation-ready Meet Loop step only', async () => {
    const { service, taskRepo, ai, messages, friends, activities } =
      makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({ permissionMode: AgentTaskPermissionMode.Assist }),
    );
    ai.generateInviteMessage.mockResolvedValue(
      '你好，我看到你也喜欢周末下午跑步，可以先在公共场所轻松慢跑一圈。',
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.DraftOpener,
      {
        request: { activityType: 'running' },
        candidate: { targetUserId: 2, displayName: '小林' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      message: expect.stringContaining('公共场所'),
      meetLoopStage: 'opener_drafted',
      nextStep: 'user_confirmation_required',
      confirmation: expect.objectContaining({
        actionType: 'send_message',
        primaryAction: '确认发送',
      }),
    });
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(activities.create).not.toHaveBeenCalled();
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
          input: { targetUserId: 2, text: 'Hi' },
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
        code: 'TOOL_EXECUTION_FAILED',
        message: expect.stringContaining('agentConnectionId'),
      }),
    });
  });

  it('gates offline_meeting as pending approval without creating an activity', async () => {
    const { service, taskRepo, activities, messages, actionLogs, approvals } =
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
            title: 'weekend running meetup',
            locationName: 'Chaoyang Park west gate',
            city: 'Beijing',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    activities.create.mockResolvedValue({
      id: 33,
      title: 'weekend running meetup',
      status: 'pending_confirm',
      city: 'Beijing',
      locationName: 'Chaoyang Park west gate',
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
    expect(activities.create).not.toHaveBeenCalled();
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        agentTaskId: 100,
        skillName: SocialAgentToolName.OfflineMeeting,
        actionType: 'offline_meeting',
        riskLevel: 'high',
        payload: expect.objectContaining({
          targetUserId: 2,
        }),
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'offline_meeting',
        actionStatus: 'pending_approval',
        riskLevel: 'high',
        targetUserId: 2,
        payload: expect.objectContaining({
          requiresApproval: true,
          approvalId: 501,
          executed: false,
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.action.succeeded',
        metadata: expect.objectContaining({
          output: expect.objectContaining({
            pendingApproval: true,
            status: 'pending_approval',
          }),
        }),
      }),
    );
  });

  it('gates payment steps as pending approval and never creates payment intent automatically', async () => {
    const {
      service,
      taskRepo,
      paymentIntentRepo,
      actionLogs,
      messages,
      approvals,
    } = makeService();
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
            description: '鍦哄湴璁㈤噾',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    paymentIntentRepo.save.mockImplementation((value) =>
      Promise.resolve({
        id: 88,
        ...value,
      }),
    );

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(paymentIntentRepo.create).not.toHaveBeenCalled();
    expect(paymentIntentRepo.save).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        agentTaskId: 100,
        skillName: SocialAgentToolName.Payment,
        actionType: 'payment',
        riskLevel: 'high',
        payload: expect.objectContaining({
          amount: 88.5,
          currency: 'cny',
          payeeUserId: 2,
          riskLevel: 'critical',
          blockedActions: expect.arrayContaining(['auto_execute']),
        }),
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: 7,
        actionType: 'payment',
        actionStatus: 'pending_approval',
        riskLevel: 'high',
        targetUserId: 2,
        payload: expect.objectContaining({
          agentTaskId: 100,
          userId: 1,
          toolName: SocialAgentToolName.Payment,
          permissionMode: AgentTaskPermissionMode.LimitedAuto,
          requiresApproval: true,
          approvalId: 501,
          executed: false,
          policy: expect.objectContaining({
            sceneRisk: expect.objectContaining({
              riskLevel: 'critical',
              blockedActions: expect.arrayContaining(['auto_execute']),
            }),
          }),
        }),
      }),
    );
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.action.succeeded',
        metadata: expect.objectContaining({
          output: expect.objectContaining({
            pendingApproval: true,
            status: 'pending_approval',
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
            description: 'venue deposit',
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
    const { service, taskRepo, eventRepo, connectionRepo, socialRequests } =
      makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Confirm,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.CreateSocialRequest,
          action: 'send_invite',
          status: 'planned',
          input: { rawText: 'find someone to run this weekend' },
        },
      ],
    });
    const agent = { id: 7, userId: 1 };
    taskRepo.findOne.mockResolvedValue(task);
    connectionRepo.findOne.mockResolvedValue(agent);
    socialRequests.createFromNaturalLanguage.mockResolvedValue({ id: 55 });

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(result.toolCalls[0]).toMatchObject({
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'succeeded',
    });
    expect(result.toolCalls[0].id.length).toBeLessThanOrEqual(80);
    expect(result.toolCalls[0].id).not.toContain(':');
    expect(result.toolCalls[0].id).not.toContain(
      'action_create_social_request',
    );
    const savedEvents = eventRepo.save.mock.calls.map(([event]) => event);
    expect(savedEvents.length).toBeGreaterThan(0);
    for (const event of savedEvents) {
      if (event.toolCallId != null) {
        const toolCallId = requireString(event.toolCallId, 'toolCallId');
        expect(toolCallId.length).toBeLessThanOrEqual(80);
        expect(toolCallId).not.toContain(':');
        expect(toolCallId).not.toContain('action_create_social_request');
      }
    }
    expect(socialRequests.createFromNaturalLanguage).toHaveBeenCalledWith(
      'find someone to run this weekend',
      1,
      agent,
    );
  });

  it('does not fail a completed social action when its audit log is unavailable', async () => {
    const { service, taskRepo, connectionRepo, actionLogs, socialRequests } =
      makeService();
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

  it('manual_confirm mode turns social sends into pending approvals and audits them', async () => {
    const { service, taskRepo, messages, approvals, actionLogs } =
      makeService();
    const task = makeTask({
      permissionMode: 'manual_confirm' as never,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          action: 'send_message',
          status: 'planned',
          input: { targetUserId: 2, text: 'Hi, want to work out together?' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        agentTaskId: 100,
        skillName: SocialAgentToolName.SendMessage,
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'send_message',
        actionStatus: 'pending_approval',
        payload: expect.objectContaining({
          requiresApproval: true,
          executed: false,
          sceneType: 'general',
        }),
      }),
    );
  });

  it('lab mode simulates write tools without executing real side effects', async () => {
    const { service, taskRepo, messages, approvals, actionLogs } =
      makeService();
    const task = makeTask({
      permissionMode: 'lab' as never,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          action: 'send_message',
          status: 'planned',
          input: { targetUserId: 2, text: 'Hi' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).not.toHaveBeenCalled();
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'send_message',
        actionStatus: 'executed',
        payload: expect.objectContaining({
          executed: false,
          output: expect.objectContaining({ simulated: true }),
        }),
      }),
    );
  });
});
