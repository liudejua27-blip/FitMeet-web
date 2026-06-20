import { SocialAgentAction } from './agent-permission.service';
import {
  AgentActionRiskLevel,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { SceneRiskPolicyResult } from './scene-risk-policy.service';
import { SocialAgentToolName } from './social-agent-tool.types';

export const SOCIAL_AGENT_HIGH_RISK_TOOL_DAILY_LIMITS: Partial<
  Record<SocialAgentToolName, number>
> = {
  [SocialAgentToolName.OfflineMeeting]: 3,
  [SocialAgentToolName.Payment]: 3,
};

export const SOCIAL_AGENT_MANDATORY_APPROVAL_TOOLS: readonly SocialAgentToolName[] =
  [
  SocialAgentToolName.SendMessage,
  SocialAgentToolName.SendMessageToCandidate,
  SocialAgentToolName.ReplyMessage,
  SocialAgentToolName.ConnectCandidate,
  SocialAgentToolName.AddFriend,
  SocialAgentToolName.CreateActivity,
  SocialAgentToolName.InviteActivity,
  SocialAgentToolName.JoinActivity,
  SocialAgentToolName.OfflineMeeting,
  SocialAgentToolName.ShareLocation,
  SocialAgentToolName.Payment,
  SocialAgentToolName.PublishSocialRequest,
];

const MANDATORY_APPROVAL_TOOLS = new Set<SocialAgentToolName>(
  SOCIAL_AGENT_MANDATORY_APPROVAL_TOOLS,
);

const PRIVACY_SENSITIVE_PROFILE_FIELDS = [
  'privacyBoundary',
  'rejectRules',
  'contactSharingRequiresApproval',
  'paymentBoundary',
  'paymentAutoExecution',
  'preciseLocation',
  'sharePreciseLocation',
  'contactInfo',
  'phone',
  'wechat',
  'email',
  'visibility',
  'profileVisibility',
  'profileDiscoverable',
  'discoverable',
  'discoverability',
  'publicProfile',
  'public_profile',
  'agentCanRecommendMe',
  'agentMatchingEnabled',
  'matchingEnabled',
  'allowAgentMatching',
  'recommendationOptIn',
  'strangerRecommendationOptIn',
  'publicIntentEnabled',
];

export function requiresMandatorySocialAgentApproval(
  toolName: SocialAgentToolName,
  input: Record<string, unknown> = {},
): boolean {
  if (MANDATORY_APPROVAL_TOOLS.has(toolName)) return true;
  if (toolName === SocialAgentToolName.CreateSocialRequest) {
    const mode = string(
      input.mode ??
        input.intent ??
        input.visibility ??
        input.audience ??
        input.discoverability,
    );
    return (
      truthy(input.publish) ||
      truthy(input.isPublic) ||
      truthy(input.public) ||
      truthy(input.publiclyVisible) ||
      truthy(input.syncPublicIntent) ||
      truthy(input.discoverable) ||
      truthy(input.profileDiscoverable) ||
      truthy(input.agentCanRecommendMe) ||
      truthy(input.agentMatchingEnabled) ||
      truthy(input.recommendationOptIn) ||
      truthy(input.strangerRecommendationOptIn) ||
      truthy(input.publicIntentEnabled) ||
      mode === 'publish' ||
      mode === 'public' ||
      mode === 'everyone' ||
      mode === 'discoverable' ||
      mode === 'public_discoverable' ||
      mode === 'recommendable'
    );
  }
  if (
    toolName === SocialAgentToolName.UpdateAiProfileFromAnswers ||
    toolName === SocialAgentToolName.UpdateProfileFromAgentContext
  ) {
    return containsPrivacySensitiveProfileField(input);
  }
  return false;
}

export function isConfirmableSocialAgentTool(
  toolName: SocialAgentToolName,
): boolean {
  return [
    SocialAgentToolName.SendMessageToCandidate,
    SocialAgentToolName.SendMessage,
    SocialAgentToolName.ReplyMessage,
    SocialAgentToolName.ConnectCandidate,
    SocialAgentToolName.AddFriend,
    SocialAgentToolName.CreateActivity,
    SocialAgentToolName.InviteActivity,
    SocialAgentToolName.JoinActivity,
    SocialAgentToolName.OfflineMeeting,
    SocialAgentToolName.ShareLocation,
    SocialAgentToolName.Payment,
    SocialAgentToolName.PublishSocialRequest,
    SocialAgentToolName.CreateSocialRequest,
  ].includes(toolName);
}

export function getSocialAgentToolApprovalType(
  toolName: SocialAgentToolName,
  policy: SceneRiskPolicyResult,
): ApprovalType {
  if (policy.actionType === 'payment' || policy.actionType === 'wallet') {
    return ApprovalType.Payment;
  }
  if (
    policy.actionType === 'share_location' ||
    policy.actionType === 'precise_location'
  ) {
    return ApprovalType.ShareLocation;
  }
  if (policy.actionType === 'contact_exchange') {
    return ApprovalType.ContactExchange;
  }
  if (policy.sceneType === 'drinking') return ApprovalType.AlcoholActivity;
  switch (toolName) {
    case SocialAgentToolName.PublishSocialRequest:
      return ApprovalType.PostPublish;
    case SocialAgentToolName.CreateSocialRequest:
      return ApprovalType.PostPublish;
    case SocialAgentToolName.SendMessage:
    case SocialAgentToolName.SendMessageToCandidate:
    case SocialAgentToolName.ReplyMessage:
      return ApprovalType.SendMessage;
    case SocialAgentToolName.ConnectCandidate:
    case SocialAgentToolName.AddFriend:
      return ApprovalType.ContactRequest;
    case SocialAgentToolName.JoinActivity:
      return ApprovalType.JoinActivity;
    case SocialAgentToolName.CreateActivity:
    case SocialAgentToolName.InviteActivity:
      return ApprovalType.CreateActivity;
    case SocialAgentToolName.OfflineMeeting:
      return ApprovalType.OfflineMeeting;
    case SocialAgentToolName.Payment:
      return ApprovalType.Payment;
    default:
      return ApprovalType.Custom;
  }
}

export function getSocialAgentToolApprovalRiskLevel(
  level: SceneRiskPolicyResult['riskLevel'],
): ApprovalRiskLevel {
  if (level === 'low') return ApprovalRiskLevel.Low;
  if (level === 'medium') return ApprovalRiskLevel.Medium;
  return ApprovalRiskLevel.High;
}

export function buildSocialAgentToolApprovalSummary(
  toolName: SocialAgentToolName,
  policy: SceneRiskPolicyResult,
): string {
  const actionLabel = getSocialAgentToolLabel(toolName);
  const riskLabel =
    policy.riskLevel === 'critical'
      ? 'Critical'
      : policy.riskLevel === 'high'
        ? '高风险'
        : policy.riskLevel === 'medium'
          ? '中风险'
          : '低风险';
  const confirmText = policy.requiresDoubleConfirmation
    ? '需要双确认'
    : '需要确认';
  return `${actionLabel}属于${riskLabel}动作，${confirmText}后再执行。`;
}

export function getSocialAgentToolLabel(toolName: SocialAgentToolName): string {
  const labels: Partial<Record<SocialAgentToolName, string>> = {
    [SocialAgentToolName.SendMessage]: '发消息',
    [SocialAgentToolName.SendMessageToCandidate]: '给候选人发消息',
    [SocialAgentToolName.ReplyMessage]: '回复消息',
    [SocialAgentToolName.AddFriend]: '加好友',
    [SocialAgentToolName.ConnectCandidate]: '连接候选人',
    [SocialAgentToolName.CreateActivity]: '创建活动',
    [SocialAgentToolName.InviteActivity]: '邀请参加活动',
    [SocialAgentToolName.JoinActivity]: '加入活动',
    [SocialAgentToolName.OfflineMeeting]: '线下见面',
    [SocialAgentToolName.Payment]: '支付/钱包',
    [SocialAgentToolName.PublishSocialRequest]: '发布社交需求',
    [SocialAgentToolName.CreateSocialRequest]: '创建社交需求',
  };
  return labels[toolName] ?? toolName;
}

export function shouldWriteSocialAgentActionResultInbox(
  toolName: SocialAgentToolName,
): boolean {
  return [
    SocialAgentToolName.SendMessage,
    SocialAgentToolName.SendMessageToCandidate,
    SocialAgentToolName.AddFriend,
    SocialAgentToolName.ConnectCandidate,
    SocialAgentToolName.InviteActivity,
    SocialAgentToolName.CreateActivity,
    SocialAgentToolName.JoinActivity,
    SocialAgentToolName.OfflineMeeting,
    SocialAgentToolName.ReplyMessage,
    SocialAgentToolName.SaveCandidate,
    SocialAgentToolName.PublishSocialRequest,
    SocialAgentToolName.ApproveAction,
    SocialAgentToolName.RejectAction,
    SocialAgentToolName.Payment,
  ].includes(toolName);
}

export function getSocialAgentToolActionType(
  toolName: SocialAgentToolName,
): AgentActionType {
  switch (toolName) {
    case SocialAgentToolName.PublishSocialRequest:
    case SocialAgentToolName.CreateSocialRequest:
      return AgentActionType.CreateSocialRequest;
    case SocialAgentToolName.SearchPublicIntents:
    case SocialAgentToolName.SearchActivities:
    case SocialAgentToolName.SearchMatches:
    case SocialAgentToolName.ExplainMatches:
      return AgentActionType.RunMatch;
    case SocialAgentToolName.DraftOpener:
      return AgentActionType.GenerateInvite;
    case SocialAgentToolName.SendMessageToCandidate:
    case SocialAgentToolName.SendMessage:
    case SocialAgentToolName.ReplyMessage:
      return AgentActionType.SendMessage;
    case SocialAgentToolName.ConnectCandidate:
    case SocialAgentToolName.AddFriend:
      return AgentActionType.AddFriend;
    case SocialAgentToolName.CreateActivity:
      return AgentActionType.CreateActivity;
    case SocialAgentToolName.InviteActivity:
      return AgentActionType.InviteActivity;
    case SocialAgentToolName.OfflineMeeting:
      return AgentActionType.OfflineMeeting;
    case SocialAgentToolName.ShareLocation:
      return AgentActionType.ApproveAction;
    case SocialAgentToolName.JoinActivity:
      return AgentActionType.JoinActivity;
    case SocialAgentToolName.SaveCandidate:
      return AgentActionType.ApproveAction;
    case SocialAgentToolName.GenerateProfileQuestions:
      return AgentActionType.GenerateProfileQuestion;
    case SocialAgentToolName.UpdateAiProfileFromAnswers:
    case SocialAgentToolName.UpdateProfileFromAgentContext:
      return AgentActionType.UpdateProfile;
    case SocialAgentToolName.GetMyProfile:
    case SocialAgentToolName.GetAiProfile:
      return AgentActionType.ReadProfile;
    case SocialAgentToolName.ApproveAction:
      return AgentActionType.ApproveAction;
    case SocialAgentToolName.RejectAction:
      return AgentActionType.RejectAction;
    case SocialAgentToolName.Payment:
      return AgentActionType.Payment;
    case SocialAgentToolName.GetCurrentTaskMemory:
    case SocialAgentToolName.GetConversations:
    case SocialAgentToolName.GetAgentInbox:
    case SocialAgentToolName.GetPendingApprovals:
    case SocialAgentToolName.ReadLongTermMemory:
    case SocialAgentToolName.SummarizeCurrentTask:
    case SocialAgentToolName.GetCandidatePoolDebug:
    case SocialAgentToolName.WriteInbox:
    case SocialAgentToolName.ReadInbox:
    case SocialAgentToolName.ReadTaskConversationMessages:
    case SocialAgentToolName.SummarizeReply:
    case SocialAgentToolName.DecideNextSocialAction:
      return AgentActionType.AgentEvent;
  }
}

export function getSocialAgentToolRiskLevel(
  toolName: SocialAgentToolName,
): AgentActionRiskLevel {
  if (
    toolName === SocialAgentToolName.Payment ||
    toolName === SocialAgentToolName.OfflineMeeting ||
    toolName === SocialAgentToolName.CreateActivity ||
    toolName === SocialAgentToolName.JoinActivity ||
    toolName === SocialAgentToolName.ShareLocation ||
    toolName === SocialAgentToolName.ApproveAction
  ) {
    return AgentActionRiskLevel.High;
  }
  if (
    [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.ReplyMessage,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.ConnectCandidate,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.SaveCandidate,
      SocialAgentToolName.PublishSocialRequest,
      SocialAgentToolName.RejectAction,
    ].includes(toolName)
  ) {
    return AgentActionRiskLevel.Medium;
  }
  return AgentActionRiskLevel.Low;
}

export function getSocialAgentToolRiskLevelForPolicy(
  level: SceneRiskPolicyResult['riskLevel'],
): AgentActionRiskLevel {
  if (level === 'low') return AgentActionRiskLevel.Low;
  if (level === 'medium') return AgentActionRiskLevel.Medium;
  return AgentActionRiskLevel.High;
}

export function getSocialAgentToolSceneActionType(
  toolName: SocialAgentToolName,
): string {
  switch (toolName) {
    case SocialAgentToolName.GetMyProfile:
    case SocialAgentToolName.GetAiProfile:
    case SocialAgentToolName.UpdateAiProfileFromAnswers:
    case SocialAgentToolName.UpdateProfileFromAgentContext:
      return 'profile';
    case SocialAgentToolName.SearchPublicIntents:
    case SocialAgentToolName.SearchActivities:
    case SocialAgentToolName.SearchMatches:
    case SocialAgentToolName.ExplainMatches:
      return 'search_candidates';
    case SocialAgentToolName.DraftOpener:
      return 'generate_opener';
    case SocialAgentToolName.SendMessageToCandidate:
    case SocialAgentToolName.SendMessage:
    case SocialAgentToolName.ReplyMessage:
      return 'send_message';
    case SocialAgentToolName.ConnectCandidate:
    case SocialAgentToolName.AddFriend:
      return 'add_friend';
    case SocialAgentToolName.CreateActivity:
    case SocialAgentToolName.InviteActivity:
    case SocialAgentToolName.JoinActivity:
      return 'create_activity';
    case SocialAgentToolName.OfflineMeeting:
      return 'offline_meeting';
    case SocialAgentToolName.ShareLocation:
      return 'share_location';
    case SocialAgentToolName.Payment:
      return 'payment';
    default:
      return 'chat';
  }
}

function containsPrivacySensitiveProfileField(
  input: Record<string, unknown>,
): boolean {
  const sensitiveFields = new Set(
    PRIVACY_SENSITIVE_PROFILE_FIELDS.map(normalizeSensitiveFieldName),
  );
  return (
    containsAnyKey(input, sensitiveFields) ||
    containsAnySensitiveFieldReference(input, sensitiveFields)
  );
}

function containsAnyKey(value: unknown, keys: Set<string>): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsAnyKey(item, keys));
  }
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (keys.has(normalizeSensitiveFieldName(key))) return true;
    if (containsAnyKey(nested, keys)) return true;
  }
  return false;
}

