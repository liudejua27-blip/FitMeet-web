import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  type FitMeetAgentCardExecutableAction,
  type FitMeetAlphaCard,
  type FitMeetAgentThreadBranchSnapshot,
  type FitMeetAgentThreadSummary,
  type FitMeetAgentSchemaAction,
  type SocialAgentProfileGateStatus,
  type SocialAgentReminderPreference,
  type SocialAgentReminderScene,
  type SocialAgentRunNextResponse,
  type SocialAgentPermissionMode,
  type SocialCodexReplayPackage,
  type UserFacingAgentProgressEvent,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
  socialAgentApi,
} from '../../api/socialAgentApi';
import {
  type AgentApprovalDispatchResult,
  type AgentCheckpointSummary,
  agentApprovalsApi,
} from '../../api/agentApprovalsApi';
import { useAuthStore } from '../../stores';
import {
  FitMeetAssistantUI,
  type FitMeetAssistantAttachment,
  type FitMeetAssistantMessage,
  type FitMeetAssistantRecovery,
  type FitMeetAssistantStep,
} from './FitMeetAssistantUI';
import {
  type ToolUISchemaAction,
  toolUISchemaActionFromUnknown,
} from '../assistant-ui/tool-ui-schema';
import {
  createAgentAdapter,
  mapUserFacingAgentStreamEvent,
  mapAgentError,
  resolveAgentAdapterMode,
  type AgentError,
  type AgentStreamEvent,
} from './api';

type AgentView = 'home' | 'chat' | 'settings' | 'projects' | 'history';
type AgentConversationIntent = 'conversation' | 'social' | 'approval';
type AgentThreadMessage = FitMeetAssistantMessage;
type Step = FitMeetAssistantStep;
type AgentMessageBranchState = NonNullable<AgentThreadMessage['branch']>;
type StepState = Step['status'];

type AgentThreadSnapshot = {
  activeTaskId: number | null;
  activeThreadId: string | null;
  messages: AgentThreadMessage[];
  userResult: UserFacingAgentResponse | null;
  mode: SocialAgentPermissionMode;
  branchSelections: Record<string, number>;
  savedAt: number;
};

const AGENT_THREAD_STORAGE_KEY = 'fitmeet-agent-thread';
const AGENT_THREAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RUN_NEXT_LOW_TOUCH_INTERVAL_MS = 90 * 1000;
const ASSISTANT_STREAMING_PLACEHOLDER = '\u200b';

const technicalPublicTextPattern =
  /\b(traceId|agentTrace|structuredIntent|planner|tool\s*call|toolCall|toolCalls|DeepSeek|OpenAI|raw JSON|stack)\b|Life Graph Agent|Social Match Agent|Meet Loop Agent|工具调用|数据库字段|错误堆栈|原始目标|从已保存的步骤继续|从已保存的工具步骤|从已保存的 Agent 状态|继续刚才保存的 Agent 步骤/i;

const conversationSteps: Step[] = [
  { id: 'understand', label: '正在理解你的问题', status: 'pending' },
  { id: 'respond', label: '正在组织自然回复', status: 'pending' },
  { id: 'safety_filter', label: '正在检查必要边界', status: 'pending' },
];

const socialSteps: Step[] = [
  { id: 'understand', label: '正在理解你的需求', status: 'pending' },
  { id: 'profile', label: '正在结合上下文', status: 'pending' },
  { id: 'search', label: '正在查找合适的信息', status: 'pending' },
  { id: 'rank', label: '正在整理可行选项', status: 'pending' },
  { id: 'safety_filter', label: '正在检查必要边界', status: 'pending' },
  { id: 'approval', label: '需要你确认这一步', status: 'pending' },
];

