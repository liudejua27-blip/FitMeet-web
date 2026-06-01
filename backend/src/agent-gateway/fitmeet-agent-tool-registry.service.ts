import { Injectable } from '@nestjs/common';

import { SocialAgentAction } from './agent-permission.service';
import { AgentActionRiskLevel } from './entities/agent-action-log.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';

export enum FitMeetAgentToolCategory {
  Profile = 'profile',
  Candidate = 'candidate',
  Request = 'request',
  Activity = 'activity',
  Message = 'message',
  Friend = 'friend',
  Approval = 'approval',
  Memory = 'memory',
  Safety = 'safety',
  AdminDebug = 'admin_debug',
}

export type FitMeetAgentToolRuntimeStatus = 'implemented' | 'planned';
export type FitMeetAgentToolPermission =
  | 'read_only'
  | 'profile_write'
  | 'memory_write'
  | 'search'
  | 'draft_or_create'
  | 'limited_auto_or_confirmed'
  | 'confirmed_action'
  | 'admin_debug';

export interface FitMeetAgentToolCategoryDefinition {
  id: FitMeetAgentToolCategory;
  label: string;
  description: string;
}

export interface FitMeetAgentToolDefinition {
  name: string;
  description: string;
  category: FitMeetAgentToolCategory;
  permission?: FitMeetAgentToolPermission;
  riskLevel: AgentActionRiskLevel;
  requiresApproval: boolean;
  requiresConfirmation?: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissionMode: AgentTaskPermissionMode[];
  permissionAction?: SocialAgentAction;
  executorToolName?: string;
  runtimeStatus: FitMeetAgentToolRuntimeStatus;
  plannerEnabled: boolean;
  dataScope: string;
  sideEffects: string[];
  failureFallback?: string;
  aliases?: string[];
}

export interface FitMeetAgentToolRegistryFilter {
  category?: FitMeetAgentToolCategory | string;
  permissionMode?: AgentTaskPermissionMode | `${AgentTaskPermissionMode}`;
  runtimeStatus?: FitMeetAgentToolRuntimeStatus;
  plannerEnabled?: boolean;
}

export interface FitMeetAgentToolRegistryManifest {
  name: string;
  version: string;
  description: string;
  categories: FitMeetAgentToolCategoryDefinition[];
  tools: FitMeetAgentToolDefinition[];
  modelTools: FitMeetAgentToolDefinition[];
  safetyRules: string[];
}

const ALL_PERMISSION_MODES = [
  AgentTaskPermissionMode.Assist,
  AgentTaskPermissionMode.Confirm,
  AgentTaskPermissionMode.LimitedAuto,
];

const CONFIRM_AND_AUTO = [
  AgentTaskPermissionMode.Confirm,
  AgentTaskPermissionMode.LimitedAuto,
];

const LIMITED_AUTO_ONLY = [AgentTaskPermissionMode.LimitedAuto];

export const FIRST_STAGE_AGENT_TOOL_NAMES = [
  'get_user_profile',
  'get_my_profile',
  'update_my_profile',
  'update_profile_from_agent_context',
  'append_profile_memory',
  'get_current_task_memory',
  'search_real_candidates',
  'search_public_intents',
  'search_activities',
  'create_social_request',
  'publish_social_request',
  'save_candidate',
  'send_message_to_candidate',
  'connect_candidate',
  'get_conversation_messages',
  'get_conversations',
  'get_agent_inbox',
  'get_candidate_detail',
  'create_activity',
  'join_activity',
  'get_pending_approvals',
  'approve_action',
  'reject_action',
  'read_long_term_memory',
  'summarize_current_task',
  'get_candidate_pool_debug',
] as const;

export const SOCIAL_AGENT_MODEL_TOOL_NAMES = [
  'get_user_profile',
  'update_profile_from_agent_context',
  'append_profile_memory',
  'search_real_candidates',
  'search_public_intents',
  'create_social_request',
  'send_message_to_candidate',
  'connect_candidate',
  'create_activity',
  'get_conversation_messages',
  'get_candidate_detail',
] as const;

