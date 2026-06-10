import { request } from './client';

export type LifeGraphFieldCategory =
  | 'identity'
  | 'social_intent'
  | 'lifestyle'
  | 'fitness_activity'
  | 'trust_safety'
  | 'interaction_memory'
  | 'privacy_boundary';

export type LifeGraphFieldSource =
  | 'manual'
  | 'ai_inferred'
  | 'activity_generated'
  | 'device_authorized'
  | 'system_generated'
  | 'imported_from_social_profile';

export type LifeGraphAuditAction =
  | 'created'
  | 'updated'
  | 'confirmed'
  | 'revoked'
  | 'rejected'
  | 'imported'
  | 'ai_proposed'
  | 'conflict_detected';

export type LifeGraphProposalStatus =
  | 'proposed'
  | 'partially_confirmed'
  | 'confirmed'
  | 'rejected'
  | 'revoked';

export type LifeGraphSignalType =
  | 'core_signal'
  | 'weak_signal'
  | 'entertainment_signal'
  | 'sensitive_signal';

export interface LifeGraphProfile {
  id: number;
  userId: number;
  completenessScore: number;
  currentSocialGoal: string;
  aiSummary: string;
  preferredLanguage: string;
  country: string;
  region: string;
  city: string;
  timezone: string;
  lastUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LifeGraphField {
  id: number;
  userId: number;
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  source: LifeGraphFieldSource;
  confidence: number;
  confirmedByUser: boolean;
  editable: boolean;
  revoked: boolean;
  revokedAt: string | null;
  lastInferredAt: string | null;
  signalType: LifeGraphSignalType;
  visibleInRecommendationReason: boolean;
  userCanDisableForMatching: boolean;
  enabledForMatching: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LifeGraphMissingField {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

export interface LifeGraphCompleteness {
  completenessScore: number;
  modules: Partial<Record<LifeGraphFieldCategory, number>>;
  missingFields: LifeGraphMissingField[];
}

export interface LifeGraphDynamicInsights {
  activityLevel: 'active' | 'quiet' | 'unknown';
  socialEnergy: 'sports' | 'social' | 'balanced' | 'unknown';
  completionTrend: 'reliable' | 'mixed' | 'fragile' | 'unknown';
  cancellationPattern: 'rare' | 'occasional' | 'frequent' | 'unknown';
  pressurePreference: 'low' | 'medium' | 'unknown';
  nightBoundary: 'avoids_late_private' | 'flexible' | 'unknown';
  locationPreference: 'same_school_or_area' | 'same_city' | 'interest_first' | 'unknown';
  feedbackPattern: string[];
  scores: {
    rhythmConfidence: number;
    sportsAffinity: number;
    lowPressureFit: number;
    safetyBoundaryClarity: number;
    reliability: number;
  };
  summary: string;
  insights: string[];
}

export interface LifeGraphResponse {
  profile: LifeGraphProfile;
  fields: Partial<Record<LifeGraphFieldCategory, LifeGraphField[]>>;
  completeness: LifeGraphCompleteness;
  dynamicInsights?: LifeGraphDynamicInsights;
  pendingProposal?: LifeGraphProposal | null;
}

export interface LifeGraphAuditLog {
  id: number;
  userId: number;
  fieldKey: string;
  category: LifeGraphFieldCategory;
  oldValue: unknown | null;
  newValue: unknown | null;
  source: LifeGraphFieldSource;
  confidence: number | null;
  action: LifeGraphAuditAction;
  reason: string;
  taskId: number | null;
  messageId: string | null;
  createdAt: string;
}

export interface LifeGraphProposedField {
  proposalFieldId: string;
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  source: LifeGraphFieldSource;
  confidence: number;
  reason: string;
  requiresUserConfirmation: boolean;
  status: 'proposed' | 'confirmed' | 'rejected' | 'conflict' | 'revoked_conflict';
  conflict: boolean;
  oldValue: unknown | null;
}

export interface LifeGraphProposal {
  proposalId: number;
  userId: number;
  taskId: number | null;
  messageId: string | null;
  proposedFields: LifeGraphProposedField[];
  status: LifeGraphProposalStatus;
  aiSummary: string;
  missingFields: LifeGraphMissingField[];
  confirmationRequired: boolean;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
}

export interface UpdateLifeGraphFieldInput {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  confirmedByUser?: boolean;
  editable?: boolean;
  revoked?: boolean;
  reason?: string;
  signalType?: LifeGraphSignalType;
  visibleInRecommendationReason?: boolean;
  userCanDisableForMatching?: boolean;
  enabledForMatching?: boolean;
}

export interface UpdateLifeGraphInput {
  fields?: UpdateLifeGraphFieldInput[];
  currentSocialGoal?: string;
  preferredLanguage?: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
}

export interface LifeGraphSecurityRequest {
  id: number;
  type: 'export' | 'delete';
  status: 'pending_cooldown' | 'ready' | 'executed' | 'expired' | 'cancelled';
  requestedByUserId: number;
  availableAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  executedAt: string | null;
  notificationEmail: string | null;
  notificationStatus: 'sent' | 'skipped' | 'failed';
  createdAt: string;
  updatedAt: string;
  devConfirmationCode?: string;
}

export const lifeGraphApi = {
  getMe() {
    return request<LifeGraphResponse>('/life-graph/me');
  },

  updateMe(data: UpdateLifeGraphInput) {
    return request<LifeGraphResponse>('/life-graph/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getCompleteness() {
    return request<LifeGraphCompleteness>('/life-graph/completeness');
  },

  getAudit() {
    return request<LifeGraphAuditLog[]>('/life-graph/audit');
  },

  confirmUpdate(data: { proposalId: number; fieldIds?: string[] }) {
    return request<LifeGraphProposal>('/life-graph/confirm-update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  rejectUpdate(data: { proposalId: number; fieldIds?: string[]; reason?: string }) {
    return request<LifeGraphProposal>('/life-graph/reject-update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  revokeField(data: {
    category: LifeGraphFieldCategory;
    fieldKey: string;
    reason?: string;
  }) {
    return request<LifeGraphResponse>('/life-graph/revoke-field', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  extractFromChat(data: { message: string; taskId?: number | null; context?: Record<string, unknown> }) {
    return request<LifeGraphProposal>('/life-graph/extract-from-chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMatchSignals() {
    return request<Record<string, unknown>>('/life-graph/match-signals');
  },

  createExportRequest(data?: { notificationEmail?: string }) {
    return request<LifeGraphSecurityRequest>('/life-graph/export-requests', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  },

  confirmExportRequest(id: number, data: { confirmationCode: string }) {
    return request<{ request: LifeGraphSecurityRequest; export: unknown }>(
      `/life-graph/export-requests/${id}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },

  createDeleteRequest(data?: { notificationEmail?: string }) {
    return request<LifeGraphSecurityRequest>('/life-graph/delete-requests', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  },

  confirmDeleteRequest(
    id: number,
    data: { confirmationCode: string; includeAuditLogs?: boolean },
  ) {
    return request<{ request: LifeGraphSecurityRequest; result: unknown }>(
      `/life-graph/delete-requests/${id}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },
};
