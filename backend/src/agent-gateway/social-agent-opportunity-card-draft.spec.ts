import type { AgentTask } from './entities/agent-task.entity';
import {
  buildSocialAgentOpportunityDraftFromTask,
  buildSocialAgentPublishConfirmationCard,
} from './social-agent-opportunity-card-draft';

describe('social agent opportunity card draft', () => {
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
    } as AgentTask;

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
});
