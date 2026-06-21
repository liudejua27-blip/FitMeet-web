import type {
  SocialAgentEventV2,
  SocialAgentEventV2Stage,
} from './social-agent-event-v2.types';
import {
  sanitizeSocialCodexProcessDetail,
  sanitizeSocialCodexProcessTitle,
} from './social-codex-public-process-text';

export type SocialCodexRunSummaryState =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed';

export type SocialCodexRunSummary = {
  state: SocialCodexRunSummaryState;
  title: string;
  detail: string | null;
  displayMode: 'covering_status';
  updateModel: 'latest_state';
  defaultVisibleCount: 1;
  historyVisibility: 'collapsed';
  currentStage: SocialAgentEventV2Stage | null;
  currentEventId: string | null;
  currentSeq: number | null;
  pendingApproval: boolean;
  candidateCount: number | null;
  activityCount: number | null;
  hasOpportunityCard: boolean;
  savedMemory: boolean;
  visibleStepCount: number;
  expandable: boolean;
};

export function summarizeSocialCodexRun(
  events: SocialAgentEventV2[],
): SocialCodexRunSummary {
  const visibleEvents = events.filter(
    (event) => event.visibility === 'user_visible',
  );
  const displayEvents = visibleEvents.filter(
    (event) => event.type !== 'assistant.delta' && event.display?.title,
  );
  const uniqueDisplayEvents = uniqueUserVisibleDisplayEvents(displayEvents);
  const pendingApprovalEvent = findPendingApprovalEvent(visibleEvents);
  const current =
    pendingApprovalEvent ??
    uniqueDisplayEvents.at(-1) ??
    displayEvents.at(-1) ??
    null;
  const terminal = [...visibleEvents]
    .reverse()
    .find(
      (event) => event.type === 'run.completed' || event.type === 'run.failed',
    );
  const pendingApproval = Boolean(pendingApprovalEvent);
  const state = summarizeState({ current, terminal, pendingApproval });
  const candidateSearch = [...visibleEvents]
    .reverse()
    .find((event) => event.type === 'candidate_search.done');
  const candidateCount = numberFromPayload(candidateSearch, 'candidateCount');
  const activityCount = numberFromPayload(candidateSearch, 'activityCount');
  const title = sanitizeSocialCodexProcessTitle(
    current?.display?.title ?? fallbackTitle(state),
    {
      type: current?.type ?? terminal?.type ?? null,
      stage: current?.stage ?? terminal?.stage ?? null,
      state,
      candidateCount,
      activityCount,
    },
  );
  const detail =
    sanitizeSocialCodexProcessDetail(
      current?.display?.detail ?? fallbackDetail(state),
      {
        type: current?.type ?? terminal?.type ?? null,
        stage: current?.stage ?? terminal?.stage ?? null,
        state,
        candidateCount,
        activityCount,
      },
    ) ?? fallbackDetail(state);

  return {
    state,
    title,
    detail,
    displayMode: 'covering_status',
    updateModel: 'latest_state',
    defaultVisibleCount: 1,
    historyVisibility: 'collapsed',
    currentStage: current?.stage ?? terminal?.stage ?? null,
    currentEventId: current?.eventId ?? terminal?.eventId ?? null,
    currentSeq: current?.seq ?? terminal?.seq ?? null,
    pendingApproval,
    candidateCount,
    activityCount,
    hasOpportunityCard: visibleEvents.some(
      (event) => event.type === 'opportunity_card.created',
    ),
    savedMemory: visibleEvents.some((event) => event.type === 'memory.saved'),
    visibleStepCount: uniqueDisplayEvents.length,
    expandable: uniqueDisplayEvents.length > 1,
  };
}

function uniqueUserVisibleDisplayEvents(
  events: SocialAgentEventV2[],
): SocialAgentEventV2[] {
  const seen = new Set<string>();
  const unique: SocialAgentEventV2[] = [];
  for (const event of events) {
    const title = sanitizeSocialCodexProcessTitle(event.display?.title ?? '', {
      type: event.type,
      stage: event.stage,
      state: event.display?.state ?? 'running',
    });
    const detail =
      sanitizeSocialCodexProcessDetail(event.display?.detail ?? null, {
        type: event.type,
        stage: event.stage,
        state: event.display?.state ?? 'running',
      }) ?? '';
    const key = [
      event.display?.state ?? 'running',
      title.trim().toLowerCase(),
      detail.trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

function summarizeState(input: {
  current: SocialAgentEventV2 | null;
  terminal: SocialAgentEventV2 | undefined;
  pendingApproval: boolean;
}): SocialCodexRunSummaryState {
  if (input.terminal?.type === 'run.failed') return 'failed';
  if (input.pendingApproval) return 'waiting';
  if (input.terminal?.display?.state === 'failed') return 'failed';
  if (input.terminal?.display?.state === 'waiting') return 'waiting';
  if (input.terminal?.type === 'run.completed') return 'completed';
  if (input.current?.display?.state === 'failed') return 'failed';
  if (input.current?.display?.state === 'waiting') return 'waiting';
  return 'running';
}

function fallbackTitle(state: SocialCodexRunSummaryState): string {
  if (state === 'waiting') return '需要你确认后继续';
  if (state === 'completed') return '已整理当前进度';
  if (state === 'failed') return '连接中断了，可以继续';
  return '正在整理你的需求';
}

function fallbackDetail(state: SocialCodexRunSummaryState): string | null {
  if (state === 'waiting') return '确认后我会接着处理。';
  if (state === 'failed')
    return '我保留了这段需求，可以继续处理或补充一句新的要求。';
  return null;
}

function findPendingApprovalEvent(
  events: SocialAgentEventV2[],
): SocialAgentEventV2 | null {
  return (
    [...events].reverse().find((event, reverseIndex) => {
      if (event.type !== 'approval.required') return false;
      const index = events.length - 1 - reverseIndex;
      return !events
        .slice(index + 1)
        .some(
          (candidate) =>
            candidate.type === 'approval.resolved' &&
            sameApprovalIdentity(event, candidate),
        );
    }) ?? null
  );
}

function sameApprovalIdentity(
  required: SocialAgentEventV2,
  resolved: SocialAgentEventV2,
): boolean {
  const requiredKey = approvalIdentity(required);
  const resolvedKey = approvalIdentity(resolved);
  return Boolean(requiredKey && resolvedKey && requiredKey === resolvedKey);
}

function approvalIdentity(event: SocialAgentEventV2): string | null {
  const payload = isRecord(event.payload) ? event.payload : {};
  const approvalId = scalar(payload.approvalId);
  if (approvalId) return `approval:${approvalId}`;
  const checkpointId =
    scalar(payload.checkpointId) ??
    (isRecord(payload.resumeCursor)
      ? scalar(payload.resumeCursor.checkpointId)
      : null);
  if (checkpointId) return `checkpoint:${checkpointId}`;
  const actionType = scalar(payload.actionType);
  if (actionType) return `action:${actionType}`;
  return null;
}

function numberFromPayload(
  event: SocialAgentEventV2 | undefined,
  key: string,
): number | null {
  if (!isRecord(event?.payload)) return null;
  const value = event.payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scalar(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