const TOOL_CATEGORIES: FitMeetAgentToolCategoryDefinition[] = [
  {
    id: FitMeetAgentToolCategory.Profile,
    label: 'Profile Tools',
    description: '读取、生成和更新用户社交画像。',
  },
  {
    id: FitMeetAgentToolCategory.Candidate,
    label: 'Candidate Tools',
    description: '搜索真实候选人、解释推荐、收藏候选人和生成开场白。',
  },
  {
    id: FitMeetAgentToolCategory.Request,
    label: 'Request Tools',
    description: '发布、搜索和管理约练需求卡片。',
  },
  {
    id: FitMeetAgentToolCategory.Activity,
    label: 'Activity Tools',
    description: '搜索活动、组织活动和邀请候选人参加活动。',
  },
  {
    id: FitMeetAgentToolCategory.Message,
    label: 'Message Tools',
    description: '查看消息、生成回复和发送站内消息。',
  },
  {
    id: FitMeetAgentToolCategory.Friend,
    label: 'Friend Tools',
    description: '发起好友关系或查看好友上下文。',
  },
  {
    id: FitMeetAgentToolCategory.Approval,
    label: 'Approval Tools',
    description: '查看、批准或拒绝待确认动作。',
  },
  {
    id: FitMeetAgentToolCategory.Memory,
    label: 'Memory Tools',
    description: '读取和维护 Social Agent 记忆，用于个性化推荐。',
  },
  {
    id: FitMeetAgentToolCategory.Safety,
    label: 'Safety Tools',
    description: '执行安全检查、敏感信息保护和风险上报。',
  },
  {
    id: FitMeetAgentToolCategory.AdminDebug,
    label: 'Admin/Debug Tools',
    description: '只读调试和运行时诊断工具。',
  },
];

function objectSchema(
  properties: Record<string, unknown> = {},
  required: string[] = [],
  additionalProperties = false,
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties,
    required,
    properties,
  };
}

const stringArraySchema = {
  type: 'array',
  items: { type: 'string' },
};

const candidateOutputSchema = objectSchema(
  {
    candidates: {
      type: 'array',
      items: objectSchema(
        {
          candidateUserId: { type: ['integer', 'null'] },
          displayName: { type: 'string' },
          source: { type: 'string' },
          isRealData: { type: 'boolean' },
          matchScore: { type: 'number' },
          matchReasons: stringArraySchema,
          dataQuality: { type: 'string' },
        },
        ['displayName', 'source', 'isRealData'],
        true,
      ),
    },
    emptyReason: { type: ['string', 'null'] },
    debugReasons: stringArraySchema,
  },
  ['candidates'],
  true,
);

