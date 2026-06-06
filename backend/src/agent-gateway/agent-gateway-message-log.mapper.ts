import { LogAgentActionInput } from './agent-action-log.service';
import { mapApprovalRiskLevel as mapApprovalRiskToActionRisk } from './approval-action-mapper';
import { SendMessageDto } from './dto/agent-gateway.dto';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';

type SendMessageVerdict = {
  blockedReason?: string | null;
  reasons: string[];
  riskLevel?: ApprovalRiskLevel;
};

function messageType(dto: SendMessageDto) {
  return dto.messageType ?? 'text';
}

function messageSource(conn: AgentConnection, dto: SendMessageDto) {
  return dto.metadata?.source ?? conn.agentName;
}

export function buildBlockedSendMessageActionLog(input: {
  conn: AgentConnection;
  dto: SendMessageDto;
  targetUserId: number;
  content: string;
  agentTaskId: number | null;
  verdict: SendMessageVerdict;
  isFirstContact: boolean;
}): LogAgentActionInput {
  const {
    conn,
    dto,
    targetUserId,
    content,
    agentTaskId,
    verdict,
    isFirstContact,
  } = input;
  return {
    ownerUserId: conn.userId,
    agentId: conn.id,
    actionType: AgentActionType.SendMessage,
    actionStatus: AgentActionStatus.Failed,
    riskLevel: AgentActionRiskLevel.High,
    targetUserId,
    inputSummary: content,
    outputSummary: `blocked_by_policy: ${verdict.blockedReason ?? 'policy'}`,
    payload: {
      agentTaskId,
      messageType: messageType(dto),
      reasons: verdict.reasons,
      isFirstContact,
    },
    reason: verdict.blockedReason ?? 'blocked_by_policy',
  };
}

export function buildPendingApprovalSendMessageActionLog(input: {
  conn: AgentConnection;
  dto: SendMessageDto;
  targetUserId: number;
  content: string;
  agentTaskId: number | null;
  approvalRequest: Pick<
    AgentApprovalRequest,
    'id' | 'summary' | 'reason' | 'riskLevel'
  >;
  verdict: SendMessageVerdict;
  isFirstContact: boolean;
}): LogAgentActionInput {
  const {
    conn,
    dto,
    targetUserId,
    content,
    agentTaskId,
    approvalRequest,
    verdict,
    isFirstContact,
  } = input;
  return {
    ownerUserId: conn.userId,
    agentId: conn.id,
    actionType: AgentActionType.SendMessage,
    actionStatus: AgentActionStatus.PendingApproval,
    agentTaskId,
    riskLevel: mapApprovalRiskToActionRisk(approvalRequest.riskLevel),
    targetUserId,
    relatedSocialRequestId: dto.socialRequestId ?? null,
    relatedActivityId: dto.activityId ?? null,
    inputSummary: content,
    outputSummary: `pending_approval: ${approvalRequest.summary}`,
    payload: {
      approvalId: approvalRequest.id,
      agentTaskId,
      approvalType: isFirstContact
        ? ApprovalType.FirstMessage
        : ApprovalType.SendMessage,
      reasons: verdict.reasons,
      messageType: messageType(dto),
    },
    reason: approvalRequest.reason ?? null,
  };
}

export function buildExecutedSendMessageActionLog(input: {
  conn: AgentConnection;
  dto: SendMessageDto;
  targetUserId: number;
  content: string;
  agentTaskId: number | null;
  risk: number;
  messageId: string;
  conversationId: string;
  socketPushed: boolean;
  notificationCreated: boolean;
}): LogAgentActionInput {
  const {
    conn,
    dto,
    targetUserId,
    content,
    agentTaskId,
    risk,
    messageId,
    conversationId,
    socketPushed,
    notificationCreated,
  } = input;
  return {
    ownerUserId: conn.userId,
    agentId: conn.id,
    actionType: AgentActionType.SendMessage,
    actionStatus: AgentActionStatus.Executed,
    agentTaskId,
    riskLevel:
      risk >= 0.4 ? AgentActionRiskLevel.Medium : AgentActionRiskLevel.Low,
    targetUserId,
    relatedSocialRequestId: dto.socialRequestId ?? null,
    relatedActivityId: dto.activityId ?? null,
    inputSummary: content,
    outputSummary: `message_sent: id=${messageId} conv=${conversationId}`,
    payload: {
      messageId,
      conversationId,
      messageType: messageType(dto),
      agentTaskId,
      socketPushed,
      notificationCreated,
      approvalRequestId: dto.approvalRequestId ?? null,
      source: messageSource(conn, dto),
    },
    reason: 'agent_send_message',
  };
}
