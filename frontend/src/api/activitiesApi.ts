import * as api from './client';

export type ActivityType =
  | 'running'
  | 'fitness'
  | 'dog_walking'
  | 'coffee_chat'
  | 'city_walk'
  | 'custom';

export type ActivityStatus =
  | 'draft'
  | 'pending_confirm'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type ProofPolicy = 'mutual_confirm' | 'mutual_or_proof' | 'mutual_and_proof';

export type ProofType =
  | 'checkin'
  | 'mutual_confirm'
  | 'scene_photo'
  | 'selfie_optional'
  | 'qr_code'
  | 'merchant_confirm';

export type PrivacyMode = 'hidden_face' | 'scene_only' | 'private';

export type ProofStatus = 'pending' | 'accepted' | 'rejected';

export interface IcebreakerTask {
  id: string;
  text: string;
  done?: boolean;
}

export interface ActivityTemplate {
  id: number;
  type: ActivityType;
  title: string;
  description: string;
  defaultDurationMinutes: number;
  defaultIcebreakers: string[];
  proofOptions: ProofType[];
  safetyTips: string[];
  safetyLevel: 'low' | 'medium' | 'high';
  defaultProofPolicy: ProofPolicy;
}

export interface SocialActivity {
  id: number;
  creatorId: number;
  participantIds: number[];
  socialRequestId: number | null;
  matchedCandidateId: number | null;
  type: ActivityType;
  title: string;
  description: string;
  locationName: string;
  city: string;
  startTime: string | null;
  endTime: string | null;
  status: ActivityStatus;
  icebreakerTasks: IcebreakerTask[];
  safetyTips: string[];
  proofRequired: boolean;
  proofPolicy: ProofPolicy;
  safetyLevel: 'low' | 'medium' | 'high';
  checkinByUserId: Record<string, string>;
  confirmByUserId: Record<string, string>;
}

export interface ActivityProof {
  id: number;
  activityId: number;
  userId: number;
  proofType: ProofType;
  photoUrl: string | null;
  note: string;
  locationApprox: string;
  status: ProofStatus;
  privacyMode: PrivacyMode;
  reviewedById: number | null;
  reviewedAt: string | null;
  reviewReason: string;
  createdAt: string;
}

export interface CreateActivityPayload {
  type: ActivityType;
  title?: string;
  description?: string;
  locationName?: string;
  city?: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  durationMinutes?: number;
  socialRequestId?: number;
  matchedCandidateId?: number;
  invitedUserId?: number;
  icebreakerTasks?: string[];
  proofRequired?: boolean;
  proofPolicy?: ProofPolicy;
}

export interface SubmitProofPayload {
  proofType: ProofType;
  photoUrl?: string;
  note?: string;
  locationApprox?: string;
  privacyMode?: PrivacyMode;
}

export const activitiesApi = {
  templates: () => api.request<ActivityTemplate[]>('/activity-templates'),

  get: (id: number | string) =>
    api.request<{ activity: SocialActivity; proofs: ActivityProof[] }>(
      `/activities/${id}`,
    ),

  icebreakers: (id: number | string) =>
    api.request<{ tasks: IcebreakerTask[] }>(`/activities/${id}/icebreakers`),

  create: (data: CreateActivityPayload) =>
    api.request<SocialActivity>('/activities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  join: (id: number | string) =>
    api.request<SocialActivity>(`/activities/${id}/join`, { method: 'POST' }),

  confirm: (id: number | string) =>
    api.request<SocialActivity>(`/activities/${id}/confirm`, {
      method: 'POST',
    }),

  checkin: (id: number | string, locationApprox?: string) =>
    api.request<SocialActivity>(`/activities/${id}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ locationApprox }),
    }),

  submitProof: (id: number | string, data: SubmitProofPayload) =>
    api.request<ActivityProof>(`/activities/${id}/proof`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  respondProof: (
    activityId: number | string,
    proofId: number | string,
    data: { accept: boolean; reason?: string },
  ) =>
    api.request<{
      proof: ActivityProof;
      activity: SocialActivity;
      autoCompleted: boolean;
    }>(`/activities/${activityId}/proofs/${proofId}/respond`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  complete: (id: number | string) =>
    api.request<SocialActivity>(`/activities/${id}/complete`, {
      method: 'POST',
    }),

  cancel: (id: number | string) =>
    api.request<SocialActivity>(`/activities/${id}/cancel`, {
      method: 'POST',
    }),
};
