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
  | 'candidate_empty_state';

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
  | 'slot_completion.cancel';

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
    | 'social_match.slot_completion'
    | 'profile.completion'
    | 'life_graph.diff'
    | 'meet_loop.timeline'
    | 'safety.approval'
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