const TOOL_DEFINITIONS: FitMeetAgentToolDefinition[] = [
  {
    name: 'get_user_profile',
    description:
      'Read the current user profile and AI social profile summary for planning. Never reads another user profile.',
    category: FitMeetAgentToolCategory.Profile,
    permission: 'read_only',
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    requiresConfirmation: false,
    inputSchema: objectSchema(
      {
        includeMissingFields: { type: 'boolean' },
        includeMemorySummary: { type: 'boolean' },
      },
      [],
    ),
    outputSchema: objectSchema(
      {
        profile: objectSchema({}, [], true),
        completion: { type: 'number' },
        missingFields: stringArraySchema,
        memorySummary: objectSchema({}, [], true),
      },
      ['profile'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_my_profile',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_profile_only',
    sideEffects: [],
    failureFallback:
      'Continue with the profile facts already present in conversation/task memory and ask the user for missing fields.',
    aliases: ['get_my_profile', 'get_ai_profile'],
  },
  {
    name: 'update_profile_from_agent_context',
    description:
      'Update the current user AI social profile from explicitly provided conversation facts.',
    category: FitMeetAgentToolCategory.Profile,
    permission: 'profile_write',
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: false,
    requiresConfirmation: false,
    inputSchema: objectSchema(
      {
        extractedProfile: objectSchema(
          {
            city: { type: 'string' },
            nearbyArea: { type: 'string' },
            age: { type: ['string', 'number'] },
            height: { type: 'string' },
            weight: { type: 'string' },
            mbti: { type: 'string' },
            zodiac: { type: 'string' },
            school: { type: 'string' },
            interestTags: stringArraySchema,
            availableTimes: stringArraySchema,
            targetPreference: { type: 'string' },
            socialGoal: { type: 'string' },
            privacyBoundary: { type: 'string' },
            rejectRules: { type: 'string' },
          },
          [],
          true,
        ),
        sourceMessage: { type: 'string' },
        taskId: { type: 'integer' },
      },
      ['extractedProfile'],
      false,
    ),
    outputSchema: objectSchema(
      {
        success: { type: 'boolean' },
        updatedFields: stringArraySchema,
        memoryFields: stringArraySchema,
        missingFields: stringArraySchema,
      },
      ['success'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.GenerateContent,
    executorToolName: 'update_profile_from_agent_context',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_profile_only',
    sideEffects: ['profile_update', 'task_memory_update'],
    failureFallback:
      'Store the extracted facts in task memory, tell the user the profile write failed, and ask whether to retry.',
    aliases: ['update_ai_profile', 'save_profile_memory'],
  },
  {
    name: 'append_profile_memory',
    description:
      'Append lightweight profile memory or preference notes when user facts should be remembered but do not map cleanly to profile fields.',
    category: FitMeetAgentToolCategory.Memory,
    permission: 'memory_write',
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: false,
    requiresConfirmation: false,
    inputSchema: objectSchema(
      {
        memoryType: {
          type: 'string',
          enum: [
            'preference',
            'boundary',
            'profile_fact',
            'social_goal',
            'note',
          ],
        },
        text: { type: 'string' },
        sourceMessage: { type: 'string' },
        tags: stringArraySchema,
      },
      ['memoryType', 'text'],
      false,
    ),
    outputSchema: objectSchema(
      {
        success: { type: 'boolean' },
        memoryFields: stringArraySchema,
        storedIn: { type: 'string' },
      },
      ['success'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.GenerateContent,
    executorToolName: 'update_profile_from_agent_context',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_agent_memory_only',
    sideEffects: ['task_memory_update'],
    failureFallback:
      'Keep the note in the current assistant reply and ask the user to restate it later if persistence matters.',
    aliases: ['remember_profile_note', 'append_social_agent_memory'],
  },
  {
    name: 'get_my_profile',
    description: '读取当前用户自己的 FitMeet 社交画像和 AI 画像摘要。',
    category: FitMeetAgentToolCategory.Profile,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema({ userId: { type: 'integer' } }),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_my_profile',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_profile_only',
    sideEffects: [],
  },
  {
    name: 'generate_profile_questions',
    description: '为完善社交画像生成低压力问答问题。',
    category: FitMeetAgentToolCategory.Profile,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(),
    outputSchema: objectSchema(
      { questions: { type: 'array', items: objectSchema({}, [], true) } },
      ['questions'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.GenerateContent,
    executorToolName: 'generate_profile_questions',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_profile_only',
    sideEffects: [],
  },
  {
    name: 'update_my_profile',
    description: '根据用户明确回答更新自己的社交画像草稿。',
    category: FitMeetAgentToolCategory.Profile,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        answers: {
          type: 'array',
          items: objectSchema(
            {
              key: { type: 'string' },
              answer: { type: 'string' },
            },
            ['key', 'answer'],
          ),
        },
      },
      ['answers'],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.GenerateContent,
    executorToolName: 'update_ai_profile_from_answers',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_profile_only',
    sideEffects: ['profile_update'],
  },
  {
    name: 'get_current_task_memory',
    description:
      '读取当前 Social Agent 任务的短期记忆、结构化任务记忆和最近工具调用。',
    category: FitMeetAgentToolCategory.Memory,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_current_task_memory',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'current_task_memory_only',
    sideEffects: [],
  },
  {
    name: 'search_real_candidates',
    description:
      '根据用户需求搜索真实候选人，统一读取画像、AI 代理画像和公开约练卡片。',
    category: FitMeetAgentToolCategory.Candidate,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        city: { type: 'string' },
        activityType: { type: 'string' },
        interestTags: stringArraySchema,
        timePreference: { type: 'string' },
        locationPreference: { type: 'string' },
        rawText: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      [],
      false,
    ),
    outputSchema: candidateOutputSchema,
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.SearchProfiles,
    executorToolName: 'search_matches',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'eligible_real_candidates_only',
    sideEffects: ['candidate_rows_may_be_persisted_for_task'],
  },
  {
    name: 'explain_candidate_recommendation',
    description: '解释为什么推荐某个候选人，输出可展示给用户的推荐理由。',
    category: FitMeetAgentToolCategory.Candidate,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        candidateUserId: { type: 'integer' },
        candidateRecordId: { type: 'integer' },
        context: { type: 'string' },
      },
      [],
    ),
    outputSchema: objectSchema(
      {
        reasons: stringArraySchema,
        riskWarnings: stringArraySchema,
      },
      [],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.GenerateContent,
    executorToolName: 'explain_matches',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_candidate_only',
    sideEffects: [],
  },
  {
    name: 'get_candidate_detail',
    description:
      'Read details for one already selected candidate, including public profile summary, match reasons and safety warnings.',
    category: FitMeetAgentToolCategory.Candidate,
    permission: 'read_only',
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    requiresConfirmation: false,
    inputSchema: objectSchema(
      {
        candidateUserId: { type: 'integer' },
        candidateRecordId: { type: 'integer' },
        publicIntentId: { type: 'string' },
      },
      [],
      false,
    ),
    outputSchema: objectSchema(
      {
        candidate: objectSchema({}, [], true),
        matchReasons: stringArraySchema,
        riskWarnings: stringArraySchema,
      },
      ['candidate'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.SearchProfiles,
    executorToolName: 'explain_matches',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_candidate_only',
    sideEffects: [],
    failureFallback:
      'Use the candidate summary already attached to the current task and ask the user which candidate they mean if ambiguous.',
    aliases: ['explain_candidate_recommendation', 'candidate_detail'],
  },
  {
    name: 'generate_opener',
    description: '为指定候选人生成站内开场白草稿，不直接发送。',
    category: FitMeetAgentToolCategory.Candidate,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        candidateUserId: { type: 'integer' },
        context: { type: 'string' },
        tone: { type: 'string' },
      },
      [],
    ),
    outputSchema: objectSchema(
      { text: { type: 'string' }, alternatives: stringArraySchema },
      ['text'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.DraftMessage,
    executorToolName: 'draft_opener',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_candidate_only',
    sideEffects: [],
  },
  {
    name: 'save_candidate',
    description: '把候选人加入当前任务的收藏/稍后处理列表。',
    category: FitMeetAgentToolCategory.Candidate,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        candidateRecordId: { type: 'integer' },
        candidateUserId: { type: 'integer' },
        note: { type: 'string' },
      },
      [],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...CONFIRM_AND_AUTO],
    permissionAction: SocialAgentAction.FavoriteCandidate,
    executorToolName: 'save_candidate',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_candidate_only',
    sideEffects: ['candidate_status_update'],
  },
  {
    name: 'view_match_history',
    description: '查看当前用户自己的历史匹配记录和推荐摘要。',
    category: FitMeetAgentToolCategory.Candidate,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      [],
    ),
    outputSchema: objectSchema(
      { matches: { type: 'array', items: objectSchema({}, [], true) } },
      ['matches'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'owner_match_history_only',
    sideEffects: [],
  },
  {
    name: 'create_social_request',
    description:
      'Create a social request draft or publishable request card from the user confirmed goal.',
    category: FitMeetAgentToolCategory.Request,
    permission: 'draft_or_create',
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    requiresConfirmation: true,
    inputSchema: objectSchema(
      {
        mode: { type: 'string', enum: ['draft', 'publish', 'ai_draft'] },
        title: { type: 'string' },
        description: { type: 'string' },
        requestType: { type: 'string' },
        city: { type: 'string' },
        location: { type: 'string' },
        interests: stringArraySchema,
        timePreference: { type: 'string' },
        visibility: { type: 'string' },
      },
      ['description'],
      true,
    ),
    outputSchema: objectSchema(
      {
        socialRequestId: { type: ['integer', 'null'] },
        status: { type: 'string' },
        draft: objectSchema({}, [], true),
        profileUsed: objectSchema({}, [], true),
      },
      [],
      true,
    ),
    permissionMode: [...CONFIRM_AND_AUTO],
    permissionAction: SocialAgentAction.SendInvite,
    executorToolName: 'create_social_request',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_social_requests_only',
    sideEffects: ['social_request_create_or_draft'],
    failureFallback:
      'Return a text draft to the user and ask them to confirm or edit before retrying creation.',
    aliases: ['publish_social_request'],
  },
  {
    name: 'publish_social_request',
    description: '根据用户确认后的需求发布约练需求卡片。',
    category: FitMeetAgentToolCategory.Request,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        title: { type: 'string' },
        description: { type: 'string' },
        requestType: { type: 'string' },
        city: { type: 'string' },
        interests: stringArraySchema,
        timePreference: { type: 'string' },
      },
      ['description'],
      true,
    ),
    outputSchema: objectSchema(
      { socialRequestId: { type: 'integer' }, status: { type: 'string' } },
      ['socialRequestId'],
      true,
    ),
    permissionMode: [...CONFIRM_AND_AUTO],
    permissionAction: SocialAgentAction.SendInvite,
    executorToolName: 'publish_social_request',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_social_requests_only',
    sideEffects: ['social_request_create'],
  },
  {
    name: 'search_public_intents',
    description: '搜索真实用户发布的公开约练卡片。',
    category: FitMeetAgentToolCategory.Request,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        city: { type: 'string' },
        activityType: { type: 'string' },
        interestTags: stringArraySchema,
        rawText: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      [],
    ),
    outputSchema: candidateOutputSchema,
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.SearchProfiles,
    executorToolName: 'search_public_intents',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'public_social_intents_only',
    sideEffects: [],
  },
  {
    name: 'search_activities',
    description: '搜索真实活动和活动型公开约练卡片。',
    category: FitMeetAgentToolCategory.Activity,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        city: { type: 'string' },
        activityType: { type: 'string' },
        interestTags: stringArraySchema,
        rawText: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      [],
    ),
    outputSchema: objectSchema(
      { activities: { type: 'array', items: objectSchema({}, [], true) } },
      ['activities'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.SearchProfiles,
    executorToolName: 'search_activities',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'public_activities_only',
    sideEffects: [],
  },
  {
    name: 'create_activity',
    description: '为用户创建或组织一个线下活动，必须进入确认链路。',
    category: FitMeetAgentToolCategory.Activity,
    riskLevel: AgentActionRiskLevel.High,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        title: { type: 'string' },
        description: { type: 'string' },
        city: { type: 'string' },
        location: { type: 'string' },
        startTime: { type: 'string' },
        invitedUserId: { type: 'integer' },
      },
      ['title'],
      true,
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...LIMITED_AUTO_ONLY],
    permissionAction: SocialAgentAction.OfflineMeet,
    executorToolName: 'create_activity',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_activity_only',
    sideEffects: ['activity_create', 'audit_log_required'],
  },
  {
    name: 'join_activity',
    description: '代表当前用户加入一个公开活动，必须经过活动权限和安全检查。',
    category: FitMeetAgentToolCategory.Activity,
    riskLevel: AgentActionRiskLevel.High,
    requiresApproval: true,
    inputSchema: objectSchema({ activityId: { type: 'integer' } }, [
      'activityId',
    ]),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...LIMITED_AUTO_ONLY],
    permissionAction: SocialAgentAction.OfflineMeet,
    executorToolName: 'join_activity',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_activity_only',
    sideEffects: ['activity_join', 'audit_log_required'],
  },
  {
    name: 'invite_to_activity',
    description: '邀请候选人参加活动或约练，不能替用户完成线下约见。',
    category: FitMeetAgentToolCategory.Activity,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        activityId: { type: 'integer' },
        targetUserId: { type: 'integer' },
        message: { type: 'string' },
      },
      ['targetUserId'],
      true,
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...CONFIRM_AND_AUTO],
    permissionAction: SocialAgentAction.SendInvite,
    executorToolName: 'invite_activity',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_candidate_and_owner_activity',
    sideEffects: ['activity_invite_create', 'audit_log_required'],
  },
  {
    name: 'send_message_to_candidate',
    description: '向指定用户发送站内消息；首次联系和敏感内容必须确认。',
    category: FitMeetAgentToolCategory.Message,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        candidateUserId: { type: 'integer' },
        targetUserId: { type: 'integer' },
        text: { type: 'string', maxLength: 1000 },
        candidateRecordId: { type: 'integer' },
      },
      ['text'],
    ),
    outputSchema: objectSchema(
      { conversationId: { type: 'string' }, messageId: { type: 'string' } },
      [],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.SendMessage,
    executorToolName: 'send_message_to_candidate',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_conversation_only',
    sideEffects: ['message_send', 'audit_log_required'],
  },
  {
    name: 'get_agent_inbox',
    description: '查看当前用户自己的 Agent Inbox 或任务相关站内消息。',
    category: FitMeetAgentToolCategory.Message,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        conversationId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      [],
    ),
    outputSchema: objectSchema(
      {
        conversations: { type: 'array', items: objectSchema({}, [], true) },
        events: { type: 'array', items: objectSchema({}, [], true) },
        messages: { type: 'array', items: objectSchema({}, [], true) },
      },
      [],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_agent_inbox',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_messages_only',
    sideEffects: [],
  },
  {
    name: 'get_conversations',
    description: '查看当前用户自己的站内会话列表。',
    category: FitMeetAgentToolCategory.Message,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { limit: { type: 'integer', minimum: 1, maximum: 100 } },
      [],
    ),
    outputSchema: objectSchema(
      { conversations: { type: 'array', items: objectSchema({}, [], true) } },
      ['conversations'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_conversations',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_conversations_only',
    sideEffects: [],
  },
  {
    name: 'get_conversation_messages',
    description:
      'Read recent messages from the current task conversation or a selected agent inbox conversation.',
    category: FitMeetAgentToolCategory.Message,
    permission: 'read_only',
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    requiresConfirmation: false,
    inputSchema: objectSchema(
      {
        conversationId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        unreadOnly: { type: 'boolean' },
      },
      [],
      false,
    ),
    outputSchema: objectSchema(
      {
        messages: { type: 'array', items: objectSchema({}, [], true) },
        summary: objectSchema({}, [], true),
        hasNewMessages: { type: 'boolean' },
      },
      ['messages'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'read_task_conversation_messages',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_or_selected_conversation_only',
    sideEffects: [],
    failureFallback:
      'Use the recent conversation history already present in task memory and ask the user for clarification if needed.',
    aliases: ['read_task_conversation_messages', 'get_agent_inbox'],
  },
  {
    name: 'reply_message',
    description: '在已有会话中回复消息，必须经过消息安全和权限检查。',
    category: FitMeetAgentToolCategory.Message,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        conversationId: { type: 'string' },
        text: { type: 'string', maxLength: 1000 },
      },
      ['text'],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.SendMessage,
    executorToolName: 'reply_message',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_conversation_only',
    sideEffects: ['message_send', 'audit_log_required'],
  },
  {
    name: 'summarize_reply',
    description: '总结对方最近回复，帮助用户决定下一步。',
    category: FitMeetAgentToolCategory.Message,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema({}, [], true),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'summarize_reply',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_conversation_only',
    sideEffects: [],
  },
  {
    name: 'connect_candidate',
    description: '发起好友/关注关系，不能绕过对方或用户确认。',
    category: FitMeetAgentToolCategory.Friend,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        candidateUserId: { type: 'integer' },
        targetUserId: { type: 'integer' },
        note: { type: 'string' },
      },
      [],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    permissionAction: SocialAgentAction.AddFriend,
    executorToolName: 'connect_candidate',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'selected_user_only',
    sideEffects: ['friend_request_or_follow_create', 'audit_log_required'],
  },
  {
    name: 'list_friends',
    description: '查看当前用户自己的好友/关注摘要。',
    category: FitMeetAgentToolCategory.Friend,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { limit: { type: 'integer', minimum: 1, maximum: 100 } },
      [],
    ),
    outputSchema: objectSchema(
      { friends: { type: 'array', items: objectSchema({}, [], true) } },
      ['friends'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'owner_friend_graph_only',
    sideEffects: [],
  },
  {
    name: 'get_pending_approvals',
    description: '查看当前用户自己的待确认动作列表。',
    category: FitMeetAgentToolCategory.Approval,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      [],
    ),
    outputSchema: objectSchema(
      { approvals: { type: 'array', items: objectSchema({}, [], true) } },
      ['approvals'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_pending_approvals',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_pending_approvals_only',
    sideEffects: [],
  },
  {
    name: 'approve_action',
    description: '在用户明确确认后批准一个待执行动作。',
    category: FitMeetAgentToolCategory.Approval,
    riskLevel: AgentActionRiskLevel.High,
    requiresApproval: true,
    inputSchema: objectSchema({ approvalId: { type: 'integer' } }, [
      'approvalId',
    ]),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...CONFIRM_AND_AUTO],
    executorToolName: 'approve_action',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_pending_approvals_only',
    sideEffects: ['approval_status_update', 'may_dispatch_action'],
  },
  {
    name: 'reject_action',
    description: '拒绝一个待确认动作并记录原因。',
    category: FitMeetAgentToolCategory.Approval,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: false,
    inputSchema: objectSchema(
      { approvalId: { type: 'integer' }, reason: { type: 'string' } },
      ['approvalId'],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'reject_action',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_pending_approvals_only',
    sideEffects: ['approval_status_update'],
  },
  {
    name: 'read_long_term_memory',
    description: '读取当前用户自己的长期偏好记忆摘要。',
    category: FitMeetAgentToolCategory.Memory,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { memoryKey: { type: 'string' }, limit: { type: 'integer' } },
      [],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'read_long_term_memory',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_agent_memory_only',
    sideEffects: [],
  },
  {
    name: 'summarize_current_task',
    description:
      '总结当前 Social Agent 任务的目标、状态、候选、消息和工具调用结果。',
    category: FitMeetAgentToolCategory.Memory,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema({ persistLongTerm: { type: 'boolean' } }, []),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'summarize_current_task',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'current_task_summary_only',
    sideEffects: [],
  },
  {
    name: 'update_long_term_memory',
    description: '在用户允许后写入或更新长期偏好记忆。',
    category: FitMeetAgentToolCategory.Memory,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        memoryKey: { type: 'string' },
        value: { type: 'string' },
        reason: { type: 'string' },
      },
      ['memoryKey', 'value'],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...CONFIRM_AND_AUTO],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'owner_agent_memory_only',
    sideEffects: ['memory_write'],
  },
  {
    name: 'optimize_recommendation_with_memory',
    description: '使用用户自己的长期记忆调整推荐排序，不读取其他用户隐私。',
    category: FitMeetAgentToolCategory.Memory,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        candidateIds: { type: 'array', items: { type: 'integer' } },
        context: { type: 'string' },
      },
      ['candidateIds'],
    ),
    outputSchema: objectSchema(
      { rankedCandidateIds: { type: 'array', items: { type: 'integer' } } },
      ['rankedCandidateIds'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'owner_memory_and_current_candidates_only',
    sideEffects: [],
  },
  {
    name: 'check_safety_policy',
    description: '检查消息、活动或动作是否触碰安全策略。',
    category: FitMeetAgentToolCategory.Safety,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { text: { type: 'string' }, action: { type: 'string' } },
      [],
      true,
    ),
    outputSchema: objectSchema(
      { allowed: { type: 'boolean' }, reasons: stringArraySchema },
      ['allowed'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'current_action_only',
    sideEffects: [],
  },
  {
    name: 'report_safety_issue',
    description: '代表用户提交站内安全风险上报。',
    category: FitMeetAgentToolCategory.Safety,
    riskLevel: AgentActionRiskLevel.Medium,
    requiresApproval: true,
    inputSchema: objectSchema(
      {
        targetType: { type: 'string' },
        targetId: { type: 'string' },
        reason: { type: 'string' },
      },
      ['targetType', 'targetId', 'reason'],
      true,
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...CONFIRM_AND_AUTO],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'reported_target_only',
    sideEffects: ['safety_report_create'],
  },
  {
    name: 'redact_sensitive_output',
    description: '对候选人、消息或调试输出进行敏感字段脱敏。',
    category: FitMeetAgentToolCategory.Safety,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      { payload: objectSchema({}, [], true) },
      ['payload'],
      true,
    ),
    outputSchema: objectSchema(
      { payload: objectSchema({}, [], true) },
      ['payload'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    runtimeStatus: 'planned',
    plannerEnabled: false,
    dataScope: 'provided_payload_only',
    sideEffects: [],
  },
  {
    name: 'get_candidate_pool_debug',
    description: '只读查看候选池计数、过滤原因和最终候选摘要。',
    category: FitMeetAgentToolCategory.AdminDebug,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        taskId: { type: 'integer' },
        intent: { type: 'string', enum: ['social_search', 'activity_search'] },
      },
      [],
    ),
    outputSchema: objectSchema({}, [], true),
    permissionMode: [...ALL_PERMISSION_MODES],
    executorToolName: 'get_candidate_pool_debug',
    runtimeStatus: 'implemented',
    plannerEnabled: true,
    dataScope: 'owner_debug_summary_only',
    sideEffects: [],
  },
  {
    name: 'list_tool_registry',
    description:
      '读取 FitMeet Agent Tool Registry 本身，供 Codex/Agent 规划工具调用。',
    category: FitMeetAgentToolCategory.AdminDebug,
    riskLevel: AgentActionRiskLevel.Low,
    requiresApproval: false,
    inputSchema: objectSchema(
      {
        category: { type: 'string' },
        permissionMode: { type: 'string' },
        plannerOnly: { type: 'boolean' },
      },
      [],
    ),
    outputSchema: objectSchema(
      { tools: { type: 'array', items: objectSchema({}, [], true) } },
      ['tools'],
      true,
    ),
    permissionMode: [...ALL_PERMISSION_MODES],
    runtimeStatus: 'implemented',
    plannerEnabled: false,
    dataScope: 'tool_metadata_only',
    sideEffects: [],
  },
];

