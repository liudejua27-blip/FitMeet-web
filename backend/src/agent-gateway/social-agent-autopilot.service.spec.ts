import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';

import { SocialAgentAutopilotService } from './social-agent-autopilot.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';

const repo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
});

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    taskType: 'social_goal',
    title: 'Find partner',
    goal: '帮我找跑步搭子',
    input: {},
    plan: [{ id: 'step_1', toolName: SocialAgentToolName.SendMessage }],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.WaitingReply,
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

function makeRequest(
  overrides: Partial<UserSocialRequest> = {},
): UserSocialRequest {
  return {
    id: 55,
    userId: 1,
    agentId: null,
    agentAllowed: true,
    requireUserConfirmation: false,
    status: UserSocialRequestStatus.Matching,
    title: '今晚跑步',
    rawText: '帮我找今晚跑步的人',
    description: '找跑步搭子',
    type: 'running_partner' as never,
    city: '青岛',
    activityType: 'running',
    interestTags: ['跑步'],
    metadata: {},
    updatedAt: new Date(),
    ...overrides,
  } as UserSocialRequest;
}

function makeService(options: { lifeGraph?: Record<string, jest.Mock> } = {}) {
  const taskRepo = repo();
  const requestRepo = repo();
  const connectionRepo = repo();
  const messages = {
    getRecentAgentConversationSignals: jest.fn().mockResolvedValue([]),
  };
  const planner = { planExistingTask: jest.fn().mockResolvedValue({}) };
  const executor = {
    runNext: jest.fn().mockResolvedValue({
      taskId: 100,
      status: AgentTaskStatus.WaitingReply,
      executedSteps: 1,
      succeededSteps: 1,
      failedSteps: 0,
      blockedSteps: 0,
      handledReply: true,
      decision: null,
      toolCalls: [
        {
          toolName: SocialAgentToolName.ReplyMessage,
          status: 'succeeded',
        },
      ],
    }),
  };
  const actionLogs = { logAgentAction: jest.fn().mockResolvedValue({ id: 1 }) };

  const service = new SocialAgentAutopilotService(
    taskRepo as never,
    requestRepo as never,
    connectionRepo as never,
    messages as never,
    planner as never,
    executor as never,
    actionLogs as never,
    options.lifeGraph as never,
  );

  return {
    service,
    taskRepo,
    requestRepo,
    connectionRepo,
    messages,
    planner,
    executor,
    actionLogs,
  };
}

