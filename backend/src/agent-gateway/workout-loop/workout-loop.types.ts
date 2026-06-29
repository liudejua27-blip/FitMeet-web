export type WorkoutLoopStage =
  | 'intake'
  | 'draft_ready'
  | 'publish_confirming'
  | 'published'
  | 'matching'
  | 'candidates_ready';

export type WorkoutSlots = {
  activityType?: string;
  timePreference?: string;
  locationText?: string;
  city?: string;
  radiusKm?: number;
  intensity?: string;
  candidatePreference?: string;
  safetyBoundary?: string;
  visibilityPreference?: 'public' | 'private';
};

export type WorkoutSlotValidation = {
  valid: boolean;
  missing: Array<'activityType' | 'timePreference' | 'locationText'>;
};
