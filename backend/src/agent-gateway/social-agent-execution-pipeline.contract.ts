export type SocialAgentExecutionStepId =
  | 'check_profile_gate'
  | 'clarify_social_intent'
  | 'create_opportunity_card_draft'
  | 'safety_review'
  | 'optional_publish_public_intent'
  | 'search_public_candidates'
  | 'rank_candidates'
  | 'generate_opener'
  | 'request_approval'
  | 'execute_confirmed_action';

export type SocialAgentExecutionStep = {
  id: SocialAgentExecutionStepId;
  label: string;
  userVisibleStatus: string;
  sideEffect:
    | 'none'
    | 'private_draft'
    | 'conditional_publication'
    | 'approval_checkpoint'
    | 'confirmed_action';
  requiresUserConfirmation: boolean;
  blocksOrdinaryChat: false;
};

export type SocialAgentRecommendationLoopToolName =
  | 'recommendation_understand_permission'
  | 'recommendation_read_profile_and_plan'
  | 'recommendation_create_social_intent'
  | 'recommendation_search_candidates'
  | 'recommendation_rank_safety_and_draft'
  | 'recommendation_final_answer';

export type SocialAgentRecommendationLoopTool = {
  agent: 'Agent Brain' | 'Life Graph Agent' | 'Social Match Agent' | 'FitMeet Main Agent';
  toolName: SocialAgentRecommendationLoopToolName;
  covers: SocialAgentExecutionStepId[];
  input: Record<string, unknown>;
};

export const SOCIAL_AGENT_EXECUTION_PIPELINE: readonly SocialAgentExecutionStep[] = [
  {
    id: 'check_profile_gate',
    label: '检查最低画像门槛',
    userVisibleStatus: '我会先确认必要信息是否足够，不影响你继续普通聊天。',
    sideEffect: 'none',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'clarify_social_intent',
    label: '澄清社交/约练需求',
    userVisibleStatus: '我会先问清城市、时间、活动和边界，再继续匹配。',
    sideEffect: 'none',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'create_opportunity_card_draft',
    label: '生成约练机会草稿',
    userVisibleStatus: '我会把你的需求整理成一张可确认的约练卡。',
    sideEffect: 'private_draft',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'safety_review',
    label: '安全和隐私审查',
    userVisibleStatus: '我会过滤精确位置、联系方式和高风险偏好。',
    sideEffect: 'none',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'optional_publish_public_intent',
    label: '按授权同步发现页',
    userVisibleStatus: '只有你授权公开，且内容安全时，才会同步到发现页。',
    sideEffect: 'conditional_publication',
    requiresUserConfirmation: true,
    blocksOrdinaryChat: false,
  },
  {
    id: 'search_public_candidates',
    label: '检索公开可发现候选',
    userVisibleStatus: '我只会从公开可发现、已授权推荐的人和活动中检索。',
    sideEffect: 'none',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'rank_candidates',
    label: '排序候选机会',
    userVisibleStatus: '我会按兴趣、时间、城市/距离、公开动态和安全边界排序。',
    sideEffect: 'none',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'generate_opener',
    label: '生成开场白',
    userVisibleStatus: '我会先生成一条自然开场白，不会自动发送。',
    sideEffect: 'none',
    requiresUserConfirmation: false,
    blocksOrdinaryChat: false,
  },
  {
    id: 'request_approval',
    label: '请求用户确认',
    userVisibleStatus: '加好友、邀请、发消息或公开敏感信息前都需要你确认。',
    sideEffect: 'approval_checkpoint',
    requiresUserConfirmation: true,
    blocksOrdinaryChat: false,
  },
  {
    id: 'execute_confirmed_action',
    label: '执行已确认动作',
    userVisibleStatus: '只有你确认后，我才会执行邀请、加好友或发消息。',
    sideEffect: 'confirmed_action',
    requiresUserConfirmation: true,
    blocksOrdinaryChat: false,
  },
] as const;

export function recommendationLoopToolsForSocialExecution(input: {
  ownerUserId: number;
  permissionMode: unknown;
}): SocialAgentRecommendationLoopTool[] {
  return [
    {
      agent: 'Agent Brain',
      toolName: 'recommendation_understand_permission',
      covers: ['clarify_social_intent'],
      input: { permissionMode: input.permissionMode },
    },
    {
      agent: 'Life Graph Agent',
      toolName: 'recommendation_read_profile_and_plan',
      covers: ['check_profile_gate', 'clarify_social_intent'],
      input: { ownerUserId: input.ownerUserId },
    },
    {
      agent: 'Social Match Agent',
      toolName: 'recommendation_create_social_intent',
      covers: ['create_opportunity_card_draft', 'optional_publish_public_intent'],
      input: {
        source: 'social_agent_chat',
        mode: 'private_draft_then_auto_public_if_authorized',
        sideEffectPolicy: 'no_messages_or_candidate_contact_without_approval',
      },
    },
    {
      agent: 'Social Match Agent',
      toolName: 'recommendation_search_candidates',
      covers: ['search_public_candidates'],
      input: {
        source: 'social_agent_chat',
        searchOnly: true,
        sideEffectPolicy: 'no_contact_without_approval',
      },
    },
    {
      agent: 'Social Match Agent',
      toolName: 'recommendation_rank_safety_and_draft',
      covers: ['safety_review', 'rank_candidates', 'generate_opener'],
      input: { requiresConfirmation: true },
    },
    {
      agent: 'FitMeet Main Agent',
      toolName: 'recommendation_final_answer',
      covers: ['request_approval'],
      input: {
        statusReason: 'recommendations_ready_waiting_user_confirmation',
      },
    },
  ];
}

export function socialExecutionStepIds(): SocialAgentExecutionStepId[] {
  return SOCIAL_AGENT_EXECUTION_PIPELINE.map((step) => step.id);
}
