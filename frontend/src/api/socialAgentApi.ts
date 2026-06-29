import * as api from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';
import { sanitizeDisplayValue } from '../lib/displayText';

export type SocialAgentPermissionMode =
  | 'assist'
  | 'confirm'
  | 'manual_confirm'
  | 'limited_auto'
  | 'open'
  | 'lab';

export type UserFacingAgentLightStatus =
  | '正在思考'
  | '正在理解你的需求'
  | '正在整理回复'
  | '已整理回复'
  | '正在结合你的长期偏好'
  | '正在读取你的偏好'
  | '正在筛选合适的人'
  | '正在筛选公开可发现的人'
  | '正在排除时间不合适的人'
  | '正在整理合适机会'
  | '正在检查安全边界'
  | '正在生成开场白'
  | '正在等待你确认'
  | '正在创建约练计划'
  | '正在整理约练方案'
  | '正在整理资料更新'
  | '正在整理资料变化建议';

export interface UserFacingAgentSafeStatus {
  blocked: boolean;
  level: 'low' | 'medium' | 'high' | 'blocked';
  boundaryNotes: string[];
  requiredConfirmations: string[];
}

export interface UserFacingAgentPendingConfirmation {
  id: number | string | null;
  type: string;
  actionType: string;
  summary: string;
  riskLevel: string;
  payload?: Record<string, unknown>;
  expiresAt: string | null;
}

export type UserFacingAgentAssistantMessageSource =
  | 'llm'
  | 'fallback'
  | 'deterministic_route'
  | 'deterministic_action';

export interface UserFacingAgentRecoveryNotice {
  kind: 'failed' | 'timeout' | 'interrupted' | 'checkpoint';
  title: string;
  message: string;
  retryable: boolean;
  source: 'fallback_suppressed' | 'checkpoint_recovery' | 'stream_error';
}

export type UserFacingAgentPublicLoopStage =
  | 'profile_completion'
  | 'opportunity_card_generated'
  | 'publish_confirmation_required'
  | 'discover_visible'
  | 'matching_queued'
  | 'exploring_index'
  | 'ranking_candidates'
  | 'safety_checking'
  | 'no_candidates'
  | 'no_candidates_final'
  | 'candidates_ready'
  | 'candidates_recommended'
  | 'contact_confirmation_required'
  | 'messages_handoff'
  | 'dismissed';

export interface UserFacingAgentPublicLoop {
  stage: UserFacingAgentPublicLoopStage;
  publicIntentId: string | null;
  discoverHref: string | null;
  publicIntentHref: string | null;
  messagesHref: string | null;
  requiredConfirmation: boolean;
}

export type UserFacingAgentWorkflowState =
  | 'PROFILE_REQUIRED'
  | 'INTENT_DRAFT'
  | 'PUBLISH_CONFIRMATION_REQUIRED'
  | 'DISCOVER_VISIBLE'
  | 'MATCHING_QUEUED'
  | 'NO_CANDIDATES'
  | 'NO_CANDIDATES_FINAL'
  | 'CANDIDATES_READY'
  | 'OPENER_DRAFT_CREATED'
  | 'CONTACT_CONFIRMATION_REQUIRED'
  | 'MESSAGE_SENT'
  | 'WAITING_COUNTERPART_REPLY'
  | 'COUNTERPART_REPLIED'
  | 'APPLICATION_PENDING'
  | 'APPLICATION_ACCEPTED'
  | 'CONVERSATION_ACTIVE'
  | 'ACTIVITY_DRAFT_CREATED'
  | 'ACTIVITY_CONFIRMATION_REQUIRED'
  | 'ACTIVITY_CONFIRMED'
  | 'ACTIVITY_CHECKED_IN'
  | 'ACTIVITY_COMPLETED'
  | 'REVIEW_SUBMITTED'
  | 'LIFE_GRAPH_UPDATE_PROPOSED'
  | 'LIFE_GRAPH_UPDATED'
  | 'CLOSED'
  | 'DISMISSED'
  | 'RECOVERY'
  | 'IDLE';

export interface UserFacingAgentWorkflow {
  workflowId: string | null;
  state: UserFacingAgentWorkflowState;
  requiredAction: string | null;
  retryable: boolean;
  recoveryMessage: string | null;
}

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
  | 'candidate.feedback.good_fit'
  | 'candidate.feedback.bad_fit'
  | 'candidate.feedback.too_far'
  | 'candidate.feedback.time_mismatch'
  | 'candidate.feedback.style_mismatch'
  | 'candidate.more_like_this'
  | 'candidate.view_detail'
  | 'candidate.connect'
  | 'matching.relax_distance'
  | 'matching.relax_time'
  | 'matching.relax_tags'
  | 'candidate.generate_opener'
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
  | 'workout_intake.submit'
  | 'workout_intake.use_defaults'
  | 'workout_intake.cancel'
  | 'workout_draft.publish'
  | 'workout_draft.private_match'
  | 'workout_draft.edit'
  | 'workout_draft.cancel'
  | 'public_intent_application.accept'
  | 'public_intent_application.reject'
  | 'public_intent_application.view_profile'
  | 'public_intent_application.open_conversation';

