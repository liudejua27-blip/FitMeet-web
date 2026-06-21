import type {
  AgentError,
  AgentErrorCode,
  AgentLifecycle,
  AgentStreamEvent,
} from './agentApi.types';
import type {
  UserFacingAgentLightStatus,
  UserFacingAgentRecoveryNotice,
  UserFacingAgentResponse,
} from '../../../api/socialAgentApi';

export function lifecycleFromLightStatus(status: UserFacingAgentLightStatus): AgentLifecycle {
  if (status.includes('Life Graph')) return 'reading_life_graph';
  if (status.includes('筛选')) return 'searching_candidates';
  if (status.includes('排除')) return 'ranking_matches';
  if (status.includes('安全')) return 'checking_safety';
  if (status.includes('开场白')) return 'drafting_opener';
  if (status.includes('确认')) return 'waiting_confirmation';
  if (status.includes('约练')) return 'waiting_confirmation';
  if (status.includes('更新')) return 'reading_life_graph';
  return 'analyzing_intent';
}

export function lifecycleFromResponse(response: UserFacingAgentResponse): AgentLifecycle {
  if (response.safeStatus.blocked) return 'checking_safety';
  if (response.pendingConfirmations.length > 0) return 'waiting_confirmation';
  if (
    response.cards.some(
      (card) =>
        card.status === 'waiting_confirmation' ||
        card.actions.some((action) => action.requiresConfirmation),
    )
  ) {
    return 'waiting_confirmation';
  }
  if (response.cards.some((card) => card.type === 'candidate_card')) return 'completed';
  if (response.cards.some((card) => card.type === 'safety_boundary')) return 'completed';
  return lifecycleFromLightStatus(response.lightStatus);
}

export function lifecycleFromStreamEvent(event: AgentStreamEvent): AgentLifecycle | null {
  if ('lifecycle' in event && event.lifecycle) return event.lifecycle;
  if (event.type === 'status') return lifecycleFromLightStatus(event.lightStatus);
  if (event.type === 'result') return lifecycleFromResponse(event.result);
  if (event.type === 'error') return 'failed';
  return null;
}

export function mapAgentError(error: unknown): AgentError {
  if (isAgentError(error)) return error;
  if (isAbortError(error)) {
    return createAgentError('ABORTED', '已停止这次查找', '我已经停止当前处理，刚才的需求还在这里。');
  }
  const recoveryNotice = recoveryNoticeFromError(error);
  if (recoveryNotice) {
    return {
      ...createAgentError(
        recoveryNotice.kind === 'interrupted' ? 'NETWORK_ERROR' : 'SERVER_ERROR',
        recoveryNotice.title,
        recoveryNotice.message,
      ),
      retryable: recoveryNotice.retryable,
      recoveryNotice,
    };
  }

  const explicitCode = agentErrorCodeFromUnknown(
    error && typeof error === 'object' ? (error as { code?: unknown }).code : null,
  ) ?? agentErrorCodeFromUnknown(
    error && typeof error === 'object' ? (error as { name?: unknown }).name : null,
  );
  if (explicitCode) {
    return createAgentError(explicitCode, undefined, undefined, statusCodeFromUnknown(error));
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = inferAgentErrorCode(message);
  return createAgentError(code, undefined, undefined, statusCodeFromMessage(message));
}

function recoveryNoticeFromError(error: unknown): UserFacingAgentRecoveryNotice | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as { recoveryNotice?: unknown }).recoveryNotice;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  const source = record.source;
  if (
    (kind !== 'failed' && kind !== 'timeout' && kind !== 'interrupted' && kind !== 'checkpoint') ||
    !title ||
    !message ||
    (source !== 'fallback_suppressed' && source !== 'checkpoint_recovery' && source !== 'stream_error')
  ) {
    return null;
  }
  return {
    kind,
    title,
    message,
    retryable: record.retryable !== false,
    source,
  };
}

export function createAgentError(
  code: AgentErrorCode,
  title?: string,
  message?: string,
  statusCode?: number,
): AgentError {
  const defaults = AGENT_ERROR_COPY[code];
  return {
    code,
    title: title ?? defaults.title,
    message: message ?? defaults.message,
    retryable: defaults.retryable,
    lifecycle: defaults.lifecycle,
    statusCode,
  };
}

