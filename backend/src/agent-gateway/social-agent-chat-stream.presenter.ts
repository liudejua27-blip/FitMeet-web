import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { cleanDisplayText } from '../common/display-text.util';
import type { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

const DEFAULT_STREAM_ERROR_MESSAGE =
  'FitMeet Agent 暂时没有顺利完成。我已经保留当前对话，请稍后再试。';
const TIMEOUT_STREAM_ERROR_MESSAGE =
  '这次处理时间有点久。我已经保留当前对话，你可以稍后再试。';
const TECHNICAL_ERROR_PATTERN =
  /\b(traceId|agentTrace|structuredIntent|planner|tool\s*call|toolCall|toolCalls|DeepSeek|OpenAI|SDK|database|QueryFailedError|TypeError|ReferenceError|stack|stack trace|UnhandledPromiseRejection)\b|工具调用|数据库字段|错误堆栈/i;

export type UserFacingStreamEvent =
  | SocialAgentEventV2
  | {
      type: 'status';
      lightStatus: string;
      lifecycle: UserFacingAgentLifecycle;
      taskId?: number;
    }
  | {
      type: 'progress';
      lifecycle: UserFacingAgentLifecycle;
      id: string;
      kind: 'analysis' | 'tool' | 'status';
      title: string;
      detail?: string;
      state: 'running' | 'done' | 'failed' | 'waiting';
      metadata?: Record<string, unknown>;
      snapshot?: {
        schemaVersion: 'fitmeet.step-snapshot.v1';
        observation: string[];
        critique: string;
        result: string;
      };
    }
  | {
      type: 'assistant_delta';
      lifecycle: UserFacingAgentLifecycle;
      messageId?: string;
      delta: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'assistant_done';
      lifecycle: UserFacingAgentLifecycle;
      messageId?: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'agent_loop_step';
      lifecycle: UserFacingAgentLifecycle;
      stepId: string;
      phase: string;
      agentName?: string | null;
      toolName?: string | null;
      status?: string | null;
      title: string;
      detail?: string;
    }
  | {
      type: 'tool_call';
      lifecycle: UserFacingAgentLifecycle;
      stepId: string;
      agentName?: string | null;
      toolName: string;
      title: string;
      detail?: string;
    }
  | {
      type: 'tool_result';
      lifecycle: UserFacingAgentLifecycle;
      stepId: string;
      agentName?: string | null;
      toolName: string;
      title: string;
      detail?: string;
      status?: string | null;
    }
  | {
      type: 'approval_required';
      lifecycle: 'waiting_confirmation';
      approvalId: number | string | null;
      actionType: string;
      summary: string;
      riskLevel: string;
    }
  | {
      type: 'result';
      lifecycle: UserFacingAgentLifecycle;
      result: ReturnType<
        UserFacingResponseSanitizerService['toUserFacingAgentResponse']
      >;
    }
  | {
      type: 'error';
      lifecycle: 'failed';
      code: 'AGENT_STREAM_FAILED';
      message: string;
      retryable: true;
    };

export type UserFacingAgentLifecycle =
  | 'received'
  | 'analyzing_intent'
  | 'reading_life_graph'
  | 'searching_candidates'
  | 'ranking_matches'
  | 'checking_safety'
  | 'drafting_opener'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed';

export function resolveUserPermissionMode(
  value: AgentTaskPermissionMode | undefined,
): AgentTaskPermissionMode {
  return value && Object.values(AgentTaskPermissionMode).includes(value)
    ? value
    : AgentTaskPermissionMode.Confirm;
}

export function agentLoopStepStreamEvent(step: {
  id?: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  agentName?: string | null;
  toolName?: string | null;
}): UserFacingStreamEvent {
  const lifecycle = lifecycleFromStep(step.label);
  const toolName = cleanMetadataString(step.toolName);
  return {
    type: 'agent_loop_step',
    lifecycle,
    stepId: safeStepId(step.id, step.label),
    phase: step.status === 'done' ? 'observe' : 'tool',
    agentName: cleanMetadataString(step.agentName),
    toolName,
    status: step.status,
    title: safeStepTitle(step.label),
    detail: lightStatusFromStep(step.label),
  };
}

export function toolCallStreamEvent(step: {
  id?: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  agentName?: string | null;
  toolName?: string | null;
}): UserFacingStreamEvent | null {
  const detail = lightStatusFromStep(step.label);
  const toolName =
    cleanMetadataString(step.toolName) ?? toolNameFromLabel(step.label);
  if (!toolName) return null;
  if (step.status === 'running' || step.status === 'pending') {
    return {
      type: 'tool_call',
      lifecycle: lifecycleFromStep(step.label),
      stepId: safeStepId(step.id, step.label),
      agentName: cleanMetadataString(step.agentName),
      toolName,
      title: '正在处理这一步',
      detail,
    };
  }
  return {
    type: 'tool_result',
    lifecycle: lifecycleFromStep(step.label),
    stepId: safeStepId(step.id, step.label),
    agentName: cleanMetadataString(step.agentName),
    toolName,
    title: step.status === 'failed' ? '这一步没成功' : '已整理结果',
    detail,
    status: step.status,
  };
}

export function lightStatusFromStep(label: string): string {
  if (/Life Graph|画像|profile/i.test(label)) {
    return '正在结合你的 Life Graph';
  }
  if (/筛选|候选|匹配|search|candidate/i.test(label)) {
    return '正在筛选合适的人';
  }
  if (/时间|排除|rank/i.test(label)) {
    return '正在排除时间不合适的人';
  }
  if (/安全|边界|guardrail|risk/i.test(label)) {
    return '正在检查安全边界';
  }
  if (/开场白|message|opener/i.test(label)) {
    return '正在生成开场白';
  }
  if (/确认|approval|confirm/i.test(label)) {
    return '正在等待你确认';
  }
  if (/活动|约练|activity/i.test(label)) {
    return '正在创建约练计划';
  }
  return '正在理解你的需求';
}

function safeStepTitle(label: string): string {
  const lightStatus = lightStatusFromStep(label);
  if (TECHNICAL_ERROR_PATTERN.test(label)) return lightStatus;
  const cleaned = cleanDisplayText(label);
  if (!cleaned || TECHNICAL_ERROR_PATTERN.test(cleaned)) return lightStatus;
  return cleaned.length > 32 ? lightStatus : cleaned;
}

export function lifecycleFromStep(label: string): UserFacingAgentLifecycle {
  if (/Life Graph|画像|profile/i.test(label)) {
    return 'reading_life_graph';
  }
  if (/筛选|候选|匹配|search|candidate/i.test(label)) {
    return 'searching_candidates';
  }
  if (/时间|排除|rank/i.test(label)) {
    return 'ranking_matches';
  }
  if (/安全|边界|guardrail|risk/i.test(label)) {
    return 'checking_safety';
  }
  if (/开场白|message|opener/i.test(label)) {
    return 'drafting_opener';
  }
  if (/确认|approval|confirm/i.test(label)) {
    return 'waiting_confirmation';
  }
  return 'analyzing_intent';
}

export function lifecycleFromUserFacingResponse(
  response: ReturnType<
    UserFacingResponseSanitizerService['toUserFacingAgentResponse']
  >,
): UserFacingAgentLifecycle {
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
  if (
    response.safeStatus.level === 'medium' ||
    response.safeStatus.level === 'high' ||
    response.safeStatus.level === 'blocked' ||
    response.safeStatus.requiredConfirmations.length > 0
  ) {
    return 'checking_safety';
  }
  return 'completed';
}

export function progressFromStep(step: {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  agentName?: string | null;
  toolName?: string | null;
  snapshot?: {
    schemaVersion: 'fitmeet.step-snapshot.v1';
    observation: string[];
    critique: string;
    result: string;
  };
}): UserFacingStreamEvent {
  const key = `${step.id} ${step.label}`.toLowerCase();
  const agentName = cleanMetadataString(step.agentName);
  const toolName = cleanMetadataString(step.toolName);
  const isTool =
    Boolean(toolName) ||
    /tool|call|search|candidate|match|activity|message|opener|approval|confirm|life graph|profile|risk|guardrail|rank|filter/i.test(
      key,
    );
  return {
    type: 'progress',
    lifecycle: lifecycleFromStep(step.label),
    id: safeStepId(step.id, step.label),
    kind: isTool ? 'tool' : 'analysis',
    title: isTool ? '正在处理这一步' : '正在理解你的需求',
    detail: lightStatusFromStep(step.label),
    state:
      step.status === 'done'
        ? 'done'
        : step.status === 'failed'
          ? 'failed'
          : 'running',
    metadata: {
      stepId: safeStepId(step.id, step.label),
      agentName,
      toolName,
    },
    snapshot: step.snapshot,
  };
}

function safeStepId(id: string | undefined, label: string): string {
  const explicit = cleanStepId(id);
  if (explicit) return explicit;
  if (TECHNICAL_ERROR_PATTERN.test(label)) return 'step-analysis';
  const fallback = cleanStepId(label);
  return fallback ? `step-${fallback}` : 'step-unknown';
}

function cleanStepId(value: string | undefined): string | null {
  if (!value) return null;
  if (TECHNICAL_ERROR_PATTERN.test(value)) return null;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || null;
}

function cleanMetadataString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function toolNameFromLabel(label: string): string | null {
  if (/候选|匹配|search|candidate/i.test(label))
    return 'search_real_candidates';
  if (/Life Graph|画像|profile/i.test(label)) return 'update_life_graph';
  if (/开场白|message|opener/i.test(label)) return 'draft_or_send_message';
  if (/确认|approval|confirm/i.test(label)) return 'approval_gate';
  if (/活动|约练|activity/i.test(label)) return 'meet_loop_state_transition';
  if (/安全|边界|guardrail|risk/i.test(label)) return 'safety_policy_check';
  return null;
}

export function userFacingStreamErrorEvent(
  error: unknown,
): UserFacingStreamEvent {
  return {
    type: 'error',
    lifecycle: 'failed',
    code: 'AGENT_STREAM_FAILED',
    message: userFacingStreamErrorMessage(error),
    retryable: true,
  };
}

function userFacingStreamErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  if (/timeout|timed?\s*out|abort|aborted|deepseek_timeout/i.test(message)) {
    return TIMEOUT_STREAM_ERROR_MESSAGE;
  }

  const cleaned = cleanDisplayText(message, '').trim();
  if (!cleaned) return DEFAULT_STREAM_ERROR_MESSAGE;
  if (TECHNICAL_ERROR_PATTERN.test(cleaned))
    return DEFAULT_STREAM_ERROR_MESSAGE;
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(cleaned))
    return DEFAULT_STREAM_ERROR_MESSAGE;
  return cleaned.length > 140 ? DEFAULT_STREAM_ERROR_MESSAGE : cleaned;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}
