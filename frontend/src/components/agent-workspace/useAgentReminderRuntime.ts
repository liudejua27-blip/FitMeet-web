import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
  type SocialAgentReminderPreference,
  type SocialAgentReminderScene,
  type SocialAgentReminderTopic,
  type SocialAgentRunNextResponse,
  type UserFacingAgentResponse,
  socialAgentApi,
} from '../../api/socialAgentApi';
import type { AgentThreadMessage } from './socialAgentThreadStore';
import { readAgentReminderRouteState } from './agentReminderRouteState';
import { agentCardDedupKeys } from './agentCardIdentity';
import { socialCodexThreadIdForTask } from './socialCodexThreadId';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentReminderRuntimeInput = {
  isRealAgent: boolean;
  isLoggedIn: boolean;
  isRunning: boolean;
  activeTaskId: number | null;
  activeTaskStatus: string | null;
  sessionRestoring: boolean;
  routeTaskId: number | null;
  locationPathname: string;
  locationState: unknown;
  navigate: NavigateFunction;
  pendingOpportunityClarificationRef: MutableRefObject<boolean>;
  setActiveTaskId: SetState<number | null>;
  setActiveThreadId: SetState<string | null>;
  setMessages: SetState<AgentThreadMessage[]>;
  setReminderPreference: SetState<SocialAgentReminderPreference | null>;
  setReminderLoading: SetState<boolean>;
  setReminderSaving: SetState<boolean>;
  setReminderError: SetState<string | null>;
  refreshThreads: () => Promise<void>;
  publicText: (value: unknown, fallback: string) => string;
};

const RUN_NEXT_LOW_TOUCH_INTERVAL_MS = 90 * 1000;
const REMINDER_SAVE_ERROR = '提醒未保存';
const DEFAULT_REMINDER_TOPICS: SocialAgentReminderTopic[] = [
  'friendship',
  'fitness_partner',
  'activity',
];

export function useAgentReminderRuntime({
  isRealAgent,
  isLoggedIn,
  isRunning,
  activeTaskId,
  activeTaskStatus,
  sessionRestoring,
  routeTaskId,
  locationPathname,
  locationState,
  navigate,
  pendingOpportunityClarificationRef,
  setActiveTaskId,
  setActiveThreadId,
  setMessages,
  setReminderPreference,
  setReminderLoading,
  setReminderSaving,
  setReminderError,
  refreshThreads,
  publicText,
}: UseAgentReminderRuntimeInput) {
  const processedReminderRouteIdsRef = useRef<Set<string>>(new Set());
  const runNextCheckedAtRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) {
      setReminderPreference(null);
      return;
    }
    setReminderLoading(true);
    setReminderError(null);
    void (async () => {
      try {
        setReminderPreference(await socialAgentApi.getReminderPreference());
      } catch {
        setReminderError('提醒不可用');
      } finally {
        setReminderLoading(false);
      }
    })();
  }, [
    isLoggedIn,
    isRealAgent,
    setReminderError,
    setReminderLoading,
    setReminderPreference,
  ]);

  const appendRunNextCards = useCallback(
    async (taskId: number, messageId: string, options: { force?: boolean } = {}) => {
      if (isRunning) return;
      const now = Date.now();
      const lastCheckedAt = runNextCheckedAtRef.current.get(taskId) ?? 0;
      if (!options.force && now - lastCheckedAt < RUN_NEXT_LOW_TOUCH_INTERVAL_MS) return;
      runNextCheckedAtRef.current.set(taskId, now);
      try {
        const result = await socialAgentApi.runTaskNext(taskId);
        if (!Array.isArray(result.cards) || result.cards.length === 0) return;
        const response = responseFromRunNextResult(result);
        setMessages((current) => {
          if (current.some((message) => message.id === messageId)) return current;
          const existingCardKeys = new Set(
            current.flatMap((message) =>
              message.result?.cards.flatMap((card) => agentCardDedupKeys(card)) ?? [],
            ),
          );
          if (
            response.cards.some((card) =>
              agentCardDedupKeys(card).some((key) => existingCardKeys.has(key)),
            )
          ) {
            return current;
          }
          return [
            ...current,
            {
              id: messageId,
              role: 'assistant',
              status: 'done',
              content: response.assistantMessage,
              result: response,
              taskId,
              conversationIntent: 'social',
              showSocialResult: true,
            },
          ];
        });
      } catch {
        // Waiting-reply checks should never interrupt the main chat.
      }
    },
    [isRunning, setMessages],
  );

  useEffect(() => {
    if (
      !isRealAgent ||
      !isLoggedIn ||
      !activeTaskId ||
      sessionRestoring ||
      !isRunNextRestorableTaskStatus(activeTaskStatus)
    ) {
      return;
    }
    void appendRunNextCards(activeTaskId, `auto-run-next-${activeTaskId}`);
  }, [
    activeTaskId,
    activeTaskStatus,
    appendRunNextCards,
    isLoggedIn,
    isRealAgent,
    sessionRestoring,
  ]);

  useEffect(() => {
    const reminder = readAgentReminderRouteState(locationState);
    if (!reminder) return;
    const reminderKey = String(reminder.id ?? `${reminder.taskId ?? routeTaskId ?? 'route'}`);
    if (processedReminderRouteIdsRef.current.has(reminderKey)) return;
    processedReminderRouteIdsRef.current.add(reminderKey);
    const taskId = numberFromUnknown(reminder.taskId) ?? routeTaskId;
    if (taskId) {
      setActiveTaskId((current) => current ?? taskId);
      setActiveThreadId((current) => current ?? socialCodexThreadIdForTask(taskId));
    }
    pendingOpportunityClarificationRef.current = true;
    setMessages((current) => {
      const content = publicText(
        reminder.message,
        '你之前有提醒，要继续看看吗？',
      );
      if (current.some((message) => message.id === `reminder-${reminderKey}`)) {
        return current;
      }
      return [
        ...current,
        {
          id: `reminder-${reminderKey}`,
          role: 'assistant',
          status: 'done',
          content,
          taskId: taskId ?? null,
          conversationIntent: 'social',
          showSocialResult: false,
          reminderId: reminder.id,
          reminderContext: reminder.context,
        },
      ];
    });
    if (taskId && isRealAgent && isLoggedIn) {
      void appendRunNextCards(taskId, `reminder-run-next-${reminderKey}`, { force: true });
    }
    navigate(locationPathname, { replace: true, state: null });
  }, [
    appendRunNextCards,
    isLoggedIn,
    isRealAgent,
    locationPathname,
    locationState,
    navigate,
    pendingOpportunityClarificationRef,
    publicText,
    routeTaskId,
    setActiveTaskId,
    setActiveThreadId,
    setMessages,
  ]);

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshThreads();
      if (
        activeTaskId &&
        !sessionRestoring &&
        isRunNextRestorableTaskStatus(activeTaskStatus)
      ) {
        void appendRunNextCards(activeTaskId, `focus-run-next-${activeTaskId}-${Date.now()}`);
      }
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [
    activeTaskId,
    activeTaskStatus,
    appendRunNextCards,
    isLoggedIn,
    isRealAgent,
    refreshThreads,
    sessionRestoring,
  ]);

  const toggleReminders = async (
    current: SocialAgentReminderPreference | null,
    reminderSaving: boolean,
  ) => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    const nextEnabled = !current?.enabled;
    if (current) setReminderPreference({ ...current, enabled: nextEnabled });
    try {
      const updated = nextEnabled
        ? await socialAgentApi.updateReminderPreference(defaultReminderSettings(current, true))
        : await socialAgentApi.disableReminders();
      setReminderPreference(updated);
    } catch {
      if (current) setReminderPreference(current);
      setReminderError(REMINDER_SAVE_ERROR);
    } finally {
      setReminderSaving(false);
    }
  };

  const disableReminders = async (
    current: SocialAgentReminderPreference | null,
    reminderSaving: boolean,
  ) => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    if (current) setReminderPreference({ ...current, enabled: false });
    try {
      const updated = await socialAgentApi.disableReminders();
      setReminderPreference(updated);
    } catch {
      if (current) setReminderPreference(current);
      setReminderError(REMINDER_SAVE_ERROR);
      throw new Error('reminder_disable_failed');
    } finally {
      setReminderSaving(false);
    }
  };

  const dismissReminder = async (
    reminderId: number | string,
    current: SocialAgentReminderPreference | null,
    reminderSaving: boolean,
  ) => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    try {
      const result = await socialAgentApi.dismissReminder(reminderId);
      if (result.preference) setReminderPreference(result.preference);
    } catch {
      setReminderPreference(current);
      setReminderError(REMINDER_SAVE_ERROR);
      throw new Error('reminder_dismiss_failed');
    } finally {
      setReminderSaving(false);
    }
  };

  const updateReminderSettings = async (
    current: SocialAgentReminderPreference | null,
    reminderSaving: boolean,
    nextSettings: Parameters<typeof socialAgentApi.updateReminderPreference>[0],
  ) => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    try {
      const updated = await socialAgentApi.updateReminderPreference({
        ...defaultReminderSettings(current, current?.enabled ?? false),
        ...nextSettings,
      });
      setReminderPreference(updated);
    } catch {
      setReminderError(REMINDER_SAVE_ERROR);
    } finally {
      setReminderSaving(false);
    }
  };

  return {
    toggleReminders,
    disableReminders,
    dismissReminder,
    updateReminderSettings,
  };
}