export function AgentWorkspace({ view }: { view: AgentView }) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, openLogin, user } = useAuthStore();
  const [messages, setMessages] = useState<AgentThreadMessage[]>([]);
  const [steps, setSteps] = useState<Step[]>(conversationSteps);
  const [userResult, setUserResult] = useState<UserFacingAgentResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode] = useState<SocialAgentPermissionMode>('limited_auto');
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [activeTaskStatus, setActiveTaskStatus] = useState<string | null>(null);
  const [sessionRestoring, setSessionRestoring] = useState(false);
  const [recovery, setRecovery] = useState<FitMeetAssistantRecovery | null>(null);
  const [threads, setThreads] = useState<FitMeetAgentThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [branchSelections, setBranchSelections] = useState<Record<string, number>>({});
  const [branchSyncStatus, setBranchSyncStatus] = useState<
    Record<string, AgentMessageBranchState['syncStatus']>
  >({});
  const [reminderPreference, setReminderPreference] =
    useState<SocialAgentReminderPreference | null>(null);
  const [profileGate, setProfileGate] = useState<SocialAgentProfileGateStatus | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finishedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const skipNextRestoreRef = useRef(false);
  const branchReloadUserIdRef = useRef<string | null>(null);
  const processedReminderRouteIdsRef = useRef<Set<string>>(new Set());
  const runNextCheckedAtRef = useRef<Map<number, number>>(new Map());
  const runConversationIntentRef = useRef<AgentConversationIntent>('conversation');
  const pendingOpportunityClarificationRef = useRef(false);
  const pendingApprovalDispatchCardsRef = useRef<FitMeetAlphaCard[]>([]);
  const agentAdapterMode = useMemo(() => resolveAgentAdapterMode(), []);
  const isRealAgent = agentAdapterMode === 'real';
  const agentAdapter = useMemo(() => createAgentAdapter(agentAdapterMode), [agentAdapterMode]);
  const routeTaskId = numberFromUnknown(params.taskId);
  const currentUserId = user?.id ?? null;
  const canonicalActiveThreadId =
    activeThreadId && activeThreadId.trim()
      ? activeThreadId
      : activeTaskId
        ? String(activeTaskId)
        : null;
  const shellView = view === 'chat' || params.taskId ? 'chat' : view;
  const focusReminderSettings =
    new URLSearchParams(location.search).get('settings') === 'reminders';

  useEffect(() => {
    document.title = 'FitMeet Agent - 全球社交 AI 助手';
  }, []);

  useEffect(() => {
    if (shellView !== 'chat') {
      navigate('/agent/chat', { replace: true });
    }
  }, [navigate, shellView]);

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) return;
    const stored = readStoredAgentThread(currentUserId);
    if (!stored || (stored.messages.length === 0 && !stored.userResult)) return;
    setActiveTaskId((current) => current ?? stored.activeTaskId);
    setActiveThreadId(
      (current) => current ?? stored.activeThreadId ?? (stored.activeTaskId ? String(stored.activeTaskId) : null),
    );
    setUserResult((current) => current ?? stored.userResult);
    setBranchSelections((current) =>
      Object.keys(current).length > 0 ? current : stored.branchSelections,
    );
    setMessages((current) => {
      if (current.length > 0) return current;
      if (!stored.userResult) return stored.messages;
      const messageHasResult = stored.messages.some((item) => !!item.result);
      if (messageHasResult) return stored.messages;
      return stored.messages.map((item, index) =>
        item.role === 'assistant' && index === stored.messages.length - 1
          ? { ...item, result: stored.userResult }
          : item,
      );
    });
  }, [currentUserId, isLoggedIn, isRealAgent]);

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) {
      setProfileGate(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await socialAgentApi.getProfileGate();
        if (!cancelled) setProfileGate(next);
      } catch {
        if (!cancelled) setProfileGate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, isLoggedIn, isRealAgent]);

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) return;
    if (messages.length === 0 && !userResult && !activeTaskId) return;
    writeStoredAgentThread(currentUserId, {
      activeTaskId,
      activeThreadId: canonicalActiveThreadId,
      messages,
      userResult,
      mode,
      branchSelections,
    });
  }, [
    activeTaskId,
    branchSelections,
    canonicalActiveThreadId,
    currentUserId,
    isLoggedIn,
    isRealAgent,
    messages,
    mode,
    userResult,
  ]);

  const refreshThreads = useCallback(async () => {
    if (!isRealAgent || !isLoggedIn) return;
    setThreadsLoading(true);
    try {
      const next = await socialAgentApi.listThreads(40);
      setThreads(next.threads);
      if (!activeThreadId && activeTaskId) setActiveThreadId(String(activeTaskId));
    } catch {
      // Thread list persistence should not block the chat surface.
    } finally {
      setThreadsLoading(false);
    }
  }, [activeTaskId, activeThreadId, isLoggedIn, isRealAgent]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const refreshReminderPreference = useCallback(async () => {
    if (!isRealAgent || !isLoggedIn) {
      setReminderPreference(null);
      return;
    }
    setReminderLoading(true);
    setReminderError(null);
    try {
      const preference = await socialAgentApi.getReminderPreference();
      setReminderPreference(preference);
    } catch {
      setReminderError('提醒状态暂时不可用');
    } finally {
      setReminderLoading(false);
    }
  }, [isLoggedIn, isRealAgent]);

  useEffect(() => {
    void refreshReminderPreference();
  }, [refreshReminderPreference]);

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
          const existingCardIds = new Set(
            current.flatMap((message) => message.result?.cards.map((card) => card.id) ?? []),
          );
          if (response.cards.some((card) => existingCardIds.has(card.id))) return current;
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
    [isRunning],
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
    const reminder = readAgentReminderRouteState(location.state);
    if (!reminder) return;
    const reminderKey = String(reminder.id ?? `${reminder.taskId ?? routeTaskId ?? 'route'}`);
    if (processedReminderRouteIdsRef.current.has(reminderKey)) return;
    processedReminderRouteIdsRef.current.add(reminderKey);
    const taskId = numberFromUnknown(reminder.taskId) ?? routeTaskId;
    if (taskId) {
      setActiveTaskId((current) => current ?? taskId);
      setActiveThreadId((current) => current ?? String(taskId));
    }
    pendingOpportunityClarificationRef.current = true;
    setMessages((current) => {
      const content = publicText(
        reminder.message,
        '你之前有一个社交机会提醒。要不要我帮你看看现在有哪些安全机会？',
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
    navigate(location.pathname, { replace: true, state: null });
  }, [
    appendRunNextCards,
    isLoggedIn,
    isRealAgent,
    location.pathname,
    location.state,
    navigate,
    routeTaskId,
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

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn || isRunning || !canonicalActiveThreadId) return;
    const snapshot = buildBranchSnapshot(messages, branchSelections);
    const metadata = buildThreadMetadata(messages, userResult);
    if (!snapshot && Object.keys(metadata).length === 0) return;
    const timeout = window.setTimeout(() => {
      try {
        void socialAgentApi
          .updateThread(canonicalActiveThreadId, undefined, snapshot, metadata)
          .catch(() => {
            // Thread metadata sync is best-effort. Auth expiry or transient network
            // failures must not interrupt the active chat surface.
          });
      } catch {
        // requestProtected can fail synchronously when auth has expired.
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [
    activeThreadId,
    branchSelections,
    canonicalActiveThreadId,
    isLoggedIn,
    isRealAgent,
    isRunning,
    messages,
    userResult,
  ]);

  const refreshLatestCheckpointRecovery = useCallback(
    async (taskId: number | string | null | undefined) => {
      if (!isRealAgent || !isLoggedIn) return;
      if (typeof taskId !== 'number' && typeof taskId !== 'string') return;
      try {
        const { checkpoint } = await agentApprovalsApi.latestCheckpointForTask(taskId);
        const nextRecovery = createCheckpointAvailableRecovery(checkpoint);
        if (nextRecovery) setRecovery(nextRecovery);
      } catch {
        // Server restore remains the source of truth; missing checkpoint summaries
        // should not block the chat shell from loading.
      }
    },
    [isLoggedIn, isRealAgent],
  );

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) return undefined;
    if (skipNextRestoreRef.current) {
      skipNextRestoreRef.current = false;
      return undefined;
    }
    let cancelled = false;
    setSessionRestoring(true);
    void agentAdapter
      .restoreSession(routeTaskId ?? undefined)
      .then((restored) => {
        if (cancelled || !restored) return;
        const restoredResponse = sanitizeRestoredResponse(restored.response);
        setActiveTaskId(restored.taskId ?? null);
        setActiveThreadId(restored.taskId ? String(restored.taskId) : null);
        setActiveTaskStatus(restored.taskStatus ?? null);
        setUserResult(restoredResponse);
        setRecovery(null);
        void refreshLatestCheckpointRecovery(restored.taskId ?? null);
        const restoredIntent = intentForRestoredResponse(restoredResponse, 'conversation');
        setMessages((current) =>
          current.length > 0
            ? current
            : [
                {
                  id: nextId('assistant'),
                  role: 'assistant',
                  status: 'done',
                  content: publicText(
                    restoredResponse.assistantMessage,
                    '我已经恢复了上一次对话。',
                  ),
                  result: restoredResponseHasUsefulSurface(restoredResponse)
                    ? restoredResponse
                    : null,
                  taskId: restored.taskId ?? null,
                  conversationIntent: restoredIntent,
                  showSocialResult: restoredIntent !== 'conversation',
                },
              ],
        );
        if (shellView !== 'chat') navigate('/agent/chat', { replace: true });
        if (restored.taskId) {
          void socialAgentApi
            .getTaskEventReplay(restored.taskId)
            .then((replay) => {
              if (cancelled || !shouldRestoreReplayTrace(replay, restoredIntent)) return;
              const replayIntent = intentForReplayTrace(replay, restoredIntent);
              if (replayIntent !== restoredIntent) {
                setMessages((current) =>
                  current.length === 0
                    ? [
                        {
                          id: nextId('assistant'),
                          role: 'assistant',
                          status: 'done',
                          content: publicText(
                            restoredResponse.assistantMessage,
                            '我已经恢复了这段对话。',
                          ),
                          result: restoredResponseHasUsefulSurface(restoredResponse)
                            ? restoredResponse
                            : null,
                          taskId: restored.taskId ?? null,
                          conversationIntent: replayIntent,
                          showSocialResult: replayIntent === 'approval',
                        },
                      ]
                    : current.map((message, index) =>
                        index === current.length - 1 && message.role === 'assistant'
                          ? {
                              ...message,
                              conversationIntent: replayIntent,
                              showSocialResult:
                                message.showSocialResult || replayIntent === 'approval',
                            }
                          : message,
                      ),
                );
              }
              const replaySteps = replay.events
                .map(mapUserFacingAgentStreamEvent)
                .filter((event): event is Extract<AgentStreamEvent, { type: 'progress' }> =>
                  event?.type === 'progress',
                );
              if (replaySteps.length === 0) return;
              setSteps((current) =>
                replaySteps.reduce(
                  (nextSteps, event) => mergeProgressStep(nextSteps, event, replayIntent),
                  current,
                ),
              );
            })
            .catch(() => {
              // Replay is best-effort. Session restore and current chat must remain usable
              // if older deployments or transient auth issues do not return event replay.
            });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSessionRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    agentAdapter,
    isLoggedIn,
    isRealAgent,
    navigate,
    refreshLatestCheckpointRecovery,
    routeTaskId,
    shellView,
  ]);

  const submit = async (
    event?: FormEvent,
    prompt?: string,
    attachments: FitMeetAssistantAttachment[] = [],
  ) => {
    event?.preventDefault();
    const goal = (prompt ?? '').trim();
    if (!goal) {
      setRecovery(createAgentRecoveryFromError(mapAgentError(new Error('MISSING_INFO')), ''));
      return;
    }
    if (isRunning) return;
    const continuesOpportunityClarification =
      pendingOpportunityClarificationRef.current && !cancelsOpportunityClarification(goal);
    if (pendingOpportunityClarificationRef.current && cancelsOpportunityClarification(goal)) {
      pendingOpportunityClarificationRef.current = false;
    }
    const conversationIntent = continuesOpportunityClarification ? 'social' : intentForPrompt(goal);
    runConversationIntentRef.current = conversationIntent;
    if (isRealAgent && !isLoggedIn) {
      setMessages((current) => [
        ...current,
        {
          id: nextId('user'),
          role: 'user',
          content: goal,
          attachments,
          taskId: activeTaskId,
          conversationIntent,
        },
      ]);
      setRecovery(createInlineAuthRecovery(goal));
      return;
    }

    const branchUserId = branchReloadUserIdRef.current;
    setMessages((current) =>
      branchUserId
        ? current
        : [
            ...current,
            {
              id: nextId('user'),
              role: 'user',
              content: goal,
              attachments,
              taskId: activeTaskId,
              conversationIntent,
            },
          ],
    );
    branchReloadUserIdRef.current = null;
    setUserResult(null);
    setRecovery(null);
    setIsRunning(true);
    finishedRef.current = false;
    stopRequestedRef.current = false;
    appendStreamingAssistant(activeTaskId, conversationIntent);
    setSteps(
      stepsForPrompt(goal).map((step, index) => ({
        ...step,
        status: index === 0 ? 'running' : 'pending',
      })),
    );

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const finalResult = await agentAdapter.run(
        {
          goal,
          permissionMode: mode,
          taskId: activeTaskId,
          idempotencyKey: `agent-run-${Date.now()}`,
          clientContext: {
            source: 'web',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: navigator.language,
            threadId: canonicalActiveThreadId,
          },
        },
        {
          onEvent: handleAgentStreamEvent,
          signal: controller.signal,
        },
      );
      setActiveTaskId(finalResult.taskId ?? activeTaskId);
      const nextThreadId =
        threadIdFromResponse(finalResult.response) ??
        (finalResult.taskId ? String(finalResult.taskId) : null);
      if (nextThreadId) {
        setActiveThreadId(nextThreadId);
        void refreshThreads();
      }
      if (!finishedRef.current) finishUserFacing(finalResult.response);
      if (shellView !== 'chat') {
        skipNextRestoreRef.current = true;
        navigate('/agent/chat', { replace: false });
      }
    } catch (error) {
      const stopped = stopRequestedRef.current || isAbortError(error);
      const agentError = stopped
        ? mapAgentError(new DOMException('Aborted', 'AbortError'))
        : mapAgentError(error);
      const nextRecovery = createAgentRecoveryFromError(agentError, goal);
      setRecovery(nextRecovery);
      if (stopped) {
        finishAssistantDelta();
      } else {
        setMessages((current) => [
          ...current,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content: nextRecovery.message,
            conversationIntent: runConversationIntentRef.current,
          },
        ]);
      }
      setSteps((current) =>
        current.map((step) =>
          step.status === 'running' ? { ...step, status: stopped ? 'pending' : 'error' } : step,
        ),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      stopRequestedRef.current = false;
    }
  };

  const handleAgentStreamEvent = (event: AgentStreamEvent) => {
    const streamIntent = resolveIntentFromStreamEvent(event);
    if (streamIntent) runConversationIntentRef.current = streamIntent;
    if (event.type === 'assistant_delta') {
      appendAssistantDelta(event.delta);
      return;
    }
    if (event.type === 'assistant_done') {
      finishAssistantDelta();
      return;
    }
    if (event.type === 'progress') {
      if (isApprovalProgressEvent(event)) runConversationIntentRef.current = 'approval';
      const eventTaskId = numberFromUnknown(event.metadata?.taskId);
      if (eventTaskId) {
        setActiveTaskId((current) => current ?? eventTaskId);
        setActiveThreadId((current) => current ?? String(eventTaskId));
      }
      if (shouldAttachVisibleProcessToMessage(event)) {
        appendStreamingAssistant(eventTaskId ?? activeTaskId, runConversationIntentRef.current);
      }
      setSteps((current) => mergeProgressStep(current, event, runConversationIntentRef.current));
      return;
    }
    if (event.type === 'status') {
      if (typeof event.taskId === 'number' && event.taskId > 0) {
        setActiveTaskId(event.taskId);
      }
      setSteps((current) =>
        mergeStep(
          current,
          stepIdFromLightStatus(event.lightStatus),
          event.lightStatus,
          'running',
          runConversationIntentRef.current,
        ),
      );
      return;
    }
    if (event.type === 'approval_required') {
      runConversationIntentRef.current = 'approval';
      setSteps((current) =>
        mergeStep(current, 'confirm', '需要你确认这一步', 'waiting', 'approval'),
      );
      return;
    }
    if (event.type === 'result') {
      finishUserFacing(event.result);
    }
  };

  const appendAssistantDelta = (delta: string) => {
    const cleanDelta = publicText(delta, '');
    if (!cleanDelta) return;
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role === 'assistant' && last.status === 'streaming') {
        const previousContent =
          last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : last.content;
        return [
          ...current.slice(0, -1),
          {
            ...last,
            content: `${previousContent}${cleanDelta}`,
          },
        ];
      }
      return [
        ...current,
        {
          id: nextId('assistant-stream'),
          role: 'assistant',
          content: cleanDelta,
          status: 'streaming',
          taskId: activeTaskId,
          conversationIntent: runConversationIntentRef.current,
        },
      ];
    });
  };

  const appendStreamingAssistant = (
    taskId: number | null,
    conversationIntent: AgentConversationIntent,
  ) => {
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role === 'assistant' && last.status === 'streaming') return current;
      return [
        ...current,
        {
          id: nextId('assistant-stream'),
          role: 'assistant',
          content: ASSISTANT_STREAMING_PLACEHOLDER,
          status: 'streaming',
          taskId,
          conversationIntent,
        },
      ];
    });
  };

  const finishAssistantDelta = () => {
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role !== 'assistant' || last.status !== 'streaming') return current;
      return [...current.slice(0, -1), { ...last, status: 'done' }];
    });
  };

  const mergePendingApprovalDispatchCards = (
    finalResult: UserFacingAgentResponse,
  ): UserFacingAgentResponse => {
    const cards = pendingApprovalDispatchCardsRef.current;
    if (cards.length === 0) return finalResult;
    pendingApprovalDispatchCardsRef.current = [];
    const existingApprovalIds = new Set(
      finalResult.cards
        .map((card) => stringFromUnknown(card.data.approvalId))
        .filter(Boolean),
    );
    const nextCards = cards.filter((card) => {
      const approvalId = stringFromUnknown(card.data.approvalId);
      return !approvalId || !existingApprovalIds.has(approvalId);
    });
    if (nextCards.length === 0) return finalResult;
    return {
      ...finalResult,
      cards: [...nextCards, ...finalResult.cards],
    };
  };

  const finishUserFacing = (finalResult: UserFacingAgentResponse) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const displayResult = mergePendingApprovalDispatchCards(finalResult);
    setUserResult(displayResult);
    setRecovery(null);
    const finalMessage = publicText(
      displayResult.assistantMessage,
      '我整理好了，可以继续追问或让我接着处理下一步。',
    );
    const conversationIntent = intentForResponse(displayResult, runConversationIntentRef.current);
    const showSocialResult = conversationIntent === 'social' || conversationIntent === 'approval';
    pendingOpportunityClarificationRef.current =
      responseAwaitsOpportunityClarification(displayResult);
    setMessages((current) => {
      const last = current.at(-1);
      const assistantMessage = {
        id: nextId('assistant'),
        role: 'assistant',
        content: finalMessage,
        status: 'done',
        result: displayResult,
        taskId: findTaskId(displayResult) ?? activeTaskId,
        traceId: traceIdFromResult(displayResult),
        showSocialResult,
        conversationIntent,
      } satisfies AgentThreadMessage;
      if (last?.role === 'assistant' && last.status === 'streaming') {
        const previousContent =
          last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : last.content;
        return [
          ...current.slice(0, -1),
          {
            ...last,
            content: previousContent.trim() ? previousContent : finalMessage,
            status: 'done',
            result: displayResult,
            taskId: findTaskId(displayResult) ?? activeTaskId,
            traceId: traceIdFromResult(displayResult),
            branch: branchForAssistant(current, last.id),
            showSocialResult,
            conversationIntent,
          },
        ];
      }
      if (last?.role === 'assistant' && last.status === 'done' && last.content.trim()) {
        if (!last.result) {
          return [
            ...current.slice(0, -1),
            {
              ...last,
              result: displayResult,
              taskId: findTaskId(displayResult) ?? activeTaskId,
              traceId: traceIdFromResult(displayResult),
              showSocialResult,
              conversationIntent,
            },
          ];
        }
        if (last.content.trim() !== finalMessage.trim()) {
          return [...current, assistantMessage];
        }
        return current;
      }
      return [...current, assistantMessage];
    });
    const awaitingApproval = responseRequiresApproval(displayResult);
    const lightStatusStepId = stepIdFromLightStatus(displayResult.lightStatus);
    setSteps((current) =>
      current.map((step) => ({
        ...step,
        status:
          awaitingApproval && isApprovalProgressStepId(step.id)
            ? 'waiting'
            : step.id === lightStatusStepId && !(awaitingApproval && isApprovalProgressStepId(step.id))
            ? 'success'
            : step.status === 'running' ||
                (step.status === 'pending' && !isApprovalProgressStepId(step.id))
              ? 'success'
              : step.status,
      })),
    );
  };

  const stopRun = () => {
    stopRequestedRef.current = true;
    abortRef.current?.abort();
    finishAssistantDelta();
    setIsRunning(false);
    setSteps((current) =>
      current.map((step) => (step.status === 'running' ? { ...step, status: 'pending' } : step)),
    );
  };

  const currentGoal =
    [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const reloadLastUserMessage = () => {
    if (!currentGoal || isRunning) return;
    branchReloadUserIdRef.current =
      [...messages].reverse().find((message) => message.role === 'user')?.id ?? null;
    void submit(undefined, currentGoal);
  };

  const runCheckpointStream = async (
    checkpointId: number | string | null | undefined,
    action: 'resume' | 'retry' | 'replay' | 'fork',
    decision?: 'approved' | 'rejected' | null,
    stepId?: string | null,
  ) => {
    const resolvedCheckpointId =
      typeof checkpointId === 'number' || typeof checkpointId === 'string' ? checkpointId : null;
    if (!resolvedCheckpointId) throw new Error('当前步骤没有可恢复的检查点。');
    if (isRunning) throw new Error('上一轮还在生成，请先停止或等待它完成。');
    setRecovery(null);
    setIsRunning(true);
    finishedRef.current = false;
    stopRequestedRef.current = false;
    setSteps((current) =>
      current.length > 0
        ? current.map((step) =>
            step.status === 'waiting' || step.status === 'error'
              ? { ...step, status: 'running' }
              : step,
          )
        : conversationSteps.map((step, index) => ({
            ...step,
            status: index === 0 ? 'running' : 'pending',
          })),
    );
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const finalResult = await socialAgentApi.runCheckpointStream(
        {
          checkpointId: resolvedCheckpointId,
          action,
          stepId,
          decision: decision ?? null,
        },
        (event) => handleAgentStreamEvent(event as AgentStreamEvent),
        controller.signal,
      );
      setActiveTaskId(findTaskId(finalResult) ?? activeTaskId);
      if (!finishedRef.current) finishUserFacing(finalResult);
    } catch (error) {
      const stopped = stopRequestedRef.current || isAbortError(error);
      if (stopped) {
        finishAssistantDelta();
      } else {
        setRecovery(createAgentRecoveryFromError(mapAgentError(error), currentGoal));
      }
      setSteps((current) =>
        current.map((step) =>
          step.status === 'running' ? { ...step, status: stopped ? 'pending' : 'error' } : step,
        ),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      stopRequestedRef.current = false;
    }
  };

  const retryRecovery = () => {
    if (!recovery || isRunning) return;
    if (recovery.kind === 'checkpoint_available' && recovery.checkpoint) {
      void runCheckpointStream(
        recovery.checkpoint.checkpointId,
        recovery.checkpoint.action,
        null,
        recovery.checkpoint.stepId,
      );
      return;
    }
    if (!recovery.prompt) return;
    void submit(undefined, recovery.prompt);
  };

  const appendApprovalDispatchResultMessage = (input: {
    approvalId: number;
    dispatchResult?: AgentApprovalDispatchResult;
    taskId?: number | null;
  }) => {
    const response = responseFromApprovalDispatchResult(input);
    if (!response) return;
    pendingApprovalDispatchCardsRef.current = [
      ...pendingApprovalDispatchCardsRef.current,
      ...response.cards,
    ];
    setMessages((current) => {
      const hasRenderedCard = (message: AgentThreadMessage) =>
        message.result?.cards.some(
          (card) =>
            stringFromUnknown(card.data.approvalId) === String(input.approvalId) &&
            card.schemaType === 'meet_loop.timeline',
        ) === true;
      if (current.some(hasRenderedCard)) return current;
      const targetIndex = current.findIndex(
        (message) =>
          message.role === 'assistant' &&
          message.result &&
          (message.resolvedApproval?.id === input.approvalId ||
            message.result.pendingConfirmations.some(
              (confirmation) => String(confirmation.id) === String(input.approvalId),
            )),
      );
      if (targetIndex >= 0) {
        return current.map((message, index) =>
          index === targetIndex && message.result
            ? {
                ...message,
                result: {
                  ...message.result,
                  cards: [...message.result.cards, ...response.cards],
                },
                showSocialResult: true,
                conversationIntent: 'approval',
              }
            : message,
        );
      }
      return [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: response.assistantMessage,
          status: 'done',
          result: response,
          taskId: input.taskId ?? activeTaskId,
          conversationIntent: 'approval',
          showSocialResult: true,
        },
      ];
    });
  };

  const approveInlineApproval = async (approvalId: number) => {
    if (isRunning) return;
    const result = await agentApprovalsApi.approve(approvalId);
    setMessages((current) =>
      current.map((message) =>
        message.role === 'assistant' && message.result?.pendingConfirmations.length
          ? {
              ...message,
              result: {
                ...message.result,
                pendingConfirmations: message.result.pendingConfirmations.filter(
                  (confirmation) => String(confirmation.id) !== String(approvalId),
                ),
              },
              resolvedApproval: {
                id: approvalId,
                decision: 'approved',
                summary:
                  message.result.pendingConfirmations.find(
                    (confirmation) => String(confirmation.id) === String(approvalId),
                  )?.summary ?? null,
              },
            }
          : message,
      ),
    );
    setSteps((current) =>
      current.map((step) => (step.status === 'waiting' ? { ...step, status: 'success' } : step)),
    );
    appendApprovalDispatchResultMessage({
      approvalId,
      dispatchResult: result.result,
      taskId: result.resume?.taskId ?? activeTaskId,
    });
    if (result?.dispatched === false && result.dispatchError) {
      setRecovery({
        kind: 'action_failed',
        title: '确认已记录，但执行没有完成',
        message: publicText(result.dispatchError, '确认已记录，但后续动作没有完成。'),
        prompt: currentGoal,
        retryable: Boolean(currentGoal),
      });
      return;
    }
    if (result.checkpointError) {
      setRecovery({
        kind: 'checkpoint_failed',
        title: '确认已执行，但恢复状态没有保存完整',
        message: publicText(
          result.checkpointError,
          '确认已执行，但恢复状态没有保存完整。为了避免重复执行，我不会自动重跑这一步。你可以继续发送新的要求，我会从当前结果往后处理。',
        ),
        prompt: '',
        retryable: false,
      });
      return;
    }
    if (result.resume?.checkpointId) {
      await runCheckpointStream(result.resume.checkpointId, 'resume', 'approved');
      return;
    }
    reloadLastUserMessage();
  };

  const runCardActionStream = async (input?: {
    taskId?: number | string | null;
    action?: string | null;
    schemaAction?: string | null;
    payload?: Record<string, unknown>;
  }) => {
    if (isRunning) throw new Error('上一轮还在生成，请先停止或等待它完成。');
    const taskId = numberFromUnknown(input?.taskId) ?? activeTaskId;
    if (!taskId) throw new Error('当前卡片缺少任务上下文，不能继续执行。');
    const action = schemaActionFromToolInput(input?.schemaAction);
    if (!action) throw new Error('当前卡片动作暂时不可执行。');

    runConversationIntentRef.current =
      action === 'opener.confirm_send' || action === 'activity.confirm_create'
        ? 'approval'
        : 'social';
    setRecovery(null);
    setIsRunning(true);
    finishedRef.current = false;
    stopRequestedRef.current = false;
    setSteps(
      socialSteps.map((step, index) => ({
        ...step,
        status: index === 0 ? 'running' : 'pending',
      })),
    );
    let appendedActionResultMessage = shouldAppendActionResultMessage(action);
    if (appendedActionResultMessage) {
      appendStreamingAssistant(taskId, runConversationIntentRef.current);
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const finalResult = await agentAdapter.performAction(
        taskId,
        {
          action,
          payload: input?.payload ?? {},
          idempotencyKey: idempotencyKeyForCardAction(taskId, action, input?.payload),
        },
        {
          onEvent: (event) => {
            if (event.type === 'result') {
              const shouldAppendResult = shouldAppendCardActionResultMessage(action, event.result);
              if (!shouldAppendResult) return;
              if (!appendedActionResultMessage) {
                appendStreamingAssistant(taskId, runConversationIntentRef.current);
                appendedActionResultMessage = true;
              }
            }
            handleAgentStreamEvent(cardActionStreamEvent(action, event));
          },
          signal: controller.signal,
        },
      );
      setActiveTaskId(finalResult.taskId ?? taskId);
      if (!finishedRef.current) {
        if (shouldAppendCardActionResultMessage(action, finalResult.response)) {
          if (!appendedActionResultMessage) {
            appendStreamingAssistant(taskId, runConversationIntentRef.current);
          }
          finishUserFacing({
            ...finalResult.response,
            assistantMessage: assistantMessageForCardAction(action, finalResult.response),
          });
        } else {
          finishedRef.current = true;
          setSteps((current) =>
            current.map((step) =>
              step.status === 'running' || step.status === 'pending'
                ? { ...step, status: 'success' }
                : step,
            ),
          );
        }
      }
      void refreshThreads();
    } catch (error) {
      const stopped = stopRequestedRef.current || isAbortError(error);
      if (stopped) {
        finishAssistantDelta();
      } else {
        setRecovery(createAgentRecoveryFromError(mapAgentError(error), currentGoal));
      }
      setSteps((current) =>
        current.map((step) =>
          step.status === 'running' ? { ...step, status: stopped ? 'pending' : 'error' } : step,
        ),
      );
      if (!stopped) throw error;
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      stopRequestedRef.current = false;
    }
  };

  const rejectInlineApproval = async (approvalId: number) => {
    if (isRunning) return;
    const result = await agentApprovalsApi.reject(approvalId);
    setMessages((current) =>
      current.map((message) =>
        message.role === 'assistant' && message.result?.pendingConfirmations.length
          ? {
              ...message,
              result: {
                ...message.result,
                pendingConfirmations: message.result.pendingConfirmations.filter(
                  (confirmation) => String(confirmation.id) !== String(approvalId),
                ),
              },
              resolvedApproval: {
                id: approvalId,
                decision: 'rejected',
                summary:
                  message.result.pendingConfirmations.find(
                    (confirmation) => String(confirmation.id) === String(approvalId),
                  )?.summary ?? null,
              },
            }
          : message,
      ),
    );
    setSteps((current) =>
      current.map((step) => (step.status === 'waiting' ? { ...step, status: 'success' } : step)),
    );
    if (result.checkpointError) {
      setRecovery({
        kind: 'checkpoint_failed',
        title: '已按你的拒绝处理，但恢复状态没有保存完整',
        message: publicText(
          result.checkpointError,
          '我已经按你的选择停止这一步，但恢复状态没有保存完整。为了避免重复处理，我不会自动重跑这一步。你可以继续发送新的要求，我会从当前结果往后处理。',
        ),
        prompt: '',
        retryable: false,
      });
      return;
    }
    if (result.resume?.checkpointId) {
      await runCheckpointStream(result.resume.checkpointId, 'resume', 'rejected');
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: nextId('assistant'),
        role: 'assistant',
        content: '好的，我不会执行这一步。你可以继续补充要求，或者让我换一种更稳妥的方式处理。',
        status: 'done',
        taskId: activeTaskId,
        conversationIntent: 'conversation',
      },
    ]);
  };

  const resetConversation = () => {
    clearStoredAgentThread(currentUserId);
    skipNextRestoreRef.current = true;
    setMessages([]);
    setSteps(conversationSteps);
    setUserResult(null);
    setRecovery(null);
    setActiveTaskId(null);
    setActiveTaskStatus(null);
    setActiveThreadId(null);
    setBranchSelections({});
    setIsRunning(false);
    runConversationIntentRef.current = 'conversation';
  };

  const submitFeedback = async (messageId: string, value: 'positive' | 'negative') => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              feedback: value,
              feedbackStatus: 'submitting',
              feedbackErrorValue: null,
            }
          : message,
      ),
    );
    const message = messages.find((item) => item.id === messageId);
    try {
      await socialAgentApi.submitMessageFeedback(messageId, {
        value,
        taskId: message?.taskId ?? activeTaskId,
        traceId: message?.traceId ?? null,
        source: 'agent_web',
        metadata: {
          role: message?.role,
          branch: message?.branch,
        },
      });
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? { ...item, feedbackStatus: 'submitted', feedbackErrorValue: null }
            : item,
        ),
      );
    } catch {
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                feedback: message?.feedback ?? null,
                feedbackStatus: 'failed',
                feedbackErrorValue: value,
              }
            : item,
        ),
      );
    }
  };

  const switchAssistantBranch = (messageId: string, direction: 'previous' | 'next') => {
    const message = decorateAssistantBranches(messages, branchSelections).find(
      (item) => item.id === messageId,
    );
    if (!message?.branch) return;
    const groupId = message.branch.groupId;
    const activeIndex =
      branchSelections[groupId] ?? message.branch.activeIndex ?? message.branch.count;
    const nextIndex =
      direction === 'next'
        ? Math.min(message.branch.count, activeIndex + 1)
        : Math.max(1, activeIndex - 1);
    const nextSelections = { ...branchSelections, [groupId]: nextIndex };
    setBranchSelections(nextSelections);
    setBranchSyncStatus((current) => ({ ...current, [groupId]: 'syncing' }));
    const branchThreadId = canonicalActiveThreadId;
    if (!isRealAgent || !isLoggedIn || !branchThreadId) {
      setBranchSyncStatus((current) => ({ ...current, [groupId]: 'idle' }));
      return;
    }
    const snapshot = buildBranchSnapshot(messages, nextSelections);
    if (!snapshot) {
      setBranchSyncStatus((current) => ({ ...current, [groupId]: 'idle' }));
      return;
    }
    socialAgentApi
      .updateThread(branchThreadId, undefined, snapshot, {
        branchSync: {
          action: direction,
          groupId,
          activeIndex: nextIndex,
          activeBranchId: snapshot.activeBranchId,
          branchCount: snapshot.branchCount,
          syncedAt: new Date().toISOString(),
          source: 'assistant-ui-branch-picker',
        },
        client: 'fitmeet-web',
      })
      .then(() => {
        setBranchSyncStatus((current) => ({ ...current, [groupId]: 'synced' }));
      })
      .catch(() => {
        setBranchSyncStatus((current) => ({ ...current, [groupId]: 'failed' }));
      });
  };

  const loadThread = async (threadId: string) => {
    if (!isRealAgent || !isLoggedIn || isRunning) return;
    setSessionRestoring(true);
    try {
      const detail = await socialAgentApi.getThread(threadId);
      const restored = responseFromSessionSnapshot(detail.session);
      const nextMessages = messagesFromSessionSnapshot(
        detail.session,
        restored,
        detail.thread.taskId,
      );
      const branchSnapshot = threadBranchSnapshot(detail.thread);
      setActiveThreadId(detail.thread.id);
      setActiveTaskId(detail.thread.taskId);
      setActiveTaskStatus(
        typeof detail.session.task?.status === 'string' ? detail.session.task.status : null,
      );
      setUserResult(restored);
      setMessages(nextMessages);
      setBranchSelections(branchSnapshot?.branchSelections ?? {});
      setRecovery(null);
      void refreshLatestCheckpointRecovery(detail.thread.taskId);
      navigate(`/agent/chat/${detail.thread.taskId}`, { replace: false });
      void socialAgentApi.updateThread(detail.thread.id, undefined, branchSnapshot, {
        lastOpenedAt: new Date().toISOString(),
        restoreSource: 'thread_list',
        client: 'fitmeet-web',
      });
    } finally {
      setSessionRestoring(false);
    }
  };

  const renameThread = async (threadId: string, title: string) => {
    setThreads((current) =>
      current.map((thread) => (thread.id === threadId ? { ...thread, title } : thread)),
    );
    try {
      const updated = await socialAgentApi.updateThread(threadId, title);
      setThreads((current) =>
        current.map((thread) => (thread.id === threadId ? updated.thread : thread)),
      );
    } catch (error) {
      void refreshThreads();
      throw error;
    }
  };

  const deleteThread = async (threadId: string) => {
    setThreads((current) => current.filter((thread) => thread.id !== threadId));
    if (activeThreadId === threadId) {
      resetConversation();
    }
    try {
      await socialAgentApi.deleteThread(threadId);
    } catch (error) {
      void refreshThreads();
      throw error;
    }
  };

  const toggleReminders = async () => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    const current = reminderPreference;
    const nextEnabled = !current?.enabled;
    if (current) setReminderPreference({ ...current, enabled: nextEnabled });
    try {
      const updated = nextEnabled
        ? await socialAgentApi.updateReminderPreference({
            enabled: true,
            frequency: current?.frequency ?? 'weekly',
            topics: current?.topics?.length
              ? current.topics
              : ['friendship', 'fitness_partner', 'activity'],
            scenes: reminderScenesFromPreference(current),
            quietStart: current?.quietStart ?? '09:00',
            quietEnd: current?.quietEnd ?? '21:00',
          })
        : await socialAgentApi.disableReminders();
      setReminderPreference(updated);
    } catch {
      if (current) setReminderPreference(current);
      setReminderError('提醒设置没有保存');
    } finally {
      setReminderSaving(false);
    }
  };

  const disableReminders = async () => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    const current = reminderPreference;
    if (current) setReminderPreference({ ...current, enabled: false });
    try {
      const updated = await socialAgentApi.disableReminders();
      setReminderPreference(updated);
    } catch {
      if (current) setReminderPreference(current);
      setReminderError('提醒设置没有保存');
      throw new Error('reminder_disable_failed');
    } finally {
      setReminderSaving(false);
    }
  };

  const dismissReminder = async (reminderId: number | string) => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    const current = reminderPreference;
    try {
      const result = await socialAgentApi.dismissReminder(reminderId);
      if (result.preference) setReminderPreference(result.preference);
    } catch {
      setReminderPreference(current);
      setReminderError('提醒设置没有保存');
      throw new Error('reminder_dismiss_failed');
    } finally {
      setReminderSaving(false);
    }
  };

  const updateReminderSettings = async (
    nextSettings: Parameters<typeof socialAgentApi.updateReminderPreference>[0],
  ) => {
    if (!isRealAgent || !isLoggedIn || reminderSaving) return;
    setReminderSaving(true);
    setReminderError(null);
    const current = reminderPreference;
    try {
      const updated = await socialAgentApi.updateReminderPreference({
        enabled: current?.enabled ?? false,
        frequency: current?.frequency ?? 'weekly',
        topics: current?.topics?.length
          ? current.topics
          : ['friendship', 'fitness_partner', 'activity'],
        scenes: reminderScenesFromPreference(current),
        quietStart: current?.quietStart ?? '09:00',
        quietEnd: current?.quietEnd ?? '21:00',
        ...nextSettings,
      });
      setReminderPreference(updated);
    } catch {
      setReminderError('提醒设置没有保存');
    } finally {
      setReminderSaving(false);
    }
  };

  const decoratedMessages = decorateAssistantBranches(messages, branchSelections, branchSyncStatus);

  return (
    <FitMeetAssistantUI
      messages={decoratedMessages}
      threads={threads}
      threadsLoading={threadsLoading}
      activeThreadId={activeThreadId}
      steps={steps}
      isRunning={isRunning}
      sessionRestoring={sessionRestoring}
      recovery={recovery}
      profileGate={profileGate}
      requiresAuth={isRealAgent && !isLoggedIn}
      onSubmit={submit}
      onStop={stopRun}
      onReloadLast={reloadLastUserMessage}
      onFeedback={submitFeedback}
      onBranchSwitch={switchAssistantBranch}
      onNewConversation={() => {
        abortRef.current?.abort();
        resetConversation();
      }}
      onThreadSelect={(threadId) => void loadThread(threadId)}
      onThreadRename={renameThread}
      onThreadDelete={deleteThread}
      onLogin={openLogin}
      onRetryRecovery={retryRecovery}
      onDismissRecovery={() => setRecovery(null)}
      reminderPreference={reminderPreference}
      reminderLoading={reminderLoading}
      reminderSaving={reminderSaving}
      reminderError={reminderError}
      focusReminderSettings={focusReminderSettings}
      onToggleReminders={isRealAgent && isLoggedIn ? toggleReminders : undefined}
      onDisableReminders={isRealAgent && isLoggedIn ? disableReminders : undefined}
      onDismissReminder={isRealAgent && isLoggedIn ? dismissReminder : undefined}
      onUpdateReminderPreference={
        isRealAgent && isLoggedIn ? updateReminderSettings : undefined
      }
      onApproveApproval={approveInlineApproval}
      onRejectApproval={rejectInlineApproval}
      onResumeState={(input) =>
        runCheckpointStream(input?.checkpointId, 'resume', null, input?.stepId)
      }
      onRetryTool={(input) =>
        runCheckpointStream(input?.checkpointId, 'retry', null, input?.stepId)
      }
      onReplayState={(input) =>
        runCheckpointStream(input?.checkpointId, 'replay', null, input?.stepId)
      }
      onForkState={(input) => runCheckpointStream(input?.checkpointId, 'fork', null, input?.stepId)}
      onCardAction={runCardActionStream}
    />
  );
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

