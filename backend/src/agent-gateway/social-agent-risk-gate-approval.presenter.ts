import type { AgentTask } from './entities/agent-task.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { SceneRiskPolicyResult } from './scene-risk-policy.service';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentRiskGateTask = Pick<
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

export function buildSocialAgentRiskGatePayload(input: {
  toolInput: Record<string, unknown>;
  task: SocialAgentRiskGateTask;
  stepId: string;
  toolName: SocialAgentToolName;
  policy: SceneRiskPolicyResult;
  mandatoryApproval: boolean;
  runtimePolicy?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const {
    mandatoryApproval,
    policy,
    runtimePolicy,
    stepId,
    task,
    toolInput,
    toolName,
  } = input;
  const runtimeSocialCodex = isRecord(runtimePolicy?.socialCodex)
    ? runtimePolicy.socialCodex
    : null;
  const runtimeAudit = isRecord(runtimePolicy?.socialCodexAudit)
    ? runtimePolicy.socialCodexAudit
    : null;
  return {
    ...toolInput,
    agentTaskId: task.id,
    stepId,
    toolName,
    sceneType: policy.sceneType,
    riskLevel: policy.riskLevel,
    requiresDoubleConfirmation: policy.requiresDoubleConfirmation,
    blockedActions: policy.blockedActions,
    mandatoryApproval,
    ...(runtimeSocialCodex
      ? {
          socialCodex: {
            ...runtimeSocialCodex,
            executionContract:
              typeof runtimePolicy?.executionContract === 'string'
                ? runtimePolicy.executionContract
                : null,
          },
        }
      : {}),
    ...(runtimeAudit ? { socialCodexAudit: runtimeAudit } : {}),
    ...(typeof runtimePolicy?.dryRunRequired === 'boolean'
      ? { dryRunRequired: runtimePolicy.dryRunRequired }
      : {}),
    ...(typeof runtimePolicy?.auditRequired === 'boolean'
      ? { auditRequired: runtimePolicy.auditRequired }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
