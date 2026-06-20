import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  useAuiState,
} from '@assistant-ui/react';
import {
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '../../lib/utils';
import type { FitMeetAssistantMessage } from '../agent-workspace/FitMeetAssistantUI.types';
import { TooltipIconButton } from './tooltip-icon-button';

const assistantActionClassName =
  'flex size-[30px] items-center justify-center rounded-lg text-[#6b6b6b] transition-[background-color,color,opacity] hover:bg-black/[0.045] hover:text-[#0d0d0d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15';

const ASSISTANT_ACTION_COUNT = 7;
const USER_ACTION_COUNT = 1;

export function AssistantActionBar({
  feedback,
  feedbackStatus,
  feedbackErrorValue,
  messageId,
  onFeedback,
}: {
  feedback: FitMeetAssistantMessage['feedback'];
  feedbackStatus: FitMeetAssistantMessage['feedbackStatus'];
  feedbackErrorValue: FitMeetAssistantMessage['feedbackErrorValue'];
  messageId: string;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
}) {
  const feedbackBusy = feedbackStatus === 'submitting';
  const feedbackFailed = feedbackStatus === 'failed';
  const positiveFailed = feedbackFailed && feedbackErrorValue === 'positive';
  const negativeFailed = feedbackFailed && feedbackErrorValue === 'negative';
  const positiveSubmitting = feedbackBusy && feedback === 'positive';
  const negativeSubmitting = feedbackBusy && feedback === 'negative';
  const pinned = Boolean(feedback || feedbackBusy || feedbackFailed);
  const feedbackStatusText =
    feedbackStatus === 'submitting'
      ? '正在保存反馈'
      : feedbackStatus === 'submitted'
        ? '反馈已保存'
        : feedbackStatus === 'failed'
          ? '反馈没有保存，可再点一次'
          : null;

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide={pinned ? 'never' : 'not-last'}
      autohideFloat={pinned ? 'never' : 'always'}
      className={cn(
        'flex translate-y-0 items-center gap-0.5 opacity-100 transition-[color,opacity,transform] duration-150',
        !pinned &&
          'md:data-[floating]:opacity-0 md:data-[floating]:group-hover:opacity-100 md:data-[floating]:group-focus-within:opacity-100',
        !feedback && !feedbackBusy && !feedbackFailed && 'text-[#6b6b6b]',
      )}
      data-testid="assistant-ui-action-bar"
      role="toolbar"
      aria-label="助手消息操作"
      data-action-count={ASSISTANT_ACTION_COUNT}
      data-actionbar-model="assistant-ui-message-actions"
      data-autohide-model={pinned ? 'pinned' : 'hover-focus'}
      data-run-visibility="hide-when-running"
      data-feedback-model="persistent-per-message"
      data-share-model="native-or-copy-link"
      data-reload-model="assistant-ui-reload"
      data-message-id={messageId}
      data-feedback-status={feedbackStatus ?? 'idle'}
      data-feedback-pinned={pinned ? 'true' : 'false'}
      data-visibility={pinned ? 'pinned' : 'hover-focus'}
      data-touch-visibility={pinned ? 'pinned' : 'visible'}
    >
      {feedbackStatusText ? (
        <span className="sr-only" role="status" aria-live="polite">
          {feedbackStatusText}
        </span>
      ) : null}
      <MessageCopyButton />
      {positiveFailed ? (
        <TooltipIconButton
          tooltip="评价失败，可重试"
          className={cn(
            assistantActionClassName,
            'text-red-600 hover:text-red-700',
          )}
          aria-pressed={feedback === 'positive'}
          aria-busy={false}
          data-action-id="feedback-positive"
          data-feedback-target="positive"
          data-feedback-error="true"
          onClick={() => onFeedback?.(messageId, 'positive')}
        >
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      ) : (
        <ActionBarPrimitive.FeedbackPositive asChild>
          <TooltipIconButton
            tooltip={
              positiveSubmitting
                ? '正在提交评价'
                : feedback === 'positive'
                  ? '已喜欢'
                  : '喜欢'
            }
            className={cn(
              assistantActionClassName,
              feedback === 'positive' && 'bg-black/[0.06] text-[#18181b]',
              positiveSubmitting && 'animate-pulse',
            )}
            aria-pressed={feedback === 'positive'}
            aria-busy={positiveSubmitting}
            data-action-id="feedback-positive"
            data-feedback-target="positive"
            data-feedback-error="false"
          >
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        </ActionBarPrimitive.FeedbackPositive>
      )}
      {negativeFailed ? (
        <TooltipIconButton
          tooltip="评价失败，可重试"
          className={cn(
            assistantActionClassName,
            'text-red-600 hover:text-red-700',
          )}
          aria-pressed={feedback === 'negative'}
          aria-busy={false}
          data-action-id="feedback-negative"
          data-feedback-target="negative"
          data-feedback-error="true"
          onClick={() => onFeedback?.(messageId, 'negative')}
        >
          <ThumbsDown className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      ) : (
        <ActionBarPrimitive.FeedbackNegative asChild>
          <TooltipIconButton
            tooltip={
              negativeSubmitting
                ? '正在提交评价'
                : feedback === 'negative'
                  ? '已不喜欢'
                  : '不喜欢'
            }
            className={cn(
              assistantActionClassName,
              feedback === 'negative' && 'bg-black/[0.06] text-[#18181b]',
              negativeSubmitting && 'animate-pulse',
            )}
            aria-pressed={feedback === 'negative'}
            aria-busy={negativeSubmitting}
            data-action-id="feedback-negative"
            data-feedback-target="negative"
            data-feedback-error="false"
          >
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        </ActionBarPrimitive.FeedbackNegative>
      )}
      <ActionBarPrimitive.Speak asChild>
        <TooltipIconButton
          tooltip="朗读"
          className={assistantActionClassName}
          data-action-id="speak"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      </ActionBarPrimitive.Speak>
      <ShareCurrentThreadButton />
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton
          tooltip="重新生成"
          className={assistantActionClassName}
          data-action-id="reload"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <MoreActionMenu />
    </ActionBarPrimitive.Root>
  );
}