function agentThreadStorageKey(userId?: number | string | null) {
  return `${AGENT_THREAD_STORAGE_KEY}:${userId ?? 'current'}`;
}

function readStoredAgentThread(userId?: number | string | null): AgentThreadSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(agentThreadStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AgentThreadSnapshot>;
    if (!Array.isArray(parsed.messages) || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > AGENT_THREAD_MAX_AGE_MS) return null;
    const messages = parsed.messages
      .filter(isAgentThreadMessage)
      .map(sanitizeStoredThreadMessage)
      .filter((message): message is AgentThreadMessage => Boolean(message));
    const userResult = isUserFacingAgentResponse(parsed.userResult)
      ? sanitizeRestoredResponse(parsed.userResult)
      : null;
    return {
      activeTaskId: numberFromUnknown(parsed.activeTaskId),
      activeThreadId:
        stringFromUnknown(parsed.activeThreadId) ??
        (numberFromUnknown(parsed.activeTaskId) ? String(numberFromUnknown(parsed.activeTaskId)) : null),
      messages,
      userResult,
      mode: isPermissionMode(parsed.mode) ? parsed.mode : 'limited_auto',
      branchSelections: sanitizeBranchSelections(parsed.branchSelections),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function writeStoredAgentThread(
  userId: number | string | null | undefined,
  snapshot: Omit<AgentThreadSnapshot, 'savedAt'>,
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      agentThreadStorageKey(userId),
      JSON.stringify({ ...snapshot, savedAt: Date.now() }),
    );
  } catch {
    // Local recovery is best-effort; server restore remains the source of truth.
  }
}