@Injectable()
export class FitMeetAgentToolRegistryService {
  listCategories(): FitMeetAgentToolCategoryDefinition[] {
    return TOOL_CATEGORIES.map((category) => ({ ...category }));
  }

  listTools(
    filter: FitMeetAgentToolRegistryFilter = {},
  ): FitMeetAgentToolDefinition[] {
    return TOOL_DEFINITIONS.filter((tool) =>
      this.matchesFilter(tool, filter),
    ).map((tool) => this.cloneTool(tool));
  }

  listPlannerTools(
    permissionMode: AgentTaskPermissionMode,
  ): FitMeetAgentToolDefinition[] {
    return this.listTools({
      permissionMode,
      runtimeStatus: 'implemented',
      plannerEnabled: true,
    });
  }

  listModelTools(
    permissionMode: AgentTaskPermissionMode,
  ): FitMeetAgentToolDefinition[] {
    const required = new Set<string>(SOCIAL_AGENT_MODEL_TOOL_NAMES);
    void permissionMode;
    return this.listTools({
      runtimeStatus: 'implemented',
      plannerEnabled: true,
    }).filter((tool) => required.has(tool.name));
  }

  getTool(name: string): FitMeetAgentToolDefinition | null {
    const normalized = name.trim();
    const tool =
      TOOL_DEFINITIONS.find((item) => item.name === normalized) ??
      TOOL_DEFINITIONS.find((item) =>
        (item.aliases ?? []).includes(normalized),
      );
    return tool ? this.cloneTool(tool) : null;
  }