const AGENT_ERROR_COPY: Record<
  AgentErrorCode,
  { title: string; message: string; retryable: boolean; lifecycle: AgentLifecycle }
> = {
  MISSING_INFO: {
    title: '先输入一句话',
    message: '可以直接提问；如果要找人或约练，再告诉我你的需求。',
    retryable: false,
    lifecycle: 'failed',
  },
  UNAUTHORIZED: {
    title: '需要先登录',
    message: '登录后我才能读取你的偏好、会话和安全设置。',
    retryable: false,
    lifecycle: 'failed',
  },
  RATE_LIMITED: {
    title: '请求有点频繁',
    message: '这次请求被限流了。刚才的内容还在，你可以稍后重试或继续补充。',
    retryable: true,
    lifecycle: 'failed',
  },
  SAFETY_BLOCKED: {
    title: '先保护好边界',
    message: '这个动作风险偏高，建议先站内聊几句，并选择公共场所。',
    retryable: false,
    lifecycle: 'checking_safety',
  },
  CONFIRMATION_REQUIRED: {
    title: '需要你确认一下',
    message: '确认后我再帮你执行下一步。',
    retryable: false,
    lifecycle: 'waiting_confirmation',
  },
  TASK_NOT_FOUND: {
    title: '会话已过期',
    message: '这次会话可能已经失效，可以开启一个新对话继续。',
    retryable: false,
    lifecycle: 'failed',
  },
  NETWORK_ERROR: {
    title: '网络暂时不稳定',
    message: '刚才连接不稳，当前需求还在。你可以继续，或者点重试从这里接着处理。',
    retryable: true,
    lifecycle: 'failed',
  },
  SERVER_ERROR: {
    title: '服务暂时没有准备好',
    message: '刚才连接中断了。当前需求还在，可以重试或继续补充。',
    retryable: true,
    lifecycle: 'failed',
  },
  ABORTED: {
    title: '已停止这次查找',
    message: '我已经停止当前处理，刚才的需求还在这里。',
    retryable: true,
    lifecycle: 'failed',
  },
};

function inferAgentErrorCode(message: string): AgentErrorCode {
  const lower = message.toLowerCase();
  if (/missing|缺少|还差|empty|不能为空/.test(lower)) return 'MISSING_INFO';
  if (/unauthorized|auth|登录|401|token/.test(lower)) return 'UNAUTHORIZED';
  if (/rate|too many|429|频繁/.test(lower)) return 'RATE_LIMITED';
  if (/safety|blocked|risk|边界|风险/.test(lower)) return 'SAFETY_BLOCKED';
  if (/confirm|confirmation|确认/.test(lower)) return 'CONFIRMATION_REQUIRED';
  if (/not found|404|过期|失效/.test(lower)) return 'TASK_NOT_FOUND';
  if (/network|fetch|offline|timeout|超时/.test(lower)) return 'NETWORK_ERROR';
  return 'SERVER_ERROR';
}

function statusCodeFromMessage(message: string): number | undefined {
  const match = message.match(/\b(4\d{2}|5\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function statusCodeFromUnknown(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) return statusCode;
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isFinite(status)) return status;
  return undefined;
}

function agentErrorCodeFromUnknown(value: unknown): AgentErrorCode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === 'MISSING_INFO' ||
    normalized === 'UNAUTHORIZED' ||
    normalized === 'RATE_LIMITED' ||
    normalized === 'SAFETY_BLOCKED' ||
    normalized === 'CONFIRMATION_REQUIRED' ||
    normalized === 'TASK_NOT_FOUND' ||
    normalized === 'NETWORK_ERROR' ||
    normalized === 'SERVER_ERROR' ||
    normalized === 'ABORTED'
  ) {
    return normalized;
  }
  return null;
}

function isAgentError(error: unknown): error is AgentError {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    typeof record.code === 'string' &&
    typeof record.title === 'string' &&
    typeof record.message === 'string' &&
    typeof record.retryable === 'boolean' &&
    typeof record.lifecycle === 'string'
  );
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (error instanceof Error) return error.name === 'AbortError';
  return false;
}
