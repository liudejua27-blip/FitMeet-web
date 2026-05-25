import {
  SocialRequestSafety,
  SocialRequestType,
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
    title: 'FitMeet Social Agent chat task',
    goal: 'chat',
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
  const finalResponseCalls: Array<Record<string, unknown>> = [];

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
      createdAt: new Date(savedEvents.length).toISOString(),
      ...input,
    })),
    save: jest.fn(async (input) => {
      savedEvents.push(input);
      return input;
    }),
    find: jest.fn(async () => savedEvents),
  };
  const planner = {
    planExistingTask: jest.fn(async (task: AgentTask) => {
      task.plan = [
        {
          id: 'search',
          action: SocialAgentAction.SearchProfiles,
          status: 'planned',
          toolName: SocialAgentToolName.SearchMatches,
          input: {},
        },
      ];
      return {
        taskId: task.id,
        permissionMode: task.permissionMode,
        allowedActions: [SocialAgentAction.SearchProfiles],
        plan: task.plan,
        source: 'fallback',
        fallbackReason: null,
      };
    }),
    replanTask: jest.fn(),
  };
  const executor = {
    resolveCandidateTargetUser: jest.fn(async (input: Record<string, unknown>) =>
      Number(input.targetUserId ?? input.candidateUserId ?? input.userId ?? 22),
    ),
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
            id: 'tool_create_draft',
            toolName,
            status: 'succeeded',
            input,
            output: {
              draft: {
                type: SocialRequestType.Custom,
                rawText: input.rawText,
                title: '青岛大学同校女生',
                description: '希望认识青岛大学同校、适合公开场所约练的女生。',
                city: '青岛',
                activityType: 'campus',
                interestTags: ['青岛大学', '同校'],
                radiusKm: 3,
                safetyRequirement: SocialRequestSafety.LowRiskOnly,
              },
              card: { title: '青岛大学同校女生' },
              profileUsed: { city: '青岛', school: '青岛大学' },
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.CreateSocialRequest) {
          return {
            id: 'tool_create_request',
            toolName,
            status: 'succeeded',
            input,
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
            id: 'tool_search_real_candidates',
            toolName,
            status: 'succeeded',
            input,
            output: {
              socialRequestId: 301,
              candidates: [
                {
                  userId: 22,
                  candidateUserId: 22,
                  candidateRecordId: 501,
                  nickname: '小林',
                  avatar: '',
                  color: '#168a55',
                  city: '青岛',
                  score: 91,
                  level: 'high',
                  distanceKm: 1.2,
                  commonTags: ['青岛大学', '同校', '公开场所'],
                  reasons: ['同校更容易约在校园公共区域', '城市和常住区域匹配'],
                  risk: { level: 'low', warnings: [] },
                  suggestedMessage:
                    '你好，我也在青岛大学附近，想找同校的人一起轻松运动或散步，可以先在校园公共区域见面。',
                  status: 'suggested',
                },
              ],
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.UpdateProfileFromAgentContext) {
          return {
            id: 'tool_update_profile',
            toolName,
            status: 'succeeded',
            input,
            output: {
              success: true,
              updatedFields: ['gender', 'ageRange', 'city', 'nearbyArea'],
              memoryFields: ['height', 'weight', 'school', 'targetPreference'],
              missingFields: [
                'availableTimes',
                'activityType',
                'privacyBoundary',
              ],
            },
            error: null,
          };
        }
        if (toolName === SocialAgentToolName.SendMessageToCandidate) {
          return {
            id: 'tool_send_message',
            stepId: 'send_message_to_candidate',
            toolName,
            status: 'succeeded',
            input,
            output: {
              id: 'msg-22',
              messageId: 'msg-22',
              conversationId: 'conv-22',
              status: 'sent',
              candidateUserId: 22,
              candidate: { status: 'messaged' },
            },
            error: null,
            startedAt: new Date(0).toISOString(),
            completedAt: new Date(1).toISOString(),
            durationMs: 1,
          };
        }
        return {
          id: `tool_${toolName}`,
          toolName,
          status: 'succeeded',
          input,
          output: { success: true },
          error: null,
        };
      },
    ),
  };
  const approvals = {
    create: jest.fn(async (input: Record<string, unknown>) => ({
      id: 9001,
      type: input.type,
      actionType: input.actionType ?? input.type,
      summary: input.summary,
      riskLevel: input.riskLevel,
      payload: input.payload,
      expiresAt: new Date(Date.now() + 60_000),
    })),
    getPendingForTask: jest.fn().mockResolvedValue([]),
  };
  const finalResponses = {
    generate: jest.fn(async (input: Record<string, unknown>) => {
      finalResponseCalls.push(input);
      const intent = input.intent;
      const toolResults = Array.isArray(input.toolResults)
        ? input.toolResults
        : [];
      if (intent === 'candidate_search') {
        return '我找到了小林。推荐理由是同校、常住区域接近，并且适合先约在校园公共区域；如果你想联系她，我会先给你开场白草稿并等你确认。';
      }
      if (
        intent === 'profile_enrichment_request' &&
        toolResults.length > 0
      ) {
        return '已帮你把刚才的信息写入 AI 画像。已保存到画像字段：gender、ageRange、city、nearbyArea；补充记忆：height、weight、school、targetPreference。还缺 availableTimes、activityType、privacyBoundary。';
      }
      return String(input.fallbackReply ?? '');
    }),
  };
  const service = new SocialAgentChatService(
    taskRepo as never,
    eventRepo as never,
    { findOne: jest.fn().mockResolvedValue(null) } as never,
    planner as never,
    new SocialAgentIntentRouterService({
      get: jest.fn().mockReturnValue(undefined),
    } as never),
    executor as never,
    {
      get: jest.fn().mockResolvedValue({
        city: '青岛',
        interestTags: [],
        availableTimes: [],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      }),
      saveAnswer: jest.fn(),
      update: jest.fn(),
    } as never,
    { createAgentInboxEvent: jest.fn() } as never,
    approvals as never,
    {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    } as never,
    { searchActivity: jest.fn() } as never,
    {
      recordIntent: jest.fn(),
      recordAction: jest.fn(),
      recordQueuedRun: jest.fn(),
      recordApproval: jest.fn(),
      recordActivitySearch: jest.fn(),
      recordError: jest.fn(),
      recordFallback: jest.fn(),
      recordLatency: jest.fn(),
      observeRouteLatency: jest.fn(),
    } as never,
    {
      summarizeTask: jest.fn().mockResolvedValue(null),
      readSnapshot: jest.fn().mockResolvedValue(null),
    } as never,
    {
      retrieve: jest.fn().mockResolvedValue({
        intent: 'casual_chat',
        retrievedKinds: [],
        safetySop: [],
        openingTemplates: [],
        activitySop: [],
        successfulMatchCases: [],
        userMemorySummary: null,
      }),
    } as never,
    { get: jest.fn().mockReturnValue(undefined) } as never,
    undefined,
    undefined,
    finalResponses as never,
  );

  return {
    service,
    executor,
    approvals,
    taskRepo,
    eventRepo,
    savedEvents,
    finalResponses,
    finalResponseCalls,
    getLatestTask: () => latestTask,
  };
}