  getToolByExecutorName(
    executorToolName: string,
  ): FitMeetAgentToolDefinition | null {
    const normalized = executorToolName.trim();
    const tool = TOOL_DEFINITIONS.find(
      (item) => item.executorToolName === normalized,
    );
    return tool ? this.cloneTool(tool) : null;
  }

  resolveExecutorToolName(toolName: string): string | null {
    const normalized = toolName.trim();
    const direct =
      TOOL_DEFINITIONS.find((item) => item.name === normalized) ??
      TOOL_DEFINITIONS.find((item) =>
        (item.aliases ?? []).includes(normalized),
      );
    if (direct?.executorToolName) return direct.executorToolName;
    const byExecutor = TOOL_DEFINITIONS.find(
      (item) => item.executorToolName === normalized,
    );
    return byExecutor?.executorToolName ?? null;
  }

  getManifest(
    filter: FitMeetAgentToolRegistryFilter = {},
  ): FitMeetAgentToolRegistryManifest {
    return {
      name: 'FitMeet Agent Tool Registry',
      version: '1.0.0',
      description:
        'Canonical tool metadata for FitMeet Social Agent planning, permission checks, audit logs and future runtime execution.',
      categories: this.listCategories(),
      tools: this.listTools(filter),
      modelTools: filter.permissionMode
        ? this.listModelTools(filter.permissionMode as AgentTaskPermissionMode)
        : this.listTools({
            ...filter,
            runtimeStatus: 'implemented',
            plannerEnabled: true,
          }).filter((tool) =>
            (SOCIAL_AGENT_MODEL_TOOL_NAMES as readonly string[]).includes(
              tool.name,
            ),
          ),
      safetyRules: [
        'Tools must operate on the owner scope or an explicitly selected candidate/activity only.',
        'Tools must not read all-user private data or arbitrary database tables.',
        'Tools must not delete user data, send contact details, create payments, or arrange offline meetings without approval.',
        'Planner-visible tools are a subset of implemented registry entries.',
      ],
    };
  }

