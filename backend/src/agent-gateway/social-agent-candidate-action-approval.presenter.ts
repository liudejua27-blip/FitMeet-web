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
  const inferred = inferSocialAgentCandidateActionApproval(
    input.message,
    input.candidate,
    input.targetUserId,
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
      candidateUserId: input.targetUserId,
      agentTaskId: input.taskId,
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
    relatedCandidateId: input.relatedCandidateId,
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

function inferSocialAgentCandidateActionApproval(
  message: string,
  candidate: Record<string, unknown> | undefined,
  targetUserId: number | null,
) {
  const candidateLabel = candidate
    ? `候选人 #${cleanDisplayText(candidate.userId ?? candidate.candidateUserId ?? targetUserId, '')}`
    : '候选人';
  if (/(加好友|关注|加微信|加联系方式)/.test(message)) {
    return {
      type: ApprovalType.ContactRequest,
      actionType: 'connect_candidate',
      riskLevel: ApprovalRiskLevel.Medium,
      summary: `用户请求添加${candidateLabel}为好友/关注`,
    };
  }
  if (/(发消息|打招呼|私信|联系)/.test(message)) {
    return {
      type: ApprovalType.SendMessage,
      actionType: 'send_invite',
      riskLevel: ApprovalRiskLevel.Medium,
      summary: `用户请求向${candidateLabel}发送消息`,
    };
  }
  if (/(邀请|约|约练|约局)/.test(message)) {
    return {
      type: ApprovalType.JoinActivity,
      actionType: 'invite_candidate',
      riskLevel: ApprovalRiskLevel.Medium,
      summary: `用户请求邀请${candidateLabel}参加活动`,
    };
  }
  return {
    type: ApprovalType.Custom,
    actionType: 'social_agent_action',
    riskLevel: ApprovalRiskLevel.Low,
    summary: `用户请求执行动作：${message.slice(0, 80)}`,
  };
}
