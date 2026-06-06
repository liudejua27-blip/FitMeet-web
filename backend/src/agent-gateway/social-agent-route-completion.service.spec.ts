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
    status: AgentTaskStatus.Queued,
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
});
