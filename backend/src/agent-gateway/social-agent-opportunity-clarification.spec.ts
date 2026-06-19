import { AgentTask } from './entities/agent-task.entity';
import {
  evaluateSocialOpportunityClarification,
} from './social-agent-opportunity-clarification';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 42,
    ownerUserId: 7,
    goal: '',
    memory: {},
    result: {},
    ...overrides,
  } as AgentTask;
}

function route(
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

describe('social opportunity clarification', () => {
  it('blocks vague social discovery until safety-critical context is clarified', () => {
    const currentTask = task();

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message: '我想找人一起跑步',
    });

    expect(clarification.complete).toBe(false);
    expect(clarification.missing).toEqual([
      'city',
      'time',
      'intensity',
      'relationshipGoal',
      'boundary',
      'strangerPolicy',
      'publicActivity',
    ]);
    expect(clarification.assistantMessage).toContain('为了只推荐安全、合适的机会');
    expect(clarification.assistantMessage).toContain('城市/大致区域');
    expect(clarification.assistantMessage).toContain('想认识的人或关系目标');
    expect(clarification.assistantMessage).toContain('是否接受陌生人');
    expect(clarification.assistantMessage).toContain('是否公开发起活动');
    expect(readSocialAgentTaskMemory(currentTask).currentTask).toMatchObject({
      awaitingSearchConfirmation: true,
      waitingFor: 'opportunity_clarification',
      shouldSearchNow: false,
      lastCompletedStep: 'social_intent_detected',
    });
  });

  it('keeps a generic social goal blocked until the candidate preference is clear', () => {
    const currentTask = task();

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message:
        '帮我找青岛周末下午轻松跑步搭子，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
    });

    expect(clarification.complete).toBe(true);
    expect(clarification.missing).toEqual([]);
    expect(clarification.searchGoal).toContain('跑步搭子');
    expect(clarification.searchGoal).toContain('公共场所');
    expect(clarification.searchGoal).toContain('接受陌生人');
    expect(clarification.searchGoal).toContain('可公开发起活动');
  });

  it('accepts a complete follow-up even when route entities were not pre-filled', () => {
    const currentTask = task({
      memory: {
        taskMemory: {
          currentGoal: '我想找人一起跑步',
          lastUserMessages: [
            {
              text: '我想找人一起跑步',
              intent: 'social_search',
              at: '2026-06-14T00:00:00.000Z',
            },
          ],
          currentTask: {
            awaitingSearchConfirmation: true,
            waitingFor: 'opportunity_clarification',
          },
        },
      },
    });

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message:
        '青岛周末下午，轻松跑步，想认识同城周末有空、愿意先运动再慢慢熟悉的人，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
    });

    expect(clarification.complete).toBe(true);
    expect(clarification.missing).toEqual([]);
    expect(clarification.searchGoal).toContain('青岛');
    expect(clarification.searchGoal).toContain('周末');
    expect(clarification.searchGoal).toContain('跑步');
    expect(clarification.searchGoal).toContain('轻松/低压力');
    expect(clarification.searchGoal).toContain('同城周末有空');
    expect(clarification.searchGoal).toContain('愿意先运动再慢慢熟悉');
    expect(clarification.searchGoal).toContain('公共场所');
  });

  it('allows city-level activity opportunity search before a precise venue is known', () => {
    const currentTask = task();

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route({
        intent: 'activity_search',
        replyStrategy: 'search_activities',
      }),
      message:
        '青岛周末下午轻松羽毛球，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
    });

    expect(clarification.complete).toBe(true);
    expect(clarification.missing).toEqual([]);
    expect(clarification.searchGoal).toContain('青岛');
    expect(clarification.searchGoal).toContain('羽毛球');
    expect(clarification.searchGoal).toContain('可公开发起活动');
  });

  it('accepts activity opportunity search after the location is explicit', () => {
    const currentTask = task();

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route({
        intent: 'activity_search',
        replyStrategy: 'search_activities',
      }),
      message:
        '青岛周末下午，青岛大学附近，轻松羽毛球，只在公共场所，先站内聊，接受陌生人，可以公开发起活动',
    });

    expect(clarification.complete).toBe(true);
    expect(clarification.missing).toEqual([]);
    expect(clarification.searchGoal).toContain('青岛大学附近');
    expect(clarification.searchGoal).toContain('轻松/低压力');
  });

  it('treats school and gender preferences as a concrete relationship goal', () => {
    const currentTask = task();

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message:
        '现在帮我找青岛大学同校女生，周末下午轻松跑步或散步，公共场所先站内聊，接受陌生人，不公开发起。',
    });

    expect(clarification.complete).toBe(true);
    expect(clarification.missing).toEqual([]);
    expect(clarification.searchGoal).toContain('青岛');
    expect(clarification.searchGoal).toContain('周末');
    expect(clarification.searchGoal).toContain('轻松/低压力');
    expect(clarification.searchGoal).toContain('青岛大学同校女生');
    expect(clarification.searchGoal).toContain('公共场所');
  });

  it('keeps city/time/activity requests blocked until stranger and public-activity policy are explicit', () => {
    const currentTask = task();

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message: '青岛周末下午找个轻松跑步搭子，只在公共场所，先站内聊',
    });

    expect(clarification.complete).toBe(false);
    expect(clarification.missing).toEqual([
      'strangerPolicy',
      'publicActivity',
    ]);
    expect(clarification.assistantMessage).toContain('是否接受陌生人');
    expect(clarification.assistantMessage).toContain('是否公开发起活动');
    expect(clarification.assistantMessage).toContain(
      '还差 是否接受陌生人、是否公开发起活动',
    );
    expect(clarification.assistantMessage).not.toContain(
      '还差 城市/大致区域',
    );
    expect(clarification.assistantMessage).not.toContain('还差 时间');
    expect(clarification.assistantMessage).not.toContain(
      '还差 运动或见面场景',
    );
    expect(readSocialAgentTaskMemory(currentTask).currentTask).toMatchObject({
      awaitingSearchConfirmation: true,
      waitingFor: 'opportunity_clarification',
      shouldSearchNow: false,
    });
  });

  it('does not repeat the full clarification example on follow-up turns', () => {
    const currentTask = task();

    evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message: '我想找人一起跑步',
    });

    const followUp = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message: '青岛周末下午，轻松跑步，只在公共场所，先站内聊',
    });

    expect(followUp.complete).toBe(false);
    expect(followUp.missing).toEqual([
      'relationshipGoal',
      'strangerPolicy',
      'publicActivity',
    ]);
    expect(followUp.assistantMessage).toContain('现在只差');
    expect(followUp.assistantMessage).toContain('是否接受陌生人');
    expect(followUp.assistantMessage).toContain('是否公开发起活动');
    expect(followUp.assistantMessage).not.toContain('你可以一句话补齐，比如');
    expect(followUp.assistantMessage).not.toContain('城市/大致区域');
    expect(followUp.assistantMessage).not.toContain('运动或见面场景');
    expect(readSocialAgentTaskMemory(currentTask).currentTask).toMatchObject({
      clarificationTurns: 2,
      clarificationMissingFields: [
        'relationshipGoal',
        'strangerPolicy',
        'publicActivity',
      ],
    });
  });

  it('uses completed task slots so follow-up messages do not repeat answered fields', () => {
    const currentTask = task({
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
            value: '青岛大学附近',
            state: 'completed',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
            completedAt: '2026-06-17T00:00:00.000Z',
          },
          geo_area: {
            key: 'geo_area',
            value: '崂山区',
            state: 'inferred',
            source: 'inferred',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
          intensity: {
            key: 'intensity',
            value: '低强度',
            state: 'answered',
            source: 'user_message',
            updatedAt: '2026-06-17T00:00:00.000Z',
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
        taskMemory: {
          currentGoal: '周末下午，散步，崂山区青岛大学',
          currentTask: {
            awaitingSearchConfirmation: true,
            waitingFor: 'opportunity_clarification',
            clarificationTurns: 1,
            clarificationAskedFields: ['city', 'time', 'activity', 'intensity'],
          },
        },
      },
    });

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message: '可以，帮我找人',
    });

    expect(clarification.complete).toBe(false);
    expect(clarification.missing).not.toEqual(
      expect.arrayContaining(['city', 'time', 'activity', 'intensity', 'boundary', 'publicActivity']),
    );
    expect(clarification.assistantMessage).not.toContain('城市/大致区域');
    expect(clarification.assistantMessage).not.toContain('运动或见面场景');
    expect(clarification.assistantMessage).not.toContain('运动强度');
    expect(clarification.assistantMessage).not.toMatch(/还差[^。]*时间/);
    expect(clarification.assistantMessage).not.toMatch(/只差[^。]*时间/);
    expect(clarification.searchGoal).toContain('周末下午');
    expect(clarification.searchGoal).toContain('散步');
    expect(clarification.searchGoal).toContain('青岛大学附近');
  });

  it('does not treat inferred required slots as user-confirmed answers', () => {
    const currentTask = task({
      memory: {
        taskSlots: {
          activity: {
            key: 'activity',
            value: '散步',
            state: 'inferred',
            source: 'inferred',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
          time_window: {
            key: 'time_window',
            value: '周末下午',
            state: 'inferred',
            source: 'inferred',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
          location_text: {
            key: 'location_text',
            value: '青岛大学附近',
            state: 'inferred',
            source: 'inferred',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
          geo_area: {
            key: 'geo_area',
            value: '崂山区',
            state: 'inferred',
            source: 'inferred',
            updatedAt: '2026-06-17T00:00:00.000Z',
          },
        },
        taskMemory: {
          currentGoal: '想找搭子',
          currentTask: {
            awaitingSearchConfirmation: true,
            waitingFor: 'opportunity_clarification',
          },
        },
      },
    });

    const clarification = evaluateSocialOpportunityClarification({
      task: currentTask,
      route: route(),
      message: '可以，继续',
    });

    expect(clarification.complete).toBe(false);
    expect(clarification.missing).toEqual(
      expect.arrayContaining(['time', 'activity']),
    );
    expect(clarification.missing).not.toContain('city');
    expect(clarification.assistantMessage).toContain('时间');
    expect(clarification.assistantMessage).toContain('运动或见面场景');
    expect(clarification.assistantMessage).not.toContain('城市/大致区域');
  });
});
