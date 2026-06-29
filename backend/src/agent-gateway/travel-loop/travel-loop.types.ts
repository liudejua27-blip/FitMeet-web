import type {
  LoopSlotMeta,
  LoopSlotValidation,
  LoopSlots,
  LoopStage,
} from '../loop-agent/loop-agent.types';
import type { GeoResolution } from '../geo/geo-resolver.types';

export type TravelLoopStage = Extract<
  LoopStage,
  | 'intake'
  | 'draft_ready'
  | 'matching_queued'
  | 'candidates_ready'
  | 'opener_ready'
  | 'message_confirming'
  | 'messages_handoff'
  | 'cancelled'
  | 'done'
>;

export type TravelSlots = LoopSlots & {
  destination?: string;
  city?: string;
  district?: string;
  poiName?: string;
  lat?: number;
  lng?: number;
  geoResolution?: GeoResolution;
  departureTime?: string;
  duration?: string;
  budgetRange?: string;
  transportMode?: string;
  tags?: string[];
  genderPreference?: string;
  photoPreference?: string;
  accommodationPreference?: string;
  foodPreference?: string;
  candidatePreference?: string;
  slotMeta?: Partial<
    Record<
      | 'destination'
      | 'city'
      | 'district'
      | 'poiName'
      | 'departureTime'
      | 'duration'
      | 'budgetRange'
      | 'transportMode'
      | 'tags'
      | 'genderPreference'
      | 'photoPreference'
      | 'accommodationPreference'
      | 'foodPreference'
      | 'candidatePreference',
      LoopSlotMeta
    >
  >;
  visibilityPreference?: 'private';
};

export type TravelRequiredSlot =
  | 'destination'
  | 'departureTime'
  | 'budgetRange'
  | 'transportMode';

export type TravelSlotValidation = LoopSlotValidation<TravelRequiredSlot>;