function clearStoredAgentThread(userId?: number | string | null) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(agentThreadStorageKey(userId));
}

function readAgentReminderRouteState(state: unknown) {
  if (!isRecord(state)) return null;
  const reminder = state.agentReminder;
  if (!isRecord(reminder)) return null;
  const message = typeof reminder.message === 'string' ? reminder.message.trim() : '';
  if (!message) return null;
  return {
    id:
      typeof reminder.id === 'number' || typeof reminder.id === 'string'
        ? reminder.id
        : null,
    taskId:
      typeof reminder.taskId === 'number' || typeof reminder.taskId === 'string'
        ? reminder.taskId
        : null,
    message,
    source: typeof reminder.source === 'string' ? reminder.source : null,
    context: isRecord(reminder.context) ? reminder.context : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function sanitizeBranchSelections(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [key.trim(), Number(raw)] as const)
      .filter(
        ([key, index]) =>
          key.length > 0 && Number.isFinite(index) && Number.isInteger(index) && index > 0,
      ),
  );
}

function isAgentThreadMessage(value: unknown): value is AgentThreadMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AgentThreadMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    (!message.result || isUserFacingAgentResponse(message.result))
  );
}

function sanitizeStoredThreadMessage(message: AgentThreadMessage): AgentThreadMessage | null {
  if (message.role === 'user') {
    const content = publicText(message.content, '');
    return content ? { ...message, content, result: null } : null;
  }
  const result = message.result ? sanitizeRestoredResponse(message.result) : null;
  const content = publicText(message.content, result?.assistantMessage ?? '');
  const hasUsefulResult = Boolean(result && restoredResponseHasUsefulSurface(result));
  if (!content && !hasUsefulResult) return null;
  return {
    ...message,
    content: content || '我可以继续上次的话题，也可以重新开始。',
    result: hasUsefulResult ? result : null,
    conversationIntent: hasUsefulResult
      ? intentForRestoredResponse(result as UserFacingAgentResponse, 'conversation')
      : 'conversation',
    showSocialResult: hasUsefulResult
      ? intentForRestoredResponse(result as UserFacingAgentResponse, 'conversation') !== 'conversation'
      : false,
  };
}

