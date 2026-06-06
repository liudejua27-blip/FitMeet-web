import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';

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
    intent: 'candidate_followup',
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
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'direct_reply',
    source: 'rules',
    ...overrides,
  };
}

function makeHarness() {
  const candidateActions = {
    confirmPendingCandidateMessageIfRequested: jest.fn(),
  };
  const messageLog = {
    recordAssistantMessage: jest.fn().mockResolvedValue(undefined),
  };
  const metrics = {
    observeRouteLatency: jest.fn(),
    recordAction: jest.fn(),
  };
  const service = new SocialAgentRouteCandidateConfirmationService(
    candidateActions as never,
    messageLog as never,
    metrics as never,
  );
  return { candidateActions, messageLog, metrics, service };
}

describe('SocialAgentRouteCandidateConfirmationService', () => {
  it('ignores messages that do not confirm a pending candidate message', async () => {
    const { candidateActions, messageLog, metrics, service } = makeHarness();
    const task = makeTask();
    candidateActions.confirmPendingCandidateMessageIfRequested.mockResolvedValue(
      null,
    );

    await expect(
      service.handle({
        ownerUserId: 7,
        task,
        message: '再给我看看她的资料',
        route: makeRoute(),
        startedAt: Date.now(),
      }),
    ).resolves.toEqual({
      handled: false,
      task,
      result: null,
    });

    expect(
      candidateActions.confirmPendingCandidateMessageIfRequested,
    ).toHaveBeenCalledWith(7, task, '再给我看看她的资料');
    expect(messageLog.recordAssistantMessage).not.toHaveBeenCalled();
    expect(metrics.recordAction).not.toHaveBeenCalled();
    expect(metrics.observeRouteLatency).not.toHaveBeenCalled();
  });

  it('returns the confirmed reply action and records assistant output before leaving the route turn', async () => {
    const { candidateActions, messageLog, metrics, service } = makeHarness();
    const task = makeTask();
    const confirmedTask = makeTask({ id: 202 });
    candidateActions.confirmPendingCandidateMessageIfRequested.mockResolvedValue(
      {
        task: confirmedTask,
        assistantMessage: '已发送给 Mia，我会继续跟进回复。',
      },
    );

    const result = await service.handle({
      ownerUserId: 7,
      task,
      message: '确认发送',
      route: makeRoute({ confidence: 0.82 }),
      startedAt: Date.now() - 25,
    });

    expect(result.handled).toBe(true);
    expect(result.task).toBe(confirmedTask);
    expect(result.result).toMatchObject({
      intent: 'action_request',
      action: 'reply',
      taskId: 202,
      assistantMessage: '已发送给 Mia，我会继续跟进回复。',
      shouldExecuteAction: true,
      shouldQueueRun: false,
      pendingApproval: null,
      permissionMode: AgentTaskPermissionMode.Confirm,
      confidence: 0.82,
    });
    expect(messageLog.recordAssistantMessage).toHaveBeenCalledWith(
      confirmedTask,
      '已发送给 Mia，我会继续跟进回复。',
      result.result,
    );
    expect(metrics.recordAction).toHaveBeenCalledWith('reply');
    expect(metrics.observeRouteLatency).toHaveBeenCalledWith(
      expect.any(Number),
    );
  });
});
