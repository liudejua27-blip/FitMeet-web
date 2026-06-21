import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { SocialAgentAsyncRunSnapshot } from './social-agent-chat.types';
import { SocialAgentEventV2Service } from './social-agent-event-v2.service';
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
  const eventStore = {
    appendEvent: jest.fn().mockResolvedValue(undefined),
  };
  const selfImprove = {
    recordOnlineReplayFromRoute: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SocialAgentRouteCompletionService(
    messageLog as never,
    metrics as never,
    selfImprove as never,
    new SocialAgentEventV2Service(),
    eventStore as never,
  );
  return { eventStore, messageLog, metrics, selfImprove, service };
}

describe('SocialAgentRouteCompletionService', () => {
  it('records a regular route result with assistant log and latency metrics', async () => {
    const { eventStore, messageLog, metrics, selfImprove, service } =
      makeHarness();
    const task = makeTask();

    const result = await service.complete({
      task,
      route: makeRoute(),
      assistantMessage: '已记住你的偏好。',
      assistantMessageSource: 'fallback',
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
      assistantMessageSource: 'fallback',
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
    expect(eventStore.appendEvent).toHaveBeenCalledTimes(4);
    expect(eventStore.appendEvent).toHaveBeenNthCalledWith(
      1,
      task,
      expect.objectContaining({
        type: 'run.started',
        threadId: 'agent-task:101',
        taskId: 101,
        display: expect.objectContaining({
          title: '正在理解你的需求',
          state: 'done',
        }),
      }),
    );
    expect(eventStore.appendEvent).toHaveBeenNthCalledWith(
      3,
      task,
      expect.objectContaining({
        type: 'assistant.delta',
        payload: expect.objectContaining({
          messagePreview: '已记住你的偏好。',
        }),
      }),
    );
    expect(eventStore.appendEvent).toHaveBeenNthCalledWith(
      4,
      task,
      expect.objectContaining({
        type: 'run.completed',
        display: expect.objectContaining({
          title: '已整理当前进度',
          state: 'done',
        }),
        payload: expect.objectContaining({
          summary: expect.objectContaining({
            title: '已整理当前进度',
            state: 'completed',
            displayMode: 'covering_status',
            updateModel: 'latest_state',
            defaultVisibleCount: 1,
            historyVisibility: 'collapsed',
          }),
        }),
      }),
    );
    expect(metrics.observeRouteLatency).toHaveBeenCalledWith(
      expect.any(Number),
    );
    expect(selfImprove.recordOnlineReplayFromRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        taskId: 101,
        userMessage: '找跑步搭子',
        assistantMessage: '已记住你的偏好。',
      }),
    );
  });

  it('can defer assistant memory for streaming route responses', async () => {
    const { eventStore, messageLog, metrics, selfImprove, service } =
      makeHarness();
    const task = makeTask();

    const result = await service.complete({
      task,
      route: makeRoute(),
      assistantMessage: '旧的中间回复。',
      assistantMessageSource: 'fallback',
      savedContext: true,
      profileUpdated: false,
      queuedRun: null,
      runMode: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      startedAt: Date.now() - 30,
      deferAssistantMessageLog: true,
    });

    expect(result.assistantMessage).toBe('旧的中间回复。');
    expect(metrics.recordAction).toHaveBeenCalledWith('save_context');
    expect(messageLog.recordAssistantMessage).not.toHaveBeenCalled();
    expect(eventStore.appendEvent).not.toHaveBeenCalled();
    expect(selfImprove.recordOnlineReplayFromRoute).not.toHaveBeenCalled();
  });

  it('records non-streaming approval events as resumable lifecycle nodes', async () => {
    const { eventStore, service } = makeHarness();
    const task = makeTask();

    await service.complete({
      task,
      route: makeRoute({
        intent: 'action_request',
        shouldUpdateProfile: false,
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      }),
      assistantMessage: '发送邀请前需要你确认。',
      savedContext: true,
      profileUpdated: false,
      queuedRun: null,
      runMode: null,
      pendingApproval: {
        id: 55,
        type: ApprovalType.PostPublish,
        actionType: 'publish_social_request',
        summary: '发布青岛大学散步约练卡到发现',
        riskLevel: ApprovalRiskLevel.Medium,
        payload: {
          socialRequestId: 301,
          checkpointId: 777,
        },
        expiresAt: null,
      },
      activityResults: [],
      profileUpdateProposal: null,
      runtime: {
        checkpointId: 777,
        canResume: true,
        canReplay: true,
        canFork: true,
        resumeCursor: {
          threadId: 'agent-task:101',
          checkpointId: 777,
          action: 'resume',
          stepId: 'approval-55',
        },
        sideEffectPolicy: {
          idempotencyKey: 'social_codex:publish_social_request:task:101',
          sideEffectsBeforeResume: 'idempotent_only',
          duplicatePolicy: 'reuse_idempotency_key',
        },
      },
      startedAt: Date.now() - 20,
    });

    expect(eventStore.appendEvent).toHaveBeenCalledWith(
      task,
      expect.objectContaining({
        type: 'approval.required',
        stage: 'approval',
        display: expect.objectContaining({
          state: 'waiting',
        }),
        payload: expect.objectContaining({
          approvalId: 55,
          checkpointId: 777,
          actionType: 'publish_social_request',
          resumePolicy: 'confirm_then_resume_same_run',
          resumeCursor: expect.objectContaining({
            threadId: 'agent-task:101',
            checkpointId: 777,
            action: 'resume',
            stepId: 'approval-55',
          }),
          sideEffectPolicy: expect.objectContaining({
            sideEffectsBeforeResume: 'idempotent_only',
            duplicatePolicy: 'reuse_idempotency_key',
          }),
        }),
      }),
    );
    expect(eventStore.appendEvent).toHaveBeenLastCalledWith(
      task,
      expect.objectContaining({
        type: 'run.completed',
        stage: 'approval',
        display: expect.objectContaining({
          state: 'waiting',
        }),
        payload: expect.objectContaining({
          approvalId: 55,
          checkpointId: 777,
          actionType: 'publish_social_request',
          resumeCursor: expect.objectContaining({
            checkpointId: 777,
          }),
          summary: expect.objectContaining({
            title: '需要你确认后继续',
            state: 'waiting',
            displayMode: 'covering_status',
            pendingApproval: true,
          }),
        }),
      }),
    );
  });

  it('marks follow-up queued runs as replan actions and records queued mode metrics', async () => {
    const { eventStore, messageLog, metrics, service } = makeHarness();
    const task = makeTask({
      memory: {
        taskSlots: {
          time_window: {
            value: '今天晚上',
            state: 'completed',
          },
          activity: {
            value: '散步',
            state: 'completed',
          },
          location_text: {
            value: '青岛大学附近',
            state: 'completed',
          },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的人优先',
            state: 'answered',
          },
        },
      },
    });
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
    expect(eventStore.appendEvent).toHaveBeenLastCalledWith(
      task,
      expect.objectContaining({
        type: 'candidate_search.started',
        stage: 'search_candidates',
        display: expect.objectContaining({
          title: '正在按最新偏好重新筛选候选人',
          state: 'running',
        }),
        payload: expect.objectContaining({
          queuedRunId: 'follow-up-run',
          runMode: 'follow_up',
          action: 'queue_replan',
          confirmedContext: expect.arrayContaining([
            '时间：今天晚上',
            '活动：散步',
            '地点：青岛大学附近',
            '候选偏好：公开资料里有舞蹈相关标签的人优先',
          ]),
          instruction: '基于已确认信息继续，不重复追问。',
        }),
      }),
    );
  });

  it('does not write generic recovery fallback copy into replay assistant delta events', async () => {
    const { eventStore, messageLog, selfImprove, service } = makeHarness();
    const task = makeTask();

    const result = await service.complete({
      task,
      route: makeRoute({
        intent: 'casual_chat',
        shouldUpdateProfile: false,
        replyStrategy: 'direct_reply',
      }),
      assistantMessage:
        '连接刚才中断了。这段需求还在，可以直接继续。',
      assistantMessageSource: 'fallback',
      savedContext: false,
      profileUpdated: false,
      queuedRun: null,
      runMode: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      startedAt: Date.now() - 20,
    });

    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      task,
      '连接刚才中断了。这段需求还在，可以直接继续。',
      result,
    );
    expect(eventStore.appendEvent).toHaveBeenCalledTimes(3);
    expect(eventStore.appendEvent).not.toHaveBeenCalledWith(
      task,
      expect.objectContaining({
        type: 'assistant.delta',
      }),
    );
    expect(eventStore.appendEvent).toHaveBeenLastCalledWith(
      task,
      expect.objectContaining({
        type: 'run.completed',
        display: expect.objectContaining({
          title: '已整理当前进度',
          state: 'done',
        }),
        payload: expect.objectContaining({
          summary: expect.objectContaining({
            title: '已整理当前进度',
            state: 'completed',
            displayMode: 'covering_status',
          }),
        }),
      }),
    );
    expect(selfImprove.recordOnlineReplayFromRoute).not.toHaveBeenCalled();
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
