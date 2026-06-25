import * as api from './client';

/** User social profile used by personal info, Agent matching, and Discover eligibility. */
export interface UserSocialProfile {
  userId: number;
  gender: string;
  nickname: string;
  ageRange: string;
  city: string;
  zodiac: string;
  mbti: string;
  traits: string[];
  socialStyle: string;
  communicationStyle: string;
  nearbyArea: string;
  fitnessGoals: string[];
  interestTags: string[];
  lifestyleTags: string[];
  socialScenes: string[];
  wantToMeet: string[];
  preferredTraits: string[];
  avoidTraits: string[];
  relationshipGoals: string[];
  openness: string;
  availableTimes: string[];
  weekdayAvailability: string;
  weekendAvailability: string;
  socialPreference: string;
  rejectRules: string;
  privacyBoundary: string;
  profileDiscoverable: boolean;
  agentCanRecommendMe: boolean;
  agentCanStartChatAfterApproval: boolean;
  aiSummary: string;
  aiProfileCard: Record<string, unknown>;
  matchSignals: SocialProfileMatchSignals;
  sensitiveTagDecisions?: Record<
    string,
    { status: string; category?: string; decidedAt?: string }
  >;
  createdAt?: string;
  updatedAt?: string;
}

export interface SocialProfileMatchSignals {
  publicTags: string[];
  privatePreferenceTags: string[];
  sensitivePrivateTags: string[];
  matchKeywords: string[];
  confidence: number;
  source: string;
}

export interface SocialProfileBuilderCard {
  basic: {
    nickname: string;
    city: string;
    ageRange: string;
    gender: string;
    zodiac: string;
  };
  personality: {
    mbti: string;
    traits: string[];
    socialStyle: string;
    communicationStyle: string;
  };
  interests: {
    sports: string[];
    lifestyle: string[];
    socialScenes: string[];
  };
  preferences: {
    wantToMeet: string[];
    preferredTraits: string[];
    avoid: string[];
  };
  relationshipIntent: {
    goals: string[];
    openness: string;
  };
  availability: {
    weekdays: string;
    weekends: string;
  };
  visibility: {
    profileDiscoverable: boolean;
    agentCanRecommendMe: boolean;
    agentCanStartChatAfterApproval: boolean;
  };
  matchSignals: SocialProfileMatchSignals;
  summary: string;
}

export interface ProfileUpdateProposal {
  proposalId: number;
  baseProfileVersion: number;
  proposedFields: Record<string, unknown>;
  draft: SocialProfileBuilderCard;
  status: 'pending' | 'applied' | 'rejected' | 'expired';
  expiresAt: string;
}

export interface SocialProfileQuestion {
  key: string;
  question: string;
  type?: string;
  domain?: string;
  privacyTier?: 'public' | 'private_match' | 'sensitive_review';
  matchRole?: 'profile_field' | 'match_preference' | 'safety_boundary';
}

export interface SocialProfileCompletion {
  completedFields: string[];
  missingFields: string[];
  percent: number;
  readinessLevel?: 'empty' | 'basic' | 'match_ready' | 'agent_ready';
  canEnterMatchPool?: boolean;
  authorizationRequired?: boolean;
  authorization?: {
    matchPoolEnabled: boolean;
    profileDiscoverable: boolean;
    agentCanRecommendMe: boolean;
    agentCanStartChatAfterApproval: boolean;
    hideSensitiveTags: boolean;
    requiresOwnerConfirmationToEnable: boolean;
    consentSource: string;
  };
  sections?: Array<{
    key: string;
    label: string;
    completedFields: string[];
    missingFields: string[];
    percent: number;
    weight: number;
  }>;
  nextActions?: string[];
}

export interface SocialProfilePrivacyState {
  profileDiscoverable: boolean;
  agentCanRecommendMe: boolean;
  allowAgentRecommend?: boolean;
  agentCanStartChatAfterApproval: boolean;
  hideSensitiveTags: boolean;
  matchPoolEnabled: boolean;
  completion?: SocialProfileCompletion;
  authorization?: SocialProfileCompletion['authorization'];
  sensitiveTagSummary: Record<'pending' | 'confirmed' | 'rejected' | 'hidden', number>;
}

export interface PendingSensitiveTag {
  tag: string;
  category: string;
}

export type UpdateUserSocialProfilePayload = Partial<
  Omit<UserSocialProfile, 'userId' | 'createdAt' | 'updatedAt'>
>;

export const socialProfileApi = {
  get: () => api.request<UserSocialProfile>('/users/me/social-profile'),
  save: (data: UpdateUserSocialProfilePayload) =>
    api.request<UserSocialProfile>('/users/me/social-profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  questions: () =>
    api.request<{
      questions: SocialProfileQuestion[];
      completion: SocialProfileCompletion;
      pendingProposal?: ProfileUpdateProposal | null;
    }>('/users/me/social-profile/questions'),
  aiDraft: (data: {
    answers?: Array<{ key?: string; question?: string; answer?: string }>;
    rawText?: string;
    source?: string;
  }) =>
    api.request<{
      mode: 'ai' | 'fallback';
      draft: SocialProfileBuilderCard;
      proposal: ProfileUpdateProposal;
      profileUsed: UserSocialProfile;
      completion: SocialProfileCompletion;
    }>('/users/me/social-profile/ai-draft', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  aiSave: (data: {
    profile: SocialProfileBuilderCard;
    proposalId?: number;
    expectedProfileVersion?: number;
    enableMatching?: boolean;
    ownerConfirmed?: boolean;
    matchingConsent?: boolean;
    profileVisibilityConsent?: boolean;
    sensitiveTagsConfirmed?: boolean;
    sensitiveTagDecisions?: Record<string, 'confirmed' | 'rejected' | 'hidden'>;
  }) =>
    api.request<{
      profile: UserSocialProfile;
      aiDelegateProfile: unknown | null;
      matchingEnabled: boolean;
      sensitiveTagSummary?: Record<string, number>;
      completion: SocialProfileCompletion;
      proposal?: ProfileUpdateProposal | null;
    }>('/users/me/social-profile/ai-save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  privacy: () => api.request<SocialProfilePrivacyState>('/users/me/social-profile/privacy'),
  updatePrivacy: (data: Partial<Pick<SocialProfilePrivacyState, 'profileDiscoverable' | 'agentCanRecommendMe' | 'agentCanStartChatAfterApproval' | 'hideSensitiveTags'>> & {
    ownerConfirmed?: boolean;
    matchingConsent?: boolean;
    profileVisibilityConsent?: boolean;
  }) =>
    api.request<SocialProfilePrivacyState>('/users/me/social-profile/privacy', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  pendingSensitiveTags: () =>
    api.request<{ pending: PendingSensitiveTag[]; total: number }>(
      '/users/me/social-profile/sensitive-tags/pending',
    ),
  confirmSensitiveTag: (tag: string) =>
    api.request<{ ok: boolean; tag: string; status: string }>(
      '/users/me/social-profile/sensitive-tags/confirm',
      {
        method: 'POST',
        body: JSON.stringify({ tag }),
      },
    ),
  rejectSensitiveTag: (tag: string) =>
    api.request<{ ok: boolean; tag: string; status: string }>(
      '/users/me/social-profile/sensitive-tags/reject',
      {
        method: 'POST',
        body: JSON.stringify({ tag }),
      },
    ),
};
