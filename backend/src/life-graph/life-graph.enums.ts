export enum LifeGraphFieldCategory {
  Identity = 'identity',
  SocialIntent = 'social_intent',
  Lifestyle = 'lifestyle',
  FitnessActivity = 'fitness_activity',
  TrustSafety = 'trust_safety',
  InteractionMemory = 'interaction_memory',
  PrivacyBoundary = 'privacy_boundary',
}

export enum LifeGraphFieldSource {
  Manual = 'manual',
  AiInferred = 'ai_inferred',
  ActivityGenerated = 'activity_generated',
  DeviceAuthorized = 'device_authorized',
  SystemGenerated = 'system_generated',
  ImportedFromSocialProfile = 'imported_from_social_profile',
}

export enum LifeGraphSignalType {
  Core = 'core_signal',
  Weak = 'weak_signal',
  Entertainment = 'entertainment_signal',
  Sensitive = 'sensitive_signal',
}

export enum LifeGraphAuditAction {
  Created = 'created',
  Updated = 'updated',
  Confirmed = 'confirmed',
  Revoked = 'revoked',
  Rejected = 'rejected',
  Imported = 'imported',
  AiProposed = 'ai_proposed',
  ConflictDetected = 'conflict_detected',
}

export enum LifeGraphProposalStatus {
  Proposed = 'proposed',
  PartiallyConfirmed = 'partially_confirmed',
  Confirmed = 'confirmed',
  Rejected = 'rejected',
  Revoked = 'revoked',
}

export enum LifeGraphBehaviorEventType {
  UserMessage = 'user_message',
  CandidateViewed = 'candidate_viewed',
  CandidateLiked = 'candidate_liked',
  CandidateDisliked = 'candidate_disliked',
  OpenerGenerated = 'opener_generated',
  InviteConfirmed = 'invite_confirmed',
  ActivityCreated = 'activity_created',
  ActivityCompleted = 'activity_completed',
  ActivityCancelled = 'activity_cancelled',
  ActivityNoShow = 'activity_no_show',
  ActivityReviewedPositive = 'activity_reviewed_positive',
  ActivityReviewedNegative = 'activity_reviewed_negative',
  NightMeetDeclined = 'night_meet_declined',
  PrivatePlaceDeclined = 'private_place_declined',
  PreciseLocationDeclined = 'precise_location_declined',
}

export enum LifeGraphSignalKey {
  RecentActivity = 'recent_activity',
  SportsAffinity = 'sports_affinity',
  SocialOpenness = 'social_openness',
  LowPressurePreference = 'low_pressure_preference',
  SafetyBoundaryClarity = 'safety_boundary_clarity',
  Reliability = 'reliability',
  CancellationRisk = 'cancellation_risk',
  NightBoundary = 'night_boundary',
  SameSchoolPreference = 'same_school_preference',
  SameCityPreference = 'same_city_preference',
  CommonInterestPreference = 'common_interest_preference',
}

export enum LifeGraphUpdateAuditStatus {
  Applied = 'applied',
  Revoked = 'revoked',
  Corrected = 'corrected',
}

export enum LifeGraphCorrectionType {
  NotTrue = 'not_true',
  PreferMore = 'prefer_more',
  PreferLess = 'prefer_less',
  ManualNote = 'manual_note',
}
