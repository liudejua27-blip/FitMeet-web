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