function isUserFacingAgentResponse(value: unknown): value is UserFacingAgentResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<UserFacingAgentResponse>;
  return (
    typeof result.assistantMessage === 'string' &&
    typeof result.lightStatus === 'string' &&
    Array.isArray(result.cards) &&
    Boolean(result.safeStatus) &&
    Array.isArray(result.pendingConfirmations)
  );
}

function isPermissionMode(value: unknown): value is SocialAgentPermissionMode {
  return (
    value === 'assist' ||
    value === 'confirm' ||
    value === 'manual_confirm' ||
    value === 'limited_auto' ||
    value === 'open' ||
    value === 'lab'
  );
}

function isSocialActionIntent(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (
    /(不想|不用|不要|不需要|不是|先不|暂时不).{0,8}(交友|找人|约练|搭子|匹配|推荐人|活动|加好友|邀请)/.test(
      normalized,
    )
  ) {
    return false;
  }
  if (
    /(怎么|如何|流程|是什么|为什么|能不能|可以吗|应该).{0,18}(找人|搭子|约练|匹配|推荐|活动|交友|发消息|邀请|加好友|报名|参加|发起|创建|认识.{0,6}(新朋友|朋友|人))/.test(
      normalized,
    ) ||
    /(活动.*(怎么参加|如何参加|报名流程|参与流程)|邀请.*流程|加好友.*流程|新用户.*怎么.*(找人|找搭子|约练)|创建活动.*(先|需要).*画像)/.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(帮我找|给我找|想找|我要找|我想认识|想认识|低压力社交|找一个|找个|找人|找.{0,48}(人|搭子|伙伴|朋友|用户|候选|活动|局|约练)|约练|约跑|约球|认识.{0,16}(朋友|人|搭子)|推荐.{0,16}(用户|朋友|人|搭子|候选|活动|局|约练)|搜索.{0,16}(用户|朋友|人|搭子|候选|活动|局|约练)|匹配.{0,16}(用户|朋友|人|搭子|候选)|附近.{0,16}(用户|朋友|人|搭子|活动)|同城.{0,16}(用户|朋友|人|搭子|活动)|真实用户|约练用户|户外搭子|篮球搭子|约练搭子|一起.{0,16}(咖啡|拍照|跑步|健身|羽毛球|网球|篮球|徒步|户外|骑行|运动|训练)|周末.{0,16}(咖啡|拍照|跑步|健身|羽毛球|网球|篮球|徒步|户外|骑行|运动|训练)|参加.{0,8}(活动|约练)|发起.{0,8}(活动|约练)|加好友|发邀请|线下见面|线下活动)/.test(
    normalized,
  );
}

function stepsForPrompt(prompt: string) {
  return isSocialActionIntent(prompt) ? socialSteps : conversationSteps;
}

function intentForPrompt(prompt: string): AgentConversationIntent {
  return isSocialActionIntent(prompt) ? 'social' : 'conversation';
}

function cancelsOpportunityClarification(prompt: string) {
  return /(取消|先不找|不找了|不用找|暂停|算了)/i.test(prompt.trim());
}

function responseAwaitsOpportunityClarification(response: UserFacingAgentResponse) {
  return (
    response.cards.length === 0 &&
    /为了只推荐安全、合适的机会|还差.{0,24}(城市|时间|运动强度|社交边界)/.test(
      response.assistantMessage,
    )
  );
}

function shouldRestoreReplayTrace(
  replay: SocialCodexReplayPackage,
  intent: AgentConversationIntent,
) {
  if (intent !== 'conversation') return replay.events.length > 0;
  if (replay.pendingApproval) return true;
  return replay.events.some((event) =>
    /^(slot\.|approval\.|candidate_search\.|opportunity_card\.created|safety_check\.done|memory\.saved)/.test(
      event.type,
    ),
  );
}

function intentForReplayTrace(
  replay: SocialCodexReplayPackage,
  fallback: AgentConversationIntent,
): AgentConversationIntent {
  if (replay.pendingApproval || replay.events.some((event) => event.type.startsWith('approval.'))) {
    return 'approval';
  }
  if (
    replay.events.some((event) =>
      /^(slot\.|candidate_search\.|opportunity_card\.created|safety_check\.done|memory\.saved)/.test(
        event.type,
      ),
    )
  ) {
    return 'social';
  }
  return fallback;
}

function responseRequiresApproval(response: UserFacingAgentResponse) {
  return (
    response.safeStatus.blocked ||
    response.pendingConfirmations.length > 0 ||
    response.cards.some(isApprovalCard)
  );
}

function intentForResponse(
  response: UserFacingAgentResponse,
  fallback: AgentConversationIntent,
): AgentConversationIntent {
  if (responseRequiresApproval(response)) return 'approval';
  return fallback;
}

function intentForRestoredResponse(
  response: UserFacingAgentResponse,
  fallback: AgentConversationIntent,
): AgentConversationIntent {
  if (responseRequiresApproval(response)) return 'approval';
  const hasSocialSurface = response.cards.some(isSocialSurfaceCard);
  return hasSocialSurface ? 'social' : fallback;
}

function sanitizeRestoredResponse(response: UserFacingAgentResponse): UserFacingAgentResponse {
  if (!isGenericCheckpointResponse(response)) return response;
  return {
    ...response,
    assistantMessage: '我可以继续上次的话题，也可以重新开始。',
    lightStatus: '已整理回复',
    cards: [],
    pendingConfirmations: [],
    safeStatus: {
      ...response.safeStatus,
      blocked: false,
      requiredConfirmations: [],
    },
  };
}

function restoredResponseHasUsefulSurface(response: UserFacingAgentResponse) {
  return (
    Boolean(publicText(response.assistantMessage, '').trim()) ||
    response.cards.some(isSocialSurfaceCard) ||
    response.pendingConfirmations.length > 0 ||
    response.safeStatus.blocked
  );
}

function isGenericCheckpointResponse(response: UserFacingAgentResponse) {
  const assistantMessage = String(response.assistantMessage ?? '');
  const technical = technicalPublicTextPattern.test(assistantMessage);
  const genericGoal = /原始目标[：:]\s*(你有什么功能|有什么功能|功能咨询|普通聊天)/i.test(
    assistantMessage,
  );
  const hasUsefulCards = response.cards.some(isSocialSurfaceCard);
  if (hasUsefulCards) return false;
  return technical || genericGoal;
}

function isApprovalCard(card: { type?: string }) {
  return card.type === 'opener_approval' || card.type === 'safety_boundary';
}

function isSocialSurfaceCard(card: { type?: string }) {
  return (
    card.type === 'candidate_card' ||
    card.type === 'activity_plan' ||
    card.type === 'activity_status' ||
    card.type === 'checkin_card' ||
    card.type === 'review_card' ||
    isApprovalCard(card)
  );
}

function resolveIntentFromStreamEvent(event: AgentStreamEvent) {
  if (event.type === 'approval_required') return 'approval';
  if (event.type === 'progress' && isApprovalProgressEvent(event)) return 'approval';
  if (event.type === 'progress' && shouldAttachVisibleProcessToMessage(event)) return 'social';
  return null;
}

function shouldAttachVisibleProcessToMessage(event: AgentStreamEvent) {
  if (event.type !== 'progress') return false;
  const processType =
    typeof event.metadata?.processType === 'string' ? event.metadata.processType : null;
  if (!processType || processType === 'run') return false;
  return true;
}

function isApprovalProgressEvent(event: AgentStreamEvent) {
  if (event.type !== 'progress') return false;
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  return Boolean(
    'approvalId' in metadata ||
      'actionType' in metadata ||
      metadata.riskLevel ||
      metadata.kind === 'approval_required',
  );
}

function findTaskId(result: UserFacingAgentResponse | null): number | null {
  if (!result) return null;
  for (const card of result.cards) {
    const fromData = numberFromUnknown(card.data.taskId);
    if (fromData) return fromData;
    for (const action of card.actions) {
      const fromPayload = numberFromUnknown(action.payload?.taskId);
      if (fromPayload) return fromPayload;
    }
  }
  return null;
}

function threadIdFromResponse(response: UserFacingAgentResponse | null): string | null {
  if (!response) return null;
  const fromRuntime = stringFromUnknown(response.runtime?.threadId);
  if (fromRuntime) return fromRuntime;
  for (const card of response.cards) {
    const fromData = stringFromUnknown(card.data.threadId);
    if (fromData) return fromData;
    for (const action of card.actions) {
      const fromPayload = stringFromUnknown(action.payload?.threadId);
      if (fromPayload) return fromPayload;
    }
  }
  return null;
}

function schemaActionFromToolInput(
  value: string | null | undefined,
): FitMeetAgentCardExecutableAction | null {
  const normalized = toolUISchemaActionFromUnknown(value);
  if (!normalized) return null;
  if (isExecutableToolUISchemaAction(normalized)) return normalized;
  return null;
}

function isExecutableToolUISchemaAction(
  value: ToolUISchemaAction,
): value is Extract<FitMeetAgentSchemaAction, ToolUISchemaAction> {
  return (
    value === 'candidate.like' ||
    value === 'candidate.skip' ||
    value === 'candidate.more_like_this' ||
    value === 'candidate.view_detail' ||
    value === 'candidate.connect' ||
    value === 'candidate.generate_opener' ||
    value === 'opener.confirm_send' ||
    value === 'opener.regenerate' ||
    value === 'opener.reject' ||
    value === 'activity.confirm_create' ||
    value === 'activity.modify_time' ||
    value === 'activity.modify_location' ||
    value === 'activity.check_in' ||
    value === 'activity.complete' ||
    value === 'activity.upload_proof' ||
    value === 'activity.view_detail' ||
    value === 'review.submit' ||
    value === 'life_graph.accept_update' ||
    value === 'life_graph.reject_update' ||
    value === 'meet_loop.resume' ||
    value === 'meet_loop.reschedule'
  );
}

function shouldAppendActionResultMessage(action: FitMeetAgentCardExecutableAction) {
  return (
    action === 'candidate.connect' ||
    action === 'opener.confirm_send' ||
    action === 'opener.reject' ||
    action === 'activity.confirm_create'
  );
}

function shouldAppendCardActionResultMessage(
  action: FitMeetAgentCardExecutableAction,
  response: UserFacingAgentResponse,
) {
  if (shouldAppendActionResultMessage(action)) return true;
  if (action === 'candidate.view_detail' || action === 'activity.view_detail') {
    return response.cards.length > 0 || Boolean(response.assistantMessage.trim());
  }
  if (action !== 'candidate.generate_opener' && action !== 'opener.regenerate') {
    return false;
  }
  if (response.cards.length > 0 || response.assistantMessage.trim()) return true;
  return response.cards.some(
    (card) => card.type === 'opener_approval' || card.schemaType === 'safety.approval',
  );
}

function idempotencyKeyForCardAction(
  taskId: number,
  action: FitMeetAgentCardExecutableAction,
  payload: Record<string, unknown> | undefined,
) {
  const explicit = publicText(payload?.idempotencyKey, '');
  if (explicit) return explicit;
  const stableTarget =
    publicText(payload?.approvalId, '') ||
    publicText(payload?.candidateId, '') ||
    publicText(payload?.candidateRecordId, '') ||
    publicText(payload?.targetUserId, '') ||
    publicText(payload?.activityId, '') ||
    publicText(payload?.cardId, '') ||
    publicText(payload?.message, '').slice(0, 48) ||
    'card';
  return `agent-card-action:${taskId}:${action}:${stableIdempotencyFragment(stableTarget)}`;
}

function stableIdempotencyFragment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'card';
}

