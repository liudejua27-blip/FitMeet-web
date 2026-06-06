import * as api from './client';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';
import { sanitizeDisplayValue } from '../lib/displayText';

export type SocialAgentPermissionMode =
  | 'assist'
  | 'confirm'
  | 'manual_confirm'
  | 'limited_auto'
  | 'open'
  | 'lab';
export type SocialAgentTaskStatus =
  | 'pending'
  | 'planning'
  | 'awaiting_confirmation'
  | 'executing'
  | 'waiting_result'
  | 'waiting_reply'
  | 'awaiting_feedback'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type SocialAgentStepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface SocialAgentToolCall {
  id: string;
  stepId: string;
  toolName: string;
  status: 'succeeded' | 'failed' | 'blocked';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface SocialAgentChatCandidate {
  agentTaskId: number;
  source?: 'profile_candidate' | 'public_intent' | 'activity';
  isRealData?: boolean;
  socialRequestId: number | null;
  targetUserId?: number | null;
  userId: number;
  candidateUserId?: number;
  publicIntentId?: string | null;
  activityId?: number | null;
  displayName?: string;
  candidateRecordId: number | null;
  nickname: string;
  avatar: string;
  color: string;
  city: string;
  score: number;
  level: string;
  distanceKm: number | null;
  commonTags: string[];
  reasons: string[];
  interestTags?: string[];
  profileCompleteness?: number;
  dataQuality?: 'complete' | 'partial' | 'incomplete';
  matchScore?: number;
  matchReasons?: string[];
  riskWarnings?: string[];
  risk: { level: string; warnings: string[] };
  suggestedOpener?: string;
  suggestedMessage: string;
  candidateExplanation?: SocialAgentCandidateExplanation;
  emotionalInsight?: SocialAgentEmotionalInsight;
  lifeGraphExplanation?: SocialAgentLifeGraphExplanation;
  status?: string;
}

export interface SocialAgentCandidateExplanation {
  fitReasons: string[];
  suggestedOpener: string;
  awkwardPoints: string[];
  safeFirstStep: string;
  nextActionSuggestion: string;
  requiresConfirmation: boolean;
  lifeGraphExplanation?: SocialAgentLifeGraphExplanation;
}

export interface SocialAgentLifeGraphExplanation {
  usedSignals: string[];
  missingSignals: string[];
  boundaryNotes: string[];
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface SocialAgentEmotionalInsight {
  fitReason: string;
  openerAdvice: string;
  possibleAwkwardness: string;
  safeFirstStep: string;
  tone?: 'gentle' | 'active' | 'careful';
}

export interface SocialAgentChatRunResult {
  taskId: number;
  status: SocialAgentTaskStatus;
  visibleSteps: Array<{ id: string; label: string; status: SocialAgentStepStatus }>;
  assistantMessage: string;
  emptyReason?: 'no_real_candidates' | null;
  message?: string | null;
  debugReasons?: Record<string, number> | null;
  socialRequestDraft:
    | (Record<string, unknown> & {
        agentTaskId: number;
        socialRequestId?: number | null;
        mode: 'draft';
        title?: string;
        description?: string;
        rawText?: string;
        city?: string;
        interestTags?: string[];
        activityType?: string;
      })
    | null;
  candidates: SocialAgentChatCandidate[];
  approvalRequiredActions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  cards?: FitMeetAlphaCard[];
  safety?: FitMeetAgentSafety;
  traceId?: string;
  agentTrace?: FitMeetAgentTrace;
  structuredIntent?: Record<string, unknown>;
}

export type UserFacingAgentLightStatus =
  | '正在理解你的需求'
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
  level: FitMeetAgentSafety['level'];
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

export interface UserFacingAgentResponse {
  assistantMessage: string;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
  permissionMode: SocialAgentPermissionMode;
}

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
  agentPath: string[];
  handoffs: Array<Record<string, unknown>>;
  guardrails: Array<Record<string, unknown>>;
}

export interface SocialAgentPlanStep {
  id: string;
  title: string;
  action: string;
  status: 'planned' | 'replanned';
  requiresUserConfirmation: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  toolName: string | null;
  input: Record<string, unknown>;
  rationale: string;
}

export interface SocialAgentReplanResult {
  taskId: number;
  permissionMode: SocialAgentPermissionMode;
  allowedActions: string[];
  plan: SocialAgentPlanStep[];
  source: 'deepseek' | 'fallback';
  fallbackReason: string | null;
  reason: 'initial' | 'user_follow_up' | 'failure_recovery' | 'manual_replan';
  replanAttempt: number;
}

export interface SocialAgentChatReplanRunResult extends SocialAgentChatRunResult {
  replan: SocialAgentReplanResult;
}

export type SocialAgentAsyncRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface SocialAgentAsyncRunResult {
  taskId: number;
  runId: string;
  status: SocialAgentAsyncRunStatus;
  phase: string;
  message: string;
  visibleSteps: Array<{ id: string; label: string; status: SocialAgentStepStatus }>;
  queuedAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  pollAfterMs: number;
  taskStatus?: SocialAgentTaskStatus;
  error?: Record<string, unknown> | null;
  replan?: SocialAgentReplanResult | null;
  result?: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
}

export interface SocialAgentAppendContextResult {
  taskId: number;
  saved: true;
  eventType: 'social_agent.context.appended';
  userMessage: string;
  previousGoal: string;
  refreshedGoal: string;
  appendedAt: string;
}

export interface SocialAgentTaskEvent {
  id: number;
  taskId: number;
  eventType: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  stepId: string | null;
  toolCallId: string | null;
  createdAt: string;
}

export interface SocialAgentTaskEventsResult {
  taskId: number;
  events: SocialAgentTaskEvent[];
}

export interface SocialAgentSessionMessage {
  id: string;
  role: 'user' | 'assistant';
  kind?: 'text' | 'risk' | 'approval';
  content: string;
  createdAt: string | null;
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApproval;
}

export interface SocialAgentSessionTaskSummary {
  id: number;
  status: SocialAgentTaskStatus;
  title: string;
  goal: string;
  permissionMode: SocialAgentPermissionMode;
  statusReason: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SocialAgentSessionSnapshot {
  hasSession: boolean;
  activeTaskId: number | null;
  task: SocialAgentSessionTaskSummary | null;
  messages: SocialAgentSessionMessage[];
  events: SocialAgentTaskEvent[];
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  latestRun: SocialAgentAsyncRunResult | null;
  pendingApprovals: SocialAgentPendingApproval[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}

export interface SocialAgentCurrentTaskSnapshot {
  taskId: number;
  status: SocialAgentTaskStatus;
  taskType: string;
  title: string;
  goal: string;
  memory: Record<string, unknown>;
  result: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
}

export interface SocialAgentTimelineMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  kind: 'text' | 'status' | 'candidates' | 'activityResults' | 'approval' | 'risk' | 'tool';
  text: string;
  createdAt: string | null;
  candidates?: SocialAgentChatCandidate[];
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApproval;
  toolCalls?: Array<Record<string, unknown>>;
}

export interface SocialAgentTaskTimelineSnapshot {
  taskId: number;
  messages: SocialAgentTimelineMessage[];
  task: SocialAgentSessionTaskSummary;
  memory: Record<string, unknown>;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  events: SocialAgentTaskEvent[];
  latestRun: SocialAgentAsyncRunResult | null;
  pendingApprovals: SocialAgentPendingApproval[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}

export type SocialAgentIntentType =
  | 'casual_chat'
  | 'product_help'
  | 'workflow_help'
  | 'profile_enrichment'
  | 'profile_enrichment_request'
  | 'correction_or_clarification'
  | 'profile_update'
  | 'social_search'
  | 'activity_search'
  | 'candidate_followup'
  | 'action_request'
  | 'safety_or_boundary'
  | 'unknown';

export type SocialAgentIntentAction =
  | 'answer'
  | 'reply'
  | 'save_context'
  | 'queue_search'
  | 'queue_replan'
  | 'await_confirmation'
  | 'clarify';

export type SocialAgentReplyStrategy =
  | 'conversational_answer'
  | 'direct_reply'
  | 'ask_clarifying_question'
  | 'append_context'
  | 'search_candidates'
  | 'search_activities'
  | 'execute_action';

export interface SocialAgentIntentEntities {
  city: string;
  activityType: string;
  targetGender: string;
  timePreference: string;
  locationPreference: string;
}

export interface SocialAgentIntentRouteResult {
  intent: SocialAgentIntentType;
  action: SocialAgentIntentAction;
  confidence: number;
  entities: SocialAgentIntentEntities;
  shouldSearch: boolean;
  shouldReplan: boolean;
  shouldUpdateProfile: boolean;
  shouldExecuteAction: boolean;
  replyStrategy: SocialAgentReplyStrategy;
  source: 'rules' | 'deepseek';
  taskId: number | null;
  assistantMessage: string;
  savedContext: boolean;
  profileUpdated: boolean;
  shouldQueueRun: boolean;
  runMode: 'initial' | 'follow_up' | null;
  queuedRun?: SocialAgentAsyncRunResult | null;
  pendingApproval?: SocialAgentPendingApproval | null;
  activityResults?: SocialAgentActivityResult[];
}

export interface SocialAgentPendingApproval {
  id: number;
  type: string;
  actionType: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  payload: Record<string, unknown>;
  expiresAt: string | null;
}

export interface SocialAgentActivityResult {
  id: string;
  source: 'public_intent' | 'activity';
  isRealData?: boolean;
  activityId?: number | null;
  publicIntentId?: string | null;
  title: string;
  description: string;
  city: string;
  loc: string;
  requestType: string;
  interestTags: string[];
  timePreference: string;
  ownerUserId: number | null;
  status: string;
  createdAt: string | null;
  matchScore?: number;
  matchReasons?: string[];
  candidateExplanation?: SocialAgentCandidateExplanation;
}

export type SocialAgentChatStreamEvent =
  | { type: 'task'; taskId: number; status: SocialAgentTaskStatus }
  | {
      type: 'step';
      step: { id: string; label: string; status: SocialAgentStepStatus };
    }
  | { type: 'result'; result: SocialAgentChatRunResult }
  | { type: 'error'; message: string };

export type UserFacingAgentStreamEvent =
  | { type: 'status'; lightStatus: UserFacingAgentLightStatus }
  | { type: 'result'; result: UserFacingAgentResponse }
  | { type: 'error'; message: string };

type RunChatInput = {
  goal: string;
  permissionMode: SocialAgentPermissionMode;
  idempotencyKey?: string;
};

type ReplanChatInput = {
  userMessage: string;
  reason?: 'user_follow_up' | 'failure_recovery' | 'manual_replan';
  failure?: Record<string, unknown> | null;
};

type RouteMessageInput = {
  message: string;
  taskId?: number | null;
  hasCandidates?: boolean;
};

type SendCandidateMessageInput = {
  candidateUserId?: number;
  targetUserId: number;
  message: string;
  suggestedOpener?: string;
  candidate?: Record<string, unknown>;
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  metadata?: Record<string, unknown>;
};

type SaveCandidateInput = {
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  publicIntentId?: string | null;
  candidateUserId?: number | null;
  targetUserId?: number | null;
  candidate?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type ConnectCandidateInput = SaveCandidateInput;

export interface SocialAgentCandidateActionResult {
  success?: boolean;
  status: 'sent' | 'connected' | 'requested' | 'pending' | 'pending_approval' | string;
  targetUserId?: number | null;
  candidateUserId?: number | null;
  following?: boolean;
  conversationId?: string | null;
  messageId?: string | null;
  friendRequestId?: string | null;
}

export interface SocialAgentPublishResult {
  success: boolean;
  taskId: number;
  socialRequestId: number;
  publicIntentId: string | null;
  status: 'published' | 'synced' | 'completed' | string;
  taskStatus: SocialAgentTaskStatus;
  synced: boolean;
  toolCallId?: string;
  socialRequest: Record<string, unknown>;
}

export interface SocialAgentSendCandidateMessageResult {
  success: boolean;
  taskId: number;
  targetUserId: number;
  candidateUserId: number;
  status: 'sent' | 'pending_approval' | 'failed' | string;
  messageId: string | null;
  conversationId: string | null;
  approvalId?: number | null;
  requiresApproval?: boolean;
  message?: string | null;
  candidateStatus?: string | null;
  messageAction?: SocialAgentCandidateActionResult;
  toolCall?: SocialAgentToolCall;
}

export interface SocialAgentConnectCandidateResult {
  success: boolean;
  taskId: number;
  targetUserId: number;
  candidateUserId: number;
  status: 'connected' | 'pending' | 'requested' | string;
  following?: boolean;
  friendRequestId: string | null;
  conversationId: string | null;
  friendAction?: SocialAgentCandidateActionResult;
  toolCall?: SocialAgentToolCall;
}

export const socialAgentDebugApi = {
  runChat: (data: RunChatInput) =>
    api
      .requestProtected<SocialAgentChatRunResult>('/social-agent/chat/run', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  runChatQueued: (data: RunChatInput) =>
    api
      .requestProtected<SocialAgentAsyncRunResult>('/social-agent/chat/run-async', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  routeMessage: (data: RouteMessageInput) =>
    api
      .requestProtected<UserFacingAgentResponse>('/social-agent/chat/route-message', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  handleMessage: (data: RouteMessageInput) => {
    const taskId = data.taskId ?? null;
    const path = taskId
      ? `/social-agent/chat/tasks/${taskId}/messages`
      : '/social-agent/chat/messages';
    return api
      .requestProtected<UserFacingAgentResponse>(path, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse);
  },

  runChatStream: (
    data: RunChatInput,
    onEvent: (event: SocialAgentChatStreamEvent) => void,
    signal?: AbortSignal,
  ) => runSocialAgentStream(data, onEvent, signal),

  runUserFacingStream: (
    data: RunChatInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) => runUserFacingAgentStream(data, onEvent, signal),

  publishSocialRequest: (taskId: number, draft: Record<string, unknown>) =>
    api
      .requestProtected<SocialAgentPublishResult>(
        `/social-agent/chat/tasks/${taskId}/publish-social-request`,
        {
          method: 'POST',
          body: JSON.stringify(draft),
        },
      )
      .then(sanitizeSocialAgentResponse),

  saveCandidate: (taskId: number, data: SaveCandidateInput) =>
    api
      .requestProtected<SocialAgentToolCall>(`/social-agent/chat/tasks/${taskId}/save-candidate`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  sendCandidateMessage: (taskId: number, data: SendCandidateMessageInput) =>
    api
      .requestProtected<SocialAgentSendCandidateMessageResult>(
        `/social-agent/chat/tasks/${taskId}/send-message`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            metadata: {
              ...(data.metadata ?? {}),
              confirmationSource: 'social_agent_chat',
            },
          }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  connectCandidate: (taskId: number, data: ConnectCandidateInput) =>
    api
      .requestProtected<SocialAgentConnectCandidateResult>(
        `/social-agent/chat/tasks/${taskId}/connect-candidate`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            openConversation: true,
            metadata: {
              ...(data.metadata ?? {}),
              confirmationSource: 'social_agent_chat',
            },
          }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  replanTask: (taskId: number, data: ReplanChatInput) =>
    api
      .requestProtected<SocialAgentReplanResult>(`/social-agent/tasks/${taskId}/replan`, {
        method: 'POST',
        body: JSON.stringify({
          reason: data.reason ?? 'user_follow_up',
          userMessage: data.userMessage,
          failure: data.failure ?? null,
        }),
      })
      .then(sanitizeSocialAgentResponse),

  replanAndRunTask: (taskId: number, data: ReplanChatInput) =>
    api
      .requestProtected<SocialAgentAsyncRunResult>(
        `/social-agent/chat/tasks/${taskId}/replan-run`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: data.reason ?? 'user_follow_up',
            userMessage: data.userMessage,
            failure: data.failure ?? null,
          }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  appendContext: (taskId: number, data: ReplanChatInput) =>
    api
      .requestProtected<SocialAgentAppendContextResult>(
        `/social-agent/chat/tasks/${taskId}/append-context`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: data.reason ?? 'user_follow_up',
            userMessage: data.userMessage,
            failure: data.failure ?? null,
          }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  getRunStatus: (taskId: number, runId: string) =>
    api
      .requestProtected<SocialAgentAsyncRunResult>(
        fitMeetCoreEndpoints.socialAgentChat.taskRunStatus(taskId, runId),
      )
      .then(sanitizeSocialAgentResponse),

  getTaskEvents: (taskId: number) =>
    api
      .requestProtected<SocialAgentTaskEventsResult>(`/social-agent/tasks/${taskId}/events`)
      .then(sanitizeSocialAgentResponse),

  getCurrentTask: () =>
    api
      .requestProtected<SocialAgentCurrentTaskSnapshot | null>(
        fitMeetCoreEndpoints.socialAgentTasks.current,
      )
      .then(sanitizeSocialAgentResponse),

  getTaskTimeline: (taskId: number) =>
    api
      .requestProtected<SocialAgentTaskTimelineSnapshot>(
        fitMeetCoreEndpoints.socialAgentTasks.timeline(taskId),
      )
      .then(sanitizeSocialAgentResponse),

  getSession: () =>
    api
      .requestProtected<SocialAgentSessionSnapshot>('/social-agent/chat/session')
      .then(sanitizeSocialAgentResponse),

  getTaskSession: (taskId: number) =>
    api
      .requestProtected<SocialAgentSessionSnapshot>(`/social-agent/chat/tasks/${taskId}/session`)
      .then(sanitizeSocialAgentResponse),
};

function sanitizeSocialAgentResponse<T>(value: T): T {
  return sanitizeDisplayValue(value) as T;
}

async function runSocialAgentStream(
  data: RunChatInput,
  onEvent: (event: SocialAgentChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SocialAgentChatRunResult> {
  const response = await api.fetchWithAuth(
    fitMeetCoreEndpoints.socialAgentChat.stream,
    {
      method: 'POST',
      signal,
      body: JSON.stringify(data),
    },
  );

  if (!response.ok) {
    throw new Error(await resolveStreamError(response));
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应，请刷新后重试。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: SocialAgentChatRunResult | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const event = parseSseChunk(chunk);
        if (!event) continue;
        const sanitized = sanitizeSocialAgentResponse(event);
        onEvent(sanitized);
        if (sanitized.type === 'result') finalResult = sanitized.result;
        if (sanitized.type === 'error') throw new Error(sanitized.message);
      }
    }

    if (buffer.trim()) {
      const event = parseSseChunk(buffer);
      if (event) {
        const sanitized = sanitizeSocialAgentResponse(event);
        onEvent(sanitized);
        if (sanitized.type === 'result') finalResult = sanitized.result;
        if (sanitized.type === 'error') throw new Error(sanitized.message);
      }
    }

    if (!finalResult) {
      throw new Error('Social Agent 没有返回最终结果，请稍后再试。');
    }
    return finalResult;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Best-effort cleanup: cancel may reject if the stream already errored or aborted.
    }
  }
}

async function runUserFacingAgentStream(
  data: RunChatInput,
  onEvent: (event: UserFacingAgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<UserFacingAgentResponse> {
  const response = await api.fetchWithAuth('/social-agent/chat/stream-user', {
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
      // Best-effort cleanup: cancel may reject if the stream already errored or aborted.
    }
  }
}

async function resolveStreamError(response: Response): Promise<string> {
  if (response.status === 401) return api.AUTH_EXPIRED_MESSAGE;
  if (response.status === 504) return '请求超时，但你的补充信息已保存。请稍后重试。';
  const body = await response.text().catch(() => '');
  if (!body.trim()) return response.statusText || 'Social Agent 请求失败。';
  if (/^\s*</.test(body)) return '服务器返回了不可读的错误页面，请稍后重试。';

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

function parseSseChunk(chunk: string): SocialAgentChatStreamEvent | null {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  if (dataLines.length === 0) return null;

  try {
    return JSON.parse(dataLines.join('\n')) as SocialAgentChatStreamEvent;
  } catch {
    return null;
  }
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
