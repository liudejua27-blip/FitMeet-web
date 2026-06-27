import type {
  FitMeetAgentTrace,
  FitMeetAlphaAgentName,
} from './fitmeet-alpha-agent.types';

export const FITMEET_ALPHA_NEXT_AGENT_VALUES = [
  'agent_brain',
  'life_graph_agent',
  'match_agent',
  'main_agent',
] as const;

export type FitMeetAlphaNextAgent =
  (typeof FITMEET_ALPHA_NEXT_AGENT_VALUES)[number];

export const FITMEET_ALPHA_LEGACY_NEXT_AGENT_VALUES = [
  'life_graph',
  'social_match',
  'meet_loop',
  'math',
  'answer',
] as const;

export const FITMEET_ALPHA_ACCEPTED_NEXT_AGENT_VALUES = [
  ...FITMEET_ALPHA_NEXT_AGENT_VALUES,
  ...FITMEET_ALPHA_LEGACY_NEXT_AGENT_VALUES,
] as const;

export type FitMeetAlphaAcceptedNextAgent =
  (typeof FITMEET_ALPHA_ACCEPTED_NEXT_AGENT_VALUES)[number];

export const FITMEET_ALPHA_AGENT_PATH: FitMeetAlphaAgentName[] = [
  'FitMeet Main Agent',
  'Agent Brain',
  'Life Graph Agent',
  'Match Agent',
];

export type FitMeetAlphaAgentRuntimeBoundary = {
  role: 'orchestrator' | 'agent_brain' | 'life_graph_agent' | 'match_agent';
  responsibilities: string[];
  memoryScope: string;
  maxToolCalls: number;
  maxRetries: number;
  scratchpadPolicy: string;
  critiqueEvaluator: string;
  evalHints: Record<string, unknown>;
};

export const FITMEET_ALPHA_AGENT_RUNTIME_BOUNDARIES: Record<
  FitMeetAlphaAgentName,
  FitMeetAlphaAgentRuntimeBoundary
> = {
  'FitMeet Main Agent': {
    role: 'orchestrator',
    responsibilities: [
      'route_turn',
      'enforce_approval_boundaries',
      'compose_user_visible_answer',
    ],
    memoryScope: 'main_agent.turn_state',
    maxToolCalls: 2,
    maxRetries: 1,
    scratchpadPolicy: 'Main agent scratchpad keeps planning notes internal.',
    critiqueEvaluator: 'agent_brain_unified_loop_v1',
    evalHints: {
      needsUnifiedPlannerLoop: true,
    },
  },
  'Agent Brain': {
    role: 'agent_brain',
    responsibilities: [
      'ordinary_chat',
      'lightweight_planning',
      'deterministic_fitness_math',
    ],
    memoryScope: 'agent_brain.turn_memory',
    maxToolCalls: 1,
    maxRetries: 0,
    scratchpadPolicy:
      'Low-cost planning and deterministic calculations only; no private social or profile writes.',
    critiqueEvaluator: 'agent_brain_low_cost_router_v1',
    evalHints: {
      needsUnifiedPlannerLoop: true,
      deterministicOnly: true,
      forbidsPrivacyReadWrite: true,
      needsUnitConversionTests: true,
    },
  },
  'Life Graph Agent': {
    role: 'life_graph_agent',
    responsibilities: [
      'profile_completion',
      'memory_proposal_preview',
      'confirmed_profile_writeback',
    ],
    memoryScope: 'life_graph.profile_memory',
    maxToolCalls: 2,
    maxRetries: 1,
    scratchpadPolicy:
      'Private scratchpad may compare old/new profile facts; never expose sensitive inference.',
    critiqueEvaluator: 'life_graph_conflict_sensitive_merge_v1',
    evalHints: {
      needsConflictDetection: true,
      needsUserConfirmedMerge: true,
      sensitiveInfoClassification: true,
      supportsVersionRollback: true,
    },
  },
  'Match Agent': {
    role: 'match_agent',
    responsibilities: [
      'opportunity_card_publish',
      'discover_sync',
      'candidate_recall_and_rank',
      'opener_invite_friend_message_meet_loop',
    ],
    memoryScope: 'matching.candidate_memory',
    maxToolCalls: 3,
    maxRetries: 1,
    scratchpadPolicy:
      'Private scratchpad may score candidates and track idempotency keys; final answer must cite observations only.',
    critiqueEvaluator: 'match_agent_ranking_and_meet_loop_v1',
    evalHints: {
      needsRankingExperiment: true,
      needsRecallFailureReview: true,
      needsExplanationConsistencyEval: true,
      needsIdempotency: true,
      needsPostMeetWriteback: true,
      qualityMetric: 'match_satisfaction',
    },
  },
};

