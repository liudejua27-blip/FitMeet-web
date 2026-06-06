import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import {
  buildApprovalActions,
  buildRecommendationAssistantMessage,
} from './social-agent-chat-result.presenter';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatCandidate,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
  SocialAgentRequestDraft,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';
import { readSocialAgentTimelineCandidates } from './social-agent-chat-timeline.presenter';
import type { CandidatePoolDebugReasons } from './social-agent-candidate-pool.service';

export { buildSocialAgentTimelineSnapshot } from './social-agent-chat-timeline.presenter';

type VisibleStepLabeler = (id: string, label: string) => string;

export function readSocialAgentStoredCandidateSummaries(
  task: AgentTask,
): Array<Record<string, unknown>> {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  const candidates = Array.isArray(shortTerm.candidates)
    ? shortTerm.candidates
    : [];
  if (candidates.length > 0) {
    return candidates.filter(
      (candidate): candidate is Record<string, unknown> => isRecord(candidate),
    );
  }
  const chat = isRecord(memory.socialAgentChat) ? memory.socialAgentChat : {};
  return Array.isArray(chat.candidates)
    ? chat.candidates.filter(
        (candidate): candidate is Record<string, unknown> =>
          isRecord(candidate),
      )
    : [];
}

export function readSocialAgentRestorableResult(input: {
  task: AgentTask;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  events: Array<Record<string, unknown>>;
  visibleStepLabel: VisibleStepLabeler;
}): SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null {
  const { task, latestRun, events, visibleStepLabel } = input;
  if (latestRun?.result && isRecord(latestRun.result)) {
    const runResult = latestRun.result as
      | SocialAgentChatRunResult
      | SocialAgentChatReplanRunResult;
    return sanitizeForDisplay({
      ...runResult,
      taskId: task.id,
      status: task.status,
      visibleSteps:
        runResult.visibleSteps?.length > 0
          ? runResult.visibleSteps
          : latestRun.visibleSteps,
      events,
    }) as SocialAgentChatRunResult | SocialAgentChatReplanRunResult;
  }

  return readResultFromTaskMemory(task, events, visibleStepLabel);
}

function readResultFromTaskMemory(
  task: AgentTask,
  events: Array<Record<string, unknown>>,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentChatRunResult | null {
  const result = isRecord(task.result) ? task.result : {};
  const chatRun = isRecord(result.chatRun) ? result.chatRun : {};
  const memory = isRecord(task.memory) ? task.memory : {};
  const chat = isRecord(memory.socialAgentChat) ? memory.socialAgentChat : {};
  const eventResult = readCandidateResultFromEvents(task, events);
  const rawDraft = isRecord(chatRun.socialRequestDraft)
    ? chatRun.socialRequestDraft
    : isRecord(chat.socialRequestDraft)
      ? chat.socialRequestDraft
      : isRecord(eventResult?.socialRequestDraft)
        ? eventResult.socialRequestDraft
        : null;
  const storedCandidates = readSocialAgentTimelineCandidates(
    task,
    readSocialAgentStoredCandidateSummaries(task),
  );
  const candidates =
    storedCandidates.length > 0
      ? storedCandidates
      : (eventResult?.candidates ?? []);

  if (!rawDraft && candidates.length === 0) return null;
  const socialRequestDraft = rawDraft
    ? ({
        ...rawDraft,
        agentTaskId: task.id,
        socialRequestId:
          numberValue(rawDraft.socialRequestId) ??
          numberValue(chatRun.socialRequestId) ??
          numberValue(chat.socialRequestId) ??
          null,
        mode: 'draft',
      } as SocialAgentRequestDraft)
    : null;
  return {
    taskId: task.id,
    status: task.status,
    visibleSteps: readStoredVisibleSteps(task, visibleStepLabel),
    assistantMessage:
      cleanDisplayText(chatRun.message, '') ||
      cleanDisplayText(eventResult?.message, '') ||
      buildRecommendationAssistantMessage(candidates),
    emptyReason:
      cleanDisplayText(chatRun.emptyReason, '') === 'no_real_candidates'
        ? 'no_real_candidates'
        : cleanDisplayText(eventResult?.emptyReason, '') ===
            'no_real_candidates'
          ? 'no_real_candidates'
          : null,
    message:
      cleanDisplayText(chatRun.message, '') ||
      cleanDisplayText(eventResult?.message, '') ||
      null,
    debugReasons: isRecord(chatRun.debugReasons)
      ? (chatRun.debugReasons as CandidatePoolDebugReasons)
      : null,
    socialRequestDraft,
    candidates,
    approvalRequiredActions: socialRequestDraft
      ? buildApprovalActions(task.id, socialRequestDraft, candidates)
      : [],
    events,
  };
}

function readCandidateResultFromEvents(
  task: AgentTask,
  events: Array<Record<string, unknown>>,
): {
  candidates: SocialAgentChatCandidate[];
  socialRequestDraft: Record<string, unknown> | null;
  message: string | null;
  emptyReason: string | null;
} | null {
  const event = [...events]
    .reverse()
    .find(
      (item) =>
        cleanDisplayText(item.eventType, '') ===
        'social_agent.candidates.returned',
    );
  if (!event || !isRecord(event.payload)) return null;
  const payload = event.payload;
  return {
    candidates: readSocialAgentTimelineCandidates(task, payload.candidates),
    socialRequestDraft: isRecord(payload.socialRequestDraft)
      ? payload.socialRequestDraft
      : null,
    message: cleanDisplayText(payload.message, '') || null,
    emptyReason: cleanDisplayText(payload.emptyReason, '') || null,
  };
}

function readStoredVisibleSteps(
  task: AgentTask,
  visibleStepLabel: VisibleStepLabeler,
): SocialAgentVisibleStep[] {
  const memory = isRecord(task.memory) ? task.memory : {};
  const shortTerm = isRecord(memory.shortTerm) ? memory.shortTerm : {};
  const steps = Array.isArray(shortTerm.steps) ? shortTerm.steps : [];
  return steps
    .filter((step): step is Record<string, unknown> => isRecord(step))
    .map((step) => ({
      id: cleanDisplayText(step.id, ''),
      label: visibleStepLabel(
        cleanDisplayText(step.id, ''),
        cleanDisplayText(step.label, '正在处理任务'),
      ),
      status: normalizeStepStatus(step.status),
    }))
    .filter((step) => step.id);
}

function normalizeStepStatus(value: unknown): SocialAgentVisibleStep['status'] {
  if (value === 'done' || value === 'failed' || value === 'pending') {
    return value;
  }
  return 'running';
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
