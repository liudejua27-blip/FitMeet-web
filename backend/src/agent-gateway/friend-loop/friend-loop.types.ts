import type {
  LoopSlotValidation,
  LoopSlots,
  LoopStage,
} from '../loop-agent/loop-agent.types';

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
  topicTags?: string[];
  scenePreference?: string;
  timePreference?: string;
  candidatePreference?: string;
  visibilityPreference?: 'private';
};

export type FriendRequiredSlot = 'friendGoal' | 'city';

export type FriendSlotValidation = LoopSlotValidation<FriendRequiredSlot>;
