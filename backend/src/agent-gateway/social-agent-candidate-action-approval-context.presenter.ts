import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentHydratedContext } from './social-agent-context-hydrator.service';

export type SocialAgentActionApprovalRuntimeContext = {
  taskContext?: Record<string, unknown> | null;
  hydratedContext?: SocialAgentHydratedContext | null;
  profile?: Record<string, unknown> | null;
  longTermSnapshot?: Record<string, unknown> | null;
  brainToolResults?: Array<Record<string, unknown>>;
  resumeContext?: Record<string, unknown> | null;
};

export function buildActionApprovalRuntimeContextSummary(
  context: SocialAgentActionApprovalRuntimeContext | null | undefined,
) {
  if (!context) return null;
  const taskContext = record(context.taskContext);
  const hydratedContext = record(context.hydratedContext);
  const pendingApprovals = Array.isArray(hydratedContext?.pendingApprovals)
    ? hydratedContext.pendingApprovals
    : [];
  const resume = resumeSummary(record(context.resumeContext));
  const summary = {
    schemaVersion: 'fitmeet.social_codex.action_context.v1',
    hasTaskContext: Boolean(taskContext),
    hasHydratedContext: Boolean(hydratedContext),
    ...(text(hydratedContext?.threadId)
      ? { threadId: text(hydratedContext?.threadId) }
      : {}),
    ...(typeof hydratedContext?.taskId === 'number'
      ? { taskId: hydratedContext.taskId }
      : {}),
    ...slotSummary(taskContext, hydratedContext),
    ...(pendingApprovals.length
      ? { pendingApprovalCount: pendingApprovals.length }
      : {}),
    ...(record(hydratedContext?.candidateActions)
      ? { hasCandidateActions: true }
      : {}),
    ...(record(hydratedContext?.lifeGraphSummary)
      ? { hasLifeGraphSummary: true }
      : {}),
    hasProfileContext: Boolean(record(context.profile)),
    hasLongTermMemoryContext: Boolean(record(context.longTermSnapshot)),
    brainToolResultCount: Array.isArray(context.brainToolResults)
      ? context.brainToolResults.length
      : 0,
    ...(resume ? { resume } : {}),
  };
  return hasRuntimeContextSummary(summary, resume) ? summary : null;
}

function slotSummary(
  taskContext: Record<string, unknown> | null,
  hydratedContext: Record<string, unknown> | null,
) {
  const taskSlotSummary = cleanDisplayText(taskContext?.taskSlotSummary, '')
    .trim()
    .slice(0, 240);
  const completedSlots = summarizeCompletedSlots(
    record(taskContext?.taskSlots) ?? record(hydratedContext?.taskSlots),
  );
  return {
    ...(taskSlotSummary ? { taskSlotSummary } : {}),
    ...(completedSlots.length ? { completedSlots } : {}),
  };
}

function resumeSummary(resumeContext: Record<string, unknown> | null) {
  if (!resumeContext) return null;
  return {
    mode: text(resumeContext.resumeMode),
    action: text(resumeContext.checkpointAction),
    sourceStepId: text(resumeContext.sourceStepId),
    hasCheckpoint: Boolean(resumeContext.checkpointId),
  };
}

function hasRuntimeContextSummary(
  summary: {
    hasTaskContext: boolean;
    hasHydratedContext: boolean;
    hasProfileContext: boolean;
    hasLongTermMemoryContext: boolean;
    brainToolResultCount: number;
  },
  resume: Record<string, unknown> | null,
) {
  return (
    summary.hasTaskContext ||
    summary.hasHydratedContext ||
    summary.hasProfileContext ||
    summary.hasLongTermMemoryContext ||
    summary.brainToolResultCount > 0 ||
    Boolean(resume)
  );
}

function summarizeCompletedSlots(taskSlots: Record<string, unknown> | null) {
  if (!taskSlots) return [];
  return Object.entries(taskSlots)
    .map(([key, raw]) => completedSlotSummary(key, raw))
    .filter((slot): slot is { key: string; value?: string; state?: string } =>
      Boolean(slot),
    )
    .slice(0, 12);
}

function completedSlotSummary(key: string, raw: unknown) {
  const slot = record(raw);
  const state = text(slot?.state);
  if (
    state &&
    !['answered', 'confirmed', 'completed', 'modified'].includes(state)
  ) {
    return null;
  }
  const value = slot ? slot.value : raw;
  const label = cleanDisplayText(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
    '',
  )
    .trim()
    .slice(0, 80);
  if (!label && !state) return null;
  return {
    key,
    ...(label ? { value: label } : {}),
    ...(state ? { state } : {}),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? cleanDisplayText(value, '').slice(0, 80)
    : null;
}
