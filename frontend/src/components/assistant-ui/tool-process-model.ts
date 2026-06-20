import type { ToolCallMessagePartProps } from '@assistant-ui/react';

import { sanitizePublicProcessText as sanitizePublicText } from './public-process-text';

export type ProcessStatus = 'running' | 'complete' | 'waiting' | 'error';

export type ProcessStep = {
  id: string;
  label: string;
  detail?: string;
  status: ProcessStatus;
  kind?: string;
  processType?: string;
  agentName?: string | null;
  metadata?: Record<string, unknown>;
  snapshot?: ProcessStepSnapshot;
};

export type ProcessStepSnapshot = {
  schemaVersion: 'fitmeet.step-snapshot.v1';
  observation: string[];
  critique: string | null;
  result: string | null;
};

export type CheckpointToolActionKey = 'resume' | 'retry' | 'replay' | 'fork';

export type CheckpointToolAction = {
  key: CheckpointToolActionKey;
  label: string;
  busyLabel: string;
  endpoint?: string | null;
  method?: string | null;
  idempotencyKey?: string | null;
  stepId?: string | null;
  source: 'backend' | 'fallback';
};

export type ResumeContext = {
  hasCheckpoint: boolean;
  hasInterrupt: boolean;
  threadId?: string | null;
  checkpointId?: number | string | null;
  parentCheckpointId?: number | string | null;
  mode?: CheckpointToolActionKey | null;
  interruptKind?: string | null;
  idempotencyKey?: string | null;
  sourceStep?: {
    stepId: string;
    label: string | null;
    toolName: string | null;
  } | null;
  stepScope?: {
    mode: 'full_checkpoint' | 'through_step';
    stepCount: number;
    sourceCheckpointId: number | null;
  } | null;
  sideEffectPolicy?: {
    idempotencyKey: string;
    sideEffectsBeforeResume: 'idempotent_only';
    duplicatePolicy: 'reuse_idempotency_key';
  } | null;
};

export type ProcessSummary = {
  title: string;
  status: ProcessStatus;
  visibleSummary?: VisibleProcessSummary | null;
  steps: ProcessStep[];
  historySteps: ProcessStep[];
  resultLines: string[];
  pendingCount: number;
  replayable: boolean;
  forkable: boolean;
  retryable: boolean;
  checkpointActions: CheckpointToolAction[];
  checkpointId?: number | string | null;
  stepId?: string | null;
  resumeContext: ResumeContext;
};

export type VisibleProcessSummary = {
  title: string;
  detail?: string | null;
  status: ProcessStatus;
  source?: string | null;
  displayMode?: 'covering_status' | null;
  updateModel?: 'latest_state' | null;
  defaultVisibleCount?: number | null;
  historyVisibility?: 'collapsed' | null;
  currentStage?: string | null;
  currentEventId?: string | null;
  currentSeq?: number | null;
  visibleStepCount?: number | null;
  expandable?: boolean;
  pendingApproval?: boolean;
  candidateCount?: number | null;
  activityCount?: number | null;
  hasOpportunityCard?: boolean;
  savedMemory?: boolean;
};

type ToolCategory = 'life_graph' | 'social_match' | 'meet_loop' | 'safety' | 'generic';

export function toolStatus(status: ToolCallMessagePartProps['status']) {
  if (status?.type === 'running') {
    return {
      status: 'running' as const,
      text: '正在处理',
    };
  }
  if (status?.type === 'requires-action') {
    return {
      status: 'waiting' as const,
      text: '需要你确认这一步',
    };
  }
  if (status?.type === 'incomplete') {
    return {
      status: 'error' as const,
      text: '这一步没有完成',
    };
  }
  return {
    status: 'complete' as const,
    text: '已完成这一步',
  };
}