function defaultReminderSettings(
  current: SocialAgentReminderPreference | null,
  enabled: boolean,
) {
  return {
    enabled,
    frequency: current?.frequency ?? 'weekly',
    topics: current?.topics?.length ? current.topics : DEFAULT_REMINDER_TOPICS,
    scenes: reminderScenesFromPreference(current),
    quietStart: current?.quietStart ?? '09:00',
    quietEnd: current?.quietEnd ?? '21:00',
  };
}

function reminderScenesFromPreference(
  preference: SocialAgentReminderPreference | null,
): SocialAgentReminderScene[] {
  const metadata = isRecord(preference?.metadata) ? preference?.metadata : {};
  const scenes = Array.isArray(metadata.reminderScenes)
    ? metadata.reminderScenes.filter(isReminderScene)
    : [];
  return scenes.length
    ? scenes
    : [
        'weekend_opportunities',
        'past_social_goal',
        'activity_follow_up',
        'life_graph_confirmation',
      ];
}

function isReminderScene(value: unknown): value is SocialAgentReminderScene {
  return (
    value === 'weekend_opportunities' ||
    value === 'past_social_goal' ||
    value === 'activity_follow_up' ||
    value === 'life_graph_confirmation'
  );
}

function responseFromRunNextResult(result: SocialAgentRunNextResponse): UserFacingAgentResponse {
  const hasCards = Array.isArray(result.cards) && result.cards.length > 0;
  return {
    assistantMessage: hasCards
      ? '对方有新回复，我已整理下一步。'
      : '我检查了当前任务，还没有需要展示的新进展。',
    lightStatus: hasCards ? '正在等待你确认' : '已整理回复',
    cards: result.cards ?? [],
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['执行前仍会确认。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'confirm',
  };
}

function isRunNextRestorableTaskStatus(status: string | null | undefined): boolean {
  return status === 'waiting_reply' || status === 'waiting_result';
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
