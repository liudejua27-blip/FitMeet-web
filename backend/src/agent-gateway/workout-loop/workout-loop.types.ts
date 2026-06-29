export type WorkoutLoopStage =
  | 'intake'
  | 'clarifying'
  | 'draft_ready'
  | 'publish_confirming'
  | 'published'
  | 'matching_queued'
  | 'candidates_ready'
  | 'no_candidates'
  | 'no_candidates_final'
  | 'opener_ready'
  | 'message_confirming'
  | 'messages_handoff'
  | 'done';

export type WorkoutSlots = {
  activityType?: string;
  timePreference?: string;
  locationText?: string;
  city?: string;
  district?: string;
  poiName?: string;
  lat?: number;
  lng?: number;
  geoResolution?: {
    rawText: string;
    locationText?: string;
    city?: string;
    district?: string;
    poiName?: string;
    province?: string;
    lat?: number;
    lng?: number;
    source:
      | 'explicit_city'
      | 'poi_dictionary'
      | 'profile_city'
      | 'client_geo'
      | 'llm_inferred'
      | 'user_confirmed'
      | 'unknown';
    confidence: number;
    needsConfirmation: boolean;
    confirmationQuestion?: string;
  };
  radiusKm?: number;
  intensity?: string;
  candidatePreference?: string;
  safetyBoundary?: string;
  visibilityPreference?: 'public' | 'private';
};

export type WorkoutRequiredSlot =
  | 'activityType'
  | 'timePreference'
  | 'locationText'
  | 'city';

export type WorkoutSlotValidation = {
  valid: boolean;
  missing: WorkoutRequiredSlot[];
};
