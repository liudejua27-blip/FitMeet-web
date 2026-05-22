import * as api from './client';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ApprovalRiskLevel = 'low' | 'medium' | 'high';

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

export const agentApprovalsApi = {
  pending: () => api.requestProtected<ApprovalRequest[]>('/agent/owner/pending-approvals'),
  get: (id: number) => api.requestProtected<ApprovalRequest>(`/agent/approvals/${id}`),
  approve: (id: number) =>
    api.requestProtected<{ ok: boolean; status: ApprovalStatus; dispatched?: boolean }>(
      `/agent/owner/approvals/${id}/approve`,
      { method: 'POST' },
    ),
  reject: (id: number) =>
    api.requestProtected<{ ok: boolean; status: ApprovalStatus }>(
      `/agent/owner/approvals/${id}/reject`,
      { method: 'POST' },
    ),
};
