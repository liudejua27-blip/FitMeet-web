import { SocialRequestType } from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentAction } from './agent-permission.service';
import { SocialAgentReplanRunService } from './social-agent-replan-run.service';
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
    status: AgentTaskStatus.Planning,
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

describe('SocialAgentReplanRunService', () => {
  it('refreshes draft and candidates from a follow-up run and completes the stored run', async () => {
    const task = makeTask();
    const savedEvents: Array<Record<string, unknown>> = [];
    const eventRepo = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) => {
        savedEvents.push(input);
        return Promise.resolve(input);
      }),
    };
    const runState = {
      updateRunSnapshot: jest.fn().mockResolvedValue(task),
      completeReplanRun: jest.fn().mockResolvedValue(task),
    };
    const followUpContext = {
      readLatestFollowUpContext: jest.fn().mockReturnValue(null),
      appendFollowUpContext: jest.fn().mockResolvedValue({
        task,
        userMessage: '改成明天杭州瑜伽搭子',
        previousGoal: '今晚青岛轻松跑步',
        refreshedGoal:
          '原需求：今晚青岛轻松跑步\n用户补充：改成明天杭州瑜伽搭子',
        appendedAt: new Date(0).toISOString(),
        alreadyAppended: false,
      }),
    };
    const replanProgress = {
      completeStep: jest.fn((input) =>
        Promise.resolve({
          task,
          visibleSteps: [
            ...input.visibleSteps,
            { id: input.id, label: input.label, status: 'done' },
          ],
        }),
      ),
    };
    const planner = {
      replanTask: jest.fn().mockResolvedValue({
        taskId: 101,
        permissionMode: AgentTaskPermissionMode.Confirm,
        allowedActions: [SocialAgentAction.SearchProfiles],
        plan: [
          {
            id: 'replan_search',
            action: SocialAgentAction.SearchProfiles,
            status: 'replanned',
            toolName: SocialAgentToolName.SearchMatches,
          },
        ],
        source: 'fallback',
        fallbackReason: 'DEEPSEEK_API_KEY missing',
        reason: 'user_follow_up',
        replanAttempt: 2,
      }),
    };
    const draft = {
      agentTaskId: 101,
      socialRequestId: 301,
      type: SocialRequestType.FitnessPartner,
      rawText: '明天杭州瑜伽搭子',
      title: '明天杭州瑜伽搭子',
      city: '杭州',
    };
    const candidates = [
      {
        agentTaskId: 101,
        socialRequestId: 301,
        candidateRecordId: 501,
        userId: 22,
        nickname: '小林',
        score: 87,
      },
    ];
    const searchResult = {
      candidates,
      emptyReason: null,
      message: null,
      debugReasons: null,
    };
    const draftSearch = {
      refreshDraftAndCandidates: jest.fn().mockResolvedValue({
        task,
        draft,
        searchResult,
        candidates,
      }),
    };
    const recommendationResults = {
      completeRecommendationResult: jest.fn((input) =>
        Promise.resolve({
          taskId: input.task.id,
          status: AgentTaskStatus.AwaitingConfirmation,
          visibleSteps: input.visibleSteps,
          assistantMessage: '已根据补充要求刷新。',
          socialRequestDraft: input.draft,
          candidates: input.candidates,
          approvalRequiredActions: [],
          events: [],
        }),
      ),
    };
    const routeContext = {
      buildMemoryContext: jest.fn().mockReturnValue({}),
    };
    const taskLifecycle = {
      assertTaskOwner: jest.fn().mockResolvedValue(task),
    };
    const realtime = {
      emitAgentEvent: jest.fn(),
    };
    const service = new SocialAgentReplanRunService(
      eventRepo as never,
      runState as never,
      followUpContext as never,
      replanProgress as never,
      planner as never,
      draftSearch as never,
      recommendationResults as never,
      routeContext as never,
      taskLifecycle as never,
      realtime as never,
    );

    const result = await service.execute({
      ownerUserId: 7,
      taskId: 101,
      body: {
        userMessage: '改成明天杭州瑜伽搭子',
        reason: 'user_follow_up',
      },
      runId: 'sar_test_1',
      visibleStepLabel: (_, label) => label,
    });

    expect(followUpContext.appendFollowUpContext).toHaveBeenCalledWith(
      task,
      '改成明天杭州瑜伽搭子',
    );
    expect(planner.replanTask).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        userMessage: '改成明天杭州瑜伽搭子',
        reason: 'user_follow_up',
      }),
    );
    expect(draftSearch.refreshDraftAndCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        task,
        goal: expect.stringContaining('用户补充：改成明天杭州瑜伽搭子'),
      }),
    );
    expect(result).toMatchObject({
      taskId: 101,
      replan: { replanAttempt: 2 },
      agentLoop: {
        status: 'completed',
        toolBudget: expect.objectContaining({ usedToolCalls: 5 }),
      },
      socialRequestDraft: expect.objectContaining({ socialRequestId: 301 }),
      candidates: [expect.objectContaining({ userId: 22 })],
    });
    expect(runState.completeReplanRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        runId: 'sar_test_1',
        replan: expect.objectContaining({ replanAttempt: 2 }),
        visibleSteps: expect.arrayContaining([
          expect.objectContaining({ id: 'done' }),
        ]),
      }),
    );
    expect(realtime.emitAgentEvent).toHaveBeenCalledWith(
      7,
      'agent:approval_required',
      expect.objectContaining({ candidateCount: 1 }),
    );
    expect(savedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: AgentTaskEventType.SocialAgentReplanStarted,
        }),
      ]),
    );
  });
});