const CARD_ACTION_ASSISTANT_MESSAGES: Partial<Record<FitMeetAgentCardExecutableAction, string>> = {
  'candidate.connect': '已准备邀请请求，真正触达前仍会经过确认。',
  'opener.confirm_send': '已进入发送确认流程，发送结果会继续回到这段对话。',
  'opener.reject': '已取消这次发送，未联系对方。',
  'activity.confirm_create': '已准备活动发起流程，发布前仍会保留确认边界。',
  'activity.modify_time': '已准备时间调整方案，真正改动前仍会等你确认。',
  'activity.modify_location': '已准备地点调整方案，真正改动前仍会等你确认。',
  'activity.check_in': '已记录到达状态，后续会继续跟进活动完成情况。',
  'activity.complete': '已记录活动完成，下一步可以留下简短评价。',
  'activity.upload_proof': '已进入证明上传流程，上传内容会按隐私规则处理。',
  'review.submit': '已提交这次评价，后续会用于改进推荐和约练闭环。',
  'meet_loop.resume': '已从约练进展继续推进，新的状态会回到消息流。',
  'meet_loop.reschedule': '已准备改期流程，改动前会继续征得确认。',
};

function assistantMessageForCardAction(
  action: FitMeetAgentCardExecutableAction,
  response: UserFacingAgentResponse,
) {
  return CARD_ACTION_ASSISTANT_MESSAGES[action] ?? response.assistantMessage;
}

