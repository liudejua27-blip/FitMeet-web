import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { SocialAgentAsyncRunSnapshot } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteCompletionService } from './social-agent-route-completion.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找跑步搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'profile_update',
    confidence: 0.9,
    entities: {
      city: '青岛',
      activityType: '跑步',
      targetGender: '',
      timePreference: '周末',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: true,
    shouldExecuteAction: false,
    replyStrategy: 'append_context',
    source: 'rules',
    ...overrides,
  };
}

function makeQueuedRun(
  overrides: Partial<SocialAgentAsyncRunSnapshot> = {},
): SocialAgentAsyncRunSnapshot {
  return {
    taskId: 101,
    runId: 'run-101',
    status: AgentTaskStatus.Pending,
    runStatus: 'queued',
    visibleSteps: [],
    assistantMessage: '已进入后台继续搜索。',
    queuedAt: new Date(0).toISOString(),
    ...overrides,
  } as SocialAgentAsyncRunSnapshot;
}

function makeHarness() {
  const messageLog = {
    recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
  };
  const metrics = {
    observeRouteLatency: jest.fn(),
    recordAction: jest.fn(),
    recordQueuedRun: jest.fn(),
  };
  const service = new SocialAgentRouteCompletionService(
    messageLog as never,
    metrics as never,
  );
  return { messageLog, metrics, service };
}

describe('SocialAgentRouteCompletionService', () => {
  it('records a regular route result with assistant log and latency metrics', async () => {
    const { messageLog, metrics, service } = makeHarness();
    const task = makeTask();

    const result = await service.complete({
      task,
      route: makeRoute(),
      assistantMessage: '已记住你的偏好。',
      savedContext: true,
      profileUpdated: true,
      queuedRun: null,
      runMode: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      startedAt: Date.now() - 30,
    });

    expect(result).toMatchObject({
      action: 'save_context',
      taskId: 101,
      assistantMessage: '已记住你的偏好。',
      savedContext: true,
      profileUpdated: true,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
    });
    expect(metrics.recordQueuedRun).not.toHaveBeenCalled();
    expect(metrics.recordAction).toHaveBeenCalledWith('save_context');
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '已记住你的偏好。',
      result,
    );
    expect(metrics.observeRouteLatency).toHaveBeenCalledWith(
      expect.any(Number),
    );
  });

  it('marks follow-up queued runs as replan actions and records queued mode metrics', async () => {
    const { messageLog, metrics, service } = makeHarness();
    const task = makeTask();
    const queuedRun = makeQueuedRun({ runId: 'follow-up-run' });

    const result = await service.complete({
      task,
      route: makeRoute({
        intent: 'candidate_followup',
        shouldReplan: false,
        shouldUpdateProfile: false,
        replyStrategy: 'search_candidates',
      }),
      assistantMessage: '我会基于现有候选继续处理。',
      savedContext: false,
      profileUpdated: false,
      queuedRun,
      runMode: 'follow_up',
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      startedAt: Date.now() - 20,
    });

    expect(result).toMatchObject({
      action: 'queue_replan',
      shouldReplan: true,
      shouldQueueRun: true,
      runMode: 'follow_up',
      queuedRun,
    });
    expect(metrics.recordQueuedRun).toHaveBeenCalledWith('follow_up');
    expect(metrics.recordAction).toHaveBeenCalledWith('queue_replan');
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '我会基于现有候选继续处理。',
      result,
    );
  });

  it('converts activity search results into assistant-ui activity opportunity cards', async () => {
    const { messageLog, service } = makeHarness();
    const task = makeTask({ goal: '找周末羽毛球活动' });

    const result = await service.complete({
      task,
      route: makeRoute({
        intent: 'activity_search',
        shouldUpdateProfile: false,
        replyStrategy: 'search_activities',
      }),
      assistantMessage: '找到 1 个公开活动机会。',
      savedContext: false,
      profileUpdated: false,
      queuedRun: null,
      runMode: null,
      pendingApproval: null,
      activityResults: [
        {
          id: 'activity-1',
          source: 'activity',
          isRealData: true,
          activityId: 301,
          publicIntentId: null,
          title: '周末徐汇羽毛球',
          description: '轻松打两局，公共球馆集合。',
          city: '上海',
          loc: '徐汇公共球馆',
          requestType: '羽毛球',
          interestTags: ['羽毛球', '低压力'],
          timePreference: '周六 16:00',
          ownerUserId: 9,
          status: 'open',
          createdAt: new Date(0).toISOString(),
          matchScore: 84,
          matchReasons: ['时间匹配', '公共场所'],
        },
      ],
      profileUpdateProposal: null,
      startedAt: Date.now() - 20,
    });

    expect(result.cards).toEqual([
      expect.objectContaining({
        type: 'activity_plan',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        title: '周末徐汇羽毛球',
        data: expect.objectContaining({
          schemaName: 'OpportunityCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.activity',
          opportunityCard: true,
          opportunityType: 'activity',
          opportunityTitle: '周末徐汇羽毛球',
          opportunitySubtitle: '上海 · 周六 16:00',
          confirmedContext: [
            '上海',
            '周六 16:00',
            '羽毛球',
            '徐汇公共球馆',
            expect.stringContaining('先查看公开详情'),
          ],
          opportunity: expect.objectContaining({
            type: 'activity',
            title: '周末徐汇羽毛球',
            city: '上海',
            location: '徐汇公共球馆',
            time: '周六 16:00',
            activityType: '羽毛球',
            matchScore: 84,
            reasons: expect.arrayContaining([
              '来源：来自公开活动，已通过公开可发现筛选',
              '匹配：时间匹配',
              expect.stringContaining('安全：先查看公开详情'),
            ]),
            explanationSteps: expect.arrayContaining([
              '来源：来自公开活动，已通过公开可发现筛选',
              '匹配：时间匹配',
              '地点：徐汇公共球馆，先看公开详情',
              expect.stringContaining('确认：联系、参加或发起约练前'),
            ]),
            interests: ['羽毛球', '低压力'],
            safetyBadges: ['公开活动', '先看详情', '联系前确认'],
          }),
          explanationSteps: expect.arrayContaining([
            '来源：来自公开活动，已通过公开可发现筛选',
            '匹配：时间匹配',
            expect.stringContaining('安全：先查看公开详情'),
          ]),
          fitReasons: expect.arrayContaining([
            '来源：来自公开活动，已通过公开可发现筛选',
            '匹配：时间匹配',
          ]),
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            label: '查看详情',
            action: 'activity.view_detail',
            schemaAction: 'activity.view_detail',
            requiresConfirmation: false,
          }),
          expect.objectContaining({
            label: '发起约练',
            action: 'activity.confirm_create',
            schemaAction: 'activity.confirm_create',
            requiresConfirmation: true,
            payload: expect.objectContaining({
              approvalRequired: true,
              checkpointRequired: true,
              resumeMode: 'resume_after_approval',
              riskLevel: 'medium',
              riskReasons: expect.arrayContaining([
                expect.stringContaining('真实约练'),
                expect.stringContaining('确认前不会创建'),
              ]),
            }),
          }),
        ]),
      }),
    ]);
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '找到 1 个公开活动机会。',
      result,
    );
  });
});
