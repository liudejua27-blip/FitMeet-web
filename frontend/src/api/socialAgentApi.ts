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
  | '正在理解你的需求'
  | '正在整理回复'
  | '已整理回复'
  | '正在结合你的 Life Graph'
  | '正在筛选合适的人'
  | '正在排除时间不合适的人'
  | '正在检查安全边界'
  | '正在生成开场白'
  | '正在等待你确认'
  | '正在创建约练计划'
  | '正在更新你的 Life Graph';

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
  expiresAt: string | null;
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
  | 'candidate.more_like_this'
  | 'candidate.view_detail'
  | 'candidate.connect'
  | 'candidate.generate_opener'
  | 'opener.confirm_send'
  | 'opener.regenerate'
  | 'opener.reject'
  | 'activity.confirm_create'
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
  | 'meet_loop.reschedule';

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

export interface UserFacingAgentCheckpointStepAction
  extends UserFacingAgentCheckpointRecoveryAction {
  stepId: string;
}

export interface UserFacingAgentResponse {
  assistantMessage: string;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
  permissionMode: SocialAgentPermissionMode;
  lifeGraphWritebackProposal?: Record<string, unknown>;
  runtime?: {
    checkpointId?: number | null;
    checkpointType?: string | null;
    canResume?: boolean;
    canReplay?: boolean;
    canFork?: boolean;
    parentCheckpointId?: number | null;
    threadId?: string | null;
    idempotencyKey?: string | null;
    checkpointAction?: UserFacingAgentCheckpointAction | null;
    interrupt?: {
      kind?: string | null;
      threadId?: string | null;
      idempotencyKey?: string | null;
      resumeAction?: UserFacingAgentCheckpointAction | null;
      recoveryActions?: UserFacingAgentCheckpointRecoveryAction[];
      stepActions?: UserFacingAgentCheckpointStepAction[];
      approvalEndpoint?: string | null;
      rejectionEndpoint?: string | null;
    } | null;
    resumeCursor?: {
      threadId?: string | null;
      checkpointId?: number | string | null;
      parentCheckpointId?: number | string | null;
      action?: 'resume' | 'retry' | 'replay' | 'fork' | null;
      stepId?: string | null;
    } | null;
    sourceStep?: {
      stepId: string;
      label: string | null;
      toolName: string | null;
    } | null;
    stepScope?: {
      mode: 'full_checkpoint' | 'through_step';
      stepCount: number;
      sourceCheckpointId: number | null;
    } | null;
    sideEffectPolicy?: {
      idempotencyKey: string;
      sideEffectsBeforeResume: 'idempotent_only';
      duplicatePolicy: 'reuse_idempotency_key';
    } | null;
  };
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
  latestRun?: Record<string, unknown> | null;
  pendingApprovals?: Array<Record<string, unknown>>;
  restoredAt?: string;
}

export interface SocialAgentProfileGateStatus {
  passed: boolean;
  missing: Array<
    'city' | 'activity' | 'availability' | 'boundary' | 'publicAuthorization'
  >;
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

export type SocialAgentReminderTopic =
  | 'friendship'
  | 'fitness_partner'
  | 'activity'
  | 'life_graph';

export type SocialAgentReminderScene =
  | 'weekend_opportunities'
  | 'past_social_goal'
  | 'activity_follow_up'
  | 'life_graph_confirmation';

export interface SocialAgentReminderPreference {
  id: number;
  userId: number;
  enabled: boolean;
  topics: SocialAgentReminderTopic[];
  frequency: 'daily' | 'weekly' | 'manual';
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
  | 'review_card'
  | 'audit_update'
  | 'safety_boundary';

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

export type UserFacingAgentStreamEvent =
  | {
      type: 'status';
      lifecycle?: string;
      lightStatus: UserFacingAgentLightStatus;
      taskId?: number;
    }
  | (UserFacingAgentProgressEvent & { lifecycle?: string })
  | {
      type: 'assistant_delta';
      lifecycle?: string;
      messageId?: string;
      delta: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'assistant_done';
      lifecycle?: string;
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
  | { type: 'error'; lifecycle?: string; code?: string; message: string; retryable?: boolean };

type RunChatInput = {
  goal: string;
  permissionMode: SocialAgentPermissionMode;
  taskId?: number | null;
  city?: string | null;
  idempotencyKey?: string;
  clientContext?: {
    timezone?: string;
    locale?: string;
    source: 'web' | 'ios';
    checkpointId?: number | null;
    parentCheckpointId?: number | null;
    checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    decision?: 'approved' | 'rejected' | null;
  };
};

type RouteMessageInput = {
  message: string;
  taskId?: number | null;
  hasCandidates?: boolean;
  idempotencyKey?: string;
  clientContext?: {
    timezone?: string;
    locale?: string;
    source: 'web' | 'ios';
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
  traceId?: string | null;
  source?: string | null;
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
      .requestProtected<SocialAgentReminder[]>(
        `${fitMeetCoreEndpoints.socialAgentReminders.list}?limit=${encodeURIComponent(String(limit))}`,
      )
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
      .requestProtected<{ ok: boolean; reminder: SocialAgentReminder | null }>(
        fitMeetCoreEndpoints.socialAgentReminders.open(id),
        { method: 'POST' },
      )
      .then(sanitizeSocialAgentResponse),

  dismissReminder: (id: number | string) =>
    api
      .requestProtected<{
        ok: boolean;
        reminder: SocialAgentReminder | null;
        preference?: SocialAgentReminderPreference;
      }>(
        fitMeetCoreEndpoints.socialAgentReminders.dismiss(id),
        { method: 'POST' },
      )
      .then(sanitizeSocialAgentResponse),

  runTaskNext: (taskId: number) =>
    api
      .requestProtected<SocialAgentRunNextResponse>(
        fitMeetCoreEndpoints.socialAgentTasks.runNext(taskId),
        { method: 'POST' },
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
  const stepId =
    typeof data.stepId === 'string' && data.stepId.trim() ? data.stepId.trim() : null;
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
        if (sanitized.type === 'error') throw new Error(sanitized.message);
      }
    }

    if (buffer.trim()) {
      const event = parseUserFacingSseChunk(buffer);
      if (event) {
        const sanitized = sanitizeSocialAgentResponse(event);
        onEvent(sanitized);
        if (sanitized.type === 'result') finalResult = sanitized.result;
        if (sanitized.type === 'error') throw new Error(sanitized.message);
      }
    }

    if (!finalResult) {
      throw new Error('FitMeet Agent 没有返回最终结果，请稍后再试。');
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