async function flushAsync(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function expectPublicMessage(text: string) {
  expect(text).toBeTruthy();
  expect(text).not.toMatch(
    /API|DeepSeek HTTP|fetch|JSON|stack|exception|undefined|null|模板|toolCalls|toolResults|DEEPSEEK_API_KEY/i,
  );
}

function toolNames(executor: { executeToolAction: jest.Mock }) {
  return executor.executeToolAction.mock.calls.map((call) => call[1]);
}

function latestAgentState(task: AgentTask | null): string | null {
  const memory = task?.memory as Record<string, unknown> | undefined;
  const taskMemory = memory?.taskMemory as Record<string, unknown> | undefined;
  const state = taskMemory?.currentTask ?? memory?.currentTask;
  if (state && typeof state === 'object' && 'agentState' in state) {
    return String((state as Record<string, unknown>).agentState ?? '');
  }
  if (state && typeof state === 'object' && 'state' in state) {
    return String((state as Record<string, unknown>).state ?? '');
  }
  return null;
}

describe('Social Agent Brain e2e acceptance', () => {
  it('passes the 10-turn intelligent conversation acceptance flow', async () => {
    const {
      service,
      executor,
      approvals,
      taskRepo,
      savedEvents,
      finalResponses,
      finalResponseCalls,
      getLatestTask,
    } = makeHarness();
    const ownerUserId = 7;

    const turn1 = await service.routeMessage(ownerUserId, {
      message: '你好，你能做什么？',
    });
    expect(turn1.intent).toBe('casual_chat');
    expect(turn1.shouldQueueRun).toBe(false);
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(turn1.assistantMessage).toContain('正常聊天');
    expect(turn1.assistantMessage).toContain('完善画像');
    expectPublicMessage(turn1.assistantMessage);

    const taskId = turn1.taskId;
    const turn2 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '人物画像是什么？',
    });
    expect(turn2.intent).toBe('product_help');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(turn2.assistantMessage).toContain('人物画像');
    expectPublicMessage(turn2.assistantMessage);

    const turn3 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '我是先完善人物画像再约练，还是直接发布需求就可以？',
    });
    expect(turn3.intent).toBe('workflow_help');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(turn3.assistantMessage).toContain('两种都可以');
    expect(turn3.assistantMessage).toContain('直接发布需求');
    expect(turn3.assistantMessage).toContain('先完善画像');
    expectPublicMessage(turn3.assistantMessage);

    const turn4 = await service.routeMessage(ownerUserId, {
      taskId,
      message:
        '我是白羊男，18，身高181，体重70kg，在青岛上学，性格开放、INFP，常住在崂山区青岛大学，想找个同校的女生。',
    });
    expect(turn4.intent).toBe('profile_enrichment');
    expect(turn4.shouldSearch).toBe(false);
    expect(toolNames(executor)).not.toContain(SocialAgentToolName.SearchMatches);
    expect(turn4.assistantMessage).toContain('已提取');
    expect(['profile_building', 'profile_detected']).toContain(
      latestAgentState(getLatestTask()),
    );
    expectPublicMessage(turn4.assistantMessage);

    const turn5 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '不是不是，上面是我的人物画像，你帮我完善。',
    });
    expect([
      'correction_or_clarification',
      'profile_enrichment_request',
    ]).toContain(turn5.intent);
    expect(turn5.shouldSearch).toBe(false);
    expect(toolNames(executor)).not.toContain(SocialAgentToolName.SearchMatches);
    expect(turn5.assistantMessage).toContain('刚才那段');
    expect(turn5.assistantMessage).not.toContain('人物画像是 FitMeet');
    expectPublicMessage(turn5.assistantMessage);

    const turn6 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '对，你调用工具去帮我完善 AI 画像。',
    });
    expect(turn6.intent).toBe('profile_enrichment_request');
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      taskId,
      SocialAgentToolName.UpdateProfileFromAgentContext,
      expect.objectContaining({
        extractedProfile: expect.objectContaining({
          zodiac: '白羊座',
          mbti: 'INFP',
          city: '青岛',
          school: '青岛大学',
        }),
      }),
      ownerUserId,
    );
    expect(turn6.assistantMessage).toContain('已保存到画像字段');
    expect(turn6.assistantMessage).toContain('补充记忆');
    expect(turn6.assistantMessage).toContain('还缺');
    expect(['profile_ready', 'profile_saved']).toContain(
      latestAgentState(getLatestTask()),
    );
    expectPublicMessage(turn6.assistantMessage);

    const profileSaveFinalResponse = finalResponseCalls.find(
      (call) => call.intent === 'profile_enrichment_request',
    );
    expect(profileSaveFinalResponse?.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          updatedFields: expect.arrayContaining(['gender', 'city']),
          memoryFields: expect.arrayContaining(['school']),
          missingFields: expect.arrayContaining(['availableTimes']),
        }),
      ]),
    );

    const turn7 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '那我还缺什么？',
    });
    expect(turn7.shouldSearch).toBe(false);
    expect(turn7.assistantMessage).toContain('可约时间');
    expect(turn7.assistantMessage).toContain('具体活动类型');
    expect(turn7.assistantMessage).toContain('边界要求');
    expectPublicMessage(turn7.assistantMessage);

    const turn8 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '现在帮我找青岛大学同校女生。',
    });
    expect(turn8.intent).toBe('social_search');
    expect(turn8.action).toBe('queue_search');
    expect(turn8.shouldQueueRun).toBe(true);
    await flushAsync();
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      taskId,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({ limit: 10 }),
      ownerUserId,
    );
    const run = await service.getRunStatus(
      ownerUserId,
      taskId as number,
      turn8.queuedRun?.runId ?? '',
    );
    expect(run.status).toBe('completed');
    expect(run.result?.candidates).toHaveLength(1);
    expect(run.result?.assistantMessage).toContain('小林');
    expect(['matching', 'candidates_returned', 'showing_candidates']).toContain(
      latestAgentState(getLatestTask()),
    );
    expectPublicMessage(run.result?.assistantMessage ?? '');

    const searchFinalResponse = finalResponseCalls.find(
      (call) => call.intent === 'candidate_search',
    );
    expect(searchFinalResponse?.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: 'search_real_candidates',
          success: true,
          candidateCount: 1,
        }),
      ]),
    );
    expect(finalResponses.generate).toHaveBeenCalled();

    const turn9 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '帮我给第一个人发消息。',
      hasCandidates: true,
    });
    expect(turn9.intent).toBe('action_request');
    expect(turn9.action).toBe('await_confirmation');
    expect(turn9.pendingApproval).toMatchObject({
      id: 9001,
      actionType: 'send_candidate_message',
    });
    expect(approvals.create).toHaveBeenCalledTimes(1);
    expect(toolNames(executor)).not.toContain(
      SocialAgentToolName.SendMessageToCandidate,
    );
    expect(turn9.assistantMessage).toContain('开场白');
    expectPublicMessage(turn9.assistantMessage);

    const turn10 = await service.routeMessage(ownerUserId, {
      taskId,
      message: '确认发送。',
    });
    expect(turn10.intent).toBe('action_request');
    expect(turn10.action).toBe('reply');
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      taskId,
      SocialAgentToolName.SendMessageToCandidate,
      expect.objectContaining({
        targetUserId: 22,
        message: expect.any(String),
      }),
      ownerUserId,
    );
    expect(turn10.assistantMessage).toContain('已确认发送');
    expect(['messaging', 'message_action', 'messaging_candidate']).toContain(
      latestAgentState(getLatestTask()),
    );
    expectPublicMessage(turn10.assistantMessage);

    expect(savedEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        AgentTaskEventType.SocialAgentMessageUser,
        AgentTaskEventType.SocialAgentMessageAssistant,
      ]),
    );
    expect(taskRepo.save).toHaveBeenCalled();
  });
});