export function summarizeDataPart(name: string | undefined, data: unknown): ProcessSummary {
  const record = isRecord(data) ? data : {};
  const checkpointId = checkpointIdFromData(record);
  const runtime = isRecord(record.runtime) ? record.runtime : null;
  const canReplay = checkpointId !== null && runtime?.canReplay === true;
  const canFork = checkpointId !== null && runtime?.canFork === true;
  const resumeContext = resumeContextFromRuntime(runtime, checkpointId);
  const steps = Array.isArray(record.steps)
    ? record.steps.filter(isRecord).map((step, index) => normalizeStep(step, index))
    : [];
  const historySteps = Array.isArray(record.historySteps)
    ? record.historySteps.filter(isRecord).map((step, index) => normalizeStep(step, index))
    : steps;
  const pendingConfirmations = Array.isArray(record.pendingConfirmations)
    ? record.pendingConfirmations
    : [];
  const hasWaiting =
    pendingConfirmations.length > 0 || steps.some((step) => step.status === 'waiting');
  const hasError = steps.some((step) => step.status === 'error');
  const hasRunning = steps.some((step) => step.status === 'running');
  const normalizedVisibleSummary = normalizeVisibleProcessSummary(record.visibleSummary);
  const inferredStatus =
    hasError
      ? 'error'
      : hasWaiting
        ? 'waiting'
        : (normalizedVisibleSummary?.status ?? (hasRunning ? 'running' : 'complete'));
  const visibleSummary =
    normalizedVisibleSummary ??
    fallbackVisibleProcessSummary(name, record, steps, inferredStatus, {
      hasWaiting,
      hasError,
    });
  const status =
    hasError
      ? 'error'
      : hasWaiting
        ? 'waiting'
        : (visibleSummary?.status ?? inferredStatus);
  const title =
    visibleSummary?.title ??
    publicDetail(record.title) ??
    (name === 'fitmeet-approval'
      ? '需要你确认这一步'
      : name === 'fitmeet-process'
        ? '正在处理'
        : '正在处理');
  const stepId = stepIdFromRuntime(runtime) ?? targetStepIdFromSteps(steps, status);
  const checkpointActions = checkpointActionsFromRuntime(runtime, {
    checkpointId,
    status,
    canReplay,
    canFork,
    stepId,
  });
  return {
    title,
    status,
    visibleSummary,
    steps,
    historySteps: compactHistoryStepsForSummary(visibleSummary, historySteps),
    resultLines: resultLinesWithVisibleSummary(
      visibleSummary,
      resultLinesForData(record, pendingConfirmations, steps),
    ),
    pendingCount: pendingConfirmations.length,
    replayable: status !== 'running' && steps.length > 0 && canReplay,
    forkable: status === 'complete' && steps.length > 0 && canFork,
    retryable: status === 'error' && canReplay,
    checkpointActions,
    checkpointId,
    stepId,
    resumeContext,
  };
}

function compactHistoryStepsForSummary(
  visibleSummary: VisibleProcessSummary | null,
  historySteps: ProcessStep[],
): ProcessStep[] {
  if (!visibleSummary) return historySteps;
  if (visibleSummary.displayMode !== 'covering_status') return historySteps;
  if (
    visibleSummary.historyVisibility === 'collapsed' &&
    visibleSummary.pendingApproval !== true
  ) {
    return [];
  }
  const deduped = new Map<string, ProcessStep>();
  for (const step of historySteps) {
    const key = [
      step.processType ?? 'process',
      step.kind ?? 'step',
      step.label.replace(/\s+/g, ' ').trim(),
      step.detail?.replace(/\s+/g, ' ').trim() ?? '',
      step.status,
    ].join(':');
    deduped.set(key, step);
  }
  return Array.from(deduped.values()).slice(-4);
}

function normalizeVisibleProcessSummary(value: unknown): VisibleProcessSummary | null {
  if (!isRecord(value)) return null;
  const title = publicDetail(value.title);
  if (!title) return null;
  const source = publicString(value.source);
  const isReplaySummary = source === 'replay.summary';
  const displayMode =
    value.displayMode === 'covering_status' || isReplaySummary ? 'covering_status' : null;
  const defaultVisibleCount = publicNumber(value.defaultVisibleCount);
  const visibleStepCount = publicNumber(value.visibleStepCount);
  const hasHistoryVisibility = Object.prototype.hasOwnProperty.call(value, 'historyVisibility');
  return {
    title,
    detail: publicDetail(value.detail),
    status: processStatusFromSummaryState(value.state),
    source,
    displayMode,
    updateModel: value.updateModel === 'latest_state' || displayMode ? 'latest_state' : null,
    defaultVisibleCount: displayMode ? 1 : defaultVisibleCount,
    historyVisibility:
      value.historyVisibility === 'collapsed' || (!hasHistoryVisibility && displayMode)
        ? 'collapsed'
        : null,
    currentStage: publicString(value.currentStage),
    currentEventId: publicString(value.currentEventId),
    currentSeq: publicNumber(value.currentSeq),
    visibleStepCount: displayMode ? 1 : visibleStepCount,
    expandable: value.expandable === true,
    pendingApproval: value.pendingApproval === true,
    candidateCount: publicNumber(value.candidateCount),
    activityCount: publicNumber(value.activityCount),
    hasOpportunityCard: value.hasOpportunityCard === true,
    savedMemory: value.savedMemory === true,
  };
}

