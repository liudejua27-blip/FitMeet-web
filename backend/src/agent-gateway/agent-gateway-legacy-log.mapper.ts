import { AgentConnection } from './entities/agent-connection.entity';
import {
  ActionResult,
  LoggedAction,
} from './entities/agent-activity-log.entity';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';

export function buildLegacyAgentActionLogInput(input: {
  conn: AgentConnection;
  action: LoggedAction;
  payload: Record<string, unknown>;
  result: ActionResult;
  blockReason?: string | null;
  riskScore?: number;
}) {
  const { conn, action, payload, result, blockReason, riskScore = 0 } = input;
  const actionType = mapLegacyLoggedActionToActionType(action, payload);
  if (!actionType) return null;

  return {
    ownerUserId: conn.userId,
    agentId: conn.id,
    agentTaskId: pickNumber(payload, 'agentTaskId'),
    actionType,
    actionStatus: mapLegacyActionResult(result),
    riskLevel: mapLegacyRiskLevel(result, riskScore),
    eventType:
      pickString(payload, 'eventType', 'event') ??
      (actionType === AgentActionType.AgentEvent ? action : null),
    conversationId: pickString(payload, 'conversationId'),
    messageId: pickString(payload, 'messageId'),
    status: pickString(payload, 'status') ?? result,
    targetUserId: pickNumber(
      payload,
      'targetUserId',
      'candidateUserId',
      'toUserId',
    ),
    relatedSocialRequestId: pickNumber(payload, 'socialRequestId', 'requestId'),
    relatedActivityId: pickNumber(payload, 'activityId'),
    inputSummary: summarizeLegacyActionInput(action, payload),
    outputSummary: summarizeLegacyActionOutput(action, payload, result),
    payload: { legacyAction: action, ...payload },
    reason: blockReason ?? pickString(payload, 'reason') ?? `legacy_${action}`,
  };
}

export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function mapLegacyLoggedActionToActionType(
  action: LoggedAction,
  payload: Record<string, unknown>,
): AgentActionType | null {
  switch (action) {
    case LoggedAction.AgentEvent:
    case LoggedAction.LabChat:
    case LoggedAction.ReportRisk:
      return AgentActionType.AgentEvent;
    case LoggedAction.CreateSocialRequest:
      return null;
    case LoggedAction.ConfirmSocialRequestCandidate:
      return payload.decision === 'reject'
        ? AgentActionType.RejectAction
        : AgentActionType.ApproveAction;
    case LoggedAction.Search:
      return pickNumber(payload, 'socialRequestId', 'requestId') === null
        ? AgentActionType.RunMatch
        : null;
    case LoggedAction.MatchPartner:
      return pickNumber(payload, 'socialRequestId') === null
        ? AgentActionType.RunMatch
        : null;
    case LoggedAction.DraftPost:
    case LoggedAction.DraftMessage:
      return AgentActionType.GenerateInvite;
    case LoggedAction.Intercepted:
      return AgentActionType.SendMessage;
    case LoggedAction.SendMessage:
    case LoggedAction.ContactRequest:
    case LoggedAction.CreateActivity:
    case LoggedAction.JoinActivity:
    case LoggedAction.SubmitCompletionProof:
      return null;
    default:
      return AgentActionType.AgentEvent;
  }
}

export function mapLegacyActionResult(result: ActionResult): AgentActionStatus {
  switch (result) {
    case ActionResult.PendingApproval:
      return AgentActionStatus.PendingApproval;
    case ActionResult.Blocked:
    case ActionResult.Error:
      return AgentActionStatus.Failed;
    default:
      return AgentActionStatus.Executed;
  }
}

export function mapLegacyRiskLevel(
  result: ActionResult,
  riskScore: number,
): AgentActionRiskLevel {
  if (riskScore >= 0.7) return AgentActionRiskLevel.High;
  if (riskScore >= 0.3 || result !== ActionResult.Success) {
    return AgentActionRiskLevel.Medium;
  }
  return AgentActionRiskLevel.Low;
}

export function pickNumber(
  payload: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = numberOrNull(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

export function pickString(
  payload: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function summarizeLegacyActionInput(
  action: LoggedAction,
  payload: Record<string, unknown>,
): string | null {
  return (
    pickString(payload, 'query', 'description', 'type', 'requestType') ??
    pickString(payload, 'reason') ??
    action
  );
}

export function summarizeLegacyActionOutput(
  action: LoggedAction,
  payload: Record<string, unknown>,
  result: ActionResult,
): string {
  const count = pickNumber(payload, 'resultCount', 'candidateCount');
  const requestId = pickNumber(payload, 'requestId', 'socialRequestId');
  if (count !== null) return `${action}: ${result}, count=${count}`;
  if (requestId !== null) return `${action}: ${result}, request=${requestId}`;
  return `${action}: ${result}`;
}
