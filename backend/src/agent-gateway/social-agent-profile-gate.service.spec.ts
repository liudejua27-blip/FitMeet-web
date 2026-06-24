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

  it('asks only for search-critical fields before candidate search', async () => {
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
    expect(result.missing).toEqual(['city', 'activity', 'availability']);
    expect(result.assistantMessage).toContain('基础资料');
    expect(result.assistantMessage).not.toContain('暂不公开到发现');
    expect(task.memory).toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          objective: 'minimum_profile_gate',
          waitingFor: 'minimum_profile_gate',
        }),
      },
    });
  });

  it('keeps action execution gated by boundary and public authorization', async () => {
    const service = new SocialAgentProfileGateService({
      getLifeGraph: jest.fn().mockResolvedValue({
        completeness: { completenessScore: 0 },
        fields: {},
      }),
    } as never);
    const task = makeTask();

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'action_request',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
        entities: {
          city: '青岛',
          activityType: '散步',
          targetGender: '',
          timePreference: '今晚',
          locationPreference: '',
        },
      }),
      message: '青岛今晚散步，帮我直接发邀请',
    });

    expect(result.passed).toBe(false);
    expect(result.missing).toEqual(['boundary', 'publicAuthorization']);
    expect(result.assistantMessage).toContain('社交边界');
    expect(result.assistantMessage).toContain('是否允许公开发起活动');
  });

  it('asks all minimum profile fields at once for a vague publish-card request', async () => {
    const service = new SocialAgentProfileGateService({
      getLifeGraph: jest.fn().mockResolvedValue({
        completeness: { completenessScore: 0 },
        fields: {},
      }),
    } as never);
    const task = makeTask({ goal: '帮我发布约练卡片' });

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'action_request',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
      }),
      message: '帮我发布约练卡片',
    });

    expect(result.passed).toBe(false);
    expect(result.missing).toEqual([
      'city',
      'activity',
      'availability',
      'boundary',
      'publicAuthorization',
    ]);
    expect(result.assistantMessage).toContain('一次性确认');
    expect(result.assistantMessage).toContain('城市/大致区域');
    expect(result.assistantMessage).toContain('想参与的运动或社交场景');
    expect(result.assistantMessage).toContain('可约时间');
    expect(result.assistantMessage).toContain('社交边界');
    expect(result.assistantMessage).toContain('是否允许公开发起活动');
    expect(result.assistantMessage).toContain('暂不确定');
    expect(result.assistantMessage).toContain('本次使用，不保存');
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

  it('uses completed task slots so follow-up turns do not repeat profile gate questions', async () => {
    const service = new SocialAgentProfileGateService();
    const task = makeTask({
      goal: '周末下午，散步，崂山区青岛大学，公共场所，先站内聊，可以公开到发现',
      memory: {
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '周末下午',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          location_text: {
            key: 'location_text',
            value: '崂山区青岛大学',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          safety_boundary: {
            key: 'safety_boundary',
            value: '首次见面优先公共场所，先在平台内沟通',
            state: 'answered',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
          visibility: {
            key: 'visibility',
            value: '可公开到发现',
            state: 'answered',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
        },
      },
    });

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '可以，帮我找人',
    });

    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.assistantMessage).toBe('');
    expect(task.memory).not.toMatchObject({
      taskMemory: {
        currentTask: expect.objectContaining({
          waitingFor: 'minimum_profile_gate',
        }),
      },
    });
  });

  it('uses current task slots in the minimum gate so the Agent page does not repeat answered fields', async () => {
    const service = new SocialAgentProfileGateService(
      {
        getLifeGraph: jest.fn().mockResolvedValue({
          completeness: { completenessScore: 20 },
          fields: {},
        }),
      } as never,
      {
        get: jest.fn().mockResolvedValue({
          completion: {
            percent: 20,
            readinessLevel: 'profile_missing',
            canEnterMatchPool: false,
            nextActions: ['补齐画像'],
          },
        }),
      } as never,
    );

    const result = await service.getMinimumProfileStatusWithTaskSlots(7, {
      activity: {
        key: 'activity',
        value: '散步',
        state: 'completed',
      },
      time_window: {
        key: 'time_window',
        value: '周末下午',
        state: 'completed',
      },
      location_text: {
        key: 'location_text',
        value: '崂山区青岛大学',
        state: 'completed',
      },
      safety_boundary: {
        key: 'safety_boundary',
        value: '首次见面优先公共场所，先站内聊',
        state: 'answered',
      },
      visibility: {
        key: 'visibility',
        value: '可公开到发现',
        state: 'answered',
      },
    });

    expect(result).toMatchObject({
      passed: true,
      missing: [],
      assistantMessage: '',
      canEnterMatchPool: true,
    });
  });

  it('accepts a direct city slot without requiring a location-derived geo area', async () => {
    const service = new SocialAgentProfileGateService(
      {
        getLifeGraph: jest.fn().mockResolvedValue({
          completeness: { completenessScore: 20 },
          fields: {},
        }),
      } as never,
      {
        get: jest.fn().mockResolvedValue({
          completion: {
            percent: 20,
            readinessLevel: 'profile_missing',
            canEnterMatchPool: false,
            nextActions: ['补齐画像'],
          },
        }),
      } as never,
    );

    const result = await service.getMinimumProfileStatusWithTaskSlots(7, {
      city: {
        key: 'city',
        value: '上海',
        state: 'completed',
      },
      activity: {
        key: 'activity',
        value: '瑜伽',
        state: 'completed',
      },
      time_window: {
        key: 'time_window',
        value: '周六下午',
        state: 'completed',
      },
      safety_boundary: {
        key: 'safety_boundary',
        value: '首次见面优先公共场所，先站内聊',
        state: 'answered',
      },
      visibility: {
        key: 'visibility',
        value: '可公开到发现',
        state: 'answered',
      },
    });

    expect(result).toMatchObject({
      passed: true,
      missing: [],
      assistantMessage: '',
      canEnterMatchPool: true,
    });
  });

  it('uses nested direct city task slots so restored tasks do not ask city again', async () => {
    const service = new SocialAgentProfileGateService();
    const task = makeTask({
      memory: {
        taskMemory: {
          taskSlots: {
            city: {
              key: 'city',
              value: '上海',
              state: 'completed',
              source: 'user_message',
            },
            activity: {
              key: 'activity',
              value: '瑜伽',
              state: 'completed',
              source: 'user_message',
            },
            time_window: {
              key: 'time_window',
              value: '周六下午',
              state: 'completed',
              source: 'user_message',
            },
          },
        },
      },
    });

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute(),
      message: '可以，继续',
    });

    expect(result.passed).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.assistantMessage).toBe('');
  });

  it('does not let inferred-only slots bypass the minimum gate', async () => {
    const service = new SocialAgentProfileGateService(
      {
        getLifeGraph: jest.fn().mockResolvedValue({
          completeness: { completenessScore: 20 },
          fields: {},
        }),
      } as never,
      {
        get: jest.fn().mockResolvedValue({
          completion: {
            percent: 20,
            readinessLevel: 'profile_missing',
            canEnterMatchPool: false,
            nextActions: ['补齐画像'],
          },
        }),
      } as never,
    );

    const result = await service.getMinimumProfileStatusWithTaskSlots(7, {
      activity: {
        key: 'activity',
        value: '散步',
        state: 'inferred',
        source: 'inferred',
      },
      time_window: {
        key: 'time_window',
        value: '周末下午',
        state: 'inferred',
        source: 'inferred',
      },
      location_text: {
        key: 'location_text',
        value: '青岛大学附近',
        state: 'inferred',
        source: 'inferred',
      },
      safety_boundary: {
        key: 'safety_boundary',
        value: '首次见面优先公共场所，先站内聊',
        state: 'inferred',
        source: 'inferred',
      },
      visibility: {
        key: 'visibility',
        value: '可公开到发现',
        state: 'inferred',
        source: 'inferred',
      },
    });

    expect(result.passed).toBe(false);
    expect(result.missing).toEqual([
      'city',
      'activity',
      'availability',
      'boundary',
      'publicAuthorization',
    ]);
    expect(result.canEnterMatchPool).toBe(false);
  });

  it('allows inferred geo area as a coarse city signal but not inferred safety consent', async () => {
    const service = new SocialAgentProfileGateService();
    const task = makeTask({
      memory: {
        taskSlots: {
          geo_area: {
            key: 'geo_area',
            value: '崂山区',
            state: 'inferred',
            source: 'inferred',
          },
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
          safety_boundary: {
            key: 'safety_boundary',
            value: '首次见面优先公共场所，先站内聊',
            state: 'inferred',
            source: 'inferred',
          },
          visibility: {
            key: 'visibility',
            value: '可公开到发现',
            state: 'inferred',
            source: 'inferred',
          },
        },
      },
    });

    const result = await service.evaluateForSocialExecution({
      ownerUserId: 7,
      task,
      route: makeRoute({
        intent: 'action_request',
        shouldExecuteAction: true,
        replyStrategy: 'execute_action',
      }),
      message: '可以，帮我发邀请',
    });

    expect(result.passed).toBe(false);
    expect(result.missing).not.toContain('city');
    expect(result.missing).not.toContain('activity');
    expect(result.missing).not.toContain('availability');
    expect(result.missing).toEqual(['boundary', 'publicAuthorization']);
  });
});
