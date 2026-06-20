import type { DataMessagePartProps, ToolCallMessagePartProps } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  History,
  Loader2,
  RefreshCcw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/utils';
import { AssistantThinkingDots } from './thinking-dots';
import {
  ToolUICardCollectionBlock,
  type ToolUICardRenderer,
} from './tool-card-collection';
import {
  naturalProcessTitle,
  summarizeDataPart,
  summarizeToolCallFallback,
  type CheckpointToolAction,
  type CheckpointToolActionKey,
  type ProcessStatus,
  type ProcessStep,
  type ProcessSummary,
} from './tool-process-model';
import { GenericResultCard } from './tool-generic-card';
import { useFitMeetToolUIActions } from './tool-ui-actions';
import {
  EMPTY_CHECKPOINT_ACTION_STATE,
  setCheckpointActionRuntimeState,
  useCheckpointActionRuntimeState,
  type CheckpointActionRuntimeState,
} from './tool-checkpoint-runtime';
import { ToolActionButton } from './tool-action-button';
import { ApprovalToolUI } from './tool-approval-card';
import { InterruptResumeState, ResultSummary } from './tool-process-panels';
import {
  extractCanonicalAssistantCards,
  productComponentForSchemaType,
  type SchemaDrivenAssistantCard,
  type ToolUISchemaType,
} from './tool-ui-schema';
import { sanitizePublicProcessText as sanitizePublicText } from './public-process-text';

const LazyCandidateResultCard = lazy(() =>
  import('./tool-candidate-card').then((module) => ({ default: module.CandidateResultCard })),
);
const LazyActivityOpportunityCard = lazy(() =>
  import('./tool-activity-card').then((module) => ({ default: module.ActivityOpportunityCard })),
);
const LazyCandidateEmptyStateCard = lazy(() =>
  import('./tool-candidate-empty-card').then((module) => ({
    default: module.CandidateEmptyStateCard,
  })),
);
const LazyLifeGraphDiffCard = lazy(() =>
  import('./tool-life-graph-card').then((module) => ({ default: module.LifeGraphDiffCard })),
);
const LazyMeetLoopResultCard = lazy(() =>
  import('./tool-meet-loop-card').then((module) => ({ default: module.MeetLoopResultCard })),
);
const LazySafetyResultCard = lazy(() =>
  import('./tool-safety-card').then((module) => ({ default: module.SafetyResultCard })),
);

const ASSISTANT_CARD_RENDERERS: Record<ToolUISchemaType, ToolUICardRenderer> = {
  'social_match.candidate': CandidateResultCard,
  'social_match.activity': ActivityOpportunityCard,
  'social_match.empty': CandidateEmptyStateCard,
  'life_graph.diff': LifeGraphDiffCard,
  'meet_loop.timeline': MeetLoopResultCard,
  'safety.approval': SafetyResultCard,
  'generic.card': GenericResultCard,
};

export function AssistantToolFallback(part: ToolCallMessagePartProps) {
  return <AgentProcessBlock summary={summarizeToolCallFallback(part)} />;
}

export function AssistantDataFallback(part: DataMessagePartProps) {
  const summary = summarizeDataPart(part.name, part.data);
  if (part.name === 'fitmeet-thinking') {
    return <AssistantThinkingDots className="my-1" />;
  }
  if (part.name === 'fitmeet-approval') {
    return <ApprovalToolUI data={part.data} summary={summary} />;
  }
  if (part.name === 'fitmeet-process') {
    return <FitMeetProcessToolUI summary={summary} />;
  }
  if (part.name === 'fitmeet-cards') {
    return <FitMeetCardsToolUI data={part.data} summary={summary} />;
  }
  return <AgentProcessBlock summary={summary} />;
}

