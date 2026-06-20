import {
  ComposerPrimitive,
  type DataMessagePartProps,
  MessagePartPrimitive,
  MessagePrimitive,
  type ToolCallMessagePartProps,
  useAuiState,
} from '@assistant-ui/react';
import { lazy, Suspense, useState } from 'react';

import { cn } from '../../lib/utils';
import type { FitMeetAssistantMessage } from '../agent-workspace/FitMeetAssistantUI.types';
import { AssistantActionBar, UserMessageActionBar } from './action-bar';
import { ChatGPTAttachment } from './attachment';
import { ChatGPTBranchPicker } from './branch-picker';
import { MarkdownTextPart } from './markdown-text';
import { AssistantMessageRuntimeProvider } from './message-runtime-context';
import { AssistantThinkingDots } from './thinking-dots';

const LazyAssistantToolFallback = lazy(() =>
  import('./tool-fallback').then((module) => ({ default: module.AssistantToolFallback })),
);

const LazyAssistantDataFallback = lazy(() =>
  import('./tool-fallback').then((module) => ({ default: module.AssistantDataFallback })),
);

type AssistantMessageProps = {
  density?: 'comfortable' | 'compact';
  onBranchSwitch: (messageId: string, direction: 'previous' | 'next') => void;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
  onDisableReminders?: () => Promise<void> | void;
  onDismissReminder?: (reminderId: number | string) => Promise<void> | void;
  isLatestAssistantMessage?: boolean;
};

