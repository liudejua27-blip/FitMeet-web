import * as api from './client';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalRiskLevel = 'low' | 'medium' | 'high';
export type AgentCheckpointAction = 'resume' | 'retry' | 'replay' | 'fork';

export interface ApprovalRequest {
  id: number;
  userId: number;
  agentConnectionId: number | null;
  type: string;
  actionType?: string;
  skillName?: string;
  payload: Record<string, unknown>;
  summary: string;
  reason?: string;
  createdBy?: string;
  relatedSocialRequestId?: number | null;
  relatedCandidateId?: number | null;
  riskLevel: ApprovalRiskLevel;
  rationale?: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt?: string;
}

export type AgentApprovalResumePlan = {
  checkpointId: number;
  parentCheckpointId: number | null;
  taskId: number;
  action: AgentCheckpointAction;
  resumePrompt: string;
  threadId: string;
  resumeCursor: {
    threadId?: string | null;
    checkpointId?: number | string | null;
    parentCheckpointId?: number | string | null;
    action?: AgentCheckpointAction | null;
    stepId?: string | null;
  };
  sourceStep: {
    stepId: string;
    label: string | null;
    toolName: string | null;
  } | null;
  stepScope: {
    mode: 'full_checkpoint' | 'through_step';
    stepCount: number;
    sourceCheckpointId: number | null;
  };
  sideEffectPolicy: {
    idempotencyKey: string;
    sideEffectsBeforeResume: 'idempotent_only';
    duplicatePolicy: 'reuse_idempotency_key';
  };
  idempotencyKey: string;
  interrupt: Record<string, unknown> | null;
  traceId: string | null;
  runId: string | null;
} | null;

export type AgentCheckpointStepSummary = {
  stepId: string;
  label: string;
  status: string | null;
  toolName: string | null;
  retryable: boolean;
  replayable: boolean;
  forkable: boolean;
};

export type AgentCheckpointSummary = {
  id: number;
  agentTaskId: number;
  status: string;
  resumable: boolean;
  canRetry: boolean;
  canReplay: boolean;
  canFork: boolean;
  threadId: string;
  sourceStep: {
    stepId: string;
    label: string | null;
    toolName: string | null;
  } | null;
  steps: AgentCheckpointStepSummary[];
  createdAt?: string;
  updatedAt?: string;
};

export type AgentApprovalDispatchResult = {
  following?: boolean;
  targetUserId?: number | string | null;
  friendRequestId?: number | string | null;
  conversationId?: number | string | null;
  openedConversation?: boolean;
  socialRequestId?: number | string | null;
  candidateRecordId?: number | string | null;
  idempotencyKey?: string | null;
  [key: string]: unknown;
};

export const agentApprovalsApi = {
  pending: () => api.requestProtected<ApprovalRequest[]>('/agent/owner/pending-approvals'),
  get: (id: number) => api.requestProtected<ApprovalRequest>(`/agent/approvals/${id}`),
  latestCheckpointForTask: (taskId: number | string) =>
    api.requestProtected<{ checkpoint: AgentCheckpointSummary | null }>(
      fitMeetCoreEndpoints.agentControl.latestCheckpointForTask(taskId),
    ),
  approve: (id: number) =>
    api.requestProtected<{
      ok: boolean;
      status: ApprovalStatus;
      dispatched?: boolean;
      dispatchError?: string;
      checkpointError?: string;
      result?: AgentApprovalDispatchResult;
      resume?: AgentApprovalResumePlan;
    }>(
      `/agent/owner/approvals/${id}/approve`,
      { method: 'POST' },
    ),
  reject: (id: number) =>
    api.requestProtected<{
      ok: boolean;
      status: ApprovalStatus;
      checkpointError?: string;
      resume?: AgentApprovalResumePlan;
    }>(
      `/agent/owner/approvals/${id}/reject`,
      { method: 'POST' },
    ),
};
