import { useAuiState } from '@assistant-ui/react';
import { CheckCircle2, Loader2, RefreshCcw, Send, ShieldCheck } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { cn } from '../../lib/utils';
import type {
  UserFacingAgentPendingConfirmation,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import { agentApprovalUserFacingText } from '../../lib/agentApprovalCopy';
import { useAssistantMessageRuntime } from './message-runtime-context';
import { sanitizePublicProcessText as sanitizePublicText } from './public-process-text';
import { TOOL_UI_CARD_ACTION_COPY } from './tool-ui-action-copy';
import { useFitMeetToolUIActions } from './tool-ui-actions';
import {
  toolUISchemaActionFromUnknown,
  type SchemaDrivenAssistantCard,
  type ToolUISchemaAction,
} from './tool-ui-schema';

export type VisibleCardAction = {
  id: string | null;
  label: string | null;
  requiresConfirmation: boolean;
  schemaAction: ToolUISchemaAction | null | undefined;
  action: string | null;
  payload?: Record<string, unknown>;
  source: 'backend' | 'default';
};

type CardActionRuntimeState = {
  busyKey: string | null;
  completedKey: string | null;
  failedKey: string | null;
  error: string | null;
  inlineApproval: InlineCardApproval | null;
  inlineDraft: InlineCardDraft | null;
  inlineOutcome: InlineCardOutcome | null;
};

const EMPTY_CARD_ACTION_STATE: CardActionRuntimeState = {
  busyKey: null,
  completedKey: null,
  failedKey: null,
  error: null,
  inlineApproval: null,
  inlineDraft: null,
  inlineOutcome: null,
};

type InlineCardApproval = {
  approvalId?: number | string | null;
  title: string;
  summary: string;
  riskLevel: string;
  actionKey: string;
  confirmLabel: string;
  confirmBusyLabel: string;
  confirmAction?: {
    action: string | null;
    schemaAction: ToolUISchemaAction | null | undefined;
    payload?: Record<string, unknown>;
  } | null;
};

type InlineCardDraft = {
  title: string;
  body: string;
  actionKey: string;
};

type InlineCardOutcome = {
  title: string;
  body: string;
  actionKey: string;
  href?: string | null;
  hrefLabel?: string | null;
};

const cardActionRuntimeState = new Map<string, CardActionRuntimeState>();
const cardActionRuntimeListeners = new Set<() => void>();

export function CardActionSummary(props: {
  card: SchemaDrivenAssistantCard;
  actions: SchemaDrivenAssistantCard['actions'];
}) {
  return <UnifiedActionCard {...props} />;
}

export function UnifiedActionCard({
  card,
  actions,
}: {
  card: SchemaDrivenAssistantCard;
  actions: SchemaDrivenAssistantCard['actions'];
}) {
  const toolActions = useFitMeetToolUIActions();
  const { isLatestAssistantMessage } = useAssistantMessageRuntime();
  const threadRunning = useAuiState((state) => state.thread.isRunning);
  const messageId = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetMessageId?: string;
    };
    return custom.fitmeetMessageId ?? state.message.id;
  });
  const runtimeScope = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetMessageId?: string;
      fitmeetThreadId?: string;
      threadId?: string | number | null;
      fitmeetTaskId?: string | number | null;
      taskId?: string | number | null;
      fitmeetRunId?: string;
      runId?: string | null;
    };
    const messageId = custom.fitmeetMessageId ?? state.message.id;
    return cardActionRuntimeScope({
      threadId:
        custom.fitmeetThreadId ??
        custom.threadId ??
        custom.fitmeetTaskId ??
        custom.taskId,
      runId: custom.fitmeetRunId ?? custom.runId,
      messageId,
    });
  });
  const [runtimeKey, actionState] = useCardActionRuntimeState(runtimeScope, card.id);
  const { busyKey, completedKey, failedKey, error } = actionState;
  const allActions = visibleCardActions(card, actions).slice(0, 5);
  const inlineApproval = actionState.inlineApproval;
  const inlineDraft = actionState.inlineDraft;
  const inlineOutcome = actionState.inlineOutcome;
  const hasInlineCardState = Boolean(inlineApproval || inlineDraft || inlineOutcome);
  const candidateActions =
    isLatestAssistantMessage || completedKey || failedKey || hasInlineCardState
      ? allActions
      : [];
  const keepActionGroupAfterCompletion =
    isLatestAssistantMessage && card.schemaType === 'social_match.candidate';
  const visible =
    completedKey && !keepActionGroupAfterCompletion
      ? candidateActions.filter((action) => cardActionKey(action) === completedKey)
      : candidateActions;
  const completedAction = completedKey
    ? visible.find((action) => cardActionKey(action) === completedKey) ?? null
    : null;
  const failedAction = failedKey
    ? visible.find((action) => cardActionKey(action) === failedKey)
    : null;
  const confirmationNoteId = `tool-action-confirmation-${card.id}`;
  const hasConfirmationActions = visible.some((action) => action.requiresConfirmation);
  if (visible.length === 0 && !inlineApproval && !inlineDraft && !inlineOutcome) return null;

  const runAction = async (action: (typeof visible)[number]) => {
    const key = cardActionKey(action);
    const navigationHref = cardActionNavigationHref(card, action);
    if (navigationHref) {
      navigateToInternalHref(navigationHref);
      return;
    }
    if (isLocalOnlyCardAction(action)) {
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: key,
        failedKey: null,
        error: null,
        inlineApproval: null,
        inlineDraft: null,
        inlineOutcome: null,
      });
      return;
    }
    const localApproval = action.requiresConfirmation
      ? localInlineApprovalForCardAction(card, action)
      : null;
    if (localApproval) {
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: null,
        failedKey: null,
        error: null,
        inlineApproval: localApproval,
        inlineDraft: actionState.inlineDraft,
        inlineOutcome: actionState.inlineOutcome,
      });
      return;
    }
    const replayedApproval = action.requiresConfirmation
      ? inlineApprovalFromCardData(card, allActions, action)
      : null;
    if (replayedApproval) {
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: null,
        failedKey: null,
        error: null,
        inlineApproval: replayedApproval,
        inlineDraft: actionState.inlineDraft,
        inlineOutcome: actionState.inlineOutcome,
      });
      return;
    }
    if (!toolActions.onCardAction) return;
    setCardActionRuntimeState(runtimeKey, {
      busyKey: key,
      completedKey: null,
      failedKey: null,
      error: null,
      inlineDraft: actionState.inlineDraft,
      inlineOutcome: actionState.inlineOutcome,
    });
    try {
      const response = await toolActions.onCardAction({
        messageId,
        taskId: primitiveTaskId(card.data.taskId),
        cardId: card.id,
        action: action.action,
        schemaAction: action.schemaAction,
        payload: payloadForCardAction(card, action),
      });
      const draft = inlineDraftFromResponse(response, key, action);
      if (draft) {
        setCardActionRuntimeState(runtimeKey, {
          busyKey: null,
          completedKey: key,
          failedKey: null,
          error: null,
          inlineApproval: null,
          inlineDraft: draft,
          inlineOutcome: actionState.inlineOutcome,
        });
        return;
      }
      const approval = inlineApprovalFromResponse(
        response,
        key,
        action.schemaAction ?? action.action ?? key,
      );
      if (approval) {
        setCardActionRuntimeState(runtimeKey, {
          busyKey: null,
          completedKey: null,
          failedKey: null,
          error: null,
          inlineApproval: approval,
          inlineDraft: actionState.inlineDraft,
          inlineOutcome: actionState.inlineOutcome,
        });
        return;
      }
      const outcome = inlineOutcomeFromActionResponse(response, key, action);
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: key,
        failedKey: null,
        error: null,
        inlineApproval: null,
        inlineDraft: draft ?? actionState.inlineDraft,
        inlineOutcome: outcome ?? actionState.inlineOutcome,
      });
    } catch (nextError) {
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: null,
        failedKey: key,
        error: nextError instanceof Error ? nextError.message : '当前动作可以重试，不会重复触达对方。',
        inlineApproval: null,
        inlineDraft: actionState.inlineDraft,
        inlineOutcome: actionState.inlineOutcome,
      });
    }
  };

  const resolveInlineApproval = async (decision: 'approved' | 'rejected') => {
    if (!inlineApproval) return;
    const hasApprovalId =
      inlineApproval.approvalId !== null &&
      inlineApproval.approvalId !== undefined &&
      String(inlineApproval.approvalId).trim().length > 0;
    if (decision === 'approved' && !hasApprovalId && inlineApproval.confirmAction) {
      if (!toolActions.onCardAction) {
        setCardActionRuntimeState(runtimeKey, {
          ...actionState,
          busyKey: null,
          failedKey: inlineApproval.actionKey,
          error: '当前确认缺少可执行入口，请刷新后重试。',
        });
        return;
      }
      setCardActionRuntimeState(runtimeKey, {
        ...actionState,
        busyKey: `${inlineApproval.actionKey}:${decision}`,
        failedKey: null,
        error: null,
      });
      try {
        const response = await toolActions.onCardAction({
          messageId,
          cardId: card.id,
          taskId: primitiveTaskId(card.data.taskId),
          action: inlineApproval.confirmAction.action,
          schemaAction: inlineApproval.confirmAction.schemaAction,
          payload: inlineApproval.confirmAction.payload ?? {},
        });
        const chainedApproval = inlineApprovalFromResponse(
          response,
          inlineApproval.actionKey,
          inlineApproval.confirmAction.schemaAction ??
            inlineApproval.confirmAction.action ??
            inlineApproval.actionKey,
        );
        if (chainedApproval) {
          setCardActionRuntimeState(runtimeKey, {
            busyKey: null,
            completedKey: null,
            failedKey: null,
            error: null,
            inlineApproval: chainedApproval,
            inlineDraft: actionState.inlineDraft,
            inlineOutcome: actionState.inlineOutcome,
          });
          return;
        }
        const outcome = inlineOutcomeFromApprovalResponse(response, inlineApproval, decision);
        setCardActionRuntimeState(runtimeKey, {
          busyKey: null,
          completedKey: inlineApproval.actionKey,
          failedKey: null,
          error: null,
          inlineApproval: null,
          inlineDraft: actionState.inlineDraft,
          inlineOutcome: outcome ?? actionState.inlineOutcome,
        });
      } catch (nextError) {
        setCardActionRuntimeState(runtimeKey, {
          ...actionState,
          busyKey: null,
          failedKey: inlineApproval.actionKey,
          error: nextError instanceof Error ? nextError.message : '当前确认可以重试，不会重复执行真实动作。',
        });
      }
      return;
    }
    const handler =
      decision === 'approved' ? toolActions.onApproveApproval : toolActions.onRejectApproval;
    if (!handler || !hasApprovalId) {
      if (decision === 'rejected') {
        setCardActionRuntimeState(runtimeKey, {
          busyKey: null,
          completedKey: null,
          failedKey: null,
          error: null,
          inlineApproval: null,
          inlineDraft: actionState.inlineDraft,
          inlineOutcome: {
            title: '已取消',
            body: '这个动作不会继续执行，也不会触达对方。',
            actionKey: inlineApproval.actionKey,
          },
        });
      }
      return;
    }
    setCardActionRuntimeState(runtimeKey, {
      ...actionState,
      busyKey: `${inlineApproval.actionKey}:${decision}`,
      failedKey: null,
      error: null,
    });
    try {
      const response = await handler({
        messageId,
        cardId: card.id,
        taskId: primitiveTaskId(card.data.taskId),
        approvalId: inlineApproval.approvalId ?? null,
        payload: {
          decision,
          approvalId: inlineApproval.approvalId ?? null,
        },
      });
      const outcome = inlineOutcomeFromApprovalResponse(response, inlineApproval, decision);
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: decision === 'approved' ? inlineApproval.actionKey : null,
        failedKey: null,
        error: null,
        inlineApproval: null,
        inlineDraft: actionState.inlineDraft,
        inlineOutcome: outcome ?? actionState.inlineOutcome,
      });
    } catch (nextError) {
      setCardActionRuntimeState(runtimeKey, {
        ...actionState,
        busyKey: null,
        failedKey: inlineApproval.actionKey,
        error: nextError instanceof Error ? nextError.message : '当前确认可以重试，不会重复执行真实动作。',
      });
    }
  };

  return (
    <div
      className="mt-3 space-y-2"
      data-testid="assistant-ui-unified-action-card"
      data-card-action-model="unified-action-card"
      data-card-schema-type={card.schemaType}
    >
      {visible.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((action) => {
            const key = cardActionKey(action);
            const isBusy = busyKey === key;
            const isCompleted = completedKey === key;
            const isFailed = failedKey === key;
            const isLockedByAnotherAction = Boolean(busyKey && !isBusy);
            const canRetryFailedAction = Boolean(
              isFailed && toolActions.onCardAction && action.schemaAction,
            );
            const isLocalOnlyAction = isLocalOnlyCardAction(action);
            const hasReplayedInlineApproval = Boolean(
              action.requiresConfirmation && inlineApprovalFromCardData(card, allActions, action),
            );
            const executable = Boolean(
              (isLatestAssistantMessage || hasInlineCardState || canRetryFailedAction) &&
                ((toolActions.onCardAction && action.schemaAction) ||
                  isLocalOnlyAction ||
                  hasReplayedInlineApproval),
            );
            const actionStateLabel = cardActionStateLabel(action, isBusy, isCompleted, isFailed);
            return (
              <button
                key={`${action.label}-${action.schemaAction ?? action.action ?? 'action'}`}
                type="button"
                aria-describedby={action.requiresConfirmation ? confirmationNoteId : undefined}
                aria-busy={isBusy}
                data-testid="assistant-ui-schema-action"
                data-schema-action={action.schemaAction ?? 'unknown'}
                data-action-source={action.source}
                data-action-history-state={isLatestAssistantMessage ? 'latest' : 'expired'}
                data-action-executable={executable ? 'true' : 'false'}
                data-action-retryable={canRetryFailedAction ? 'true' : 'false'}
                data-action-handler={toolActions.onCardAction ? 'available' : 'missing'}
                data-requires-confirmation={action.requiresConfirmation ? 'true' : 'false'}
                data-checkpoint-required={actionRequiresCheckpoint(action) ? 'true' : 'false'}
                data-action-state={
                  isBusy ? 'running' : isCompleted ? 'succeeded' : isFailed ? 'failed' : 'idle'
                }
                disabled={
                  (!executable && !canRetryFailedAction) ||
                  (threadRunning && !isFailed) ||
                  isBusy ||
                  isLockedByAnotherAction
                }
                onClick={() => void runAction(action)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition',
                  executable
                    ? 'hover:-translate-y-px hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20'
                    : 'cursor-default',
                  action.requiresConfirmation
                    ? 'bg-amber-50 text-amber-800 ring-amber-100'
                    : 'bg-[#f7f7f8] text-[#52525b] ring-black/5',
                  isCompleted && 'bg-emerald-50 text-emerald-700 ring-emerald-100',
                  isFailed && 'bg-red-50 text-red-700 ring-red-100',
                  isBusy && 'cursor-wait opacity-70',
                  isLockedByAnotherAction && 'opacity-50',
                  !isLatestAssistantMessage && 'opacity-60',
                )}
              >
                {isBusy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : isCompleted ? (
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                ) : isFailed ? (
                  <RefreshCcw className="h-3 w-3" aria-hidden="true" />
                ) : action.requiresConfirmation ? (
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Send className="h-3 w-3" aria-hidden="true" />
                )}
                {actionStateLabel}
              </button>
            );
          })}
        </div>
      ) : null}
      {hasConfirmationActions ? (
        <p
          id={confirmationNoteId}
          className="text-[11px] leading-5 text-amber-700/90"
          data-testid="assistant-ui-touch-confirmation-note"
          data-contact-boundary="approval-required"
        >
          {isLatestAssistantMessage
            ? '不会自动触达对方；涉及真实发送、连接或发布时，我会先等你确认。'
            : '这是历史步骤，确认入口已过期；请使用最新回复里的操作。'}
        </p>
      ) : null}
      {inlineApproval ? (
        <InlineApprovalPanel
          approval={inlineApproval}
          busyKey={busyKey}
          onApprove={() => void resolveInlineApproval('approved')}
          onReject={() => void resolveInlineApproval('rejected')}
        />
      ) : null}
      {inlineDraft ? <InlineDraftPreview draft={inlineDraft} /> : null}
      {inlineOutcome ? <InlineOutcomePreview outcome={inlineOutcome} /> : null}
      {shouldShowCardActionResult(completedAction, inlineDraft, inlineOutcome) ? (
        <p
          className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs leading-5 text-emerald-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-card-action-result"
          data-schema-action={completedAction?.schemaAction ?? 'unknown'}
        >
          {completedAction
            ? cardActionResultMessage(completedAction)
            : '已按你的选择处理，后续结果会继续留在当前对话。'}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-card-action-error"
          data-schema-action={failedAction?.schemaAction ?? 'unknown'}
        >
          {sanitizePublicText(error) ?? '当前动作可以重试，我会沿同一张卡继续处理。'}
        </p>
      ) : null}
    </div>
  );
}