export const FITMEET_ALPHA_AGENT_TOOL_OWNERS: Record<
  FitMeetAlphaAgentName,
  string[]
> = {
  'FitMeet Main Agent': [
    'check_safety_policy',
    'report_safety_issue',
    'redact_sensitive_output',
  ],
  'Agent Brain': [],
  'Life Graph Agent': [
    'get_user_profile',
    'update_profile_from_agent_context',
    'append_profile_memory',
  ],
  'Match Agent': [
    'search_real_candidates',
    'search_public_intents',
    'create_social_request',
    'get_candidate_detail',
    'send_message_to_candidate',
    'connect_candidate',
    'create_activity',
    'get_conversation_messages',
  ],
};

export const FITMEET_ALPHA_AGENT_HANDOFFS: FitMeetAgentTrace['handoffs'] = [
  {
    from: 'FitMeet Main Agent',
    to: 'Life Graph Agent',
    reason: '读取授权画像、偏好、边界和生活节奏。',
  },
  {
    from: 'FitMeet Main Agent',
    to: 'Match Agent',
    reason:
      '解析社交需求，生成候选推荐，并在用户确认后推进消息、连接、活动和评价闭环。',
  },
  {
    from: 'FitMeet Main Agent',
    to: 'Agent Brain',
    reason: '处理普通对话、意图判断、配速/距离等轻量计算，不读写社交数据。',
  },
];

export const FITMEET_ALPHA_NEXT_AGENT_MAP: Record<
  FitMeetAlphaAcceptedNextAgent,
  FitMeetAlphaAgentName | null
> = {
  agent_brain: 'Agent Brain',
  life_graph_agent: 'Life Graph Agent',
  match_agent: 'Match Agent',
  main_agent: 'FitMeet Main Agent',
  life_graph: 'Life Graph Agent',
  social_match: 'Match Agent',
  meet_loop: 'Match Agent',
  math: 'Agent Brain',
  answer: 'FitMeet Main Agent',
};

export function fitMeetAlphaAgentForNextAgent(
  nextAgent: unknown,
): FitMeetAlphaAgentName | null {
  if (!isFitMeetAlphaAcceptedNextAgent(nextAgent)) return null;
  return FITMEET_ALPHA_NEXT_AGENT_MAP[nextAgent];
}

export function fitMeetAlphaAgentOwnersForTool(
  toolName: string,
): FitMeetAlphaAgentName[] {
  return FITMEET_ALPHA_AGENT_PATH.filter((agentName) =>
    FITMEET_ALPHA_AGENT_TOOL_OWNERS[agentName].includes(toolName),
  );
}

export function fitMeetAlphaAgentRuntimeBoundary(
  agentName: FitMeetAlphaAgentName,
): FitMeetAlphaAgentRuntimeBoundary {
  return FITMEET_ALPHA_AGENT_RUNTIME_BOUNDARIES[agentName];
}

export function isFitMeetAlphaNextAgent(
  value: unknown,
): value is FitMeetAlphaNextAgent {
  return (
    typeof value === 'string' &&
    (FITMEET_ALPHA_NEXT_AGENT_VALUES as readonly string[]).includes(value)
  );
}

export function isFitMeetAlphaAcceptedNextAgent(
  value: unknown,
): value is FitMeetAlphaAcceptedNextAgent {
  return (
    typeof value === 'string' &&
    (FITMEET_ALPHA_ACCEPTED_NEXT_AGENT_VALUES as readonly string[]).includes(
      value,
    )
  );
}
