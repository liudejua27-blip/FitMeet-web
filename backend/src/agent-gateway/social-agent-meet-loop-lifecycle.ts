export type SocialAgentMeetLoopLifecycleStage =
  | 'negotiating_time'
  | 'reminder_scheduled'
  | 'checkin_available'
  | 'review_requested'
  | 'closed';

export type SocialAgentMeetLoopLifecycle = {
  stage: SocialAgentMeetLoopLifecycleStage;
  label: string;
  reminderTitle: string;
  reminderMessage: string;
  nextAction: string;
};

export function resolveSocialAgentMeetLoopLifecycle(input: {
  stage?: unknown;
  waitingFor?: unknown;
  state?: Record<string, unknown> | null;
}): SocialAgentMeetLoopLifecycle {
  const state = input.state ?? {};
  const explicit = normalizeLifecycleStage(state.lifecycleStage);
  if (explicit) return lifecycleCopy(explicit);

  const stage = clean(input.stage ?? state.loopStage ?? state.status);
  const waitingFor = clean(input.waitingFor ?? state.waitingFor);

  if (
    stage === 'review_submitted' ||
    stage === 'trust_score_updated' ||
    stage === 'closed'
  ) {
    return lifecycleCopy('closed');
  }
  if (stage === 'activity_completed' || waitingFor === 'review') {
    return lifecycleCopy('review_requested');
  }
  if (
    stage === 'activity_confirmed' ||
    stage === 'activity_checked_in' ||
    waitingFor === 'activity_check_in' ||
    waitingFor === 'activity_complete'
  ) {
    return lifecycleCopy('checkin_available');
  }
  if (
    stage === 'reply_received' ||
    stage === 'reschedule_requested' ||
    waitingFor === 'continue_conversation' ||
    waitingFor === 'reschedule_time_window' ||
    waitingFor === 'meet_loop_resume_confirmation'
  ) {
    return lifecycleCopy('negotiating_time');
  }
  if (
    stage === 'activity_draft_created' ||
    stage === 'activity_publish_cancelled'
  ) {
    return lifecycleCopy('reminder_scheduled');
  }
  return lifecycleCopy('reminder_scheduled');
}

export function socialAgentMeetLoopLifecyclePatch(input: {
  stage?: unknown;
  waitingFor?: unknown;
  state?: Record<string, unknown> | null;
}) {
  const lifecycle = resolveSocialAgentMeetLoopLifecycle(input);
  return {
    lifecycleStage: lifecycle.stage,
    lifecycleLabel: lifecycle.label,
    lifecycleNextAction: lifecycle.nextAction,
    lifecycleReminderTitle: lifecycle.reminderTitle,
    lifecycleReminderMessage: lifecycle.reminderMessage,
  };
}

const LIFECYCLE_COPY: Record<
  SocialAgentMeetLoopLifecycleStage,
  SocialAgentMeetLoopLifecycle
> = {
  negotiating_time: {
    stage: 'negotiating_time',
    label: '正在确认时间',
    reminderTitle: '继续确认约练时间',
    reminderMessage:
      '这次约练还在确认时间或回应阶段。你可以回到 Agent 继续站内沟通；发送邀请、改期或创建活动前仍会再次确认。',
    nextAction: '继续站内沟通或补充新的时间范围。',
  },
  reminder_scheduled: {
    stage: 'reminder_scheduled',
    label: '提醒已安排',
    reminderTitle: '约练提醒已安排',
    reminderMessage:
      '我已经保留这次约练进展。需要继续时可以回到 Agent；不会自动发送消息、发布或修改隐私。',
    nextAction: '打开 Agent 查看保存的约练进展。',
  },
  checkin_available: {
    stage: 'checkin_available',
    label: '可签到',
    reminderTitle: '约练快开始了',
    reminderMessage:
      '这次约练已确认。到达公共场所后可以在 Agent 里签到；签到不会共享你的精确位置。',
    nextAction: '到达后签到，活动结束后再确认完成。',
  },
  review_requested: {
    stage: 'review_requested',
    label: '待评价',
    reminderTitle: '记录这次约练反馈',
    reminderMessage:
      '这次约练已进入评价阶段。提交评价后，我会先生成 Life Graph 更新建议，确认后才写入长期偏好。',
    nextAction: '提交简短评价，确认是否写入长期偏好。',
  },
  closed: {
    stage: 'closed',
    label: '已关闭',
    reminderTitle: '约练闭环已完成',
    reminderMessage:
      '这次约练已经关闭。后续可以在个人信息里查看、纠正或撤回相关长期偏好信号。',
    nextAction: '查看或纠正长期偏好。',
  },
};

function lifecycleCopy(
  stage: SocialAgentMeetLoopLifecycleStage,
): SocialAgentMeetLoopLifecycle {
  return { ...LIFECYCLE_COPY[stage] };
}

function normalizeLifecycleStage(
  value: unknown,
): SocialAgentMeetLoopLifecycleStage | null {
  const text = clean(value);
  return text === 'negotiating_time' ||
    text === 'reminder_scheduled' ||
    text === 'checkin_available' ||
    text === 'review_requested' ||
    text === 'closed'
    ? text
    : null;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
