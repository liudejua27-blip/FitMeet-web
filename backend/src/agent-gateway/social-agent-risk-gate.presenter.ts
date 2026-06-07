import type { AgentTask } from './entities/agent-task.entity';
import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { SceneRiskPolicyResult } from './scene-risk-policy.service';
import {
  getSocialAgentRelatedActivityId,
  getSocialAgentRelatedCandidateId,
  getSocialAgentRelatedSocialRequestId,
} from './social-agent-tool-audit';
import {
  buildSocialAgentToolApprovalSummary,
  getSocialAgentToolActionType,
  getSocialAgentToolApprovalRiskLevel,
  getSocialAgentToolApprovalType,
  isConfirmableSocialAgentTool,
} from './social-agent-tool-policy';
import { SocialAgentToolName } from './social-agent-tool.types';

type SocialAgentRiskGateTask = Pick<
  AgentTask,
  'id' | 'ownerUserId' | 'agentConnectionId'
>;

export type SocialAgentRiskGateApprovalInput = {
  userId: number;
  agentConnectionId: number | null;
  agentTaskId: number;
  type: ApprovalType;
  actionType: string;
  skillName: SocialAgentToolName;
  payload: Record<string, unknown>;
  summary: string;
  riskLevel: ApprovalRiskLevel;
  reason: string;
  createdBy: 'agent';
  relatedSocialRequestId: number | null;
  relatedCandidateId: number | null;
  relatedActivityId: number | null;
  rationale: string;
};

export type SocialAgentRiskGateDecision =
  | { kind: 'none' }
  | { kind: 'simulated'; output: Record<string, unknown> }
  | {
      kind: 'pending_approval';
      approvalInput: SocialAgentRiskGateApprovalInput;
    };

export function buildSocialAgentRiskGateDecision(input: {
  task: SocialAgentRiskGateTask;
  toolName: SocialAgentToolName;
  toolInput: Record<string, unknown>;
  stepId: string;
  policy: SceneRiskPolicyResult;
  hasUserApproval: boolean;
}): SocialAgentRiskGateDecision {
  const { hasUserApproval, policy, stepId, task, toolInput, toolName } = input;
  if (policy.blockedActions.includes('execute_real_action')) {
    return {
      kind: 'simulated',
      output: {
        success: true,
        status: 'simulated',
        simulated: true,
        message: '实验室模式只模拟，不会真实执行这个社交动作。',
        toolName,
        stepId,
        riskPolicy: policy,
      },
    };
  }

  if (
    !policy.requiresConfirmation ||
    hasUserApproval ||
    !isConfirmableSocialAgentTool(toolName)
  ) {
    return { kind: 'none' };
  }

  const rationale =
    policy.safetyPrompts.join('；') || 'Agent 已按场景风险策略暂停执行。';

  return {
    kind: 'pending_approval',
    approvalInput: {
      userId: task.ownerUserId,
      agentConnectionId: task.agentConnectionId ?? null,
      agentTaskId: task.id,
      type: getSocialAgentToolApprovalType(toolName, policy),
      actionType: getSocialAgentToolActionType(toolName),
      skillName: toolName,
      payload: {
        ...toolInput,
        agentTaskId: task.id,
        stepId,
        toolName,
        sceneType: policy.sceneType,
        riskLevel: policy.riskLevel,
        requiresDoubleConfirmation: policy.requiresDoubleConfirmation,
        blockedActions: policy.blockedActions,
      },
      summary: buildSocialAgentToolApprovalSummary(toolName, policy),
      riskLevel: getSocialAgentToolApprovalRiskLevel(policy.riskLevel),
      reason: policy.safetyPrompts.join('；') || '该动作需要用户确认后再执行。',
      createdBy: 'agent',
      relatedSocialRequestId: getSocialAgentRelatedSocialRequestId(
        toolInput,
        null,
      ),
      relatedCandidateId: getSocialAgentRelatedCandidateId(
        toolName,
        toolInput,
        null,
      ),
      relatedActivityId: getSocialAgentRelatedActivityId(
        toolName,
        toolInput,
        null,
      ),
      rationale,
    },
  };
}

export function buildSocialAgentPendingApprovalOutput(input: {
  approval: Pick<
    AgentApprovalRequest,
    | 'id'
    | 'type'
    | 'actionType'
    | 'summary'
    | 'riskLevel'
    | 'payload'
    | 'expiresAt'
  >;
  policy: SceneRiskPolicyResult;
}): Record<string, unknown> {
  const { approval, policy } = input;
  return {
    success: false,
    status: 'pending_approval',
    pendingApproval: true,
    approvalId: approval.id,
    approval: {
      id: approval.id,
      type: approval.type,
      actionType: approval.actionType,
      summary: approval.summary,
      riskLevel: approval.riskLevel,
      payload: approval.payload,
      expiresAt: approval.expiresAt?.toISOString?.() ?? null,
    },
    riskPolicy: policy,
    message: '已创建待确认动作，用户确认后 Agent 才会继续执行。',
  };
}
