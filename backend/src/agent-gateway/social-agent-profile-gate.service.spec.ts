import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentProfileGateService } from './social-agent-profile-gate.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '帮我找人约练',
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
    intent: 'social_search',
    confidence: 0.9,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: true,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'search_candidates',
    source: 'rules',
    ...overrides,
  };
}

describe('SocialAgentProfileGateService', () => {
  it('summarizes the minimum profile gate for the Agent entry screen', async () => {
    const service = new SocialAgentProfileGateService(
      {
        getLifeGraph: jest.fn().mockResolvedValue({
          completeness: { completenessScore: 35 },
          fields: {
            identity: [
              {
                category: 'identity',
                fieldKey: 'city',
                fieldValue: '青岛',
              },
            ],
          },
        }),
      } as never,
      {
        get: jest.fn().mockResolvedValue({
          fitnessGoals: ['羽毛球'],
          weekdayAvailability: '',
          weekendAvailability: '',
          privacyBoundary: '只在公共场所，先站内聊',
          profileDiscoverable: false,
          agentCanRecommendMe: false,
          completion: {
            percent: 50,
            readinessLevel: 'profile_missing',
            canEnterMatchPool: false,
            nextActions: ['补齐可约时间', '确认公开授权'],
          },
        }),
      } as never,
    );

    const result = await service.getMinimumProfileStatus(7);

    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(['availability', 'publicAuthorization']);
    expect(result.profileCompleteness).toBe(50);
    expect(result.canEnterMatchPool).toBe(false);
    expect(result.nextActions).toEqual(['补齐可约时间', '确认公开授权']);
    expect(result.assistantMessage).toContain('可约时间');
  });

  it('asks for the minimum profile fields before social execution', async () => {
    const service = new SocialAgentProfileGateService({
      getLifeGraph: jest.fn().mockResolvedValue({
        completeness: { completenessScore: 0 },
        fields: {},
      }),
    } as never);
    const task = makeTask({ goal: '帮我看看' });

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '帮我找个人一起出去',
    });

    expect(result.passed).toBe(false);
    expect(result.missing).toEqual([
      'city',
      'activity',
      'availability',
      'boundary',
      'publicAuthorization',
    ]);
    expect(result.assistantMessage).toContain('是否允许公开发起活动');
    expect(result.assistantMessage).toContain('不公开发起活动');
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          objective: 'minimum_profile_gate',
          waitingFor: 'minimum_profile_gate',
        }),
      },
    });
  });

  it('passes when the user provides city, activity, time, boundary, and public authorization', async () => {
    const service = new SocialAgentProfileGateService();
    const task = makeTask();

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
      }),
      message:
        '青岛市南区，周末下午，轻松跑步，公共场所先站内聊，接受陌生人，可以公开发起活动',
    });

    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('passes social execution when the user explicitly chooses not to publish publicly', async () => {
    const service = new SocialAgentProfileGateService();
    const task = makeTask();

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute({
        entities: {
          city: '青岛',
          activityType: '跑步',
          targetGender: '',
          timePreference: '周末下午',
          locationPreference: '',
        },
      }),
      message:
        '青岛市南区，周末下午，轻松跑步，公共场所先站内聊，接受陌生人，不公开发起活动，先推荐真实用户，不要自动发消息',
    });

    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
    expect(task.memory).toMatchObject({
      taskMemory: {
        boundaries: expect.objectContaining({
          publicActivityAllowed: false,
        }),
      },
    });
  });
});
