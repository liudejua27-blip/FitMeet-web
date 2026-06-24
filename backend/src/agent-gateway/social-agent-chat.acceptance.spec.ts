import { Logger } from '@nestjs/common';

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
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import { SocialAgentRecommendationResultService } from './social-agent-recommendation-result.service';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import { SocialAgentLifeGraphCardActionService } from './social-agent-life-graph-card-action.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentSessionRestoreService } from './social-agent-session-restore.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentMainAgentTurnEventsService } from './social-agent-main-agent-turn-events.service';
import { SocialAgentMainAgentTurnResultService } from './social-agent-main-agent-turn-result.service';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';
import { SocialAgentRouteCompletionService } from './social-agent-route-completion.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteEntranceService } from './social-agent-route-entrance.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRunRecommendationService } from './social-agent-run-recommendation.service';
import { SocialAgentReplanRunService } from './social-agent-replan-run.service';
import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';
import { SocialAgentRouteAgentLoopRunnerService } from './social-agent-route-agent-loop-runner.service';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentChatTurnCallbacksService } from './social-agent-chat-turn-callbacks.service';
import { SocialAgentChatTurnFacadeService } from './social-agent-chat-turn-facade.service';
import { SocialAgentChatRunFacadeService } from './social-agent-chat-run-facade.service';
import { SocialAgentChatSessionFacadeService } from './social-agent-chat-session-facade.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';

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
    generateAiDraft: jest.fn().mockResolvedValue({
      mode: 'fallback',
      draft: {
        basic: { city: '青岛', nickname: '' },
        tags: { fitnessGoals: [], interestTags: ['跑步'] },
      },
      completion: { percent: 40, missingFields: ['availableTimes'] },
    }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const messages = {
    createAgentMessageEvent: jest
      .fn()
      .mockResolvedValue({ id: 'message center-event-1' }),
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
    reject: jest.fn().mockResolvedValue({
      id: 9001,
      status: 'rejected',
    }),
    approve: jest.fn().mockResolvedValue({
      id: 9001,
      status: 'approved',
    }),
    getPendingForTask: jest.fn().mockResolvedValue([]),
  };
  const publicIntentRepo = {
    publicIntent: {
      id: 'social_request_301',
      userId: 7,
      linkedSocialRequestId: 301,
      mode: 'public',
      title: '青岛大学晚跑步搭子',
      description: '今天晚上在青岛大学附近轻松跑步，先站内沟通。',
      city: '青岛',
      loc: '青岛大学附近',
      requestType: 'running',
      socialGoal: '找 1 人一起跑步',
      interestTags: ['跑步'],
      radiusKm: 3,
      timePreference: '今天晚上',
      locationPreference: '青岛大学附近',
      matchedCount: 0,
      status: 'active',
      metadata: { sourceVersion: 'source-v1' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue({
        id: 'social_request_301',
        userId: 7,
        linkedSocialRequestId: 301,
        mode: 'public',
        title: '青岛大学晚跑步搭子',
        description: '今天晚上在青岛大学附近轻松跑步，先站内沟通。',
        city: '青岛',
        loc: '青岛大学附近',
        requestType: 'running',
        socialGoal: '找 1 人一起跑步',
        interestTags: ['跑步'],
        radiusKm: 3,
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
        matchedCount: 0,
        status: 'active',
        metadata: { sourceVersion: 'source-v1' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    }),
    findOne: jest
      .fn()
      .mockImplementation(({ where }: { where?: { id?: string } }) =>
        Promise.resolve(
          where?.id
            ? {
                id: where.id,
                userId: 7,
                linkedSocialRequestId: 301,
                mode: 'public',
                title: '青岛大学晚跑步搭子',
                description: '今天晚上在青岛大学附近轻松跑步，先站内沟通。',
                city: '青岛',
                loc: '青岛大学附近',
                requestType: 'running',
                socialGoal: '找 1 人一起跑步',
                interestTags: ['跑步'],
                radiusKm: 3,
                timePreference: '今天晚上',
                locationPreference: '青岛大学附近',
                matchedCount: 0,
                status: 'active',
                metadata: { sourceVersion: 'source-v1' },
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              }
            : null,
        ),
      ),
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
    recordDeterministicAction: jest.fn(),
    recordDeterministicRouteReply: jest.fn(),
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
      metrics as never,
      new SocialAgentChatDeepSeekClientService(
        config as never,
        options.modelRouter as never,
      ),
      options.finalResponses as never,
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
  const profileTurns =
    (options.profileTurns as SocialAgentRouteProfileTurnService | undefined) ??
    new SocialAgentRouteProfileTurnService(
      taskRepo as never,
      eventRepo as never,
      socialProfiles as never,
      metrics as never,
      profileEnrichment as never,
      options.lifeGraph as never,
    );
  const sessionAssembler =
    (options.sessionAssembler as AgentSessionAssemblerService | undefined) ??
    new AgentSessionAssemblerService();
  const meetLoop =
    (options.meetLoop as SocialAgentMeetLoopService | undefined) ??
    new SocialAgentMeetLoopService(
      taskRepo as never,
      eventRepo as never,
      approvals as never,
      metrics as never,
      sessionAssembler,
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
      sessionAssembler,
      longTermMemory as never,
    );
  const actionTurns =
    (options.actionTurns as SocialAgentRouteActionTurnService | undefined) ??
    new SocialAgentRouteActionTurnService(
      taskRepo as never,
      candidateActions as never,
      metrics as never,
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
      publicIntentRepo as never,
      undefined,
      {
        enqueue: jest.fn().mockResolvedValue({
          job: {
            id: 9001,
            publicIntentId: 'social_request_301',
            sourceVersion: 'source-v1',
            status: 'queued',
            candidateCount: 0,
          },
          reused: false,
        }),
      } as never,
    );
  const draftSearch =
    (options.draftSearch as SocialAgentDraftSearchService | undefined) ??
    new SocialAgentDraftSearchService(executor as never);
  const recommendationResults =
    (options.recommendationResults as
      | SocialAgentRecommendationResultService
      | undefined) ??
    new SocialAgentRecommendationResultService(
      taskRepo as never,
      eventRepo as never,
      options.finalResponses as never,
      options.lifeGraph as never,
      options.alphaAgent as never,
      options.tonePolicy as never,
      options.agentQuality as never,
    );
  const activitySearch = new SocialAgentActivitySearchService(
    candidatePool as never,
    metrics as never,
    options.finalResponses as never,
  );
  const searchTurns =
    (options.searchTurns as SocialAgentRouteSearchTurnService | undefined) ??
    new SocialAgentRouteSearchTurnService(
      taskRepo as never,
      profileEnrichment as never,
      activitySearch as never,
      {
        evaluateForSocialExecution: jest.fn().mockResolvedValue({
          passed: true,
          missing: [],
          assistantMessage: '',
          profileCompleteness: null,
        }),
      } as never,
    );
  const sessionRestore = new SocialAgentSessionRestoreService(
    taskRepo as never,
    eventRepo as never,
    approvals as never,
    runState,
    sessionAssembler,
  );
  const messageLog = new SocialAgentMessageLogService(
    taskRepo as never,
    eventRepo as never,
  );
  const taskLifecycle =
    (options.taskLifecycle as SocialAgentTaskLifecycleService | undefined) ??
    new SocialAgentTaskLifecycleService(
      taskRepo as never,
      eventRepo as never,
      connectionRepo as never,
    );
  const routeContext =
    (options.routeContext as SocialAgentRouteContextService | undefined) ??
    new SocialAgentRouteContextService(
      metrics as never,
      rag as never,
      options.memoryContext as never,
    );
  const routeDecisions =
    (options.routeDecisions as SocialAgentRouteDecisionService | undefined) ??
    new SocialAgentRouteDecisionService(
      intentRouter,
      socialProfiles as never,
      metrics as never,
      longTermMemory as never,
      profileEnrichment as never,
      messageLog as never,
      taskLifecycle as never,
      routeContext as never,
      options.brain as never,
    );
  const mainAgentTurn =
    (options.mainAgentTurn as SocialAgentMainAgentTurnService | undefined) ??
    new SocialAgentMainAgentTurnService(
      new SocialAgentMainAgentTurnResultService(
        taskRepo as never,
        new SocialAgentMainAgentTurnEventsService(eventRepo as never),
        messageLog as never,
        metrics as never,
        options.tonePolicy as never,
      ) as never,
      options.alphaAgent as never,
    );
  const runRecommendations =
    (options.runRecommendations as
      | SocialAgentRunRecommendationService
      | undefined) ??
    new SocialAgentRunRecommendationService(
      eventRepo as never,
      planner as never,
      socialProfiles as never,
      draftSearch as never,
      recommendationResults as never,
      taskLifecycle as never,
      routeContext as never,
      undefined,
    );
  const replanRuns =
    (options.replanRuns as SocialAgentReplanRunService | undefined) ??
    new SocialAgentReplanRunService(
      eventRepo as never,
      runState as never,
      followUpContext as never,
      replanProgress as never,
      planner as never,
      draftSearch as never,
      recommendationResults as never,
      routeContext as never,
      taskLifecycle as never,
      undefined,
    );
  const routeTurns =
    (options.routeTurns as SocialAgentRouteTurnService | undefined) ??
    new SocialAgentRouteTurnService(
      new SocialAgentRouteCandidateConfirmationService(
        candidateActions as never,
        messageLog as never,
        metrics as never,
      ),
      new SocialAgentRouteCompletionService(
        messageLog as never,
        metrics as never,
      ),
      new SocialAgentRouteEntranceService(
        messageLog as never,
        taskLifecycle as never,
        mainAgentTurn as never,
      ),
      routeDecisions as never,
      new SocialAgentRouteAgentLoopRunnerService(
        taskLifecycle as never,
        routeContext as never,
        new SocialAgentRouteConversationTurnService(
          chatLlm as never,
          profileEnrichment as never,
          routeContext as never,
        ),
        profileTurns as never,
        searchTurns as never,
        actionTurns as never,
        undefined,
        undefined,
      ),
    );
  const queuedRuns =
    (options.queuedRuns as SocialAgentQueuedRunService | undefined) ??
    new SocialAgentQueuedRunService(
      eventRepo as never,
      runState as never,
      taskLifecycle as never,
    );
  const runOrchestrator =
    (options.runOrchestrator as
      | SocialAgentRunOrchestratorService
      | undefined) ??
    new SocialAgentRunOrchestratorService(
      taskLifecycle as never,
      mainAgentTurn as never,
      runRecommendations as never,
      undefined,
      options.fitMeetRuntime as never,
      options.tonePolicy as never,
    );
  const sessionQueries =
    (options.sessionQueries as SocialAgentSessionQueryService | undefined) ??
    new SocialAgentSessionQueryService(
      runState as never,
      sessionRestore as never,
      taskLifecycle as never,
      options.tonePolicy as never,
    );
  const sessionFacade =
    (options.sessionFacade as
      | SocialAgentChatSessionFacadeService
      | undefined) ??
    new SocialAgentChatSessionFacadeService(sessionQueries as never);
  const agentLoop = (options.agentLoop as
    | { execute: jest.Mock }
    | undefined) ?? {
    execute: jest.fn(async (input: Record<string, unknown>) => {
      const runner = input.runner as
        | (() => Promise<Record<string, unknown>>)
        | undefined;
      if (runner) await runner();
      return {
        loop: {
          runId: 'loop:101:acceptance',
          traceId: 'trace:acceptance',
          taskId: 101,
          status: 'completed',
          steps: [],
        },
      };
    }),
  };
  const cardActionRouter =
    (options.cardActionRouter as
      | SocialAgentCardActionRouterService
      | undefined) ??
    new SocialAgentCardActionRouterService(
      candidateActions as never,
      meetLoop as never,
      ((options.lifeGraphCardActions as
        | SocialAgentLifeGraphCardActionService
        | undefined) ??
        new SocialAgentLifeGraphCardActionService(
          taskRepo as never,
          eventRepo as never,
          options.lifeGraph as never,
        )) as never,
      agentLoop as never,
      draftPublication as never,
      metrics as never,
    );
  const replanFacade =
    (options.replanFacade as SocialAgentReplanFacadeService | undefined) ??
    new SocialAgentReplanFacadeService(
      runState as never,
      followUpContext as never,
      taskLifecycle as never,
      replanRuns as never,
      options.tonePolicy as never,
    );
  const initialSearchQueue =
    (options.initialSearchQueue as
      | SocialAgentInitialSearchQueueService
      | undefined) ??
    new SocialAgentInitialSearchQueueService(
      taskRepo as never,
      queuedRuns as never,
      runOrchestrator as never,
      options.tonePolicy as never,
    );
  const turnCallbacks =
    (options.turnCallbacks as
      | SocialAgentChatTurnCallbacksService
      | undefined) ??
    new SocialAgentChatTurnCallbacksService(
      replanFacade as never,
      initialSearchQueue as never,
    );
  const turnFacade =
    (options.turnFacade as SocialAgentChatTurnFacadeService | undefined) ??
    new SocialAgentChatTurnFacadeService(
      routeTurns as never,
      cardActionRouter as never,
      turnCallbacks as never,
    );
  const runFacade =
    (options.runFacade as SocialAgentChatRunFacadeService | undefined) ??
    new SocialAgentChatRunFacadeService(
      queuedRuns as never,
      runOrchestrator as never,
      options.tonePolicy as never,
    );

  const service = new SocialAgentChatService(
    runFacade as never,
    turnFacade as never,
    sessionFacade as never,
    replanFacade as never,
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
    recommendationResults,
    activitySearch,
    taskLifecycle,
    routeContext,
    mainAgentTurn,
    runRecommendations,
    replanRuns,
    routeTurns,
    queuedRuns,
    runOrchestrator,
    sessionQueries,
    sessionFacade,
    cardActionRouter,
    replanFacade,
    initialSearchQueue,
    turnCallbacks,
    turnFacade,
    runFacade,
  };
}

async function flushAsync(times = 8): Promise<void> {
  for (let iteration = 0; iteration < times; iteration += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('SocialAgentChat acceptance flow', () => {
  it('routes casual chat without running tools', async () => {
    const { service, executor, socialProfiles, savedEvents } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '你好，聊聊今天状态',
    });

    expect(result).toMatchObject({
      intent: 'casual_chat',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      shouldSearch: false,
      shouldQueueRun: false,
      cards: [],
      taskId: 101,
    });
    expect(result.assistantMessage).toContain('FitMeet Agent');
    expect(result.assistantMessage).toContain('城市、兴趣、可约时间');
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

  it('downgrades Brain social-search guesses when the user explicitly wants ordinary chat', async () => {
    const brain = {
      planTurn: jest.fn(async ({ route }: Record<string, unknown>) => ({
        route: {
          ...(route as Record<string, unknown>),
          intent: 'social_search',
          replyStrategy: 'search_candidates',
          shouldSearch: true,
          shouldReplan: true,
          shouldUpdateProfile: false,
          shouldExecuteAction: false,
        },
        conversationMode: 'search',
        shouldExecuteTool: true,
        shouldAskClarifyingQuestion: false,
        plannerSource: 'deepseek',
        userIntent: 'social_search',
        reason: 'model guessed social need from the word 交友',
        responseGoal: 'search candidates',
        tools: [{ name: 'search_matches', arguments: { limit: 3 } }],
      })),
    };
    const { service, executor, socialProfiles } = makeHarness({ brain });

    const result = await service.routeMessage(7, {
      message: '我只是想说说最近交友压力，不需要推荐任何人，也不要搜索用户',
    });

    expect(brain.planTurn).toHaveBeenCalled();
    expect(result).toMatchObject({
      intent: 'casual_chat',
      action: 'answer',
      replyStrategy: 'conversational_answer',
      shouldSearch: false,
      shouldQueueRun: false,
      cards: [],
      activityResults: [],
      pendingApproval: null,
    });
    expect(result.assistantMessage).toContain('FitMeet Agent');
    expect(result.assistantMessage).toContain('城市、兴趣、可约时间');
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
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
    expect(result.assistantMessage).toContain('个人信息');
    expect(result.assistantMessage).not.toContain('已记住你的偏好');
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('asks for a candidate context before send or friend actions instead of creating approvals', async () => {
    const { service, approvals, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '帮我发消息给第一个人',
    });

    expect(result).toMatchObject({
      intent: 'candidate_followup',
      shouldSearch: false,
      shouldExecuteAction: false,
      shouldQueueRun: false,
      pendingApproval: null,
      cards: [],
    });
    expect(result.assistantMessage).toContain('还没有可参考的候选人');
    expect(result.assistantMessage).toContain('先告诉我想找谁或找什么活动');
    expect(approvals.create).not.toHaveBeenCalled();
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
    expect(result.assistantMessage).toContain('个人信息');
    expect(result.assistantMessage).toContain('不会直接搜索候选人');
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
  });

  it('executes safe read tools planned by Agent Brain before final reply', async () => {
    const finalResponses = {
      generate: jest.fn(async () => '我看了你的画像，现在还缺可约时间。'),
    };
    const brain = {
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

    expect(result.assistantMessage).toContain('我看了你的画像');
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.GetMyProfile,
      expect.objectContaining({ userId: 7 }),
      7,
    );
    expect(finalResponses.generate).toHaveBeenCalled();
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
    expect(result.assistantMessage).toContain('个人信息');
    expect(result.assistantMessage).toContain('先不直接搜索候选人');
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
    expect(result.assistantMessage).toContain('个人信息');
    expect(result.assistantMessage).toContain('是否保存到你的个人信息');
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.UpdateProfileFromAgentContext,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('confirms a Life Graph proposal through the card action endpoint', async () => {
    const lifeGraph = {
      confirmUpdate: jest.fn().mockResolvedValue({
        proposalId: 77,
        userId: 7,
        taskId: 101,
        messageId: null,
        status: 'confirmed',
        aiSummary: '识别到周末下午、跑步搭子和附近偏好。',
        confirmationRequired: true,
        createdAt: new Date(0).toISOString(),
        confirmedAt: new Date(0).toISOString(),
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
            status: 'confirmed',
            conflict: false,
            oldValue: null,
          },
        ],
      }),
      rejectUpdate: jest.fn(),
    };
    const { service, taskRepo } = makeHarness({ lifeGraph });
    await taskRepo.save(makeTask());

    const result = await service.performCardAction(7, 101, {
      action: 'life_graph.accept_update',
      payload: {
        taskId: 101,
        cardData: { proposalId: 77 },
      },
    });

    expect(lifeGraph.confirmUpdate).toHaveBeenCalledWith(7, {
      proposalId: 77,
    });
    expect(result).toMatchObject({
      intent: 'action_request',
      action: 'reply',
      profileUpdated: true,
      assistantMessage: expect.stringContaining('已保存 1 条 个人信息'),
    });
    const savedTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
    expect(savedTask.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          state: 'profile_saved',
          waitingFor: 'availability_boundaries_or_search_confirmation',
          lastCompletedStep: 'life_graph_profile_confirmed',
        }),
      },
    });
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
    expect(result.assistantMessage).toContain('个人信息');
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
    expect(result.assistantMessage).toContain('保存到个人信息');
    expect(result.assistantMessage).toContain('是否开始匹配');
    expect(result.assistantMessage).toContain('未确认前不会自动推荐候选');
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

  it('routes profile updates into a preview before profile storage', async () => {
    const { service, executor, socialProfiles, savedEvents } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '我喜欢拍照和跑步',
    });

    expect(result).toMatchObject({
      intent: 'profile_update',
      action: 'save_context',
      shouldQueueRun: false,
      savedContext: true,
      profileUpdated: false,
      taskId: 101,
    });
    expect(socialProfiles.generateAiDraft).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        answers: [{ key: 'interestTags', answer: '我喜欢拍照和跑步' }],
        rawText: '我喜欢拍照和跑步',
        source: 'social_agent_profile_turn',
      }),
    );
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalled();
    expect(savedEvents.map((event) => event.eventType)).toContain(
      AgentTaskEventType.SocialAgentContextAppended,
    );
  });

  it('routes safety boundaries into task memory without direct profile persistence', async () => {
    const { service, executor, socialProfiles } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '不要夜间见面，也别自动发消息',
    });

    expect(result).toMatchObject({
      intent: 'safety_or_boundary',
      action: 'save_context',
      shouldQueueRun: false,
      profileUpdated: false,
    });
    expect(socialProfiles.saveAnswer).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('keeps safety-boundary replies successful when context event enum is missing', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { service, eventRepo, metrics } = makeHarness();
    eventRepo.save.mockImplementation((input) => {
      if (input.eventType === AgentTaskEventType.SocialAgentContextAppended) {
        throw new Error(
          'invalid input value for enum agent_task_event_type_enum',
        );
      }
      return Promise.resolve(input);
    });

    try {
      const result = await service.routeMessage(7, {
        message: '不要夜间见面，也别自动发送消息',
      });

      expect(result.intent).toBe('safety_or_boundary');
      expect(result.savedContext).toBe(true);
      expect(result.assistantMessage).toContain('边界');
      expect(metrics.recordError).toHaveBeenCalledWith(
        'context_append_event_failed',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'social_agent.route_profile_turn.event_write_failed',
        ),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('routes no-send candidate searches without creating send-message approvals', async () => {
    const { service, approvals, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '帮我找青岛今晚一起轻松跑步的真实用户，推荐几个人，理想型是同城今晚有空、愿意先轻松运动认识的人，公共场所先站内聊，接受陌生人，不公开发起，先不要自动发消息',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
    });
    expect(result.assistantMessage).toContain('约练卡片');
    expect(approvals.create).not.toHaveBeenCalled();
    await flushAsync();
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SendMessage,
      expect.any(Object),
    );
  });

  it('asks for opportunity details before searching on a vague social request', async () => {
    const { service, approvals, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '我想找个运动搭子',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
      savedContext: true,
    });
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
    expect(result.assistantMessage).toContain('运动或见面场景');
    expect(result.assistantMessage).not.toContain('是否接受陌生人');
    expect(result.assistantMessage).not.toContain('是否公开发起活动');
    expect(approvals.create).not.toHaveBeenCalled();
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('creates an OpportunityCard before candidate search once core search slots are clear', async () => {
    const { service, approvals, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message: '青岛周末下午找个轻松跑步搭子，只在公共场所，先站内聊',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
    });
    expect(result.assistantMessage).toContain('我先帮你整理成一张约练卡片');
    expect(result.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'activity_plan',
          actions: expect.arrayContaining([
            expect.objectContaining({
              label: '发布卡片',
              action: 'publish_to_discover',
              schemaAction: expect.stringMatching(
                /^(publish_to_discover|activity\.confirm_create)$/,
              ),
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              label: '修改卡片',
              requiresConfirmation: false,
            }),
            expect.objectContaining({
              label: '暂不发布',
              schemaAction: 'activity.skip_publish',
              requiresConfirmation: false,
            }),
          ]),
        }),
      ]),
    );
    expect(approvals.create).not.toHaveBeenCalled();
    await flushAsync();
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('turns the tested QDU running-partner request into a publishable draft card, not candidate cards', async () => {
    const { service, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '我想今天晚上在青岛大学附近找一个轻松跑步搭子，找1人，先站内沟通。',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
    });
    expect(result.assistantMessage).toContain('约练卡片');
    expect(result.cards).toEqual([
      expect.objectContaining({
        type: 'activity_plan',
        schemaType: 'social_match.activity',
        status: 'waiting_confirmation',
        data: expect.objectContaining({
          schemaName: 'OpportunityCard',
          opportunityCard: true,
          opportunityTitle: '青岛大学晚跑步搭子',
          activityType: '跑步',
          time: '今天晚上',
          locationName: '青岛大学附近',
          capacityLabel: '找 1 人',
          safetyBoundary: expect.stringContaining('站内沟通'),
          publishStatus: 'draft',
        }),
        actions: [
          expect.objectContaining({
            label: '发布卡片',
            schemaAction: 'publish_to_discover',
          }),
          expect.objectContaining({
            label: '修改卡片',
            schemaAction: 'activity.modify_time',
          }),
          expect.objectContaining({
            label: '暂不发布',
            schemaAction: 'activity.skip_publish',
          }),
        ],
      }),
    ]);
    await flushAsync();
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );

    const publish = await service.routeMessage(7, {
      taskId: result.taskId,
      message: '发布吧',
    });

    expect(publish).toMatchObject({
      intent: 'action_request',
      action: 'await_confirmation',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
      taskId: result.taskId,
    });
    expect(publish.assistantMessage).toContain('发布确认卡');
    expect(publish.cards).toEqual([
      expect.objectContaining({
        type: 'activity_plan',
        schemaType: 'social_match.activity',
        status: 'waiting_confirmation',
        data: expect.objectContaining({
          schemaName: 'OpportunityCard',
          opportunityCard: true,
          activityType: '跑步',
          time: '今天晚上',
          locationName: '青岛大学附近',
          safetyBoundary: expect.stringContaining('站内沟通'),
          publishStatus: 'draft',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: '发布卡片',
            schemaAction: 'publish_to_discover',
            requiresConfirmation: true,
          }),
          expect.objectContaining({
            label: '修改卡片',
            schemaAction: 'activity.modify_time',
            requiresConfirmation: false,
          }),
          expect.objectContaining({
            label: '暂不发布',
            schemaAction: 'activity.skip_publish',
            requiresConfirmation: false,
          }),
        ]),
      }),
    ]);
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );

    const publishCard = publish.cards?.[0];
    const publishAction = publishCard?.actions?.find(
      (action) => action.schemaAction === 'publish_to_discover',
    );
    expect(publishAction).toBeTruthy();

    const published = await service.performCardAction(
      7,
      result.taskId as number,
      {
        action: 'publish_to_discover',
        payload: {
          ...(publishAction?.payload as Record<string, unknown>),
          confirmedPublish: true,
          approved: true,
          confirmed: true,
        },
      },
    );

    expect(published.assistantMessage).toContain('已发布到发现页');
    expect(published.cards).toEqual([
      expect.objectContaining({
        type: 'activity_status',
        schemaType: 'social_match.activity',
        status: 'completed',
        data: expect.objectContaining({
          publicIntentId: 'social_request_301',
          socialRequestId: 301,
          discoverHref: '/discover?publicIntentId=social_request_301',
          publicIntentHref: '/public-intent/social_request_301',
          publishStatus: 'published',
        }),
      }),
    ]);
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      result.taskId,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
      }),
      7,
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('continues the same friendship task from clarification into safe candidate opportunity cards', async () => {
    const { service, approvals, executor } = makeHarness();

    const first = await service.routeMessage(7, {
      message: '我想找个运动搭子',
    });

    expect(first).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      savedContext: true,
    });
    expect(first.assistantMessage).toContain('城市/大致区域');
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );

    const second = await service.routeMessage(7, {
      taskId: first.taskId,
      message:
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，不公开发起活动，先推荐真实用户，不要自动发消息',
    });

    expect(second).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
      taskId: first.taskId,
    });
    expect(second.assistantMessage).toContain('约练卡片');
    expect(approvals.create).not.toHaveBeenCalled();

    await flushAsync();

    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('keeps the friendship main chain at the OpportunityCard confirmation step before recommending candidates', async () => {
    const { service, approvals, executor } = makeHarness();

    const clarification = await service.routeMessage(7, {
      message: '我想找个周末能一起跑步的新朋友',
    });

    expect(clarification).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      savedContext: true,
    });
    expect(clarification.assistantMessage).toContain('城市/大致区域');

    const search = await service.routeMessage(7, {
      taskId: clarification.taskId,
      message:
        '青岛大学附近，周末下午，轻松跑步，只在公共场所，先站内聊，接受陌生人，不公开发起活动，先推荐真实用户，不要自动发消息，理想型是同城周末有空、愿意先轻松运动认识的人',
    });

    expect(search).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
      taskId: clarification.taskId,
    });
    expect(approvals.create).not.toHaveBeenCalled();
    expect(search.assistantMessage).toContain('约练卡片');
    expect(search.cards).toEqual([
      expect.objectContaining({
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        status: 'waiting_confirmation',
        data: expect.objectContaining({
          schemaName: 'OpportunityCard',
          opportunityCard: true,
          activityType: '跑步',
          time: '周末下午',
          locationName: '青岛大学附近',
          publishStatus: 'draft',
        }),
        actions: [
          expect.objectContaining({
            label: '发布卡片',
            schemaAction: 'publish_to_discover',
            requiresConfirmation: true,
          }),
          expect.objectContaining({
            label: '修改卡片',
            schemaAction: 'activity.modify_time',
            requiresConfirmation: false,
          }),
          expect.objectContaining({
            label: '暂不发布',
            schemaAction: 'activity.skip_publish',
            requiresConfirmation: false,
          }),
        ],
      }),
    ]);
    await flushAsync();
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SendMessageToCandidate,
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('routes gendered search requests as searches rather than boundaries', async () => {
    const { service } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '帮我找青岛周末下午附近女生拍照搭子，轻松一点，公共场所先站内聊，接受陌生人，不公开发起',
    });

    expect(result).toMatchObject({
      intent: 'social_search',
      action: 'reply',
      shouldQueueRun: false,
    });
  });

  it('routes real-user profile and public-card searches instead of action confirmation', async () => {
    const { service } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '帮我找青岛周末下午附近的跑步搭子，轻松一点，公共场所先站内聊，接受陌生人，不公开发起，优先真实用户、资料完整或发布过约练卡片的人',
    });

    expect(['social_search', 'candidate_followup']).toContain(result.intent);
    expect(['queue_search', 'queue_replan']).toContain(result.action);
    expect(result.shouldQueueRun).toBe(true);
    expect(['initial', 'follow_up']).toContain(result.runMode);
  });

  it.each([
    [
      '户外搭子',
      '帮我找青岛周末下午户外搭子，轻松一点，公共场所先站内聊，接受陌生人，不公开发起',
      false,
    ],
    [
      '篮球搭子',
      '我想找青岛今晚一起打篮球的搭子，轻松一点，公共场所先站内聊，接受陌生人，不公开发起',
      false,
    ],
    [
      '约练搭子',
      '帮我找青岛周末下午约练搭子，中等强度，公共场所先站内聊，接受陌生人，不公开发起',
      false,
    ],
    [
      '认识新朋友',
      '我想在青岛周末下午轻松认识新朋友，公共场所先站内聊，接受陌生人，不公开发起',
      true,
    ],
  ] as const)(
    'routes complete %s requests through the correct confirmation path after safety context is present',
    async (_label, message, shouldQueue) => {
      const { service, executor } = makeHarness();

      const result = await service.routeMessage(7, { message });

      expect(result).toMatchObject({
        intent: 'social_search',
        action: shouldQueue ? 'queue_search' : 'reply',
        shouldQueueRun: shouldQueue,
        runMode: shouldQueue ? 'initial' : null,
        pendingApproval: null,
      });
      if (shouldQueue) {
        expect(result.assistantMessage).not.toContain('还差');
      }
      expect(executor.executeToolAction).not.toHaveBeenCalledWith(
        expect.any(Number),
        SocialAgentToolName.SendMessageToCandidate,
        expect.any(Object),
        expect.any(Number),
      );
      if (!shouldQueue) {
        expect(executor.executeToolAction).not.toHaveBeenCalledWith(
          expect.any(Number),
          SocialAgentToolName.SearchMatches,
          expect.any(Object),
          expect.any(Number),
        );
      }
    },
  );

  it('routes complete public activity requests to activity search instead of candidate search', async () => {
    const { service, candidatePool, executor } = makeHarness();

    const result = await service.routeMessage(7, {
      message:
        '推荐青岛周末下午可以参加的户外活动，轻松一点，公共场所先站内聊，接受陌生人，可以公开发起活动',
    });

    expect(result).toMatchObject({
      intent: 'activity_search',
      action: 'reply',
      shouldQueueRun: false,
      runMode: null,
      pendingApproval: null,
    });
    expect(candidatePool.searchActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        city: '青岛',
        activityType: '户外',
        timePreference: '周末下午',
        rawText: expect.stringContaining('户外活动'),
        limit: 5,
      }),
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
    );
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
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('时间');
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
    expect(result.assistantMessage).toContain('FitMeet Agent');
    expect(result.assistantMessage).toContain('城市、兴趣、可约时间');
    expect(executor.executeToolAction).not.toHaveBeenCalled();
  });

  it('creates a private draft request and waits for publish confirmation before candidates', async () => {
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
      { signal: null },
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
      expect.any(Object),
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
    expect(result.candidates).toEqual([]);
    expect(result.approvalRequiredActions).toEqual([]);
    expect(result.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'activity_plan',
          actions: expect.arrayContaining([
            expect.objectContaining({
              schemaAction: expect.stringMatching(
                /^(publish_to_discover|activity\.confirm_create)$/,
              ),
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              schemaAction: expect.stringMatching(
                /^(activity\.skip_publish|social_intent\.decline_publish)$/,
              ),
              requiresConfirmation: false,
            }),
          ]),
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
        expect.objectContaining({
          id: 'search',
          status: 'done',
          label: '等待你确认发布约练卡',
        }),
        expect.objectContaining({ id: 'awaiting_confirmation' }),
      ]),
    );
    expect(shortTermMemory?.candidates ?? []).toEqual([]);
  });

  it('keeps a publishable opportunity card when the first social turn asks to publish to Discover', async () => {
    const { service, executor, taskRepo } = makeHarness();
    const goal =
      '我想今天晚上在青岛大学附近散步，帮我生成并发布一张约练卡到发现，只公开模糊地点。';

    const result = await service.run(7, {
      goal,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
        requireUserConfirmation: true,
      }),
      7,
      { signal: null },
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
      expect.any(Object),
    );

    const publishCard = (result.cards ?? []).find(
      (card) => card.type === 'activity_plan',
    );
    const candidateCards = (result.cards ?? []).filter(
      (card) => card.type === 'candidate_card',
    );

    expect(candidateCards).toHaveLength(0);
    expect(publishCard).toMatchObject({
      type: 'activity_plan',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      data: expect.objectContaining({
        schemaName: 'OpportunityCard',
        opportunityCard: true,
        socialRequestId: 301,
        publicIntentId: null,
        discoverHref: null,
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({
          label: '确认发布',
          action: 'publish_to_discover',
          schemaAction: expect.stringMatching(
            /^(publish_to_discover|activity\.confirm_create)$/,
          ),
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          label: '暂不发布',
          action: expect.stringMatching(
            /^(activity\.skip_publish|social_intent\.decline_publish)$/,
          ),
          schemaAction: expect.stringMatching(
            /^(activity\.skip_publish|social_intent\.decline_publish)$/,
          ),
          requiresConfirmation: false,
        }),
      ]),
    });
    const finalSavedTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
    expect(finalSavedTask.memory.shortTerm).toMatchObject({
      currentGoal: goal,
      socialRequestId: 301,
      currentStatus: AgentTaskStatus.AwaitingConfirmation,
    });
  });

  it('does not recall candidates before the opportunity card is published', async () => {
    const alphaAgentSdk = new FitMeetAlphaAgentSdkService({
      get: jest.fn((key: string) =>
        key === 'OPENAI_AGENTS_SDK_ENABLED' ? 'false' : undefined,
      ),
    } as never);
    const alphaAgent = {
      prepareTurn: jest.fn().mockResolvedValue(null),
      buildResultCards: alphaAgentSdk.buildResultCards.bind(alphaAgentSdk),
    };
    const { service, taskRepo, executor } = makeHarness({ alphaAgent });
    const defaultExecute =
      executor.executeToolAction.getMockImplementation() as
        | ((
            taskId: number,
            toolName: SocialAgentToolName,
            input: Record<string, unknown>,
          ) => unknown)
        | undefined;
    const recalledCandidates = [
      { userId: 22, candidateRecordId: 501, nickname: '小林', score: 92 },
      { userId: 23, candidateRecordId: 502, nickname: '阿森', score: 88 },
      { userId: 24, candidateRecordId: 503, nickname: '小周', score: 84 },
      { userId: 25, candidateRecordId: 504, nickname: '第四位', score: 80 },
      { userId: 26, candidateRecordId: 505, nickname: '第五位', score: 76 },
    ];
    executor.executeToolAction.mockImplementation((taskId, toolName, input) => {
      if (toolName === SocialAgentToolName.SearchMatches) {
        return Promise.resolve({
          id: 'action_search_matches_many',
          toolName,
          status: 'succeeded',
          output: {
            socialRequestId: 301,
            candidates: recalledCandidates,
          },
          error: null,
        }) as never;
      }
      return defaultExecute?.(taskId, toolName, input) as never;
    });

    const result = await service.run(7, {
      goal: '帮我找几个今晚在青岛可以一起轻松跑步的人',
      permissionMode: AgentTaskPermissionMode.Confirm,
    });

    const opportunityCards = (result.cards ?? []).filter(
      (card) => card.data?.['opportunityCard'] === true,
    );
    const candidateOpportunityCards = opportunityCards.filter(
      (card) => card.type === 'candidate_card',
    );
    const activityPlanCard = opportunityCards.find(
      (card) => card.type === 'activity_plan',
    );
    const finalSavedTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
    const shortTermMemory = finalSavedTask.memory.shortTerm as {
      candidates?: Array<Record<string, unknown>>;
    };

    expect(result.candidates).toHaveLength(0);
    expect(shortTermMemory.candidates ?? []).toHaveLength(0);
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
      expect.any(Object),
    );
    expect(opportunityCards).toHaveLength(1);
    expect(candidateOpportunityCards).toHaveLength(0);
    expect(activityPlanCard).toMatchObject({
      type: 'activity_plan',
      actions: expect.arrayContaining([
        expect.objectContaining({
          schemaAction: expect.stringMatching(
            /^(publish_to_discover|activity\.confirm_create)$/,
          ),
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          schemaAction: expect.stringMatching(
            /^(activity\.skip_publish|social_intent\.decline_publish)$/,
          ),
          requiresConfirmation: false,
        }),
      ]),
    });
  });

  it('keeps the recommendation to opener to activity flow behind user confirmations', async () => {
    const alphaAgent = {
      prepareTurn: jest.fn().mockResolvedValue(null),
      buildResultCards: jest.fn((input: Record<string, unknown>) => {
        const taskId =
          typeof input.taskId === 'string' || typeof input.taskId === 'number'
            ? input.taskId
            : 101;
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
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            title: '和 小林 低压力认识',
            status: 'waiting_confirmation',
            data: {
              taskId,
              schemaName: 'OpportunityCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'social_match.candidate',
              opportunityCard: true,
              targetUserId: candidate.targetUserId ?? candidate.userId,
              candidateRecordId: candidate.candidateRecordId ?? null,
              socialRequestId: candidate.socialRequestId ?? null,
              opportunity: {
                id: 'opportunity:101:22',
                type: 'person',
                name: '小林',
                title: '和 小林 低压力认识',
                subtitle: '青岛大学附近 · 跑步 · 今晚',
                score: 87,
                summary:
                  '我推荐小林，是因为你们的活动区域、时间和运动偏好都比较接近。',
                area: '青岛大学附近',
                time: '今晚',
                interests: ['跑步', '低压力'],
                reasons: ['青岛大学附近活动', '偏轻松跑步', '接受公共场所'],
                explanationSteps: [
                  '来源：今晚附近跑步需求',
                  '匹配：区域、时间和运动偏好接近',
                  '安全：只建议公共场所和站内沟通',
                ],
                suggestedOpener:
                  candidate.suggestedMessage ?? '这周末方便一起慢跑一圈吗？',
                recommendedNextAction: '先生成开场白，确认后再发送。',
                safetyBoundary: '第一次建议选择校园操场或公共公园。',
                confirmedContext: ['青岛大学附近', '今晚', '跑步', '公共场所'],
              },
              confirmedContext: ['青岛大学附近', '今晚', '跑步', '公共场所'],
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
                action: 'candidate.generate_opener',
                schemaAction: 'candidate.generate_opener',
                requiresConfirmation: false,
                payload: { taskId, candidate },
              },
              {
                id: 'connect_candidate',
                label: '确认后邀请Ta',
                action: 'candidate.connect',
                schemaAction: 'candidate.connect',
                requiresConfirmation: true,
                payload: {
                  taskId,
                  targetUserId: candidate.targetUserId ?? candidate.userId,
                  candidateRecordId: candidate.candidateRecordId ?? null,
                  socialRequestId: candidate.socialRequestId ?? null,
                  candidate,
                },
              },
              {
                id: 'create_activity',
                label: '创建约练',
                action: 'create_activity',
                requiresConfirmation: true,
                payload: { taskId, candidate },
              },
            ],
          },
          {
            id: 'activity_plan:101',
            type: 'activity_plan',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.activity',
            title: '约练计划待确认',
            status: 'waiting_confirmation',
            data: {
              taskId: input.taskId,
              schemaName: 'OpportunityCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'social_match.activity',
              opportunityCard: true,
              socialRequestId: draft.socialRequestId ?? null,
              opportunity: {
                id: 'opportunity:101:activity',
                type: 'activity',
                title: '跑步约练',
                subtitle: '青岛大学附近 · 周六 15:00',
                summary: '公共场所低压力约练，确认后再创建。',
                city: '青岛',
                location: '青岛大学附近公共场所',
                time: '周六 15:00',
                activityType: '跑步',
                participants: '你和小林',
                safetyBadges: ['公共场所', '不共享精确位置', '确认后创建'],
                recommendedNextAction: '确认后我再创建约练，不会自动公开发布。',
                safetyBoundary: '不共享精确位置，第一次只选公共场所。',
                publishPolicy:
                  '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
                approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
                meetLoopNextStep:
                  '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
                checkinReminder: '活动开始前我会提醒你确认是否到达。',
                reviewPrompt: '活动结束后我会请你做一次简短评价。',
                lifeGraphUpdatePreview:
                  '完成后会更新你对周末轻运动社交的偏好。',
                trustScoreUpdatePreview:
                  '完成和评价会写入 trust score，用于后续推荐可信度。',
                activityProtocol: [
                  {
                    key: 'public_place',
                    label: '公共场所',
                    detail: '优先选择公共场所，不共享精确位置。',
                  },
                  {
                    key: 'approval',
                    label: '创建确认',
                    detail: '创建约练前必须由你确认时间、地点和参与边界。',
                  },
                  {
                    key: 'publish',
                    label: '公开边界',
                    detail:
                      '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
                  },
                  {
                    key: 'recovery',
                    label: '连续推进',
                    detail: '确认后进入等待回复、确认到达、评价和画像回写。',
                  },
                ],
                confirmedContext: ['青岛', '周六 15:00', '跑步', '公共场所'],
              },
              confirmedContext: ['青岛', '周六 15:00', '跑步', '公共场所'],
              time: '周六 15:00',
              locationName: '青岛大学附近公共场所',
              participants: '你和小林',
              publicPlaceOnly: true,
              noPreciseLocation: true,
              publishPolicy:
                '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
              approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
              meetLoopNextStep:
                '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
              activityProtocol: [
                {
                  key: 'public_place',
                  label: '公共场所',
                  detail: '优先选择公共场所，不共享精确位置。',
                },
                {
                  key: 'approval',
                  label: '创建确认',
                  detail: '创建约练前必须由你确认时间、地点和参与边界。',
                },
                {
                  key: 'publish',
                  label: '公开边界',
                  detail:
                    '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
                },
                {
                  key: 'recovery',
                  label: '连续推进',
                  detail: '确认后进入等待回复、确认到达、评价和画像回写。',
                },
              ],
              checkinReminder: '活动开始前我会提醒你确认是否到达。',
              reviewPrompt: '活动结束后我会请你做一次简短评价。',
              safetyBoundary: '不共享精确位置，第一次只选公共场所。',
              lifeGraphUpdatePreview: '完成后会更新你对周末轻运动社交的偏好。',
              trustScoreUpdatePreview:
                '完成和评价会写入 trust score，用于后续推荐可信度。',
            },
            actions: [
              {
                id: 'confirm_create_activity',
                label: '确认创建',
                action: 'activity.confirm_create',
                schemaAction: 'activity.confirm_create',
                requiresConfirmation: true,
                payload: {
                  taskId,
                  draft,
                  candidate,
                  actionType: 'create_activity',
                  sideEffect: 'create_activity',
                  approvalRequired: true,
                  checkpointRequired: true,
                  resumeMode: 'resume_after_approval',
                  idempotencyKey: `activity-create:${taskId}`,
                },
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

    expect(recommendation.candidates).toHaveLength(0);
    expect(lifeGraph.getUnifiedMatchSignals).toHaveBeenCalledWith(7);
    expect(alphaAgent.buildResultCards).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        candidates: [],
      }),
    );
    expect(recommendation.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'activity_plan',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.activity',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            schemaType: 'social_match.activity',
            opportunityCard: true,
            opportunity: expect.objectContaining({
              type: 'activity',
              title: '跑步约练',
              recommendedNextAction: expect.stringContaining('确认后'),
              publishPolicy: expect.stringContaining('默认不公开发布'),
              approvalPolicy: expect.stringContaining('必须由你确认'),
              meetLoopNextStep: expect.stringContaining('等待回复'),
              checkinReminder: expect.stringContaining('确认是否到达'),
              reviewPrompt: expect.stringContaining('评价'),
              lifeGraphUpdatePreview: expect.stringContaining('更新'),
              trustScoreUpdatePreview: expect.stringContaining('trust score'),
              activityProtocol: expect.arrayContaining([
                expect.objectContaining({
                  key: 'public_place',
                  label: '公共场所',
                }),
                expect.objectContaining({
                  key: 'approval',
                  label: '创建确认',
                  detail: expect.stringContaining('必须由你确认'),
                }),
                expect.objectContaining({
                  key: 'publish',
                  label: '公开边界',
                  detail: expect.stringContaining('默认不公开发布'),
                }),
                expect.objectContaining({
                  key: 'recovery',
                  label: '连续推进',
                }),
              ]),
              confirmedContext: expect.arrayContaining([
                '青岛',
                '周六 15:00',
                '跑步',
                '公共场所',
              ]),
            }),
            publicPlaceOnly: true,
            noPreciseLocation: true,
            publishPolicy: expect.stringContaining('默认不公开发布'),
            approvalPolicy: expect.stringContaining('必须由你确认'),
            meetLoopNextStep: expect.stringContaining('等待回复'),
            activityProtocol: expect.arrayContaining([
              expect.objectContaining({ key: 'approval' }),
              expect.objectContaining({ key: 'publish' }),
              expect.objectContaining({ key: 'recovery' }),
            ]),
            checkinReminder: expect.stringContaining('确认是否到达'),
            reviewPrompt: expect.stringContaining('评价'),
            lifeGraphUpdatePreview: expect.stringContaining('更新'),
            trustScoreUpdatePreview: expect.stringContaining('trust score'),
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              action: 'activity.confirm_create',
              schemaAction: 'activity.confirm_create',
              requiresConfirmation: true,
              payload: expect.objectContaining({
                actionType: 'create_activity',
                sideEffect: 'create_activity',
                approvalRequired: true,
                checkpointRequired: true,
                resumeMode: 'resume_after_approval',
                idempotencyKey: 'activity-create:101',
              }),
            }),
          ]),
        }),
      ]),
    );
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
    expect(result.cards).toEqual([]);
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

  it('queues a follow-up replan and refreshes the draft while waiting for publish confirmation', async () => {
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
      { signal: null },
    );
    expect(executor.executeToolAction).not.toHaveBeenCalledWith(
      expect.any(Number),
      SocialAgentToolName.SearchMatches,
      expect.any(Object),
      expect.any(Number),
      expect.any(Object),
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
    expect(result.result?.candidates).toHaveLength(0);
  });

  describe('real conversation acceptance suite', () => {
    it('passes the fixed A-J multi-turn social agent conversation', async () => {
      const { service, executor, taskRepo } = makeHarness();
      const toolCallsBeforeChat = executor.executeToolAction.mock.calls.length;

      const a = await service.routeMessage(7, {
        message: '你好，你能做什么？',
      });
      expect(a).toMatchObject({
        intent: 'casual_chat',
        shouldSearch: false,
        shouldQueueRun: false,
        cards: [],
      });
      expect(a.shouldQueueRun).toBe(false);
      expect(executor.executeToolAction).toHaveBeenCalledTimes(
        toolCallsBeforeChat,
      );
      expect(a.assistantMessage).toContain('正常聊天');
      expect(a.assistantMessage).toContain('明确说要找人');
      expect(a.assistantMessage).toContain('发送消息');

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
      expect(b.assistantMessage).toContain('个人信息');
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
      expect(c.assistantMessage).toContain('先完善个人信息');
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
      expect(d.assistantMessage).toContain('个人信息');
      expect(d.assistantMessage).toContain('先不直接搜索候选人');
      expect(executor.executeToolAction).toHaveBeenCalledTimes(
        toolCallsBeforeChat,
      );

      const e = await service.routeMessage(7, {
        message: '不是不是，上面是我的人物画像，你帮我完善。',
        taskId: a.taskId,
      });
      expect(e.intent).toBe('correction_or_clarification');
      expect(e.shouldSearch).toBe(false);
      expect(e.assistantMessage).toContain('个人信息');
      expect(e.assistantMessage).toContain('我先不搜索');
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
      expect(f.assistantMessage).toContain('保存到个人信息');
      expect(f.assistantMessage).toContain('是否开始匹配');
      expect(f.assistantMessage).toContain('未确认前不会自动推荐候选');

      const g = await service.routeMessage(7, {
        message: '那我还缺什么？',
        taskId: a.taskId,
      });
      expect(g.shouldSearch).toBe(false);
      expect(g.shouldQueueRun).toBe(false);
      expect(g.assistantMessage).toContain('个人信息');
      expect(g.assistantMessage).toContain('不会直接搜索候选人');

      const h = await service.routeMessage(7, {
        message:
          '现在帮我找青岛大学同校女生，周末下午轻松跑步或散步，公共场所先站内聊，接受陌生人，不公开发起。',
        taskId: a.taskId,
      });
      expect(h).toMatchObject({
        intent: 'social_search',
        action: 'reply',
        shouldQueueRun: false,
        runMode: null,
        pendingApproval: null,
      });
      expect(h.assistantMessage).toContain('约练卡片');
      expect(h.cards).toEqual([
        expect.objectContaining({
          schemaType: 'social_match.activity',
          status: 'waiting_confirmation',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            opportunityCard: true,
            activityType: '跑步',
            time: '周末下午',
            locationName: '青岛大学',
            publishStatus: 'draft',
          }),
          actions: [
            expect.objectContaining({
              schemaAction: 'publish_to_discover',
              requiresConfirmation: true,
            }),
            expect.objectContaining({
              schemaAction: 'activity.modify_time',
              requiresConfirmation: false,
            }),
            expect.objectContaining({
              schemaAction: 'activity.skip_publish',
              requiresConfirmation: false,
            }),
          ],
        }),
      ]);
      await flushAsync();
      expect(executor.executeToolAction).not.toHaveBeenCalledWith(
        expect.any(Number),
        SocialAgentToolName.SearchMatches,
        expect.any(Object),
        expect.any(Number),
      );
      expect(executor.executeToolAction).not.toHaveBeenCalledWith(
        expect.any(Number),
        SocialAgentToolName.SendMessageToCandidate,
        expect.any(Object),
        expect.any(Number),
      );

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

    function readTaskSlots(taskRepo: {
      save: jest.Mock;
    }): Record<string, { value?: string; state?: string }> {
      const lastCall = taskRepo.save.mock.calls.at(-1);
      const saved = lastCall?.[0] as {
        memory?: {
          taskSlots?: Record<string, { value?: string; state?: string }>;
        };
      };
      return saved?.memory?.taskSlots ?? {};
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
      expect(memory.lastUserMessages.length).toBeLessThanOrEqual(40);
    });

    it('keeps twenty turns of ordinary chat without triggering social tools', async () => {
      const { service, taskRepo, executor } = makeHarness();

      for (let index = 1; index <= 25; index += 1) {
        await service.routeMessage(7, {
          message: `普通聊天第 ${index} 轮：请继续解释产品功能，不要执行任何社交动作。`,
        });
      }

      const memory = readTaskMemory(taskRepo) as {
        lastUserMessages: Array<{ text: string; intent: string }>;
      };
      expect(memory.lastUserMessages).toHaveLength(25);
      expect(memory.lastUserMessages[0]?.text).toContain('第 1 轮');
      expect(memory.lastUserMessages.at(-1)?.text).toContain('第 25 轮');
      expect(
        memory.lastUserMessages.every((turn) => turn.intent === 'casual_chat'),
      ).toBe(true);
      expect(executor.executeToolAction).not.toHaveBeenCalled();
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

    it('continues from completed social slots without repeating time, activity, or location questions', async () => {
      const { service, taskRepo, executor } = makeHarness();

      const clarification = await service.routeMessage(7, {
        message: '我想找个运动搭子',
      });

      expect(clarification).toMatchObject({
        intent: 'social_search',
        action: 'reply',
        shouldQueueRun: false,
        savedContext: true,
      });
      expect(clarification.assistantMessage).toContain('城市/大致区域');

      const filled = await service.routeMessage(7, {
        taskId: clarification.taskId,
        message: '今天晚上在青岛大学附近，找个女舞蹈生散步，公共场所先站内聊。',
      });

      expect(filled).toMatchObject({
        intent: 'social_search',
        action: 'reply',
        shouldQueueRun: false,
        runMode: null,
        taskId: clarification.taskId,
      });
      expect(filled.assistantMessage).toContain('约练卡片');
      expect(filled.cards).toEqual([
        expect.objectContaining({
          schemaType: 'social_match.activity',
          data: expect.objectContaining({
            schemaName: 'OpportunityCard',
            opportunityCard: true,
            time: '今天晚上',
            locationName: '青岛大学附近',
            activityType: '散步',
          }),
        }),
      ]);
      expect(filled.assistantMessage).not.toMatch(
        /还差|只差|今晚.*还是.*周末|周末.*还是.*今晚|你更想.*今晚|你更想.*周末/,
      );

      const slotsAfterFill = readTaskSlots(taskRepo);
      expect(slotsAfterFill).toMatchObject({
        time_window: expect.objectContaining({
          value: expect.stringContaining('今天晚上'),
        }),
        location_text: expect.objectContaining({
          value: expect.stringContaining('青岛大学'),
        }),
        activity: expect.objectContaining({
          value: expect.stringContaining('散步'),
        }),
        candidate_preference: expect.objectContaining({
          value: expect.stringContaining('舞蹈'),
        }),
      });

      await flushAsync();
      expect(executor.executeToolAction).not.toHaveBeenCalledWith(
        expect.any(Number),
        SocialAgentToolName.SearchMatches,
        expect.any(Object),
        expect.any(Number),
      );
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
        actionType: 'send_invite',
      });
    });

    it('returns a real Discover publish confirmation card for a natural-language publish follow-up', async () => {
      const { service, taskRepo, executor } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          goal: '今晚青岛大学附近散步约练',
          memory: {
            taskSlots: {
              activity: { value: '散步', state: 'completed' },
              time_window: { value: '今天晚上', state: 'completed' },
              location_text: { value: '青岛大学附近', state: 'completed' },
              safety_boundary: {
                value: '首次见面只在公共场所，先站内沟通',
                state: 'completed',
              },
            },
            taskMemory: {
              activeEntities: {
                city: '青岛',
                activityType: '散步',
                targetGender: '',
                timePreference: '今天晚上',
                locationPreference: '青岛大学附近',
              },
            },
          },
        }),
      );

      const result = await service.handleMessage(7, {
        message: '那你帮我发布到发现',
        taskId: 101,
      });

      const publishCard = (result.cards ?? []).find(
        (card) => card.type === 'activity_plan',
      );
      expect(publishCard).toMatchObject({
        type: 'activity_plan',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        status: 'waiting_confirmation',
        data: expect.objectContaining({
          taskId: 101,
          schemaName: 'OpportunityCard',
          opportunityCard: true,
          activityType: '散步',
          time: '今天晚上',
          locationName: '青岛大学附近',
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            schemaAction: 'publish_to_discover',
            requiresConfirmation: true,
            payload: expect.objectContaining({
              taskId: 101,
              socialRequestDraft: expect.objectContaining({
                activityType: '散步',
                timePreference: '今天晚上',
                locationName: '青岛大学附近',
                requireUserConfirmation: true,
              }),
            }),
          }),
        ]),
      });
      expect(executor.executeToolAction).not.toHaveBeenCalledWith(
        101,
        SocialAgentToolName.CreateSocialRequest,
        expect.objectContaining({ mode: 'publish' }),
        7,
        expect.anything(),
      );
    });

    it('creates an opener draft from a canonical candidate.generate_opener card action without approval', async () => {
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

      expect(approvals.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        cards: [
          expect.objectContaining({
            type: 'candidate_card',
            schemaVersion: 'fitmeet.tool-ui.v1',
            schemaType: 'social_match.candidate',
            title: '小林 的开场白草稿',
            body: '你好，这周末要不要在公共场所慢跑一圈？',
            data: expect.objectContaining({
              schemaName: 'OpportunityCard',
              schemaVersion: 'fitmeet.tool-ui.v1',
              schemaType: 'social_match.candidate',
              openerDraftReady: true,
              targetUserId: 22,
              suggestedOpener: '你好，这周末要不要在公共场所慢跑一圈？',
            }),
            actions: [
              expect.objectContaining({
                schemaAction: 'opener.confirm_send',
                requiresConfirmation: true,
                payload: expect.objectContaining({
                  approvalRequired: true,
                  checkpointRequired: true,
                  resumeMode: 'resume_after_approval',
                }),
              }),
              expect.objectContaining({
                schemaAction: 'opener.regenerate',
              }),
              expect.objectContaining({
                schemaAction: 'opener.reject',
                requiresConfirmation: false,
              }),
            ],
          }),
        ],
      });
      const memory = readTaskMemory(taskRepo) as {
        pendingActions: Array<Record<string, unknown>>;
        currentTask: Record<string, unknown>;
      };
      expect(memory.pendingActions).toEqual([]);
      expect(memory.currentTask).toMatchObject({
        waitingFor: 'message_confirmation',
        lastCompletedStep: 'opener_draft_created',
      });
    });

    it('regenerates and rejects opener draft through the card action AgentLoop without sending', async () => {
      const { service, taskRepo, approvals, executor } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  nickname: '小林',
                  candidateRecordId: 501,
                  socialRequestId: 301,
                  interests: ['跑步'],
                  timePreference: '周末下午',
                  city: '青岛',
                  suggestedMessage: '你好，这周末要不要在公共场所慢跑一圈？',
                },
              ],
            },
          },
        }),
      );

      const draft = await service.performCardAction(7, 101, {
        action: 'candidate.generate_opener',
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidate: {
            userId: 22,
            nickname: '小林',
            candidateRecordId: 501,
            socialRequestId: 301,
            interests: ['跑步'],
            timePreference: '周末下午',
            city: '青岛',
            suggestedOpener: '你好，这周末要不要在公共场所慢跑一圈？',
          },
        },
      });
      const firstMessage = String(draft.cards?.[0]?.body ?? '');

      const regenerated = await service.performCardAction(7, 101, {
        action: 'opener.regenerate',
        payload: {
          taskId: 101,
          approvalId: 9001,
          targetUserId: 22,
          message: firstMessage,
        },
      });

      expect(regenerated).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        assistantMessage: expect.stringContaining('只有你点发送邀请并确认后'),
        cards: [
          expect.objectContaining({
            schemaType: 'social_match.candidate',
            body: expect.stringContaining('站内确认时间和公共地点'),
            actions: expect.arrayContaining([
              expect.objectContaining({
                schemaAction: 'opener.confirm_send',
                requiresConfirmation: true,
              }),
              expect.objectContaining({
                schemaAction: 'opener.regenerate',
              }),
              expect.objectContaining({
                schemaAction: 'opener.reject',
                requiresConfirmation: false,
              }),
            ]),
          }),
        ],
      });
      expect(regenerated.cards?.[0]?.body).not.toBe(firstMessage);
      expect(approvals.reject).not.toHaveBeenCalled();
      expect(approvals.create).not.toHaveBeenCalled();
      expect(executor.executeToolAction).not.toHaveBeenCalled();

      const rejected = await service.performCardAction(7, 101, {
        action: 'opener.reject',
        payload: {
          taskId: 101,
          approvalId: 9001,
        },
      });

      expect(rejected).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        cards: [],
        assistantMessage: expect.stringContaining('不会发送任何消息'),
      });
      expect(rejected.assistantMessage).toContain('不会发送任何消息');
      expect(executor.executeToolAction).not.toHaveBeenCalled();
      const memory = readTaskMemory(taskRepo) as {
        pendingActions: Array<Record<string, unknown>>;
        currentTask: Record<string, unknown>;
      };
      expect(memory.pendingActions).toEqual([]);
      expect(memory.currentTask).toMatchObject({
        waitingFor: 'user_next_instruction',
        lastCompletedStep: 'message_send_reject_noop',
      });
    });

    it('confirms an opener approval through the chat card-action entrypoint and resumes the saved send step', async () => {
      const { service, taskRepo, executor, approvals } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          result: {
            cardActionDraft: {
              approvalId: 9001,
              targetUserId: 22,
              candidate: {
                userId: 22,
                candidateUserId: 22,
                candidateRecordId: 501,
                socialRequestId: 301,
                displayName: '小林',
              },
              message: '今晚先在青岛大学操场轻松跑一段吗？',
            },
          },
          memory: {
            taskMemory: {
              pendingActions: [
                {
                  id: 9001,
                  actionType: 'send_invite',
                  type: 'send_message',
                  summary: '发送开场白',
                  riskLevel: 'medium',
                  at: '2026-06-06T00:00:00.000Z',
                },
              ],
              candidateState: {
                recommendedIds: [],
                rejectedIds: [],
                savedIds: [],
                messagedIds: [],
              },
              activityState: { recommendedIds: [], rejectedIds: [] },
              activeEntities: {},
              stableProfileFacts: {},
              boundaries: [],
              preferences: [],
              misunderstandings: [],
              lastUserMessages: [],
              recentActions: [],
              updatedAt: '2026-06-06T00:00:00.000Z',
            },
          },
        }),
      );

      const result = await service.performCardAction(7, 101, {
        action: 'opener.confirm_send',
        idempotencyKey: 'opener-confirm-chat-entrypoint-1',
        payload: {
          taskId: 101,
          approvalId: 9001,
        },
      });

      expect(approvals.approve).toHaveBeenCalledWith(9001, 7);
      expect(executor.executeToolAction).toHaveBeenCalledTimes(1);
      expect(executor.executeToolAction).toHaveBeenCalledWith(
        101,
        SocialAgentToolName.SendMessageToCandidate,
        expect.objectContaining({
          candidateUserId: 22,
          targetUserId: 22,
          message: '今晚先在青岛大学操场轻松跑一段吗？',
          candidateRecordId: 501,
          socialRequestId: 301,
          idempotencyKey: 'opener-confirm-chat-entrypoint-1',
          metadata: expect.objectContaining({
            confirmationSource: 'agent_card_action',
            pendingApprovalId: 9001,
            schemaAction: 'opener.confirm_send',
          }),
        }),
        7,
        { signal: null },
      );
      expect(approvals.approve.mock.invocationCallOrder[0]).toBeLessThan(
        executor.executeToolAction.mock.invocationCallOrder[0],
      );
      expect(result).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        cards: [
          expect.objectContaining({
            schemaType: 'meet_loop.timeline',
            data: expect.objectContaining({
              candidateUserId: 22,
              loopStage: 'message_sent',
              messagePreview: '今晚先在青岛大学操场轻松跑一段吗？',
            }),
          }),
        ],
        assistantMessage: expect.stringContaining('已确认发送给小林'),
      });
      const memory = readTaskMemory(taskRepo) as {
        pendingActions: Array<Record<string, unknown>>;
        candidateState: Record<string, unknown>;
        currentTask: Record<string, unknown>;
      };
      expect(memory.pendingActions).toEqual([]);
      expect(memory.candidateState).toMatchObject({
        messagedIds: [22],
      });
      expect(memory.currentTask).toMatchObject({
        waitingFor: 'candidate_reply',
        lastCompletedStep: 'message_sent',
      });
    });

    it('handles candidate OpportunityCard actions through the chat card-action entrypoint', async () => {
      const { service, taskRepo, executor, approvals, messages } =
        makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  candidateUserId: 22,
                  candidateRecordId: 501,
                  socialRequestId: 301,
                  displayName: '小林',
                  reasons: ['都偏好晚上跑步'],
                  risk: { warnings: ['首次见面建议选择公共操场'] },
                  suggestedMessage: '周末下午如果方便，可以先轻松跑一圈。',
                },
              ],
            },
          },
        }),
      );

      const skip = await service.performCardAction(7, 101, {
        action: 'candidate.skip',
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
        },
      });

      expect(skip).toMatchObject({
        action: 'reply',
        cards: [],
        assistantMessage: expect.stringContaining('已跳过 小林'),
      });
      expect(executor.executeToolAction).not.toHaveBeenCalled();
      type CandidateActionMemory = {
        candidateState: Record<string, unknown>;
        currentTask: Record<string, unknown>;
        pendingActions: Array<Record<string, unknown>>;
      };
      let memory = readTaskMemory(taskRepo) as CandidateActionMemory;
      expect(memory.candidateState).toMatchObject({
        rejectedIds: [22],
      });

      const moreLikeThis = await service.performCardAction(7, 101, {
        action: 'candidate.more_like_this',
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            displayName: '小林',
            reasons: ['都偏好晚上跑步'],
          },
        },
      });

      expect(moreLikeThis).toMatchObject({
        action: 'reply',
        assistantMessage: expect.stringContaining('继续找更多类似机会'),
      });
      memory = readTaskMemory(taskRepo) as CandidateActionMemory;
      expect(memory.currentTask).toMatchObject({
        objective: 'candidate_refinement',
        shouldSearchNow: true,
        waitingFor: 'more_candidates',
      });

      const like = await service.performCardAction(7, 101, {
        action: 'candidate.like',
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
          },
        },
      });

      expect(like).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        cards: [],
        assistantMessage: expect.stringContaining('已收藏 小林'),
      });
      expect(approvals.create).not.toHaveBeenCalled();
      expect(
        executor.executeToolAction.mock.calls.filter(
          ([, toolName]) => toolName === SocialAgentToolName.SaveCandidate,
        ),
      ).toHaveLength(1);
      expect(
        executor.executeToolAction.mock.calls.some(([, toolName]) =>
          [
            SocialAgentToolName.SendMessage,
            SocialAgentToolName.SendMessageToCandidate,
            SocialAgentToolName.AddFriend,
          ].includes(toolName),
        ),
      ).toBe(false);
      memory = readTaskMemory(taskRepo) as CandidateActionMemory;
      expect(memory.candidateState).toMatchObject({
        savedIds: [22],
      });
      expect(memory.pendingActions).toEqual([]);
      executor.executeToolAction.mockClear();

      const opener = await service.performCardAction(7, 101, {
        action: 'candidate.generate_opener',
        payload: {
          taskId: 101,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            displayName: '小林',
            suggestedOpener: '周末下午如果方便，可以先轻松跑一圈。',
          },
        },
      });

      expect(opener).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        cards: [
          expect.objectContaining({
            type: 'candidate_card',
            schemaType: 'social_match.candidate',
            title: '小林 的开场白草稿',
            body: expect.stringContaining('轻松跑一圈'),
            actions: expect.arrayContaining([
              expect.objectContaining({ schemaAction: 'opener.confirm_send' }),
              expect.objectContaining({ schemaAction: 'opener.regenerate' }),
              expect.objectContaining({ schemaAction: 'opener.reject' }),
            ]),
          }),
        ],
      });
      expect(approvals.create).not.toHaveBeenCalled();
      expect(executor.executeToolAction).not.toHaveBeenCalled();
      expect(messages.createAgentMessageEvent).not.toHaveBeenCalled();
      memory = readTaskMemory(taskRepo) as CandidateActionMemory;
      expect(memory.pendingActions).toEqual([]);

      const confirmOpenerAction = opener.cards?.[0]?.actions?.find(
        (action) => action.schemaAction === 'opener.confirm_send',
      );
      expect(confirmOpenerAction).toEqual(
        expect.objectContaining({
          requiresConfirmation: true,
          payload: expect.objectContaining({
            targetUserId: 22,
            approvalRequired: true,
            checkpointRequired: true,
          }),
        }),
      );
      const openerApproval = await service.performCardAction(7, 101, {
        action: 'opener.confirm_send',
        idempotencyKey: 'candidate-card-opener-confirm-1',
        payload: confirmOpenerAction?.payload ?? {},
      });

      expect(openerApproval).toMatchObject({
        action: 'await_confirmation',
        pendingApproval: expect.objectContaining({
          id: 9001,
          actionType: 'send_invite',
        }),
        cards: [
          expect.objectContaining({
            schemaType: 'social_match.candidate',
            title: expect.stringContaining('开场白草稿'),
            actions: expect.arrayContaining([
              expect.objectContaining({
                schemaAction: 'opener.confirm_send',
                requiresConfirmation: true,
              }),
            ]),
          }),
        ],
      });
      expect(approvals.create).toHaveBeenCalledTimes(1);
      expect(approvals.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 7,
          agentTaskId: 101,
          type: 'send_message',
          actionType: 'send_invite',
          relatedCandidateId: 501,
          payload: expect.objectContaining({
            targetUserId: 22,
            message: expect.stringContaining('轻松跑一圈'),
            source: 'agent_card_action',
          }),
        }),
      );
      expect(executor.executeToolAction).not.toHaveBeenCalled();
      expect(messages.createAgentMessageEvent).not.toHaveBeenCalled();
      memory = readTaskMemory(taskRepo) as CandidateActionMemory;
      expect(memory.pendingActions.at(-1)).toMatchObject({
        actionType: 'send_invite',
      });

      const confirmedOpener = await service.performCardAction(7, 101, {
        action: 'opener.confirm_send',
        idempotencyKey: 'candidate-card-opener-confirm-1',
        payload: {
          taskId: 101,
          approvalId: 9001,
        },
      });

      expect(executor.executeToolAction).toHaveBeenCalledWith(
        101,
        SocialAgentToolName.SendMessageToCandidate,
        expect.objectContaining({
          targetUserId: 22,
          candidateUserId: 22,
          message: expect.stringContaining('轻松跑一圈'),
          candidateRecordId: 501,
          socialRequestId: 301,
          idempotencyKey: 'candidate-card-opener-confirm-1',
          metadata: expect.objectContaining({
            confirmationSource: 'agent_card_action',
            pendingApprovalId: 9001,
            schemaAction: 'opener.confirm_send',
          }),
        }),
        7,
        { signal: null },
      );
      expect(confirmedOpener).toMatchObject({
        action: 'reply',
        pendingApproval: null,
        cards: [
          expect.objectContaining({
            schemaType: 'meet_loop.timeline',
            data: expect.objectContaining({
              candidateUserId: 22,
              loopStage: 'message_sent',
              messagePreview: expect.stringContaining('轻松跑一圈'),
              timeline: expect.objectContaining({
                nextAction: expect.stringContaining('等待对方回复'),
              }),
            }),
          }),
        ],
        assistantMessage: expect.stringContaining('已确认发送给小林'),
      });
      memory = readTaskMemory(taskRepo) as CandidateActionMemory;
      expect(memory.pendingActions).toEqual([]);
      expect(memory.candidateState).toMatchObject({
        messagedIds: [22],
      });

      const connect = await service.performCardAction(7, 101, {
        action: 'candidate.connect',
        payload: {
          taskId: 101,
          socialRequestId: 301,
          candidateRecordId: 501,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            displayName: '小林',
          },
        },
      });

      expect(
        executor.executeToolAction.mock.calls.some(
          ([, toolName]) => toolName === SocialAgentToolName.AddFriend,
        ),
      ).toBe(false);
      expect(approvals.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'contact_request',
          actionType: 'connect_candidate',
          payload: expect.objectContaining({
            targetUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          }),
        }),
      );
      expect(connect).toMatchObject({
        intent: 'action_request',
        action: 'await_confirmation',
        pendingApproval: expect.objectContaining({
          id: 9001,
          actionType: 'connect_candidate',
        }),
        cards: [
          expect.objectContaining({
            type: 'candidate_card',
            schemaType: 'social_match.candidate',
            actions: expect.arrayContaining([
              expect.objectContaining({
                schemaAction: 'candidate.connect',
                requiresConfirmation: true,
              }),
            ]),
            data: expect.objectContaining({
              opportunityCard: true,
              targetUserId: 22,
            }),
          }),
        ],
        assistantMessage: expect.stringContaining('加好友并聊天前还需要你确认'),
      });
      expect(messages.createAgentMessageEvent).not.toHaveBeenCalled();
    });

    it('keeps candidate.connect behind pending approval when AddFriend requires confirmation', async () => {
      const { service, taskRepo, executor, approvals } = makeHarness();
      taskRepo.findOne.mockResolvedValue(
        makeTask({
          memory: {
            shortTerm: {
              candidates: [
                {
                  userId: 22,
                  candidateUserId: 22,
                  candidateRecordId: 501,
                  socialRequestId: 301,
                  displayName: '小林',
                },
              ],
            },
          },
        }),
      );
      const result = await service.performCardAction(7, 101, {
        action: 'candidate.connect',
        payload: {
          taskId: 101,
          socialRequestId: 301,
          candidateRecordId: 501,
          targetUserId: 22,
          candidate: {
            userId: 22,
            candidateUserId: 22,
            displayName: '小林',
          },
        },
      });

      expect(executor.executeToolAction).not.toHaveBeenCalled();
      expect(approvals.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'contact_request',
          actionType: 'connect_candidate',
          payload: expect.objectContaining({
            targetUserId: 22,
            candidateRecordId: 501,
            socialRequestId: 301,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
          }),
        }),
      );
      expect(result).toMatchObject({
        action: 'await_confirmation',
        cards: [
          expect.objectContaining({
            type: 'candidate_card',
            schemaType: 'social_match.candidate',
            actions: expect.arrayContaining([
              expect.objectContaining({
                schemaAction: 'candidate.connect',
                requiresConfirmation: true,
              }),
            ]),
            data: expect.objectContaining({
              opportunityCard: true,
              targetUserId: 22,
            }),
          }),
        ],
        pendingApproval: expect.objectContaining({
          id: 9001,
          type: 'contact_request',
          actionType: 'connect_candidate',
          riskLevel: 'high',
        }),
        assistantMessage: expect.stringContaining('确认前不会联系对方'),
      });
      const memory = readTaskMemory(taskRepo) as {
        pendingActions: Array<Record<string, unknown>>;
      };
      expect(memory.pendingActions.at(-1)).toMatchObject({
        id: 9001,
        actionType: 'connect_candidate',
      });
    });

    it.each([
      'meet_loop.reschedule',
      'activity.modify_time',
      'activity.modify_location',
    ] as const)(
      'creates a meet-loop reschedule checkpoint for %s through the chat card-action entrypoint without notifying the other user',
      async (action) => {
        const { service, taskRepo, approvals, executor } = makeHarness();
        await taskRepo.save(
          makeTask({
            result: {
              meetLoop: {
                activityId: 700,
                candidateUserId: 22,
                loopStage: 'message_sent',
                status: 'message_sent',
              },
            },
          }),
        );

        const result = await service.performCardAction(7, 101, {
          action,
          payload: {
            taskId: 101,
            activityId: 700,
            candidateUserId: 22,
            loopStage: 'message_sent',
          },
        });

        expect(result).toMatchObject({
          action: 'reply',
          pendingApproval: null,
          assistantMessage: expect.stringContaining('不会自动通知对方'),
          cards: [
            expect.objectContaining({
              schemaType: 'meet_loop.timeline',
              data: expect.objectContaining({
                loopStage: 'reschedule_requested',
                timeline: expect.objectContaining({
                  nextAction: '告诉我新的时间范围，我会生成改期草稿。',
                }),
              }),
            }),
          ],
        });
        expect(approvals.create).not.toHaveBeenCalled();
        expect(executor.executeToolAction).not.toHaveBeenCalled();
        const memory = readTaskMemory(taskRepo) as {
          currentTask: Record<string, unknown>;
        };
        expect(memory.currentTask).toMatchObject({
          objective: 'meet_loop',
          waitingFor: 'reschedule_time_window',
          lastCompletedStep: 'reschedule_requested',
        });
      },
    );

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
            actions: expect.arrayContaining([
              expect.objectContaining({
                schemaAction: 'activity.confirm_create',
                loopStage: 'activity_draft_created',
                requiresConfirmation: true,
              }),
              expect.objectContaining({
                schemaAction: 'activity.modify_time',
                loopStage: 'activity_draft_created',
                requiresConfirmation: false,
              }),
              expect.objectContaining({
                schemaAction: 'activity.modify_location',
                loopStage: 'activity_draft_created',
                requiresConfirmation: false,
              }),
            ]),
          }),
        ],
      });

      const confirmPayload =
        activityDraft.cards?.[0]?.actions[0]?.payload ?? {};
      const checkinStep = await service.performCardAction(7, 101, {
        action: 'activity.confirm_create',
        payload: confirmPayload,
      });

      expect(approvals.approve).toHaveBeenCalledWith(9001, 7);
      const timelineCard = checkinStep.cards?.find(
        (card) => card.schemaType === 'meet_loop.timeline',
      );
      const checkinCard = checkinStep.cards?.find(
        (card) => card.type === 'checkin_card',
      );
      expect(checkinStep).toMatchObject({
        action: 'reply',
      });
      expect(timelineCard).toMatchObject({
        type: 'meet_loop_timeline',
        data: expect.objectContaining({
          loopStage: 'activity_confirmed',
          timeline: expect.objectContaining({
            steps: expect.arrayContaining([
              expect.objectContaining({
                key: 'confirmed',
                state: 'current',
              }),
            ]),
          }),
        }),
      });
      expect(checkinCard).toMatchObject({
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
      });
      expect(lifeGraph.recordBehaviorEvent).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          eventType: LifeGraphBehaviorEventType.ActivityCreated,
          taskId: 101,
          candidateUserId: 22,
        }),
      );

      const checkinPayload =
        checkinCard?.actions.find(
          (action) => action.schemaAction === 'activity.check_in',
        )?.payload ?? {};
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
        type: 'meet_loop_timeline',
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

      const proofStep = await service.performCardAction(7, 101, {
        action: 'activity.upload_proof',
        payload: {
          taskId: 101,
          activityId: 700,
          note: '操场完成慢跑',
          locationApprox: '青岛大学操场附近',
        },
      });

      expect(proofStep).toMatchObject({
        intent: 'action_request',
        action: 'reply',
        assistantMessage: expect.stringContaining('打开活动详情上传'),
        cards: [
          expect.objectContaining({
            type: 'activity_status',
            data: expect.objectContaining({
              proofStatus: '待上传证明',
            }),
          }),
        ],
      });

      const savedTask = taskRepo.save.mock.calls.at(-1)?.[0] as AgentTask;
      expect(savedTask.memory).toMatchObject({
        taskMemory: {
          currentTask: expect.objectContaining({
            waitingFor: 'activity_proof_upload',
            lastCompletedStep: 'activity_proof_requested',
          }),
        },
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
        submitProof: jest.fn().mockResolvedValue({
          id: 801,
          proofType: 'scene_photo',
          status: 'pending',
        }),
        findOne: jest.fn().mockResolvedValue({
          id: 700,
          title: '周末慢跑',
          description: '公共场所慢跑',
          status: 'in_progress',
          city: '青岛',
          locationName: '青岛大学附近公共场所',
          proofRequired: true,
          proofPolicy: 'mutual_or_proof',
        }),
        listProofs: jest
          .fn()
          .mockResolvedValue([
            { id: 800, proofType: 'checkin', status: 'accepted' },
          ]),
      };
      const lifeGraph = {
        recordBehaviorEvent: jest.fn().mockResolvedValue({
          id: 1,
          eventType: LifeGraphBehaviorEventType.ActivityCreated,
        }),
      };
      const { service, taskRepo, approvals } = makeHarness({
        activities,
        lifeGraph,
      });
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

      expect(approvals.approve).toHaveBeenCalledWith(9001, 7);
      expect(approvals.approve.mock.invocationCallOrder[0]).toBeLessThan(
        activities.create.mock.invocationCallOrder[0],
      );
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
      const timelineCard = confirm.cards?.find(
        (card) => card.schemaType === 'meet_loop.timeline',
      );
      const checkinCard = confirm.cards?.find(
        (card) => card.type === 'checkin_card',
      );
      expect(timelineCard).toMatchObject({
        type: 'meet_loop_timeline',
        data: expect.objectContaining({
          activityId: 700,
          realActivityPersisted: true,
          loopStage: 'activity_confirmed',
        }),
      });
      expect(checkinCard).toMatchObject({
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

      const detail = await service.performCardAction(7, 101, {
        action: 'activity.view_detail',
        payload: {
          taskId: 101,
          activityId: 700,
        },
      });
      expect(activities.findOne).toHaveBeenCalledWith(700);
      expect(activities.listProofs).toHaveBeenCalledWith(700);
      expect(detail).toMatchObject({
        intent: 'action_request',
        action: 'reply',
        cards: [
          expect.objectContaining({
            type: 'activity_status',
            data: expect.objectContaining({
              activityId: 700,
              proofStatus: '1 条证明已确认',
            }),
          }),
        ],
      });

      const checkinPayload =
        checkinCard?.actions.find(
          (action) => action.schemaAction === 'activity.check_in',
        )?.payload ?? {};
      const checkin = await service.performCardAction(7, 101, {
        action: 'activity.check_in',
        payload: checkinPayload,
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

      const proof = await service.performCardAction(7, 101, {
        action: 'activity.upload_proof',
        payload: {
          taskId: 101,
          activityId: 700,
          proofType: 'scene_photo',
          note: '操场完成慢跑',
        },
      });
      expect(activities.submitProof).toHaveBeenCalledWith(
        700,
        7,
        expect.objectContaining({
          proofType: 'scene_photo',
          note: '操场完成慢跑',
          privacyMode: 'scene_only',
        }),
      );
      expect(proof.cards?.[0]).toMatchObject({
        type: 'activity_status',
        data: expect.objectContaining({
          proofId: 801,
          proofStatus: '证明待对方确认',
        }),
      });
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
