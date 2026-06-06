import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找跑步搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    ...overrides,
  } as AgentTask;
}

function makeRoute(
  overrides: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent: 'action_request',
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
    shouldExecuteAction: true,
    replyStrategy: 'execute_action',
    source: 'rules',
    ...overrides,
  };
}

function makeHarness() {
  const candidateActions = {
    candidateMessageDraft: jest
      .fn()
      .mockReturnValue('今晚在青大操场慢跑 3km 可以吗？'),
    createActionApproval: jest.fn().mockResolvedValue({
      id: 88,
      type: 'send_message',
      actionType: 'send_candidate_message',
      summary: '发送开场白给 Mia',
      riskLevel: 'medium',
    }),
  };
  const metrics = {
    recordApproval: jest.fn(),
  };
  const service = new SocialAgentRouteActionTurnService(
    candidateActions as never,
    metrics as never,
  );
  return { candidateActions, metrics, service };
}

describe('SocialAgentRouteActionTurnService', () => {
  it('ignores non-action intents', async () => {
    const { candidateActions, metrics, service } = makeHarness();

    await expect(
      service.handle({
        ownerUserId: 7,
        task: makeTask(),
        route: makeRoute({
          intent: 'casual_chat',
          shouldExecuteAction: false,
          replyStrategy: 'direct_reply',
        }),
        message: '你好',
        assistantMessage: '你好，我在。',
      }),
    ).resolves.toEqual({
      handled: false,
      assistantMessage: '你好，我在。',
      pendingApproval: null,
    });

    expect(candidateActions.createActionApproval).not.toHaveBeenCalled();
    expect(metrics.recordApproval).not.toHaveBeenCalled();
  });

  it('creates a pending approval and records it in task memory before any action executes', async () => {
    const { candidateActions, metrics, service } = makeHarness();
    const task = makeTask();

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '帮我给她发个开场白',
      assistantMessage: '可以，我会先等你确认。',
    });

    expect(candidateActions.createActionApproval).toHaveBeenCalledWith({
      ownerUserId: 7,
      task,
      message: '帮我给她发个开场白',
      route: makeRoute(),
    });
    expect(result.pendingApproval).toMatchObject({
      id: 88,
      actionType: 'send_candidate_message',
    });
    expect(result.assistantMessage).toContain('确认后我再发送');
    expect(result.assistantMessage).toContain('待确认动作 #88 已创建');
    expect(metrics.recordApproval).toHaveBeenCalledWith('send_message');
    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            id: 88,
            type: 'send_message',
            actionType: 'send_candidate_message',
            riskLevel: 'medium',
          }),
        ],
      },
    });
  });
});
