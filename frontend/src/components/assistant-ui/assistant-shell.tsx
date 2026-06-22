import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeft, Pencil } from 'lucide-react';

import type {
  FitMeetAgentThreadSummary,
  SocialAgentProfileGateStatus,
  SocialAgentReminderPreference,
  SocialAgentReminderPreferenceInput,
} from '../../api/socialAgentApi';
import type {
  FitMeetAssistantMessage,
  FitMeetAssistantRecovery,
} from '../agent-workspace/FitMeetAssistantUI.types';
import { ChatGPTThread } from './thread';
import { ChatGPTThreadList, MobileThreadListButton } from './thread-list';
import { TooltipIconButton } from './tooltip-icon-button';

const ASSISTANT_DESKTOP_SIDEBAR_STORAGE_KEY = 'fitmeet-agent:desktop-sidebar-open';

type AssistantShellProps = {
  messages: FitMeetAssistantMessage[];
  threads: FitMeetAgentThreadSummary[];
  threadsLoading: boolean;
  activeThreadId: string | null;
  isRunning: boolean;
  liveProcessStatus?: string | null;
  processStatusOwnedByMessage?: boolean;
  sessionRestoring: boolean;
  recovery?: FitMeetAssistantRecovery | null;
  profileGate?: SocialAgentProfileGateStatus | null;
  requiresAuth?: boolean;
  onBranchSwitch: (messageId: string, direction: 'previous' | 'next') => void;
  onFeedback?: (messageId: string, value: 'positive' | 'negative') => void;
  onNewConversation: () => void;
  onThreadRename: (threadId: string, title: string) => Promise<void> | void;
  onThreadDelete: (threadId: string) => Promise<void> | void;
  onLogin?: () => void;
  onRetryRecovery?: () => void;
  onDismissRecovery?: () => void;
  reminderPreference?: SocialAgentReminderPreference | null;
  reminderLoading?: boolean;
  reminderSaving?: boolean;
  reminderError?: string | null;
  focusReminderSettings?: boolean;
  onToggleReminders?: () => Promise<void> | void;
  onDisableReminders?: () => Promise<void> | void;
  onDismissReminder?: (reminderId: number | string) => Promise<void> | void;
  onUpdateReminderPreference?: (
    nextSettings: SocialAgentReminderPreferenceInput,
  ) => Promise<void> | void;
};

