import type { AgentTask } from './entities/agent-task.entity';
import {
  buildSocialAgentOpportunityDraftFromTask,
  buildSocialAgentPublishConfirmationCard,
  buildSocialAgentSlotCompletionCard,
} from './social-agent-opportunity-card-draft';

describe('social agent opportunity card draft', () => {
  it('asks all publish-critical fields at once instead of defaulting city or safety boundary', () => {
    const task = {
      id: 77,
      ownerUserId: 7,
      goal: '帮我发布约练卡片',
      memory: {},
    } as unknown as AgentTask;

    const result = buildSocialAgentOpportunityDraftFromTask(
      task,
      '帮我发布约练卡片',
    );

    expect(result).toMatchObject({
      ready: false,
      missing: ['城市/大致区域', '活动', '时间', '地点', '安全边界'],
      assistantMessage: expect.stringContaining('一次性确认'),
    });
    if (result.ready) return;
    expect(result.assistantMessage).toContain('按安全默认值处理');
    expect(result.assistantMessage).toContain('确认前不会公开');
  });

  it('uses the platform safety default only when the user explicitly asks for it', () => {
    const task = {
      id: 77,
      ownerUserId: 7,
      goal: '继续刚才的约练卡',
      memory: {
        taskSlots: {
          geo_area: {
            value: '上海',
            state: 'completed',
            source: 'user_message',
          },
          activity: {
            value: '瑜伽',
            state: 'completed',
            source: 'user_message',
          },
          time_window: {
            value: '周六下午',
            state: 'completed',
            source: 'user_message',
          },
          location_text: {
            value: '徐汇区公共场所',
            state: 'completed',
            source: 'user_message',
          },
        },
      },
    } as unknown as AgentTask;

    const withoutConsent = buildSocialAgentOpportunityDraftFromTask(
      task,
      '继续',
    );
    expect(withoutConsent).toMatchObject({
      ready: false,
      missing: ['安全边界'],
    });

    const withConsent = buildSocialAgentOpportunityDraftFromTask(
      task,
      '按安全默认值处理',
    );
    expect(withConsent).toMatchObject({
      ready: true,
      draft: {
        city: '上海',
        activityType: '瑜伽',
        timePreference: '周六下午',
        locationName: '徐汇区公共场所',
      },
    });
    if (!withConsent.ready) return;
    expect(withConsent.draft.metadata).toMatchObject({
      safetyBoundary:
        '首次见面优先公共场所，先站内沟通，不公开精确位置或联系方式',
    });
  });

  it('parses the real publish wording and accepts default safety settings wording', () => {
    const task = {
      id: 78,
      ownerUserId: 7,
      goal: '帮我发布一个约练卡片，8.27日下午六点青岛中山公园找一个散步的搭子',
      memory: {},
    } as unknown as AgentTask;

    const result = buildSocialAgentOpportunityDraftFromTask(
      task,
      '按默认安全设置处理',
    );

    expect(result).toMatchObject({
      ready: true,
      draft: {
        city: '青岛',
        activityType: '散步',
        timePreference: '8.27日下午六点',
        locationName: '青岛中山公园',
      },
    });
  });

  it('uses current task slots for city, activity, time, and location instead of default fallbacks', () => {
    const task = {
      id: 77,
      ownerUserId: 7,
      goal: '继续刚才的约练卡',
      memory: {
        taskSlots: {
          geo_area: {
            value: '上海',
            state: 'completed',
            source: 'user_message',
          },
          activity: {
            value: '瑜伽',
            state: 'completed',
            source: 'user_message',
          },
          time_window: {
            value: '周六下午',
            state: 'completed',
            source: 'user_message',
          },
          location_text: {
            value: '徐汇区公共场所',
            state: 'completed',
            source: 'user_message',
          },
          safety_boundary: {
            value: '公共场所，先站内聊',
            state: 'completed',
            source: 'user_message',
          },
        },
      },
    } as unknown as AgentTask;

    const result = buildSocialAgentOpportunityDraftFromTask(task, '继续');

    expect(result).toMatchObject({
      ready: true,
      draft: {
        city: '上海',
        activityType: '瑜伽',
        timePreference: '周六下午',
        locationName: '徐汇区公共场所',
      },
    });
    if (!result.ready) return;

    const card = buildSocialAgentPublishConfirmationCard({
      task,
      draft: result.draft,
    });

    expect(card.body).toContain('上海');
    expect(card.data).toMatchObject({
      city: '上海',
      activityType: '瑜伽',
      time: '周六下午',
      locationName: '徐汇区公共场所',
    });
    expect(card.data.opportunity).toMatchObject({
      city: '上海',
      activityType: '瑜伽',
      time: '周六下午',
      location: '徐汇区公共场所',
    });
    expect(JSON.stringify(card)).not.toContain('青岛');
  });

  it('returns a stable SlotClarificationCard contract with slots and ranking preference', () => {
    const task = {
      id: 79,
      ownerUserId: 7,
      goal: '帮我发布一个散步卡',
      memory: {
        taskMemory: {
          rankingPreference: {
            distance: 1.65,
            time: 1,
            interest: 1,
            language: 1,
            socialStyle: 1.55,
            labels: ['距离优先', '同频优先'],
            reason: '更近一点，能聊得来优先',
            source: 'user_task_preference',
            updatedAt: '2026-06-27T00:00:00.000Z',
          },
        },
        taskSlots: {
          geo_area: {
            value: '青岛',
            state: 'completed',
            source: 'user_message',
          },
          activity: {
            value: '散步',
            state: 'completed',
            source: 'user_message',
          },
        },
      },
    } as unknown as AgentTask;

    const card = buildSocialAgentSlotCompletionCard({
      task,
      missing: ['时间', '地点', '安全边界'],
      sourceText: '明天晚上附近散步',
    });

    expect(card.schemaType).toBe('social_match.slot_completion');
    expect(card.data).toMatchObject({
      workflowState: 'COLLECTING_SLOTS',
      waitingFor: 'safety_boundary',
      missingSlots: [
        expect.objectContaining({ key: 'time', label: '时间' }),
        expect.objectContaining({ key: 'location', label: '地点' }),
        expect.objectContaining({
          key: 'safety_boundary',
          label: '安全边界',
        }),
      ],
      completedSlots: expect.arrayContaining([
        expect.objectContaining({ key: 'city', value: '青岛' }),
        expect.objectContaining({ key: 'activity', value: '散步' }),
      ]),
      rankingPreference: expect.objectContaining({
        distance: 1.65,
        socialStyle: 1.55,
        labels: ['距离优先', '同频优先'],
      }),
      slotPatch: expect.objectContaining({
        city: '青岛',
        activity: '散步',
      }),
    });
    expect(card.actions[0]).toMatchObject({
      schemaAction: 'slot_completion.use_default_safety',
      payload: expect.objectContaining({
        missingSlots: expect.any(Array),
        rankingPreference: expect.objectContaining({ distance: 1.65 }),
      }),
    });
  });
});
