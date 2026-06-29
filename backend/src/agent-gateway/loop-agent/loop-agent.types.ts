export type LoopKind = 'workout' | 'friend' | 'travel';

export type LoopStage =
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
  | 'waiting_reply'
  | 'cancelled'
  | 'dismissed'
  | 'done';

export type LoopVisibilityPreference = 'public' | 'private';

export type LoopSlotSource =
  | 'user'
  | 'user_confirmed'
  | 'rule'
  | 'llm'
  | 'geo'
  | 'memory'
  | 'default';

export type LoopSlotMeta = {
  source: LoopSlotSource;
  confidence: number;
};

export type LoopSlots = {
  safetyBoundary?: string;
  visibilityPreference?: LoopVisibilityPreference;
};

export type LoopSlotValidation<RequiredSlot extends string> = {
  valid: boolean;
  missing: RequiredSlot[];
};

export type LoopAgentDecisionAction =
  | 'ASK_INTAKE'
  | 'ASK_CONFIRMATION'
  | 'ASK_LOCATION_CONFIRMATION'
  | 'CREATE_DRAFT'
  | 'CREATE_WORKOUT_DRAFT'
  | 'PUBLISH'
  | 'PRIVATE_MATCH'
  | 'QUEUE_MATCHING'
  | 'SHOW_CANDIDATES'
  | 'GENERATE_OPENER'
  | 'ASK_SEND_CONFIRMATION'
  | 'HANDOFF_LEGACY';

export type LoopAgentDecisionBase<
  Kind extends LoopKind,
  Action extends LoopAgentDecisionAction,
  Slots extends LoopSlots,
  RequiredSlot extends string,
> = {
  loopKind?: Kind;
  action: Action;
  reason: string;
  slots: Slots;
  missing: RequiredSlot[];
};