function cardActionStreamEvent(
  action: FitMeetAgentCardExecutableAction,
  event: AgentStreamEvent,
): AgentStreamEvent {
  if (event.type !== 'result') return event;
  return {
    ...event,
    result: {
      ...event.result,
      assistantMessage: assistantMessageForCardAction(action, event.result),
    },
  };
}

function traceIdFromResult(result: UserFacingAgentResponse | null): string | null {
  if (!result) return null;
  for (const card of result.cards) {
    const traceId = stringFromUnknown(card.data.traceId);
    if (traceId) return traceId;
  }
  return null;
}

function responseFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot | null | undefined,
): UserFacingAgentResponse | null {
  if (!snapshot) return null;
  if (isUserFacingAgentResponse(snapshot.result)) return snapshot.result;
  const latestRunResult =
    snapshot.latestRun && typeof snapshot.latestRun === 'object'
      ? (snapshot.latestRun as { result?: unknown }).result
      : null;
  if (isUserFacingAgentResponse(latestRunResult)) return latestRunResult;
  const eventResult = snapshot.events
    ?.map((event) => (event.type === 'result' ? event.result : null))
    .find(isUserFacingAgentResponse);
  return eventResult ?? null;
}

function messagesFromSessionSnapshot(
  snapshot: UserFacingAgentSessionSnapshot,
  restored: UserFacingAgentResponse | null,
  taskId: number | null,
): AgentThreadMessage[] {
  const sanitizedRestored = restored ? sanitizeRestoredResponse(restored) : null;
  const restoredMessages = snapshot.messages
    .map((item, index) => sessionMessageToThreadMessage(item, index, taskId))
    .filter((message): message is AgentThreadMessage => Boolean(message));
  if (!sanitizedRestored) return restoredMessages;
  const lastIntent =
    [...restoredMessages].reverse().find((message) => message.conversationIntent)
      ?.conversationIntent ?? 'conversation';
  const hasResultMessage = restoredMessages.some(
    (message) =>
      message.role === 'assistant' &&
      message.content.trim() === sanitizedRestored.assistantMessage.trim(),
  );
  const resultIntent = intentForRestoredResponse(sanitizedRestored, lastIntent);
  const showSocialResult = resultIntent === 'social' || resultIntent === 'approval';
  if (hasResultMessage) {
    return restoredMessages.map((message, index) =>
      index === restoredMessages.length - 1 && message.role === 'assistant'
        ? {
            ...message,
            result: restoredResponseHasUsefulSurface(sanitizedRestored)
              ? sanitizedRestored
              : null,
            taskId,
            traceId: traceIdFromResult(sanitizedRestored),
            conversationIntent: resultIntent,
            showSocialResult,
          }
        : message,
    );
  }
  return [
    ...restoredMessages,
    {
      id: `task-${taskId ?? 'latest'}-result`,
      role: 'assistant',
      content: publicText(sanitizedRestored.assistantMessage, '我已经恢复了这段对话。'),
      status: 'done',
      result: restoredResponseHasUsefulSurface(sanitizedRestored) ? sanitizedRestored : null,
      taskId,
      traceId: traceIdFromResult(sanitizedRestored),
      conversationIntent: resultIntent,
      showSocialResult,
    },
  ];
}

function sessionMessageToThreadMessage(
  item: Record<string, unknown>,
  index: number,
  taskId: number | null,
): AgentThreadMessage | null {
  const roleCandidate = stringFromUnknown(item.role || item.sender || item.author);
  const role =
    roleCandidate === 'assistant' ? 'assistant' : roleCandidate === 'user' ? 'user' : null;
  if (!role) return null;
  const content = publicText(item.content ?? item.message ?? item.text ?? item.body, '');
  if (!content) return null;
  return {
    id: stringFromUnknown(item.id) || `task-${taskId ?? 'latest'}-${index}`,
    role,
    content,
    status: 'done',
    taskId,
    conversationIntent: role === 'user' ? intentForPrompt(content) : 'conversation',
  };
}

function branchForAssistant(
  messages: AgentThreadMessage[],
  messageId: string,
): AgentMessageBranchState | undefined {
  const messageIndex = messages.findIndex((message) => message.id === messageId);
  const previousUser = [...messages.slice(0, Math.max(0, messageIndex))]
    .reverse()
    .find((message) => message.role === 'user');
  if (!previousUser) return undefined;
  const groupId = `branch-${previousUser.id}`;
  const variants = messages.filter(
    (message) => message.role === 'assistant' && message.branch?.groupId === groupId,
  );
  if (variants.length === 0) return { groupId, index: 1, count: 1 };
  return { groupId, index: variants.length + 1, count: variants.length + 1 };
}

function decorateAssistantBranches(
  messages: AgentThreadMessage[],
  selections: Record<string, number>,
  syncStatus: Record<string, AgentMessageBranchState['syncStatus']> = {},
): AgentThreadMessage[] {
  const groups = new Map<string, AgentThreadMessage[]>();
  let currentUserId: string | null = null;
  for (const message of messages) {
    if (message.role === 'user') {
      currentUserId = message.id;
      continue;
    }
    if (message.role !== 'assistant' || !currentUserId) continue;
    const groupId = `branch-${currentUserId}`;
    groups.set(groupId, [...(groups.get(groupId) ?? []), message]);
  }
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const groupEntry = Array.from(groups.entries()).find(([, items]) =>
      items.some((item) => item.id === message.id),
    );
    if (!groupEntry || groupEntry[1].length < 2) return message;
    const [groupId, variants] = groupEntry;
    const index = variants.findIndex((item) => item.id === message.id) + 1;
    const activeIndex = selections[groupId] ?? variants.length;
    return {
      ...message,
      branch: {
        groupId,
        index,
        count: variants.length,
        activeIndex,
        syncStatus: syncStatus[groupId] ?? message.branch?.syncStatus ?? 'idle',
      },
    };
  });
}

function buildBranchSnapshot(
  messages: AgentThreadMessage[],
  selections: Record<string, number>,
): FitMeetAgentThreadBranchSnapshot | null {
  const decorated = decorateAssistantBranches(messages, selections);
  const branchMessages = decorated.filter(
    (message) => message.role === 'assistant' && message.branch && message.branch.count > 1,
  );
  if (branchMessages.length === 0 && Object.keys(selections).length === 0) return null;
  const branchCount = branchMessages.reduce(
    (count, message) => Math.max(count, message.branch?.count ?? 0),
    0,
  );
  const activeMessage =
    branchMessages.find((message) => {
      const branch = message.branch;
      return branch ? branch.index === (branch.activeIndex ?? branch.count) : false;
    }) ?? branchMessages.at(-1);
  return {
    activeBranchId: activeMessage?.id ?? null,
    branchSelections: selections,
    branchCount,
    parentMessageId: activeMessage?.branch?.groupId ?? null,
    updatedAt: new Date().toISOString(),
    metadata: buildThreadMetadata(messages, null),
  };
}

function buildThreadMetadata(
  messages: AgentThreadMessage[],
  result: UserFacingAgentResponse | null,
): Record<string, unknown> {
  if (messages.length === 0 && !result) return {};
  const latest = messages.at(-1);
  return {
    schemaVersion: 1,
    client: 'fitmeet-web',
    messageCount: messages.length,
    latestMessageId: latest?.id ?? null,
    latestRole: latest?.role ?? null,
    latestStatus: latest?.status ?? null,
    latestPreview: latest?.content ? latest.content.slice(0, 140) : null,
    lastSyncedAt: new Date().toISOString(),
    resultStatus: result?.runtime?.checkpointType ?? null,
  };
}

function threadBranchSnapshot(thread: FitMeetAgentThreadSummary) {
  const direct = thread.branch;
  if (direct?.branchSelections) return direct;
  const custom = thread.custom?.assistantThread;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return null;
  const record = custom as FitMeetAgentThreadBranchSnapshot;
  return record.branchSelections ? record : null;
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

function stepIdFromLightStatus(status: string): string {
  if (/确认关键信息|补充信息|补齐/i.test(status)) return 'clarify';
  if (status.includes('Life Graph')) return 'profile';
  if (status.includes('筛选')) return 'search';
  if (status.includes('排除')) return 'rank';
  if (status.includes('安全')) return 'safety_filter';
  if (status.includes('确认')) return 'approval';
  if (status.includes('约练')) return 'activity_plan';
  if (status.includes('更新')) return 'life_graph_update';
  return 'understand';
}

function isApprovalProgressStepId(stepId: string) {
  return stepId === 'approval' || stepId === 'confirm';
}

function mergeProgressStep(
  steps: Step[],
  event: UserFacingAgentProgressEvent,
  intent: AgentConversationIntent,
): Step[] {
  const nextStatus: StepState =
    event.state === 'done'
      ? 'success'
      : event.state === 'failed'
        ? 'error'
        : event.state === 'waiting'
          ? 'waiting'
          : 'running';
  const rawLabel = publicText(event.title, event.kind === 'tool' ? '正在处理这一步' : '分析中');
  const processType =
    typeof event.metadata?.processType === 'string' && event.metadata.processType.trim()
      ? event.metadata.processType.trim()
      : undefined;
  const currentSteps = processType ? steps.filter((step) => step.processType) : steps;
  const label = processType
    ? rawLabel
    : publicStepLabel(event.id, rawLabel, intent);
  const detail = event.detail ? publicText(event.detail, '') || undefined : undefined;
  const agentName =
    typeof event.metadata?.agentName === 'string' && event.metadata.agentName.trim()
      ? event.metadata.agentName.trim()
      : undefined;
  const index = currentSteps.findIndex((step) => step.id === event.id);
  const nextStep: Step = {
    id: event.id,
    label,
    status: nextStatus,
    kind: event.kind,
    processType,
    agentName,
    detail,
    metadata: event.metadata,
    snapshot: event.snapshot,
  };

  if (index >= 0) {
    return currentSteps.map((step, itemIndex) =>
      itemIndex === index
        ? nextStep
        : step.status === 'running' && nextStatus === 'running'
          ? { ...step, status: 'success' }
          : step,
    );
  }

  return [
    ...currentSteps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    nextStep,
  ];
}

function mergeStep(
  steps: Step[],
  id: string,
  label: string,
  status: 'pending' | 'running' | 'waiting' | 'done' | 'failed',
  intent: AgentConversationIntent = 'conversation',
): Step[] {
  const nextStatus: StepState =
    status === 'done' ? 'success' : status === 'failed' ? 'error' : status;
  const publicLabel = publicStepLabel(id, label, intent);
  const index = steps.findIndex((step) => step.id === id);
  if (index >= 0) {
    return steps.map((step, itemIndex) =>
      itemIndex === index
        ? { ...step, label: publicLabel, status: nextStatus }
        : step.status === 'running' && nextStatus === 'running'
          ? { ...step, status: 'success' }
          : step,
    );
  }
  return [
    ...steps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    { id, label: publicLabel, status: nextStatus },
  ];
}

function publicText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (technicalPublicTextPattern.test(text)) return fallback;
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(text)) return fallback;
  return text;
}

