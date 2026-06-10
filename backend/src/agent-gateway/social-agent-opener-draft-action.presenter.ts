import { cleanDisplayText } from '../common/display-text.util';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type {
  SocialAgentPendingActionMemo,
  SocialAgentTaskMemory,
} from './social-agent-memory.util';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';

export function buildSocialAgentOpenerDraftApprovalInput(input: {
  ownerUserId: number;
  taskId: number;
  action: string;
  targetUserId: number | null;
  candidate: Record<string, unknown>;
  draft: string;
  relatedCandidateId: number | null;
}): {
  userId: number;
  agentConnectionId: null;
  agentTaskId: number;
  type: ApprovalType.SendMessage;
  actionType: 'send_candidate_message';
  skillName: 'send_candidate_message';
  payload: Record<string, unknown>;
  summary: string;
  riskLevel: ApprovalRiskLevel.Medium;
  reason: string;
  createdBy: 'agent';
  relatedCandidateId: number | null;
} {
  return {
    userId: input.ownerUserId,
    agentConnectionId: null,
    agentTaskId: input.taskId,
    type: ApprovalType.SendMessage,
    actionType: 'send_candidate_message',
    skillName: 'send_candidate_message',
    payload: {
      source: 'agent_card_action',
      schemaAction: input.action,
      agentTaskId: input.taskId,
      candidateUserId: input.targetUserId,
      targetUserId: input.targetUserId,
      candidate: input.candidate,
      message: input.draft,
      suggestedOpener: input.draft,
    },
    summary: input.targetUserId
      ? `发送开场白给候选人 #${input.targetUserId}`
      : '发送开场白给候选人',
    riskLevel: ApprovalRiskLevel.Medium,
    reason: 'FitMeet Agent 已生成开场白草稿，等待用户确认后再发送。',
    createdBy: 'agent',
    relatedCandidateId: input.relatedCandidateId,
  };
}

export function buildSocialAgentOpenerDraftState(input: {
  action: string;
  targetUserId: number | null;
  candidate: Record<string, unknown>;
  draft: string;
  approvalId: number;
  pendingApproval: SocialAgentPendingApprovalSnapshot;
  at: string;
}): {
  pendingAction: SocialAgentPendingActionMemo;
  cardActionDraft: Record<string, unknown>;
  transitionPatch: Partial<SocialAgentTaskMemory['currentTask']>;
  displayName: string;
  assistantMessage: string;
} {
  return {
    pendingAction: {
      id: input.pendingApproval.id,
      type: input.pendingApproval.type,
      actionType: input.pendingApproval.actionType,
      summary: input.pendingApproval.summary,
      riskLevel: input.pendingApproval.riskLevel,
      at: input.at,
    },
    cardActionDraft: {
      action: input.action,
      targetUserId: input.targetUserId,
      candidate: input.candidate,
      message: input.draft,
      approvalId: input.approvalId,
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
