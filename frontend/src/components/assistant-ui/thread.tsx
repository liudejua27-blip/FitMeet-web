import { AuiIf, SelectionToolbarPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDown, LogIn, Quote, RefreshCcw, ShieldAlert, UserRound } from 'lucide-react';
import { type ReactNode } from 'react';

import type { SocialAgentProfileGateStatus } from '../../api/socialAgentApi';
import type {
  FitMeetAssistantMessage,
  FitMeetAssistantRecovery,
} from '../agent-workspace/FitMeetAssistantUI.types';
import { ChatGPTComposer } from './composer';
import { ChatGPTEditComposer, ChatGPTMessage } from './message';
import { AssistantThinkingDots } from './thinking-dots';
import { TooltipIconButton } from './tooltip-icon-button';

type ChatGPTThreadProps = {
  messages: FitMeetAssistantMessage[];
  isRunning: boolean;
  liveProcessStatus?: string | null;
  processStatusOwnedByMessage?: boolean;
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

export function ChatGPTThread({
  messages,
  isRunning,
  liveProcessStatus,
  processStatusOwnedByMessage,
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
  const latestAssistantMessageId =
    [...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null;
  const shouldShowInlineThinking =
    isRunning &&
    !processStatusOwnedByMessage &&
    (lastMessage?.role !== 'assistant' ||
      (lastMessage.status === 'streaming' &&
        lastMessage.content === ASSISTANT_STREAMING_PLACEHOLDER &&
        lastMessage.conversationIntent === 'conversation'));

  return (
    <ThreadPrimitive.Root
      className="flex h-full min-w-0 flex-col items-stretch bg-white px-3 text-[#0d0d0d] sm:px-4"
      data-testid="assistant-ui-thread"
      data-thread-model="assistant-ui-thread"
      data-thread-shell="chatgpt-clone"
      data-density={density}
      data-empty-state={isEmpty ? 'visible' : 'hidden'}
      data-viewport-state={shouldShowViewport ? 'visible' : 'hidden'}
      data-selection-overlap-policy="avoid-message-text"
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
          className="flex grow flex-col gap-6 overflow-y-auto overscroll-contain scroll-smooth pt-12 [scrollbar-gutter:stable] [scroll-padding-bottom:calc(8rem+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))] sm:pt-14"
          turnAnchor="top"
          data-testid="assistant-ui-thread-viewport"
          data-viewport-model="assistant-ui-thread-viewport"
          data-scroll-model="anchored-thread"
          data-footer-behavior="sticky-composer"
        >
          <div
            className="flex flex-1 flex-col pb-28 sm:pb-24"
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
                    isLatestAssistantMessage={message.id === latestAssistantMessageId}
                    onBranchSwitch={onBranchSwitch}
                    onFeedback={onFeedback}
                    onDisableReminders={onDisableReminders}
                    onDismissReminder={onDismissReminder}
                  />
                )
              }
            </ThreadPrimitive.Messages>
            {shouldShowInlineThinking ? (
              <AssistantInlineThinking status={liveProcessStatus ?? undefined} />
            ) : null}
            {sessionRestoring ? <AssistantInlineNote>正在同步这段对话…</AssistantInlineNote> : null}
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
            className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-3xl flex-col gap-1.5 overflow-visible bg-white pb-2 [padding-bottom:calc(0.5rem+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))]"
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
      className="flex items-center gap-1 rounded-xl border border-black/[0.08] bg-white/95 p-1 text-sm text-[#18181b] shadow-[0_10px_30px_rgba(0,0,0,0.10)] backdrop-blur"
      style={{
        transform:
          'translate(-50%, calc(-100% - var(--assistant-selection-toolbar-offset-y, 96px)))',
      }}
      data-testid="assistant-ui-selection-toolbar"
      role="toolbar"
      aria-label="文本选择操作"
      data-action-count="1"
      data-selection-action="quote"
      data-overlap-policy="avoid-message-text"
      data-placement="above-selection"
      data-offset-y="96"
      data-selection-safe-distance="large"
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

function AssistantInlineThinking({ status }: { status?: string }) {
  const displayStatus = inlineThinkingStatus(status);
  const ariaLabel = displayStatus.replace(/[。！？…]+$/u, '');
  return (
    <div
      className="mx-auto flex w-full max-w-3xl px-0 py-2 text-sm text-[#71717a]"
      data-testid="assistant-ui-inline-thinking"
      role="status"
      aria-live="polite"
      data-status-model="single-line-replaceable"
      data-status-role="ephemeral-visible-process"
      data-status-persistence="temporary"
      data-final-answer="false"
      data-trace-detail-policy="collapsed"
      data-update-model="replace-previous-status"
      data-live-status={displayStatus}
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-[#f7f7f8] px-3 py-1.5 ring-1 ring-black/[0.05]">
        <AssistantThinkingDots className="p-0" label={ariaLabel} />
        <span>{displayStatus}</span>
      </span>
    </div>
  );
}

function inlineThinkingStatus(status?: string) {
  const normalized = String(status ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '正在组织回复…';
  if (/[。！？…]$/u.test(normalized)) return normalized;
  if (/^(正在|继续|准备|检查|读取|筛选|整理|生成|查找|确认|保存|发布|发送)/u.test(normalized)) {
    return `${normalized}…`;
  }
  return normalized;
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
  const shouldShowProfileGate = !requiresAuth && profileGate && !profileGate.passed;
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
        {shouldShowProfileGate ? <AssistantProfileGateHint profileGate={profileGate} /> : null}
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

function AssistantProfileGateHint({ profileGate }: { profileGate: SocialAgentProfileGateStatus }) {
  const missing = profileGate.nextActions.length
    ? profileGate.nextActions
    : profileGate.missing.map(profileGateMissingLabel);
  return (
    <div
      className="rounded-2xl border border-black/[0.08] bg-[#f7f7f8] p-4 text-left shadow-[0_12px_34px_rgba(0,0,0,0.06)]"
      role="status"
      data-testid="assistant-ui-profile-gate-hint"
      data-display-model="lightweight-profile-completion"
      data-blocks-chat="false"
      data-can-enter-match-pool={profileGate.canEnterMatchPool ? 'true' : 'false'}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#18181b] ring-1 ring-black/[0.06]">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#18181b]">匹配前还差一点个人信息</p>
            {typeof profileGate.profileCompleteness === 'number' ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#71717a] ring-1 ring-black/[0.05]">
                完成度 {Math.round(profileGate.profileCompleteness)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-[#52525b]">
            补齐后我再开始匹配、发布约练或发邀请。普通聊天可以直接开始。
          </p>
          {missing.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missing.slice(0, 4).map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-white px-2.5 py-1 text-xs text-[#52525b] ring-1 ring-black/[0.05]"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="/agent/profile"
              className="inline-flex items-center rounded-full bg-[#18181b] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
            >
              完善个人信息
            </a>
            <span className="text-xs leading-5 text-[#8a8f98]">也可以本次使用，不保存。</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function profileGateMissingLabel(field: SocialAgentProfileGateStatus['missing'][number]) {
  const labels: Record<SocialAgentProfileGateStatus['missing'][number], string> = {
    city: '城市/大致区域',
    activity: '想参与的运动或社交场景',
    availability: '可约时间',
    boundary: '社交边界',
    publicAuthorization: '是否公开到发现',
  };
  return labels[field] ?? field;
}

function AssistantDisclaimer() {
  return (
    <p
      className="pt-1.5 text-center text-[11px] leading-5 text-[#7a7a7a]"
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
  const actionLabel = isAuth ? '登录' : '继续上次任务';
  const stateLabel = isAuth ? '需要登录' : isCheckpoint ? '需要确认' : '可以继续';
  const copy = sanitizedRecoveryCopy(recovery);
  const actionIcon = isAuth ? (
    <LogIn className="h-4 w-4" aria-hidden="true" />
  ) : (
    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
  );

  return (
    <div
      className="mx-auto flex w-full max-w-3xl px-0 py-1.5 text-sm text-[#18181b]"
      role="status"
      data-testid="assistant-ui-interrupt-resume"
      data-kind={recovery.kind}
      data-display-model="lightweight-inline-recovery"
      data-recovery-surface="single-line"
      data-recovery-card="false"
      data-final-answer="false"
    >
      <div className="min-w-0 flex-1">
        <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-[#f7f7f8]/80 px-2.5 py-1.5 text-[#52525b] ring-1 ring-black/[0.05]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/[0.04]">
              {isAuth ? (
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {stateLabel}
            </span>
            <p className="min-w-0 flex-1 truncate font-medium text-[#27272a]">{copy.title}</p>
          </div>
          <p className="min-w-0 flex-[2] truncate leading-5 text-[#52525b]">
            {isAuth ? '登录后我可以继续同步这段会话、偏好和未完成步骤。' : copy.message}
          </p>
          {!isAuth && recovery.prompt ? (
            <p className="max-w-[18rem] truncate text-xs leading-5 text-[#8a8f98]">
              刚才说到：{recovery.prompt}
            </p>
          ) : null}
          {isAuth || recovery.retryable ? (
            <div className="ml-auto flex shrink-0 flex-wrap gap-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                onClick={isAuth ? onLogin : onRetry}
              >
                {actionIcon}
                {actionLabel}
              </button>
              {!isAuth ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs text-[#71717a] transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
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

function sanitizedRecoveryCopy(recovery: FitMeetAssistantRecovery) {
  const title = recovery.title.trim();
  const message = recovery.message.trim();
  return {
    title: isBackendRecoveryTitle(title) ? '这段需求还在' : title || '这段需求还在',
    message: isBackendRecoveryMessage(message)
      ? '我保留了刚才的上下文。你可以点继续接着处理，也可以直接补充新的要求。'
      : message || '我保留了刚才的上下文。你可以点继续接着处理，也可以直接补充新的要求。',
  };
}

function isBackendRecoveryTitle(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    backendRecoveryTitleTerms.some((term) => normalized === term) ||
    /没有.{0,16}完成|未完成|处理失败|run failed|连接.{0,8}中断/.test(normalized)
  );
}

function isBackendRecoveryMessage(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    backendRecoveryMessageTerms.some((term) => normalized.includes(term)) ||
    /没有.{0,16}完成|未完成|保留.{0,8}对话|稍后.{0,8}试|服务.{0,8}不可用|连接.{0,8}中断/.test(
      normalized,
    )
  );
}

const backendRecoveryTitleTerms = [
  '这次处理' + '没有完成',
  '这一步' + '没有完成',
  '这次' + '没有顺利完成',
  '暂时' + '没有顺利完成',
  '处理失败',
  'run failed',
];

const backendRecoveryMessageTerms = [
  'fitmeet agent',
  '这次处理' + '没有完成',
  '暂时' + '没有顺利完成',
  '保留当前对话',
  '稍后再试',
  '服务暂时不可用',
];
