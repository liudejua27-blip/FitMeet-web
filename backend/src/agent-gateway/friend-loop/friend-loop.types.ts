export type FriendLoopStage =
  | 'intake'
  | 'draft_ready'
  | 'matching_queued'
  | 'candidates_ready'
  | 'opener_ready'
  | 'message_confirming'
  | 'messages_handoff'
  | 'cancelled'
  | 'done';

export type FriendSlots = {
  friendGoal?: string;
  city?: string;
  topicTags?: string[];
  scenePreference?: string;
  timePreference?: string;
  candidatePreference?: string;
  safetyBoundary?: string;
  visibilityPreference?: 'private';
};

export type FriendRequiredSlot = 'friendGoal' | 'city';

export type FriendSlotValidation = {
  valid: boolean;
  missing: FriendRequiredSlot[];
};