export type FitMeetAgentCardExecutableAction = FitMeetAgentSchemaAction;
export type UserFacingAgentCheckpointAction = 'resume' | 'retry' | 'replay' | 'fork';

export interface UserFacingAgentCheckpointRecoveryAction {
  action: UserFacingAgentCheckpointAction;
  label?: string | null;
  method?: string | null;
  endpoint?: string | null;
  idempotencyKey?: string | null;
  requiresApprovalDecision?: boolean;
}

export interface UserFacingAgentCheckpointStepAction extends UserFacingAgentCheckpointRecoveryAction {
  stepId: string;
}

export interface UserFacingAgentResponse {
  taskId?: number | null;
  assistantMessage: string;
  assistantMessageSource?: UserFacingAgentAssistantMessageSource;
  recoveryNotice?: UserFacingAgentRecoveryNotice;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
  publicLoop?: UserFacingAgentPublicLoop;
  workflow?: UserFacingAgentWorkflow;
  permissionMode: SocialAgentPermissionMode;
  lifeGraphWritebackProposal?: Record<string, unknown>;
}

export interface SocialAgentRunNextResponse {
  taskId: number;
  executedSteps: number;
  succeededSteps: number;
  failedSteps: number;
  blockedSteps: number;
  status: string;
  handledReply: boolean;
  decision: Record<string, unknown> | null;
  cards?: FitMeetAlphaCard[];
}

export interface UserFacingAgentSessionSnapshot {
  hasSession: boolean;
  activeTaskId: number | null;
  task: {
    id?: number;
    goal?: string;
    permissionMode?: SocialAgentPermissionMode;
    status?: string;
    title?: string;
    updatedAt?: string;
    createdAt?: string;
  } | null;
  messages: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  result?: Record<string, unknown> | UserFacingAgentResponse | null;
  userFacingResult?: UserFacingAgentResponse | null;
  latestRun?: Record<string, unknown> | null;
  pendingApprovals?: Array<Record<string, unknown>>;
  restoredAt?: string;
}

export interface SocialAgentProfileGateStatus {
  passed: boolean;
  missing: Array<'city' | 'activity' | 'availability' | 'boundary' | 'publicAuthorization'>;
  assistantMessage: string;
  profileCompleteness: number | null;
  readinessLevel: string | null;
  canEnterMatchPool: boolean;
  nextActions: string[];
}

export interface FitMeetAgentThreadSummary {
  id: string;
  threadId?: number;
  taskId: number;
  title: string;
  preview?: string | null;
  status: string;
  goal: string;
  messageCount?: number;
  updatedAt: string;
  createdAt: string;
  branch?: FitMeetAgentThreadBranchSnapshot | null;
  custom?: Record<string, unknown>;
}

