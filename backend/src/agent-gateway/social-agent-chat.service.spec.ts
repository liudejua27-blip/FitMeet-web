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
  const taskRepo = {
    create: jest.fn((input) => input),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (input) => {
      if (!input.id) input.id = 101;
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
  };
  const executor = {
    executeToolAction: jest.fn().mockResolvedValue({
      id: 'action_save_candidate_1',
      toolName: SocialAgentToolName.SaveCandidate,
      status: 'succeeded',
      output: { id: 501, status: 'approved' },
    }),
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
  const socialRequests = {
    aiDraft: jest.fn().mockResolvedValue({
      draft: {
        type: SocialRequestType.RunningPartner,
        rawText: '今晚青岛轻松跑步',
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
    }),
    create: jest.fn().mockResolvedValue({ id: 301, status: UserSocialRequestStatus.Draft }),
    update: jest.fn().mockResolvedValue({ id: 301, status: UserSocialRequestStatus.Matching }),
  };
  const matchService = {
    searchNearby: jest.fn(),
    runMatch: jest.fn().mockResolvedValue({
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
    }),
  };

  const service = new SocialAgentChatService(
    taskRepo as never,
    eventRepo as never,
    connectionRepo as never,
    planner as never,
    executor as never,
    socialProfiles as never,
    socialRequests as never,
    matchService as never,
  );

  return {
    service,
    savedEvents,
    taskRepo,
    executor,
    socialRequests,
    matchService,
  };
}

describe('SocialAgentChatService', () => {
  it('creates a private draft request, persists candidates, and returns confirmation actions', async () => {
    const { service, taskRepo, savedEvents, socialRequests, matchService } = makeHarness();

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
    expect(socialRequests.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
        requireUserConfirmation: true,
      }),
      { agent: null },
    );
    expect(matchService.runMatch).toHaveBeenCalledWith(301, 7, { limit: 10 });
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
        expect.objectContaining({ type: 'publish_social_request', socialRequestId: 301 }),
      ]),
    );
    expect(savedEvents.map((event) => event.eventType)).toContain(
      AgentTaskEventType.TaskCreated,
    );
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
      (event) => events.push(event),
    );

    expect(events.map((event) => event.type)).toContain('step');
    expect(events.at(-1)).toMatchObject({ type: 'result' });
    expect(result.taskId).toBe(101);
  });

  it('publishes the staged draft only after explicit user confirmation', async () => {
    const { service, taskRepo, socialRequests } = makeHarness();
    taskRepo.findOne.mockResolvedValue(makeTask());

    const result = await service.publishDraft(7, 101, {
      socialRequestId: 301,
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛轻松跑步',
      title: '今晚青岛轻松跑步',
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
    });

    expect(socialRequests.update).toHaveBeenCalledWith(
      301,
      7,
      expect.objectContaining({
        visibility: SocialRequestVisibility.Public,
        status: UserSocialRequestStatus.Matching,
        requireUserConfirmation: true,
        metadata: expect.objectContaining({
          agentTaskId: 101,
          confirmationSource: 'social_agent_chat',
        }),
      }),
      null,
    );
    expect(result.socialRequest).toMatchObject({ id: 301 });
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
});
