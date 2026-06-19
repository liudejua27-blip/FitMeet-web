import type {
  FitMeetAgentTrace,
  FitMeetAlphaAgentName,
} from './fitmeet-alpha-agent.types';

export const FITMEET_ALPHA_NEXT_AGENT_VALUES = [
  'life_graph',
  'social_match',
  'meet_loop',
  'math',
  'answer',
] as const;

export type FitMeetAlphaNextAgent =
  (typeof FITMEET_ALPHA_NEXT_AGENT_VALUES)[number];

export const FITMEET_ALPHA_AGENT_PATH: FitMeetAlphaAgentName[] = [
  'FitMeet Main Agent',
  'Agent Brain',
  'Life Graph Agent',
  'Social Match Agent',
  'Meet Loop Agent',
  'Math Agent',
];

export const FITMEET_ALPHA_AGENT_TOOL_OWNERS: Record<
  FitMeetAlphaAgentName,
  string[]
> = {
  'FitMeet Main Agent': [],
  'Agent Brain': [],
  'Life Graph Agent': [
    'get_user_profile',
    'update_profile_from_agent_context',
    'append_profile_memory',
  ],
  'Social Match Agent': [
    'search_real_candidates',
    'search_public_intents',
    'create_social_request',
    'get_candidate_detail',
  ],
  'Meet Loop Agent': [
    'send_message_to_candidate',
    'connect_candidate',
    'create_activity',
    'get_conversation_messages',
  ],
  'Math Agent': [],
};

export const FITMEET_ALPHA_AGENT_HANDOFFS: FitMeetAgentTrace['handoffs'] = [
  {
    from: 'FitMeet Main Agent',
    to: 'Life Graph Agent',
    reason: '读取授权画像、偏好、边界和生活节奏。',
  },
  {
    from: 'FitMeet Main Agent',
    to: 'Social Match Agent',
    reason: '解析社交需求并生成候选推荐。',
  },
  {
    from: 'FitMeet Main Agent',
    to: 'Meet Loop Agent',
    reason: '在用户确认后推进消息、连接、活动和评价闭环。',
  },
  {
    from: 'FitMeet Main Agent',
    to: 'Math Agent',
    reason: '处理配速、时间、距离和轻量运动热量估算，不读写用户数据。',
  },
];

export const FITMEET_ALPHA_NEXT_AGENT_MAP: Record<
  FitMeetAlphaNextAgent,
  FitMeetAlphaAgentName | null
> = {
  life_graph: 'Life Graph Agent',
  social_match: 'Social Match Agent',
  meet_loop: 'Meet Loop Agent',
  math: 'Math Agent',
  answer: 'FitMeet Main Agent',
};

export function fitMeetAlphaAgentForNextAgent(
  nextAgent: unknown,
): FitMeetAlphaAgentName | null {
  if (!isFitMeetAlphaNextAgent(nextAgent)) return null;
  return FITMEET_ALPHA_NEXT_AGENT_MAP[nextAgent];
}

export function fitMeetAlphaAgentOwnersForTool(
  toolName: string,
): FitMeetAlphaAgentName[] {
  return FITMEET_ALPHA_AGENT_PATH.filter((agentName) =>
    FITMEET_ALPHA_AGENT_TOOL_OWNERS[agentName].includes(toolName),
  );
}

export function isFitMeetAlphaNextAgent(
  value: unknown,
): value is FitMeetAlphaNextAgent {
  return (
    typeof value === 'string' &&
    (FITMEET_ALPHA_NEXT_AGENT_VALUES as readonly string[]).includes(value)
  );
}
