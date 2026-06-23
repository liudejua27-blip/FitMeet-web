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
      runtimeContext: null,
    });
    expect(result.pendingApproval).toMatchObject({
      id: 88,
      actionType: 'send_candidate_message',
    });
    expect(result.assistantMessage).toContain('确认前我不会发送');
    expect(result.assistantMessage).toContain('取消也不会联系对方');
    expect(result.assistantMessage).not.toContain('待确认动作');
    expect(result.assistantMessage).not.toContain('#88');
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

  it('turns a natural-language publish request into a confirmable Discover publish card', async () => {
    const { candidateActions, metrics, service } = makeHarness();
    const task = makeTask({
      goal: '今晚青岛大学附近健身约练',
      memory: {
        taskSlots: {
          activity: { value: '健身', state: 'completed' },
          time_window: { value: '今晚', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          safety_boundary: {
            value: '公共场所，先站内聊',
            state: 'completed',
          },
        },
      },
    });

    const result = await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '那你帮我发布到发现',
      assistantMessage: '可以，我会先等你确认。',
    });

    expect(candidateActions.createActionApproval).not.toHaveBeenCalled();
    expect(metrics.recordApproval).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      handled: true,
      pendingApproval: null,
      assistantMessage: expect.stringContaining('发布确认卡'),
      cards: [
        expect.objectContaining({
          type: 'activity_plan',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'social_match.activity',
          status: 'waiting_confirmation',
          data: expect.objectContaining({
            taskId: 101,
            schemaName: 'OpportunityCard',
            opportunityCard: true,
            activityType: '健身',
            time: '今晚',
            locationName: '青岛大学附近',
          }),
          actions: expect.arrayContaining([
            expect.objectContaining({
              label: '确认发布',
              schemaAction: 'publish_to_discover',
              requiresConfirmation: true,
              payload: expect.objectContaining({
                taskId: 101,
                socialRequestDraft: expect.objectContaining({
                  activityType: '健身',
                  timePreference: '今晚',
                  locationName: '青岛大学附近',
                  requireUserConfirmation: true,
                }),
              }),
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
      ],
    });
  });

  it('passes hydrated runtime context into approval creation and stores non-sensitive telemetry', async () => {
    const { candidateActions, service } = makeHarness();
    const task = makeTask();
    const runtimeContext = {
      taskContext: {
        taskSlotSummary: '今天晚上 · 青岛大学附近 · 散步',
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
        },
      },
      hydratedContext: {
        userId: 7,
        threadId: 'agent-task:101',
        taskId: 101,
        recentMessages: [{ role: 'user', content: '今晚青岛大学附近散步' }],
        taskMemory: null,
        taskSlots: {
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          activity: { value: '散步', state: 'completed' },
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
        lifeGraphSummary: { preferences: { intensity: '低强度' } },
        pendingApprovals: [{ id: 'approval-existing' }],
        candidateActions: { saved: ['candidate-1'] },
      } as never,
      profile: { publicName: 'FitMeet' },
      longTermSnapshot: { preferences: { intensity: '低强度' } },
      brainToolResults: [{ toolName: 'candidate_confirmation_check' }],
      resumeContext: { resumeMode: 'resume_after_approval' },
    };

    await service.handle({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '帮我给她发个开场白',
      assistantMessage: '可以，我会先等你确认。',
      runtimeContext,
    });

    expect(candidateActions.createActionApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext,
      }),
    );
    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            runtimeContext: {
              hasTaskContext: true,
              hasHydratedContext: true,
              hasProfileContext: true,
              hasLongTermMemoryContext: true,
              brainToolResultCount: 1,
              hasResumeContext: true,
              pendingApprovalCount: 1,
            },
          }),
        ],
      },
    });
  });
});