function fallbackVisibleProcessSummary(
  name: string | undefined,
  record: Record<string, unknown>,
  steps: ProcessStep[],
  status: ProcessStatus,
  flags: { hasWaiting: boolean; hasError: boolean },
): VisibleProcessSummary | null {
  if (name !== 'fitmeet-process') return null;
  const rawTitle = publicDetail(record.title);
  const latestCurrent =
    [...steps].reverse().find((step) => step.status === 'running' || step.status === 'waiting') ??
    [...steps].reverse().find((step) => step.status === 'error') ??
    [...steps].reverse().find((step) => step.status === 'complete') ??
    null;
  const title = compactFallbackProcessTitle(rawTitle, latestCurrent, status);
  const detail = compactFallbackProcessDetail(latestCurrent, status);
  return {
    title,
    detail,
    status,
    source: 'client.covering_status',
    displayMode: 'covering_status',
    updateModel: 'latest_state',
    defaultVisibleCount: 1,
    historyVisibility: flags.hasWaiting || flags.hasError ? null : 'collapsed',
    expandable: flags.hasWaiting || flags.hasError,
    pendingApproval:
      flags.hasWaiting &&
      Boolean(
        latestCurrent?.processType === 'approval' ||
          latestCurrent?.metadata?.processType === 'approval',
      ),
  };
}

function compactFallbackProcessTitle(
  rawTitle: string | null,
  step: ProcessStep | null,
  status: ProcessStatus,
) {
  const text = `${rawTitle ?? ''} ${step?.id ?? ''} ${step?.label ?? ''} ${step?.detail ?? ''}`;
  if (status === 'waiting') return '需要你确认后继续';
  if (status === 'error') return '这一步没有完成';
  if (/候选|推荐|匹配|candidate|search|rank/i.test(text)) {
    return status === 'running' ? '正在筛选公开可发现的人' : '已整理公开可发现的人选';
  }
  if (/约练|活动|邀约|邀请|meet|activity|invite|opportunity/i.test(text)) {
    return status === 'running' ? '正在整理约练方案' : '已整理约练方案';
  }
  if (/记忆|画像|偏好|上下文|memory|profile|life|graph|slot/i.test(text)) {
    return status === 'running' ? '正在读取你的偏好' : '已整理你的偏好';
  }
  if (/安全|审批|确认|边界|approval|safety|permission/i.test(text)) {
    return status === 'running' ? '正在检查安全边界' : '已检查安全边界';
  }
  return status === 'running' ? '正在思考下一步' : '已整理当前进展';
}

function compactFallbackProcessDetail(step: ProcessStep | null, status: ProcessStatus) {
  if (!step || status === 'running') return null;
  const detail = step.detail ?? step.label;
  const sanitized = detail ? sanitizePublicText(detail)?.replace(/\s+/g, ' ').trim() : null;
  return sanitized ? sanitized.slice(0, 72) : null;
}

function processStatusFromSummaryState(value: unknown): ProcessStatus {
  if (value === 'waiting') return 'waiting';
  if (value === 'failed' || value === 'error') return 'error';
  if (value === 'completed' || value === 'complete' || value === 'done' || value === 'success') {
    return 'complete';
  }
  return 'running';
}

function resultLinesWithVisibleSummary(
  visibleSummary: VisibleProcessSummary | null,
  resultLines: string[],
) {
  const detail = visibleSummary?.detail?.trim();
  if (!detail) return resultLines;
  return resultLines.filter((line) => line !== detail);
}

