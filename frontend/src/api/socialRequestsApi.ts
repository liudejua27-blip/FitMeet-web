import * as api from './client';

export type SocialRequestType =
  | 'running_partner'
  | 'fitness_partner'
  | 'dog_walking'
  | 'coffee_chat'
  | 'city_walk'
  | 'study_partner'
  | 'custom';

export type SocialRequestStatus =
  | 'draft'
  | 'matching'
  | 'matched'
  | 'invitation_pending'
  | 'chatting'
  | 'activity_created'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type SocialRequestSource =
  | 'manual'
  | 'openclaw'
  | 'codex'
  | 'claude'
  | 'custom_agent'
  | 'public';

export interface SocialRequestSummary {
  id: number;
  type: SocialRequestType;
  title: string;
  description: string;
  city: string;
  radiusKm: number;
  timeStart: string | null;
  timeEnd: string | null;
  interestTags: string[];
  status: SocialRequestStatus;
  source: SocialRequestSource;
  agentName?: string | null;
  createdAt: string;
}

export interface CandidateView {
  userId: number;
  nickname: string;
  avatar: string;
  color: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  distanceKm: number | null;
  commonTags: string[];
  reasons: string[];
  scoreBreakdown: Record<string, number>;
  risk: { level: 'low' | 'medium' | 'high'; warnings: string[] };
  suggestedMessage: string;
  status?: string;
  candidateRecordId?: number;
}

export interface CreateSocialRequestPayload {
  type: SocialRequestType;
  title?: string;
  description?: string;
  rawText?: string;
  city?: string;
  radiusKm?: number;
  timeStart?: string;
  timeEnd?: string;
  interestTags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateSocialRequestPayload {
  status?: SocialRequestStatus;
  title?: string;
  description?: string;
  interestTags?: string[];
}

export const socialRequestsApi = {
  create: (data: CreateSocialRequestPayload) =>
    api.request<SocialRequestSummary>('/social-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listMine: () =>
    api.request<{ items: SocialRequestSummary[]; total: number }>(
      '/social-requests/my',
    ),

  get: (id: number | string) =>
    api.request<SocialRequestSummary>(`/social-requests/${id}`),

  update: (id: number | string, data: UpdateSocialRequestPayload) =>
    api.request<SocialRequestSummary>(`/social-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancel: (id: number | string) =>
    api.request<SocialRequestSummary>(`/social-requests/${id}/cancel`, {
      method: 'POST',
    }),

  rematch: (id: number | string) =>
    api.request<{ socialRequestId: number; candidates: CandidateView[] }>(
      `/social-requests/${id}/rematch`,
      { method: 'POST' },
    ),

  runMatch: (id: number | string, limit = 5) =>
    api.request<{ socialRequestId: number; candidates: CandidateView[] }>(
      `/social-requests/${id}/match`,
      { method: 'POST', body: JSON.stringify({ limit }) },
    ),

  candidates: (id: number | string) =>
    api.request<{ socialRequestId: number; candidates: CandidateView[] }>(
      `/social-requests/${id}/candidates`,
    ),

  markCandidateMessaged: (id: number | string, candidateId: number) =>
    api.request<{ id: number; status: string }>(
      `/social-requests/${id}/candidates/${candidateId}/mark-messaged`,
      { method: 'POST' },
    ),

  syncPublicIntent: (id: number | string) =>
    api.request<{ publicIntentId: string; synced: boolean }>(
      `/social-requests/${id}/sync-public-intent`,
      { method: 'POST' },
    ),

  aiDraft: (rawText: string) =>
    api.request<{
      draft: CreateSocialRequestPayload & {
        type: SocialRequestType;
        title: string;
        description: string;
        rawText: string;
        city: string;
        radiusKm: number;
        interestTags: string[];
      };
      card: {
        title: string;
        description: string;
        interestTags: string[];
        locationPreference: string;
        timePreference: string;
        socialGoal: string;
        personalityPreference: string[];
        riskNotes: string[];
        privacyNotes: string[];
      };
      suggestedTitle: string;
      profileUsed: {
        city: string;
        interestTags: string[];
        ageRange: string;
        nearbyArea: string;
        fitnessGoals: string[];
        availableTimes: string[];
      };
      llmEnabled: boolean;
      mode: 'ai' | 'fallback';
    }>('/social-requests/ai-draft', {
      method: 'POST',
      body: JSON.stringify({ rawText }),
    }),
};