function MessageCopyButton() {
  const copied = useAuiState((state) => state.message.isCopied);
  return (
    <ActionBarPrimitive.Copy asChild>
      <TooltipIconButton
        tooltip={copied ? '已复制' : '复制'}
        className={cn(assistantActionClassName, copied && 'text-[#18181b]')}
        data-action-id="copy"
        data-copy-state={copied ? 'copied' : 'idle'}
      >
        <AuiIf condition={(state) => state.message.isCopied}>
          <Check className="h-4 w-4" aria-hidden="true" />
        </AuiIf>
        <AuiIf condition={(state) => !state.message.isCopied}>
          <Copy className="h-4 w-4" aria-hidden="true" />
        </AuiIf>
      </TooltipIconButton>
    </ActionBarPrimitive.Copy>
  );
}

async function copyCurrentUrl() {
  if (typeof window === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}

function ShareCurrentThreadButton() {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const title = document.title || 'FitMeet Agent';

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      const ok = await copyCurrentUrl();
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <TooltipIconButton
      tooltip={copied ? '已复制链接' : '分享'}
      className={assistantActionClassName}
      onClick={() => void share()}
      aria-live="polite"
      data-action-id="share"
      data-share-state={copied ? 'copied' : 'idle'}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden="true" />
      )}
    </TooltipIconButton>
  );
}

function MoreActionMenu() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const ok = await copyCurrentUrl();
    setCopied(ok);
    if (ok) {
      window.setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    }
  };

  return (
    <ActionBarMorePrimitive.Root modal={false} open={open} onOpenChange={setOpen}>
      <ActionBarMorePrimitive.Trigger asChild>
        <TooltipIconButton
          tooltip="更多"
          className={assistantActionClassName}
          data-action-id="more"
          data-menu-state={open ? 'open' : 'closed'}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      </ActionBarMorePrimitive.Trigger>
      <ActionBarMorePrimitive.Content
        align="end"
        side="top"
        sideOffset={6}
        className="z-50 w-36 rounded-xl border border-black/[0.08] bg-white p-1 text-sm text-[#18181b] shadow-[0_12px_32px_rgba(0,0,0,0.12)] outline-none"
        data-testid="assistant-ui-action-more-menu"
        data-menu-model="compact-message-actions"
      >
        <ActionBarMorePrimitive.Item
          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/[0.05] focus-visible:bg-black/[0.05] focus-visible:outline-none"
          onSelect={(event) => {
            event.preventDefault();
            void copyLink();
          }}
        >
          <span>{copied ? '已复制' : '复制链接'}</span>
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        </ActionBarMorePrimitive.Item>
      </ActionBarMorePrimitive.Content>
    </ActionBarMorePrimitive.Root>
  );
}

export function UserMessageActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="always"
      className="mt-2 opacity-100 transition-opacity data-[floating]:opacity-100 md:data-[floating]:opacity-0 md:data-[floating]:group-hover:opacity-100 md:data-[floating]:group-focus-within:opacity-100"
      data-testid="assistant-ui-user-action-bar"
      role="toolbar"
      aria-label="用户消息操作"
      data-action-count={USER_ACTION_COUNT}
      data-actionbar-model="assistant-ui-user-message-actions"
      data-autohide-model="hover-focus"
      data-run-visibility="hide-when-running"
      data-touch-visibility="visible"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton
          tooltip="编辑"
          className="size-[30px] rounded-lg text-[#a1a1aa] hover:bg-black/[0.045] hover:text-[#52525b]"
          data-action-id="edit"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
}
