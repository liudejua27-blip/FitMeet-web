import { AuiIf, SelectionToolbarPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDown, LogIn, Quote, RefreshCcw, ShieldAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '../../lib/utils';
import type { SocialAgentProfileGateStatus } from '../../api/socialAgentApi';
import type {
  FitMeetAssistantMessage,
  FitMeetAssistantRecovery,
} from '../agent-workspace/FitMeetAssistantUI';
import { ChatGPTComposer } from './composer';
import { ChatGPTEditComposer, ChatGPTMessage } from './message';
import { AssistantThinkingDots } from './thinking-dots';
import { TooltipIconButton } from './tooltip-icon-button';

type ChatGPTThreadProps = {
  messages: FitMeetAssistantMessage[];
  isRunning: boolean;
  sessionRestoring: boolean;
  recovery?: FitMeetAssistantRecovery | null;
  profileGate?: SocialAgentProfileGateStatus | null;
  requiresAuth?: boolean;
  onLogin?: () => void;
  onRetryRecovery?: () => void;
  onDismissRecovery?: () => void;
  onBranchSwitch: (messageId: string, direction: 'previous' | 'next') => void;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
  onDisableReminders?: () => Promise<void> | void;
  onDismissReminder?: (reminderId: number | string) => Promise<void> | void;
};

const ASSISTANT_STREAMING_PLACEHOLDER = '\u200b';
const PROFILE_GATE_HINT_DISMISSED_KEY = 'fitmeet.agent.profileGateHintDismissed.v1';

export function ChatGPTThread({
  messages,
  isRunning,
  sessionRestoring,
  recovery,
  profileGate,
  requiresAuth,
  onLogin,
  onRetryRecovery,
  onDismissRecovery,
  onBranchSwitch,
  onFeedback,
  onDisableReminders,
  onDismissReminder,
}: ChatGPTThreadProps) {
  const isEmpty = messages.length === 0 && !isRunning && !sessionRestoring && !recovery;
  const density = messages.length >= 80 ? 'compact' : 'comfortable';
  const shouldShowViewport = !isEmpty;
  const lastMessage = messages.at(-1);
  const shouldShowInlineThinking =
    isRunning &&
    (lastMessage?.role !== 'assistant' ||
      (lastMessage.status === 'streaming' &&
        lastMessage.content === ASSISTANT_STREAMING_PLACEHOLDER));

  return (
    <ThreadPrimitive.Root
      className="flex h-full min-w-0 flex-col items-stretch bg-white px-4 text-[#0d0d0d]"
      data-testid="assistant-ui-thread"
      data-thread-model="assistant-ui-thread"
      data-thread-shell="chatgpt-clone"
      data-density={density}
      data-empty-state={isEmpty ? 'visible' : 'hidden'}
      data-viewport-state={shouldShowViewport ? 'visible' : 'hidden'}
    >
      <AssistantSelectionToolbar />
      <AuiIf condition={(state) => state.thread.isEmpty && isEmpty}>
        <AssistantEmptyState
          profileGate={profileGate}
          requiresAuth={requiresAuth}
          onLogin={onLogin}
        />
      </AuiIf>

      <AuiIf condition={(state) => !state.thread.isEmpty || shouldShowViewport}>
        <ThreadPrimitive.Viewport
          className="flex grow flex-col gap-8 overflow-y-auto overscroll-contain scroll-smooth pt-14 [scrollbar-gutter:stable] [scroll-padding-bottom:calc(9rem+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))] sm:pt-16"
          turnAnchor="top"
          data-testid="assistant-ui-thread-viewport"
          data-viewport-model="assistant-ui-thread-viewport"
          data-scroll-model="anchored-thread"
          data-footer-behavior="sticky-composer"
        >
          <div
            className="flex flex-1 flex-col pb-32 sm:pb-28"
            data-testid="assistant-ui-messages"
            role="log"
            aria-label="对话消息"
            aria-live="polite"
            aria-relevant="additions text"
            data-message-count={messages.length}
            data-stream-state={isRunning ? 'running' : 'idle'}
            data-density={density}
            data-messages-model="assistant-ui-thread-messages"
            data-message-renderer="assistant-ui-message-parts"
          >
            <ThreadPrimitive.Messages>
              {({ message }) =>
                message.composer.isEditing ? (
                  <ChatGPTEditComposer />
                ) : (
                  <ChatGPTMessage
                    density={density}
                    onBranchSwitch={onBranchSwitch}
                    onFeedback={onFeedback}
                    onDisableReminders={onDisableReminders}
                    onDismissReminder={onDismissReminder}
                  />
                )
              }
            </ThreadPrimitive.Messages>
            {shouldShowInlineThinking ? <AssistantInlineThinking /> : null}
            {sessionRestoring ? (
              <AssistantInlineNote>正在恢复上一次对话与未完成步骤...</AssistantInlineNote>
            ) : null}
            {!isRunning && recovery ? (
              <AssistantRecoveryMessage
                recovery={recovery}
                onLogin={onLogin}
                onRetry={onRetryRecovery}
                onDismiss={onDismissRecovery}
              />
            ) : null}
          </div>
          <ThreadPrimitive.ViewportFooter
            className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-3xl flex-col gap-2 overflow-visible rounded-t-3xl bg-white pb-2 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))]"
            data-testid="assistant-ui-viewport-footer"
            data-footer-model="assistant-ui-viewport-footer"
            data-composer-placement="sticky-bottom"
            data-keyboard-safe-area="enabled"
          >
            <ThreadPrimitive.ScrollToBottom asChild>
              <TooltipIconButton
                tooltip="回到底部"
                className="absolute -top-10 z-10 self-center rounded-full border border-black/10 bg-white p-2 text-[#71717a] shadow-sm disabled:invisible"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </TooltipIconButton>
            </ThreadPrimitive.ScrollToBottom>
            <ChatGPTComposer requiresAuth={requiresAuth} onLogin={onLogin} />
            <AssistantDisclaimer />
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </AuiIf>
    </ThreadPrimitive.Root>
  );
}

