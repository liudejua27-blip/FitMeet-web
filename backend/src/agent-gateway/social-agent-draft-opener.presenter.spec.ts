import { buildSocialAgentDraftOpenerResult } from './social-agent-draft-opener.presenter';

describe('buildSocialAgentDraftOpenerResult', () => {
  it('wraps a generated opener in a user-confirmation card', () => {
    const result = buildSocialAgentDraftOpenerResult({
      message: '周末要不要一起慢跑？',
      displayName: '小林',
    });

    expect(result).toEqual({
      message: '周末要不要一起慢跑？',
      confirmation: {
        actionType: 'send_message',
        title: '这条消息会发送给小林',
        body: '我先帮你写好了，你确认后我再发。确认前不会发送、加好友或创建活动。',
        primaryAction: '确认发送',
        secondaryActions: ['语气更自然', '更简短', '重新生成', '取消'],
        safetyBoundary:
          '建议先站内沟通，第一次见面选择公共场所，不急着交换联系方式。',
      },
      meetLoopStage: 'opener_drafted',
      nextStep: 'user_confirmation_required',
    });
  });
});