  private matchesFilter(
    tool: FitMeetAgentToolDefinition,
    filter: FitMeetAgentToolRegistryFilter,
  ): boolean {
    const category = filter.category as FitMeetAgentToolCategory | undefined;
    if (category && tool.category !== category) return false;
    if (
      filter.permissionMode &&
      !tool.permissionMode.includes(
        filter.permissionMode as AgentTaskPermissionMode,
      )
    ) {
      return false;
    }
    if (filter.runtimeStatus && tool.runtimeStatus !== filter.runtimeStatus) {
      return false;
    }
    if (
      typeof filter.plannerEnabled === 'boolean' &&
      tool.plannerEnabled !== filter.plannerEnabled
    ) {
      return false;
    }
    return true;
  }

  private cloneTool(
    tool: FitMeetAgentToolDefinition,
  ): FitMeetAgentToolDefinition {
    return {
      ...tool,
      permission: tool.permission ?? this.inferPermission(tool),
      requiresConfirmation:
        tool.requiresConfirmation ?? tool.requiresApproval === true,
      failureFallback:
        tool.failureFallback ?? this.defaultFailureFallback(tool),
      permissionMode: [...tool.permissionMode],
      inputSchema: this.cloneRecord(tool.inputSchema),
      outputSchema: this.cloneRecord(tool.outputSchema),
      sideEffects: [...tool.sideEffects],
      aliases: [...(tool.aliases ?? [])],
    };
  }

