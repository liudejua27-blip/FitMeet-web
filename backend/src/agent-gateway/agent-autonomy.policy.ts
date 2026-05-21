import { ApprovalRiskLevel } from './entities/agent-approval-request.entity';
import { AgentSettingsMode } from './entities/agent-settings.entity';

export type AgentAutoActionType =
  | 'read_profile'
  | 'generate_suggestion'
  | 'generate_social_request_draft'
  | 'recommend_candidate'
  | 'auto_match'
  | 'generate_invite'
  | 'send_message'
  | 'add_friend'
  | 'contact_exchange'
  | 'invite_activity'
  | 'create_activity'
  | 'create_activity_draft'
  | 'offline_meeting'
  | 'payment'
  | 'agent_chat';

export type AgentAutonomyLevel =
  | AgentSettingsMode.Assisted
  | AgentSettingsMode.Basic
  | AgentSettingsMode.Normal
  | AgentSettingsMode.Standard
  | AgentSettingsMode.Open
  | AgentSettingsMode.SandboxInternal
  | 'assisted'
  | 'basic'
  | 'normal'
  | 'standard'
  | 'open'
  | 'sandbox_internal';

export type AgentRiskLevel =
  | ApprovalRiskLevel
  | 'low'
  | 'medium'
  | 'high'
  | 'blocked';

const ASSISTED_AUTO_ACTIONS = new Set<AgentAutoActionType>([
  'read_profile',
  'generate_suggestion',
  'generate_social_request_draft',
  'recommend_candidate',
]);

const NORMAL_AUTO_ACTIONS = new Set<AgentAutoActionType>([
  'read_profile',
  'generate_suggestion',
  'generate_social_request_draft',
  'recommend_candidate',
  'auto_match',
  'generate_invite',
  'send_message',
]);

const OPEN_AUTO_ACTIONS = new Set<AgentAutoActionType>([
  ...NORMAL_AUTO_ACTIONS,
  'add_friend',
  'invite_activity',
  'create_activity',
  'create_activity_draft',
  'agent_chat',
]);

export function canAutoExecute(
  actionType: AgentAutoActionType,
  autonomyLevel: AgentAutonomyLevel,
  riskLevel: AgentRiskLevel,
): boolean {
  const mode = normalizeAutonomyLevel(autonomyLevel);
  const risk = normalizeRiskLevel(riskLevel);

  if (mode === AgentSettingsMode.SandboxInternal || risk === 'blocked') {
    return false;
  }

  if (mode === AgentSettingsMode.Assisted || mode === AgentSettingsMode.Basic) {
    return risk !== 'high' && ASSISTED_AUTO_ACTIONS.has(actionType);
  }

  if (
    mode === AgentSettingsMode.Normal ||
    mode === AgentSettingsMode.Standard
  ) {
    return risk !== 'high' && NORMAL_AUTO_ACTIONS.has(actionType);
  }

  if (mode === AgentSettingsMode.Open) {
    return risk !== 'high' && OPEN_AUTO_ACTIONS.has(actionType);
  }

  return false;
}

export function normalizeAutonomyLevel(
  autonomyLevel: AgentAutonomyLevel,
): AgentSettingsMode {
  switch (autonomyLevel) {
    case AgentSettingsMode.Assisted:
    case 'assisted':
      return AgentSettingsMode.Assisted;
    case AgentSettingsMode.Basic:
    case 'basic':
      return AgentSettingsMode.Basic;
    case AgentSettingsMode.Normal:
    case 'normal':
      return AgentSettingsMode.Normal;
    case AgentSettingsMode.Standard:
    case 'standard':
      return AgentSettingsMode.Standard;
    case AgentSettingsMode.Open:
    case 'open':
      return AgentSettingsMode.Open;
    case AgentSettingsMode.SandboxInternal:
    case 'sandbox_internal':
      return AgentSettingsMode.SandboxInternal;
    default:
      return AgentSettingsMode.Assisted;
  }
}

export function normalizeRiskLevel(riskLevel: AgentRiskLevel) {
  const value = String(riskLevel);
  if (value === 'low') return 'low';
  if (value === 'medium') return 'medium';
  if (value === 'high') return 'high';
  return 'blocked';
}
