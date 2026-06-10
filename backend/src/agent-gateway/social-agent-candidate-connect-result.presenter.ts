import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';
export type SocialAgentCandidateConnectResult = {
  taskId: number;
  targetUserId: number;
  candidateUserId: number;
  success: true;
  status: 'connected' | 'pending_approval';
  following: boolean;
  friendRequestId: string | null;
  conversationId: string | null;
  approvalId?: number | null;
  requiresApproval?: true;
  message?: string;
  friendAction: {
    success: true;
    status: 'connected' | 'pending_approval';
    targetUserId: number;
    candidateUserId: number;
    following: boolean;
    conversationId: string | null;
    friendRequestId: string | null;
  };
  toolCall: SocialAgentToolCallRecord;
};
export function buildSocialAgentCandidateConnectResult(input: {
  taskId: number;
  targetUserId: number;
  friendAction: SocialAgentToolCallRecord;
}): SocialAgentCandidateConnectResult {
  const output = isRecord(input.friendAction.output)
    ? input.friendAction.output
    : {};
  const outputStatus = cleanDisplayText(output.status, '') || null;
  const requiresApproval =
    outputStatus === 'pending_approval' ||
    outputStatus === 'pending' ||
    output.requiresApproval === true;
  const base = {
    taskId: input.taskId,
    targetUserId: input.targetUserId,
    candidateUserId: input.targetUserId,
    success: true as const,
    toolCall: input.friendAction,
  };
  const friendActionBase = {
    success: true as const,
    targetUserId: input.targetUserId,
    candidateUserId: input.targetUserId,
  };
  if (requiresApproval) {
    return {
      ...base,
      status: 'pending_approval',
      following: false,
      friendRequestId: null,
      conversationId: null,
      approvalId: number(output.approvalId),
      requiresApproval: true,
      message: '加好友/连接候选人需要你确认',
      friendAction: {
        ...friendActionBase,
        status: 'pending_approval',
        following: false,
        conversationId: null,
        friendRequestId: null,
      },
    };
  }

  const friendRequestId =
    cleanDisplayText(
      output.friendRequestId ?? output.followId ?? output.id,
      '',
    ) || null;
  const conversationId = cleanDisplayText(output.conversationId, '') || null;

  return {
    ...base,
    status: 'connected',
    following: true,
    friendRequestId,
    conversationId,
    friendAction: {
      ...friendActionBase,
      status: 'connected',
      following: true,
      conversationId,
      friendRequestId,
    },
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function number(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