  private inferPermission(
    tool: FitMeetAgentToolDefinition,
  ): FitMeetAgentToolPermission {
    if (tool.category === FitMeetAgentToolCategory.AdminDebug) {
      return 'admin_debug';
    }
    if (tool.sideEffects.length === 0) {
      return tool.category === FitMeetAgentToolCategory.Candidate ||
        tool.category === FitMeetAgentToolCategory.Request ||
        tool.category === FitMeetAgentToolCategory.Activity
        ? 'search'
        : 'read_only';
    }
    if (tool.permissionAction === SocialAgentAction.SendMessage) {
      return 'limited_auto_or_confirmed';
    }
    if (tool.requiresApproval || tool.riskLevel === AgentActionRiskLevel.High) {
      return 'confirmed_action';
    }
    if (tool.sideEffects.some((item) => item.includes('memory'))) {
      return 'memory_write';
    }
    if (tool.sideEffects.some((item) => item.includes('profile'))) {
      return 'profile_write';
    }
    return 'limited_auto_or_confirmed';
  }

  private defaultFailureFallback(tool: FitMeetAgentToolDefinition): string {
    if (tool.category === FitMeetAgentToolCategory.Candidate) {
      return 'Explain that no reliable candidate result is available and ask the user to broaden or clarify the search.';
    }
    if (tool.category === FitMeetAgentToolCategory.Message) {
      return 'Do not claim the message was sent; draft the message text for user confirmation instead.';
    }
    if (tool.requiresApproval || tool.riskLevel !== AgentActionRiskLevel.Low) {
      return 'Do not execute silently; ask the user to confirm, edit, or retry the action.';
    }
    return 'Continue from available conversation/task memory and ask one concise clarification if needed.';
  }

  private cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }
}
