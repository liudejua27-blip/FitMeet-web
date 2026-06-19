import type { AgentFlowPhase } from '../agentFlow.types';
import type { AntGuideState, AntGuideTarget } from '../../agent/ant-guide';
import type {
  AgentError,
  AgentErrorCode,
  AgentLifecycle,
  AgentStreamEvent,
} from './agentApi.types';
import type {
  UserFacingAgentLightStatus,
  UserFacingAgentResponse,
} from '../../../api/socialAgentApi';

export interface AgentLifecycleUiState {
  phase: AgentFlowPhase;
  antState: AntGuideState;
  antTarget: AntGuideTarget;
}

export const AGENT_LIFECYCLE_UI: Record<AgentLifecycle, AgentLifecycleUiState> = {
  received: { phase: 'userSubmitted', antState: 'thinking', antTarget: 'input' },
  idle: { phase: 'welcome', antState: 'idle', antTarget: 'input' },
  input_focused: { phase: 'inputFocused', antState: 'idle', antTarget: 'input' },
  user_submitted: { phase: 'userSubmitted', antState: 'thinking', antTarget: 'input' },
  analyzing_intent: { phase: 'analyzingIntent', antState: 'thinking', antTarget: 'input' },
  reading_life_graph: { phase: 'analyzingIntent', antState: 'thinking', antTarget: 'input' },
  searching_candidates: {
    phase: 'discoveringScenes',
    antState: 'discovering',
    antTarget: 'recommendation',
  },
  ranking_matches: {
    phase: 'discoveringScenes',
    antState: 'discovering',
    antTarget: 'recommendation',
  },
  checking_safety: { phase: 'safetyReminder', antState: 'reminding', antTarget: 'safetyCard' },
  drafting_opener: { phase: 'generatingOpener', antState: 'thinking', antTarget: 'recommendation' },
  waiting_confirmation: {
    phase: 'awaitingConfirmation',
    antState: 'confirming',
    antTarget: 'confirmButton',
  },
  completed: { phase: 'completed', antState: 'success', antTarget: null },
  failed: { phase: 'failed', antState: 'error', antTarget: 'input' },
};

export function mapLifecycleToFlow(lifecycle: AgentLifecycle): AgentLifecycleUiState {
  return AGENT_LIFECYCLE_UI[lifecycle];
}

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

  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = inferAgentErrorCode(message);
  return createAgentError(code, undefined, undefined, statusCodeFromMessage(message));
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
    message: '稍后再试一次，我会保留当前输入。',
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
    message: '这次请求没有顺利完成。你可以再试一次。',
    retryable: true,
    lifecycle: 'failed',
  },
  SERVER_ERROR: {
    title: '服务暂时没有准备好',
    message: '我已经保留当前对话。你可以稍后再试一次。',
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

function isAgentError(error: unknown): error is AgentError {
  return error !== null && typeof error === 'object' && 'code' in error && 'retryable' in error;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (error instanceof Error) return error.name === 'AbortError';
  return false;
}
