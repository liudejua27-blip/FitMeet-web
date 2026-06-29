export type FitMeetAlphaAgentName =
  | 'FitMeet Main Agent'
  | 'Agent Brain'
  | 'Life Graph Agent'
  | 'Match Agent';

export type FitMeetAlphaCardType =
  | 'profile_completion'
  | 'profile_proposal'
  | 'candidate_card'
  | 'opener_approval'
  | 'activity_plan'
  | 'activity_status'
  | 'checkin_card'
  | 'meet_loop_timeline'
  | 'review_card'
  | 'audit_update'
  | 'safety_boundary'
  | 'candidate_empty_state'
  | 'public_intent_application_card'
  | 'generic_card'
  | 'loop_choice'
  | 'clarification_binary'
  | 'clarification_geo_candidates'
  | 'workout_intake'
  | 'workout_draft'
  | 'friend_intake'
  | 'friend_draft'
  | 'travel_intake'
  | 'travel_companion_draft';

export type FitMeetAgentLoopStage =
  | 'social_search'
  | 'candidate_recommendation'
  | 'candidate_selected'
  | 'opener_draft_created'
  | 'opener_confirmed'
  | 'message_sent'
  | 'activity_draft_created'
  | 'activity_confirmed'
  | 'activity_checked_in'
  | 'activity_completed'
  | 'review_submitted'
  | 'life_graph_updated'
  | 'trust_score_updated';

export type FitMeetAgentSchemaAction =
  | 'candidate.like'
  | 'candidate.skip'
  | 'candidate.more_like_this'
  | 'candidate.view_detail'
  | 'candidate.generate_opener'
  | 'candidate.connect'
  | 'matching.relax_distance'
  | 'matching.relax_time'
  | 'matching.relax_tags'
  | 'opener.confirm_send'
  | 'opener.regenerate'
  | 'opener.reject'
  | 'publish_to_discover'
  | 'social_intent.decline_publish'
  | 'social_intent.dismiss'
  | 'social_intent.retry_publish'
  | 'activity.confirm_create'
  | 'activity.skip_publish'
  | 'activity.modify_time'
  | 'activity.modify_location'
  | 'activity.check_in'
  | 'activity.complete'
  | 'activity.upload_proof'
  | 'activity.view_detail'
  | 'review.submit'
  | 'life_graph.accept_update'
  | 'life_graph.reject_update'
  | 'meet_loop.resume'
  | 'meet_loop.reschedule'
  | 'slot_completion.use_default_safety'
  | 'slot_completion.custom_safety'
  | 'slot_completion.cancel'
  | 'loop_choice.workout'
  | 'loop_choice.friend'
  | 'loop_choice.travel'
  | 'clarification.yes'
  | 'clarification.no'
  | 'clarification.select'
  | 'workout_intake.submit'
  | 'workout_intake.use_defaults'
  | 'workout_intake.cancel'
  | 'workout_draft.publish'
  | 'workout_draft.private_match'
  | 'workout_draft.edit'
  | 'workout_draft.cancel'
  | 'friend_intake.submit'
  | 'friend_intake.use_defaults'
  | 'friend_intake.cancel'
  | 'friend_draft.publish'
  | 'friend_draft.private_match'
  | 'friend_draft.edit'
  | 'friend_draft.cancel'
  | 'travel_intake.submit'
  | 'travel_intake.use_defaults'
  | 'travel_intake.cancel'
  | 'travel_draft.publish'
  | 'travel_draft.private_match'
  | 'travel_draft.edit'
  | 'travel_draft.cancel'
  | 'public_intent_application.accept'
  | 'public_intent_application.reject'
  | 'public_intent_application.view_profile'
  | 'public_intent_application.open_conversation';

export interface FitMeetAlphaCardAction {
  id: string;
  label: string;
  action:
    | FitMeetAgentSchemaAction
    | 'confirm_profile_update'
    | 'send_message'
    | 'connect_candidate'
    | 'save_candidate'
    | 'publish_social_request'
    | 'publish_to_discover'
    | 'create_activity'
    | 'generate_opener'
    | 'reject_opener'
    | 'view_activity'
    | 'upload_proof'
    | 'see_more'
    | 'filter_school'
    | 'filter_gender_female'
    | 'dislike_candidate'
    | 'check_in'
    | 'submit_review'
    | 'refine_request'
    | 'resume_meet_loop'
    | 'reschedule_meet_loop';
  schemaAction?: FitMeetAgentSchemaAction;
  loopStage?: FitMeetAgentLoopStage;
  requiresConfirmation: boolean;
  payload?: Record<string, unknown>;
}

export interface FitMeetAlphaCard {
  id: string;
  type: FitMeetAlphaCardType;
  schemaVersion?: 'fitmeet.tool-ui.v1';
  schemaType?:
    | 'social_match.candidate'
    | 'social_match.activity'
    | 'social_match.empty'
    | 'social_match.no_candidates'
    | 'social_match.privacy_guard'
    | 'social_match.rate_limited'
    | 'social_match.slot_completion'
    | 'profile.completion'
    | 'life_graph.diff'
    | 'meet_loop.timeline'
    | 'public_intent.application'
    | 'safety.approval'
    | 'loop.choice'
    | 'clarification.binary'
    | 'clarification.geo_candidates'
    | 'workout.intake'
    | 'workout.draft'
    | 'friend.intake'
    | 'friend.draft'
    | 'travel.intake'
    | 'travel.companion_draft'
    | 'generic.card';
  title: string;
  body?: string;
  status?: 'ready' | 'waiting_confirmation' | 'completed' | 'blocked';
  data: Record<string, unknown>;
  actions: FitMeetAlphaCardAction[];
}

export interface FitMeetAgentSafety {
  blocked: boolean;
  level: 'low' | 'medium' | 'high' | 'blocked';
  reasons: string[];
  boundaryNotes: string[];
  requiredConfirmations: string[];
}

export interface FitMeetAgentTrace {
  traceId: string;
  sdkEnabled: boolean;
  model: string;
  agentPath: FitMeetAlphaAgentName[];
  handoffs: Array<{
    from: FitMeetAlphaAgentName;
    to: FitMeetAlphaAgentName;
    reason: string;
  }>;
  guardrails: Array<{
    name: string;
    status: 'passed' | 'blocked' | 'skipped';
    reasons?: string[];
  }>;
  observations?: Array<{
    agent: FitMeetAlphaAgentName;
    intent?: string | null;
    readiness?: string | null;
    nextAction?: string | null;
    critique?: string | null;
  }>;
  subagentHandoffs?: Array<{
    agent: FitMeetAlphaAgentName;
    memoryScope?: string | null;
    input: Record<string, unknown>;
    toolCalls: Array<{
      toolName: string;
      input: Record<string, unknown>;
      status: 'planned' | 'observed' | 'skipped';
    }>;
    observation: Record<string, unknown>;
    critique: string;
    handoffOutput: Record<string, unknown>;
  }>;
}

export interface FitMeetAlphaTurnInput {
  ownerUserId: number;
  taskId?: number | null;
  message: string;
  permissionMode?: string | null;
  context?: Record<string, unknown>;
}

export interface FitMeetAlphaTurnDecision {
  traceId: string;
  safety: FitMeetAgentSafety;
  agentTrace: FitMeetAgentTrace;
  cards: FitMeetAlphaCard[];
  assistantMessage?: string;
  structuredIntent?: Record<string, unknown>;
}