function normalizeMessageStatus(status: unknown) {
  if (typeof status === 'string' && status.length > 0) return status;
  if (status && typeof status === 'object') {
    const record = status as Record<string, unknown>;
    for (const key of ['type', 'status', 'state']) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return 'unknown';
}

export function ChatGPTMessage({
  density = 'comfortable',
  onBranchSwitch,
  onFeedback,
  onDisableReminders,
  onDismissReminder,
  isLatestAssistantMessage = true,
}: AssistantMessageProps) {
  const role = useAuiState((state) => state.message.role);
  const id = useAuiState((state) => state.message.id);
  const status = useAuiState((state) => normalizeMessageStatus(state.message.status));
  const fitmeetMessageId = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetMessageId?: string;
    };
    return custom.fitmeetMessageId ?? state.message.id;
  });
  const branch = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetBranch?: FitMeetAssistantMessage['branch'];
    };
    return custom.fitmeetBranch;
  });
  const feedbackStatus = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      feedbackStatus?: FitMeetAssistantMessage['feedbackStatus'];
    };
    return custom.feedbackStatus ?? null;
  });
  const feedbackErrorValue = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      feedbackErrorValue?: FitMeetAssistantMessage['feedbackErrorValue'];
    };
    return custom.feedbackErrorValue ?? null;
  });
  const assistantMessageSource = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetAssistantMessageSource?: FitMeetAssistantMessage['assistantMessageSource'];
    };
    return custom.fitmeetAssistantMessageSource ?? null;
  });
  const feedback = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetFeedback?: FitMeetAssistantMessage['feedback'];
    };
    return custom.fitmeetFeedback ?? null;
  });
  const isThinking = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetThinking?: boolean;
    };
    return custom.fitmeetThinking === true;
  });
  const reminderContext = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetReminderContext?: Record<string, unknown> | null;
    };
    return custom.fitmeetReminderContext ?? null;
  });
  const reminderId = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetReminderId?: number | string | null;
    };
    return typeof custom.fitmeetReminderId === 'number' ||
      typeof custom.fitmeetReminderId === 'string'
      ? custom.fitmeetReminderId
      : null;
  });
  const isCompact = density === 'compact';
  const reminderDelivery = Array.isArray(reminderContext?.deliveryChannels)
    ? reminderContext.deliveryChannels
        .filter((channel): channel is string => typeof channel === 'string')
        .join(',')
    : undefined;
  const reminderProtocol =
    typeof reminderContext?.reminderProtocol === 'string'
      ? reminderContext.reminderProtocol
      : undefined;
  const reminderExternalDeliveryDisabled =
    reminderContext?.externalDeliveryDisabled === true ? 'true' : undefined;
  const reminderSettingsRoute =
    typeof reminderContext?.settingsRoute === 'string'
      ? reminderContext.settingsRoute
      : undefined;
  const reminderOptOutAction =
    typeof reminderContext?.optOutAction === 'string'
      ? reminderContext.optOutAction
      : undefined;
  const reminderDismissAction =
    typeof reminderContext?.dismissAction === 'string'
      ? reminderContext.dismissAction
      : undefined;
  const reminderSafetyProtocol = normalizeReminderSafetyProtocol(
    reminderContext?.reminderSafetyProtocol,
  );
  const reminderPreferenceSignals = normalizeReminderPreferenceSignals(
    reminderContext?.preferenceHistorySignals,
  );

  return (
    <AssistantMessageRuntimeProvider value={{ isLatestAssistantMessage }}>
      <MessagePrimitive.Root
        className={cn(
          'group relative mx-auto flex w-full max-w-3xl flex-col px-0',
          isCompact ? 'py-0.5' : 'py-2',
          role === 'user' ? 'items-end gap-1' : 'items-stretch',
          '[content-visibility:auto] [contain-intrinsic-size:0_160px]',
        )}
        data-testid="assistant-ui-message"
        role="article"
        aria-label={role === 'user' ? '用户消息' : '助手消息'}
        data-message-id={id}
        data-fitmeet-message-id={fitmeetMessageId}
        data-role={role}
        data-message-status={status ?? 'unknown'}
        data-feedback-status={role === 'assistant' ? (feedbackStatus ?? 'idle') : undefined}
        data-message-source={role === 'assistant' ? (assistantMessageSource ?? 'unknown') : undefined}
        data-density={density}
        data-message-model="assistant-ui-message"
        data-message-parts-model="assistant-ui-message-parts"
        data-actionbar-placement={role === 'assistant' ? 'below-message' : 'inline-leading'}
        data-surface={role === 'user' ? 'user-bubble' : 'assistant-prose'}
        data-render-strategy="content-visibility"
        data-reminder-protocol={role === 'assistant' ? reminderProtocol : undefined}
        data-reminder-suggestion-only={
          role === 'assistant' && reminderContext?.suggestionOnly === true ? 'true' : undefined
        }
        data-reminder-delivery={role === 'assistant' ? reminderDelivery : undefined}
        data-reminder-external-delivery-disabled={
          role === 'assistant' ? reminderExternalDeliveryDisabled : undefined
        }
        data-reminder-settings-route={role === 'assistant' ? reminderSettingsRoute : undefined}
        data-reminder-opt-out-action={role === 'assistant' ? reminderOptOutAction : undefined}
      >
      {role === 'user' ? (
        <div
          className="flex w-full max-w-[88%] flex-row flex-wrap justify-end gap-2 sm:max-w-[78%]"
          data-testid="assistant-ui-message-attachments"
          data-attachment-model="message-part"
        >
          <MessagePrimitive.Attachments components={{ Attachment: ChatGPTAttachment }} />
        </div>
      ) : null}
      <div
        className={cn(role === 'user' ? 'flex max-w-[88%] items-start gap-2 sm:max-w-[72%]' : 'min-w-0')}
        data-testid="assistant-ui-message-row"
        data-row-role={role}
      >
        {role === 'user' ? <UserMessageActionBar /> : null}
        <div
          className={cn(
            role === 'user'
              ? cn(
                  'rounded-[24px] bg-[#f4f4f4] text-[16px] text-[#0d0d0d]',
                  isCompact ? 'px-3.5 py-1.5 leading-6' : 'px-4 py-2 leading-6',
                )
              : cn(
                  'prose prose-sm max-w-none text-[16px] text-[#0d0d0d] prose-p:my-0 prose-li:my-0 prose-strong:text-[#0d0d0d]',
                  isCompact ? 'leading-6' : 'leading-7',
                ),
          )}
          data-testid="assistant-ui-message-content"
          data-content-role={role}
          data-surface={role === 'user' ? 'bubble' : 'prose'}
        >
          {role === 'assistant' && isThinking ? <AssistantThinkingDots className="my-1" /> : null}
          <div
            data-testid="assistant-ui-message-parts"
            data-parts-model="assistant-ui"
            data-supported-parts="text,image,data,tools"
          >
            <MessagePrimitive.Parts
              components={{
                Text: AssistantTextPart,
                Image: () => <MessagePartPrimitive.Image />,
                data: { Fallback: AssistantDataPartFallback },
                tools: { Fallback: AssistantToolPartFallback },
              }}
            />
          </div>
          {role === 'assistant' && reminderSafetyProtocol.length > 0 ? (
            <ReminderSafetyProtocol items={reminderSafetyProtocol} />
          ) : null}
          {role === 'assistant' && reminderPreferenceSignals.length > 0 ? (
            <ReminderPreferenceSignals items={reminderPreferenceSignals} />
          ) : null}
          {role === 'assistant' &&
          (reminderOptOutAction === 'social_agent.reminder.disable' ||
            reminderDismissAction === 'social_agent.reminder.dismiss') ? (
            <ReminderMessageActions
              reminderId={reminderId}
              canDisable={reminderOptOutAction === 'social_agent.reminder.disable'}
              canDismiss={reminderDismissAction === 'social_agent.reminder.dismiss'}
              onDisableReminders={onDisableReminders}
              onDismissReminder={onDismissReminder}
            />
          ) : null}
        </div>
      </div>
      {role === 'assistant' ? (
        <div
          className="-ml-1 flex min-h-7 items-center pt-0"
          data-testid="assistant-ui-message-actions-row"
          data-actionbar-placement="below-message"
        >
          <AssistantActionBar
            feedback={feedback}
            feedbackStatus={feedbackStatus}
            feedbackErrorValue={feedbackErrorValue}
            messageId={fitmeetMessageId}
            onFeedback={onFeedback}
          />
          {branch?.count && branch.count > 1 ? (
            <ChatGPTBranchPicker branch={branch} messageId={id} onBranchSwitch={onBranchSwitch} />
          ) : null}
        </div>
      ) : null}
      </MessagePrimitive.Root>
    </AssistantMessageRuntimeProvider>
  );
}