function containsAnySensitiveFieldReference(
  value: unknown,
  keys: Set<string>,
): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsAnySensitiveFieldReference(item, keys));
  }
  const record = value as Record<string, unknown>;
  for (const referenceKey of ['field', 'fieldName', 'name', 'key', 'path']) {
    const referenced = record[referenceKey];
    if (
      typeof referenced === 'string' &&
      keys.has(normalizeSensitiveFieldName(referenced))
    ) {
      return true;
    }
    if (Array.isArray(referenced)) {
      if (
        referenced.some(
          (item) =>
            typeof item === 'string' &&
            keys.has(normalizeSensitiveFieldName(item)),
        )
      ) {
        return true;
      }
    }
  }
  return Object.values(record).some((nested) =>
    containsAnySensitiveFieldReference(nested, keys),
  );
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

function truthy(value: unknown): boolean {
  if (value === true) return true;
  const text = string(value);
  return text === 'true' || text === '1' || text === 'yes' || text === 'public';
}

function normalizeSensitiveFieldName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function getSocialAgentPermissionActionForTool(
  mode: AgentTaskPermissionMode | string,
  toolName: SocialAgentToolName,
): SocialAgentAction | null {
  switch (toolName) {
    case SocialAgentToolName.GenerateProfileQuestions:
    case SocialAgentToolName.UpdateAiProfileFromAnswers:
    case SocialAgentToolName.UpdateProfileFromAgentContext:
    case SocialAgentToolName.ExplainMatches:
      return SocialAgentAction.GenerateContent;
    case SocialAgentToolName.PublishSocialRequest:
    case SocialAgentToolName.CreateSocialRequest:
      return SocialAgentAction.SendInvite;
    case SocialAgentToolName.SearchPublicIntents:
    case SocialAgentToolName.SearchActivities:
    case SocialAgentToolName.SearchMatches:
      return SocialAgentAction.SearchProfiles;
    case SocialAgentToolName.DraftOpener:
      return SocialAgentAction.DraftMessage;
    case SocialAgentToolName.SendMessageToCandidate:
    case SocialAgentToolName.SendMessage:
    case SocialAgentToolName.ReplyMessage:
      return SocialAgentAction.SendMessage;
    case SocialAgentToolName.ConnectCandidate:
    case SocialAgentToolName.AddFriend:
      return SocialAgentAction.AddFriend;
    case SocialAgentToolName.InviteActivity:
      return String(mode) === 'limited_auto'
        ? SocialAgentAction.OfflineMeet
        : SocialAgentAction.SendInvite;
    case SocialAgentToolName.CreateActivity:
    case SocialAgentToolName.JoinActivity:
      return SocialAgentAction.OfflineMeet;
    case SocialAgentToolName.SaveCandidate:
      return SocialAgentAction.FavoriteCandidate;
    case SocialAgentToolName.WriteInbox:
      return SocialAgentAction.WriteInbox;
    case SocialAgentToolName.OfflineMeeting:
    case SocialAgentToolName.ShareLocation:
      return SocialAgentAction.OfflineMeet;
    case SocialAgentToolName.Payment:
      return SocialAgentAction.Payment;
    case SocialAgentToolName.GetMyProfile:
    case SocialAgentToolName.GetAiProfile:
    case SocialAgentToolName.GetCurrentTaskMemory:
    case SocialAgentToolName.GetConversations:
    case SocialAgentToolName.GetAgentInbox:
    case SocialAgentToolName.GetPendingApprovals:
    case SocialAgentToolName.ApproveAction:
    case SocialAgentToolName.RejectAction:
    case SocialAgentToolName.ReadLongTermMemory:
    case SocialAgentToolName.SummarizeCurrentTask:
    case SocialAgentToolName.GetCandidatePoolDebug:
    case SocialAgentToolName.ReadInbox:
    case SocialAgentToolName.ReadTaskConversationMessages:
    case SocialAgentToolName.SummarizeReply:
    case SocialAgentToolName.DecideNextSocialAction:
      return null;
  }
}
