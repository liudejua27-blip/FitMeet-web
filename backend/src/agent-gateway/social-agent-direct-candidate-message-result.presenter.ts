import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

export type SocialAgentDirectCandidateMessageResult = {
  success: boolean;
  taskId: number;
  targetUserId: number;
  candidateUserId: number;
  status: 'sent' | 'pending_approval' | 'failed';
  messageId: string | null;
  conversationId: string | null;
  approvalId: number | null;
  requiresApproval?: true;
  message?: string;
  candidateStatus: string | null;
  messageAction: {
    status: 'sent' | 'pending_approval';
    conversationId: string | null;
    messageId: string | null;
  };
  toolCall: SocialAgentToolCallRecord;
};

export function buildSocialAgentDirectCandidateMessageResult(input: {
  taskId: number;
  targetUserId: number;
  messageAction: SocialAgentToolCallRecord;
}): SocialAgentDirectCandidateMessageResult {
  const output = isRecord(input.messageAction.output)
    ? input.messageAction.output
    : {};
  const candidate = isRecord(output.candidate) ? output.candidate : null;
  const outputStatus = cleanDisplayText(output.status, '') || null;
  const requiresApproval =
    outputStatus === 'pending_approval' ||
    outputStatus === 'pending' ||
    output.requiresApproval === true;
  const messageId = cleanDisplayText(output.id ?? output.messageId, '') || null;
  const conversationId = cleanDisplayText(output.conversationId, '') || null;
  const approvalId = number(output.approvalId);
  const status = requiresApproval
    ? 'pending_approval'
    : input.messageAction.status === 'succeeded'
      ? 'sent'
      : 'failed';

  return {
    success: input.messageAction.status === 'succeeded' || requiresApproval,
    taskId: input.taskId,
    targetUserId: input.targetUserId,
    candidateUserId: input.targetUserId,
    status,
    messageId,
    conversationId,
    approvalId,
    requiresApproval: requiresApproval || undefined,
    message: requiresApproval ? '发送消息需要你确认' : undefined,
    candidateStatus: cleanDisplayText(candidate?.status, '') || null,
    messageAction: {
      status: requiresApproval ? 'pending_approval' : 'sent',
      conversationId,
      messageId,
    },
    toolCall: input.messageAction,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function number(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