function AssistantSelectionToolbar() {
  return (
    <SelectionToolbarPrimitive.Root
      className="flex items-center gap-1 rounded-xl border border-black/10 bg-white p-1 text-sm text-[#18181b] shadow-lg"
      data-testid="assistant-ui-selection-toolbar"
      role="toolbar"
      aria-label="文本选择操作"
      data-action-count="1"
      data-selection-action="quote"
    >
      <SelectionToolbarPrimitive.Quote
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
        aria-label="引用到输入框"
        data-testid="assistant-ui-selection-quote"
      >
        <Quote className="h-3.5 w-3.5" aria-hidden="true" />
        引用
      </SelectionToolbarPrimitive.Quote>
    </SelectionToolbarPrimitive.Root>
  );
}

function AssistantInlineThinking() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl px-0 py-3 text-sm text-[#8a8f98]"
    >
      <AssistantThinkingDots />
    </div>
  );
}

function AssistantEmptyState({
  profileGate,
  requiresAuth,
  onLogin,
}: {
  profileGate?: SocialAgentProfileGateStatus | null;
  requiresAuth?: boolean;
  onLogin?: () => void;
}) {
  const [profileGateHintDismissed, setProfileGateHintDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(PROFILE_GATE_HINT_DISMISSED_KEY) === '1';
  });
  const shouldShowProfileGate = Boolean(
    profileGate && !profileGate.passed && !requiresAuth && !profileGateHintDismissed,
  );

  const dismissProfileGateHint = () => {
    setProfileGateHintDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PROFILE_GATE_HINT_DISMISSED_KEY, '1');
    }
  };

  return (
    <section
      className="flex grow flex-col items-center justify-center px-0"
      aria-label="FitMeet Agent"
      data-testid="assistant-ui-empty-state"
      data-empty-model="assistant-ui-welcome"
      data-empty-layout="centered-composer"
      data-suggestion-chips="none"
      data-brand-copy="minimal"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-6">
        <div
          data-testid="assistant-ui-messages"
          className="sr-only"
          aria-hidden="true"
          data-message-count="0"
          data-stream-state="idle"
          data-density="comfortable"
          data-messages-model="assistant-ui-thread-messages"
          data-message-renderer="assistant-ui-message-parts"
        />
        <div className="text-center">
          <h1
            className="text-2xl font-medium tracking-normal text-[#0d0d0d] sm:text-3xl"
            data-testid="assistant-ui-empty-title"
            data-title-model="chatgpt-welcome"
          >
            有什么我可以帮你？
          </h1>
          <p
            className="mt-2 text-sm text-[#8a8f98]"
            data-testid="assistant-ui-empty-subtitle"
            data-subtitle-model="brand-minimal"
          >
            开始你的全球社交
          </p>
        </div>
        {shouldShowProfileGate ? (
          <AssistantProfileGateHint
            profileGate={profileGate as SocialAgentProfileGateStatus}
            onDismiss={dismissProfileGateHint}
          />
        ) : null}
        <div
          className="w-full [padding-bottom:calc(env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))]"
          data-testid="assistant-ui-empty-composer-slot"
          data-composer-placement="centered-empty-state"
          data-keyboard-safe-area="enabled"
        >
          <ChatGPTComposer requiresAuth={requiresAuth} onLogin={onLogin} />
          <AssistantDisclaimer />
        </div>
      </div>
    </section>
  );
}

