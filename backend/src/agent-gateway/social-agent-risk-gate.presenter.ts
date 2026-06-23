import type { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import type { SceneRiskPolicyResult } from './scene-risk-policy.service';
import {
  buildSocialAgentRiskGatePayload,
  type SocialAgentRiskGateApprovalInput,
  type SocialAgentRiskGateTask,
} from './social-agent-risk-gate-approval.presenter';
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
  requiresMandatorySocialAgentApproval,
} from './social-agent-tool-policy';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentRiskGateDecision =
  | { kind: 'none' }
  | { kind: 'simulated'; output: Record<string, unknown> }
  | {
      kind: 'pending_approval';
      approvalInput: SocialAgentRiskGateApprovalInput;
      policy: SceneRiskPolicyResult;
    };

export function buildSocialAgentRiskGateDecision(input: {
  task: SocialAgentRiskGateTask;
  toolName: SocialAgentToolName;
  toolInput: Record<string, unknown>;
  stepId: string;
  policy: SceneRiskPolicyResult;
  runtimePolicy?: Record<string, unknown> | null;
  hasUserApproval: boolean;
}): SocialAgentRiskGateDecision {
  const {
    hasUserApproval,
    policy,
    runtimePolicy,
    stepId,
    task,
    toolInput,
    toolName,
  } = input;
  const mandatoryApproval = requiresMandatorySocialAgentApproval(
    toolName,
    toolInput,
  );
  const effectivePolicy =
    mandatoryApproval && !hasUserApproval
      ? ({
          ...policy,
          riskLevel:
            policy.riskLevel === 'critical' ? policy.riskLevel : 'high',
          requiresConfirmation: true,
          requiresDoubleConfirmation:
            policy.requiresDoubleConfirmation ||
            toolName === SocialAgentToolName.Payment ||
            toolName === SocialAgentToolName.ShareLocation,
          safetyPrompts: [
            ...policy.safetyPrompts,
            'mandatory_high_risk_approval',
          ],
        } satisfies SceneRiskPolicyResult)
      : policy;
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
        riskPolicy: effectivePolicy,
      },
    };
  }

  if (
    !effectivePolicy.requiresConfirmation ||
    hasUserApproval ||
    (!mandatoryApproval && !isConfirmableSocialAgentTool(toolName))
  ) {
    return { kind: 'none' };
  }

  const rationale =
    effectivePolicy.safetyPrompts.join('；') ||
    'Agent 已按场景风险策略暂停执行。';

  return {
    kind: 'pending_approval',
    policy: effectivePolicy,
    approvalInput: {
      userId: task.ownerUserId,
      agentConnectionId: task.agentConnectionId ?? null,
      agentTaskId: task.id,
      type: getSocialAgentToolApprovalType(toolName, effectivePolicy),
      actionType: getSocialAgentToolActionType(toolName),
      skillName: toolName,
      payload: buildSocialAgentRiskGatePayload({
        toolInput,
        task,
        stepId,
        toolName,
        policy: effectivePolicy,
        mandatoryApproval,
        runtimePolicy,
      }),
      summary: buildSocialAgentToolApprovalSummary(toolName, effectivePolicy),
      riskLevel: getSocialAgentToolApprovalRiskLevel(effectivePolicy.riskLevel),
      reason:
        effectivePolicy.safetyPrompts.join('；') ||
        '该动作需要用户确认后再执行。',
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
