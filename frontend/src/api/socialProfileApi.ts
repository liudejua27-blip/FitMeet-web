import * as api from './client';

/**
 * User social profile.
 *
 * This is the single source of truth for both the AI Profile page and the AI
 * social-card generator. The backend table is `user_social_profiles`, one row
 * per user. If the user has never saved a profile, GET still returns an empty
 * placeholder object so the UI does not need a separate "not created" state.
 */
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
  matchSignals: AiProfileMatchSignals;
  sensitiveTagDecisions?: Record<
    string,
    { status: string; category?: string; decidedAt?: string }
  >;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiProfileMatchSignals {
  publicTags: string[];
  privatePreferenceTags: string[];
  sensitivePrivateTags: string[];
  matchKeywords: string[];
  confidence: number;
  source: string;
}

export interface AiProfileBuilderCard {
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
  matchSignals: AiProfileMatchSignals;
  summary: string;
}

export interface AiProfileQuestion {
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
      questions: AiProfileQuestion[];
      completion: SocialProfileCompletion;
    }>('/users/me/social-profile/questions'),
  aiDraft: (data: {
    answers?: Array<{ key?: string; question?: string; answer?: string }>;
    rawText?: string;
    source?: string;
  }) =>
    api.request<{
      mode: 'ai' | 'fallback';
      draft: AiProfileBuilderCard;
      profileUsed: UserSocialProfile;
      completion: SocialProfileCompletion;
    }>('/users/me/social-profile/ai-draft', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  aiSave: (data: {
    profile: AiProfileBuilderCard;
    enableMatching?: boolean;
    sensitiveTagsConfirmed?: boolean;
    sensitiveTagDecisions?: Record<string, 'confirmed' | 'rejected' | 'hidden'>;
  }) =>
    api.request<{
      profile: UserSocialProfile;
      aiDelegateProfile: unknown | null;
      matchingEnabled: boolean;
      sensitiveTagSummary?: Record<string, number>;
      completion: SocialProfileCompletion;
    }>('/users/me/social-profile/ai-save', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
