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
import { SocialRequestType } from '../social-requests/social-request.entity';
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
import { SocialAgentMessageEventToolService } from './social-agent-message-event-tool.service';
import { SocialAgentConversationToolService } from './social-agent-conversation-tool.service';
import { SocialAgentDecisionToolService } from './social-agent-decision-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialCodexRuntimePolicyService } from './social-codex-runtime-policy.service';

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

const publicCandidateBoundary = (
  index = 1,
): {
  candidateRecordId: number;
  socialRequestId: number;
  candidateVisibility: string;
} => ({
  candidateRecordId: 700 + index,
  socialRequestId: 900 + index,
  candidateVisibility: 'public',
});

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

function makeService(options: { agentLoop?: unknown } = {}) {
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
    aiDraft: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
    createAgentMessageEvent: jest.fn(),
    getAgentConversationMessages: jest.fn(),
    getTaskConversationMessages: jest.fn(),
    getAgentMessageConversations: jest.fn(),
    getAgentMessageEvents: jest.fn(),
    getAgentMessageEventsForOwner: jest.fn(),
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
    getById: jest.fn((id: number, userId: number) =>
      Promise.resolve({
        id,
        userId,
        agentTaskId: 100,
        status: 'approved',
        skillName: '',
        actionType: '',
        payload: {},
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
    undefined,
    new SocialCodexRuntimePolicyService(),
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
  const taskMemory = new SocialAgentTaskMemoryService(toolInput);
  const l5Runtime = {
    transitionMeetLoop: jest.fn().mockResolvedValue(undefined),
  };
  const paymentIntentTools = new SocialAgentPaymentIntentToolService(
    paymentIntentRepo as never,
    toolInput,
    taskMemory,
  );
  const messageTools = new SocialAgentMessageToolService(
    messages as never,
    matchService as never,
    confirmationPolicy,
    toolInput,
    taskMemory,
  );
  const activityTools = new SocialAgentActivityToolService(
    activities as never,
    messages as never,
    toolInput,
    taskMemory,
  );
  const messageEventTools = new SocialAgentMessageEventToolService(
    messages as never,
    toolInput,
  );
  const conversationTools = new SocialAgentConversationToolService(
    messages as never,
    toolJsonModel,
    toolInput,
    taskMemory,
    l5Runtime as never,
  );
  const decisionTools = new SocialAgentDecisionToolService(
    permissions,
    toolJsonModel,
    toolCallFactory,
    toolInput,
    taskMemory,
    l5Runtime as never,
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
    messageEventTools,
    conversationTools,
    decisionTools,
    taskMemory,
    options.agentLoop as never,
    l5Runtime as never,
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
    l5Runtime,
  };
}

function readToolTimeoutMs(
  service: SocialAgentToolExecutorService,
  toolName: SocialAgentToolName,
): number {
  return (
    service as unknown as {
      toolTimeoutMs(toolName: SocialAgentToolName): number;
    }
  ).toolTimeoutMs(toolName);
}

describe('SocialAgentToolExecutorService', () => {
  it('uses production-grade default tool timeouts without enabling high-risk retries', () => {
    const previousSharedTimeout = process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS;
    const previousSendTimeout =
      process.env.FITMEET_AGENT_TOOL_SEND_MESSAGE_TIMEOUT_MS;
    delete process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS;
    delete process.env.FITMEET_AGENT_TOOL_SEND_MESSAGE_TIMEOUT_MS;
    try {
      const { service } = makeService();

      expect(
        readToolTimeoutMs(service, SocialAgentToolName.SearchMatches),
      ).toBe(25_000);
      expect(readToolTimeoutMs(service, SocialAgentToolName.SendMessage)).toBe(
        20_000,
      );
      expect(readToolTimeoutMs(service, SocialAgentToolName.GetMyProfile)).toBe(
        20_000,
      );
    } finally {
      if (previousSharedTimeout === undefined) {
        delete process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS;
      } else {
        process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS = previousSharedTimeout;
      }
      if (previousSendTimeout === undefined) {
        delete process.env.FITMEET_AGENT_TOOL_SEND_MESSAGE_TIMEOUT_MS;
      } else {
        process.env.FITMEET_AGENT_TOOL_SEND_MESSAGE_TIMEOUT_MS =
          previousSendTimeout;
      }
    }
  });

  it('still allows explicit production env overrides for tool timeouts', () => {
    const previousSharedTimeout = process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS;
    process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS = '30000';
    try {
      const { service } = makeService();

      expect(
        readToolTimeoutMs(service, SocialAgentToolName.SearchMatches),
      ).toBe(30_000);
      expect(readToolTimeoutMs(service, SocialAgentToolName.SendMessage)).toBe(
        30_000,
      );
    } finally {
      if (previousSharedTimeout === undefined) {
        delete process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS;
      } else {
        process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS = previousSharedTimeout;
      }
    }
  });

  it('blocks admin debug tools from user-facing adhoc task actions', async () => {
    const { service, taskRepo, candidatePool } = makeService();

    await expect(
      service.executeToolAction(
        100,
        SocialAgentToolName.GetCandidatePoolDebug,
        {},
        1,
      ),
    ).rejects.toThrow(
      'Admin/debug tools cannot be executed from user-facing Agent task actions.',
    );

    expect(taskRepo.findOne).not.toHaveBeenCalled();
    expect(candidatePool.debugCandidatePool).not.toHaveBeenCalled();
  });

  it('does not execute skipped planner recovery steps after DeepSeek planning degrades', async () => {
    const { service, taskRepo, candidatePool, messages, approvals } =
      makeService();
    const task = makeTask({
      plan: [
        {
          id: 'fallback_1',
          action: 'generate_content',
          status: 'skipped',
          input: {
            executionDeferred: true,
            recoveryMessage:
              '暂时没有得到可靠计划，已保留上下文；请重试或继续补充。',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({
      executedSteps: 0,
      succeededSteps: 0,
      failedSteps: 0,
      blockedSteps: 0,
    });
    expect(candidatePool.searchSocial).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).not.toHaveBeenCalled();
  });

  it('does not run-next a task that does not belong to the authenticated user', async () => {
    const { service, taskRepo, messages, l5Runtime } = makeService();
    taskRepo.findOne.mockResolvedValue(null);

    await expect(service.runNext(100, 99)).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 404,
      }),
    });

    expect(taskRepo.findOne).toHaveBeenCalledWith({
      where: { id: 100, ownerUserId: 99 },
    });
    expect(messages.getAgentConversationMessages).not.toHaveBeenCalled();
    expect(messages.sendAgentReply).not.toHaveBeenCalled();
    expect(l5Runtime.transitionMeetLoop).not.toHaveBeenCalled();
  });

  it('does not execute run-next reply reading unless AgentLoop runs the tool runner', async () => {
    const agentLoop = {
      execute: jest.fn().mockResolvedValue({
        loop: {
          runId: 'loop:run-next-boundary',
          taskId: 100,
          goal: 'Continue Social Agent task 100',
          status: 'completed',
          steps: [],
        },
      }),
    };
    const { service, taskRepo, messages, approvals, l5Runtime } = makeService({
      agentLoop,
    });
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        status: AgentTaskStatus.WaitingReply,
        memory: {
          socialLoop: {
            conversationId: 'conv_1',
            targetUserId: 2,
          },
        },
      }),
    );

    await expect(service.runNext(100, 1)).rejects.toThrow(
      'AgentLoop did not produce a run-next result',
    );

    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 100,
        goal: 'Continue Social Agent task 100',
        plan: expect.objectContaining({
          reason: 'run-next must pass through the unified AgentLoop.',
          tools: [
            expect.objectContaining({
              agent: 'Match Agent',
              toolName: 'run_next_execute',
            }),
          ],
        }),
        maxToolCalls: 1,
        timeoutMs: 30_000,
      }),
    );
    expect(messages.getAgentConversationMessages).not.toHaveBeenCalled();
    expect(messages.getTaskConversationMessages).not.toHaveBeenCalled();
    expect(messages.sendAgentReply).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).not.toHaveBeenCalled();
    expect(l5Runtime.transitionMeetLoop).not.toHaveBeenCalled();
  });

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
        riskLevel: 'high',
        status: 'succeeded',
        targetUserId: 2,
        payload: expect.objectContaining({
          userId: 1,
          agentTaskId: 100,
          stepId: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          inputSummary: expect.stringContaining('targetUserId'),
          outputSummary: expect.stringContaining('succeeded'),
          riskLevel: 'high',
          compensationAction: 'send_correction_or_retraction_message',
          compensationStatus: 'not_needed',
          requiresApproval: true,
          approvalId: 501,
          executed: false,
          status: 'succeeded',
          error: null,
          createdAt: expect.any(String),
        }),
      }),
    );
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
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

  it('blocks contact exchange content at the Social Codex sandbox before approval creation', async () => {
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
          input: {
            targetUserId: 2,
            text: '我的微信是 fitmeet-test，电话 15253005312',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({
      executedSteps: 1,
      succeededSteps: 0,
      failedSteps: 0,
      blockedSteps: 1,
    });
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).not.toHaveBeenCalled();
    expect(result.toolCalls[0]).toMatchObject({
      status: 'blocked',
      error: expect.objectContaining({
        code: 'SOCIAL_CODEX_SANDBOX_BLOCKED',
        retryable: false,
      }),
    });
    const auditInput = actionLogs.logAgentAction.mock.calls[0][0];
    expect(auditInput).toMatchObject({
      actionStatus: 'failed',
      status: 'blocked',
      payload: expect.objectContaining({
        input: expect.objectContaining({
          text: '[redacted]',
        }),
      }),
    });
    expect(JSON.stringify(auditInput)).not.toContain('15253005312');
    expect(JSON.stringify(auditInput)).not.toContain('fitmeet-test');
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
          input: {
            city: 'Qingdao',
            rawText: 'find running partner',
            candidatePreference: '公开资料里有舞蹈相关标签的女生优先',
            candidatePreferencePolicy:
              'public_discoverable_profiles_and_user_consented_public_tags_only',
          },
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
        taskId: 100,
        city: 'Qingdao',
        rawText: 'find running partner',
        candidatePreference: '公开资料里有舞蹈相关标签的女生优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      }),
    );
  });

  it('passes task context into candidate explanation reasoning', async () => {
    const { service, taskRepo, socialProfiles, matchReasoner } = makeService();
    const abortController = new AbortController();
    const task = makeTask({ id: 100, ownerUserId: 1 });
    taskRepo.findOne.mockResolvedValue(task);
    socialProfiles.get
      .mockResolvedValueOnce({
        userId: 1,
        nickname: 'Owner',
        city: '青岛',
        interestTags: ['散步'],
      })
      .mockResolvedValueOnce({
        userId: 2,
        nickname: 'Candidate',
        city: '青岛',
        interestTags: ['散步'],
      });
    matchReasoner.explain.mockResolvedValue({
      publicReason: '都喜欢散步，适合先轻松聊聊。',
      privateReason: '公开兴趣重合，发送邀请前需要确认。',
      sharedPoints: ['散步'],
      complementaryPoints: [],
      riskWarnings: ['邀请前需要确认'],
      suggestedOpener: '你好，要不要先聊聊散步？',
      nextAction: '用户确认后再发送邀请。',
      requiresUserConfirmation: true,
      confidence: 0.8,
      source: 'deepseek',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.ExplainMatches,
      {
        candidateUserId: 2,
        publicTags: {
          owner: ['散步'],
          candidate: ['散步'],
          shared: ['散步'],
        },
      },
      1,
      { signal: abortController.signal },
    );

    expect(call.status).toBe('succeeded');
    expect(matchReasoner.explain).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 100,
        signal: abortController.signal,
        ownerProfile: expect.objectContaining({ userId: 1 }),
        candidateProfile: expect.objectContaining({ userId: 2 }),
        publicTags: expect.objectContaining({
          shared: ['散步'],
        }),
      }),
    );
  });

  it('retries retryable low-risk tools and keeps reliability metadata', async () => {
    const { service, taskRepo, candidatePool } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SearchMatches,
          action: 'search_profiles',
          status: 'planned',
          input: { city: 'Qingdao', rawText: 'find running partner' },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);
    candidatePool.searchSocial
      .mockRejectedValueOnce(new Error('temporary network unavailable'))
      .mockResolvedValueOnce({
        candidates: [],
        emptyReason: 'no_real_candidates',
        message: 'No real candidates found.',
        debugReasons: [],
      });

    const result = await service.executeTask(100);

    expect(result.succeededSteps).toBe(1);
    expect(candidatePool.searchSocial).toHaveBeenCalledTimes(2);
    expect(result.toolCalls[0].output).toMatchObject({
      reliability: expect.objectContaining({
        highRisk: false,
        retryable: true,
        maxRetries: 1,
        compensationAction: null,
      }),
    });
  });

  it('deduplicates repeated tool calls with the same idempotency key', async () => {
    const { service, taskRepo, candidatePool } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SearchMatches,
          action: 'search_profiles',
          status: 'planned',
          input: {
            city: 'Qingdao',
            rawText: 'find running partner',
            idempotencyKey: 'search-qingdao-running-1',
          },
        },
        {
          id: 'step_2',
          toolName: SocialAgentToolName.SearchMatches,
          action: 'search_profiles',
          status: 'planned',
          input: {
            city: 'Qingdao',
            rawText: 'find running partner',
            idempotencyKey: 'search-qingdao-running-1',
          },
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

    expect(result.succeededSteps).toBe(2);
    expect(candidatePool.searchSocial).toHaveBeenCalledTimes(1);
    expect(result.toolCalls[0].id).toBe(result.toolCalls[1].id);
    expect(result.toolCalls[0].input).toMatchObject({
      idempotencyKey: 'search-qingdao-running-1',
      metadata: expect.objectContaining({
        idempotencyKey: 'search-qingdao-running-1',
      }),
    });
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
        {
          id: 'message center',
          toolName: 'get_agent_message_events',
          status: 'planned',
        },
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
    messages.getAgentMessageConversations.mockResolvedValue([
      { conversationId: 'agent_conv_1' },
    ]);
    messages.getAgentMessageEvents.mockResolvedValue([{ id: 'event_1' }]);
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
      SocialAgentToolName.GetAgentMessageEvents,
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
    expect(result.toolCalls[0]).toMatchObject({
      toolName: SocialAgentToolName.PublishSocialRequest,
      output: {
        status: 'pending_approval',
        pendingApproval: true,
        approvalId: 501,
        approval: expect.objectContaining({
          type: 'post_publish',
          riskLevel: 'high',
        }),
      },
    });
    expect(socialRequests.create).not.toHaveBeenCalled();
    expect(socialRequests.syncPublicIntentById).not.toHaveBeenCalled();
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(activities.create).not.toHaveBeenCalled();
    expect(activities.join).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledTimes(5);
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.PublishSocialRequest,
        actionType: 'create_social_request',
        riskLevel: 'high',
      }),
    );
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
    const { service, taskRepo, messages, approvals, l5Runtime } = makeService();
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
    messages.getAgentConversationMessages.mockResolvedValue([
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
      cards: expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          data: expect.objectContaining({
            schemaName: 'MeetLoopTimelineCard',
            loopStage: 'reply_received',
            connectionState: 'reply_received',
            counterpartIntent: 'accepted',
            replyIntentLabel: '对方愿意继续',
            nextSafeStep: expect.stringContaining('回复对方的问题'),
            sideEffectPolicy: 'no_followup_without_user_confirmation',
          }),
        }),
        expect.objectContaining({
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'life_graph.diff',
          data: expect.objectContaining({
            schemaName: 'LifeGraphDiffCard',
            source: 'counterpart_reply',
            loopStage: 'reply_received',
          }),
        }),
      ]),
    });
    const runNextActions = result.cards?.[0]?.actions ?? [];
    expect(runNextActions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schemaAction: 'activity.confirm_create' }),
      ]),
    );
    expect(messages.getAgentConversationMessages).toHaveBeenCalledWith(
      'conv_1',
      7,
      {
        limit: 50,
      },
    );
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent.message.received',
        conversationId: 'conv_1',
        messageId: 'msg_2',
        fromUserId: 2,
      }),
    );
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'social_agent.reply.summarized' }),
    );
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent.next_action.decided',
      }),
    );
    const nextActionMessageEvent = messages.createAgentMessageEvent.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((event) => event.eventType === 'social_agent.next_action.decided');
    expect(nextActionMessageEvent).toMatchObject({
      conversationId: 'conv_1',
      messageId: 'msg_2',
      fromUserId: 2,
      metadata: expect.objectContaining({
        lifeGraphWritebackProposal: expect.objectContaining({
          schemaVersion: 'fitmeet.life_graph.writeback.v1',
          source: 'counterpart_reply',
          status: 'pending_user_confirmation',
          candidateUserId: 2,
          conversationId: 'conv_1',
          messageId: 'msg_2',
          privacyBoundary: expect.stringContaining('不保存对方私聊原文'),
        }),
      }),
    });
    const proposal = (
      nextActionMessageEvent?.metadata as Record<string, unknown> | undefined
    )?.lifeGraphWritebackProposal;
    expect(JSON.stringify(proposal)).not.toContain(
      'Sure, let us confirm the route and meeting point first.',
    );
    expect(messages.sendAgentReply).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.ReplyMessage,
        actionType: 'send_message',
        agentTaskId: 100,
      }),
    );
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentTaskId: 100,
        candidateUserId: 2,
        stage: 'reply_received',
        waitingFor: 'action_confirmation',
        state: expect.objectContaining({
          conversationId: 'conv_1',
          targetUserId: 2,
          actionToolName: SocialAgentToolName.ReplyMessage,
          actionStatus: 'succeeded',
          outputSummary: expect.objectContaining({
            pendingApproval: true,
            status: 'pending_approval',
          }),
          loopStage: 'reply_received',
        }),
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
        nextActionDecision: expect.objectContaining({
          lifeGraphWritebackProposal: expect.objectContaining({
            status: 'pending_user_confirmation',
            candidateUserId: 2,
          }),
        }),
      },
    });
  });

  it('marks old waiting-reply tasks without readable conversation as non-retryable failed', async () => {
    const { service, taskRepo, messages } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      status: AgentTaskStatus.WaitingReply,
      memory: { socialLoop: {} },
    });
    taskRepo.findOne.mockResolvedValue(task);
    messages.getTaskConversationMessages.mockResolvedValue([]);

    const result = await service.runNext(100, 1);

    expect(messages.getAgentConversationMessages).not.toHaveBeenCalled();
    expect(messages.getTaskConversationMessages).toHaveBeenCalledWith(100, {
      conversationId: undefined,
      limit: 50,
    });
    expect(result).toMatchObject({
      status: AgentTaskStatus.Failed,
      handledReply: false,
      executedSteps: 1,
      failedSteps: 0,
    });
    expect(task.statusReason).toBe('task_conversation_unbound');
    expect(task.error).toMatchObject({
      code: 'task_conversation_unbound',
      retryable: false,
    });
    expect(task.completedAt).toBeInstanceOf(Date);
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
    messages.getAgentConversationMessages.mockResolvedValue([
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
    expect(fetchSpy).toHaveBeenCalledTimes(4);
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
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
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

  it('turns chat-confirmed candidate messages into pending approvals when no agent connection is bound', async () => {
    const { service, taskRepo, messages, actionLogs, approvals } =
      makeService();
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
        ...publicCandidateBoundary(2),
        text: 'Hi, want to grab coffee?',
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      status: 'pending_approval',
      pendingApproval: true,
      approvalId: 501,
    });
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.SendMessageToCandidate,
        riskLevel: 'high',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: null,
        actionType: 'send_message',
        actionStatus: 'pending_approval',
        status: 'succeeded',
      }),
    );
  });

  it('executes a candidate invite message after a send_invite approval is confirmed', async () => {
    const { service, taskRepo, messages, approvals } = makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    approvals.getById.mockResolvedValue({
      id: 501,
      userId: 1,
      agentTaskId: 100,
      status: 'approved',
      skillName: SocialAgentToolName.SendMessageToCandidate,
      actionType: 'send_invite',
      payload: { targetUserId: 2 },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
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
        ...publicCandidateBoundary(2),
        text: '今晚在青岛大学附近散步吗？',
        approvalId: 501,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(approvals.getById).toHaveBeenCalledWith(501, 1);
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ agentConnectionId: null, ownerUserId: 1 }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv_user',
      1,
      '今晚在青岛大学附近散步吗？',
      expect.objectContaining({
        agentConnectionId: null,
        metadata: expect.objectContaining({
          confirmationSource: 'social_agent_chat',
        }),
      }),
    );
    expect(call.output).toMatchObject({
      success: true,
      status: 'sent',
    });
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
        ...publicCandidateBoundary(2),
        text: 'hello',
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      success: false,
      status: 'pending_approval',
      pendingApproval: true,
      approvalId: 501,
    });
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
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
        ...publicCandidateBoundary(2),
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
        ...publicCandidateBoundary(2),
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
        ...publicCandidateBoundary(2),
        openConversation: true,
        approvalId: 501,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(friends.ensureFollowing).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({
        agentTaskId: 100,
        idempotencyKey: expect.any(String),
      }),
    );
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
        candidate: {
          candidateUserId: 3,
          publiclyDiscoverable: true,
          ...publicCandidateBoundary(3),
        },
        openConversation: true,
        approvalId: 501,
        metadata: { confirmationSource: 'social_agent_chat' },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(friends.ensureFollowing).toHaveBeenCalledWith(
      1,
      3,
      expect.objectContaining({
        agentTaskId: 100,
        idempotencyKey: expect.any(String),
      }),
    );
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
      {
        candidateUserId: 2,
        ...publicCandidateBoundary(2),
        openConversation: true,
        approvalId: 501,
      },
      1,
    );
    const second = await service.executeToolAction(
      100,
      SocialAgentToolName.ConnectCandidate,
      {
        candidateUserId: 3,
        ...publicCandidateBoundary(3),
        openConversation: true,
        approvalId: 502,
      },
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
    expect(friends.ensureFollowing).toHaveBeenCalledWith(
      1,
      5,
      expect.objectContaining({
        agentTaskId: 100,
        idempotencyKey: expect.any(String),
      }),
    );
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

  it('creates a pending approval for add_friend without an approved confirmation', async () => {
    const { service, taskRepo, friends, messages, approvals } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
      }),
    );

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.AddFriend,
      {
        targetUserId: 2,
        ...publicCandidateBoundary(2),
        openConversation: true,
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      status: 'pending_approval',
      pendingApproval: true,
      approvalId: 501,
    });
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.AddFriend,
        riskLevel: 'high',
      }),
    );
    expect(friends.ensureFollowing).not.toHaveBeenCalled();
    expect(messages.startConversation).not.toHaveBeenCalled();
  });

  it('creates a pending approval for create_activity without an approved confirmation', async () => {
    const { service, taskRepo, activities, approvals } = makeService();
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

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      status: 'pending_approval',
      pendingApproval: true,
      approvalId: 501,
    });
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.CreateActivity,
        riskLevel: 'high',
      }),
    );
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('does not execute a high-risk action with an unapproved approval credential', async () => {
    const { service, taskRepo, activities, approvals } = makeService();
    taskRepo.findOne.mockResolvedValue(
      makeTask({
        agentConnectionId: 7,
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
      }),
    );
    approvals.getById.mockResolvedValue({
      id: 501,
      userId: 1,
      agentTaskId: 100,
      status: 'pending',
      skillName: SocialAgentToolName.CreateActivity,
      actionType: 'create_activity',
      payload: { targetUserId: 2 },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.CreateActivity,
      {
        targetUserId: 2,
        title: 'Saturday easy run',
        city: 'Qingdao',
        approvalId: 501,
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      status: 'pending_approval',
      pendingApproval: true,
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

  it('creates a pending approval for share_location without an approved confirmation', async () => {
    const { service, taskRepo, approvals } = makeService();
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

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      status: 'pending_approval',
      pendingApproval: true,
      approvalId: 501,
    });
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.ShareLocation,
        riskLevel: 'high',
      }),
    );
  });

  it('drafts an opener as a confirmation-ready Meet Loop step only', async () => {
    const { service, taskRepo, ai, messages, friends, activities } =
      makeService();
    const abortController = new AbortController();
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
      { signal: abortController.signal },
    );

    expect(call.status).toBe('succeeded');
    expect(ai.generateInviteMessage).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'running' }),
      expect.objectContaining({ targetUserId: 2, displayName: '小林' }),
      { signal: abortController.signal },
    );
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

  it('creates approval instead of executing real social actions when the task is not bound to an agent connection', async () => {
    const { service, taskRepo, messages, actionLogs, approvals } =
      makeService();
    const task = makeTask({
      agentConnectionId: null,
      permissionMode: AgentTaskPermissionMode.Assist,
      plan: [
        {
          id: 'step_1',
          toolName: SocialAgentToolName.SendMessage,
          action: 'send_message',
          status: 'planned',
          input: {
            targetUserId: 2,
            ...publicCandidateBoundary(2),
            text: 'Hi',
          },
        },
      ],
    });
    taskRepo.findOne.mockResolvedValue(task);

    const result = await service.executeTask(100);

    expect(result).toMatchObject({ succeededSteps: 1, blockedSteps: 0 });
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(approvals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: SocialAgentToolName.SendMessage,
        riskLevel: 'high',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentId: null,
        actionType: 'send_message',
        actionStatus: 'pending_approval',
      }),
    );
    expect(task.plan[0]).toMatchObject({
      status: 'succeeded',
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
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
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
    expect(messages.createAgentMessageEvent).toHaveBeenCalledWith(
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

  it('keeps high-risk tools approval-gated and disables automatic retries even when globally enabled', async () => {
    const previousRetries = process.env.FITMEET_AGENT_TOOL_RETRIES;
    process.env.FITMEET_AGENT_TOOL_RETRIES = '3';
    try {
      const { service, taskRepo, paymentIntentRepo, approvals } = makeService();
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
              description: 'venue deposit',
            },
          },
        ],
      });
      taskRepo.findOne.mockResolvedValue(task);

      const result = await service.executeTask(100);

      expect(result.succeededSteps).toBe(1);
      expect(paymentIntentRepo.create).not.toHaveBeenCalled();
      expect(paymentIntentRepo.save).not.toHaveBeenCalled();
      expect(approvals.create).toHaveBeenCalledTimes(1);
      expect(result.toolCalls[0].output).toMatchObject({
        pendingApproval: true,
        reliability: expect.objectContaining({
          highRisk: true,
          retryable: false,
          maxRetries: 0,
          compensationAction:
            'cancel_payment_intent_or_refund_via_manual_review',
        }),
      });
    } finally {
      if (previousRetries === undefined) {
        delete process.env.FITMEET_AGENT_TOOL_RETRIES;
      } else {
        process.env.FITMEET_AGENT_TOOL_RETRIES = previousRetries;
      }
    }
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
      expect.objectContaining({
        agentTaskId: 100,
        source: 'social_agent_tool_executor',
        taskContext: null,
      }),
    );
  });

  it('does not gate AI social request draft generation behind approval', async () => {
    const { service, taskRepo, socialRequests, approvals } = makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    taskRepo.findOne.mockResolvedValue(task);
    socialRequests.aiDraft.mockResolvedValue({
      ok: true,
      draft: {
        type: 'custom',
        rawText: '今晚想找人一起喝咖啡，不想太尴尬',
        title: '今晚轻松咖啡局',
        description: '想找一位聊得来的同城朋友喝咖啡。',
        city: '上海',
        activityType: 'coffee',
        interestTags: ['咖啡', '轻聊天'],
      },
      card: { title: '今晚轻松咖啡局' },
      profileUsed: { completeness: 0 },
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'ai_draft',
        rawText: '今晚想找人一起喝咖啡，不想太尴尬',
        goal: '今晚想找人一起喝咖啡，不想太尴尬',
        taskContext: {
          taskSlots: {
            activity: { value: '咖啡', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '市南区', state: 'completed' },
          },
          taskSlotSummary: {
            activity: '咖啡',
            time_window: '今天晚上',
            location_text: '市南区',
          },
          knownTaskSlotConstraints: {
            doNotAskAgainFor: ['activity', 'time_window', 'location_text'],
          },
        },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      draft: expect.objectContaining({ title: '今晚轻松咖啡局' }),
    });
    expect(socialRequests.aiDraft).toHaveBeenCalledWith(
      1,
      '今晚想找人一起喝咖啡，不想太尴尬',
      expect.objectContaining({
        agentTaskId: 100,
        source: 'social_agent_tool_executor',
        taskContext: expect.objectContaining({
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '咖啡' }),
            time_window: expect.objectContaining({ value: '今天晚上' }),
            location_text: expect.objectContaining({ value: '市南区' }),
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            doNotAskAgainFor: ['activity', 'time_window', 'location_text'],
          }),
        }),
      }),
    );
    expect(approvals.create).not.toHaveBeenCalled();
  });

  it('publishes an inline-confirmed Discover card without creating another approval', async () => {
    const { service, taskRepo, connectionRepo, socialRequests, approvals } =
      makeService();
    const task = makeTask({
      permissionMode: AgentTaskPermissionMode.Confirm,
      agentConnectionId: 7,
    });
    taskRepo.findOne.mockResolvedValue(task);
    connectionRepo.findOne.mockResolvedValue({ id: 7, userId: 1 });
    socialRequests.update.mockResolvedValue({
      id: 301,
      status: 'matching',
    });
    socialRequests.syncPublicIntentById.mockResolvedValue({
      id: 'social_request_301',
      status: 'active',
    });

    const call = await service.executeToolAction(
      100,
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        socialRequestId: 301,
        type: SocialRequestType.RunningPartner,
        title: '今天晚上青岛大学跑步搭子',
        city: '青岛',
        activityType: '跑步',
        confirmedPublish: true,
        approved: true,
        confirmed: true,
        metadata: {
          publishSource: 'agent_card_action',
        },
      },
      1,
    );

    expect(call.status).toBe('succeeded');
    expect(call.output).toMatchObject({
      socialRequestId: 301,
      publicIntentId: 'social_request_301',
      synced: true,
    });
    expect(approvals.create).not.toHaveBeenCalled();
    expect(socialRequests.update).toHaveBeenCalledWith(
      301,
      1,
      expect.objectContaining({
        type: SocialRequestType.RunningPartner,
        mode: 'publish',
        syncPublicIntent: true,
      }),
      { id: 7, userId: 1 },
    );
    expect(socialRequests.syncPublicIntentById).toHaveBeenCalledWith(301, 1);
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
    actionLogs.logAgentAction.mockResolvedValue({ id: 1 });

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
