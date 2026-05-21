import * as api from './client';
import { sanitizeDisplayValue } from '../lib/displayText';

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
  socialRequestId: number | null;
  userId: number;
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
  risk: { level: string; warnings: string[] };
  suggestedMessage: string;
  status?: string;
}

export interface SocialAgentChatRunResult {
  taskId: number;
  status: SocialAgentTaskStatus;
  visibleSteps: Array<{ id: string; label: string; status: SocialAgentStepStatus }>;
  assistantMessage: string;
  socialRequestDraft: (Record<string, unknown> & {
    agentTaskId: number;
    socialRequestId?: number | null;
    mode: 'draft';
    title?: string;
    description?: string;
    rawText?: string;
    city?: string;
    interestTags?: string[];
    activityType?: string;
  }) | null;
  candidates: SocialAgentChatCandidate[];
  approvalRequiredActions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
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

type SendCandidateMessageInput = {
  targetUserId: number;
  message: string;
  candidate?: Record<string, unknown>;
};

type SaveCandidateInput = {
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  targetUserId?: number | null;
  candidate?: Record<string, unknown>;
};

export const socialAgentApi = {
  runChat: (data: RunChatInput) =>
    api
      .request<SocialAgentChatRunResult>('/social-agent/chat/run', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  runChatStream: (
    data: RunChatInput,
    onEvent: (event: SocialAgentChatStreamEvent) => void,
    signal?: AbortSignal,
  ) => runSocialAgentStream(data, onEvent, signal),

  publishSocialRequest: (taskId: number, draft: Record<string, unknown>) =>
    api
      .request<{ taskId: number; socialRequest: Record<string, unknown> }>(
        `/social-agent/chat/tasks/${taskId}/publish-social-request`,
        {
          method: 'POST',
          body: JSON.stringify(draft),
        },
      )
      .then(sanitizeSocialAgentResponse),

  saveCandidate: (taskId: number, data: SaveCandidateInput) =>
    api
      .request<SocialAgentToolCall>(`/social-agent/chat/tasks/${taskId}/save-candidate`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      .then(sanitizeSocialAgentResponse),

  sendCandidateMessage: (taskId: number, data: SendCandidateMessageInput) =>
    api
      .request<SocialAgentToolCall>(`/social-agent/chat/tasks/${taskId}/send-message`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
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
  const token = api.getToken();
  const response = await fetch(`${api.API_BASE_URL}/social-agent/chat/stream`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
}

async function resolveStreamError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body.trim()) return response.statusText || 'Social Agent 请求失败。';

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
