import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import type { SocialAgentPlannerResult } from './social-agent-planner.service';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentAsyncRunStatus,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';

type VisibleStepLabeler = (id: string, label: string) => string;

export function createSocialAgentRunId(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `sar_${Date.now()}_${randomSuffix}`;
}

export function socialAgentSafetyBlockedStep(): SocialAgentVisibleStep {
  return {
    id: 'main_agent_safety',
    label: 'Main Agent 已拦截不安全请求',
    status: 'failed',
  };
}

export function socialAgentClarificationStep(
  label: string,
): SocialAgentVisibleStep {
  return {
    id: 'clarify',
    label,
    status: 'done',
  };
}

export function buildSocialAgentBlockedRunResult(input: {
  task: AgentTask;
  visibleSteps: SocialAgentVisibleStep[];
  alphaTurn: FitMeetAlphaTurnDecision;
  events: Array<Record<string, unknown>>;
}): SocialAgentChatRunResult {
  const { alphaTurn, task, visibleSteps } = input;
  return {
    taskId: task.id,
    status: task.status,
    visibleSteps,
    assistantMessage:
      alphaTurn.assistantMessage ||
      '这个请求不符合 FitMeet 的安全边界，我不能继续执行。',
    emptyReason: null,
    message: null,
    debugReasons: null,
    socialRequestDraft: null,
    candidates: [],
    approvalRequiredActions: [],
    events: input.events,
    cards: alphaTurn.cards,
    safety: alphaTurn.safety,
    traceId: alphaTurn.traceId,
    agentTrace: alphaTurn.agentTrace,
    structuredIntent: alphaTurn.structuredIntent,
  };
}

export function buildSocialAgentClarificationRunResult(input: {
  task: AgentTask;
  visibleSteps: SocialAgentVisibleStep[];
  assistantMessage: string;
  alphaTurn?: FitMeetAlphaTurnDecision;
  events: Array<Record<string, unknown>>;
}): SocialAgentChatRunResult {
  const { alphaTurn, task } = input;
  return {
    taskId: task.id,
    status: task.status,
    visibleSteps: input.visibleSteps,
    assistantMessage: input.assistantMessage,
    emptyReason: null,
    message: null,
    debugReasons: null,
    socialRequestDraft: null,
    candidates: [],
    approvalRequiredActions: [],
    events: input.events,
    cards: alphaTurn?.cards ?? [],
    safety: alphaTurn?.safety,
    traceId: alphaTurn?.traceId,
    agentTrace: alphaTurn?.agentTrace,
    structuredIntent: alphaTurn?.structuredIntent,
  };
}

export function withSocialAgentStoredRun(
  result: Record<string, unknown> | null | undefined,
  run: SocialAgentAsyncRunSnapshot,
): Record<string, unknown> {
  const base = isRecord(result) ? result : {};
  return {
    ...base,
    latestRunId: run.runId,
    chatRuns: {
      ...socialAgentStoredRunMap(base),
      [run.runId]: sanitizeForDisplay(run),
    },
  };
}

export function readSocialAgentStoredRun(
  task: AgentTask,
  runId: string,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentAsyncRunSnapshot | null {
  const raw = socialAgentStoredRunMap(task.result)[runId];
  if (!isRecord(raw)) return null;
  const status = normalizeSocialAgentRunStatus(raw.status);
  return {
    taskId: numberValue(raw.taskId) ?? task.id,
    runId,
    status,
    phase: cleanDisplayText(raw.phase, status),
    message: cleanDisplayText(raw.message, ''),
    visibleSteps: readSocialAgentVisibleSteps(
      raw.visibleSteps,
      visibleStepLabel,
    ),
    queuedAt: cleanDisplayText(raw.queuedAt, '') || new Date().toISOString(),
    startedAt: cleanDisplayText(raw.startedAt, '') || null,
    updatedAt: cleanDisplayText(raw.updatedAt, '') || new Date().toISOString(),
    completedAt: cleanDisplayText(raw.completedAt, '') || null,
    failedAt: cleanDisplayText(raw.failedAt, '') || null,
    pollAfterMs: numberValue(raw.pollAfterMs) ?? 1500,
    error: isRecord(raw.error) ? raw.error : null,
    replan: isRecord(raw.replan)
      ? (raw.replan as unknown as SocialAgentPlannerResult)
      : null,
    result: isRecord(raw.result)
      ? (raw.result as unknown as
          | SocialAgentChatRunResult
          | SocialAgentChatReplanRunResult)
      : null,
  };
}

export function readLatestSocialAgentStoredRun(
  task: AgentTask,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentAsyncRunSnapshot | null {
  const result = isRecord(task.result) ? task.result : {};
  const latestRunId = cleanDisplayText(result.latestRunId, '');
  if (latestRunId) {
    const latest = readSocialAgentStoredRun(
      task,
      latestRunId,
      visibleStepLabel,
    );
    if (latest) return latest;
  }
  return (
    Object.keys(socialAgentStoredRunMap(task.result))
      .map((runId) => readSocialAgentStoredRun(task, runId, visibleStepLabel))
      .filter((run): run is SocialAgentAsyncRunSnapshot => !!run)
      .sort(
        (a, b) =>
          Date.parse(b.updatedAt || b.queuedAt) -
          Date.parse(a.updatedAt || a.queuedAt),
      )[0] ?? null
  );
}

function socialAgentStoredRunMap(result: unknown): Record<string, unknown> {
  const base = isRecord(result) ? result : {};
  return isRecord(base.chatRuns) ? base.chatRuns : {};
}

function readSocialAgentVisibleSteps(
  value: unknown,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentVisibleStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step) => isRecord(step))
    .map((step) => {
      const id = cleanDisplayText(step.id, '');
      return {
        id,
        label: visibleStepLabel(
          id,
          cleanDisplayText(step.label, '正在处理任务'),
        ),
        status: normalizeSocialAgentStepStatus(step.status),
      };
    })
    .filter((step) => step.id);
}

function normalizeSocialAgentRunStatus(
  value: unknown,
): SocialAgentAsyncRunStatus {
  if (value === 'running' || value === 'completed' || value === 'failed') {
    return value;
  }
  return 'queued';
}

function normalizeSocialAgentStepStatus(
  value: unknown,
): SocialAgentVisibleStep['status'] {
  if (value === 'running' || value === 'done' || value === 'failed') {
    return value;
  }
  return 'pending';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
