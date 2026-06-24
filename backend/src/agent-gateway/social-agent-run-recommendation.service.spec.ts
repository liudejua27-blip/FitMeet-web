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
import { FitMeetAgentToolStatus } from './entities/fitmeet-agent-runtime.entity';
import { SocialAgentRunRecommendationService } from './social-agent-run-recommendation.service';

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

describe('SocialAgentRunRecommendationService', () => {
  it('builds recommendation execution goals from restored taskMemory-only slots', () => {
    const service = new SocialAgentRunRecommendationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as {
      resolveRecommendationExecutionGoal(
        task: AgentTask,
        userGoal: string,
      ): string;
    };
    const task = makeTask({
      goal: '今晚青岛大学附近散步',
      memory: {
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步，优先舞蹈相关公开标签',
          taskSlots: {
            activity: {
              key: 'activity',
              value: '散步',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              key: 'time_window',
              value: '今晚',
              state: 'completed',
              source: 'user_message',
            },
            location_text: {
              key: 'location_text',
              value: '青岛大学附近',
              state: 'completed',
              source: 'user_message',
            },
            candidate_preference: {
              key: 'candidate_preference',
              value: '公开资料里有舞蹈相关标签的人优先',
              state: 'answered',
              source: 'user_message',
            },
          },
          taskSlotSummary: {
            activity: '散步',
            time_window: '今晚',
            location_text: '青岛大学附近',
            candidate_preference: '公开资料里有舞蹈相关标签的人优先',
          },
        },
      },
    });

    const goal = service.resolveRecommendationExecutionGoal(
      task,
      '可以，帮我找人',
    );

    expect(goal).toContain('用户最新输入：可以，帮我找人');
    expect(goal).toContain(
      '当前任务目标：今晚青岛大学附近散步，优先舞蹈相关公开标签',
    );
    expect(goal).toContain(
      '已确认信息：活动=散步；时间=今晚；地点=青岛大学附近；候选偏好=公开资料里有舞蹈相关标签的人优先',
    );
    expect(goal).toContain('不要重复追问已确认字段');
    expect(goal).toContain('候选偏好仅能基于公开可发现资料');
  });

  it('runs the recommendation pipeline and records visible/runtime progress', async () => {
    const task = makeTask();
    const savedEvents: Array<Record<string, unknown>> = [];
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => {
        savedEvents.push(input);
        return Promise.resolve(input);
      }),
    };
    const planner = {
      planExistingTask: jest.fn((plannedTask: AgentTask) => {
        plannedTask.plan = [{ id: 'search', status: 'planned' }];
        return Promise.resolve({
          source: 'fallback',
          fallbackReason: 'DEEPSEEK_API_KEY missing',
        });
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
    const draftSearch = {
      generateDeterministicDraftFromTask: jest.fn().mockReturnValue({
        draft: {
          type: SocialRequestType.RunningPartner,
          rawText: '今晚青岛轻松跑步',
          title: '今晚青岛轻松跑步',
          city: '青岛',
          activityType: 'running',
          interestTags: ['跑步'],
          radiusKm: 5,
          safetyRequirement: SocialRequestSafety.LowRiskOnly,
        },
        card: { title: '今晚青岛轻松跑步' },
        profileUsed: { city: '青岛' },
      }),
      createPrivateDraftRequest: jest.fn().mockResolvedValue(301),
      autoPublishDraftIfAllowed: jest.fn().mockResolvedValue({
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'requires_user_confirmation',
        blockedReason: 'missing_public_visibility_consent',
      }),
      searchCandidates: jest.fn().mockResolvedValue({
        candidates: [
          {
            agentTaskId: 101,
            socialRequestId: 301,
            candidateRecordId: 501,
            userId: 22,
            nickname: '小林',
            score: 87,
          },
        ],
        emptyReason: null,
        message: null,
        debugReasons: null,
      }),
    };
    const recommendationResults = {
      completeRecommendationResult: jest.fn((input) => {
        input.buildMemoryContext(input.task);
        return Promise.resolve({
          taskId: input.task.id,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: input.visibleSteps,
          assistantMessage: '已为你找到 1 个候选人。',
          socialRequestDraft: input.draft,
          candidates: input.candidates,
          approvalRequiredActions: [],
          events: [],
        });
      }),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const finalTaskContext = {
      conversationHistory: [
        {
          role: 'user',
          text: '今晚青岛大学附近散步，最好找公开资料里有舞蹈相关标签的人',
        },
      ],
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
        time_window: { value: '今晚', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
        candidate_preference: {
          value: '公开资料里有舞蹈相关标签的人优先',
          state: 'answered',
        },
      },
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({}),
      buildTaskContext: jest.fn().mockReturnValue(finalTaskContext),
    };
    const longTermSnapshot = {
      userId: 7,
      taskCount: 4,
      profileFacts: { city: '青岛' },
      preferences: { intensity: '低强度' },
      boundaries: { firstMeet: '公共场所优先' },
      socialGoals: ['找轻松跑步搭子'],
      availability: ['今晚'],
      activityPreferences: ['跑步'],
      matchSignals: ['同城'],
      updatedAt: '2026-06-17T00:00:00.000Z',
    };
    const longTermMemory = {
      readSnapshot: jest.fn().mockResolvedValue(longTermSnapshot),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [
          {
            role: 'user',
            text: '今晚青岛大学附近散步，最好找公开资料里有舞蹈相关标签的人',
            at: '2026-06-17T08:00:00.000Z',
          },
        ],
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          currentTask: {
            state: 'searching_candidates',
            previousState: 'workflow_guiding',
            stateReason: 'search_started',
            stateUpdatedAt: '2026-06-17T08:00:00.000Z',
            objective: '今晚青岛大学附近散步',
            nextStep: 'search_public_candidates',
            shouldSearchNow: true,
            profileSaved: true,
            awaitingSearchConfirmation: false,
            waitingFor: '',
            lastCompletedStep: 'slot_filling',
            clarificationAskedFields: [
              'activity',
              'time_window',
              'location_text',
            ],
            clarificationMissingFields: [],
            clarificationTurns: 1,
            clarificationAskedAt: '2026-06-17T08:00:00.000Z',
          },
          candidateState: {
            recommendedIds: [21],
            savedIds: [22],
            messagedIds: [],
            rejectedIds: [19],
          },
          pendingActions: [
            {
              id: 501,
              type: 'approval',
              actionType: 'send_invite',
              summary: '发送邀请前确认',
              riskLevel: 'medium',
              at: '2026-06-17T08:00:00.000Z',
            },
          ],
        },
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T08:00:00.000Z',
            completedAt: '2026-06-17T08:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '今晚',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T08:00:00.000Z',
            completedAt: '2026-06-17T08:00:00.000Z',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T08:00:00.000Z',
            completedAt: '2026-06-17T08:00:00.000Z',
          },
          candidate_preference: {
            key: 'candidate_preference',
            value: '公开资料里有舞蹈相关标签的人优先',
            state: 'answered',
            source: 'user_message',
            updatedAt: '2026-06-17T08:00:00.000Z',
          },
        },
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
        lifeGraphSummary: null,
        pendingApprovals: [
          {
            id: 501,
            type: 'approval',
            actionType: 'send_invite',
            summary: '发送邀请前确认',
            riskLevel: 'medium',
            at: '2026-06-17T08:00:00.000Z',
          },
        ],
        candidateActions: {
          recommendedIds: [21],
          savedIds: [22],
          messagedIds: [],
          rejectedIds: [19],
        },
      }),
    };
    const realtime = {
      emitAgentEvent: jest.fn(),
    };
    const agentLoop = {
      execute: jest.fn(async (input) => {
        const observations: unknown[] = [];
        for (const tool of input.plan.tools) {
          observations.push(
            await input.runner({
              agent: tool.agent,
              toolName: tool.toolName,
              input: tool.input ?? {},
              attempt: 0,
            }),
          );
          await input.emit?.({
            step: {
              agent: tool.agent,
              phase: 'tool',
              toolName: tool.toolName,
              status: 'observed',
            },
          });
        }
        return {
          loop: {
            runId: 'loop:recommendation',
            taskId: input.taskId,
            goal: input.goal,
            status: 'completed',
            toolBudget: { usedToolCalls: input.plan.tools.length },
            steps: input.plan.tools.map((tool) => ({
              agent: tool.agent,
              toolName: tool.toolName,
              status: 'observed',
            })),
            finalObservation: observations.at(-1) ?? null,
          },
        };
      }),
    };
    const recordRuntimeStep = jest.fn();
    const recordRuntimeTool = jest.fn();
    const streamEvents: Array<Record<string, unknown>> = [];
    const service = new SocialAgentRunRecommendationService(
      eventRepo as never,
      planner as never,
      socialProfiles as never,
      draftSearch as never,
      recommendationResults as never,
      taskLifecycle as never,
      routeContext as never,
      realtime as never,
      agentLoop as never,
      longTermMemory as never,
      contextHydrator as never,
    );

    const result = await service.run({
      ownerUserId: 7,
      task,
      goal: '可以，帮我找人',
      permissionMode: AgentTaskPermissionMode.Confirm,
      visibleSteps: [],
      emit: (event) => {
        streamEvents.push(event as Record<string, unknown>);
      },
      visibleStepLabel: (_, label) => label,
      recordRuntimeStep,
      recordRuntimeTool,
    });

    expect(planner.planExistingTask).toHaveBeenCalledWith(task);
    expect(contextHydrator.hydrateContext).toHaveBeenCalledWith({
      userId: 7,
      taskId: 101,
      threadId: 'agent-task:101',
    });
    expect(task.memory).toMatchObject({
      taskSlots: {
        activity: expect.objectContaining({
          value: '散步',
          state: 'completed',
        }),
        time_window: expect.objectContaining({
          value: '今晚',
          state: 'completed',
        }),
        location_text: expect.objectContaining({
          value: '青岛大学附近',
          state: 'completed',
        }),
        candidate_preference: expect.objectContaining({
          value: '公开资料里有舞蹈相关标签的人优先',
        }),
      },
      taskSlotSummary: expect.objectContaining({
        activity: '散步',
        time_window: '今晚',
        location_text: '青岛大学附近',
        candidate_preference: '公开资料里有舞蹈相关标签的人优先',
      }),
      taskMemory: expect.objectContaining({
        currentGoal: '今晚青岛大学附近散步',
        lastUserMessages: expect.arrayContaining([
          expect.objectContaining({
            text: '今晚青岛大学附近散步，最好找公开资料里有舞蹈相关标签的人',
            intent: 'hydrated_context',
          }),
        ]),
        candidateState: expect.objectContaining({
          savedIds: [22],
          rejectedIds: [19],
        }),
        pendingActions: expect.arrayContaining([
          expect.objectContaining({ actionType: 'send_invite' }),
        ]),
      }),
    });
    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'recommendation_read_profile_and_plan',
            }),
            expect.objectContaining({
              toolName: 'recommendation_create_social_intent',
              input: expect.objectContaining({
                pipelineSteps: [
                  'create_opportunity_card_draft',
                  'optional_publish_public_intent',
                ],
                sideEffectPolicy:
                  'no_messages_or_candidate_contact_without_approval',
              }),
            }),
            expect.objectContaining({
              toolName: 'recommendation_search_candidates',
              input: expect.objectContaining({
                pipelineSteps: ['search_public_candidates'],
                sideEffectPolicy: 'no_contact_without_approval',
              }),
            }),
            expect.objectContaining({
              toolName: 'recommendation_final_answer',
              input: expect.objectContaining({
                pipelineSteps: ['request_approval'],
              }),
            }),
          ]),
        }),
      }),
    );
    expect(draftSearch.generateDeterministicDraftFromTask).toHaveBeenCalledWith(
      task,
      expect.stringContaining('用户最新输入：可以，帮我找人'),
    );
    expect(draftSearch.generateDeterministicDraftFromTask).toHaveBeenCalledWith(
      task,
      expect.stringContaining('当前任务目标：今晚青岛大学附近散步'),
    );
    expect(draftSearch.generateDeterministicDraftFromTask).toHaveBeenCalledWith(
      task,
      expect.stringContaining(
        '已确认信息：活动=散步；时间=今晚；地点=青岛大学附近；候选偏好=公开资料里有舞蹈相关标签的人优先',
      ),
    );
    expect(draftSearch.generateDeterministicDraftFromTask).toHaveBeenCalledWith(
      task,
      expect.stringContaining('不要重复追问已确认字段'),
    );
    expect(draftSearch.createPrivateDraftRequest).toHaveBeenCalledWith(
      task,
      expect.objectContaining({
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    );
    expect(draftSearch.searchCandidates).not.toHaveBeenCalled();
    expect(draftSearch.autoPublishDraftIfAllowed).toHaveBeenCalledWith(
      task,
      expect.objectContaining({ socialRequestId: 301 }),
    );
    expect(result.result).toMatchObject({
      taskId: 101,
      status: AgentTaskStatus.AwaitingConfirmation,
      candidates: [],
      agentLoop: expect.objectContaining({
        status: 'completed',
        toolBudget: expect.objectContaining({
          usedToolCalls: 6,
        }),
      }),
    });
    expect(result.result.visibleSteps.map((step) => step.id)).toEqual([
      'understand',
      'permission',
      'plan',
      'search',
      'rank',
      'safety_filter',
      'draft',
      'reason',
      'icebreaker',
      'done',
    ]);
    expect(recordRuntimeStep).toHaveBeenCalledTimes(10);
    expect(recordRuntimeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'fitmeet_create_social_intent',
        status: FitMeetAgentToolStatus.WaitingConfirmation,
      }),
    );
    expect(realtime.emitAgentEvent).not.toHaveBeenCalledWith(
      7,
      'agent:candidates',
      expect.anything(),
    );
    expect(
      recommendationResults.completeRecommendationResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        statusReason: 'recommendations_ready_waiting_user_confirmation',
        taskContext: finalTaskContext,
      }),
    );
    expect(longTermMemory.readSnapshot).toHaveBeenCalledWith(7);
    expect(routeContext.buildMemoryContext).toHaveBeenCalledWith(
      task,
      longTermSnapshot,
      expect.objectContaining({
        threadId: 'agent-task:101',
        taskId: 101,
        taskSlots: expect.objectContaining({
          activity: expect.objectContaining({ value: '散步' }),
          location_text: expect.objectContaining({ value: '青岛大学附近' }),
        }),
      }),
    );
    expect(routeContext.buildTaskContext).toHaveBeenCalledWith(
      expect.objectContaining({
        task,
        body: { message: '可以，帮我找人' },
        longTermSnapshot,
        hydratedContext: expect.objectContaining({
          threadId: 'agent-task:101',
          taskId: 101,
        }),
      }),
    );
    expect(savedEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        AgentTaskEventType.GoalUnderstood,
        AgentTaskEventType.PlanGenerated,
        AgentTaskEventType.TaskSucceeded,
      ]),
    );
    const userVisibleProcessText = [
      ...result.result.visibleSteps.map((step) => step.label),
      ...savedEvents.map((event) => event.summary),
    ].join('\n');
    expect(userVisibleProcessText).not.toMatch(
      /DeepSeek|本地策略|规则匹配|tool_call|planner|traceId/i,
    );
    expect(streamEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'step',
          step: expect.objectContaining({ id: 'done', status: 'done' }),
        }),
        expect.objectContaining({
          type: 'step',
          step: expect.objectContaining({
            id: expect.stringContaining('loop_tool_recommendation'),
          }),
        }),
      ]),
    );
  });

  it('does not execute recommendation side effects when AgentLoop does not run tools', async () => {
    const task = makeTask();
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
    };
    const planner = {
      planExistingTask: jest.fn().mockResolvedValue({ source: 'fallback' }),
    };
    const socialProfiles = {
      get: jest.fn().mockResolvedValue({
        city: '青岛',
        interestTags: ['散步'],
        availableTimes: ['今晚'],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      }),
    };
    const draftSearch = {
      generateDeterministicDraftFromTask: jest.fn(),
      createPrivateDraftRequest: jest.fn(),
      autoPublishDraftIfAllowed: jest.fn(),
      searchCandidates: jest.fn(),
    };
    const recommendationResults = {
      completeRecommendationResult: jest.fn(),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({}),
    };
    const realtime = {
      emitAgentEvent: jest.fn(),
    };
    const agentLoop = {
      execute: jest.fn().mockResolvedValue({
        loop: {
          runId: 'loop:recommendation-no-runner',
          taskId: task.id,
          goal: task.goal,
          status: 'completed',
          toolBudget: { usedToolCalls: 0 },
          steps: [],
          finalObservation: null,
        },
      }),
    };
    const longTermMemory = {
      readSnapshot: jest.fn().mockResolvedValue(null),
    };
    const service = new SocialAgentRunRecommendationService(
      eventRepo as never,
      planner as never,
      socialProfiles as never,
      draftSearch as never,
      recommendationResults as never,
      taskLifecycle as never,
      routeContext as never,
      realtime as never,
      agentLoop as never,
      longTermMemory as never,
    );

    await expect(
      service.run({
        ownerUserId: 7,
        task,
        goal: '今晚青岛大学附近散步',
        permissionMode: AgentTaskPermissionMode.Confirm,
        visibleSteps: [],
        visibleStepLabel: (_, label) => label,
      }),
    ).rejects.toThrow(
      'Recommendation AgentLoop completed without final result.',
    );

    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'FitMeet Main Agent',
        plan: expect.objectContaining({
          reason:
            'Initial recommendation run executes only through AgentLoop tools.',
          tools: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'recommendation_understand_permission',
            }),
            expect.objectContaining({
              toolName: 'recommendation_read_profile_and_plan',
            }),
            expect.objectContaining({
              toolName: 'recommendation_create_social_intent',
            }),
            expect.objectContaining({
              toolName: 'recommendation_search_candidates',
            }),
            expect.objectContaining({
              toolName: 'recommendation_rank_safety_and_draft',
            }),
            expect.objectContaining({
              toolName: 'recommendation_final_answer',
            }),
          ]),
        }),
      }),
    );
    expect(longTermMemory.readSnapshot).toHaveBeenCalledWith(7);
    expect(planner.planExistingTask).not.toHaveBeenCalled();
    expect(socialProfiles.get).not.toHaveBeenCalled();
    expect(
      draftSearch.generateDeterministicDraftFromTask,
    ).not.toHaveBeenCalled();
    expect(draftSearch.createPrivateDraftRequest).not.toHaveBeenCalled();
    expect(draftSearch.autoPublishDraftIfAllowed).not.toHaveBeenCalled();
    expect(draftSearch.searchCandidates).not.toHaveBeenCalled();
    expect(
      recommendationResults.completeRecommendationResult,
    ).not.toHaveBeenCalled();
    expect(taskLifecycle.assertTaskOwner).not.toHaveBeenCalled();
    expect(routeContext.buildMemoryContext).not.toHaveBeenCalled();
    expect(realtime.emitAgentEvent).not.toHaveBeenCalled();
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('restores hydrated slots after task refreshes so publish and search do not lose context', async () => {
    const task = makeTask({ goal: '今晚青岛大学附近散步' });
    const staleTask = () =>
      makeTask({
        id: task.id,
        ownerUserId: task.ownerUserId,
        goal: task.goal,
        memory: {},
      });
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
    };
    const draft = {
      type: SocialRequestType.RunningPartner,
      rawText: '今晚青岛大学附近散步',
      title: '今晚青岛大学附近散步',
      city: '青岛',
      activityType: 'walking',
      interestTags: ['散步'],
      radiusKm: 5,
      safetyRequirement: SocialRequestSafety.LowRiskOnly,
    };
    const draftSearch = {
      generateDeterministicDraftFromTask: jest.fn().mockReturnValue({
        draft,
        card: { title: '今晚青岛大学附近散步' },
        profileUsed: { city: '青岛' },
      }),
      createPrivateDraftRequest: jest.fn().mockResolvedValue(301),
      autoPublishDraftIfAllowed: jest.fn().mockResolvedValue({
        autoPublished: false,
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publishPolicy: 'requires_user_confirmation',
        blockedReason: 'missing_public_visibility_consent',
      }),
      searchCandidates: jest.fn().mockResolvedValue({
        candidates: [],
        emptyReason: null,
        message: null,
        debugReasons: null,
      }),
    };
    const agentLoop = {
      execute: jest.fn(async (input) => {
        for (const tool of input.plan.tools) {
          await input.runner({
            agent: tool.agent,
            toolName: tool.toolName,
            input: tool.input ?? {},
            attempt: 0,
          });
        }
        return {
          loop: {
            runId: 'loop:recommendation-refresh-context',
            taskId: input.taskId,
            goal: input.goal,
            status: 'completed',
            toolBudget: { usedToolCalls: input.plan.tools.length },
            steps: [],
          },
        };
      }),
    };
    const taskLifecycle = {
      assertTaskOwner: jest
        .fn()
        .mockImplementation(() => Promise.resolve(staleTask())),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [],
        taskMemory: {
          currentGoal: '今晚青岛大学附近散步',
          currentTask: { objective: '今晚青岛大学附近散步' },
        },
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
          },
          time_window: {
            key: 'time_window',
            value: '今晚',
            state: 'completed',
            source: 'user_message',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
          },
          geo_area: {
            key: 'geo_area',
            value: '崂山区',
            state: 'inferred',
            source: 'location_parser',
          },
          intensity: {
            key: 'intensity',
            value: '低强度',
            state: 'inferred',
            source: 'activity_parser',
          },
          candidate_preference: {
            key: 'candidate_preference',
            value: '公开资料里有舞蹈相关标签的人优先',
            state: 'answered',
            source: 'user_message',
          },
        },
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
        lifeGraphSummary: null,
        pendingApprovals: [],
        candidateActions: null,
      }),
    };
    const recommendationResults = {
      completeRecommendationResult: jest.fn((input) =>
        Promise.resolve({
          taskId: input.task.id,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: input.visibleSteps,
          assistantMessage: '已继续处理。',
          socialRequestDraft: input.draft,
          candidates: input.candidates,
          approvalRequiredActions: [],
          events: [],
        }),
      ),
    };
    const service = new SocialAgentRunRecommendationService(
      eventRepo as never,
      {
        planExistingTask: jest.fn().mockResolvedValue({ source: 'fallback' }),
      } as never,
      { get: jest.fn().mockResolvedValue({}) } as never,
      draftSearch as never,
      recommendationResults as never,
      taskLifecycle as never,
      {
        buildMemoryContext: jest.fn().mockReturnValue({}),
        buildTaskContext: jest.fn().mockReturnValue({
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今晚', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
          },
        }),
      } as never,
      { emitAgentEvent: jest.fn() } as never,
      agentLoop as never,
      { readSnapshot: jest.fn().mockResolvedValue(null) } as never,
      contextHydrator as never,
    );

    await service.run({
      ownerUserId: 7,
      task,
      goal: '可以，帮我找人',
      permissionMode: AgentTaskPermissionMode.Confirm,
      visibleSteps: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(draftSearch.createPrivateDraftRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          taskSlots: expect.objectContaining({
            activity: expect.objectContaining({ value: '散步' }),
            time_window: expect.objectContaining({ value: '今晚' }),
            location_text: expect.objectContaining({ value: '青岛大学附近' }),
            geo_area: expect.objectContaining({
              value: '崂山区',
              state: 'inferred',
            }),
            intensity: expect.objectContaining({
              value: '低强度',
              state: 'inferred',
            }),
            candidate_preference: expect.objectContaining({
              value: '公开资料里有舞蹈相关标签的人优先',
            }),
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            treatAsHardConstraints: true,
            doNotAskAgainFor: expect.arrayContaining([
              'activity',
              'time_window',
              'location_text',
              'candidate_preference',
            ]),
            knownSlots: expect.arrayContaining([
              expect.objectContaining({ key: 'activity', value: '散步' }),
              expect.objectContaining({ key: 'time_window', value: '今晚' }),
              expect.objectContaining({
                key: 'location_text',
                value: '青岛大学附近',
              }),
              expect.objectContaining({
                key: 'geo_area',
                value: '崂山区',
                confirmation: 'inferred_context',
              }),
              expect.objectContaining({
                key: 'intensity',
                value: '低强度',
                confirmation: 'inferred_context',
              }),
              expect.objectContaining({
                key: 'candidate_preference',
                value: '公开资料里有舞蹈相关标签的人优先',
              }),
            ]),
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(draftSearch.autoPublishDraftIfAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          taskSlotSummary: expect.objectContaining({
            activity: '散步',
            time_window: '今晚',
            location_text: '青岛大学附近',
            geo_area: '崂山区',
            intensity: '低强度',
            candidate_preference: '公开资料里有舞蹈相关标签的人优先',
          }),
          knownTaskSlotConstraints: expect.objectContaining({
            instruction: expect.stringContaining('不得重复询问'),
          }),
        }),
      }),
      expect.any(Object),
    );
    expect(draftSearch.searchCandidates).not.toHaveBeenCalled();
    expect(task.memory).toMatchObject({
      knownTaskSlotConstraints: expect.objectContaining({
        treatAsHardConstraints: true,
        doNotAskAgainFor: expect.arrayContaining([
          'activity',
          'time_window',
          'location_text',
          'candidate_preference',
        ]),
        knownSlots: expect.arrayContaining([
          expect.objectContaining({
            key: 'geo_area',
            confirmation: 'inferred_context',
          }),
          expect.objectContaining({
            key: 'intensity',
            confirmation: 'inferred_context',
          }),
        ]),
      }),
    });
    expect(
      (
        task.memory as {
          knownTaskSlotConstraints?: { doNotAskAgainFor?: string[] };
        }
      ).knownTaskSlotConstraints?.doNotAskAgainFor,
    ).toEqual(expect.not.arrayContaining(['geo_area', 'intensity']));
  });

  it('keeps current explicit user details from being overwritten by stale hydrated goals', async () => {
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
    };
    const planner = {
      planExistingTask: jest.fn().mockResolvedValue({ source: 'fallback' }),
    };
    const socialProfiles = {
      get: jest.fn(),
    };
    const draftSearch = {
      generateDeterministicDraftFromTask: jest.fn(),
      createPrivateDraftRequest: jest.fn(),
      autoPublishDraftIfAllowed: jest.fn(),
      searchCandidates: jest.fn(),
    };
    const recommendationResults = {
      completeRecommendationResult: jest.fn(),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn(),
    };
    const routeContext = {
      buildMemoryContext: jest.fn(),
    };
    const realtime = {
      emitAgentEvent: jest.fn(),
    };
    const agentLoop = {
      execute: jest.fn().mockResolvedValue({
        loop: {
          runId: 'loop:no-final-result',
          taskId: 101,
          goal: 'no-op',
          status: 'completed',
          toolBudget: { usedToolCalls: 0 },
          steps: [],
          finalObservation: null,
        },
      }),
    };
    const longTermMemory = {
      readSnapshot: jest.fn().mockResolvedValue(null),
    };
    const contextHydrator = {
      hydrateContext: jest.fn().mockResolvedValue({
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [],
        taskMemory: {
          currentGoal: '过期目标：周末下午跑步',
          currentTask: {
            objective: '过期目标：周末下午跑步',
          },
        },
        taskSlots: {},
        lifeGraphFactProposals: [],
        lifeGraphFactDisplaySummaries: [],
        lifeGraphGovernanceSummary: {
          total: 0,
          autoSaveCount: 0,
          confirmationRequiredCount: 0,
          blockedCount: 0,
          sensitiveCount: 0,
          expiringFactKeys: [],
        },
        lifeGraphSummary: null,
        pendingApprovals: [],
        candidateActions: null,
      }),
    };
    const service = new SocialAgentRunRecommendationService(
      eventRepo as never,
      planner as never,
      socialProfiles as never,
      draftSearch as never,
      recommendationResults as never,
      taskLifecycle as never,
      routeContext as never,
      realtime as never,
      agentLoop as never,
      longTermMemory as never,
      contextHydrator as never,
    );

    const explicitTask = makeTask({ id: 101 });
    await expect(
      service.run({
        ownerUserId: 7,
        task: explicitTask,
        goal: '今晚青岛大学散步，找女生舞蹈生',
        permissionMode: AgentTaskPermissionMode.Confirm,
        visibleSteps: [],
        visibleStepLabel: (_, label) => label,
      }),
    ).rejects.toThrow(
      'Recommendation AgentLoop completed without final result.',
    );

    expect(explicitTask.memory).toMatchObject({
      taskMemory: expect.objectContaining({
        currentGoal: '今晚青岛大学散步，找女生舞蹈生',
        currentTask: expect.objectContaining({
          objective: '今晚青岛大学散步，找女生舞蹈生',
        }),
      }),
    });

    const followUpTask = makeTask({ id: 102 });
    await expect(
      service.run({
        ownerUserId: 7,
        task: followUpTask,
        goal: '可以，继续帮我找人',
        permissionMode: AgentTaskPermissionMode.Confirm,
        visibleSteps: [],
        visibleStepLabel: (_, label) => label,
      }),
    ).rejects.toThrow(
      'Recommendation AgentLoop completed without final result.',
    );

    expect(followUpTask.memory).toMatchObject({
      taskMemory: expect.objectContaining({
        currentGoal: '过期目标：周末下午跑步',
        currentTask: expect.objectContaining({
          objective: '过期目标：周末下午跑步',
        }),
      }),
    });
  });

  it('carries Discover publication metadata when an authorized draft is auto-published', async () => {
    const task = makeTask();
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => Promise.resolve(input)),
    };
    const planner = {
      planExistingTask: jest.fn().mockResolvedValue({ source: 'fallback' }),
    };
    const socialProfiles = {
      get: jest.fn().mockResolvedValue({
        city: '青岛',
        interestTags: ['羽毛球'],
        availableTimes: ['周末'],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      }),
    };
    const draftSearch = {
      generateDeterministicDraftFromTask: jest.fn().mockReturnValue({
        draft: {
          type: SocialRequestType.RunningPartner,
          rawText: '周末青岛羽毛球',
          title: '周末青岛羽毛球',
          city: '青岛',
          activityType: 'badminton',
          interestTags: ['羽毛球'],
          radiusKm: 5,
          safetyRequirement: SocialRequestSafety.LowRiskOnly,
          metadata: { visibilityConsent: true },
        },
        card: { title: '周末青岛羽毛球' },
        profileUsed: { city: '青岛' },
      }),
      createPrivateDraftRequest: jest.fn().mockResolvedValue(302),
      autoPublishDraftIfAllowed: jest.fn().mockResolvedValue({
        autoPublished: true,
        synced: true,
        publicIntentId: 'intent_302',
        discoverHref: '/discover?publicIntentId=intent_302',
        publishPolicy: 'auto_after_first_public_authorization',
        blockedReason: null,
      }),
      searchCandidates: jest.fn().mockResolvedValue({
        candidates: [],
        emptyReason: null,
        message: null,
        debugReasons: null,
      }),
    };
    const recommendationResults = {
      completeRecommendationResult: jest.fn((input) =>
        Promise.resolve({
          taskId: input.task.id,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: input.visibleSteps,
          assistantMessage: '已同步到发现页。',
          socialRequestDraft: input.draft,
          candidates: input.candidates,
          approvalRequiredActions: [],
          events: [],
        }),
      ),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const agentLoop = {
      execute: jest.fn(async (input) => {
        for (const tool of input.plan.tools) {
          await input.runner({
            agent: tool.agent,
            toolName: tool.toolName,
            input: tool.input ?? {},
            attempt: 0,
          });
        }
        return {
          loop: {
            runId: 'loop:auto-publish',
            taskId: input.taskId,
            goal: input.goal,
            status: 'completed',
            toolBudget: { usedToolCalls: input.plan.tools.length },
            steps: [],
          },
        };
      }),
    };
    const service = new SocialAgentRunRecommendationService(
      eventRepo as never,
      planner as never,
      socialProfiles as never,
      draftSearch as never,
      recommendationResults as never,
      taskLifecycle as never,
      {
        buildMemoryContext: jest.fn().mockReturnValue({}),
        buildTaskContext: jest.fn().mockReturnValue({
          taskSlots: {
            activity: { value: '羽毛球', state: 'completed' },
            time_window: { value: '周末', state: 'completed' },
            location_text: { value: '青岛', state: 'completed' },
          },
        }),
      } as never,
      { emitAgentEvent: jest.fn() } as never,
      agentLoop as never,
    );

    const result = await service.run({
      ownerUserId: 7,
      task,
      goal: '周末青岛羽毛球',
      permissionMode: AgentTaskPermissionMode.Confirm,
      visibleSteps: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result.result.socialRequestDraft).toMatchObject({
      socialRequestId: 302,
      autoPublished: true,
      publicIntentId: 'intent_302',
      discoverHref: '/discover?publicIntentId=intent_302',
      publishPolicy: 'auto_after_first_public_authorization',
    });
    expect(
      recommendationResults.completeRecommendationResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        statusReason: 'recommendations_ready_public_intent_auto_published',
      }),
    );
  });
});