function AssistantProfileGateHint({
  profileGate,
  onDismiss,
}: {
  profileGate: SocialAgentProfileGateStatus;
  onDismiss: () => void;
}) {
  const nextActions = profileGate.nextActions.filter(Boolean).slice(0, 3);

  return (
    <div
      className="mx-auto w-full max-w-2xl rounded-2xl border border-black/[0.06] bg-[#fafafa] px-3 py-2.5 text-left text-sm text-[#18181b] shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
      data-testid="assistant-ui-profile-gate-hint"
      data-profile-gate-state={profileGate.passed ? 'passed' : 'missing'}
      role="note"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#71717a] ring-1 ring-black/[0.06]">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium">匹配前还差一点人物画像</p>
            {typeof profileGate.profileCompleteness === 'number' ? (
              <span className="text-xs text-[#71717a]">
                完整度 {Math.round(profileGate.profileCompleteness)}%
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 leading-6 text-[#52525b]">
            普通聊天可以直接开始；等你要找搭子、发约练或邀请别人时，我会再帮你补齐安全信息。
          </p>
        </div>
        <button
          type="button"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8a8f98] transition-colors hover:bg-black/[0.04] hover:text-[#18181b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
          aria-label="关闭人物画像提示"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {nextActions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
          {nextActions.map((action) => (
            <span
              key={action}
              className="rounded-full bg-white px-2 py-0.5 text-xs text-[#71717a] ring-1 ring-black/[0.04]"
            >
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssistantDisclaimer() {
  return (
    <p
      className="pt-2 text-center text-xs leading-5 text-[#5d5d5d]"
      data-testid="assistant-ui-disclaimer"
    >
      FitMeet Agent 可能会出错。重要操作请以你确认后的内容为准。
    </p>
  );
}

function AssistantInlineNote({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-3 text-sm text-[#71717a] sm:px-6">
      <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-[#18181b]" />
      <p className="rounded-2xl bg-[#f7f7f8] px-4 py-2">{children}</p>
    </div>
  );
}

function AssistantRecoveryMessage({
  recovery,
  onLogin,
  onRetry,
  onDismiss,
}: {
  recovery: FitMeetAssistantRecovery;
  onLogin?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const isAuth = recovery.kind === 'unauthorized';
  const isCheckpoint = recovery.kind === 'checkpoint_available';
  const actionLabel = isAuth ? '登录' : '继续';
  const avatarLabel = isAuth ? 'F' : isCheckpoint ? '↻' : '!';
  const actionIcon = isAuth ? (
    <LogIn className="h-4 w-4" aria-hidden="true" />
  ) : (
    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
  );

  return (
    <div
      className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-3 text-sm text-[#18181b] sm:px-6"
      role="status"
      data-testid="assistant-ui-interrupt-resume"
      data-kind={recovery.kind}
    >
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-[11px] font-semibold text-white">
        {avatarLabel}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-2xl bg-[#f7f7f8] px-4 py-3 ring-1 ring-black/5">
          {isAuth ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#52525b] ring-1 ring-black/5">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                {isCheckpoint ? '需要确认' : '可恢复'}
              </span>
            </div>
          )}
          <p className={cn('font-medium', isAuth ? 'mt-0' : 'mt-3')}>{recovery.title}</p>
          <p className="mt-1 leading-6 text-[#52525b]">
            {isAuth ? '登录后我可以继续同步这段会话、偏好和未完成步骤。' : recovery.message}
          </p>
          {!isAuth && recovery.prompt ? (
            <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5">
              {recovery.prompt}
            </p>
          ) : null}
          {isAuth || recovery.retryable ? (
            <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
              onClick={isAuth ? onLogin : onRetry}
            >
              {actionIcon}
              {actionLabel}
            </button>
            {!isAuth ? (
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-sm text-[#71717a] transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                onClick={onDismiss}
              >
                忽略，重新开始
              </button>
            ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
