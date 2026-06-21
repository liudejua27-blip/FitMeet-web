import { cleanDisplayText } from '../common/display-text.util';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  buildActionApprovalRuntimeContextSummary,
  type SocialAgentActionApprovalRuntimeContext,
} from './social-agent-candidate-action-approval-context.presenter';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
} from './social-agent-chat.types';

export type { SocialAgentActionApprovalRuntimeContext };

export function buildSocialAgentCandidateActionApprovalInput(input: {
  ownerUserId: number;
  taskId: number;
  message: string;
  route: Pick<SocialAgentIntentRouteResult, 'intent' | 'entities'>;
  candidate?: Record<string, unknown>;
  targetUserId: number | null;
  relatedCandidateId: number | null;
  runtimeContext?: SocialAgentActionApprovalRuntimeContext | null;
}) {
  const targetUserId =
    input.targetUserId ??
    positiveNumber(
      input.candidate?.targetUserId ??
        input.candidate?.candidateUserId ??
        input.candidate?.userId,
    );
  const candidateRecordId =
    input.relatedCandidateId ??
    positiveNumber(
      input.candidate?.candidateRecordId ??
        input.candidate?.socialRequestCandidateId,
    );
  const socialRequestId = positiveNumber(input.candidate?.socialRequestId);
  const inferred = inferSocialAgentCandidateActionApproval(
    input.message,
    input.candidate,
    targetUserId,
  );
  const runtimeContext = buildActionApprovalRuntimeContextSummary(
    input.runtimeContext,
  );
  return {
    userId: input.ownerUserId,
    agentConnectionId: null,
    agentTaskId: input.taskId,
    type: inferred.type,
    actionType: inferred.actionType,
    skillName: inferred.actionType,
    payload: {
      source: 'social_agent_chat',
      userMessage: input.message,
      intent: input.route.intent,
      entities: input.route.entities,
      taskId: input.taskId,
      agentTaskId: input.taskId,
      ...(targetUserId
        ? {
            targetUserId,
            candidateUserId: targetUserId,
          }
        : {}),
      ...(candidateRecordId
        ? {
            candidateRecordId,
            socialRequestCandidateId: candidateRecordId,
          }
        : {}),
      ...(socialRequestId ? { socialRequestId } : {}),
      ...(runtimeContext
        ? {
            socialCodex: {
              runtimeContext,
            },
          }
        : {}),
    },
    summary: inferred.summary,
    riskLevel: inferred.riskLevel,
    reason: '由 Social Agent 聊天意图路由生成，待用户在前端确认。',
    createdBy: 'agent' as const,
    relatedCandidateId: candidateRecordId,
  };
}

export function buildSocialAgentCandidateActionApprovalState(input: {
  pendingApproval: SocialAgentPendingApprovalSnapshot;
  at: string;
}) {
  return {
    pendingAction: {
      id: input.pendingApproval.id,
      type: input.pendingApproval.type,
      actionType: input.pendingApproval.actionType,
      summary: input.pendingApproval.summary,
      riskLevel: input.pendingApproval.riskLevel,
      at: input.at,
    },
    transitionPatch: {
      objective: 'candidate_action',
      nextStep: '等待用户确认候选人动作',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'action_confirmation',
      lastCompletedStep: 'approval_created',
    },
  };
}

function positiveNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function inferSocialAgentCandidateActionApproval(
  message: string,
  candidate: Record<string, unknown> | undefined,
  targetUserId: number | null,
) {
  const candidateLabel =
    cleanDisplayText(candidate?.displayName ?? candidate?.nickname ?? candidate?.name, '') ||
    (targetUserId ? '这位用户' : '对方');
  if (/(加好友|关注|加微信|加联系方式)/.test(message)) {
    return {
      type: ApprovalType.ContactRequest,
      actionType: 'connect_candidate',
      riskLevel: ApprovalRiskLevel.High,
      summary: `加好友并聊天：${candidateLabel}`,
    };
  }
  if (/(发消息|打招呼|私信|联系)/.test(message)) {
    return {
      type: ApprovalType.SendMessage,
      actionType: 'send_invite',
      riskLevel: ApprovalRiskLevel.High,
      summary: `发送消息给${candidateLabel}`,
    };
  }
  if (/(邀请|约|约练|约局)/.test(message)) {
    return {
      type: ApprovalType.JoinActivity,
      actionType: 'send_invite',
      riskLevel: ApprovalRiskLevel.High,
      summary: `邀请${candidateLabel}参加约练`,
    };
  }
  return {
    type: ApprovalType.Custom,
    actionType: 'social_agent_action',
    riskLevel: ApprovalRiskLevel.Low,
    summary: `继续处理：${cleanDisplayText(message, '这个请求').slice(0, 80)}`,
  };
}
