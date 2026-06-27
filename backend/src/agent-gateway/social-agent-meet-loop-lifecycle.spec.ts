import { resolveSocialAgentMeetLoopLifecycle } from './social-agent-meet-loop-lifecycle';

describe('resolveSocialAgentMeetLoopLifecycle', () => {
  it.each([
    [
      'reply_received',
      'continue_conversation',
      'negotiating_time',
      '继续确认约练时间',
    ],
    [
      'reschedule_requested',
      'reschedule_time_window',
      'negotiating_time',
      '继续确认约练时间',
    ],
    [
      'activity_draft_created',
      'user_next_message',
      'reminder_scheduled',
      '约练提醒已安排',
    ],
    [
      'activity_confirmed',
      'activity_check_in',
      'checkin_available',
      '约练快开始了',
    ],
    ['activity_completed', 'review', 'review_requested', '记录这次约练反馈'],
    ['trust_score_updated', 'user_next_message', 'closed', '约练闭环已完成'],
  ])('maps %s/%s to %s', (stage, waitingFor, lifecycleStage, reminderTitle) => {
    expect(
      resolveSocialAgentMeetLoopLifecycle({ stage, waitingFor }),
    ).toMatchObject({
      stage: lifecycleStage,
      reminderTitle,
    });
  });

  it('lets persisted lifecycleStage act as a fencing user-facing state', () => {
    expect(
      resolveSocialAgentMeetLoopLifecycle({
        stage: 'activity_confirmed',
        waitingFor: 'activity_check_in',
        state: { lifecycleStage: 'review_requested' },
      }),
    ).toMatchObject({
      stage: 'review_requested',
      label: '待评价',
    });
  });
});