export interface FitMeetAgentThreadBranchSnapshot {
  activeBranchId?: string | null;
  branchSelections?: Record<string, number>;
  branchCount?: number;
  parentMessageId?: string | null;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface FitMeetAgentThreadDetail {
  thread: FitMeetAgentThreadSummary;
  session: UserFacingAgentSessionSnapshot;
}

export type SocialAgentReminderTopic = 'friendship' | 'fitness_partner' | 'activity' | 'life_graph';

export type SocialAgentReminderScene =
  | 'application_inbox'
  | 'counterpart_reply'
  | 'stalled_match'
  | 'activity_review'
  | 'new_match'
  | 'weekend_opportunities'
  | 'past_social_goal'
  | 'activity_follow_up'
  | 'life_graph_confirmation';

export interface SocialAgentReminderPreference {
  id: number;
  userId: number;
  enabled: boolean;
  topics: SocialAgentReminderTopic[];
  frequency: 'realtime' | 'daily' | 'weekly' | 'manual';
  quietStart: string;
  quietEnd: string;
  tone: 'gentle' | 'direct' | 'quiet';
  metadata: Record<string, unknown>;
  lastSuggestedAt: string | null;
  mutedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAgentReminder {
  id: number;
  userId: number;
  topic: SocialAgentReminderTopic;
  status: 'suggested' | 'opened' | 'dismissed' | 'acted';
  title: string;
  message: string;
  context: Record<string, unknown>;
  threadId: string | null;
  taskId: number | null;
  createdAt: string;
  updatedAt: string;
}

export type SocialAgentReminderPreferenceInput = Partial<
  Pick<
    SocialAgentReminderPreference,
    'enabled' | 'topics' | 'frequency' | 'quietStart' | 'quietEnd'
  >
> & {
  scenes?: SocialAgentReminderScene[];
  mutedUntil?: string | null;
};

export type UserFacingAgentProgressKind = 'analysis' | 'tool' | 'status';

export interface UserFacingAgentProgressEvent {
  type: 'progress';
  id: string;
  kind: UserFacingAgentProgressKind;
  title: string;
  detail?: string;
  state: 'running' | 'done' | 'failed' | 'waiting';
  metadata?: Record<string, unknown>;
  snapshot?: {
    schemaVersion: 'fitmeet.step-snapshot.v1';
    observation?: string[];
    critique?: string;
    result?: string;
  };
}

export type FitMeetAlphaCardType =
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
  | 'profile_completion'
  | 'slot_completion'
  | 'candidate_empty_state'
  | 'public_intent_application_card'
  | 'generic_card'
  | 'loop_choice'
  | 'clarification_binary'
  | 'workout_intake'
  | 'workout_draft'
  | 'friend_intake'
  | 'travel_intake'
  | 'travel_companion_draft';

export interface FitMeetAlphaCardAction {
  id: string;
  label: string;
  action:
    | FitMeetAgentSchemaAction
    | 'confirm_profile_update'
    | 'send_message'
    | 'connect_candidate'
    | 'save_candidate'
    | 'create_activity'
    | 'generate_opener'
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
    | 'workout.intake'
    | 'workout.draft'
    | 'friend.intake'
    | 'travel.intake'
    | 'travel.companion_draft'
    | 'generic.card';
  title: string;
  body?: string;
  status?: 'ready' | 'waiting_confirmation' | 'completed' | 'blocked';
  data: Record<string, unknown>;
  actions: FitMeetAlphaCardAction[];
}

export type UserFacingAgentStreamEvent =
  | SocialAgentEventV2
  | {
      type: 'status';
      lifecycle?: string;
      lightStatus: UserFacingAgentLightStatus;
      taskId?: number;
      threadId?: string | number | null;
    }
  | (UserFacingAgentProgressEvent & { lifecycle?: string })
  | {
      type: 'assistant_delta';
      lifecycle?: string;
      runId?: string;
      taskId?: number | null;
      threadId?: string | number | null;
      messageId?: string;
      delta: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'assistant_done';
      lifecycle?: string;
      runId?: string;
      taskId?: number | null;
      threadId?: string | number | null;
      messageId?: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'agent_loop_step';
      lifecycle?: string;
      stepId?: string;
      phase: string;
      agentName?: string | null;
      toolName?: string | null;
      status?: string | null;
      title: string;
      detail?: string;
    }
  | {
      type: 'tool_call';
      lifecycle?: string;
      stepId?: string;
      agentName?: string | null;
      toolName: string;
      title: string;
      detail?: string;
    }
  | {
      type: 'tool_result';
      lifecycle?: string;
      stepId?: string;
      agentName?: string | null;
      toolName: string;
      title: string;
      detail?: string;
      status?: string | null;
    }
  | {
      type: 'approval_required';
      lifecycle?: string;
      approvalId: number | string | null;
      actionType: string;
      summary: string;
      riskLevel: string;
    }
  | { type: 'result'; lifecycle?: string; result: UserFacingAgentResponse }
  | {
      type: 'error';
      lifecycle?: string;
      code?: string;
      message: string;
      retryable?: boolean;
      recoveryNotice?: UserFacingAgentRecoveryNotice;
    };

export type SocialAgentEventV2Type =
  | 'run.started'
  | 'visible_process.delta'
  | 'assistant.delta'
  | 'tool.started'
  | 'tool.progress'
  | 'tool.done'
  | 'slot.filled'
  | 'slot.completed'
  | 'memory.saved'
  | 'opportunity_card.created'
  | 'candidate_search.started'
  | 'candidate_search.done'
  | 'safety_check.done'
  | 'approval.required'
  | 'approval.resolved'
  | 'run.completed'
  | 'run.failed';

export type SocialAgentEventV2Stage =
  | 'detect_social_intent'
  | 'hydrate_context'
  | 'profile_gate'
  | 'slot_filling'
  | 'create_opportunity_card'
  | 'publish_to_discover'
  | 'search_candidates'
  | 'safety_filter'
  | 'rank_candidates'
  | 'generate_opener'
  | 'approval'
  | 'send_invite'
  | 'life_graph_writeback';

export type SocialAgentEventV2 = {
  type: SocialAgentEventV2Type;
  eventId: string;
  seq: number;
  createdAt: string;
  userId: string;
  threadId: string;
  taskId: number | null;
  runId: string;
  messageId?: string;
  stage: SocialAgentEventV2Stage;
  visibility: 'user_visible' | 'debug_only' | 'internal';
  display?: {
    title: string;
    detail?: string;
    state: 'running' | 'done' | 'waiting' | 'failed';
  };
  payload?: Record<string, unknown>;
};

export type SocialCodexTraceEvalResult = {
  pass: boolean;
  issues: Array<{
    code: string;
    message: string;
    eventId?: string;
  }>;
  regressionChecks?: Array<{
    id:
      | 'visible_process_trace'
      | 'thread_task_run_binding'
      | 'memory_slot_state_machine'
      | 'approval_lifecycle'
      | 'social_sandbox'
      | 'replay_terminal';
    label: string;
    pass: boolean;
    message: string;
  }>;
  replayCase: {
    runId: string | null;
    threadId: string | null;
    taskId: number | null;
    eventCount: number;
    stages: string[];
    approvalRequired: boolean;
    terminalType: 'run.completed' | 'run.failed' | null;
  };
};

export type SocialCodexRunSummary = {
  state: 'running' | 'waiting' | 'completed' | 'failed';
  title: string;
  detail: string | null;
  displayMode?: 'covering_status';
  updateModel?: 'latest_state';
  defaultVisibleCount?: 1;
  historyVisibility?: 'collapsed';
  currentStage: SocialAgentEventV2Stage | null;
  currentEventId: string | null;
  currentSeq: number | null;
  pendingApproval: boolean;
  candidateCount: number | null;
  activityCount: number | null;
  hasOpportunityCard: boolean;
  savedMemory: boolean;
  visibleStepCount: number;
  expandable: boolean;
};

export type SocialCodexReplayPackage = {
  taskId: number;
  threadId: string | null;
  runId: string | null;
  eventCount: number;
  returnedCount: number;
  lastSeq: number | null;
  lastEventId: string | null;
  terminalType: 'run.completed' | 'run.failed' | null;
  pendingApproval: boolean;
  summary?: SocialCodexRunSummary;
  events: SocialAgentEventV2[];
  eval?: SocialCodexTraceEvalResult;
};

type RunChatInput = {
  goal: string;
  permissionMode: SocialAgentPermissionMode;
  conversationIntent?: 'conversation' | 'social' | 'approval';
  taskId?: number | null;
  city?: string | null;
  idempotencyKey?: string;
  clientContext?: {
    timezone?: string;
    locale?: string;
    source: 'web' | 'ios';
    threadId?: string | null;
    conversationIntent?: 'conversation' | 'social' | 'approval';
    checkpointId?: number | null;
    parentCheckpointId?: number | null;
    checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    decision?: 'approved' | 'rejected' | null;
  };
};

type RouteMessageInput = {
  message: string;
  conversationIntent?: 'conversation' | 'social' | 'approval';
  taskId?: number | null;
  hasCandidates?: boolean;
  idempotencyKey?: string;
  clientContext?: {
    timezone?: string;
    locale?: string;
    source: 'web' | 'ios';
    threadId?: string | null;
    conversationIntent?: 'conversation' | 'social' | 'approval';
  };
};

type AgentCardActionInput = {
  taskId: number;
  action: FitMeetAgentCardExecutableAction;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

type MessageFeedbackInput = {
  value: 'positive' | 'negative';
  reason?: string | null;
  taskId?: number | null;
  runId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

export type SocialAgentUserInterestEventType =
  | 'view_profile'
  | 'save_candidate'
  | 'skip_candidate'
  | 'more_like_this'
  | 'generate_opener'
  | 'send_invite'
  | 'invite_accepted'
  | 'connect_candidate'
  | 'discover_click'
  | 'activity_complete'
  | 'review_positive'
  | 'review_negative'
  | 'chat_topic';

export type SocialAgentUserInterestEventInput = {
  eventType: SocialAgentUserInterestEventType;
  taskId?: number | null;
  targetUserId?: number | null;
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  activityId?: number | null;
  weight?: number | null;
  activityTags?: string[] | null;
  candidatePreferenceTags?: string[] | null;
  city?: string | null;
  locationText?: string | null;
  timeWindow?: string | null;
  source?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
};

type CheckpointStreamInput = {
  checkpointId: number | string;
  stepId?: string | null;
  action: 'resume' | 'retry' | 'replay' | 'fork';
  decision?: 'approved' | 'rejected' | null;
};

export const socialAgentApi = {
  handleMessage: (data: RouteMessageInput) => {
    const taskId = data.taskId ?? null;
    const path = taskId
      ? fitMeetCoreEndpoints.socialAgentChat.taskMessages(taskId)
      : fitMeetCoreEndpoints.socialAgentChat.messages;
    return api
      .requestProtected<UserFacingAgentResponse>(path, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse);
  },

  handleMessageStream: (
    data: RouteMessageInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) => {
    const taskId = data.taskId ?? null;
    const path = taskId
      ? fitMeetCoreEndpoints.socialAgentChat.taskMessagesStream(taskId)
      : fitMeetCoreEndpoints.socialAgentChat.messagesStream;
    return runUserFacingAgentStreamAt(path, data, onEvent, signal);
  },

  routeMessage: (data: RouteMessageInput) =>
    api
      .requestProtected<UserFacingAgentResponse>(
        fitMeetCoreEndpoints.socialAgentChat.routeMessage,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      )
      .then(sanitizeSocialAgentResponse),

  routeMessageStream: (
    data: RouteMessageInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) =>
    runUserFacingAgentStreamAt(
      fitMeetCoreEndpoints.socialAgentChat.routeMessageStream,
      data,
      onEvent,
      signal,
    ),

  performAction: (data: AgentCardActionInput) =>
    api
      .requestProtected<UserFacingAgentResponse>(
        fitMeetCoreEndpoints.socialAgentChat.taskActions(data.taskId),
        {
          method: 'POST',
          body: JSON.stringify({
            action: data.action,
            idempotencyKey: data.idempotencyKey,
            payload: data.payload ?? {},
          }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  performActionStream: (
    data: AgentCardActionInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) =>
    runUserFacingAgentStreamAt(
      fitMeetCoreEndpoints.socialAgentChat.taskActionsStream(data.taskId),
      {
        action: data.action,
        idempotencyKey: data.idempotencyKey,
        payload: data.payload ?? {},
      },
      onEvent,
      signal,
    ),

  restoreSession: (taskId?: number | null) => {
    const path =
      typeof taskId === 'number' && Number.isFinite(taskId) && taskId > 0
        ? fitMeetCoreEndpoints.socialAgentChat.taskSession(taskId)
        : fitMeetCoreEndpoints.socialAgentChat.session;
    return api
      .requestProtected<UserFacingAgentSessionSnapshot>(path)
      .then(sanitizeSocialAgentResponse);
  },

  getProfileGate: () =>
    api
      .requestProtected<SocialAgentProfileGateStatus>(
        fitMeetCoreEndpoints.socialAgentChat.profileGate,
      )
      .then(sanitizeSocialAgentResponse),

  listThreads: (limit = 40) =>
    api
      .requestProtected<{
        threads: FitMeetAgentThreadSummary[];
      }>(
        `${fitMeetCoreEndpoints.socialAgentChat.threads}?limit=${encodeURIComponent(String(limit))}`,
      )
      .then(sanitizeSocialAgentResponse),

  createThread: (title?: string | null) =>
    api
      .requestProtected<{ thread: FitMeetAgentThreadSummary }>(
        fitMeetCoreEndpoints.socialAgentChat.threads,
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  getThread: (threadId: string | number) =>
    api
      .requestProtected<FitMeetAgentThreadDetail>(
        fitMeetCoreEndpoints.socialAgentChat.thread(threadId),
      )
      .then(sanitizeSocialAgentResponse),

  updateThread: (
    threadId: string | number,
    title?: string,
    branchSnapshot?: FitMeetAgentThreadBranchSnapshot | null,
    metadata?: Record<string, unknown> | null,
  ) =>
    api
      .requestProtected<{ thread: FitMeetAgentThreadSummary }>(
        fitMeetCoreEndpoints.socialAgentChat.thread(threadId),
        {
          method: 'POST',
          body: JSON.stringify({ title, branchSnapshot, metadata }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  deleteThread: (threadId: string | number) =>
    api
      .requestProtected<{ ok: true }>(fitMeetCoreEndpoints.socialAgentChat.threadDelete(threadId), {
        method: 'POST',
      })
      .then(sanitizeSocialAgentResponse),

  submitMessageFeedback: (messageId: string, data: MessageFeedbackInput) =>
    api
      .requestProtected<{
        ok: true;
        id: number;
        messageId: string;
        value: 'positive' | 'negative';
        updatedAt: string;
      }>(fitMeetCoreEndpoints.socialAgentChat.messageFeedback(messageId), {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  recordInterestEvent: (data: SocialAgentUserInterestEventInput) =>
    api
      .requestProtected<{ ok: true; recorded: boolean; eventId: number | null }>(
        fitMeetCoreEndpoints.socialAgentChat.interestEvents,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      )
      .then(sanitizeSocialAgentResponse),

  getReminderPreference: () =>
    api
      .requestProtected<SocialAgentReminderPreference>(
        fitMeetCoreEndpoints.socialAgentReminders.preferences,
      )
      .then(sanitizeSocialAgentResponse),

  updateReminderPreference: (data: SocialAgentReminderPreferenceInput) =>
    api
      .requestProtected<SocialAgentReminderPreference>(
        fitMeetCoreEndpoints.socialAgentReminders.preferences,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      )
      .then(sanitizeSocialAgentResponse),

  listReminders: (limit = 20) =>
    api
      .requestProtected<
        SocialAgentReminder[]
      >(`${fitMeetCoreEndpoints.socialAgentReminders.list}?limit=${encodeURIComponent(String(limit))}`)
      .then(sanitizeSocialAgentResponse),

  runReminderOnce: (force = false) =>
    api
      .requestProtected<{
        ok: true;
        skipped: boolean;
        reason: string | null;
        preference: SocialAgentReminderPreference;
        reminder: SocialAgentReminder | null;
      }>(fitMeetCoreEndpoints.socialAgentReminders.runOnce, {
        method: 'POST',
        body: JSON.stringify({ force }),
      })
      .then(sanitizeSocialAgentResponse),

  disableReminders: () =>
    api
      .requestProtected<SocialAgentReminderPreference>(
        fitMeetCoreEndpoints.socialAgentReminders.disable,
        { method: 'POST' },
      )
      .then(sanitizeSocialAgentResponse),

  openReminder: (id: number | string) =>
    api
      .requestProtected<{
        ok: boolean;
        reminder: SocialAgentReminder | null;
      }>(fitMeetCoreEndpoints.socialAgentReminders.open(id), { method: 'POST' })
      .then(sanitizeSocialAgentResponse),

  dismissReminder: (id: number | string) =>
    api
      .requestProtected<{
        ok: boolean;
        reminder: SocialAgentReminder | null;
        preference?: SocialAgentReminderPreference;
      }>(fitMeetCoreEndpoints.socialAgentReminders.dismiss(id), { method: 'POST' })
      .then(sanitizeSocialAgentResponse),

  runTaskNext: (taskId: number) =>
    api
      .requestProtected<SocialAgentRunNextResponse>(
        fitMeetCoreEndpoints.socialAgentTasks.runNext(taskId),
        { method: 'POST' },
      )
      .then(sanitizeSocialAgentResponse),

  getTaskEventReplay: (
    taskId: number,
    input: {
      afterSeq?: number | null;
      afterEventId?: string | null;
      includeDebug?: boolean;
    } = {},
  ) =>
    api
      .requestProtected<SocialCodexReplayPackage>(socialAgentTaskReplayPath(taskId, input))
      .then(sanitizeSocialAgentResponse),

  getTaskEventEval: (taskId: number) =>
    api
      .requestProtected<SocialCodexTraceEvalResult>(
        fitMeetCoreEndpoints.socialAgentTasks.eventsEval(taskId),
      )
      .then(sanitizeSocialAgentResponse),

  runUserFacingStream: (
    data: RunChatInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) => runUserFacingAgentStream(data, onEvent, signal),

  runCheckpointStream: (
    data: CheckpointStreamInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) => runCheckpointStreamWithPrepare(data, onEvent, signal),
};

async function runCheckpointStreamWithPrepare(
  data: CheckpointStreamInput,
  onEvent: (event: UserFacingAgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<UserFacingAgentResponse> {
  // The streaming endpoints prepare the durable checkpoint and execute the
  // resume/retry/replay/fork in one request. Calling the owner-facing prepare
  // endpoint first would create an extra child checkpoint before the stream
  // creates the one that actually runs.
  return runUserFacingAgentStreamAt(
    checkpointStreamEndpoint(data),
    { decision: data.decision ?? null },
    onEvent,
    signal,
  );
}

function checkpointStreamEndpoint(data: CheckpointStreamInput): string {
  const stepId = typeof data.stepId === 'string' && data.stepId.trim() ? data.stepId.trim() : null;
  return stepId
    ? data.action === 'fork'
      ? fitMeetCoreEndpoints.socialAgentChat.checkpointStepForkStream(data.checkpointId, stepId)
      : data.action === 'retry'
        ? fitMeetCoreEndpoints.socialAgentChat.checkpointStepRetryStream(data.checkpointId, stepId)
        : fitMeetCoreEndpoints.socialAgentChat.checkpointStepReplayStream(data.checkpointId, stepId)
    : data.action === 'fork'
      ? fitMeetCoreEndpoints.socialAgentChat.checkpointForkStream(data.checkpointId)
      : data.action === 'retry'
        ? fitMeetCoreEndpoints.socialAgentChat.checkpointRetryStream(data.checkpointId)
        : data.action === 'replay'
          ? fitMeetCoreEndpoints.socialAgentChat.checkpointReplayStream(data.checkpointId)
          : fitMeetCoreEndpoints.socialAgentChat.checkpointResumeStream(data.checkpointId);
}

function sanitizeSocialAgentResponse<T>(value: T): T {
  return sanitizeDisplayValue(value) as T;
}

function socialAgentTaskReplayPath(
  taskId: number,
  input: {
    afterSeq?: number | null;
    afterEventId?: string | null;
    includeDebug?: boolean;
  },
) {
  const query = new URLSearchParams();
  if (typeof input.afterSeq === 'number' && Number.isFinite(input.afterSeq)) {
    query.set('afterSeq', String(input.afterSeq));
  }
  if (input.afterEventId) query.set('afterEventId', input.afterEventId);
  if (input.includeDebug) query.set('includeDebug', 'true');
  const qs = query.toString();
  const path = fitMeetCoreEndpoints.socialAgentTasks.eventsReplay(taskId);
  return qs ? `${path}?${qs}` : path;
}

async function runUserFacingAgentStream(
  data: RunChatInput,
  onEvent: (event: UserFacingAgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<UserFacingAgentResponse> {
  return runUserFacingAgentStreamAt(
    fitMeetCoreEndpoints.socialAgentChat.streamUser,
    data,
    onEvent,
    signal,
  );
}

async function runUserFacingAgentStreamAt(
  endpoint: string,
  data:
    | RunChatInput
    | RouteMessageInput
    | Omit<AgentCardActionInput, 'taskId'>
    | { decision?: 'approved' | 'rejected' | null },
  onEvent: (event: UserFacingAgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<UserFacingAgentResponse> {
  const response = await api.fetchWithAuth(endpoint, {
    method: 'POST',
    signal,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await resolveStreamError(response));
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应，请刷新后重试。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: UserFacingAgentResponse | null = null;
  let completedEvent: (SocialAgentEventV2 & { type: 'run.completed' }) | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const event = parseUserFacingSseChunk(chunk);
        if (!event) continue;
        const sanitized = sanitizeSocialAgentResponse(event);
        onEvent(sanitized);
        if (sanitized.type === 'result') finalResult = sanitized.result;
        if (isSocialAgentV2RunCompleted(sanitized)) completedEvent = sanitized;
        if (sanitized.type === 'error') throw streamEventError(sanitized);
        if (isSocialAgentV2RunFailed(sanitized)) throw socialAgentV2RunFailedError(sanitized);
      }
    }

    if (buffer.trim()) {
      const event = parseUserFacingSseChunk(buffer);
      if (event) {
        const sanitized = sanitizeSocialAgentResponse(event);
        onEvent(sanitized);
        if (sanitized.type === 'result') finalResult = sanitized.result;
        if (isSocialAgentV2RunCompleted(sanitized)) completedEvent = sanitized;
        if (sanitized.type === 'error') throw streamEventError(sanitized);
        if (isSocialAgentV2RunFailed(sanitized)) throw socialAgentV2RunFailedError(sanitized);
      }
    }

    if (!finalResult && completedEvent) {
      finalResult = userFacingResponseFromRunCompletedEvent(completedEvent);
    }
    if (!finalResult) {
      throw missingFinalResultError();
    }
    return finalResult;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed or aborted.
    }
  }
}

function missingFinalResultError() {
  const recoveryNotice: UserFacingAgentRecoveryNotice = {
    kind: 'interrupted',
    title: '这段需求还在',
    message: '可以继续处理，我会从这里接着处理；也可以补充新的要求。',
    retryable: true,
    source: 'stream_error',
  };
  const error = new Error(recoveryNotice.message) as Error & {
    code?: string;
    retryable?: boolean;
    recoveryNotice?: UserFacingAgentRecoveryNotice;
  };
  error.name = 'AGENT_STREAM_INCOMPLETE';
  error.code = 'AGENT_STREAM_INCOMPLETE';
  error.retryable = true;
  error.recoveryNotice = recoveryNotice;
  return error;
}

function streamEventError(event: Extract<UserFacingAgentStreamEvent, { type: 'error' }>) {
  const error = new Error(event.message) as Error & {
    code?: string;
    retryable?: boolean;
    recoveryNotice?: UserFacingAgentRecoveryNotice;
  };
  error.name = event.code || 'AGENT_STREAM_FAILED';
  error.code = event.code;
  error.retryable = event.retryable;
  error.recoveryNotice = event.recoveryNotice;
  return error;
}

function isSocialAgentV2RunCompleted(
  event: UserFacingAgentStreamEvent,
): event is SocialAgentEventV2 & { type: 'run.completed' } {
  return (
    event.type === 'run.completed' &&
    typeof event.eventId === 'string' &&
    typeof event.seq === 'number'
  );
}

function isSocialAgentV2RunFailed(
  event: UserFacingAgentStreamEvent,
): event is SocialAgentEventV2 & { type: 'run.failed' } {
  return (
    event.type === 'run.failed' &&
    typeof event.eventId === 'string' &&
    typeof event.seq === 'number'
  );
}

function userFacingResponseFromRunCompletedEvent(
  event: SocialAgentEventV2 & { type: 'run.completed' },
): UserFacingAgentResponse {
  const summary = recordFromUnknown(event.payload?.summary);
  const assistantMessage =
    textFromUnknown(event.payload?.assistantMessage) ??
    textFromUnknown(summary?.detail) ??
    textFromUnknown(event.display?.detail) ??
    textFromUnknown(summary?.title) ??
    textFromUnknown(event.display?.title) ??
    '我整理好了，可以继续追问或让我接着处理下一步。';
  const lightStatus = event.display?.state === 'waiting' ? '正在等待你确认' : '已整理回复';
  return {
    assistantMessage,
    assistantMessageSource: 'llm',
    lightStatus,
    cards: [],
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'assist',
    workflow: {
      workflowId:
        textFromUnknown(event.threadId) ??
        textFromUnknown(event.runId) ??
        textFromUnknown(event.messageId) ??
        null,
      state: event.display?.state === 'waiting' ? 'PUBLISH_CONFIRMATION_REQUIRED' : 'IDLE',
      requiredAction: null,
      retryable: false,
      recoveryMessage: null,
    },
  };
}

function socialAgentV2RunFailedError(event: SocialAgentEventV2 & { type: 'run.failed' }) {
  const title = recoveryTitleFromRunFailedEvent(event);
  const explicitMessage =
    textFromUnknown(event.display?.detail) ?? textFromUnknown(event.payload?.message);
  const message =
    explicitMessage && !isGenericRunFailedMessage(explicitMessage)
      ? explicitMessage
      : '刚才连接中断了。当前需求还在，可以重试或继续补充。';
  const code = textFromUnknown(event.payload?.code) ?? 'AGENT_RUN_FAILED';
  const recoveryNotice = recoveryNoticeFromRunFailedEvent(event, title, message);
  const error = new Error(message) as Error & {
    code?: string;
    retryable?: boolean;
    recoveryNotice?: UserFacingAgentRecoveryNotice;
  };
  error.name = code;
  error.code = code;
  error.retryable = recoveryNotice.retryable;
  error.recoveryNotice = recoveryNotice;
  return error;
}

function recoveryTitleFromRunFailedEvent(
  event: SocialAgentEventV2 & { type: 'run.failed' },
): string {
  const rawNotice = recordFromUnknown(event.payload?.recoveryNotice);
  const explicit = [
    textFromUnknown(event.payload?.recoveryTitle),
    textFromUnknown(rawNotice?.title),
    textFromUnknown(event.display?.title),
  ].find((value): value is string => Boolean(value && !isGenericRunFailedTitle(value)));
  if (explicit) {
    return explicit;
  }
  return event.display?.state === 'failed' ? '这段需求还在' : '当前进度可以继续';
}

function isGenericRunFailedTitle(value: string): boolean {
  return genericRunFailedTitlePattern().test(value.trim());
}

function isGenericRunFailedMessage(value: string): boolean {
  return genericRunFailedMessagePattern().test(value.trim());
}

function genericRunFailedTitlePattern() {
  const phrases = [
    ['这次', '处理', '没有', '完成'],
    ['这一步', '没有', '完成'],
    ['这次', '没有', '顺利', '完成'],
    ['暂时', '没有', '顺利', '完成'],
    ['run failed'],
    ['处理', '失败'],
  ].map((parts) => parts.join(''));
  return new RegExp(phrases.join('|'), 'i');
}

function genericRunFailedMessagePattern() {
  const phrases = [
    ['这次', '处理', '没有', '完成'],
    ['这一步', '没有', '完成'],
    ['暂时', '没有', '顺利', '完成'],
    ['保留', '当前', '对话'],
    ['稍后', '再试'],
    ['可以', '稍后', '再试'],
    ['服务', '暂时', '不可用'],
    ['FitMeet Agent'],
  ].map((parts) => parts.join(''));
  return new RegExp(phrases.join('|'), 'i');
}

function recoveryNoticeFromRunFailedEvent(
  event: SocialAgentEventV2 & { type: 'run.failed' },
  fallbackTitle: string,
  fallbackMessage: string,
): UserFacingAgentRecoveryNotice {
  const rawNotice = recordFromUnknown(event.payload?.recoveryNotice);
  const kind = recoveryKindFromUnknown(rawNotice?.kind ?? event.payload?.kind);
  const explicitTitle = textFromUnknown(rawNotice?.title);
  const explicitMessage = textFromUnknown(rawNotice?.message);
  const title =
    explicitTitle && !isGenericRunFailedTitle(explicitTitle) ? explicitTitle : fallbackTitle;
  const message =
    explicitMessage && !isGenericRunFailedMessage(explicitMessage)
      ? explicitMessage
      : fallbackMessage;
  return {
    kind,
    title,
    message,
    retryable: rawNotice?.retryable !== false && event.payload?.retryable !== false,
    source: 'stream_error',
  };
}

function recoveryKindFromUnknown(value: unknown): UserFacingAgentRecoveryNotice['kind'] {
  return value === 'timeout' ||
    value === 'interrupted' ||
    value === 'checkpoint' ||
    value === 'failed'
    ? value
    : 'failed';
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

async function resolveStreamError(response: Response): Promise<string> {
  if (response.status === 401) return api.AUTH_EXPIRED_MESSAGE;
  if (response.status === 504) {
    return '请求超时，但你的补充信息已经保存。请稍后重试。';
  }
  const body = await response.text().catch(() => '');
  if (!body.trim()) return response.statusText || 'FitMeet Agent 请求失败。';
  if (/^\s*</.test(body)) return '服务暂时没有返回可读结果，请稍后重试。';

  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    if (Array.isArray(parsed.message)) return parsed.message.join('，');
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
  } catch {
    return body;
  }

  return body;
}

function parseUserFacingSseChunk(chunk: string): UserFacingAgentStreamEvent | null {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  if (dataLines.length === 0) return null;

  try {
    return JSON.parse(dataLines.join('\n')) as UserFacingAgentStreamEvent;
  } catch {
    return null;
  }
}