function InlineApprovalPanel({
  approval,
  busyKey,
  onApprove,
  onReject,
}: {
  approval: InlineCardApproval;
  busyKey: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const approving = busyKey === `${approval.actionKey}:approved`;
  const rejecting = busyKey === `${approval.actionKey}:rejected`;
  return (
    <div
      className="rounded-2xl bg-[#f7f7f8] p-3 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
      data-testid="assistant-ui-inline-approval-panel"
      data-component="ApprovalInlinePanel"
      data-risk-level={approval.riskLevel}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[#27272a]">{approval.title}</p>
          <p className="mt-0.5 text-[#71717a]">{approval.summary}</p>
        </div>
      </div>
      <p className="mt-2 rounded-xl bg-white px-2.5 py-1.5 text-[11px] leading-5 text-[#71717a] ring-1 ring-black/[0.04]">
        确认前不会触达对方，也不会公开位置或联系方式。
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onReject}
          disabled={Boolean(busyKey)}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-[#52525b] ring-1 ring-black/10 transition hover:bg-[#f4f4f5] disabled:opacity-60"
        >
          {rejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          取消
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={Boolean(busyKey)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#18181b] px-2.5 py-1 text-xs text-white ring-1 ring-black/10 transition hover:bg-black disabled:opacity-60"
        >
          {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          {approving ? approval.confirmBusyLabel : approval.confirmLabel}
        </button>
      </div>
    </div>
  );
}

function InlineDraftPreview({ draft }: { draft: InlineCardDraft }) {
  return (
    <div
      className="rounded-2xl bg-[#f7f7f8] p-3 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
      data-testid="assistant-ui-inline-draft-preview"
      data-component="InlineOpenerDraft"
      data-action-key={draft.actionKey}
    >
      <p className="font-medium text-[#27272a]">{draft.title}</p>
      <p className="mt-1 rounded-xl bg-white px-2.5 py-2 text-[#3f3f46] ring-1 ring-black/[0.04]">
        {draft.body}
      </p>
      <p className="mt-1.5 text-[11px] text-[#71717a]">
        只有你继续点击发送邀请并确认后，才会触达对方。
      </p>
    </div>
  );
}

function InlineOutcomePreview({ outcome }: { outcome: InlineCardOutcome }) {
  return (
    <div
      className="rounded-2xl bg-emerald-50/80 p-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100"
      data-testid="assistant-ui-inline-outcome-preview"
      data-component="InlineApprovalOutcome"
      data-action-key={outcome.actionKey}
    >
      <p className="font-medium text-emerald-950">{outcome.title}</p>
      <p className="mt-1 text-emerald-900">{outcome.body}</p>
      {outcome.href ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-950 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
          data-testid="assistant-ui-inline-outcome-link"
          onClick={() => navigateToInternalHref(outcome.href ?? '')}
        >
          {outcome.hrefLabel ?? '查看详情'}
        </button>
      ) : null}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function visibleCardActions(
  card: SchemaDrivenAssistantCard,
  actions: SchemaDrivenAssistantCard['actions'],
): VisibleCardAction[] {
  const defaultPayload = defaultCardActionPayload(card);
  const normalized = dedupeVisibleCardActions(
    card.schemaType,
    actions
      .map((action): VisibleCardAction => {
        const rawAction = publicString(action.action);
        const schemaAction = normalizedVisibleSchemaAction(
          card.schemaType,
          toolUISchemaActionFromUnknown(action.schemaAction),
          rawAction,
        );
        const requiresConfirmation = visibleActionRequiresConfirmation(
          schemaAction,
          rawAction,
          action.requiresConfirmation === true,
        );
        return {
          id: publicString(action.id),
          label: normalizeVisibleActionLabel(
            publicDetail(action.label),
            card.schemaType,
            schemaAction,
            rawAction,
            requiresConfirmation,
          ),
          requiresConfirmation,
          schemaAction,
          action: rawAction,
          payload: mergeCardActionPayload(defaultPayload, action.payload),
          source: 'backend',
        };
      })
      .filter((action) => action.label)
      .filter((action) => !shouldHideVisibleCardAction(card.schemaType, card, action)),
  );
  const seen = new Set(
    normalized.map((action) => visibleActionGroupKey(card.schemaType, action)),
  );
  const defaults = defaultCardActions(card).filter((action) => {
    const key = visibleActionGroupKey(card.schemaType, action);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return sortVisibleCardActions(card.schemaType, [...normalized, ...defaults]);
}

function dedupeVisibleCardActions(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  actions: VisibleCardAction[],
) {
  const seen = new Set<string>();
  const result: VisibleCardAction[] = [];
  for (const action of actions) {
    const key = visibleActionGroupKey(schemaType, action);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}

function shouldHideVisibleCardAction(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  card: SchemaDrivenAssistantCard,
  action: VisibleCardAction,
) {
  return (
    schemaType === 'social_match.activity' &&
    action.schemaAction === 'activity.view_detail' &&
    !cardActionNavigationHref(card, action)
  );
}

function visibleActionGroupKey(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  action: VisibleCardAction,
) {
  if (schemaType === 'social_match.empty') {
    const recoveryMode = publicString(action.payload?.recoveryMode);
    if (recoveryMode) return `empty.recovery:${recoveryMode}`;
    if (action.schemaAction === 'candidate.more_like_this') {
      return `empty.more:${action.id ?? action.action ?? action.label ?? 'more'}`;
    }
  }
  if (
    schemaType === 'social_match.activity' &&
    (action.schemaAction === 'activity.modify_time' ||
      action.schemaAction === 'activity.modify_location')
  ) {
    return 'activity.modify';
  }
  const canonicalKey = canonicalVisibleActionKey(schemaType, action);
  if (canonicalKey) return canonicalKey;
  return action.schemaAction ?? action.action ?? action.label ?? 'action';
}

function normalizedVisibleSchemaAction(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  schemaAction: ToolUISchemaAction | undefined,
  rawAction: string | null,
): ToolUISchemaAction | undefined {
  if (
    schemaType === 'social_match.activity' &&
    (schemaAction === 'activity.modify_location' ||
      /^(change_location|activity\.modify_location)$/.test(normalizeActionName(rawAction)))
  ) {
    return 'activity.modify_location';
  }
  if (schemaAction) return schemaAction;
  return canonicalVisibleActionKey(schemaType, { schemaAction, action: rawAction }) ?? undefined;
}

function canonicalVisibleActionKey(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  action: Pick<VisibleCardAction, 'schemaAction' | 'action'>,
): ToolUISchemaAction | null {
  const schemaAction = action.schemaAction;
  const rawAction = normalizeActionName(action.action);
  if (schemaAction) return schemaAction;
  if (schemaType === 'social_match.candidate') {
    if (/^(view_candidate|view_profile|candidate\.view_detail)$/.test(rawAction)) {
      return 'candidate.view_detail';
    }
    if (
      /^(save_candidate|favorite_candidate|bookmark_candidate|collect_candidate|candidate\.save|candidate\.like|candidate\.favorite|candidate\.bookmark)$/.test(
        rawAction,
      )
    ) {
      return 'candidate.like';
    }
    if (/^(generate_opener|draft_opener|candidate\.generate_opener)$/.test(rawAction)) {
      return 'candidate.generate_opener';
    }
    if (/^(send_invite|send_message|send_message_to_candidate|opener\.confirm_send)$/.test(rawAction)) {
      return 'opener.confirm_send';
    }
    if (/^(connect_candidate|add_friend|candidate\.connect)$/.test(rawAction)) {
      return 'candidate.connect';
    }
    if (/^(skip_candidate|candidate\.skip)$/.test(rawAction)) {
      return 'candidate.skip';
    }
  }
  if (schemaType === 'social_match.activity' || schemaType === 'social_match.empty') {
    if (/^(publish_social_request|publish_to_discover)$/.test(rawAction)) {
      return 'publish_to_discover';
    }
    if (/^(create_activity|activity\.confirm_create)$/.test(rawAction)) {
      return 'activity.confirm_create';
    }
    if (/^(modify_activity|change_time|activity\.modify_time)$/.test(rawAction)) {
      return 'activity.modify_time';
    }
    if (/^(change_location|activity\.modify_location)$/.test(rawAction)) {
      return 'activity.modify_location';
    }
    if (/^(skip_publish|activity\.skip_publish)$/.test(rawAction)) {
      return 'activity.skip_publish';
    }
    if (/^(expand_radius|relax_preference|candidate\.more_like_this)$/.test(rawAction)) {
      return 'candidate.more_like_this';
    }
  }
  return null;
}

function visibleActionRequiresConfirmation(
  schemaAction: ToolUISchemaAction | undefined,
  rawAction: string | null,
  rawRequiresConfirmation: boolean,
) {
  const normalizedRawAction = normalizeActionName(rawAction);
  if (isLowRiskVisibleAction(schemaAction, normalizedRawAction)) return false;
  if (isHighRiskVisibleAction(schemaAction, normalizedRawAction)) return true;
  return rawRequiresConfirmation;
}

const LOW_RISK_VISIBLE_SCHEMA_ACTIONS = new Set<ToolUISchemaAction>([
  'candidate.view_detail',
  'candidate.like',
  'candidate.generate_opener',
  'candidate.more_like_this',
  'candidate.skip',
  'activity.view_detail',
  'activity.modify_time',
  'activity.modify_location',
  'activity.skip_publish',
  'opener.regenerate',
  'opener.reject',
]);

const LOW_RISK_VISIBLE_RAW_ACTIONS = new Set([
  'save_candidate',
  'favorite_candidate',
  'bookmark_candidate',
  'collect_candidate',
  'candidate.like',
  'candidate.save',
  'candidate.favorite',
  'candidate.bookmark',
  'generate_opener',
  'draft_opener',
  'candidate.generate_opener',
  'view_candidate',
  'candidate.view_detail',
  'skip_candidate',
  'candidate.skip',
  'candidate.more_like_this',
  'expand_radius',
  'relax_preference',
  'activity.view_detail',
  'activity.modify_time',
  'activity.modify_location',
  'activity.skip_publish',
  'change_time',
  'modify_activity',
  'skip_publish',
  'opener.regenerate',
  'opener.reject',
]);

const HIGH_RISK_VISIBLE_SCHEMA_ACTIONS = new Set<ToolUISchemaAction>([
  'candidate.connect',
  'opener.confirm_send',
  'publish_to_discover',
  'activity.confirm_create',
]);

const HIGH_RISK_VISIBLE_RAW_ACTIONS = new Set([
  'connect_candidate',
  'candidate.connect',
  'add_friend',
  'send_invite',
  'send_message',
  'send_message_to_candidate',
  'opener.confirm_send',
  'publish_social_request',
  'publish_to_discover',
  'create_activity',
  'activity.confirm_create',
  'exchange_contact',
  'reveal_precise_location',
  'update_sensitive_profile',
]);

function isLowRiskVisibleAction(
  schemaAction: ToolUISchemaAction | undefined,
  normalizedRawAction: string,
) {
  return (
    (schemaAction ? LOW_RISK_VISIBLE_SCHEMA_ACTIONS.has(schemaAction) : false) ||
    LOW_RISK_VISIBLE_RAW_ACTIONS.has(normalizedRawAction)
  );
}

function isHighRiskVisibleAction(
  schemaAction: ToolUISchemaAction | undefined,
  normalizedRawAction: string,
) {
  return (
    (schemaAction ? HIGH_RISK_VISIBLE_SCHEMA_ACTIONS.has(schemaAction) : false) ||
    HIGH_RISK_VISIBLE_RAW_ACTIONS.has(normalizedRawAction)
  );
}

function normalizeActionName(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sortVisibleCardActions(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  actions: VisibleCardAction[],
): VisibleCardAction[] {
  const preferredOrder =
    schemaType === 'social_match.candidate'
      ? [
          'candidate.view_detail',
          'candidate.like',
          'candidate.generate_opener',
          'opener.confirm_send',
          'candidate.connect',
          'candidate.skip',
          'candidate.more_like_this',
        ]
      : schemaType === 'social_match.activity'
        ? [
            'publish_to_discover',
            'activity.confirm_create',
            'activity.modify_time',
            'activity.skip_publish',
            'activity.view_detail',
            'activity.modify_location',
            'activity.check_in',
            'activity.complete',
          ]
        : schemaType === 'social_match.empty'
          ? [
              'publish_to_discover',
              'candidate.more_like_this',
              'activity.modify_time',
              'activity.skip_publish',
            ]
          : schemaType === 'meet_loop.timeline'
            ? [
                'activity.check_in',
                'activity.complete',
                'review.submit',
                'life_graph.accept_update',
                'meet_loop.resume',
                'meet_loop.reschedule',
                'activity.upload_proof',
              ]
            : [];
  if (preferredOrder.length === 0) return actions;
  const rank = new Map(preferredOrder.map((item, index) => [item, index]));
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const leftRank = rank.get(actionSortKey(schemaType, left.action)) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(actionSortKey(schemaType, right.action)) ?? Number.MAX_SAFE_INTEGER;
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank;
    })
    .map((item) => item.action);
}

function actionSortKey(
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  action: VisibleCardAction,
) {
  if (action.schemaAction === 'activity.modify_location') return 'activity.modify_time';
  return canonicalVisibleActionKey(schemaType, action) ?? action.schemaAction ?? '';
}

function payloadForCardAction(
  card: SchemaDrivenAssistantCard,
  action: VisibleCardAction,
): Record<string, unknown> {
  const payload = action.payload ?? defaultCardActionPayload(card);
  if (!action.requiresConfirmation) return payload;
  return stripEmptyPayloadFields({
    ...payload,
    approvalRequired: true,
    checkpointRequired: payload.checkpointRequired ?? true,
    resumeMode: payload.resumeMode ?? 'resume_after_approval',
  });
}

function actionRequiresCheckpoint(action: VisibleCardAction) {
  return (
    action.requiresConfirmation === true ||
    action.payload?.checkpointRequired === true ||
    action.payload?.approvalRequired === true
  );
}

function cardActionKey(action: VisibleCardAction) {
  return action.id ?? action.schemaAction ?? action.action ?? action.label ?? 'action';
}

function cardActionStateLabel(
  action: {
    label: string | null;
    schemaAction: ToolUISchemaAction | null | undefined;
    action: string | null;
  },
  isBusy: boolean,
  isCompleted: boolean,
  isFailed: boolean,
) {
  if (isFailed) return `重试${action.label ?? '这个动作'}`;
  if (!isBusy && !isCompleted) return action.label;
  if (action.schemaAction) {
    const copy = TOOL_UI_CARD_ACTION_COPY[action.schemaAction];
    return isBusy ? copy.busy : copy.done;
  }
  return isBusy ? '处理中' : '已继续处理';
}

function cardActionResultMessage(action: VisibleCardAction) {
  if (action.schemaAction) {
    return TOOL_UI_CARD_ACTION_COPY[action.schemaAction].result;
  }
  return '已按你的选择处理，后续结果会继续留在当前对话。';
}

function shouldShowCardActionResult(
  completedAction: VisibleCardAction | null,
  inlineDraft: InlineCardDraft | null,
  inlineOutcome: InlineCardOutcome | null,
) {
  if (!completedAction) return false;
  if (inlineDraft || inlineOutcome) return false;
  return completedAction.requiresConfirmation;
}

function inlineApprovalFromResponse(
  response: UserFacingAgentResponse | void,
  actionKey: string,
  semanticActionKey = actionKey,
): InlineCardApproval | null {
  if (!response) return null;
  if (response.pendingConfirmations?.length) {
    const confirmation =
      response.pendingConfirmations.find(
        (item) =>
          item.id !== null &&
          item.id !== undefined &&
          confirmationMatchesActionKey(item, semanticActionKey),
      ) ??
      response.pendingConfirmations.find((item) => item.id !== null && item.id !== undefined) ??
      response.pendingConfirmations[0];
    return inlineApprovalFromConfirmation(confirmation, actionKey);
  }
  const approvalCard = response.cards.find((card) => {
    const schemaType = publicString(card.schemaType) ?? publicString(card.data?.schemaType);
    return schemaType === 'safety.approval' || isRecord(card.data?.approval);
  });
  if (!approvalCard) return null;
  const approvalData = isRecord(approvalCard.data?.approval) ? approvalCard.data.approval : {};
  const actionType =
    publicString(approvalData.actionType) ??
    publicString(approvalData.action) ??
    semanticActionKey;
  const summary =
    publicDetail(approvalData.summary) ??
    publicDetail(approvalData.boundary) ??
    publicDetail(approvalCard.body) ??
    publicDetail(approvalCard.title) ??
    '确认前不会触达对方或公开敏感信息。';
  const riskLevel =
    publicString(approvalData.riskLevel) ??
    publicString(approvalCard.data?.riskLevel) ??
    'medium';
  const confirmAction = inlineApprovalConfirmActionFromCard(approvalCard);
  const approvalId = firstPublicPrimitive(
    approvalCard.data?.approvalId,
    approvalData.id,
    approvalCard.data?.id,
  );
  if (approvalId === null && confirmAction) {
    return {
      approvalId: null,
      title: approvalTitleForAction(actionType),
      summary: approvalSummaryForAction(actionType, summary),
      riskLevel,
      actionKey,
      confirmLabel: approvalConfirmLabelForAction(actionKey, actionType),
      confirmBusyLabel: approvalConfirmBusyLabelForAction(actionKey, actionType),
      confirmAction,
    };
  }
  if (approvalId === null) return null;
  return inlineApprovalFromRawConfirmation(
    {
      id: approvalId,
      type: publicString(approvalData.type) ?? publicString(approvalCard.type) ?? 'action',
      actionType,
      summary,
      riskLevel,
    },
    actionKey,
  );
}

function inlineApprovalConfirmActionFromCard(
  card: UserFacingAgentResponse['cards'][number],
): InlineCardApproval['confirmAction'] {
  const actions = Array.isArray(card.actions) ? card.actions : [];
  const rawAction = actions.find((item) => {
    const schemaAction = toolUISchemaActionFromUnknown(item.schemaAction);
    const action = publicString(item.action);
    return (
      item.requiresConfirmation === true ||
      schemaAction === 'opener.confirm_send' ||
      schemaAction === 'candidate.connect' ||
      schemaAction === 'publish_to_discover' ||
      schemaAction === 'activity.confirm_create' ||
      /send|invite|connect|publish|create/i.test(action ?? '')
    );
  });
  if (!rawAction) return null;
  return {
    action: publicString(rawAction.action),
    schemaAction: toolUISchemaActionFromUnknown(rawAction.schemaAction),
    payload: isRecord(rawAction.payload) ? rawAction.payload : {},
  };
}

function inlineDraftFromResponse(
  response: UserFacingAgentResponse | void,
  actionKey: string,
  action: VisibleCardAction,
): InlineCardDraft | null {
  if (
    action.schemaAction !== 'candidate.generate_opener' &&
    action.schemaAction !== 'opener.regenerate'
  ) {
    return null;
  }
  const card = response?.cards.find((item) => {
    const schemaType = publicString(item.schemaType) ?? publicString(item.data?.schemaType);
    const type = publicString(item.type);
    return schemaType === 'social_match.candidate' || type === 'opener_approval';
  });
  if (!card) return null;
  const body =
    publicDetail(card.data?.suggestedOpener) ??
    publicDetail(card.data?.message) ??
    publicDetail(card.body) ??
    publicDetail(response?.assistantMessage);
  if (!body) return null;
  return {
    title: publicDetail(card.title) ?? '开场白草稿',
    body,
    actionKey,
  };
}

function inlineOutcomeFromActionResponse(
  response: UserFacingAgentResponse | void,
  actionKey: string,
  action: VisibleCardAction,
): InlineCardOutcome | null {
  if (
    action.schemaAction !== 'candidate.like' &&
    action.schemaAction !== 'candidate.skip' &&
    action.schemaAction !== 'candidate.more_like_this' &&
    action.schemaAction !== 'candidate.view_detail' &&
    action.schemaAction !== 'publish_to_discover' &&
    action.schemaAction !== 'activity.view_detail' &&
    action.schemaAction !== 'activity.modify_time' &&
    action.schemaAction !== 'activity.modify_location' &&
    action.schemaAction !== 'activity.skip_publish'
  ) {
    return null;
  }
  const firstCard = response?.cards[0];
  const stableBody = inlineOutcomeStableBody(action.schemaAction);
  const body =
    stableBody ??
    publicDetail(response?.assistantMessage) ??
    publicDetail(firstCard?.body) ??
    publicDetail(firstCard?.title) ??
    inlineOutcomeFallbackBody(action.schemaAction);
  return {
    title: inlineOutcomeTitle(action.schemaAction),
    body,
    actionKey,
    href: inlineOutcomeHrefFromResponse(response, action.schemaAction),
    hrefLabel:
      action.schemaAction === 'publish_to_discover' ? '查看发现详情' : null,
  };
}

function inlineOutcomeStableBody(schemaAction: ToolUISchemaAction | null | undefined) {
  if (schemaAction === 'candidate.like') {
    return '已记录这个候选，后续推荐会参考你的选择。';
  }
  if (schemaAction === 'candidate.skip') {
    return '已跳过这个候选，后续会减少类似推荐。';
  }
  if (schemaAction === 'candidate.more_like_this') {
    return '我会沿着当前条件继续找类似机会。';
  }
  if (schemaAction === 'activity.skip_publish') {
    return '这张约练卡已保留为草稿，暂时不会发布到发现。';
  }
  if (schemaAction === 'publish_to_discover') {
    return '这张约练卡已发布到发现页，公开可发现用户可以看到。';
  }
  return null;
}

function inlineOutcomeTitle(schemaAction: ToolUISchemaAction | null | undefined) {
  if (schemaAction === 'candidate.like') return '已收藏';
  if (schemaAction === 'candidate.skip') return '已跳过';
  if (schemaAction === 'candidate.more_like_this') return '继续找类似机会';
  if (schemaAction === 'publish_to_discover') return '已发布到发现';
  if (schemaAction === 'activity.skip_publish') return '已暂不发布';
  if (schemaAction === 'activity.modify_time' || schemaAction === 'activity.modify_location') {
    return '已准备修改';
  }
  if (schemaAction === 'activity.view_detail') return '活动详情';
  return '候选详情';
}

function inlineOutcomeFallbackBody(schemaAction: ToolUISchemaAction | null | undefined) {
  if (schemaAction === 'candidate.like') {
    return '已记录这个候选，后续推荐会参考你的选择。';
  }
  if (schemaAction === 'candidate.skip') {
    return '已跳过这个候选，后续会减少类似推荐。';
  }
  if (schemaAction === 'candidate.more_like_this') {
    return '我会沿着当前条件继续找类似机会。';
  }
  if (schemaAction === 'activity.skip_publish') {
    return '这张约练卡已作为草稿保留，暂时不会发布到发现。';
  }
  if (schemaAction === 'publish_to_discover') {
    return '这张约练卡已发布到发现页，公开可发现用户可以看到。';
  }
  if (schemaAction === 'activity.modify_time') {
    return '可以继续告诉我新的时间，我会按新的安排更新这张约练卡。';
  }
  if (schemaAction === 'activity.modify_location') {
    return '可以继续告诉我新的大致区域，我会按新的地点范围更新这张约练卡。';
  }
  if (schemaAction === 'activity.view_detail') {
    return '活动详情已整理在当前卡片里。';
  }
  return '候选详情已整理在当前卡片里。';
}

function localInlineApprovalForCardAction(
  card: SchemaDrivenAssistantCard,
  action: VisibleCardAction,
): InlineCardApproval | null {
  if (action.schemaAction !== 'publish_to_discover') return null;
  const payload = payloadForCardAction(card, action);
  return {
    approvalId: null,
    title: '确认发布到发现',
    summary: '确认后这张约练卡才会出现在发现页；你可以先修改或暂不发布。',
    riskLevel: 'medium',
    actionKey: cardActionKey(action),
    confirmLabel: '确认发布',
    confirmBusyLabel: '正在发布',
    confirmAction: {
      action: 'publish_to_discover',
      schemaAction: 'publish_to_discover',
      payload: {
        ...payload,
        confirmedPublish: true,
      },
    },
  };
}

function inlineOutcomeFromApprovalResponse(
  response: UserFacingAgentResponse | void,
  approval: InlineCardApproval,
  decision: 'approved' | 'rejected',
): InlineCardOutcome | null {
  if (decision === 'rejected') {
    return {
      title: '已取消',
      body:
        publicDetail(response?.assistantMessage) ??
        '这个动作不会继续执行，也不会触达对方。',
      actionKey: approval.actionKey,
    };
  }
  if (isCandidateConnectApproval(approval)) {
    return {
      title: '邀约进展',
      body: candidateConnectOutcomeBody(response),
      actionKey: approval.actionKey,
    };
  }
  const meetLoop = response?.cards.find((item) => {
    const schemaType = publicString(item.schemaType) ?? publicString(item.data?.schemaType);
    return schemaType === 'meet_loop.timeline';
  });
  if (meetLoop) {
    return {
      title: publicDetail(meetLoop.title) ?? '邀约进展',
      body:
        publicDetail(meetLoop.body) ??
        publicDetail(meetLoop.data?.nextAction) ??
        publicDetail(response?.assistantMessage) ??
        '已按你的确认继续，后续进展会留在当前对话。',
      actionKey: approval.actionKey,
    };
  }
  if (!response?.assistantMessage) return null;
  const publishedHref = inlineOutcomeHrefFromResponse(response, 'publish_to_discover');
  if (publishedHref && /publish|social_request|发现|发布/i.test(approval.actionKey)) {
    return {
      title: '已发布到发现',
      body:
        publicDetail(response.assistantMessage) ??
        '这张约练卡已发布到发现页，公开可发现用户可以看到。',
      actionKey: approval.actionKey,
      href: publishedHref,
      hrefLabel: '查看发现详情',
    };
  }
  return {
    title: inlineApprovalApprovedTitle(approval),
    body: publicDetail(response.assistantMessage) ?? '已按你的确认继续。',
    actionKey: approval.actionKey,
  };
}

function inlineOutcomeHrefFromResponse(
  response: UserFacingAgentResponse | void,
  schemaAction: ToolUISchemaAction | null | undefined,
) {
  if (schemaAction !== 'publish_to_discover' && schemaAction !== 'activity.view_detail') {
    return null;
  }
  for (const card of response?.cards ?? []) {
    const direct = firstSafeInternalHref(
      card.data?.discoverHref,
      card.data?.detailHref,
      card.data?.activityHref,
      card.data?.href,
    );
    if (direct) return direct;
    const publicIntentId = firstPublicPrimitive(card.data?.publicIntentId);
    if (publicIntentId !== null) {
      return `/public-intent/${encodeURIComponent(String(publicIntentId))}`;
    }
    const socialRequestId = firstPublicPrimitive(card.data?.socialRequestId);
    if (socialRequestId !== null) {
      return `/social-request/${encodeURIComponent(String(socialRequestId))}`;
    }
  }
  return null;
}

function candidateConnectOutcomeBody(response: UserFacingAgentResponse | void) {
  const body =
    publicDetail(response?.assistantMessage) ??
    '站内沟通入口已准备好，后续回复会继续保存在这段对话里。';
  if (body.includes('站内沟通入口')) return body;
  return `${body} 站内沟通入口已准备好，后续回复会继续保存在这段对话里。`;
}

function isCandidateConnectApproval(approval: InlineCardApproval) {
  const text = `${approval.actionKey} ${approval.title} ${approval.summary}`.toLowerCase();
  if (/send|message|invite|opener|发送|私信|邀请|开场白/.test(text)) return false;
  return /connect|friend|contact|加好友|好友|连接|联系/.test(text);
}

function inlineApprovalApprovedTitle(approval: InlineCardApproval) {
  const text = `${approval.actionKey} ${approval.title} ${approval.summary}`.toLowerCase();
  if (/send|message|invite|opener|发送|私信|邀请|开场白/.test(text)) return '邀请已确认';
  if (/connect|friend|candidate|contact|加好友|好友|连接|候选|联系/.test(text)) {
    return '好友申请已确认';
  }
  if (/publish|social_request|activity|meet|create|发现|发布|活动|约练|创建/.test(text)) {
    return '发布已确认';
  }
  if (/location|precise|exchange|reveal|位置|联系方式|公开/.test(text)) {
    return '公开前确认已记录';
  }
  return '确认已记录';
}

function inlineApprovalFromCardData(
  card: SchemaDrivenAssistantCard,
  actions: VisibleCardAction[],
  preferredAction?: VisibleCardAction,
): InlineCardApproval | null {
  const preferredActionKey = preferredAction ? cardActionKey(preferredAction) : null;
  const preferredKeys = [
    preferredActionKey,
    preferredAction?.schemaAction,
    preferredAction?.action,
  ].filter((value): value is string => Boolean(value));
  const rawMap = isRecord(card.data.inlineApprovalConfirmations)
    ? card.data.inlineApprovalConfirmations
    : null;
  if (rawMap) {
    for (const key of preferredKeys) {
      const mapped = rawMap[key];
      if (!isRecord(mapped)) continue;
      const approval = inlineApprovalFromRawConfirmation(mapped, key);
      if (approval) return approval;
    }
    if (preferredAction) {
      const semanticActionKey =
        preferredAction.schemaAction ??
        preferredAction.action ??
        preferredActionKey ??
        'approval';
      for (const [key, mapped] of Object.entries(rawMap)) {
        if (!isRecord(mapped)) continue;
        if (!rawInlineApprovalMatchesAction(mapped, semanticActionKey, key)) continue;
        const approval = inlineApprovalFromRawConfirmation(mapped, semanticActionKey);
        if (approval) return approval;
      }
    }
  }
  const raw = isRecord(card.data.inlineApprovalConfirmation)
    ? card.data.inlineApprovalConfirmation
    : null;
  if (!raw) return null;
  const actionKey =
    (preferredAction ? cardActionKey(preferredAction) : null) ??
    publicString(raw.actionKey) ??
    actions.find((action) => action.requiresConfirmation)?.schemaAction ??
    actions.find((action) => action.requiresConfirmation)?.action ??
    actions[0]?.schemaAction ??
    actions[0]?.action ??
    'approval';
  const rawActionKey = publicString(raw.actionKey);
  if (preferredAction && rawActionKey && !preferredKeys.includes(rawActionKey)) {
    return null;
  }
  return inlineApprovalFromRawConfirmation(raw, actionKey);
}

function rawInlineApprovalMatchesAction(
  raw: Record<string, unknown>,
  semanticActionKey: string,
  mapKey: string,
) {
  if (mapKey === semanticActionKey) return true;
  return confirmationMatchesActionKey(
    {
      id: publicString(raw.id) ?? 0,
      type: publicString(raw.type) ?? 'action',
      actionType: publicString(raw.actionType) ?? publicString(raw.action) ?? mapKey,
      summary: publicDetail(raw.summary) ?? publicDetail(raw.title) ?? mapKey,
      riskLevel: publicString(raw.riskLevel) ?? 'medium',
      expiresAt: publicString(raw.expiresAt),
    },
    semanticActionKey,
  );
}

function inlineApprovalFromRawConfirmation(
  raw: Record<string, unknown>,
  actionKey: string,
): InlineCardApproval | null {
  const id = raw.id;
  if (id === null || id === undefined || (typeof id !== 'number' && typeof id !== 'string')) {
    return null;
  }
  return inlineApprovalFromConfirmation(
    {
      id,
      type: publicString(raw.type) ?? 'action',
      actionType: publicString(raw.actionType) ?? actionKey,
      summary: publicDetail(raw.summary) ?? '确认前不会触达对方或公开敏感信息。',
      riskLevel: publicString(raw.riskLevel) ?? 'medium',
      expiresAt: publicString(raw.expiresAt),
    },
    publicString(raw.actionKey) ?? actionKey,
  );
}

function inlineApprovalFromConfirmation(
  confirmation: UserFacingAgentPendingConfirmation,
  actionKey: string,
): InlineCardApproval | null {
  if (confirmation.id === null || confirmation.id === undefined) return null;
  return {
    approvalId: confirmation.id,
    title: approvalTitleForAction(confirmation.actionType),
    summary: approvalSummaryForAction(confirmation.actionType, confirmation.summary),
    riskLevel: sanitizePublicText(confirmation.riskLevel) ?? 'medium',
    actionKey,
    confirmLabel: approvalConfirmLabelForAction(actionKey, confirmation.actionType),
    confirmBusyLabel: approvalConfirmBusyLabelForAction(actionKey, confirmation.actionType),
  };
}

function confirmationMatchesActionKey(
  confirmation: UserFacingAgentPendingConfirmation,
  actionKey: string,
) {
  const actionText = [
    confirmation.actionType,
    confirmation.type,
    confirmation.summary,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (actionKey === 'candidate.connect') {
    return /connect|friend|candidate|contact|加好友|好友|连接|候选|联系/.test(actionText);
  }
  if (actionKey === 'opener.confirm_send') {
    return /send|message|invite|opener|发送|私信|邀请|开场白/.test(actionText);
  }
  if (actionKey === 'publish_to_discover') {
    return /publish|social_request|发现|发布/.test(actionText);
  }
  if (actionKey === 'activity.confirm_create') {
    return /activity|meet|create|活动|约练|创建/.test(actionText);
  }
  return actionText.includes(actionKey.toLowerCase());
}

function approvalTitleForAction(actionType: string) {
  if (/send|message|invite/i.test(actionType)) return '确认发送邀请';
  if (/connect|friend|candidate\.connect/i.test(actionType)) return '确认加好友并聊天';
  if (/publish|social_request/i.test(actionType)) {
    return '确认发布到发现';
  }
  if (/activity|meet|create/i.test(actionType)) return '确认创建约练';
  return '确认继续';
}

function approvalConfirmLabelForAction(actionKey: string, actionType: string) {
  const text = `${actionType} ${actionKey}`;
  if (/send|message|invite|opener/i.test(text)) return '确认发送';
  if (/connect|friend|candidate/i.test(text)) return '确认加好友';
  if (/publish|social_request/i.test(text)) return '确认发布';
  if (/activity|meet|create/i.test(text)) return '确认创建';
  if (/contact|location|precise|exchange/i.test(text)) return '确认公开';
  return '确认继续';
}

function approvalConfirmBusyLabelForAction(actionKey: string, actionType: string) {
  const label = approvalConfirmLabelForAction(actionKey, actionType);
  if (label === '确认加好友') return '正在加好友';
  if (label === '确认发送') return '正在发送';
  if (label === '确认发布') return '正在发布';
  if (label === '确认创建') return '正在创建';
  if (label === '确认公开') return '正在公开';
  return '正在继续';
}

function approvalSummaryForAction(actionType: string, rawSummary: string | null | undefined) {
  const summary = rawSummary
    ? agentApprovalUserFacingText(sanitizePublicText(rawSummary))
    : null;
  const technical =
    !summary ||
    /risk|medium|high|low|checkpoint|dry[- ]?run|audit|approval|风险等级|状态已保存|等待保存点|审计|保存点|审批/i.test(
      summary,
    );
  if (/send|message|invite/i.test(actionType)) {
    return technical
      ? '确认后才会发送邀请内容；发送前不会联系对方。'
      : summary;
  }
  if (/connect|friend|candidate\.connect/i.test(actionType)) {
    return technical
      ? '确认后才会向对方发起连接；你可以先查看详情或取消。'
      : summary;
  }
  if (/publish|social_request/i.test(actionType)) {
    return technical
      ? '确认后这张约练卡才会出现在发现页；你可以先修改或暂不发布。'
      : summary;
  }
  if (/activity|meet|create/i.test(actionType)) {
    return technical ? '确认后才会创建线下约练；你可以先修改或取消。' : summary;
  }
  return technical ? '确认前不会触达对方或公开敏感信息。' : summary;
}

function mergeCardActionPayload(
  defaultPayload: Record<string, unknown>,
  actionPayload: unknown,
): Record<string, unknown> {
  if (!isRecord(actionPayload)) return defaultPayload;
  return stripEmptyPayloadFields({
    ...defaultPayload,
    ...actionPayload,
  });
}

function normalizeVisibleActionLabel(
  label: string | null,
  schemaType: SchemaDrivenAssistantCard['schemaType'],
  schemaAction: ToolUISchemaAction | undefined,
  action: string | null,
  requiresConfirmation: boolean,
) {
  const canonicalKey = canonicalVisibleActionKey(schemaType, { schemaAction, action });
  if (canonicalKey === 'candidate.view_detail') {
    return '查看详情';
  }
  if (canonicalKey === 'candidate.connect') {
    return requiresConfirmation ? '加好友并聊天' : '加好友并聊天';
  }
  if (canonicalKey === 'candidate.like') return '收藏';
  if (canonicalKey === 'candidate.generate_opener') {
    return '生成开场白';
  }
  if (canonicalKey === 'opener.confirm_send') {
    return '发送邀请';
  }
  if (schemaType === 'social_match.activity' && canonicalKey === 'publish_to_discover') {
    return '发布到发现';
  }
  if (schemaType === 'social_match.activity' && canonicalKey === 'activity.confirm_create') {
    return '创建约练';
  }
  if (schemaType === 'social_match.activity' && canonicalKey === 'activity.skip_publish') {
    return '暂不发布';
  }
  if (
    schemaType === 'social_match.activity' &&
    (canonicalKey === 'activity.modify_time' || canonicalKey === 'activity.modify_location')
  ) {
    return '修改';
  }
  return label;
}

function defaultCardActions(card: SchemaDrivenAssistantCard): VisibleCardAction[] {
  const basePayload = defaultCardActionPayload(card);
  if (card.schemaType === 'social_match.candidate') {
    return [
      {
        id: `${card.id}:view`,
        label: '查看详情',
        requiresConfirmation: false,
        schemaAction: 'candidate.view_detail',
        action: 'candidate.view_detail',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:opener`,
        label: '生成开场白',
        requiresConfirmation: false,
        schemaAction: 'candidate.generate_opener',
        action: 'candidate.generate_opener',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:save`,
        label: '收藏',
        requiresConfirmation: false,
        schemaAction: 'candidate.like',
        action: 'candidate.like',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:send-invite`,
        label: '发送邀请',
        requiresConfirmation: true,
        schemaAction: 'opener.confirm_send',
        action: 'opener.confirm_send',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:connect`,
        label: '加好友并聊天',
        requiresConfirmation: true,
        schemaAction: 'candidate.connect',
        action: 'candidate.connect',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'social_match.activity') {
    return [
      {
        id: `${card.id}:publish`,
        label: '发布到发现',
        requiresConfirmation: true,
        schemaAction: 'publish_to_discover',
        action: 'publish_to_discover',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:edit`,
        label: '修改',
        requiresConfirmation: false,
        schemaAction: 'activity.modify_time',
        action: 'activity.modify_time',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:skip-publish`,
        label: '暂不发布',
        requiresConfirmation: false,
        schemaAction: 'activity.skip_publish',
        action: 'activity.skip_publish',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'social_match.empty') {
    return [
      {
        id: `${card.id}:publish`,
        label: '发布到发现',
        requiresConfirmation: true,
        schemaAction: 'publish_to_discover',
        action: 'publish_to_discover',
        payload: { ...basePayload, recoveryMode: 'publish_to_discover' },
        source: 'default' as const,
      },
      {
        id: `${card.id}:expand`,
        label: '扩大范围',
        requiresConfirmation: false,
        schemaAction: 'candidate.more_like_this',
        action: 'expand_radius',
        payload: { ...basePayload, recoveryMode: 'expand_radius' },
        source: 'default' as const,
      },
      {
        id: `${card.id}:change-time`,
        label: '换个时间',
        requiresConfirmation: false,
        schemaAction: 'activity.modify_time',
        action: 'change_time',
        payload: { ...basePayload, recoveryMode: 'change_time' },
        source: 'default' as const,
      },
      {
        id: `${card.id}:relax`,
        label: '放宽偏好',
        requiresConfirmation: false,
        schemaAction: 'candidate.more_like_this',
        action: 'relax_preference',
        payload: { ...basePayload, recoveryMode: 'relax_preference' },
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'life_graph.diff') {
    return [
      {
        id: `${card.id}:accept`,
        label: '确认更新',
        requiresConfirmation: true,
        schemaAction: 'life_graph.accept_update',
        action: 'life_graph.accept_update',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:reject`,
        label: '暂不写入',
        requiresConfirmation: false,
        schemaAction: 'life_graph.reject_update',
        action: 'life_graph.reject_update',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'meet_loop.timeline') {
    if (meetLoopCurrentStepKey(card) === 'met') {
      return [
        {
          id: `${card.id}:complete`,
          label: '确认完成',
          requiresConfirmation: true,
          schemaAction: 'activity.complete',
          action: 'activity.complete',
          payload: basePayload,
          source: 'default' as const,
        },
        {
          id: `${card.id}:reschedule`,
          label: '调整时间',
          requiresConfirmation: true,
          schemaAction: 'meet_loop.reschedule',
          action: 'meet_loop.reschedule',
          payload: basePayload,
          source: 'default' as const,
        },
      ];
    }
    return [
      {
        id: `${card.id}:resume`,
        label: '继续推进',
        requiresConfirmation: true,
        schemaAction: 'meet_loop.resume',
        action: 'meet_loop.resume',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:reschedule`,
        label: '调整时间',
        requiresConfirmation: true,
        schemaAction: 'meet_loop.reschedule',
        action: 'meet_loop.reschedule',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  return [];
}

function meetLoopCurrentStepKey(card: SchemaDrivenAssistantCard) {
  const stageText = [
    card.data.loopStage,
    card.data.stage,
    card.data.status,
    card.status,
  ]
    .map((item) => publicString(item)?.toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (/met|meet|offline|checkin|check_in|checked_in|arrived|到达|签到|见面/.test(stageText)) {
    return 'met';
  }
  if (/review|completed|complete|评价/.test(stageText)) return 'completed';
  if (/life|graph|trust|画像|回写/.test(stageText)) return 'life_graph';
  const timeline = isRecord(card.data.timeline) ? card.data.timeline : {};
  const steps = Array.isArray(timeline.steps)
    ? timeline.steps
    : Array.isArray(card.data.steps)
      ? card.data.steps
      : [];
  for (const step of steps) {
    if (!isRecord(step)) continue;
    if (publicString(step.state) !== 'current') continue;
    return publicString(step.key)?.toLowerCase() ?? null;
  }
  return null;
}

function isLocalOnlyCardAction(_action: VisibleCardAction) {
  return false;
}

// eslint-disable-next-line react-refresh/only-export-components
export function cardActionNavigationHrefForTests(
  card: SchemaDrivenAssistantCard,
  action: VisibleCardAction,
) {
  return cardActionNavigationHref(card, action);
}

function cardActionNavigationHref(
  card: SchemaDrivenAssistantCard,
  action: VisibleCardAction,
): string | null {
  const payload = payloadForCardAction(card, action);
  if (action.schemaAction === 'candidate.view_detail') {
    const payloadProfile = recordFromUnknown(payload.profile);
    const payloadCandidate = recordFromUnknown(payload.candidate);
    const payloadCandidateProfile = recordFromUnknown(payloadCandidate.profile);
    const payloadOpportunity = recordFromUnknown(payload.opportunity);
    const payloadOpportunityProfile = recordFromUnknown(payloadOpportunity.profile);
    const cardProfile = recordFromUnknown(card.data.profile);
    const cardCandidate = recordFromUnknown(card.data.candidate);
    const cardCandidateProfile = recordFromUnknown(cardCandidate.profile);
    const cardOpportunity = recordFromUnknown(card.data.opportunity);
    const cardOpportunityProfile = recordFromUnknown(cardOpportunity.profile);
    const direct = firstSafeInternalHref(
      payload.profileHref,
      payload.userHref,
      payload.detailHref,
      payload.href,
      payloadProfile.href,
      payloadProfile.profileHref,
      payloadCandidate.href,
      payloadCandidate.profileHref,
      payloadOpportunity.href,
      payloadOpportunity.profileHref,
      card.data.profileHref,
      card.data.userHref,
      card.data.detailHref,
      card.data.href,
      cardProfile.href,
      cardProfile.profileHref,
      cardCandidate.href,
      cardCandidate.profileHref,
      cardOpportunity.href,
      cardOpportunity.profileHref,
    );
    if (direct) return direct;
    const targetUserId = firstPublicPrimitive(
      payload.targetUserId,
      payload.candidateUserId,
      payload.userId,
      payload.profileId,
      payloadProfile.id,
      payloadProfile.userId,
      payloadCandidate.targetUserId,
      payloadCandidate.candidateUserId,
      payloadCandidate.userId,
      payloadCandidate.profileId,
      payloadCandidateProfile.id,
      payloadCandidateProfile.userId,
      payloadOpportunity.targetUserId,
      payloadOpportunity.candidateUserId,
      payloadOpportunity.userId,
      payloadOpportunity.profileId,
      payloadOpportunityProfile.id,
      payloadOpportunityProfile.userId,
      card.data.targetUserId,
      card.data.candidateUserId,
      card.data.userId,
      card.data.profileId,
      cardProfile.id,
      cardProfile.userId,
      cardCandidate.targetUserId,
      cardCandidate.candidateUserId,
      cardCandidate.userId,
      cardCandidate.profileId,
      cardCandidateProfile.id,
      cardCandidateProfile.userId,
      cardOpportunity.targetUserId,
      cardOpportunity.candidateUserId,
      cardOpportunity.userId,
      cardOpportunity.profileId,
      cardOpportunityProfile.id,
      cardOpportunityProfile.userId,
    );
    return targetUserId === null
      ? null
      : `/user/${encodeURIComponent(String(targetUserId))}`;
  }
  if (action.schemaAction === 'activity.view_detail') {
    const direct = firstSafeInternalHref(
      payload.discoverHref,
      payload.detailHref,
      payload.activityHref,
      payload.href,
      card.data.discoverHref,
      card.data.detailHref,
      card.data.activityHref,
      card.data.href,
    );
    if (direct) return direct;
    const publicIntentId = firstPublicPrimitive(payload.publicIntentId, card.data.publicIntentId);
    if (publicIntentId !== null) return `/public-intent/${encodeURIComponent(String(publicIntentId))}`;
    const socialRequestId = firstPublicPrimitive(payload.socialRequestId, card.data.socialRequestId);
    if (socialRequestId !== null) return `/social-request/${encodeURIComponent(String(socialRequestId))}`;
    const activityId = firstPublicPrimitive(payload.activityId, card.data.activityId);
    return activityId === null ? null : `/activity/${encodeURIComponent(String(activityId))}`;
  }
  return null;
}

function firstSafeInternalHref(...values: unknown[]): string | null {
  for (const value of values) {
    const href = publicString(value);
    if (!href) continue;
    if (isSafeInternalHref(href)) return href;
  }
  return null;
}

function isSafeInternalHref(href: string) {
  return (
    href.startsWith('/user/') ||
    href.startsWith('/public-intent/') ||
    href.startsWith('/social-request/') ||
    href.startsWith('/activity/') ||
    href === '/discover'
  );
}

function navigateToInternalHref(href: string) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', href);
  window.dispatchEvent(new Event('popstate'));
}

function defaultCardActionPayload(card: SchemaDrivenAssistantCard): Record<string, unknown> {
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const profile = recordFromUnknown(card.data.profile);
  const candidateRecord = recordFromUnknown(card.data.candidate);
  const candidateProfile = recordFromUnknown(candidateRecord.profile);
  const opportunityProfile = recordFromUnknown(opportunity.profile);
  const proposal = isRecord(card.data.proposal) ? card.data.proposal : {};
  const candidate = defaultCandidatePayload(card, opportunity);
  const activity = defaultActivityPayload(card, opportunity);
  const lifeGraph = defaultLifeGraphPayload(card, proposal);
  return stripEmptyPayloadFields({
    taskId: card.data.taskId,
    cardId: card.id,
    cardType: card.type,
    schemaType: card.schemaType,
    ...lifeGraph,
    candidateId: firstPublicPrimitive(
      card.data.candidateId,
      card.data.candidateRecordId,
      card.data.socialRequestCandidateId,
      opportunity.candidateId,
      opportunity.candidateRecordId,
      firstActionPayloadPrimitive(card, [
        'candidateId',
        'candidateRecordId',
        'socialRequestCandidateId',
      ]),
    ),
    targetUserId: firstPublicPrimitive(
      card.data.targetUserId,
      card.data.userId,
      card.data.candidateUserId,
      card.data.profileId,
      profile.id,
      profile.userId,
      candidateRecord.targetUserId,
      candidateRecord.userId,
      candidateRecord.candidateUserId,
      candidateRecord.profileId,
      candidateProfile.id,
      candidateProfile.userId,
      opportunity.targetUserId,
      opportunity.userId,
      opportunity.candidateUserId,
      opportunity.profileId,
      opportunityProfile.id,
      opportunityProfile.userId,
      firstActionPayloadPrimitive(card, [
        'targetUserId',
        'userId',
        'candidateUserId',
        'profileId',
      ]),
    ),
    candidateUserId: firstPublicPrimitive(
      card.data.candidateUserId,
      card.data.targetUserId,
      card.data.userId,
      card.data.profileId,
      profile.userId,
      profile.id,
      candidateRecord.candidateUserId,
      candidateRecord.targetUserId,
      candidateRecord.userId,
      candidateRecord.profileId,
      candidateProfile.userId,
      candidateProfile.id,
      opportunity.candidateUserId,
      opportunity.targetUserId,
      opportunity.userId,
      opportunity.profileId,
      opportunityProfile.userId,
      opportunityProfile.id,
      firstActionPayloadPrimitive(card, [
        'candidateUserId',
        'targetUserId',
        'userId',
        'profileId',
      ]),
    ),
    socialRequestId: firstPublicPrimitive(card.data.socialRequestId, opportunity.socialRequestId),
    publicIntentId: firstPublicPrimitive(card.data.publicIntentId, opportunity.publicIntentId),
    ...(card.schemaType === 'social_match.activity' ? activity : {}),
    activityId: firstPublicPrimitive(card.data.activityId, opportunity.activityId),
    candidate: Object.keys(candidate).length > 0 ? candidate : undefined,
    activity: Object.keys(activity).length > 0 ? activity : undefined,
    suggestedOpener:
      publicDetail(opportunity.suggestedOpener) ?? publicDetail(card.data.suggestedOpener),
  });
}

function firstActionPayloadPrimitive(
  card: SchemaDrivenAssistantCard,
  keys: string[],
): string | number | null {
  for (const action of card.actions) {
    const payload = isRecord(action.payload) ? action.payload : null;
    if (!payload) continue;
    for (const key of keys) {
      const value = firstPublicPrimitive(payload[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function defaultLifeGraphPayload(
  card: SchemaDrivenAssistantCard,
  proposal: Record<string, unknown>,
) {
  if (card.schemaType !== 'life_graph.diff') return {};
  return stripEmptyPayloadFields({
    proposalId: firstPublicPrimitive(
      card.data.proposalId,
      card.data.lifeGraphProposalId,
      proposal.proposalId,
      proposal.id,
    ),
    fieldIds: lifeGraphFieldIds(card.data, proposal),
    allowConflicts: lifeGraphHasConflicts(card.data, proposal) ? true : undefined,
    reason: publicDetail(card.data.rejectReason) ?? publicDetail(proposal.rejectReason),
  });
}

function lifeGraphFieldIds(
  data: Record<string, unknown>,
  proposal: Record<string, unknown>,
): string[] | undefined {
  const explicit = [
    ...primitiveArray(data.fieldIds),
    ...primitiveArray(data.proposedFieldIds),
    ...primitiveArray(proposal.fieldIds),
    ...primitiveArray(proposal.proposedFieldIds),
  ];
  if (explicit.length > 0) return explicit;
  const fields = Array.isArray(data.fields)
    ? data.fields
    : Array.isArray(proposal.fields)
      ? proposal.fields
      : Array.isArray(data.proposedFields)
        ? data.proposedFields
        : [];
  const fromFields = fields
    .map((field) => {
      if (!isRecord(field)) return null;
      return firstPublicPrimitive(field.proposalFieldId, field.fieldId, field.id);
    })
    .filter((value): value is string | number => value !== null)
    .map(String);
  return fromFields.length > 0 ? fromFields : undefined;
}

function lifeGraphHasConflicts(
  data: Record<string, unknown>,
  proposal: Record<string, unknown>,
): boolean {
  const diff = isRecord(data.diff) ? data.diff : {};
  if (
    primitiveArray(data.conflicts).length > 0 ||
    primitiveArray(data.conflictHints).length > 0 ||
    primitiveArray(diff.conflicts).length > 0
  ) {
    return true;
  }
  const fields = Array.isArray(data.fields)
    ? data.fields
    : Array.isArray(proposal.fields)
      ? proposal.fields
      : Array.isArray(data.proposedFields)
        ? data.proposedFields
        : [];
  return fields.some((field) => {
    if (!isRecord(field)) return false;
    return (
      field.conflict === true ||
      field.status === 'conflict' ||
      field.status === 'revoked_conflict'
    );
  });
}

function primitiveArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => firstPublicPrimitive(item))
    .filter((item): item is string | number => item !== null)
    .map(String);
}

function defaultCandidatePayload(
  card: SchemaDrivenAssistantCard,
  opportunity: Record<string, unknown>,
) {
  if (card.schemaType !== 'social_match.candidate') return {};
  return stripEmptyPayloadFields({
    name:
      publicDetail(opportunity.name) ??
      publicDetail(card.data.displayName) ??
      publicDetail(card.data.name) ??
      card.title,
    title: publicDetail(opportunity.title) ?? card.title,
    area:
      publicDetail(opportunity.area) ??
      publicDetail(card.data.area) ??
      publicDetail(card.data.city),
    time:
      publicDetail(opportunity.time) ??
      publicDetail(card.data.timePreference) ??
      publicDetail(card.data.whyNow),
    score:
      firstPublicPrimitive(opportunity.score, card.data.matchScore, card.data.score) ?? undefined,
  });
}

function defaultActivityPayload(
  card: SchemaDrivenAssistantCard,
  opportunity: Record<string, unknown>,
) {
  if (card.schemaType !== 'social_match.activity') return {};
  return stripEmptyPayloadFields({
    title:
      publicDetail(opportunity.title) ??
      publicDetail(card.data.activityTitle) ??
      publicDetail(card.data.name) ??
      card.title,
    city: publicDetail(opportunity.city) ?? publicDetail(card.data.city),
    location:
      publicDetail(opportunity.location) ??
      publicDetail(card.data.locationName) ??
      publicDetail(card.data.location),
    time:
      publicDetail(opportunity.time) ??
      publicDetail(card.data.timeLabel) ??
      publicDetail(card.data.startTime),
    safetyBoundary:
      publicDetail(opportunity.safetyBoundary) ?? publicDetail(card.data.safetyBoundary),
    checkinReminder:
      publicDetail(opportunity.checkinReminder) ?? publicDetail(card.data.checkinReminder),
    reviewPrompt: publicDetail(opportunity.reviewPrompt) ?? publicDetail(card.data.reviewPrompt),
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function cardActionRuntimeScope(input: {
  threadId?: unknown;
  runId?: unknown;
  messageId: string;
}) {
  const threadId = runtimeIdentityPart(input.threadId) ?? 'thread:unknown';
  const runId = runtimeIdentityPart(input.runId) ?? 'run:unknown';
  return `${threadId}:${runId}:${input.messageId}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function cardActionRuntimeKey(runtimeScope: string, cardId: string) {
  return `${runtimeScope}:${cardId}`;
}

function subscribeCardActionRuntime(listener: () => void) {
  cardActionRuntimeListeners.add(listener);
  return () => cardActionRuntimeListeners.delete(listener);
}

function emitCardActionRuntimeChange() {
  cardActionRuntimeListeners.forEach((listener) => listener());
}

// eslint-disable-next-line react-refresh/only-export-components
export function resetCardActionRuntimeStateForTests() {
  cardActionRuntimeState.clear();
  emitCardActionRuntimeChange();
}

function readCardActionRuntimeState(key: string): CardActionRuntimeState {
  return cardActionRuntimeState.get(key) ?? EMPTY_CARD_ACTION_STATE;
}

function setCardActionRuntimeState(key: string, patch: Partial<CardActionRuntimeState>) {
  cardActionRuntimeState.set(key, {
    ...readCardActionRuntimeState(key),
    ...patch,
  });
  emitCardActionRuntimeChange();
}

function useCardActionRuntimeState(runtimeScope: string, cardId: string) {
  const key = cardActionRuntimeKey(runtimeScope, cardId);
  const state = useSyncExternalStore(
    subscribeCardActionRuntime,
    () => readCardActionRuntimeState(key),
    () => EMPTY_CARD_ACTION_STATE,
  );
  return [key, state] as const;
}

function runtimeIdentityPart(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function stripEmptyPayloadFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nextValue]) => {
      if (nextValue == null) return false;
      if (typeof nextValue === 'string') return nextValue.trim().length > 0;
      return true;
    }),
  );
}

function firstPublicPrimitive(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function primitiveTaskId(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

function publicDetail(value: unknown) {
  if (typeof value === 'string') return agentApprovalUserFacingText(sanitizePublicText(value));
  if (isRecord(value)) {
    const keys = ['title', 'message', 'summary', 'detail', 'status'];
    for (const key of keys) {
      const candidate = publicString(value[key]);
      const sanitized = candidate
        ? agentApprovalUserFacingText(sanitizePublicText(candidate))
        : null;
      if (sanitized) return sanitized;
    }
  }
  return null;
}

function publicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
