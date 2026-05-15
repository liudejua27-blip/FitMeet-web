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
  pending: () => api.request<ApprovalRequest[]>('/agent/approvals/pending'),
  get: (id: number) => api.request<ApprovalRequest>(`/agent/approvals/${id}`),
  approve: (id: number) =>
    api.request<{ ok: boolean; status: ApprovalStatus; dispatched?: boolean }>(
      `/agent/approvals/${id}/approve`,
      { method: 'POST' },
    ),
  reject: (id: number) =>
    api.request<{ ok: boolean; status: ApprovalStatus }>(
      `/agent/approvals/${id}/reject`,
      { method: 'POST' },
    ),
};