function FitMeetCardsToolUI({ data, summary }: { data: unknown; summary: ProcessSummary }) {
  const cards = extractCanonicalAssistantCards(data);
  if (cards.length === 0) return <AgentProcessBlock summary={summary} />;

  return (
    <ToolUICardCollectionBlock
      data={data}
      cards={cards}
      summary={summary}
      renderCard={({ card }) => <AssistantCardRenderer card={card} />}
    />
  );
}

function AssistantCardRenderer({ card }: { card: SchemaDrivenAssistantCard }) {
  const Renderer = ASSISTANT_CARD_RENDERERS[card.schemaType] ?? GenericResultCard;
  return (
    <div
      data-renderer={card.schemaType}
      data-product-component={productComponentForSchemaType(card.schemaType)}
    >
      <Renderer card={card} />
    </div>
  );
}

function CandidateResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <Suspense fallback={<GenericResultCard card={card} />}>
      <LazyCandidateResultCard card={card} />
    </Suspense>
  );
}

function ActivityOpportunityCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <Suspense fallback={<GenericResultCard card={card} />}>
      <LazyActivityOpportunityCard card={card} />
    </Suspense>
  );
}

function CandidateEmptyStateCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <Suspense fallback={<GenericResultCard card={card} />}>
      <LazyCandidateEmptyStateCard card={card} />
    </Suspense>
  );
}

function LifeGraphDiffCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <Suspense fallback={<GenericResultCard card={card} />}>
      <LazyLifeGraphDiffCard card={card} />
    </Suspense>
  );
}

function MeetLoopResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <Suspense fallback={<GenericResultCard card={card} />}>
      <LazyMeetLoopResultCard card={card} />
    </Suspense>
  );
}

function SafetyResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  return (
    <Suspense fallback={<GenericResultCard card={card} />}>
      <LazySafetyResultCard card={card} />
    </Suspense>
  );
}

function FitMeetProcessToolUI({ summary }: { summary: ProcessSummary }) {
  return (
    <ProcessStatusBlock
      summary={summary}
      testId="assistant-ui-tool-ui"
      renderMode="tool-ui"
      actionMode="executable"
    />
  );
}

function AgentProcessBlock({ summary }: { summary: ProcessSummary }) {
  return (
    <ProcessStatusBlock
      summary={summary}
      testId="assistant-ui-tool-fallback"
      renderMode="fallback"
      actionMode="replay"
    />
  );
}

