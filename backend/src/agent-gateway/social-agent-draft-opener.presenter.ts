export type SocialAgentDraftOpenerResult = {
  message: string;
  confirmation: {
    actionType: 'send_message';
    title: string;
    body: string;
    primaryAction: string;
    secondaryActions: string[];
    safetyBoundary: string;
  };
  meetLoopStage: 'opener_drafted';
  nextStep: 'user_confirmation_required';
};

export function buildSocialAgentDraftOpenerResult(input: {
  message: string;
  displayName: string;
}): SocialAgentDraftOpenerResult {
  return {
    message: input.message,
    confirmation: {
      actionType: 'send_message',
      title: `这条消息会发送给${input.displayName}`,
      body: '我先帮你写好了，你确认后我再发。确认前不会发送、加好友或创建活动。',
      primaryAction: '确认发送',
      secondaryActions: ['语气更自然', '更简短', '重新生成', '取消'],
      safetyBoundary:
        '建议先站内沟通，第一次见面选择公共场所，不急着交换联系方式。',
    },
    meetLoopStage: 'opener_drafted',
    nextStep: 'user_confirmation_required',
  };
}
