import type { AntGuideCopy, AntGuideState } from './AntGuide.types';

export const ANT_GUIDE_COPY: Record<AntGuideState, AntGuideCopy> = {
  idle: {
    title: '我在这里',
    description: '可以直接提问；需要找人或约练时再告诉我。',
  },
  thinking: {
    title: '我正在理解你的想法',
    description: '我会结合兴趣、城市和当前场景生成建议。',
  },
  discovering: {
    title: '正在发现附近场景',
    description: '优先寻找更自然、更容易开口的社交机会。',
  },
  recommending: {
    title: '我找到了一些建议',
    description: '这些场景更适合轻松破冰和持续交流。',
  },
  reminding: {
    title: '先保护好边界',
    description: '建议先站内聊几句，第一次见面优先选择公共场所。',
  },
  confirming: {
    title: '需要你确认一下',
    description: '确认后我再帮你执行下一步。',
  },
  success: {
    title: '完成了',
    description: '我已经为你准备好下一步建议。',
  },
  error: {
    title: '还差一点信息',
    description: '补充城市、兴趣或社交意图后，我可以推荐得更准确。',
  },
};

export const ANT_GUIDE_ARIA_LABELS: Record<AntGuideState, string> = {
  idle: '智能小蚁正在等待你的输入',
  thinking: '智能小蚁正在理解你的需求',
  discovering: '智能小蚁正在发现附近场景',
  recommending: '智能小蚁已找到推荐',
  reminding: '智能小蚁正在提示安全边界',
  confirming: '智能小蚁正在等待你确认操作',
  success: '智能小蚁已完成操作',
  error: '智能小蚁需要更多信息才能继续',
};

export const ANT_GUIDE_GLOW_COLORS: Record<AntGuideState, string> = {
  idle: '#f2cc75',
  thinking: '#7db7ff',
  discovering: '#4f8cff',
  recommending: '#16b87a',
  reminding: '#f2b84b',
  confirming: '#8c7bff',
  success: '#16b87a',
  error: '#b5a887',
};

export const ANT_GUIDE_GLOW_STRENGTH: Record<AntGuideState, string> = {
  idle: '0.34',
  thinking: '0.52',
  discovering: '0.68',
  recommending: '0.58',
  reminding: '0.62',
  confirming: '0.64',
  success: '0.7',
  error: '0.22',
};
