export type FitMeetAlphaAgentName =
  | 'FitMeet Main Agent'
  | 'Agent Brain'
  | 'Life Graph Agent'
  | 'Social Match Agent'
  | 'Meet Loop Agent';

export type FitMeetAlphaCardType =
  | 'profile_proposal'
  | 'candidate_card'
  | 'opener_approval'
  | 'activity_plan'
  | 'checkin_card'
  | 'review_card'
  | 'audit_update'
  | 'safety_boundary';

export interface FitMeetAlphaCardAction {
  id: string;
  label: string;
  action:
    | 'confirm_profile_update'
    | 'send_message'
    | 'connect_candidate'
    | 'save_candidate'
    | 'create_activity'
    | 'generate_opener'
    | 'see_more'
    | 'filter_school'
    | 'filter_gender_female'
    | 'dislike_candidate'
    | 'check_in'
    | 'submit_review'
    | 'refine_request';
  requiresConfirmation: boolean;
  payload?: Record<string, unknown>;
}

export interface FitMeetAlphaCard {
  id: string;
  type: FitMeetAlphaCardType;
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
