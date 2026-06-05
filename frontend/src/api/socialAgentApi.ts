import * as api from './client';
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
  | 'candidate.generate_opener'
  | 'opener.confirm_send'
  | 'opener.regenerate'
  | 'activity.confirm_create'
  | 'activity.modify_time'
  | 'activity.modify_location'
  | 'activity.check_in'
  | 'activity.complete'
  | 'activity.upload_proof'
  | 'activity.view_detail'
  | 'review.submit'
  | 'life_graph.accept_update'
  | 'life_graph.reject_update';

export interface UserFacingAgentResponse {
  assistantMessage: string;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
  permissionMode: SocialAgentPermissionMode;
}

export type UserFacingAgentProgressKind = 'analysis' | 'tool' | 'status';

export interface UserFacingAgentProgressEvent {
  type: 'progress';
  id: string;
  kind: UserFacingAgentProgressKind;
  title: string;
  detail?: string;
  state: 'running' | 'done' | 'failed' | 'waiting';
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
    | 'refine_request';
  schemaAction?: FitMeetAgentSchemaAction;
  loopStage?: FitMeetAgentLoopStage;
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

export type UserFacingAgentStreamEvent =
  | { type: 'status'; lightStatus: UserFacingAgentLightStatus }
  | UserFacingAgentProgressEvent
  | { type: 'result'; result: UserFacingAgentResponse }
  | { type: 'error'; message: string };

type RunChatInput = {
  goal: string;
  permissionMode: SocialAgentPermissionMode;
  idempotencyKey?: string;
};

type RouteMessageInput = {
  message: string;
  taskId?: number | null;
  hasCandidates?: boolean;
};

type AgentCardActionInput = {
  taskId: number;
  action: FitMeetAgentSchemaAction;
  payload?: Record<string, unknown>;
};

export const socialAgentApi = {
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

  routeMessage: (data: RouteMessageInput) =>
    api
      .requestProtected<UserFacingAgentResponse>('/social-agent/chat/route-message', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  performAction: (data: AgentCardActionInput) =>
    api
      .requestProtected<UserFacingAgentResponse>(
        `/social-agent/chat/tasks/${data.taskId}/actions`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: data.action,
            payload: data.payload ?? {},
          }),
        },
      )
      .then(sanitizeSocialAgentResponse),

  runUserFacingStream: (
    data: RunChatInput,
    onEvent: (event: UserFacingAgentStreamEvent) => void,
    signal?: AbortSignal,
  ) => runUserFacingAgentStream(data, onEvent, signal),
};

function sanitizeSocialAgentResponse<T>(value: T): T {
  return sanitizeDisplayValue(value) as T;
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