function AssistantToolPartFallback(part: ToolCallMessagePartProps) {
  return (
    <Suspense fallback={<AssistantPartLoading label="正在整理处理过程" />}>
      <LazyAssistantToolFallback {...part} />
    </Suspense>
  );
}

function AssistantDataPartFallback(part: DataMessagePartProps) {
  return (
    <Suspense fallback={<AssistantPartLoading label="正在整理结果" />}>
      <LazyAssistantDataFallback {...part} />
    </Suspense>
  );
}

function AssistantPartLoading({ label }: { label: string }) {
  return (
    <div
      className="my-2 inline-flex items-center gap-2 rounded-2xl bg-[#f7f7f8] px-3 py-2 text-xs text-[#71717a] ring-1 ring-black/5"
      data-testid="assistant-ui-part-loading"
      aria-live="polite"
    >
      <AssistantThinkingDots className="px-0 py-0" label={label} />
      <span>{label}</span>
    </div>
  );
}

type ReminderSafetyProtocolItem = {
  key: string;
  label: string;
  detail: string;
};

function ReminderSafetyProtocol({ items }: { items: ReminderSafetyProtocolItem[] }) {
  return (
    <dl
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5 sm:grid-cols-2"
      data-testid="assistant-ui-reminder-safety-protocol"
      aria-label="提醒安全协议"
    >
      {items.map((item) => (
        <div key={item.key}>
          <dt className="font-medium text-[#3f3f46]">{item.label}</dt>
          <dd>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReminderPreferenceSignals({ items }: { items: string[] }) {
  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5 text-xs text-[#71717a]"
      data-testid="assistant-ui-reminder-preference-signals"
      aria-label="提醒参考的近期偏好"
    >
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-[#f7f7f8] px-2.5 py-1 ring-1 ring-black/5"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ReminderMessageActions({
  reminderId,
  canDisable,
  canDismiss,
  onDisableReminders,
  onDismissReminder,
}: {
  reminderId: number | string | null;
  canDisable: boolean;
  canDismiss: boolean;
  onDisableReminders?: () => Promise<void> | void;
  onDismissReminder?: (reminderId: number | string) => Promise<void> | void;
}) {
  const [disableStatus, setDisableStatus] = useState<'idle' | 'saving' | 'done' | 'error'>(
    'idle',
  );
  const [dismissStatus, setDismissStatus] = useState<'idle' | 'saving' | 'done' | 'error'>(
    'idle',
  );
  const actionState =
    disableStatus === 'saving' || dismissStatus === 'saving'
      ? 'saving'
      : disableStatus === 'done'
        ? 'disabled'
        : dismissStatus === 'done'
          ? 'dismissed'
          : disableStatus === 'error' || dismissStatus === 'error'
            ? 'error'
            : 'idle';
  const canDismissNow = canDismiss && Boolean(reminderId) && Boolean(onDismissReminder);
  const canDisableNow = canDisable && Boolean(onDisableReminders);

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 text-xs"
      data-testid="assistant-ui-reminder-actions"
      data-reminder-action-state={actionState}
    >
      {canDismiss ? (
        <button
          type="button"
          className="rounded-full bg-white px-3 py-1.5 font-medium text-[#52525b] ring-1 ring-black/10 transition hover:bg-black/[0.04] hover:text-[#18181b] disabled:cursor-default disabled:text-[#8a8f98] disabled:hover:bg-white"
          data-testid="assistant-ui-reminder-dismiss"
          disabled={!canDismissNow || dismissStatus === 'saving' || dismissStatus === 'done'}
          onClick={async () => {
            if (!reminderId || !onDismissReminder) return;
            setDismissStatus('saving');
            try {
              await onDismissReminder(reminderId);
              setDismissStatus('done');
            } catch {
              setDismissStatus('error');
            }
          }}
        >
          {dismissStatus === 'saving'
            ? '正在稍后提醒...'
            : dismissStatus === 'done'
              ? '已降频'
              : '稍后再说'}
        </button>
      ) : null}
      {canDisable ? (
        <button
          type="button"
          className="rounded-full bg-white px-3 py-1.5 font-medium text-[#52525b] ring-1 ring-black/10 transition hover:bg-black/[0.04] hover:text-[#18181b] disabled:cursor-default disabled:text-[#8a8f98] disabled:hover:bg-white"
          data-testid="assistant-ui-reminder-disable"
          disabled={!canDisableNow || disableStatus === 'saving' || disableStatus === 'done'}
          onClick={async () => {
            if (!onDisableReminders) return;
            setDisableStatus('saving');
            try {
              await onDisableReminders();
              setDisableStatus('done');
            } catch {
              setDisableStatus('error');
            }
          }}
        >
          {disableStatus === 'saving'
            ? '正在关闭...'
            : disableStatus === 'done'
              ? '已关闭提醒'
              : '关闭提醒'}
        </button>
      ) : null}
      {actionState === 'error' ? (
        <span className="text-[#b45309]" role="status">
          没有保存成功，可以稍后再试。
        </span>
      ) : null}
    </div>
  );
}

function normalizeReminderPreferenceSignals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out.slice(0, 4);
}

function normalizeReminderSafetyProtocol(value: unknown): ReminderSafetyProtocolItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      const detail =
        typeof record.detail === 'string'
          ? record.detail.trim()
          : typeof record.value === 'string'
            ? record.value.trim()
            : '';
      if (!label || !detail) return null;
      return {
        key: typeof record.key === 'string' && record.key.trim() ? record.key.trim() : `reminder-${index}`,
        label,
        detail,
      };
    })
    .filter((item): item is ReminderSafetyProtocolItem => Boolean(item))
    .slice(0, 5);
}

export function ChatGPTEditComposer() {
  return (
    <div
      className="group relative mx-auto flex w-full max-w-3xl flex-col px-0 py-3"
      data-testid="assistant-ui-edit-composer"
    >
      <ComposerPrimitive.Root
        className="mx-auto flex w-full max-w-3xl flex-col justify-end gap-1 rounded-[28px] border border-[#e5e5e5] bg-white px-2 py-2 text-[#0d0d0d] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#d0d0d0] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
        data-testid="assistant-ui-edit-composer-root"
      >
        <ComposerPrimitive.Input
          autoFocus
          rows={1}
          className="max-h-40 min-h-9 w-full resize-none bg-transparent px-3 pt-2 text-base leading-6 outline-none placeholder:text-[#8e8e8e]"
        />
        <div className="flex items-center justify-end gap-2 px-1 pt-1">
          <ComposerPrimitive.Cancel asChild>
            <button
              type="button"
              className="rounded-full px-3 py-2 text-sm font-medium text-[#52525b] transition hover:bg-black/[0.04] hover:text-[#18181b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            >
              取消
            </button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <button
              type="submit"
              className="rounded-full bg-[#0d0d0d] px-3 py-2 text-sm font-semibold text-white transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:opacity-40"
            >
              保存
            </button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
}

function AssistantTextPart() {
  const role = useAuiState((state) => state.message.role);

  return (
    <>
      <MarkdownTextPart role={role} />
      <MessagePartPrimitive.InProgress>
        <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#18181b]" />
      </MessagePartPrimitive.InProgress>
    </>
  );
}