export function AssistantShell({
  messages,
  threads,
  threadsLoading,
  activeThreadId,
  isRunning,
  liveProcessStatus,
  processStatusOwnedByMessage,
  sessionRestoring,
  recovery,
  profileGate,
  requiresAuth,
  onBranchSwitch,
  onFeedback,
  onNewConversation,
  onThreadRename,
  onThreadDelete,
  onLogin,
  onRetryRecovery,
  onDismissRecovery,
  reminderPreference,
  reminderLoading,
  reminderSaving,
  reminderError,
  focusReminderSettings,
  onToggleReminders,
  onDisableReminders,
  onDismissReminder,
  onUpdateReminderPreference,
}: AssistantShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);
  const [isDesktopSidebar, setIsDesktopSidebar] = useState(isDesktopViewport);
  const mobileSidebarButtonRef = useRef<HTMLButtonElement | null>(null);

  const openDesktopSidebar = useCallback(() => {
    writeStoredDesktopSidebarOpen(true);
    setSidebarOpen(true);
  }, []);

  const toggleDesktopSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const nextOpen = !open;
      writeStoredDesktopSidebarOpen(nextOpen);
      return nextOpen;
    });
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setSidebarOpen(false);
    window.setTimeout(() => mobileSidebarButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') {
      const sync = () => {
        const nextIsDesktop = isDesktopViewport();
        setIsDesktopSidebar(nextIsDesktop);
        setSidebarOpen(nextIsDesktop ? readStoredDesktopSidebarOpen() : false);
      };
      sync();
      window.addEventListener('resize', sync);
      return () => window.removeEventListener('resize', sync);
    }
    const query = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      setIsDesktopSidebar(query.matches);
      setSidebarOpen(query.matches ? readStoredDesktopSidebarOpen() : false);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || isDesktopSidebar || !sidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMobileSidebar, isDesktopSidebar, sidebarOpen]);

  useEffect(() => {
    if (!focusReminderSettings) return;
    setSidebarOpen(true);
  }, [focusReminderSettings]);

  const isMobileSidebarModal = sidebarOpen && !isDesktopSidebar;

  return (
    <div
      className="flex h-[100svh] min-h-[100svh] overflow-hidden bg-white text-[#0d0d0d]"
      data-testid="assistant-ui-shell"
      data-sidebar-state={sidebarOpen ? 'open' : 'closed'}
      data-sidebar-mode={isDesktopSidebar ? 'desktop' : 'mobile'}
      data-auth-state={requiresAuth ? 'signed-out' : 'signed-in'}
      data-stream-state={isRunning ? 'running' : 'idle'}
      data-session-state={sessionRestoring ? 'restoring' : 'ready'}
      data-message-count={messages.length}
      data-thread-count={threads.length}
      data-active-thread-id={activeThreadId ?? ''}
    >
      <MobileThreadListButton
        ref={mobileSidebarButtonRef}
        onClick={() => setSidebarOpen(true)}
      />
      {isDesktopSidebar && !sidebarOpen ? (
        <div className="fixed left-3 top-3 z-30 hidden items-center gap-1 lg:flex">
          <TooltipIconButton
            tooltip="打开会话列表"
            className="bg-transparent text-[#5d5d5d] shadow-none hover:bg-black/[0.05] hover:text-[#0d0d0d]"
            onClick={openDesktopSidebar}
            data-testid="assistant-ui-desktop-sidebar-open"
            aria-label="打开会话列表"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
          <TooltipIconButton
            tooltip="新对话"
            className="bg-transparent text-[#5d5d5d] shadow-none hover:bg-black/[0.05] hover:text-[#0d0d0d]"
            onClick={onNewConversation}
            data-testid="assistant-ui-desktop-new-chat"
            aria-label="新对话"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        </div>
      ) : null}
      {sidebarOpen && !isDesktopSidebar ? (
        <button
          type="button"
          aria-label="关闭会话列表"
          data-testid="assistant-ui-mobile-sidebar-backdrop"
          data-state="open"
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={closeMobileSidebar}
        />
      ) : null}
      <ChatGPTThreadList
        open={sidebarOpen}
        threads={threads}
        threadsLoading={threadsLoading}
        activeThreadId={activeThreadId}
        requiresAuth={requiresAuth}
        onCloseMobile={isDesktopSidebar ? () => undefined : closeMobileSidebar}
        onNewConversation={onNewConversation}
        onThreadRename={onThreadRename}
        onThreadDelete={onThreadDelete}
        onLogin={onLogin}
        onToggleDesktop={isDesktopSidebar ? toggleDesktopSidebar : undefined}
        reminderPreference={reminderPreference}
        reminderLoading={reminderLoading}
        reminderSaving={reminderSaving}
        reminderError={reminderError}
        focusReminderSettings={focusReminderSettings}
        onToggleReminders={onToggleReminders}
        onUpdateReminderPreference={onUpdateReminderPreference}
      />
      <main
        className="flex min-w-0 flex-1 flex-col"
        aria-label="聊天主区域"
        aria-hidden={isMobileSidebarModal ? 'true' : undefined}
        data-testid="assistant-ui-main"
        data-stream-state={isRunning ? 'running' : 'idle'}
        data-session-state={sessionRestoring ? 'restoring' : 'ready'}
        data-recovery-state={recovery ? recovery.kind : 'none'}
        data-message-count={messages.length}
        data-active-thread-id={activeThreadId ?? ''}
        data-mobile-sidebar-modal={isMobileSidebarModal ? 'true' : 'false'}
        inert={isMobileSidebarModal}
      >
        <ChatGPTThread
          messages={messages}
          isRunning={isRunning}
          liveProcessStatus={liveProcessStatus}
          processStatusOwnedByMessage={processStatusOwnedByMessage}
          sessionRestoring={sessionRestoring}
          recovery={recovery}
          profileGate={profileGate}
          requiresAuth={requiresAuth}
          onLogin={onLogin}
          onRetryRecovery={onRetryRecovery}
          onDismissRecovery={onDismissRecovery}
          onBranchSwitch={onBranchSwitch}
          onFeedback={onFeedback}
          onDisableReminders={onDisableReminders}
          onDismissReminder={onDismissReminder}
      />
      </main>
    </div>
  );
}

function initialSidebarOpen() {
  if (!isDesktopViewport()) return false;
  return readStoredDesktopSidebarOpen();
}

function isDesktopViewport() {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(min-width: 1024px)').matches;
  }
  return window.innerWidth >= 1024;
}

function readStoredDesktopSidebarOpen() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(ASSISTANT_DESKTOP_SIDEBAR_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeStoredDesktopSidebarOpen(open: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ASSISTANT_DESKTOP_SIDEBAR_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    // Ignore storage failures; the live sidebar state still updates.
  }
}
