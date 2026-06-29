import type {
  LoopSlotMeta,
  LoopSlotSource,
  LoopSlotValidation,
  LoopSlots,
  LoopStage,
} from '../loop-agent/loop-agent.types';

export type WorkoutLoopStage = Extract<
  LoopStage,
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
  | 'done'
>;

export type WorkoutSlotMetaKey =
  | 'activityType'
  | 'timePreference'
  | 'locationText'
  | 'city'
  | 'district'
  | 'poiName'
  | 'radiusKm'
  | 'intensity'
  | 'candidatePreference';

export type WorkoutSlots = LoopSlots & {
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
      | 'amap'
      | 'cache'
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
    candidates?: Array<{
      name: string;
      address: string;
      province?: string;
      city?: string;
      district?: string;
      adcode?: string;
      lat?: number;
      lng?: number;
      level: 'poi' | 'district' | 'street' | 'address' | 'city' | 'unknown';
      source: 'amap' | 'baidu' | 'tencent' | 'llm' | 'cache' | 'dictionary';
      confidence: number;
    }>;
  };
  slotMeta?: Partial<
    Record<WorkoutSlotMetaKey, LoopSlotMeta & { source: LoopSlotSource }>
  >;
  radiusKm?: number;
  intensity?: string;
  candidatePreference?: string;
};

export type WorkoutRequiredSlot =
  | 'activityType'
  | 'timePreference'
  | 'locationText'
  | 'city';

export type WorkoutSlotValidation = LoopSlotValidation<WorkoutRequiredSlot>;
