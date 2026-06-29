import type {
  LoopSlotValidation,
  LoopSlots,
  LoopStage,
} from '../loop-agent/loop-agent.types';
import type { GeoResolution } from '../geo/geo-resolver.types';

export type FriendLoopStage = Extract<
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

export type FriendSlots = LoopSlots & {
  friendGoal?: string;
  city?: string;
  locationText?: string;
  district?: string;
  poiName?: string;
  lat?: number;
  lng?: number;
  geoResolution?: GeoResolution;
  topicTags?: string[];
  genderPreference?: string;
  bodyPreference?: string;
  appearancePreference?: string;
  scenePreference?: string;
  timePreference?: string;
  candidatePreference?: string;
  visibilityPreference?: 'private';
};

export type FriendRequiredSlot =
  | 'friendGoal'
  | 'locationText'
  | 'topicTags'
  | 'genderPreference'
  | 'bodyPreference'
  | 'appearancePreference';

export type FriendSlotValidation = LoopSlotValidation<FriendRequiredSlot>;
