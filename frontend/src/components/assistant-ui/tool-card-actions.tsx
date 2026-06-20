import { useAuiState } from '@assistant-ui/react';
import { CheckCircle2, Loader2, RefreshCcw, Send, ShieldCheck } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { cn } from '../../lib/utils';
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
};

const EMPTY_CARD_ACTION_STATE: CardActionRuntimeState = {
  busyKey: null,
  completedKey: null,
  failedKey: null,
  error: null,
};

const cardActionRuntimeState = new Map<string, CardActionRuntimeState>();
const cardActionRuntimeListeners = new Set<() => void>();

export function CardActionSummary({
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
  const [runtimeKey, actionState] = useCardActionRuntimeState(messageId, card.id);
  const { busyKey, completedKey, failedKey, error } = actionState;
  const allActions = visibleCardActions(card, actions).slice(0, 4);
  const candidateActions =
    isLatestAssistantMessage || completedKey || failedKey ? allActions : [];
  const visible = completedKey
    ? candidateActions.filter((action) => cardActionKey(action) === completedKey)
    : candidateActions;
  const completedAction = completedKey
    ? visible.find((action) => cardActionKey(action) === completedKey)
    : null;
  const failedAction = failedKey
    ? visible.find((action) => cardActionKey(action) === failedKey)
    : null;
  const confirmationNoteId = `tool-action-confirmation-${card.id}`;
  const hasConfirmationActions = visible.some((action) => action.requiresConfirmation);
  if (visible.length === 0) return null;

  const runAction = async (action: (typeof visible)[number]) => {
    if (!toolActions.onCardAction) return;
    const key = cardActionKey(action);
    setCardActionRuntimeState(runtimeKey, {
      busyKey: key,
      completedKey: null,
      failedKey: null,
      error: null,
    });
    try {
      await toolActions.onCardAction({
        messageId,
        taskId: primitiveTaskId(card.data.taskId),
        cardId: card.id,
        action: action.action,
        schemaAction: action.schemaAction,
        payload: payloadForCardAction(card, action),
      });
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: key,
        failedKey: null,
        error: null,
      });
    } catch (nextError) {
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: null,
        failedKey: key,
        error: nextError instanceof Error ? nextError.message : '这一步没有完成，请重试。',
      });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((action) => {
          const key = cardActionKey(action);
          const isBusy = busyKey === key;
          const isCompleted = completedKey === key;
          const isFailed = failedKey === key;
          const isLockedByAnotherAction = Boolean(busyKey && !isBusy);
          const executable = Boolean(
            isLatestAssistantMessage && toolActions.onCardAction && action.schemaAction,
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
              data-requires-confirmation={action.requiresConfirmation ? 'true' : 'false'}
              data-checkpoint-required={actionRequiresCheckpoint(action) ? 'true' : 'false'}
              data-action-state={
                isBusy ? 'running' : isCompleted ? 'succeeded' : isFailed ? 'failed' : 'idle'
              }
              disabled={
                !executable || (threadRunning && !isFailed) || isBusy || isLockedByAnotherAction
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
      {completedKey ? (
        <p
          className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs leading-5 text-emerald-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-card-action-result"
          data-schema-action={completedAction?.schemaAction ?? 'unknown'}
        >
          {completedAction
            ? cardActionResultMessage(completedAction)
            : '这一步已完成，后续结果会继续留在当前对话。'}
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
          {sanitizePublicText(error) ?? '这一步暂时没有完成，可以稍后重试。'}
        </p>
      ) : null}
    </div>
  );
}

export function visibleCardActions(
  card: SchemaDrivenAssistantCard,
  actions: SchemaDrivenAssistantCard['actions'],
): VisibleCardAction[] {
  const defaultPayload = defaultCardActionPayload(card);
  const normalized = actions
    .map((action): VisibleCardAction => {
      const schemaAction = toolUISchemaActionFromUnknown(action.schemaAction);
      const rawAction = publicString(action.action);
      const requiresConfirmation = action.requiresConfirmation === true;
      return {
        id: publicString(action.id),
        label: normalizeVisibleActionLabel(
          publicDetail(action.label),
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
    .filter((action) => action.label);
  const seen = new Set(
    normalized.map((action) => action.schemaAction ?? action.action ?? action.label),
  );
  const defaults = defaultCardActions(card).filter((action) => {
    const key = action.schemaAction ?? action.action ?? action.label;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...normalized, ...defaults];
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
  if (isFailed) return `重试${action.label ?? '这一步'}`;
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
  return '这一步已完成，后续结果会继续留在当前对话。';
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
  schemaAction: ToolUISchemaAction | undefined,
  action: string | null,
  requiresConfirmation: boolean,
) {
  if (schemaAction === 'candidate.connect' || action === 'candidate.connect') {
    return requiresConfirmation ? '确认后发邀请' : '发邀请';
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
        id: `${card.id}:connect`,
        label: '确认后发邀请',
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
        id: `${card.id}:view`,
        label: '查看活动详情',
        requiresConfirmation: false,
        schemaAction: 'activity.view_detail',
        action: 'activity.view_detail',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:create`,
        label: '确认后发起',
        requiresConfirmation: true,
        schemaAction: 'activity.confirm_create',
        action: 'activity.confirm_create',
        payload: basePayload,
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

function defaultCardActionPayload(card: SchemaDrivenAssistantCard): Record<string, unknown> {
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
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
    ),
    targetUserId: firstPublicPrimitive(
      card.data.targetUserId,
      card.data.userId,
      card.data.candidateUserId,
      opportunity.targetUserId,
      opportunity.userId,
      opportunity.candidateUserId,
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

function cardActionRuntimeKey(messageId: string, cardId: string) {
  return `${messageId}:${cardId}`;
}

function subscribeCardActionRuntime(listener: () => void) {
  cardActionRuntimeListeners.add(listener);
  return () => cardActionRuntimeListeners.delete(listener);
}

function emitCardActionRuntimeChange() {
  cardActionRuntimeListeners.forEach((listener) => listener());
}

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

function useCardActionRuntimeState(messageId: string, cardId: string) {
  const key = cardActionRuntimeKey(messageId, cardId);
  const state = useSyncExternalStore(
    subscribeCardActionRuntime,
    () => readCardActionRuntimeState(key),
    () => EMPTY_CARD_ACTION_STATE,
  );
  return [key, state] as const;
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
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
