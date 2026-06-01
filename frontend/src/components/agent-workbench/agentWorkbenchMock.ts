import type { AgentConversation, AgentRunEvent } from './agentWorkbenchTypes';

export const quickPrompts = [
  '我想找一个今晚一起健身的人',
  '帮我完善我的社交画像',
  '帮我写一句不尴尬的开场白',
  '推荐几个附近和我同频的人',
  '创建一次周末约练活动',
];

export const recentConversations: AgentConversation[] = [
  {
    id: 'run-mate',
    title: '周末跑步搭子',
    type: '找搭子',
    updatedAt: '今天',
  },
  {
    id: 'profile',
    title: '补全可约时间和边界',
    type: '画像完善',
    updatedAt: '昨天',
  },
  {
    id: 'opener',
    title: '给健身搭子的开场白',
    type: '聊天建议',
    updatedAt: '周一',
  },
  {
    id: 'safety',
    title: '第一次见面安全提醒',
    type: '安全提醒',
    updatedAt: '上周',
  },
];

export const initialRunEvents: AgentRunEvent[] = [
  {
    stepId: 'intent',
    type: 'intent_detected',
    title: '正在理解你的社交需求',
    status: 'pending',
    agent: 'FitMeetAgent',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'profile',
    type: 'profile_loaded',
    title: '正在读取 Life Graph',
    status: 'pending',
    agent: 'LifeGraphAgent',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'permission',
    type: 'permission_checked',
    title: '正在检查权限边界',
    status: 'pending',
    agent: 'SafetyAgent',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'search',
    type: 'tool_call_started',
    title: '正在搜索附近候选用户',
    status: 'pending',
    agent: 'MatchAgent',
    tool: 'fitmeet_search_candidates',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'score',
    type: 'candidates_scored',
    title: '正在计算匹配度',
    status: 'pending',
    agent: 'MatchAgent',
    tool: 'fitmeet_score_candidates',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'safety',
    type: 'safety_checked',
    title: '正在过滤低信任风险',
    status: 'pending',
    agent: 'SafetyAgent',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'cards',
    type: 'tool_call_finished',
    title: '正在生成推荐卡片',
    status: 'pending',
    agent: 'FitMeetAgent',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'icebreaker',
    type: 'tool_call_finished',
    title: '正在准备高情商开场白',
    status: 'pending',
    agent: 'ConversationAgent',
    tool: 'fitmeet_generate_icebreaker',
    createdAt: new Date().toISOString(),
  },
  {
    stepId: 'approval',
    type: 'action_required',
    title: '等待你确认下一步操作',
    status: 'pending',
    agent: 'SafetyAgent',
    createdAt: new Date().toISOString(),
  },
];