export function summarizeUnknownResult(part: ToolCallMessagePartProps) {
  const maybeResult = (part as { result?: unknown }).result;
  const line = publicDetail(maybeResult);
  return line ? [line] : [];
}

export function summarizeToolCallFallback(part: ToolCallMessagePartProps): ProcessSummary {
  const state = toolStatus(part.status);
  const title = toolFallbackStatusTitle(part.toolName, state.status, state.text);
  const resultLines = summarizeUnknownResult(part);
  const visibleSummary: VisibleProcessSummary = {
    title,
    detail: state.status === 'running' ? null : (resultLines[0] ?? null),
    status: state.status,
    source: 'tool.status',
    displayMode: 'covering_status',
    updateModel: 'latest_state',
    defaultVisibleCount: 1,
    historyVisibility: 'collapsed',
    expandable: false,
    pendingApproval: state.status === 'waiting',
  };

  return {
    title,
    status: state.status,
    visibleSummary,
    steps: [
      {
        id: `${toolFallbackStepId(part.toolName)}-${state.status}`,
        label: title,
        status: state.status,
      },
    ],
    historySteps: [],
    resultLines: resultLinesWithVisibleSummary(visibleSummary, resultLines),
    pendingCount: state.status === 'waiting' ? 1 : 0,
    replayable: false,
    forkable: false,
    retryable: false,
    checkpointActions: [],
    resumeContext: {
      hasCheckpoint: false,
      hasInterrupt: state.status === 'waiting',
    },
  };
}

export function humanToolName(name: string) {
  if (!name) return '正在处理';
  if (/approval|safety/i.test(name)) return '需要你确认这一步';
  if (/search|match|candidate|social/i.test(name)) return '正在整理合适的信息';
  if (/profile|life|graph|memory/i.test(name)) return '正在整理上下文';
  if (/meet|invite|schedule/i.test(name)) return '正在整理约定步骤';
  return '正在推进这一步';
}

function toolFallbackStatusTitle(
  name: string,
  status: ProcessStatus,
  fallbackText: string,
) {
  if (status === 'running') return humanToolName(name);
  if (status === 'waiting' || status === 'error') return fallbackText;
  if (/approval|safety/i.test(name)) return '已确认这一步';
  if (/search|match|candidate|social/i.test(name)) return '已整理合适的信息';
  if (/profile|life|graph|memory/i.test(name)) return '已整理上下文';
  if (/meet|invite|schedule/i.test(name)) return '已整理约定步骤';
  return '已完成这一步';
}

function toolFallbackStepId(name: string) {
  if (/approval|safety/i.test(name)) return 'confirmation';
  if (/search|match|candidate|social/i.test(name)) return 'matching';
  if (/profile|life|graph|memory/i.test(name)) return 'context';
  if (/meet|invite|schedule/i.test(name)) return 'meet-loop';
  return 'process';
}

export function naturalProcessTitle(summary: ProcessSummary) {
  if (
    summary.steps.some((step) =>
      /clarify|补充|关键信息|确认需要补充/i.test(`${step.id} ${step.label} ${step.detail ?? ''}`),
    )
  ) {
    if (summary.status === 'waiting') return '等待你补充信息';
    return summary.status === 'running' ? '正在确认需要补充的信息' : '已确认需要补充的信息';
  }
  if (summary.status === 'waiting') return '需要你确认后继续';
  if (summary.status === 'error') return '这一步没有完成';
  if (summary.steps.some((step) => classifyStepCategory(step) === 'social_match')) {
    return summary.status === 'running' ? '正在整理合适选项' : '已整理相关选项';
  }
  if (summary.steps.some((step) => classifyStepCategory(step) === 'life_graph')) {
    return summary.status === 'running' ? '正在结合上下文' : '已整理上下文';
  }
  return summary.status === 'running' ? '正在处理' : '已处理';
}

