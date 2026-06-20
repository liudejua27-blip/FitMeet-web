import type {
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
  FitMeetAgentCardExecutableAction,
  SocialAgentPermissionMode,
  UserFacingAgentPendingConfirmation,
  UserFacingAgentRecoveryNotice,
  UserFacingAgentResponse,
  UserFacingAgentSafeStatus,
  UserFacingAgentStreamEvent,
} from '../../../api/socialAgentApi';

export type AgentPermissionMode = SocialAgentPermissionMode;

export type AgentLifecycle =
  | 'received'
  | 'idle'
  | 'input_focused'
  | 'user_submitted'
  | 'analyzing_intent'
  | 'reading_life_graph'
  | 'searching_candidates'
  | 'ranking_matches'
  | 'checking_safety'
  | 'drafting_opener'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed';

export interface AgentRunRequest {
  goal: string;
  permissionMode: AgentPermissionMode;
  conversationIntent?: 'conversation' | 'social' | 'approval';
  taskId?: number | null;
  city?: string | null;
  idempotencyKey: string;
  clientContext?: {
    timezone?: string;
    locale?: string;
    source: 'web' | 'ios';
    threadId?: string | null;
    conversationIntent?: 'conversation' | 'social' | 'approval';
  };
}

export type AgentStreamEvent =
  | (UserFacingAgentStreamEvent & {
      lifecycle?: AgentLifecycle;
      metadata?: Record<string, unknown>;
    })
  | {
      type: 'lifecycle';
      lifecycle: AgentLifecycle;
      message?: string;
      metadata?: Record<string, unknown>;
    };

export interface AgentRunResponse {
  response: UserFacingAgentResponse;
  lifecycle: AgentLifecycle;
  taskId?: number | null;
  taskStatus?: string | null;
}

export interface AgentActionRequest {
  action: FitMeetAgentCardExecutableAction;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
}

export type AgentErrorCode =
  | 'MISSING_INFO'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'SAFETY_BLOCKED'
  | 'CONFIRMATION_REQUIRED'
  | 'TASK_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'ABORTED';

export interface AgentError {
  code: AgentErrorCode;
  title: string;
  message: string;
  retryable: boolean;
  lifecycle: AgentLifecycle;
  statusCode?: number;
  recoveryNotice?: UserFacingAgentRecoveryNotice;
}

export type AgentCandidateCard = Extract<FitMeetAlphaCard, { type: 'candidate_card' }>;
export type AgentOpenerDraft = FitMeetAlphaCard;
export type AgentConfirmation = UserFacingAgentPendingConfirmation;
export type AgentCardAction = FitMeetAlphaCardAction;
export type AgentSafeStatus = UserFacingAgentSafeStatus;
export type AgentUiResponse = UserFacingAgentResponse;
