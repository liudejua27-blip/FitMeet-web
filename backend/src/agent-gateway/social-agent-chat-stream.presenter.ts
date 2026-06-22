import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { cleanDisplayText } from '../common/display-text.util';
import type { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import type { UserFacingAgentRecoveryNotice } from './user-facing-agent-response';
import type { SocialAgentEventV2 } from './social-agent-event-v2.types';

const DEFAULT_STREAM_ERROR_MESSAGE =
  '连接刚才中断了。这段需求还在，可以直接继续。';
const TIMEOUT_STREAM_ERROR_MESSAGE =
  '处理比平时久一点。这段需求还在，可以继续。';
const GENERIC_RECOVERY_PATTERN =
  /保留当前(?:对话|方向|上下文|需求)|这段需求还在|刚才的位置|稍后继续|稍后再试|暂时没有顺利完成|连接中断|连接恢复|处理时间有点久|可以稍后再试|我已经恢复了(?:上一次|这段|当前)|我已经恢复了这段(?:对话|约练任务|任务)|我可以继续上次的话题，也可以重新开始|从已保存的(?:步骤|工具步骤|Agent 状态)|继续刚才保存的 Agent 步骤|原始目标|已从刚才的确认点继续处理/;
const TECHNICAL_ERROR_PATTERN =
  /\b(traceId|agentTrace|structuredIntent|planner|tool\s*call|toolCall|toolCalls|DeepSeek|OpenAI|SDK|database|QueryFailedError|BadRequestException|ForbiddenException|NotFoundException|InternalServerErrorException|TypeError|ReferenceError|stack|stack trace|UnhandledPromiseRejection|agentConnectionId|connectionId|taskId|runId|seq|SQL|Postgres|TypeORM|foreign key|constraint|relation .* does not exist|column .* does not exist|violates .* constraint)\b|工具调用|数据库字段|错误堆栈/i;

export type UserFacingStreamEvent =
  | SocialAgentEventV2
  | {
      type: 'status';
      lightStatus: string;
      lifecycle: UserFacingAgentLifecycle;
      taskId?: number;
      threadId?: string | number | null;
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
      recoveryNotice: UserFacingAgentRecoveryNotice;
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
  const runningTitle = lightStatusFromStep(step.label);
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
      title: runningTitle,
    };
  }
  const doneTitle =
    step.status === 'failed' ? '刚才连接不稳' : completedStatusFromStep(step.label);
  return {
    type: 'tool_result',
    lifecycle: lifecycleFromStep(step.label),
    stepId: safeStepId(step.id, step.label),
    agentName: cleanMetadataString(step.agentName),
    toolName,
    title: doneTitle,
    detail: step.status === 'failed' ? '这段需求还在，可以继续处理。' : undefined,
    status: step.status,
  };
}

export function lightStatusFromStep(label: string): string {
  if (/Life Graph|画像|profile/i.test(label)) {
    return '正在读取你的偏好';
  }
  if (/筛选|候选|匹配|search|candidate/i.test(label)) {
    return '正在筛选公开可发现的人';
  }
  if (/时间|排除|rank/i.test(label)) {
    return '正在整理合适机会';
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
    return '正在整理约练方案';
  }
  return '正在理解你的需求';
}

function completedStatusFromStep(label: string): string {
  if (/Life Graph|画像|profile/i.test(label)) {
    return '已读取你的偏好';
  }
  if (/筛选|候选|匹配|search|candidate/i.test(label)) {
    return '已筛选公开可发现的人';
  }
  if (/时间|排除|rank/i.test(label)) {
    return '已整理合适机会';
  }
  if (/安全|边界|guardrail|risk/i.test(label)) {
    return '已检查安全边界';
  }
  if (/开场白|message|opener/i.test(label)) {
    return '已生成开场白';
  }
  if (/确认|approval|confirm/i.test(label)) {
    return '已处理你的确认';
  }
  if (/活动|约练|activity/i.test(label)) {
    return '已整理约练方案';
  }
  return '已理解你的需求';
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
    title:
      step.status === 'failed'
        ? '刚才连接不稳'
        : step.status === 'done'
          ? completedStatusFromStep(step.label)
          : isTool
            ? lightStatusFromStep(step.label)
            : '正在理解你的需求',
    detail: step.status === 'failed' ? '这段需求还在，可以继续处理。' : undefined,
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
  const message = userFacingStreamErrorMessage(error);
  return {
    type: 'error',
    lifecycle: 'failed',
    code: 'AGENT_STREAM_FAILED',
    message,
    retryable: true,
    recoveryNotice: userFacingStreamRecoveryNotice(error, message),
  };
}

export function shouldStreamFallbackAssistantText(value: unknown): boolean {
  const text = cleanDisplayText(value, '').trim();
  if (!text) return false;
  return !GENERIC_RECOVERY_PATTERN.test(text);
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

function userFacingStreamRecoveryNotice(
  error: unknown,
  message: string,
): UserFacingAgentRecoveryNotice {
  const raw = errorMessage(error);
  if (/timeout|timed?\s*out|deepseek_timeout|处理时间有点久|超时/i.test(raw)) {
    return {
      kind: 'timeout',
      title: '这段需求还在',
      message: '刚才处理比平时久一点，可以继续处理；不会重复执行已确认的高风险动作。',
      retryable: true,
      source: 'stream_error',
    };
  }
  if (/abort|aborted|连接中断|连接恢复/i.test(raw)) {
    return {
      kind: 'interrupted',
      title: '刚才连接中断了',
      message: '这段需求还在，可以继续补充新的要求，我会接着处理。',
      retryable: true,
      source: 'stream_error',
    };
  }
  return {
    kind: 'failed',
    title: '连接中断了，可以继续',
    message:
      shouldStreamFallbackAssistantText(message) && !TECHNICAL_ERROR_PATTERN.test(message)
        ? message
        : '这段需求还在，可以继续处理；不会重复执行已确认的高风险动作。',
    retryable: true,
    source: 'stream_error',
  };
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
