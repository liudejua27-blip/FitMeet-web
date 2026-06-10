import { buildSocialAgentProfileSavedNextStepReply } from './social-agent-profile-next-step-reply';

describe('buildSocialAgentProfileSavedNextStepReply', () => {
  it('prompts for search confirmation after saving profile context', () => {
    const reply = buildSocialAgentProfileSavedNextStepReply({
      intent: 'profile_update',
      message: '我周末下午比较有空',
      profileUpdated: true,
    });

    expect(reply).toContain('已保存到你的画像/偏好上下文');
    expect(reply).toContain('我不会自动开始找人');
    expect(reply).toContain('现在开始搜索');
  });

  it('keeps safety boundary replies explicit and non-automatic', () => {
    const reply = buildSocialAgentProfileSavedNextStepReply({
      intent: 'safety_or_boundary',
      message: '不要夜间见面',
      profileUpdated: true,
    });

    expect(reply).toContain('边界内容：不要夜间见面');
    expect(reply).toContain('不会自动发送消息、加好友或创建活动');
    expect(reply).toContain('现在开始搜索');
  });
});
