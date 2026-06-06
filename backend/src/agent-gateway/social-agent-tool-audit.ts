import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

export function getSocialAgentToolInputSummary(
  toolName: SocialAgentToolName,
  input: Record<string, unknown>,
): string {
  return preview(`${toolName} input=${auditValuePreview(input, 320)}`, 500);
}

export function getSocialAgentToolOutputSummary(
  toolName: SocialAgentToolName,
  call: SocialAgentToolCallRecord,
): string {
  if (call.status !== 'succeeded') {
    const errorText =
      string(call.error?.message) ??
      string(call.error?.code) ??
      'unknown_error';
    return preview(`${toolName} ${call.status}: ${errorText}`, 500);
  }

  return preview(
    `${toolName} succeeded output=${auditValuePreview(call.output ?? {}, 320)}`,
    500,
  );
}

export function getSocialAgentApprovalId(
  toolName: SocialAgentToolName,
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
): number | null {
  const outputApproval = isRecord(output?.approval) ? output.approval : null;
  return (
    number(input.approvalId) ??
    ([
      SocialAgentToolName.ApproveAction,
      SocialAgentToolName.RejectAction,
    ].includes(toolName)
      ? number(input.id)
      : undefined) ??
    number(output?.approvalId) ??
    number(outputApproval?.id) ??
    ([
      SocialAgentToolName.ApproveAction,
      SocialAgentToolName.RejectAction,
    ].includes(toolName)
      ? number(output?.id)
      : undefined) ??
    null
  );
}

export function getSocialAgentTargetUserId(
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
): number | null {
  const candidate = isRecord(input.candidate) ? input.candidate : {};
  return (
    number(
      input.candidateUserId ??
        input.targetUserId ??
        input.toUserId ??
        input.recipientUserId ??
        input.recipientId ??
        input.receiverId ??
        input.payeeUserId ??
        input.userId ??
        input.followingId ??
        input.invitedUserId ??
        candidate.candidateUserId ??
        candidate.targetUserId ??
        candidate.toUserId ??
        candidate.recipientUserId ??
        candidate.recipientId ??
        candidate.receiverId ??
        candidate.userId,
    ) ??
    number(output?.targetUserId) ??
    number(output?.candidateUserId) ??
    number(output?.recipientUserId) ??
    null
  );
}

export function getSocialAgentRelatedSocialRequestId(
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
): number | null {
  return (
    number(input.socialRequestId ?? input.requestId) ??
    number(output?.socialRequestId) ??
    null
  );
}

export function getSocialAgentRelatedCandidateId(
  toolName: SocialAgentToolName,
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
): number | null {
  return (
    number(input.candidateRecordId ?? input.candidateId) ??
    number(output?.candidateRecordId) ??
    (toolName === SocialAgentToolName.SaveCandidate
      ? number(output?.id)
      : undefined) ??
    null
  );
}

export function getSocialAgentRelatedActivityId(
  toolName: SocialAgentToolName,
  input: Record<string, unknown>,
  output: Record<string, unknown> | null,
): number | null {
  return (
    number(input.activityId) ??
    number(output?.activityId) ??
    ([
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.CreateActivity,
      SocialAgentToolName.JoinActivity,
      SocialAgentToolName.OfflineMeeting,
    ].includes(toolName)
      ? number(output?.id)
      : undefined) ??
    null
  );
}

function auditValuePreview(value: unknown, max: number): string {
  const compactValue = compactAuditValue(value);
  const text =
    typeof compactValue === 'string'
      ? compactValue
      : JSON.stringify(compactValue);
  return preview(text ?? safeUnknownText(value), max);
}

function compactAuditValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return preview(value, 160);
  if (typeof value !== 'object') return value;
  if (depth >= 2) return Array.isArray(value) ? '[Array]' : '[Object]';
  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item) => compactAuditValue(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 12)) {
    result[key] = compactAuditValue(item, depth + 1);
  }
  return result;
}

function preview(value: unknown, max = 160): string {
  const text = string(value) ?? '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function string(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function safeUnknownText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function number(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
