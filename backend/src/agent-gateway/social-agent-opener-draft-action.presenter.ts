import { cleanDisplayText } from '../common/display-text.util';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';

export function buildSocialAgentOpenerDraftApprovalInput(input: {
  ownerUserId: number;
  taskId: number;
  action: string;
  targetUserId: number | null;
  candidate: Record<string, unknown>;
  draft: string;
  relatedCandidateId: number | null;
  idempotencyKey?: string | null;
  safetyBoundary?: string | null;
}) {
  const candidateRecordId =
    input.relatedCandidateId ??
    positiveNumber(
      input.candidate.candidateRecordId ??
        input.candidate.socialRequestCandidateId,
    );
  const socialRequestId = positiveNumber(input.candidate.socialRequestId);
  return {
    userId: input.ownerUserId,
    agentConnectionId: null,
    agentTaskId: input.taskId,
    type: ApprovalType.SendMessage,
    actionType: 'send_invite',
    skillName: 'send_invite',
    payload: {
      source: 'agent_card_action',
      schemaAction: input.action,
      taskId: input.taskId,
      agentTaskId: input.taskId,
      candidateUserId: input.targetUserId,
      targetUserId: input.targetUserId,
      ...(candidateRecordId
        ? {
            candidateRecordId,
            socialRequestCandidateId: candidateRecordId,
          }
        : {}),
      ...(socialRequestId ? { socialRequestId } : {}),
      candidate: input.candidate,
      message: input.draft,
      suggestedOpener: input.draft,
      safetyBoundary:
        cleanDisplayText(input.safetyBoundary, '') ||
        '确认前不会发送。建议先站内沟通，不急着交换联系方式。',
      approvalRequired: true,
      checkpointRequired: true,
      resumeMode: 'resume_after_approval',
      idempotencyKey:
        cleanDisplayText(input.idempotencyKey, '') ||
        `opener-send:${input.taskId}:${input.targetUserId ?? 'candidate'}`,
      riskReasons: [
        '这个动作会向真实用户发送消息',
        '发送前需要你确认语气和内容',
        '不会自动交换联系方式或精确位置',
      ],
    },
    summary: input.targetUserId ? '发送开场白给这位用户' : '发送开场白给对方',
    riskLevel: ApprovalRiskLevel.High,
    reason: 'FitMeet Agent 已生成开场白草稿，等待用户确认后再发送。',
    createdBy: 'agent' as const,
    relatedCandidateId: candidateRecordId,
  };
}

export function buildSocialAgentOpenerDraftState(input: {
  action: string;
  targetUserId: number | null;
  candidate: Record<string, unknown>;
  draft: string;
  approvalId?: number | null;
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
  at?: string;
}) {
  const pendingAction = input.pendingApproval
    ? {
        id: input.pendingApproval.id,
        type: input.pendingApproval.type,
        actionType: input.pendingApproval.actionType,
        summary: input.pendingApproval.summary,
        riskLevel: input.pendingApproval.riskLevel,
        at: input.at ?? new Date().toISOString(),
      }
    : null;
  return {
    pendingAction,
    cardActionDraft: {
      action: input.action,
      targetUserId: input.targetUserId,
      candidate: input.candidate,
      message: input.draft,
      ...(input.approvalId ? { approvalId: input.approvalId } : {}),
    },
    transitionPatch: {
      objective: 'candidate_messaging',
      nextStep: '等待你确认是否发送开场白',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'message_confirmation',
      lastCompletedStep: 'opener_draft_created',
    },
    displayName:
      cleanDisplayText(
        input.candidate.displayName ?? input.candidate.nickname,
        '',
      ) || '对方',
    assistantMessage:
      '我先帮你写了一条低压力的开场白。你确认前，我不会替你发送。',
  };
}

function positiveNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