describe('SocialAgentAutopilotService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SOCIAL_AGENT_AUTOPILOT_MAX_TASKS_PER_RUN = '20';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not run cron when ENABLE_SOCIAL_AGENT_AUTOPILOT is not true', async () => {
    const { service } = makeService();
    const spy = jest.spyOn(service, 'runOnce');

    await service.onCron();

    expect(spy).not.toHaveBeenCalled();
  });

  it('runs waiting tasks once and writes started/completed logs', async () => {
    const { service, taskRepo, requestRepo, messages, executor, actionLogs } =
      makeService();
    const task = makeTask();
    taskRepo.find.mockResolvedValue([task]);
    taskRepo.findOne.mockResolvedValue(task);
    requestRepo.find.mockResolvedValue([]);
    messages.getRecentAgentConversationSignals.mockResolvedValue([]);

    const summary = await service.runOnce('manual', 1);

    expect(executor.runNext).toHaveBeenCalledWith(100, 1);
    expect(summary).toMatchObject({
      triggeredBy: 'manual',
      skipped: false,
      scanned: { tasks: 1, conversations: 0, socialRequests: 0 },
      processedTasks: 1,
      handledReplies: 1,
      actionsExecuted: 1,
      errors: 0,
    });
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'social_agent_autopilot.started' }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent_autopilot.completed',
      }),
    );
  });

  it('skips a recent message when the task already processed its messageId', async () => {
    const { service, taskRepo, requestRepo, messages, executor } =
      makeService();
    const task = makeTask({
      memory: {
        socialLoop: {
          conversationId: 'conv_1',
          processedMessageIds: ['msg_2'],
        },
      },
    });
    taskRepo.find.mockResolvedValue([]);
    taskRepo.findOne.mockResolvedValue(task);
    requestRepo.find.mockResolvedValue([]);
    messages.getRecentAgentConversationSignals.mockResolvedValue([
      {
        conversationId: 'conv_1',
        messageId: 'msg_2',
        agentConnectionId: 7,
        ownerUserId: 1,
        fromUserId: 2,
        text: '可以',
        metadata: { agentTaskId: 100 },
        createdAt: new Date(),
      },
    ]);

    const summary = await service.runOnce('manual', 1);

    expect(executor.runNext).not.toHaveBeenCalled();
    expect(summary.skippedDuplicates).toBe(1);
    expect(summary.processedTasks).toBe(0);
  });

  it('does not execute terminal tasks returned from a stale scan', async () => {
    const { service, taskRepo, requestRepo, messages, executor } =
      makeService();
    const failedTask = makeTask({
      status: AgentTaskStatus.Failed,
      agentConnectionId: null,
      statusReason: 'task_conversation_unbound',
    });
    taskRepo.find.mockResolvedValue([failedTask]);
    taskRepo.findOne.mockResolvedValue(failedTask);
    requestRepo.find.mockResolvedValue([]);
    messages.getRecentAgentConversationSignals.mockResolvedValue([]);

    const summary = await service.runOnce('manual', 1);

    expect(executor.runNext).not.toHaveBeenCalled();
    expect(summary.errors).toBe(0);
    expect(summary.processedTasks).toBe(0);
    expect(summary.taskResults).toEqual([]);
  });

  it('does not retry an old waiting-reply task after run-next marks it terminal', async () => {
    const { service, taskRepo, requestRepo, messages, executor } =
      makeService();
    const oldTask = makeTask({
      agentConnectionId: null,
      status: AgentTaskStatus.WaitingReply,
      memory: { socialLoop: {} },
    });
    taskRepo.find.mockResolvedValue([oldTask]);
    taskRepo.findOne.mockResolvedValue(oldTask);
    requestRepo.find.mockResolvedValue([]);
    messages.getRecentAgentConversationSignals.mockResolvedValue([]);
    executor.runNext.mockImplementation(async () => {
      oldTask.status = AgentTaskStatus.Failed;
      oldTask.statusReason = 'task_conversation_unbound';
      oldTask.error = {
        code: 'task_conversation_unbound',
        retryable: false,
      };
      oldTask.completedAt = new Date();
      return {
        taskId: oldTask.id,
        status: AgentTaskStatus.Failed,
        executedSteps: 1,
        succeededSteps: 1,
        failedSteps: 0,
        blockedSteps: 0,
        handledReply: false,
        decision: null,
        toolCalls: [
          {
            toolName: SocialAgentToolName.ReadTaskConversationMessages,
            status: 'succeeded',
            output: {
              status: 'skipped',
              code: 'task_conversation_unbound',
              retryable: false,
            },
          },
        ],
      };
    });

    const first = await service.runOnce('manual', 1);
    const second = await service.runOnce('manual', 1);

    expect(executor.runNext).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      processedTasks: 1,
      handledReplies: 0,
      errors: 0,
      taskResults: [
        {
          taskId: oldTask.id,
          status: AgentTaskStatus.Failed,
          executedSteps: 1,
          handledReply: false,
          actionsExecuted: 0,
        },
      ],
    });
    expect(second).toMatchObject({
      processedTasks: 0,
      handledReplies: 0,
      actionsExecuted: 0,
      errors: 0,
      taskResults: [],
    });
  });

  it('creates and plans a task for a recent social request', async () => {
    const {
      service,
      taskRepo,
      requestRepo,
      connectionRepo,
      messages,
      planner,
      executor,
    } = makeService();
    const request = makeRequest();
    let createdTask: AgentTask | null = null;

    taskRepo.find.mockResolvedValue([]);
    taskRepo.findOne.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.idempotencyKey) return null;
        if (where.id && createdTask) return createdTask;
        return null;
      },
    );
    taskRepo.save.mockImplementation(async (value) => {
      createdTask = makeTask({
        ...value,
        id: 200,
        status: AgentTaskStatus.Pending,
        plan: [
          { id: 'planned_1', toolName: SocialAgentToolName.SearchMatches },
        ],
      });
      return createdTask;
    });
    requestRepo.find.mockResolvedValue([request]);
    connectionRepo.findOne.mockResolvedValue({
      id: 7,
      userId: 1,
      status: ConnectionStatus.Active,
    } as AgentConnection);
    messages.getRecentAgentConversationSignals.mockResolvedValue([]);

    const summary = await service.runOnce('manual', 1);

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentConnectionId: 7,
        taskType: 'social_request_autopilot',
        permissionMode: AgentTaskPermissionMode.LimitedAuto,
        idempotencyKey: 'social_request:55:autopilot',
      }),
    );
    expect(planner.planExistingTask).toHaveBeenCalledWith(createdTask);
    expect(executor.runNext).toHaveBeenCalledWith(200, 1);
    expect(summary.createdTasks).toBe(1);
    expect(summary.processedTasks).toBe(1);
  });

  it('creates a periodic profile enrichment proposal from recent chat signals', async () => {
    const lifeGraph = {
      extractFromChat: jest.fn().mockResolvedValue({
        proposalId: 301,
        proposedFields: [{ fieldKey: 'activityPreference' }],
        confirmationRequired: true,
        missingFields: [],
      }),
    };
    const { service, taskRepo, requestRepo, messages, actionLogs } =
      makeService({ lifeGraph });
    const processedReplyTask = makeTask({
      memory: {
        socialLoop: {
          conversationId: 'conv_1',
          processedMessageIds: ['msg_1'],
        },
      },
    });
    let profileTask: AgentTask | null = null;

    taskRepo.find.mockResolvedValue([]);
    taskRepo.findOne.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 100) return processedReplyTask;
        if (where.taskType === 'profile_enrichment') return null;
        return null;
      },
    );
    taskRepo.save.mockImplementation(async (value) => {
      if (value.taskType === 'profile_enrichment') {
        profileTask = makeTask({
          ...value,
          id: 201,
          taskType: 'profile_enrichment',
          status: value.status,
          memory: value.memory ?? {},
          result: value.result ?? {},
        });
        return profileTask;
      }
      if (profileTask && value.id === profileTask.id) {
        profileTask = { ...profileTask, ...value };
        return profileTask;
      }
      return value;
    });
    requestRepo.find.mockResolvedValue([]);
    messages.getRecentAgentConversationSignals.mockResolvedValue([
      {
        conversationId: 'conv_1',
        messageId: 'msg_1',
        agentConnectionId: 7,
        ownerUserId: 1,
        fromUserId: 2,
        text: '我喜欢周末下午在青岛低压力散步，微信 abc123456',
        metadata: { agentTaskId: 100 },
        createdAt: new Date(),
      },
    ]);

    const summary = await service.runOnce('manual', 1);

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentConnectionId: 7,
        taskType: 'profile_enrichment',
        permissionMode: AgentTaskPermissionMode.Confirm,
        idempotencyKey: expect.stringMatching(
          /^profile_enrichment:1:periodic:/,
        ),
        input: expect.objectContaining({
          source: 'periodic_profile_enrichment',
          conversationId: 'conv_1',
          messageId: 'msg_1',
          sourceMessage: '我喜欢周末下午在青岛低压力散步，微信已隐藏',
        }),
      }),
    );
    expect(lifeGraph.extractFromChat).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        message: '我喜欢周末下午在青岛低压力散步，微信已隐藏',
        taskId: 201,
        messageId: 'msg_1',
        context: expect.objectContaining({
          intent: 'periodic_profile_enrichment',
          source: 'social_agent_autopilot',
        }),
      }),
    );
    expect(profileTask).toMatchObject({
      id: 201,
      taskType: 'profile_enrichment',
      status: AgentTaskStatus.AwaitingFeedback,
      statusReason: 'life_graph_profile_confirmation',
      result: {
        profileUpdateProposal: expect.objectContaining({
          proposalId: 301,
          proposedFieldCount: 1,
          confirmationRequired: true,
        }),
      },
    });
    expect(summary).toMatchObject({
      createdTasks: 1,
      profileEnrichmentTasks: 1,
      profileEnrichmentProposals: 1,
      processedTasks: 0,
      skippedDuplicates: 1,
    });
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'social_agent_autopilot.profile_enrichment',
        status: 'proposal_created',
      }),
    );
  });

  it('does not create duplicate profile enrichment tasks inside the 3 day window', async () => {
    const lifeGraph = { extractFromChat: jest.fn() };
    const { service, taskRepo, requestRepo, messages } = makeService({
      lifeGraph,
    });
    const processedReplyTask = makeTask({
      memory: {
        socialLoop: {
          conversationId: 'conv_1',
          processedMessageIds: ['msg_1'],
        },
      },
    });
    const existingProfileTask = makeTask({
      id: 201,
      ownerUserId: 1,
      taskType: 'profile_enrichment',
      createdAt: new Date(),
    });

    taskRepo.find.mockResolvedValue([]);
    taskRepo.findOne.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 100) return processedReplyTask;
        if (where.taskType === 'profile_enrichment') return existingProfileTask;
        return null;
      },
    );
    requestRepo.find.mockResolvedValue([]);
    messages.getRecentAgentConversationSignals.mockResolvedValue([
      {
        conversationId: 'conv_1',
        messageId: 'msg_1',
        agentConnectionId: 7,
        ownerUserId: 1,
        fromUserId: 2,
        text: '周末下午更方便跑步',
        metadata: { agentTaskId: 100 },
        createdAt: new Date(),
      },
    ]);

    const summary = await service.runOnce('manual', 1);

    expect(lifeGraph.extractFromChat).not.toHaveBeenCalled();
    expect(taskRepo.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'profile_enrichment' }),
    );
    expect(summary.profileEnrichmentTasks).toBe(0);
    expect(summary.profileEnrichmentProposals).toBe(0);
    expect(summary.skippedDuplicates).toBe(2);
  });
});
