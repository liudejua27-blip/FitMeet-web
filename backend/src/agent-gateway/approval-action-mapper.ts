import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  AgentActionRiskLevel,
  AgentActionType,
} from './entities/agent-action-log.entity';

/**
 * Maps an AgentApprovalRequest to the corresponding AgentActionType used
 * by `AgentActionLogService`. Centralised here so the JWT controller,
 * the X-Agent-Token controller, and the dispatcher service all agree on
 * the audit-log taxonomy.
 */
export function mapApprovalToActionType(
  approval: AgentApprovalRequest,
): AgentActionType {
  if (approval.actionType === 'add_friend') return AgentActionType.AddFriend;
  if (approval.actionType === 'invite_activity')
    return AgentActionType.InviteActivity;
  if (approval.actionType === 'create_activity')
    return AgentActionType.CreateActivity;
  if (approval.actionType === 'send_message')
    return AgentActionType.SendMessage;
  switch (approval.type) {
    case ApprovalType.SendMessage:
    case ApprovalType.FirstMessage:
      return AgentActionType.SendMessage;
    case ApprovalType.ContactRequest:
    case ApprovalType.ContactExchange:
      return AgentActionType.AddFriend;
    case ApprovalType.CreateActivity:
    case ApprovalType.OfflineMeeting:
      return AgentActionType.CreateActivity;
    case ApprovalType.JoinActivity:
      return AgentActionType.JoinActivity;
    case ApprovalType.SubmitCompletionProof:
    case ApprovalType.PhotoUpload:
      return AgentActionType.SubmitProof;
    default:
      return AgentActionType.SendMessage;
  }
}

export function mapApprovalRiskLevel(
  level: ApprovalRiskLevel,
): AgentActionRiskLevel {
  switch (level) {
    case ApprovalRiskLevel.High:
      return AgentActionRiskLevel.High;
    case ApprovalRiskLevel.Medium:
      return AgentActionRiskLevel.Medium;
    default:
      return AgentActionRiskLevel.Low;
  }
}