function ProcessStatusBlock({
  summary,
  testId,
  renderMode,
  actionMode,
}: {
  summary: ProcessSummary;
  testId: string;
  renderMode: 'tool-ui' | 'fallback';
  actionMode: 'executable' | 'replay';
}) {
  const statusUpdateKey = processStatusUpdateKey(summary);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [detailsOpenKey, setDetailsOpenKey] = useState<string | null>(null);
  const detailsOpen = detailsOpenKey === statusUpdateKey;
  const icon = statusIcon(summary.status);
  const statusLabel = statusText(summary.status);
  const checkpointState = toolCheckpointState(summary);
  const line = compactProcessLine(summary);
  const evidence = compactProcessEvidence(summary);
  const pendingSuffix = processPendingSuffix(summary, line.title);
  const exposeDetails = shouldExposeProcessDetails(summary, renderMode);
  const hasCheckpointControls =
    summary.resumeContext.hasCheckpoint ||
    summary.checkpointActions.length > 0 ||
    summary.replayable ||
    summary.forkable ||
    summary.retryable;
  const hasExpandableDetails =
    exposeDetails &&
    (Boolean(line.detail) ||
      evidence.length > 0 ||
      summary.resultLines.length > 0 ||
      hasCheckpointControls);
  const defaultVisibleStepCount = summary.visibleSummary?.defaultVisibleCount ?? 1;
  const collapsedHistory =
    summary.visibleSummary?.historyVisibility === 'collapsed' || !hasExpandableDetails;

  useLayoutEffect(() => {
    const element = detailsRef.current;
    if (!element) return;
    element.open = detailsOpen;
    if (!detailsOpen) element.removeAttribute('open');
  }, [detailsOpen, statusUpdateKey]);

  return (
    <details
      key={statusUpdateKey}
      ref={detailsRef}
      className="group/process my-2 text-sm text-[#52525b]"
      data-testid={testId}
      role="group"
      aria-label={`处理过程：${line.title}`}
      data-render-mode={renderMode}
      data-process-display="compact"
      data-process-surface="single-line-status"
      data-process-visual="streaming-status"
      data-process-rendering="covering-status"
      data-process-default-visible-count="1"
      data-process-mainline="latest-visible-summary"
      data-process-history-visibility="collapsed"
      data-process-final-answer="false"
      data-process-update-model="latest-state"
      data-process-detail-policy="collapsed-until-open"
      data-process-audit-policy="expandable-summary"
      data-default-expanded="false"
      data-raw-trace-policy="hidden"
      data-process-node-policy="max-1-evidence"
      data-process-status={summary.status}
      data-process-open={detailsOpen ? 'true' : 'false'}
      data-process-clickable={hasExpandableDetails ? 'true' : 'false'}
      data-process-summary-source={summary.visibleSummary?.source ?? ''}
      data-process-display-mode={summary.visibleSummary?.displayMode ?? ''}
      data-process-summary-update-model={summary.visibleSummary?.updateModel ?? ''}
      data-process-visible-title={summary.visibleSummary?.title ?? ''}
      data-process-step-count={defaultVisibleStepCount}
      data-process-history-count={collapsedHistory ? 0 : summary.historySteps.length}
      data-result-count={summary.resultLines.length}
      data-pending-count={summary.pendingCount}
      data-replayable={String(summary.replayable)}
      data-forkable={String(summary.forkable)}
      data-retryable={String(summary.retryable)}
      data-checkpoint-state={checkpointState}
      data-has-checkpoint={summary.resumeContext.hasCheckpoint ? 'true' : 'false'}
      data-step-id={summary.stepId ?? ''}
    >
      <summary
        className={cn(
          'inline-flex max-w-full list-none items-center gap-2 rounded-full bg-[#f7f7f8] px-2.5 py-1.5 text-[#27272a] ring-1 ring-black/[0.06] transition-colors marker:hidden',
          hasExpandableDetails
            ? 'cursor-pointer hover:bg-[#f1f1f2]'
            : 'cursor-default hover:bg-[#f7f7f8]',
        )}
        aria-disabled={hasExpandableDetails ? undefined : true}
        onClick={(event) => {
          event.preventDefault();
          if (!hasExpandableDetails) return;
          setDetailsOpenKey((current) =>
            current === statusUpdateKey ? null : statusUpdateKey,
          );
        }}
      >
        <StatusBadge status={summary.status}>{icon}</StatusBadge>
        <span
          className="min-w-0 flex-1"
          aria-live="polite"
          aria-atomic="true"
          aria-label={line.detail ? `${line.title}。${line.detail}` : line.title}
          data-testid="assistant-ui-process-status-line"
          data-process-line="latest-visible-summary"
          data-process-live-region="polite"
          data-process-inline-detail="collapsed"
        >
          <span className="block truncate text-xs font-medium sm:text-sm">
            {line.title}
            {pendingSuffix}
          </span>
        </span>
        {summary.status === 'running' ? (
          <span className="mr-1 inline-flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a1a1aa] [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a1a1aa] [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a1a1aa]" />
          </span>
        ) : null}
        {hasExpandableDetails ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-[#71717a] ring-1 ring-black/5">
            查看过程
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-[#a1a1aa] transition-transform',
                detailsOpen ? 'rotate-180' : '',
              )}
              aria-hidden="true"
            />
          </span>
        ) : null}
      </summary>

      {hasExpandableDetails && detailsOpen ? (
        <div className="mt-2 max-w-2xl space-y-2 rounded-2xl bg-[#fbfbfc] px-3 py-2 ring-1 ring-black/[0.05]">
          <ProcessVisibleDetail detail={line.detail ?? statusLabel} />
          <CompactProcessEvidence evidence={evidence} />
          <ApprovalRuntimeHints metadata={approvalRuntimeMetadata(summary)} />
          <InterruptResumeState summary={summary} />
          {summary.resultLines.length > 0 ? (
            <ResultSummary lines={summary.resultLines} status={summary.status} />
          ) : null}
          {hasCheckpointControls ? (
            actionMode === 'executable' ? (
              <ExecutableTraceActions summary={summary} />
            ) : (
              <ProcessReplayPanel summary={summary} />
            )
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function processPendingSuffix(summary: ProcessSummary, title: string) {
  if (summary.pendingCount <= 0 && summary.visibleSummary?.pendingApproval !== true) {
    return null;
  }
  if (/确认|审批|等待你|需要你|暂停/.test(title)) return null;
  return ' · 等待确认';
}

type CompactEvidenceItem = {
  key: string;
  id: string;
  label: string;
  detail?: string;
  status: ProcessStatus;
  metadata?: Record<string, unknown>;
};

function shouldExposeProcessDetails(
  summary: ProcessSummary,
  renderMode: 'tool-ui' | 'fallback',
) {
  const hasCheckpointAction =
    summary.resumeContext.hasCheckpoint ||
    summary.checkpointActions.length > 0 ||
    summary.replayable ||
    summary.forkable ||
    summary.retryable;

  if (summary.visibleSummary?.pendingApproval || summary.pendingCount > 0) return true;
  if (summary.status === 'waiting' || summary.status === 'error') return true;
  if (hasCheckpointAction) return true;
  if (!summary.visibleSummary) return false;
  if (
    summary.visibleSummary.source === 'replay.summary' ||
    summary.visibleSummary.displayMode === 'covering_status'
  ) {
    if (
      summary.visibleSummary.historyVisibility === 'collapsed' &&
      summary.visibleSummary.pendingApproval !== true &&
      !hasCheckpointAction
    ) {
      return (
        renderMode === 'tool-ui' &&
        summary.visibleSummary.expandable === true &&
        Boolean(summary.visibleSummary.detail)
      );
    }
    return (
      summary.visibleSummary.expandable === true &&
      (Boolean(summary.visibleSummary.detail) ||
        summary.resultLines.length > 0 ||
        summary.historySteps.length > 0 ||
        hasCheckpointAction)
    );
  }
  return summary.visibleSummary.expandable === true;
}

function processStatusUpdateKey(summary: ProcessSummary) {
  const visible = summary.visibleSummary;
  return [
    visible?.currentEventId ?? '',
    visible?.currentSeq ?? '',
    visible?.title ?? summary.title,
    visible?.status ?? summary.status,
    visible?.source ?? '',
    summary.checkpointId ?? '',
    summary.stepId ?? '',
  ].join(':');
}

function ProcessVisibleDetail({ detail }: { detail?: string | null }) {
  if (!detail) return null;
  return (
    <p
      className="rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/[0.04]"
      data-testid="assistant-ui-process-detail"
    >
      {detail}
    </p>
  );
}

function compactProcessLine(summary: ProcessSummary): { title: string; detail?: string | null } {
  if (summary.visibleSummary && summary.visibleSummary.status === summary.status) {
    return {
      title: compactPublicStepLabel(summary.visibleSummary.title),
      detail: compactPublicStepDetail(summary.visibleSummary.detail ?? undefined),
    };
  }
  const primary =
    [...summary.steps].reverse().find((step) => isCurrentProcessStep(step)) ??
    [...summary.steps].reverse().find((step) => step.status === 'complete') ??
    null;
  if (primary && isRunSummaryStep(primary)) {
    return {
      title: compactPublicStepLabel(primary.label),
      detail:
        compactPublicStepDetail(primary.detail) ??
        (summary.resultLines.length > 0 ? summary.resultLines[0] : null),
    };
  }
  if (summary.status === 'error') {
    return {
      title: naturalProcessTitle(summary),
      detail: primary?.label ? compactPublicStepLabel(primary.label) : null,
    };
  }
  if (summary.status === 'waiting') {
    return {
      title: naturalProcessTitle(summary),
      detail: primary?.detail
        ? compactPublicStepDetail(primary.detail)
        : primary?.label
          ? compactPublicStepLabel(primary.label)
          : null,
    };
  }
  if (primary) {
    const label = compactPublicStepLabel(primary.label);
    const detail = compactPublicStepDetail(primary.detail) ?? summary.resultLines[0] ?? null;
    return {
      title: label,
      detail,
    };
  }
  return {
    title: naturalProcessTitle(summary),
    detail: summary.resultLines[0] ?? null,
  };
}

function compactProcessEvidence(summary: ProcessSummary): CompactEvidenceItem[] {
  const hasCheckpointAction =
    summary.resumeContext.hasCheckpoint ||
    summary.checkpointActions.length > 0 ||
    summary.replayable ||
    summary.forkable ||
    summary.retryable;
  if (
    summary.visibleSummary &&
    summary.status !== 'waiting' &&
    summary.status !== 'error' &&
    !hasCheckpointAction
  ) {
    return [];
  }

  if (
    isRunSummaryProcess(summary) &&
    summary.pendingCount === 0 &&
    summary.visibleSummary?.pendingApproval !== true &&
    summary.status !== 'waiting' &&
    summary.status !== 'error'
  ) {
    return [];
  }

  const sourceSteps = summary.historySteps.length > 0 ? summary.historySteps : summary.steps;
  const current = sourceSteps.filter(isCurrentProcessStep);
  const completed = sourceSteps.filter((step) => step.status === 'complete').slice(-3);
  const approval = [...sourceSteps]
    .reverse()
    .filter((step) => step.metadata?.processType === 'approval' || step.processType === 'approval')
    .slice(0, 1);
  const fallback = current.length > 0 ? [...approval, ...current] : [...approval, ...completed];
  const deduped = new Map<string, CompactEvidenceItem>();

  for (const step of fallback) {
    const label = compactPublicStepLabel(step.label);
    const detail = compactPublicStepDetail(step.detail);
    const key = `${label}:${detail ?? ''}`;
    if (deduped.has(key)) continue;
    deduped.set(key, {
      key,
      id: step.id,
      label,
      detail: detail ?? undefined,
      status: step.status,
      metadata: {
        ...step.metadata,
        processType: step.processType ?? step.metadata?.processType,
      },
    });
  }

  if (deduped.size === 0 && summary.resultLines.length > 0) {
    for (const line of summary.resultLines.slice(0, 3)) {
      const label = compactPublicStepLabel(line);
      if (!label) continue;
      deduped.set(label, {
        key: label,
        id: label,
        label,
        status: summary.status,
      });
    }
  }

  return Array.from(deduped.values()).slice(0, 1);
}

function isRunSummaryProcess(summary: ProcessSummary) {
  return summary.steps.some(isRunSummaryStep);
}

function isRunSummaryStep(step: ProcessStep) {
  return step.processType === 'run_summary' || step.metadata?.processType === 'run_summary';
}

function compactPublicStepLabel(value: string) {
  const label = (sanitizePublicText(value) ?? '').replace(/\s+/g, ' ').trim();
  if (!label) return '正在处理';
  return label
    .replace(/^工具[：:]\s*/g, '')
    .replace(/^步骤[：:]\s*/g, '')
    .replace(/^处理[：:]\s*/g, '')
    .slice(0, 42);
}

function compactPublicStepDetail(value: string | undefined) {
  const detail = value ? sanitizePublicText(value)?.replace(/\s+/g, ' ').trim() : null;
  if (!detail) return null;
  return detail.slice(0, 72);
}

function CompactProcessEvidence({ evidence }: { evidence: CompactEvidenceItem[] }) {
  if (evidence.length === 0) {
    return null;
  }
  return (
    <ol
      className="space-y-2"
      data-testid="assistant-ui-process-evidence"
      data-evidence-count={evidence.length}
      aria-label="可审计过程摘要"
    >
      {evidence.map((item) => (
        <li
          key={item.key}
          className="flex gap-2"
          data-testid="assistant-ui-process-step"
          data-step-id={item.id}
          data-step-status={item.status}
          data-current-step={isCurrentProcessStep(item) ? 'true' : 'false'}
          aria-current={isCurrentProcessStep(item) ? 'step' : undefined}
        >
          <span
            className={cn(
              'mt-2 h-1.5 w-1.5 shrink-0 rounded-full',
              item.status === 'running' && 'bg-blue-500',
              item.status === 'complete' && 'bg-emerald-500',
              item.status === 'waiting' && 'bg-amber-500',
              item.status === 'error' && 'bg-red-500',
            )}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block leading-6 text-[#52525b]">{item.label}</span>
            {item.detail ? (
              <span className="mt-0.5 block leading-5 text-[#8a8f98]">{item.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function toolCheckpointState(summary: ProcessSummary) {
  if (summary.status === 'waiting' && summary.resumeContext.hasCheckpoint) return 'waiting';
  if (summary.status === 'error' && summary.retryable) return 'retryable';
  if (summary.replayable && summary.forkable) return 'replayable-forkable';
  if (summary.replayable) return 'replayable';
  if (summary.forkable) return 'forkable';
  if (summary.resumeContext.hasCheckpoint) return 'saved';
  return 'none';
}

function isCurrentProcessStep(step: ProcessStep) {
  return step.status === 'running' || step.status === 'waiting' || step.status === 'error';
}

function ApprovalRuntimeHints({ metadata }: { metadata?: Record<string, unknown> }) {
  if (!metadata || metadata.processType !== 'approval') return null;
  const items = [
    publicDetail(metadata.dryRunPreviewTitle) ??
      (metadata.dryRunAvailable === true ? '发送前预览已准备' : null),
    metadata.sideEffectAllowedBeforeApproval === false ? '确认前不执行真实动作' : null,
    metadata.auditRequired === true ? '会留下确认记录' : null,
    publicDetail(metadata.resumePolicy),
    publicDetail(metadata.executionBoundary),
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
  if (items.length === 0) return null;
  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5"
      data-testid="assistant-ui-approval-runtime-hints"
    >
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] leading-5 text-amber-800 ring-1 ring-amber-100"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function approvalRuntimeMetadata(summary: ProcessSummary) {
  const sourceSteps = [...summary.steps, ...summary.historySteps];
  const step = [...sourceSteps].reverse().find((item) => {
    const metadataProcessType =
      typeof item.metadata?.processType === 'string' ? item.metadata.processType : null;
    return (
      item.processType === 'approval' ||
      metadataProcessType === 'approval' ||
      Boolean(item.metadata?.dryRunPreviewTitle) ||
      item.metadata?.sideEffectAllowedBeforeApproval === false ||
      item.metadata?.auditRequired === true
    );
  });
  if (!step) return undefined;
  return {
    ...step.metadata,
    processType: 'approval',
  };
}

function ExecutableTraceActions({ summary }: { summary: ProcessSummary }) {
  const actions = useFitMeetToolUIActions();
  const messageId = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetMessageId?: string;
    };
    return custom.fitmeetMessageId ?? state.message.id;
  });
  const [runtimeKey, actionState] = useCheckpointActionRuntimeState(
    messageId,
    summary.checkpointId,
    summary.stepId,
  );
  const [localActionState, setLocalActionState] = useState<CheckpointActionRuntimeState>(
    EMPTY_CHECKPOINT_ACTION_STATE,
  );
  const busyKey = localActionState.busyKey ?? actionState.busyKey;
  const completedKey = localActionState.completedKey ?? actionState.completedKey;
  const failedKey = localActionState.failedKey ?? actionState.failedKey;
  const error = localActionState.error ?? actionState.error;
  const actionItems = summary.checkpointActions
    .map((checkpointAction) => {
      const handler = handlerForCheckpointAction(checkpointAction.key, actions);
      if (!summary.checkpointId || !handler) return null;
      return {
        ...checkpointAction,
        icon: checkpointActionIcon(checkpointAction.key),
        variant:
          checkpointAction.key === 'resume' || checkpointAction.key === 'retry'
            ? ('primary' as const)
            : ('ghost' as const),
        handler,
      };
    })
    .filter(Boolean) as Array<
    CheckpointToolAction & {
      icon: ReactNode;
      variant: 'ghost' | 'primary';
      handler: NonNullable<
        | typeof actions.onResumeState
        | typeof actions.onRetryTool
        | typeof actions.onReplayState
        | typeof actions.onForkState
      >;
    }
  >;

  const runAction = async (item: (typeof actionItems)[number]) => {
    if (!summary.checkpointId) {
      const nextState = {
        busyKey: null,
        completedKey: null,
        failedKey: item.key,
        error: '当前步骤没有可恢复的检查点。',
      };
      setLocalActionState(nextState);
      setCheckpointActionRuntimeState(runtimeKey, nextState);
      return;
    }
    const pendingState = {
      busyKey: item.key,
      completedKey: null,
      failedKey: null,
      error: null,
    };
    setLocalActionState(pendingState);
    setCheckpointActionRuntimeState(runtimeKey, pendingState);
    try {
      await item.handler({
        messageId,
        checkpointId: summary.checkpointId,
        checkpointAction: item.key,
        checkpointEndpoint: item.endpoint ?? null,
        checkpointMethod: item.method ?? null,
        idempotencyKey: item.idempotencyKey ?? summary.resumeContext.idempotencyKey ?? null,
        stepId: item.stepId ?? summary.stepId ?? undefined,
      });
      const completedState = {
        busyKey: null,
        completedKey: item.key,
        failedKey: null,
        error: null,
      };
      setLocalActionState(completedState);
      setCheckpointActionRuntimeState(runtimeKey, completedState);
    } catch (nextError) {
      const failedState = {
        busyKey: null,
        completedKey: null,
        failedKey: item.key,
        error: nextError instanceof Error ? nextError.message : '操作没有完成，请重试。',
      };
      setLocalActionState(failedState);
      setCheckpointActionRuntimeState(runtimeKey, failedState);
    }
  };

  const completedAction = completedKey
    ? actionItems.find((item) => item.key === completedKey)
    : null;
  const failedAction = failedKey ? actionItems.find((item) => item.key === failedKey) : null;
  const completedActionLabel =
    completedAction?.label ?? checkpointActionLabel(completedKey) ?? null;
  const failedActionKey = failedAction?.key ?? failedKey ?? 'unknown';

  if (actionItems.length === 0 && summary.status !== 'error' && !completedActionLabel && !error) {
    return null;
  }

  return (
    <div className="ml-1 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-black/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-[#52525b]">
          {summary.status === 'error' ? '失败后可继续' : '继续处理'}
        </span>
        {actionItems.map((item) => (
          <ToolActionButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            busyLabel={item.busyLabel}
            busy={busyKey === item.key}
            variant={item.variant}
            data-testid="assistant-ui-checkpoint-action"
            data-checkpoint-action={item.key}
            data-checkpoint-id={String(summary.checkpointId ?? '')}
            data-step-id={item.stepId ?? summary.stepId ?? ''}
            data-step-level={item.stepId ?? summary.stepId ? 'true' : 'false'}
            data-action-source={item.source}
            onClick={() => void runAction(item)}
          />
        ))}
      </div>
      {error ? (
        <p
          className="mt-2 text-xs leading-5 text-red-700"
          data-testid="assistant-ui-checkpoint-action-error"
          data-checkpoint-action={failedActionKey}
          data-checkpoint-id={String(summary.checkpointId ?? '')}
          data-step-id={summary.stepId ?? ''}
        >
          {sanitizePublicText(error) ?? '这一步暂时没有完成，可以重新尝试。'}
        </p>
      ) : null}
      {completedActionLabel ? (
        <p
          className="mt-2 text-xs leading-5 text-emerald-700"
          role="status"
          data-testid="assistant-ui-checkpoint-action-result"
          data-checkpoint-action={completedKey ?? 'unknown'}
          data-checkpoint-id={String(summary.checkpointId ?? '')}
          data-step-id={summary.stepId ?? ''}
        >
          已提交“{completedActionLabel}”，我会沿同一对话继续处理。
        </p>
      ) : null}
    </div>
  );
}

function checkpointActionLabel(key: string | null) {
  if (key === 'retry') return '重试这一步';
  if (key === 'replay') return '重新运行这一步';
  if (key === 'fork') return '生成新版本';
  if (key === 'resume') return '继续处理';
  return null;
}

function checkpointActionIcon(key: CheckpointToolActionKey) {
  if (key === 'resume') return <Send className="h-3.5 w-3.5" />;
  if (key === 'retry') return <RefreshCcw className="h-3.5 w-3.5" />;
  if (key === 'replay') return <History className="h-3.5 w-3.5" />;
  return <GitBranch className="h-3.5 w-3.5" />;
}

function handlerForCheckpointAction(
  key: CheckpointToolActionKey,
  actions: ReturnType<typeof useFitMeetToolUIActions>,
) {
  if (key === 'resume') return actions.onResumeState;
  if (key === 'retry') return actions.onRetryTool;
  if (key === 'replay') return actions.onReplayState;
  return actions.onForkState;
}

function ProcessReplayPanel({ summary }: { summary: ProcessSummary }) {
  const chips = [
    summary.resumeContext.hasCheckpoint
      ? { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: '进度已保存' }
      : null,
    summary.checkpointId && summary.replayable
      ? { icon: <History className="h-3.5 w-3.5" />, label: '可重新运行这一步' }
      : null,
    summary.checkpointId && summary.forkable
      ? { icon: <GitBranch className="h-3.5 w-3.5" />, label: '可生成新版本' }
      : null,
    summary.checkpointId && summary.retryable
      ? { icon: <RefreshCcw className="h-3.5 w-3.5" />, label: '失败可重试' }
      : null,
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>;

  if (chips.length === 0 && summary.status !== 'error') return null;

  return (
    <details className="group/replay ml-8 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-black/5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-[#52525b] marker:hidden">
        <span>继续处理选项</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-[#a1a1aa] transition-transform group-open/replay:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f7f8] px-2.5 py-1 text-xs text-[#71717a] ring-1 ring-black/5"
          >
            {chip.icon}
            {chip.label}
          </span>
        ))}
      </div>
      {summary.retryable ? (
        <p className="mt-2 text-xs leading-5 text-[#71717a]">
          重试只会从保存的步骤继续；重新运行和新版本会沿同一对话恢复上下文。
        </p>
      ) : null}
    </details>
  );
}

function StatusBadge({ status, children }: { status: ProcessStatus; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        status === 'running' && 'bg-blue-50 text-blue-600',
        status === 'complete' && 'bg-emerald-50 text-emerald-600',
        status === 'waiting' && 'bg-amber-50 text-amber-600',
        status === 'error' && 'bg-red-50 text-red-600',
      )}
    >
      {children}
    </span>
  );
}

function statusIcon(status: ProcessStatus) {
  if (status === 'running') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  }
  if (status === 'waiting') {
    return <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
}

function statusText(status: ProcessStatus) {
  if (status === 'running') return '进行中';
  if (status === 'waiting') return '等待确认';
  if (status === 'error') return '需要重试';
  return '已完成';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