function publicStepLabel(
  id: string,
  label: string,
  intent: AgentConversationIntent = 'conversation',
) {
  const key = `${id} ${label}`.toLowerCase();
  if (/已(记录|记住|保存|补齐|确认)|已把/.test(label)) return label;
  if (/clarify|补充|关键信息/.test(key)) return '正在确认需要补充的信息';
  if (intent === 'conversation') {
    if (/safe|guard|risk|boundary|安全|边界/.test(key)) return '正在检查必要边界';
    if (/approval|confirm|human|确认/.test(key)) return '需要你确认这一步';
    return '正在组织自然回复';
  }
  if (/approval|confirm|human|确认/.test(key)) return '需要你确认这一步';
  if (/safe|guard|risk|boundary|安全/.test(key)) return '正在检查必要边界';
  if (/rank|time|schedule|排除/.test(key)) return '正在整理可行选项';
  if (/match|search|candidate|social|筛选/.test(key)) return '正在查找合适的信息';
  if (/life|profile|graph|memory|画像/.test(key)) return '正在结合上下文';
  if (/understand|intent|think|route|理解/.test(key)) return '正在理解你的需求';
  const allowed = [...conversationSteps, ...socialSteps].map((step) => step.label);
  return allowed.includes(label) ? label : '正在组织自然回复';
}

function createAgentRecoveryFromError(
  error: AgentError,
  prompt: string,
  fallbackKind: FitMeetAssistantRecovery['kind'] = 'failed',
): FitMeetAssistantRecovery {
  const kindByCode: Partial<Record<AgentError['code'], FitMeetAssistantRecovery['kind']>> = {
    ABORTED: 'stopped',
    MISSING_INFO: 'missing_info',
    UNAUTHORIZED: 'unauthorized',
    SAFETY_BLOCKED: 'safety',
  };
  return {
    kind: kindByCode[error.code] ?? fallbackKind,
    title: error.title,
    message: error.message,
    prompt,
    retryable: error.retryable,
  };
}

function createInlineAuthRecovery(prompt: string): FitMeetAssistantRecovery {
  return {
    kind: 'unauthorized',
    title: '登录后继续',
    message: '登录后我才能保存这段对话、恢复上下文，并在你需要时继续处理任务。',
    prompt,
    retryable: false,
  };
}

function createCheckpointAvailableRecovery(
  checkpoint: AgentCheckpointSummary | null | undefined,
): FitMeetAssistantRecovery | null {
  if (!checkpoint) return null;
  const waitingStep = checkpoint.steps.find((step) => step.status === 'waiting');
  const failedStep = checkpoint.steps.find(
    (step) => step.status === 'error' || step.status === 'failed',
  );
  const hasUserActionRequired = checkpoint.resumable || Boolean(waitingStep);
  const hasUsefulRetry = checkpoint.canRetry && Boolean(failedStep);
  if (!hasUserActionRequired && !hasUsefulRetry) return null;
  const action = checkpoint.resumable
    ? 'resume'
    : checkpoint.canRetry
      ? 'retry'
      : checkpoint.canReplay
        ? 'replay'
        : checkpoint.canFork
          ? 'fork'
          : null;
  if (!action) return null;
  const sourceLabel =
    publicText(checkpoint.sourceStep?.label ?? '', '').trim() ||
    waitingStep?.label ||
    checkpoint.steps.at(-1)?.label ||
    '上一次处理步骤';
  if (isGenericCheckpointLabel(sourceLabel)) return null;
  const visibleSteps = checkpoint.steps
    .filter(
      (step) =>
        step.stepId &&
        step.label &&
        (step.status === 'waiting' ||
          step.status === 'error' ||
          step.status === 'failed' ||
          step.retryable),
    )
    .slice(-4)
    .map((step) => ({
      stepId: step.stepId,
      label: publicText(step.label, '已保存步骤'),
      status: step.status,
      retryable: step.retryable,
      replayable: step.replayable,
      forkable: step.forkable,
    }));
  return {
    kind: 'checkpoint_available',
    title: hasUserActionRequired ? '有一步需要你确认' : '这一步可以重试',
    message: `我可以继续「${sourceLabel}」，也可以忽略它，直接开始新的对话。`,
    prompt: hasUserActionRequired ? '继续处理刚才需要确认的步骤。' : '重试刚才失败的步骤。',
    retryable: true,
    checkpoint: {
      checkpointId: checkpoint.id,
      stepId: checkpoint.sourceStep?.stepId ?? null,
      action,
      steps: visibleSteps,
    },
  };
}

function isGenericCheckpointLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return true;
  return /^(你有什么功能|有什么功能|上一次处理步骤|已整理回复|正在整理回复|整理结果|agent 状态已更新)$/i.test(
    normalized,
  );
}

function responseFromRunNextResult(result: SocialAgentRunNextResponse): UserFacingAgentResponse {
  const hasCards = Array.isArray(result.cards) && result.cards.length > 0;
  return {
    assistantMessage: hasCards
      ? '我看到对方有新的回复，已经把下一步整理到这段对话里。真实发送、连接或创建活动前仍会等你确认。'
      : '我检查了当前任务，还没有需要展示的新进展。',
    lightStatus: hasCards ? '正在等待你确认' : '已整理回复',
    cards: result.cards ?? [],
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: ['真实发送、连接、创建活动或写入长期画像前仍会确认。'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'confirm',
  };
}

function isRunNextRestorableTaskStatus(status: string | null | undefined): boolean {
  return status === 'waiting_reply' || status === 'waiting_result' || status === 'awaiting_feedback';
}

function responseFromApprovalDispatchResult(input: {
  approvalId: number;
  dispatchResult?: AgentApprovalDispatchResult;
  taskId?: number | null;
}): UserFacingAgentResponse | null {
  const result = input.dispatchResult;
  if (!result) return null;
  const targetUserId = numberFromUnknown(result.targetUserId);
  const conversationId = stringIdFromUnknown(result.conversationId);
  const friendRequestId = stringIdFromUnknown(result.friendRequestId);
  if (!targetUserId && !conversationId && !friendRequestId) return null;
  const candidateRecordId = numberFromUnknown(result.candidateRecordId);
  const socialRequestId = numberFromUnknown(result.socialRequestId);
  const openedConversation = result.openedConversation === true || Boolean(conversationId);
  const assistantMessage = openedConversation
    ? '已按你的确认建立站内沟通入口。接下来先等对方回复；如果需要，我也可以继续帮你调整节奏或准备后续话术。'
    : '已按你的确认完成连接请求。接下来先等对方回复，我会把后续进展继续放在这段对话里。';

  return {
    assistantMessage,
    lightStatus: '已整理回复',
    cards: [
      {
        id: `approval-${input.approvalId}-meet-loop`,
        type: 'review_card',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'meet_loop.timeline',
        title: '邀约进展',
        body: openedConversation
          ? '确认已完成，站内沟通入口已经准备好。'
          : '确认已完成，连接请求已经进入后续等待状态。',
        status: 'completed',
        data: {
          schemaName: 'MeetLoopTimelineCard',
          schemaVersion: 'fitmeet.tool-ui.v1',
          schemaType: 'meet_loop.timeline',
          approvalId: input.approvalId,
          taskId: input.taskId ?? null,
          candidateUserId: targetUserId,
          targetUserId,
          candidateRecordId,
          socialRequestId,
          conversationId: conversationId || null,
          friendRequestId: friendRequestId || null,
          loopStage: 'waiting_reply',
          nextAction: '等待对方回复；你也可以让我继续准备更自然的后续沟通。',
          timeline: {
            title: '邀约进展',
            description: openedConversation
              ? '已通过你的确认建立站内沟通入口，后续回复、改期、确认和评价会继续保存在同一条进展里。'
              : '已通过你的确认发起连接请求，后续状态会继续保存在同一条进展里。',
            nextAction: '等待对方回复；如果时间不合适，可以继续改期或换一个机会。',
            stage: 'waiting_reply',
            steps: [
              {
                key: 'draft',
                label: '发起',
                state: 'done',
                description: '邀请动作已由你确认。',
                actionLabel: '已确认',
                checkpointReady: false,
                resumeMode: 'resume',
              },
              {
                key: 'sent',
                label: '等待回复',
                state: 'current',
                description: openedConversation
                  ? '站内沟通入口已准备好，等待对方回应。'
                  : '连接请求已发起，等待对方回应。',
                actionLabel: '等待回复',
                checkpointReady: true,
                resumeMode: 'resume',
              },
            ],
          },
        },
        actions: [],
      },
    ],
    safeStatus: {
      blocked: false,
      level: 'medium',
      boundaryNotes: ['确认前没有执行真实连接动作', '后续沟通仍建议先站内、公共场景、低压力推进'],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    permissionMode: 'limited_auto',
  };
}

function stringIdFromUnknown(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringFromUnknown(value);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (error instanceof Error) return error.name === 'AbortError';
  return false;
}

function stringFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