function checkpointActionsFromRuntime(
  runtime: Record<string, unknown> | null,
  fallback: {
    checkpointId: number | string | null;
    status: ProcessStatus;
    canReplay: boolean;
    canFork: boolean;
    stepId: string | null;
  },
): CheckpointToolAction[] {
  if (fallback.checkpointId === null) return [];
  const interrupt = isRecord(runtime?.interrupt) ? runtime.interrupt : null;
  const backendActions = [
    ...checkpointActionsFromUnknown(interrupt?.stepActions, 'step'),
    ...checkpointActionsFromUnknown(interrupt?.recoveryActions, 'recovery'),
  ];
  const dedupedBackendActions = dedupeCheckpointActions(backendActions);
  if (dedupedBackendActions.length > 0) return dedupedBackendActions;

  const actions: CheckpointToolAction[] = [];
  if (fallback.status === 'waiting') actions.push(fallbackCheckpointAction('resume', fallback.stepId));
  if (fallback.status === 'error' && fallback.canReplay) {
    actions.push(fallbackCheckpointAction('retry', fallback.stepId));
  }
  if (fallback.status !== 'running' && fallback.canReplay) {
    actions.push(fallbackCheckpointAction('replay', fallback.stepId));
  }
  if (fallback.status === 'complete' && fallback.canFork) {
    actions.push(fallbackCheckpointAction('fork', fallback.stepId));
  }
  return actions;
}

function checkpointActionsFromUnknown(
  value: unknown,
  sourceKind: 'recovery' | 'step',
): CheckpointToolAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const key = checkpointActionKeyFromUnknown(raw.action);
    if (!key) return [];
    const label = publicDetail(raw.label) ?? checkpointActionLabel(key) ?? '继续处理';
    const stepId =
      sourceKind === 'step'
        ? publicString(raw.stepId)
        : publicString(raw.stepId) ?? null;
    return [
      {
        key,
        label,
        busyLabel: checkpointActionBusyLabel(key),
        endpoint: publicString(raw.endpoint),
        method: publicString(raw.method),
        idempotencyKey: publicString(raw.idempotencyKey),
        stepId,
        source: 'backend' as const,
      },
    ];
  });
}

function fallbackCheckpointAction(
  key: CheckpointToolActionKey,
  stepId: string | null,
): CheckpointToolAction {
  return {
    key,
    label: checkpointActionLabel(key) ?? '继续处理',
    busyLabel: checkpointActionBusyLabel(key),
    stepId,
    source: 'fallback',
  };
}

