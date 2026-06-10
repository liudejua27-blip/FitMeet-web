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
      generateDraftWithTool: jest.fn().mockResolvedValue({
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
      completeRecommendationResult: jest.fn((input) =>
        Promise.resolve({
          taskId: input.task.id,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: input.visibleSteps,
          assistantMessage: '已为你找到 1 个候选人。',
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
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({}),
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
    );

    const result = await service.run({
      ownerUserId: 7,
      task,
      goal: '今晚青岛轻松跑步',
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
    expect(agentLoop.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({
          tools: expect.arrayContaining([
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
              toolName: 'recommendation_final_answer',
            }),
          ]),
        }),
      }),
    );
    expect(draftSearch.generateDraftWithTool).toHaveBeenCalledWith(
      task,
      '今晚青岛轻松跑步',
    );
    expect(draftSearch.createPrivateDraftRequest).toHaveBeenCalledWith(
      task,
      expect.objectContaining({
        visibility: SocialRequestVisibility.Private,
        status: UserSocialRequestStatus.Draft,
      }),
    );
    expect(draftSearch.searchCandidates).toHaveBeenCalledWith(
      task,
      expect.objectContaining({ socialRequestId: 301 }),
    );
    expect(result.result).toMatchObject({
      taskId: 101,
      status: AgentTaskStatus.AwaitingConfirmation,
      candidates: [expect.objectContaining({ userId: 22 })],
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
      'deepseek',
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
    expect(realtime.emitAgentEvent).toHaveBeenCalledWith(
      7,
      'agent:candidates',
      expect.objectContaining({ candidateCount: 1 }),
    );
    expect(
      recommendationResults.completeRecommendationResult,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        statusReason: 'recommendations_ready_waiting_user_confirmation',
      }),
    );
    expect(savedEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        AgentTaskEventType.GoalUnderstood,
        AgentTaskEventType.PlanGenerated,
        AgentTaskEventType.TaskSucceeded,
      ]),
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
});
