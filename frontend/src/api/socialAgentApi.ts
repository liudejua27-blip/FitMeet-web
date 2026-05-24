import * as api from './client';
import { cleanDisplayText, sanitizeDisplayValue } from '../lib/displayText';

export type SocialAgentPermissionMode = 'assist' | 'confirm' | 'limited_auto';
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
  status?: string;
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

export type SocialAgentIntentType =
  | 'casual_chat'
  | 'profile_update'
  | 'social_search'
  | 'activity_search'
  | 'candidate_followup'
  | 'action_request'
  | 'safety_or_boundary'
  | 'unknown';

export type SocialAgentIntentAction =
  | 'reply'
  | 'save_context'
  | 'queue_search'
  | 'queue_replan'
  | 'await_confirmation'
  | 'clarify';

export type SocialAgentReplyStrategy =
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
}

export type SocialAgentChatStreamEvent =
  | { type: 'task'; taskId: number; status: SocialAgentTaskStatus }
  | {
      type: 'step';
      step: { id: string; label: string; status: SocialAgentStepStatus };
    }
  | { type: 'result'; result: SocialAgentChatRunResult }
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
  socialRequestId?: number | null;
  metadata?: Record<string, unknown>;
};

type SaveCandidateInput = {
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  candidateUserId?: number | null;
  targetUserId?: number | null;
  candidate?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type ConnectCandidateInput = SaveCandidateInput;

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
  status: 'sent' | 'failed' | string;
  messageId: string | null;
  conversationId: string | null;
  candidateStatus?: string | null;
  messageAction?: SocialAgentToolCall;
}

export interface SocialAgentConnectCandidateResult {
  success: boolean;
  taskId: number;
  targetUserId: number;
  status: 'connected' | 'pending' | 'requested' | string;
  following?: boolean;
  friendRequestId: string | null;
  conversationId: string | null;
  friendAction?: SocialAgentToolCall;
}

export const socialAgentApi = {
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
      .requestProtected<SocialAgentIntentRouteResult>('/social-agent/chat/route-message', {
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
      .requestProtected<SocialAgentIntentRouteResult>(path, {
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
      .requestProtected<SocialAgentToolCall>(
        `/social-agent/tasks/${taskId}/tools/send_message_to_candidate`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...data,
            text: data.message || data.suggestedOpener,
            metadata: {
              ...(data.metadata ?? {}),
              confirmationSource: 'social_agent_chat',
            },
          }),
        },
      )
      .then(sanitizeSocialAgentResponse)
      .then((toolCall) => normalizeSendCandidateMessageResult(taskId, data, toolCall)),

  connectCandidate: (taskId: number, data: ConnectCandidateInput) =>
    api
      .requestProtected<SocialAgentToolCall>(
        `/social-agent/tasks/${taskId}/tools/connect_candidate`,
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
      .then(sanitizeSocialAgentResponse)
      .then((toolCall) => normalizeConnectCandidateResult(taskId, data, toolCall)),

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
        `/social-agent/chat/tasks/${taskId}/runs/${encodeURIComponent(runId)}`,
      )
      .then(sanitizeSocialAgentResponse),

  getTaskEvents: (taskId: number) =>
    api
      .requestProtected<SocialAgentTaskEventsResult>(`/social-agent/tasks/${taskId}/events`)
      .then(sanitizeSocialAgentResponse),
};

function sanitizeSocialAgentResponse<T>(value: T): T {
  return sanitizeDisplayValue(value) as T;
}

function normalizeSendCandidateMessageResult(
  taskId: number,
  data: SendCandidateMessageInput,
  messageAction: SocialAgentToolCall,
): SocialAgentSendCandidateMessageResult {
  const output = recordValue(messageAction.output);
  const candidate = recordValue(output.candidate);
  return {
    success: messageAction.status === 'succeeded',
    taskId,
    targetUserId: data.targetUserId ?? data.candidateUserId ?? 0,
    status: messageAction.status === 'succeeded' ? 'sent' : 'failed',
    messageId: stringValue(output.id ?? output.messageId),
    conversationId: stringValue(output.conversationId),
    candidateStatus: stringValue(candidate.status),
    messageAction,
  };
}

function normalizeConnectCandidateResult(
  taskId: number,
  data: ConnectCandidateInput,
  friendAction: SocialAgentToolCall,
): SocialAgentConnectCandidateResult {
  const output = recordValue(friendAction.output);
  const outputStatus = stringValue(output.status);
  const connected = friendAction.status === 'succeeded';
  return {
    success: connected,
    taskId,
    targetUserId: data.targetUserId ?? data.candidateUserId ?? 0,
    status: connected && isPendingToolOutputStatus(outputStatus) ? outputStatus : connected ? 'connected' : 'failed',
    following: connected && (outputStatus === 'following' || outputStatus === 'connected'),
    friendRequestId: stringValue(output.friendRequestId ?? output.followId ?? output.id),
    conversationId: stringValue(output.conversationId),
    friendAction,
  };
}

function isPendingToolOutputStatus(status: string | null): status is 'pending' | 'requested' {
  return status === 'pending' || status === 'requested';
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return cleanDisplayText(value, '') || null;
}

async function runSocialAgentStream(
  data: RunChatInput,
  onEvent: (event: SocialAgentChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SocialAgentChatRunResult> {
  const response = await api.fetchWithAuth('/social-agent/chat/stream', {
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