function dedupeCheckpointActions(actions: CheckpointToolAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.key}:${action.stepId ?? 'run'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function checkpointActionKeyFromUnknown(value: unknown): CheckpointToolActionKey | null {
  if (value === 'resume' || value === 'retry' || value === 'replay' || value === 'fork') {
    return value;
  }
  return null;
}

function resumeContextFromRuntime(
  runtime: Record<string, unknown> | null,
  checkpointId: number | string | null,
): ResumeContext {
  const interrupt = isRecord(runtime?.interrupt) ? runtime.interrupt : null;
  const resumeCursor = isRecord(runtime?.resumeCursor) ? runtime.resumeCursor : null;
  const threadId =
    publicString(runtime?.threadId) ??
    publicString(resumeCursor?.threadId) ??
    publicString(interrupt?.threadId);
  const parentCheckpointId =
    (typeof runtime?.parentCheckpointId === 'number' ||
    typeof runtime?.parentCheckpointId === 'string'
      ? runtime.parentCheckpointId
      : null) ??
    (typeof resumeCursor?.parentCheckpointId === 'number' ||
    typeof resumeCursor?.parentCheckpointId === 'string'
      ? resumeCursor.parentCheckpointId
      : null);
  const mode = resumeModeFromUnknown(
    resumeCursor?.action ?? runtime?.checkpointAction ?? interrupt?.resumeAction,
  );
  return {
    hasCheckpoint: checkpointId !== null,
    hasInterrupt: isRecord(interrupt),
    threadId,
    checkpointId,
    parentCheckpointId,
    mode,
    interruptKind: publicString(interrupt?.kind),
    idempotencyKey:
      publicString(runtime?.idempotencyKey) ?? publicString(interrupt?.idempotencyKey),
    sourceStep: resumeSourceStepFromRuntime(runtime),
    stepScope: resumeStepScopeFromRuntime(runtime),
    sideEffectPolicy: resumeSideEffectPolicyFromRuntime(runtime),
  };
}

function stepIdFromRuntime(runtime: Record<string, unknown> | null): string | null {
  const resumeCursor = isRecord(runtime?.resumeCursor) ? runtime.resumeCursor : null;
  return publicString(resumeCursor?.stepId);
}

function resumeSourceStepFromRuntime(runtime: Record<string, unknown> | null): ResumeContext['sourceStep'] {
  const sourceStep = isRecord(runtime?.sourceStep) ? runtime.sourceStep : null;
  const stepId = publicString(sourceStep?.stepId);
  if (!sourceStep || !stepId) return null;
  return {
    stepId,
    label: publicDetail(sourceStep.label),
    toolName: publicDetail(sourceStep.toolName),
  };
}

function resumeStepScopeFromRuntime(runtime: Record<string, unknown> | null): ResumeContext['stepScope'] {
  const stepScope = isRecord(runtime?.stepScope) ? runtime.stepScope : null;
  if (!stepScope) return null;
  const mode = stepScope.mode === 'through_step' ? 'through_step' : 'full_checkpoint';
  const stepCount = publicNumber(stepScope.stepCount) ?? 0;
  const sourceCheckpointId =
    typeof stepScope.sourceCheckpointId === 'number' ||
    typeof stepScope.sourceCheckpointId === 'string'
      ? Number(stepScope.sourceCheckpointId)
      : null;
  return {
    mode,
    stepCount,
    sourceCheckpointId: Number.isFinite(sourceCheckpointId) ? sourceCheckpointId : null,
  };
}

function resumeSideEffectPolicyFromRuntime(
  runtime: Record<string, unknown> | null,
): ResumeContext['sideEffectPolicy'] {
  const policy = isRecord(runtime?.sideEffectPolicy) ? runtime.sideEffectPolicy : null;
  const idempotencyKey = publicString(policy?.idempotencyKey);
  if (!policy || !idempotencyKey) return null;
  return {
    idempotencyKey,
    sideEffectsBeforeResume: 'idempotent_only',
    duplicatePolicy: 'reuse_idempotency_key',
  };
}

function classifyStepCategory(step: ProcessStep): ToolCategory {
  const processType = (step.processType ?? '').toLowerCase();
  if (/candidate|social_match|rank/.test(processType)) return 'social_match';
  if (/opportunity|meet_loop/.test(processType)) return 'meet_loop';
  if (/memory|slot|life_graph/.test(processType)) return 'life_graph';
  if (/approval|safety/.test(processType)) return 'safety';
  const text = `${step.id} ${step.kind ?? ''} ${step.label} ${step.detail ?? ''}`.toLowerCase();
  if (/tool[_\s-]?call/.test(text)) return 'generic';
  if (/clarify|补充|关键信息|确认需要补充|等待用户补充/.test(text)) return 'generic';
  if (/life|graph|profile|memory|画像|记忆|偏好|上下文/.test(text)) return 'life_graph';
  if (/match|candidate|social|search|rank|recommend|筛选|查找|候选|推荐|匹配/.test(text)) {
    return 'social_match';
  }
  if (/meet|activity|invite|schedule|loop|约练|邀约|活动|改期|见面|评价/.test(text)) {
    return 'meet_loop';
  }
  if (/safety|approval|confirm|permission|risk|安全|确认|审批|权限|边界/.test(text)) {
    return 'safety';
  }
  return 'generic';
}

function checkpointIdFromData(data: unknown): number | string | null {
  if (!isRecord(data)) return null;
  const runtime = isRecord(data.runtime) ? data.runtime : null;
  const value = runtime?.checkpointId ?? data.checkpointId;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function targetStepIdFromSteps(steps: ProcessStep[], status: ProcessStatus): string | null {
  const target =
    status === 'error'
      ? [...steps].reverse().find((step) => step.status === 'error')
      : ([...steps]
          .reverse()
          .find((step) => step.status === 'complete' || step.status === 'waiting') ?? steps.at(-1));
  return target?.id?.trim() || null;
}

function normalizeStep(step: Record<string, unknown>, index: number): ProcessStep {
  const rawStatus = publicString(step.status);
  const status: ProcessStatus =
    rawStatus === 'running'
      ? 'running'
      : rawStatus === 'waiting'
        ? 'waiting'
        : rawStatus === 'error' || rawStatus === 'failed'
          ? 'error'
          : 'complete';
  return {
    id: publicStepId(step.id, index),
    label: humanStepLabel(publicString(step.label), publicString(step.kind), status),
    detail: publicDetail(step.detail) ?? undefined,
    status,
    kind: publicString(step.kind) ?? undefined,
    processType: publicString(step.processType) ?? undefined,
    agentName: publicString(step.agentName) ?? undefined,
    metadata: isRecord(step.metadata) ? step.metadata : undefined,
    snapshot: normalizeStepSnapshot(step.snapshot),
  };
}

function publicStepId(value: unknown, index: number) {
  const raw = publicString(value);
  if (!raw || sanitizePublicText(raw) === null) return `step-${index}`;
  if (
    /\b(llm|model|schema|metadata|token|latency|payload|traceid|runid|planner|debug|internal|runtime)\b/i.test(
      raw,
    )
  ) {
    return `step-${index}`;
  }
  return raw.replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 64) || `step-${index}`;
}

function normalizeStepSnapshot(value: unknown): ProcessStepSnapshot | undefined {
  if (!isRecord(value) || value.schemaVersion !== 'fitmeet.step-snapshot.v1') return undefined;
  const observation = Array.isArray(value.observation)
    ? value.observation
        .map((item) => publicDetail(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, 6)
    : [];
  const critique = publicDetail(value.critique);
  const result = publicDetail(value.result);
  if (observation.length === 0 && !critique && !result) return undefined;
  return {
    schemaVersion: 'fitmeet.step-snapshot.v1',
    observation,
    critique,
    result,
  };
}

function resultLinesForData(
  record: Record<string, unknown>,
  pendingConfirmations: unknown[],
  steps: ProcessStep[],
) {
  const explicit = publicDetail(record.summary);
  if (explicit) return [explicit];
  if (pendingConfirmations.length > 0) {
    return ['这一步会影响实际动作，我会等你确认后再继续。'];
  }
  const lastError = [...steps].reverse().find((step) => step.status === 'error');
  if (lastError) {
    return [lastError.detail ?? '这一步没有完成，我可以重新尝试或换一种方式处理。'];
  }
  const completed = steps.filter((step) => step.status === 'complete');
  if (completed.length > 0) {
    return [`已完成 ${completed.length} 个步骤，结果会继续合并到回复里。`];
  }
  const running = steps.find((step) => step.status === 'running');
  if (running) return ['正在处理，我会把有用结果整理成自然回复。'];
  return ['已整理为可读结果。'];
}

function checkpointActionLabel(key: string | null) {
  if (key === 'retry') return '重试这一步';
  if (key === 'replay') return '重新运行这一步';
  if (key === 'fork') return '生成新版本';
  if (key === 'resume') return '继续处理';
  return null;
}

function checkpointActionBusyLabel(key: CheckpointToolActionKey) {
  if (key === 'resume') return '正在继续';
  if (key === 'retry') return '正在重试';
  if (key === 'replay') return '正在重新运行';
  return '正在生成';
}

function resumeModeFromUnknown(value: unknown): ResumeContext['mode'] {
  if (value === 'retry' || value === 'replay' || value === 'fork' || value === 'resume') {
    return value;
  }
  return null;
}

function humanStepLabel(label: string | null, kind: string | null, status: ProcessStatus) {
  const safeLabel = label ? sanitizePublicText(label) : null;
  if (safeLabel) return safeLabel;
  if (status === 'waiting') return '等待你确认下一步';
  if (status === 'error') return '处理时遇到问题';
  if (/memory|slot|saved|progress/i.test(`${kind ?? ''}`)) return '正在保存进度';
  if (kind === 'tool') return '正在整理相关信息';
  if (kind === 'status') return '正在确认当前状态';
  return '正在思考下一步';
}

function publicDetail(value: unknown) {
  if (typeof value === 'string') return sanitizePublicText(value);
  if (isRecord(value)) {
    const keys = ['title', 'message', 'summary', 'detail', 'status'];
    for (const key of keys) {
      const candidate = publicString(value[key]);
      const sanitized = candidate ? sanitizePublicText(candidate) : null;
      if (sanitized) return sanitized;
    }
  }
  return null;
}

function publicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function publicNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
