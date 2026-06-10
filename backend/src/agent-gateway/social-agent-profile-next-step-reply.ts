import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentIntentType } from './social-agent-intent-router.service';

export function buildSocialAgentProfileSavedNextStepReply(input: {
  intent: SocialAgentIntentType;
  message: string;
  profileUpdated: boolean;
}): string {
  const savedLine = input.profileUpdated
    ? '已保存到你的画像/偏好上下文。'
    : '我已经先把这条偏好记在当前对话里。';
  if (input.intent === 'safety_or_boundary') {
    return [
      savedLine,
      `边界内容：${cleanDisplayText(input.message, '')}`,
      '后续推荐会按这条边界处理，不会自动发送消息、加好友或创建活动。',
      '如果你准备好了，可以直接说“现在开始搜索”；如果还想补充时间、地点或活动类型，也可以继续告诉我。',
    ].join('\n');
  }
  return [
    savedLine,
    `本次补充：${cleanDisplayText(input.message, '')}`,
    '我不会自动开始找人。你可以继续补可约时间、活动类型和边界要求，或者直接说“现在开始搜索”。',
  ].join('\n');
}
