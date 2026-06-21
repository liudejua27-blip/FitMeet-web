import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import {
  Bell,
  BellOff,
  Check,
  ChevronUp,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import type {
  FitMeetAgentThreadSummary,
  SocialAgentReminderPreference,
  SocialAgentReminderPreferenceInput,
  SocialAgentReminderScene,
} from '../../api/socialAgentApi';
import { cn } from '../../lib/utils';
import { TooltipIconButton } from './tooltip-icon-button';

type ChatGPTThreadListProps = {
  open: boolean;
  threads: FitMeetAgentThreadSummary[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  requiresAuth?: boolean;
  onCloseMobile: () => void;
  onNewConversation: () => void;
  onThreadRename: (threadId: string, title: string) => Promise<void> | void;
  onThreadDelete: (threadId: string) => Promise<void> | void;
  onLogin?: () => void;
  onToggleDesktop?: () => void;
  reminderPreference?: SocialAgentReminderPreference | null;
  reminderLoading?: boolean;
  reminderSaving?: boolean;
  reminderError?: string | null;
  focusReminderSettings?: boolean;
  onToggleReminders?: () => Promise<void> | void;
  onUpdateReminderPreference?: (
    nextSettings: SocialAgentReminderPreferenceInput,
  ) => Promise<void> | void;
};

export const MobileThreadListButton = forwardRef<
  HTMLButtonElement,
  { onClick: () => void }
>(function MobileThreadListButton({ onClick }, ref) {
  return (
    <TooltipIconButton
      ref={ref}
      tooltip="打开会话列表"
      className="fixed left-3 top-3 z-30 bg-transparent text-[#5d5d5d] shadow-none hover:bg-black/[0.05] hover:text-[#0d0d0d] lg:hidden"
      onClick={onClick}
    >
      <PanelLeft className="h-4 w-4" aria-hidden="true" />
    </TooltipIconButton>
  );
});

export function ChatGPTThreadList({
  open,
  threads,
  threadsLoading,
  activeThreadId,
  requiresAuth,
  onCloseMobile,
  onNewConversation,
  onThreadRename,
  onThreadDelete,
  onLogin,
  onToggleDesktop,
  reminderPreference,
  reminderLoading,
  reminderSaving,
  reminderError,
  focusReminderSettings,
  onToggleReminders,
  onUpdateReminderPreference,
}: ChatGPTThreadListProps) {
  const threadById = useMemo(() => {
    const items = new Map<string, FitMeetAgentThreadSummary>();
    for (const thread of threads) {
      items.set(thread.id, thread);
    }
    return items;
  }, [threads]);
  const runtimeThreadCount = useAuiState((state) => state.threads.threadIds.length);
  const runtimeMainThreadId = useAuiState((state) => state.threads.mainThreadId);
  const runtimeLoading = useAuiState((state) => state.threads.isLoading);
  const syncState = requiresAuth
    ? 'signed-out'
    : threadsLoading || runtimeLoading
      ? 'syncing'
      : 'synced';

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-black/[0.06] bg-[#f9f9f9] transition-transform duration-200 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
        !open && 'lg:hidden',
      )}
      role="navigation"
      aria-label="会话列表"
      aria-hidden={!open}
      aria-busy={threadsLoading || runtimeLoading ? 'true' : undefined}
      data-testid="assistant-ui-thread-list"
      data-state={open ? 'open' : 'closed'}
      data-thread-count={threads.length}
      data-sync-state={syncState}
      data-persistence="fitmeet-native"
      data-multidevice-restore={
        requiresAuth ? 'login-required' : threadsLoading || runtimeLoading ? 'syncing' : 'available'
      }
      data-thread-metadata-persistence="message-count,branch,preview,status,updated-at"
      data-interaction-model="assistant-ui-thread-list"
      data-empty-state={!threadsLoading && threads.length === 0 ? 'true' : 'false'}
      data-runtime-thread-count={runtimeThreadCount}
      data-runtime-active-thread-id={runtimeMainThreadId}
      data-runtime-loading={runtimeLoading ? 'true' : 'false'}
      inert={!open}
    >
      <ThreadListPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 px-2">
          <a
            href="/"
            className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[#0d0d0d] transition-colors hover:bg-black/[0.045]"
          >
            <img src="/favicon-192.png" alt="FitMeet" className="h-6 w-6 rounded-md" />
            <span>FitMeet Agent</span>
          </a>
          {onToggleDesktop ? (
            <TooltipIconButton
              tooltip="关闭会话列表"
              className="ml-auto hidden bg-transparent text-[#5d5d5d] shadow-none hover:bg-black/[0.045] hover:text-[#0d0d0d] lg:inline-flex"
              onClick={onToggleDesktop}
              data-testid="assistant-ui-desktop-sidebar-close"
              aria-label="关闭会话列表"
            >
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </TooltipIconButton>
          ) : null}
        </div>
        <div className="px-2">
          <ThreadListPrimitive.New asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#0d0d0d] transition-colors hover:bg-black/[0.045]"
              onClick={() => {
                onCloseMobile();
              }}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              新对话
            </button>
          </ThreadListPrimitive.New>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-medium text-[#8a8f98]">最近对话</span>
          </div>
          {threadsLoading ? <ThreadListSkeleton /> : null}
          {!threadsLoading && threads.length === 0 ? (
            <EmptyThreadHistory onNewConversation={onNewConversation} />
          ) : null}
          {!threadsLoading && threads.length > 0 ? (
            <div
              className="space-y-1"
              data-testid="assistant-ui-thread-list-items"
              role="list"
              aria-label="最近对话"
              data-visible-thread-count={threads.length}
            >
              <ThreadListPrimitive.Items>
                {({ threadListItem }) => {
                  const thread =
                    threadById.get(threadListItem.id) ??
                    createFallbackThreadSummary(threadListItem);
                  const threadIndex = threads.findIndex((item) => item.id === thread.id);
                  const previousThread =
                    threadIndex > 0 ? threads[threadIndex - 1] : null;
                  const groupLabel = getThreadGroupLabel(thread);
                  const shouldShowGroupLabel =
                    threadIndex <= 0 ||
                    !previousThread ||
                    getThreadGroupLabel(previousThread) !== groupLabel;
                  const isActive = isThreadActive(
                    thread,
                    activeThreadId,
                    runtimeMainThreadId,
                  );
                  return (
                    <div key={thread.id} data-thread-group={groupLabel}>
                      {shouldShowGroupLabel ? (
                        <p className="px-3 pb-1 pt-2 text-[11px] font-medium text-[#a1a1aa]">
                          {groupLabel}
                        </p>
                      ) : null}
                      <ThreadRow
                        thread={thread}
                        active={isActive}
                        position={threadIndex + 1}
                        total={threads.length}
                        onSelect={onCloseMobile}
                        onRename={(title) => onThreadRename(thread.id, title)}
                        onDelete={() => onThreadDelete(thread.id)}
                      />
                    </div>
                  );
                }}
              </ThreadListPrimitive.Items>
            </div>
          ) : null}
        </div>
        <SidebarAccountStatus
          requiresAuth={requiresAuth}
          syncState={syncState}
          threadCount={threads.length}
          onLogin={onLogin}
          reminderPreference={reminderPreference}
          reminderLoading={reminderLoading}
          reminderSaving={reminderSaving}
          reminderError={reminderError}
          focusReminderSettings={focusReminderSettings}
          onToggleReminders={onToggleReminders}
          onUpdateReminderPreference={onUpdateReminderPreference}
        />
      </ThreadListPrimitive.Root>
    </aside>
  );
}

function SidebarAccountStatus({
  requiresAuth,
  syncState,
  threadCount,
  onLogin,
  reminderPreference,
  reminderLoading,
  reminderSaving,
  reminderError,
  focusReminderSettings,
  onToggleReminders,
  onUpdateReminderPreference,
}: {
  requiresAuth?: boolean;
  syncState: 'signed-out' | 'syncing' | 'synced';
  threadCount: number;
  onLogin?: () => void;
  reminderPreference?: SocialAgentReminderPreference | null;
  reminderLoading?: boolean;
  reminderSaving?: boolean;
  reminderError?: string | null;
  focusReminderSettings?: boolean;
  onToggleReminders?: () => Promise<void> | void;
  onUpdateReminderPreference?: (
    nextSettings: SocialAgentReminderPreferenceInput,
  ) => Promise<void> | void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const title = requiresAuth ? '登录后同步' : 'FitMeet';
  const subtitle = requiresAuth
    ? '保存会话和偏好'
    : syncState === 'syncing'
      ? '正在同步会话'
      : threadCount > 0
        ? '会话已同步'
        : '准备开始';
  const syncLabel = requiresAuth
    ? '登录后同步到所有设备'
    : syncState === 'syncing'
      ? '正在同步到所有设备'
      : threadCount > 0
        ? '已同步到所有设备'
        : '新会话会自动保存';
  const content = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-white">
        <UserRound className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5 text-[#18181b]">
          {title}
        </span>
        <span className="block truncate text-xs leading-4 text-[#8a8f98]">
          {subtitle}
        </span>
      </span>
    </>
  );
  const syncStatus = (
    <span
      className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[11px] leading-4 text-[#71717a] ring-1 ring-black/[0.06]"
      data-testid="assistant-ui-thread-sync-status"
      data-sync-state={syncState}
      role={syncState === 'syncing' ? 'status' : undefined}
      aria-live={syncState === 'syncing' ? 'polite' : undefined}
    >
      {syncState === 'syncing' ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#10a37f]" aria-hidden="true" />
      )}
      <span className="truncate">{syncLabel}</span>
    </span>
  );
  const reminderToggle =
    !requiresAuth && onToggleReminders ? (
      <ReminderPreferenceToggle
        preference={reminderPreference}
        loading={Boolean(reminderLoading)}
        saving={Boolean(reminderSaving)}
        error={reminderError ?? null}
        focus={Boolean(focusReminderSettings)}
        onToggle={onToggleReminders}
        onUpdate={onUpdateReminderPreference}
      />
    ) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="border-t border-black/[0.06] p-2">
      {requiresAuth ? (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-black/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            aria-label={title}
            data-testid="assistant-ui-sidebar-account"
            data-auth-state="signed-out"
            data-sync-state={syncState}
            onClick={onLogin}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">{content}</span>
              {syncStatus}
            </span>
          </button>
          {reminderToggle}
        </>
      ) : (
        <div className="relative z-20" ref={accountMenuRef}>
          {menuOpen ? <SidebarAccountMenu onClose={() => setMenuOpen(false)} /> : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-black/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
            aria-label="打开账户菜单"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            data-testid="assistant-ui-sidebar-account"
            data-auth-state="signed-in"
            data-sync-state={syncState}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">{content}</span>
              {syncStatus}
            </span>
            <ChevronUp
              className={cn(
                'h-4 w-4 shrink-0 text-[#8a8f98] transition-transform',
                menuOpen && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>
          {!menuOpen ? reminderToggle : null}
        </div>
      )}
    </div>
  );
}

function SidebarAccountMenu({ onClose }: { onClose: () => void }) {
  const items = [
    {
      href: '/ai-profile',
      label: '人物画像',
      detail: '完善 AI 画像与理想型',
      icon: UserRound,
    },
    {
      href: '/profile/life-graph',
      label: 'Life Graph',
      detail: '查看记忆、撤回和确认',
      icon: ShieldCheck,
    },
    {
      href: '/match-confirmations',
      label: '匹配确认',
      detail: '处理候选人与邀请',
      icon: Check,
    },
    {
      href: '/agent-inbox',
      label: 'Agent Inbox',
      detail: '查看托管消息与事件',
      icon: Bell,
    },
    {
      href: '/profile',
      label: '个人资料',
      detail: '账户、安全与隐私设置',
      icon: Settings,
    },
  ];

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-black/[0.08] bg-white p-1 text-[#18181b] shadow-[0_16px_44px_rgba(0,0,0,0.18)]"
      role="menu"
      aria-label="FitMeet 账户菜单"
      data-testid="assistant-ui-sidebar-account-menu"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
            onClick={onClose}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#52525b]">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="block truncate text-[11px] text-[#8a8f98]">{item.detail}</span>
            </span>
          </a>
        );
      })}
    </div>
  );
}

function ReminderPreferenceToggle({
  preference,
  loading,
  saving,
  error,
  focus,
  onToggle,
  onUpdate,
}: {
  preference?: SocialAgentReminderPreference | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  focus: boolean;
  onToggle: () => Promise<void> | void;
  onUpdate?: (nextSettings: SocialAgentReminderPreferenceInput) => Promise<void> | void;
}) {
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const enabled = Boolean(preference?.enabled);
  const scenes = reminderScenes(preference);
  const label = loading
    ? '正在读取提醒'
    : enabled
      ? '主动提醒已开启'
      : '主动提醒已关闭';
  const detail = enabled
    ? reminderPreferenceDetail(preference)
    : '默认不打扰，可手动开启';
  const auditDetail = reminderPreferenceAuditDetail(preference);

  useEffect(() => {
    if (!focus) return;
    const focusToggle = () => {
      toggleRef.current?.focus({ preventScroll: false });
      toggleRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const frame = window.requestAnimationFrame(focusToggle);
    const timeout = window.setTimeout(focusToggle, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focus]);

  return (
    <div
      className={cn(
        'mt-1.5 rounded-lg border border-black/[0.06] bg-white text-[11px] leading-4 text-[#71717a]',
        enabled && 'border-[#10a37f]/20 bg-[#10a37f]/[0.06] text-[#166534]',
        focus && 'ring-2 ring-[#10a37f]/20',
      )}
      data-reminder-focus={focus ? 'true' : 'false'}
    >
      <button
        ref={toggleRef}
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
        data-testid="assistant-ui-reminder-toggle"
        data-reminder-state={loading ? 'loading' : enabled ? 'enabled' : 'disabled'}
        data-reminder-saving={saving ? 'true' : 'false'}
        aria-pressed={enabled}
        aria-label={`${label}，${detail}`}
        disabled={loading || saving}
        onClick={() => void onToggle()}
      >
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#71717a]',
            enabled && 'bg-[#10a37f]/10 text-[#0f766e]',
          )}
          aria-hidden="true"
        >
          {saving || loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : enabled ? (
            <Bell className="h-3.5 w-3.5" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[#3f3f46]">{label}</span>
          <span className="block truncate text-[#8a8f98]">{error ?? detail}</span>
        </span>
      </button>
      {enabled && preference && onUpdate ? (
        <div
          className="space-y-2 border-t border-black/[0.06] px-2 pb-2 pt-2"
          data-testid="assistant-ui-reminder-settings"
        >
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-[#52525b]">频率</span>
            <select
              className="h-7 w-full rounded-md border border-black/[0.08] bg-white px-2 text-[11px] text-[#3f3f46] outline-none focus:border-black/20"
              data-testid="assistant-ui-reminder-frequency"
              value={preference.frequency}
              disabled={saving}
              onChange={(event) =>
                void onUpdate({
                  frequency: event.currentTarget.value as SocialAgentReminderPreference['frequency'],
                })
              }
            >
              <option value="weekly">每周</option>
              <option value="daily">每日</option>
              <option value="manual">仅手动</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[#52525b]">
                开始
              </span>
              <input
                type="time"
                className="h-7 w-full rounded-md border border-black/[0.08] bg-white px-2 text-[11px] text-[#3f3f46] outline-none focus:border-black/20"
                data-testid="assistant-ui-reminder-quiet-start"
                value={preference.quietStart}
                disabled={saving}
                onChange={(event) => void onUpdate({ quietStart: event.currentTarget.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-[#52525b]">
                结束
              </span>
              <input
                type="time"
                className="h-7 w-full rounded-md border border-black/[0.08] bg-white px-2 text-[11px] text-[#3f3f46] outline-none focus:border-black/20"
                data-testid="assistant-ui-reminder-quiet-end"
                value={preference.quietEnd}
                disabled={saving}
                onChange={(event) => void onUpdate({ quietEnd: event.currentTarget.value })}
              />
            </label>
          </div>
          <div data-testid="assistant-ui-reminder-scenes">
            <span className="mb-1 block text-[11px] font-medium text-[#52525b]">场景</span>
            <div className="flex flex-wrap gap-1">
              {REMINDER_SCENE_OPTIONS.map((scene) => {
                const active = scenes.includes(scene.value);
                return (
                  <button
                    key={scene.value}
                    type="button"
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] ring-1 transition-colors',
                      active
                        ? 'bg-[#18181b] text-white ring-[#18181b]'
                        : 'bg-white text-[#71717a] ring-black/[0.08] hover:bg-black/[0.04]',
                    )}
                    data-scene={scene.value}
                    data-selected={active ? 'true' : 'false'}
                    disabled={saving}
                    onClick={() =>
                      void onUpdate({
                        scenes: toggleReminderScene(scenes, scene.value),
                      })
                    }
                  >
                    {scene.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] leading-4 text-[#8a8f98]">
            只做站内建议；发送邀请、加好友、创建活动或公开发布仍需确认。
          </p>
          {auditDetail ? (
            <p
              className="text-[11px] leading-4 text-[#8a8f98]"
              data-testid="assistant-ui-reminder-audit-status"
            >
              {auditDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {!enabled && auditDetail ? (
        <p
          className="border-t border-black/[0.06] px-2 pb-2 pt-1.5 text-[11px] leading-4 text-[#8a8f98]"
          data-testid="assistant-ui-reminder-audit-status"
        >
          {auditDetail}
        </p>
      ) : null}
    </div>
  );
}

const REMINDER_SCENE_OPTIONS: Array<{
  value: SocialAgentReminderScene;
  label: string;
}> = [
  { value: 'weekend_opportunities', label: '周末机会' },
  { value: 'past_social_goal', label: '旧目标' },
  { value: 'activity_follow_up', label: '活动跟进' },
  { value: 'life_graph_confirmation', label: '画像确认' },
];

function reminderPreferenceDetail(preference?: SocialAgentReminderPreference | null) {
  if (!preference) return '低打扰站内提醒';
  const frequency =
    preference.frequency === 'daily'
      ? '每日'
      : preference.frequency === 'weekly'
        ? '每周'
        : '手动';
  const scenes = reminderSceneCount(preference);
  const sceneLabel = scenes > 0 ? `${scenes} 个场景` : '未选择场景';
  return `${frequency} · ${sceneLabel} · ${preference.quietStart}-${preference.quietEnd}`;
}

function reminderPreferenceAuditDetail(
  preference?: SocialAgentReminderPreference | null,
) {
  if (!preference) return null;
  const metadata = preference.metadata ?? {};
  const mutedUntil = formatShortDateTime(preference.mutedUntil);
  if (mutedUntil) return `已静默到 ${mutedUntil}`;
  const disabledAt = formatShortDateTime(readString(metadata.reminderDisabledAt));
  if (!preference.enabled && disabledAt) return `已关闭：${disabledAt}`;
  const optInAt = formatShortDateTime(readString(metadata.reminderOptInConfirmedAt));
  const updatedAt =
    formatShortDateTime(readString(metadata.reminderPreferenceUpdatedAt)) ??
    formatShortDateTime(preference.updatedAt);
  if (preference.enabled && optInAt) {
    return updatedAt && updatedAt !== optInAt
      ? `已开启：${optInAt} · 最近更新 ${updatedAt}`
      : `已开启：${optInAt}`;
  }
  return updatedAt ? `最近更新 ${updatedAt}` : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatShortDateTime(value: unknown) {
  const input = readString(value);
  if (!input) return null;
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return null;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

function reminderSceneCount(preference: SocialAgentReminderPreference) {
  const scenes = reminderScenes(preference);
  return scenes.length;
}

function reminderScenes(
  preference?: SocialAgentReminderPreference | null,
): SocialAgentReminderScene[] {
  const scenes = preference?.metadata?.['reminderScenes'];
  if (!Array.isArray(scenes)) return [];
  return scenes.filter(isReminderScene);
}

function toggleReminderScene(
  scenes: SocialAgentReminderScene[],
  scene: SocialAgentReminderScene,
): SocialAgentReminderScene[] {
  return scenes.includes(scene)
    ? scenes.filter((item) => item !== scene)
    : [...scenes, scene];
}

function isReminderScene(value: unknown): value is SocialAgentReminderScene {
  return REMINDER_SCENE_OPTIONS.some((scene) => scene.value === value);
}

function ThreadListSkeleton() {
  return (
    <div
      className="space-y-1.5 px-1"
      aria-label="正在加载会话"
      role="status"
      aria-live="polite"
      data-testid="assistant-ui-thread-list-skeleton"
      data-skeleton-row-count="6"
    >
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-[#a1a1aa]">Loading</p>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl px-2 py-2"
          style={{ animationDelay: `${index * 45}ms` }}
        >
          <span
            className={cn(
              'block h-3.5 animate-pulse rounded bg-black/[0.07]',
              index % 3 === 0 ? 'w-[82%]' : index % 3 === 1 ? 'w-[68%]' : 'w-[74%]',
            )}
          />
          <span
            className={cn(
              'mt-2 block h-2.5 animate-pulse rounded bg-black/[0.045]',
              index % 2 === 0 ? 'w-[48%]' : 'w-[36%]',
            )}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyThreadHistory({ onNewConversation }: { onNewConversation: () => void }) {
  return (
    <div
      className="px-3 py-2"
      role="note"
      aria-label="暂无历史对话"
      data-testid="assistant-ui-thread-list-empty"
    >
      <p className="text-sm text-[#8a8f98]">暂无历史对话</p>
      <button
        type="button"
        className="mt-1 -ml-2 rounded-lg px-2 py-1.5 text-sm text-[#0d0d0d] transition-colors hover:bg-black/[0.045]"
        onClick={onNewConversation}
      >
        开始新对话
      </button>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  position,
  total,
  onSelect,
  onRename,
  onDelete,
}: {
  thread: FitMeetAgentThreadSummary;
  active: boolean;
  position: number;
  total: number;
  onSelect: () => void;
  onRename: (title: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftTitle, setDraftTitle] = useState(thread.title || thread.goal || '');
  const [pending, setPending] = useState<'rename' | 'delete' | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const title = thread.title || thread.goal || '未命名对话';
  const preview = thread.preview || thread.goal || thread.status || '继续这个对话';
  const updatedLabel = formatThreadTime(thread.updatedAt);
  const messageCount =
    typeof thread.messageCount === 'number' && thread.messageCount > 0
      ? `${thread.messageCount} 条`
      : '已同步';
  const branchCount =
    typeof thread.branch?.branchCount === 'number' && thread.branch.branchCount > 1
      ? thread.branch.branchCount
      : null;
  const threadMetaItems = [
    updatedLabel,
    messageCount,
    branchCount ? `${branchCount} 个版本` : null,
    thread.status === 'running' ? '生成中' : null,
  ].filter(Boolean) as string[];
  const threadMetaLabel = `${preview}，${threadMetaItems.join('，')}`;

  const saveRename = async () => {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === title) {
      setEditing(false);
      setMenuOpen(false);
      return;
    }
    setOperationError(null);
    setPending('rename');
    try {
      await onRename(nextTitle);
      setEditing(false);
      setMenuOpen(false);
    } catch (error) {
      setOperationError(threadListOperationError(error, '重命名没有保存，请再试一次。'));
    } finally {
      setPending(null);
    }
  };

  const deleteThread = async () => {
    setOperationError(null);
    setPending('delete');
    try {
      await onDelete();
      setConfirmDelete(false);
      setMenuOpen(false);
    } catch (error) {
      setOperationError(threadListOperationError(error, '删除没有完成，请再试一次。'));
    } finally {
      setPending(null);
    }
  };

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        'group relative rounded-lg transition-[background-color,transform,opacity] duration-150',
        active ? 'bg-black/[0.045]' : 'hover:bg-black/[0.045]',
        pending === 'delete' && 'opacity-60',
      )}
      role="listitem"
      aria-posinset={position}
      aria-setsize={total}
      data-thread-id={thread.id}
      data-thread-position={position}
      data-active={active ? 'true' : 'false'}
      data-message-count={typeof thread.messageCount === 'number' ? thread.messageCount : 0}
      data-branch-count={branchCount ?? 1}
      data-thread-status={thread.status}
      data-menu-state={menuOpen ? 'open' : 'closed'}
      data-editing={editing ? 'true' : 'false'}
      data-delete-confirmation={confirmDelete ? 'true' : 'false'}
      data-operation-state={pending ?? 'idle'}
      data-hover-menu="available"
    >
      {editing ? (
        <form
          className="flex items-center gap-1 px-2 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveRename();
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-[#18181b] outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/[0.06]"
            value={draftTitle}
            autoFocus
            aria-label="重命名会话"
            disabled={pending === 'rename'}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setEditing(false);
                setDraftTitle(title);
              }
            }}
          />
          <TooltipIconButton
            tooltip="保存"
            type="submit"
            className="h-7 w-7 text-[#18181b]"
            disabled={pending === 'rename'}
          >
            {pending === 'rename' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </TooltipIconButton>
          <TooltipIconButton
            tooltip="取消"
            type="button"
            className="h-7 w-7"
            onClick={() => {
              setEditing(false);
              setDraftTitle(title);
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </TooltipIconButton>
        </form>
      ) : (
        <ThreadListItemPrimitive.Trigger asChild>
          <button
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={`${title}，${threadMetaLabel}`}
            title={`${title} · ${threadMetaLabel}`}
            className={cn(
              'relative grid min-h-11 w-full min-w-0 content-center rounded-lg py-1.5 pl-3 pr-9 text-left transition-colors',
              active && 'font-medium text-[#18181b]',
            )}
            onClick={onSelect}
          >
            <span className="min-w-0 truncate text-sm leading-5 text-[#3f3f46]">
              <ThreadListItemPrimitive.Title fallback={title} />
            </span>
            <span
              className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-[11px] leading-4 text-[#9a9aa2]"
              data-testid="assistant-ui-thread-metadata"
            >
              {threadMetaItems.map((item, index) => (
                <span key={item} className="flex min-w-0 items-center gap-1">
                  {index > 0 ? (
                    <span className="size-0.5 shrink-0 rounded-full bg-[#c7c7cf]" aria-hidden="true" />
                  ) : null}
                  <span className="truncate">{item}</span>
                </span>
              ))}
            </span>
            <span
              className={cn(
                'pointer-events-none absolute inset-y-0 right-8 w-8 bg-gradient-to-l from-[#f9f9f9] to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
                active && 'from-[#f1f1f1]',
                menuOpen && 'opacity-100',
              )}
              aria-hidden="true"
            />
            <span className="sr-only">{threadMetaLabel}</span>
          </button>
        </ThreadListItemPrimitive.Trigger>
      )}
      {operationError ? (
        <p
          className="mx-2 mb-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs leading-5 text-red-700"
          role="status"
        >
          {operationError}
        </p>
      ) : null}
      <ThreadListItemMorePrimitive.Root
        modal={false}
        open={menuOpen}
        onOpenChange={(nextOpen) => {
          setMenuOpen(nextOpen);
          if (!nextOpen) {
            setConfirmDelete(false);
            setOperationError(null);
          }
        }}
      >
        <ThreadListItemMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip={`${title} 更多操作`}
            className={cn(
              'absolute right-1 top-1 h-7 w-7 bg-[#f9f9f9] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
              menuOpen && 'opacity-100',
              editing && 'hidden',
            )}
            onClick={() => setConfirmDelete(false)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </TooltipIconButton>
        </ThreadListItemMorePrimitive.Trigger>
        <ThreadListItemMorePrimitive.Content
          align="end"
          sideOffset={4}
          className="z-50 w-44 origin-top-right rounded-xl border border-black/10 bg-white p-1 text-sm opacity-100 shadow-xl outline-none"
          aria-label={`${title} 操作`}
        >
          {confirmDelete ? (
            <div className="p-2">
              <p className="text-xs leading-5 text-[#52525b]">删除后这个会话会从所有设备隐藏。</p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  role="menuitem"
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-black/[0.05]"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending === 'delete'}
                >
                  取消
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-70"
                  onClick={() => void deleteThread()}
                  disabled={pending === 'delete'}
                >
                  {pending === 'delete' ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : null}
                  删除
                </button>
              </div>
            </div>
          ) : (
            <>
              <ThreadListItemMorePrimitive.Item asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.05]"
                  onClick={() => {
                    setDraftTitle(title);
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  重命名
                </button>
              </ThreadListItemMorePrimitive.Item>
              <ThreadListItemMorePrimitive.Item asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-red-600 transition-colors hover:bg-red-50"
                  onClick={(event) => {
                    event.preventDefault();
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  删除
                </button>
              </ThreadListItemMorePrimitive.Item>
            </>
          )}
        </ThreadListItemMorePrimitive.Content>
      </ThreadListItemMorePrimitive.Root>
    </ThreadListItemPrimitive.Root>
  );
}

function createFallbackThreadSummary(threadListItem: {
  id: string;
  title?: string;
  status?: FitMeetAgentThreadSummary['status'];
  custom?: Record<string, unknown> | undefined;
}): FitMeetAgentThreadSummary {
  const custom = threadListItem.custom ?? {};
  const taskId =
    typeof custom.fitmeetTaskId === 'number'
      ? custom.fitmeetTaskId
      : Number(custom.fitmeetTaskId) || 0;
  const createdAt =
    typeof custom.createdAt === 'string' ? custom.createdAt : new Date().toISOString();
  const updatedAt =
    typeof custom.updatedAt === 'string' ? custom.updatedAt : createdAt;

  return {
    id: threadListItem.id,
    taskId,
    title: threadListItem.title || '未命名对话',
    preview: typeof custom.preview === 'string' ? custom.preview : null,
    status: threadListItem.status || 'regular',
    goal: typeof custom.preview === 'string' ? custom.preview : '继续这个对话',
    messageCount:
      typeof custom.messageCount === 'number' ? custom.messageCount : undefined,
    updatedAt,
    createdAt,
    custom,
  };
}

function isThreadActive(
  thread: FitMeetAgentThreadSummary,
  ...activeIds: Array<string | null | undefined>
) {
  const threadIdentities = identitiesForThread(thread);
  return activeIds.some((activeId) => {
    const activeIdentities = identitiesForValue(activeId);
    for (const identity of activeIdentities) {
      if (threadIdentities.has(identity)) return true;
    }
    return false;
  });
}

function identitiesForThread(thread: FitMeetAgentThreadSummary) {
  const identities = new Set<string>();
  addIdentityVariants(identities, thread.id);
  addIdentityVariants(identities, thread.threadId);
  addIdentityVariants(identities, thread.taskId);
  addIdentityVariants(identities, thread.custom?.threadId);
  addIdentityVariants(identities, thread.custom?.taskId);
  addIdentityVariants(identities, thread.custom?.fitmeetTaskId);
  return identities;
}

function identitiesForValue(value: unknown) {
  const identities = new Set<string>();
  addIdentityVariants(identities, value);
  return identities;
}

function addIdentityVariants(identities: Set<string>, value: unknown) {
  const rawValue =
    typeof value === 'number'
      ? Number.isFinite(value)
        ? String(Math.trunc(value))
        : ''
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!rawValue) return;
  identities.add(rawValue);
  const numericMatch = rawValue.match(/^(?:agent-task|task|thread):(\d+)$/i);
  const numericText = /^\d+$/.test(rawValue) ? rawValue : numericMatch?.[1];
  if (!numericText) return;
  const normalized = String(Number(numericText));
  identities.add(normalized);
  identities.add(`agent-task:${normalized}`);
  identities.add(`task:${normalized}`);
  identities.add(`thread:${normalized}`);
}

function threadListOperationError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.length > 80 ? `${error.message.slice(0, 78).trim()}…` : error.message;
  }
  return fallback;
}

function getThreadGroupLabel(thread: FitMeetAgentThreadSummary) {
  const updatedAt = new Date(thread.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return 'Recent';
  const now = Date.now();
  if (isSameLocalDay(updatedAt, now)) return '今天';
  const diff = now - updatedAt;
  const day = 24 * 60 * 60 * 1000;
  if (diff >= 0 && diff < 7 * day) return '过去 7 天';
  return '更早';
}

function isSameLocalDay(left: number, right: number) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

function formatThreadTime(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '刚刚';
  const diffMs = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return '刚刚';
  if (diffMs < hour) return `${Math.max(1, Math.floor(diffMs / minute))} 分钟前`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} 天前`;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(time));
}
