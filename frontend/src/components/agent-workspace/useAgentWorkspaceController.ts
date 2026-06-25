import { useCallback, useEffect, useRef } from 'react';

import { useAuthStore } from '../../stores';
import {
  socialProfileApi,
  type ProfileUpdateProposal,
  type SocialProfileCompletion,
  type SocialProfileQuestion,
} from '../../api/socialProfileApi';
import type { FitMeetAlphaCard, UserFacingAgentResponse } from '../../api/socialAgentApi';
import { buildAgentAssistantProps } from './buildAgentAssistantProps';
import { useSocialAgentThreadStore } from './socialAgentThreadStore';
import {
  buildBranchSnapshot,
  buildThreadMetadata,
  clearStoredAgentThread,
  conversationSteps,
  createAgentRecoveryFromError,
  createCheckpointAvailableRecovery,
  decorateAssistantBranches,
  assistantMessageForUserFacingResult,
  findTaskId,
  intentForReplayTrace,
  intentForRestoredResponse,
  isAbortError,
  isGenericRecoveryAssistantText,
  mergeProgressStep,
  messagesFromSessionSnapshot,
  nextId,
  publicText,
  readStoredAgentThread,
  responseFromSessionSnapshot,
  restoredResponseHasUsefulSurface,
  sanitizeRestoredResponse,
  shouldFetchCheckpointRecovery,
  shouldRestoreReplayTrace,
  socialSteps,
  threadBranchSnapshot,
  writeStoredAgentThread,
} from './agentWorkspaceRuntime';
import { useAgentAdapterRuntime } from './useAgentAdapterRuntime';
import { useAgentApprovalDispatchMessages } from './useAgentApprovalDispatchMessages';
import { useAgentApprovalRuntime } from './useAgentApprovalRuntime';
import { useAgentCardActionRuntime } from './useAgentCardActionRuntime';
import { useAgentCheckpointRuntime } from './useAgentCheckpointRuntime';
import { useAgentFeedbackRuntime } from './useAgentFeedbackRuntime';
import { useAgentFinalResultRuntime } from './useAgentFinalResultRuntime';
import { useAgentMessageStream } from './useAgentMessageStream';
import { useAgentReminderRuntime } from './useAgentReminderRuntime';
import { useAgentRuntimeActions } from './useAgentRuntimeActions';
import { useAgentSessionRestore } from './useAgentSessionRestore';
import { useAgentStreamEventHandler } from './useAgentStreamEventHandler';
import { useAgentStreamingRun } from './useAgentStreamingRun';
import { useAgentSubmitRuntime } from './useAgentSubmitRuntime';
import { useAgentThreadBranches } from './useAgentThreadBranches';
import { useAgentThreadRuntime } from './useAgentThreadRuntime';
import { type AgentView, useAgentWorkspaceRoute } from './useAgentWorkspaceRoute';
import { socialCodexThreadIdOrExisting } from './socialCodexThreadId';

export function useAgentWorkspaceController(view: AgentView) {
  const { location, navigate, routeTaskId, shellView, focusReminderSettings } =
    useAgentWorkspaceRoute(view);
  const { isLoggedIn, openLogin, user } = useAuthStore();
  const [threadState, threadActions] = useSocialAgentThreadStore(conversationSteps);
  const {
    messages,
    steps,
    userResult,
    isRunning,
    mode,
    activeTaskId,
    activeTaskStatus,
    sessionRestoring,
    recovery,
    threads,
    threadsLoading,
    activeThreadId,
    branchSelections,
    branchSyncStatus,
    reminderPreference,
    profileGate,
    reminderLoading,
    reminderSaving,
    reminderError,
  } = threadState;
  const {
    setMessages,
    setSteps,
    setUserResult,
    setIsRunning,
    setActiveTaskId,
    setActiveTaskStatus,
    setSessionRestoring,
    setRecovery,
    setThreads,
    setThreadsLoading,
    setActiveThreadId,
    setBranchSelections,
    setBranchSyncStatus,
    setReminderPreference,
    setProfileGate,
    setReminderLoading,
    setReminderSaving,
    setReminderError,
    resetConversationCore,
  } = threadActions;
  const {
    abortRef,
    finishedRef,
    stopRequestedRef,
    branchReloadUserIdRef,
    runConversationIntentRef,
    observedRunThreadIdRef,
    pendingOpportunityClarificationRef,
    pendingApprovalDispatchCardsRef,
    beginAbortableRun,
    finishAbortableRun,
    requestStop,
  } = useAgentStreamingRun('conversation');
  const {
    appendAssistantDelta,
    appendStreamingAssistant,
    finishAssistantDelta,
    settleStreamingAssistantAfterInterruption,
  } = useAgentMessageStream({
    activeTaskId,
    runConversationIntentRef,
    setMessages,
    publicText,
    nextId,
  });
  const skipNextRestoreRef = useRef(false);
  const profileCompletionBootstrapRef = useRef<string | null>(null);
  const createBranchForNextAssistantRef = useRef(false);
  const { agentAdapter, isRealAgent } = useAgentAdapterRuntime();
  const currentUserId = user?.id ?? null;
  const canonicalActiveThreadId = socialCodexThreadIdOrExisting(activeThreadId, activeTaskId);

  const refreshMatchingSnapshot = useCallback(
    async (taskId: number | null | undefined) => {
      if (!isRealAgent || !isLoggedIn || !taskId) return;
      try {
        const restored = await agentAdapter.restoreSession(taskId);
        if (!restored?.response) return;
        const response = sanitizeRestoredResponse(restored.response);
        if (!restoredResponseHasUsefulSurface(response)) return;
        const restoredTaskId = restored.taskId ?? findTaskId(response) ?? taskId;
        const conversationIntent = intentForRestoredResponse(response, 'social');
        const assistantMessage = assistantMessageForUserFacingResult(
          response,
          '我已经更新了当前约练进度。',
        );
        setActiveTaskId(restoredTaskId);
        setActiveTaskStatus(restored.taskStatus ?? null);
        setUserResult(response);
        setRecovery(null);
        setMessages((current) => {
          const existingIndex = [...current]
            .reverse()
            .findIndex(
              (message) =>
                message.role === 'assistant' &&
                (message.taskId === restoredTaskId ||
                  findTaskId(message.result ?? null) === restoredTaskId),
            );
          const message = {
            id: nextId('assistant'),
            role: 'assistant' as const,
            status: 'done' as const,
            content: assistantMessage,
            result: response,
            taskId: restoredTaskId,
            conversationIntent,
            showSocialResult: conversationIntent !== 'conversation',
            surfaceKind: 'answer' as const,
            assistantMessageSource: response.assistantMessageSource,
            branchable: false,
          };
          if (existingIndex < 0) return [...current, message];
          const index = current.length - 1 - existingIndex;
          return [
            ...current.slice(0, index),
            {
              ...current[index],
              content: assistantMessage || current[index].content,
              status: 'done',
              result: response,
              taskId: restoredTaskId,
              conversationIntent,
              showSocialResult: conversationIntent !== 'conversation',
              surfaceKind: 'answer',
              assistantMessageSource: response.assistantMessageSource,
              branchable: false,
            },
            ...current.slice(index + 1),
          ];
        });
      } catch {
        // The normal session restore path remains the source of truth; realtime
        // refresh must not interrupt the current chat when a transient request fails.
      }
    },
    [
      agentAdapter,
      isLoggedIn,
      isRealAgent,
      setActiveTaskId,
      setActiveTaskStatus,
      setMessages,
      setRecovery,
      setUserResult,
    ],
  );

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn || shellView !== 'chat') return undefined;
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { eventType?: string; payload?: Record<string, unknown> }
        | undefined;
      if (detail?.eventType !== 'agent:candidates') return;
      const eventTaskId = numberFromUnknown(detail.payload?.taskId);
      if (activeTaskId && eventTaskId && eventTaskId !== activeTaskId) return;
      void refreshMatchingSnapshot(eventTaskId ?? activeTaskId);
    };
    window.addEventListener('fitmeet:realtime', onRealtime);
    return () => window.removeEventListener('fitmeet:realtime', onRealtime);
  }, [
    activeTaskId,
    isLoggedIn,
    isRealAgent,
    refreshMatchingSnapshot,
    shellView,
  ]);

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn || shellView !== 'chat') return undefined;
    if (!activeTaskId || !shouldPollMatchingSnapshot(userResult, activeTaskStatus)) {
      return undefined;
    }
    let cancelled = false;
    const interval = window.setInterval(() => {
      if (!cancelled) void refreshMatchingSnapshot(activeTaskId);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeTaskId,
    activeTaskStatus,
    isLoggedIn,
    isRealAgent,
    refreshMatchingSnapshot,
    shellView,
    userResult,
  ]);
  const { refreshLatestCheckpointRecovery } = useAgentSessionRestore({
    agentAdapter,
    isRealAgent,
    isLoggedIn,
    currentUserId,
    routeTaskId,
    shellView,
    navigate,
    skipNextRestoreRef,
    activeTaskId,
    canonicalActiveThreadId,
    messages,
    userResult,
    mode,
    branchSelections,
    setActiveTaskId,
    setActiveThreadId,
    setActiveTaskStatus,
    setUserResult,
    setBranchSelections,
    setMessages,
    setProfileGate,
    setRecovery,
    setSessionRestoring,
    setSteps,
    readStoredAgentThread,
    writeStoredAgentThread,
    responseFromSessionSnapshot,
    messagesFromSessionSnapshot,
    sanitizeRestoredResponse,
    restoredResponseHasUsefulSurface,
    isGenericRecoveryAssistantText,
    shouldFetchCheckpointRecovery,
    createCheckpointAvailableRecovery,
    intentForRestoredResponse,
    shouldRestoreReplayTrace,
    intentForReplayTrace,
    mergeProgressStep,
    publicText,
    nextId,
  });

  const resetConversation = useCallback(() => {
    clearStoredAgentThread(currentUserId);
    skipNextRestoreRef.current = true;
    profileCompletionBootstrapRef.current = null;
    resetConversationCore(conversationSteps);
    setIsRunning(false);
    runConversationIntentRef.current = 'conversation';
  }, [currentUserId, resetConversationCore, runConversationIntentRef, setIsRunning]);

  useEffect(() => {
    const userKey = currentUserId ? String(currentUserId) : null;
    if (!userKey) return;
    const explicitProfileIntent = /(?:^|[?&])intent=profile(?:&|$)/.test(location.search);
    if (!isRealAgent || !isLoggedIn || shellView !== 'chat' || sessionRestoring || isRunning) {
      return;
    }
    if (profileCompletionBootstrapRef.current === userKey && !explicitProfileIntent) return;
    if (messages.some(messageHasProfileCompletionCard)) return;
    if (messages.length > 0 && !explicitProfileIntent) return;

    let cancelled = false;
    profileCompletionBootstrapRef.current = userKey;
    socialProfileApi
      .questions()
      .then(({ questions, completion, pendingProposal }) => {
        if (cancelled) return;
        if (!shouldShowProfileCompletionCard(completion)) return;
        const response = buildProfileCompletionBootstrapResponse({
          userId: userKey,
          questions,
          completion,
          pendingProposal,
          permissionMode: mode,
        });
        setMessages((current) => {
          if (current.some(messageHasProfileCompletionCard)) return current;
          if (current.length > 0 && !explicitProfileIntent) return current;
          return [
            ...current,
            {
              id: `assistant-profile-completion-${Date.now()}`,
              role: 'assistant',
              content: response.assistantMessage,
              status: 'done',
              result: response,
              assistantMessageSource: response.assistantMessageSource,
              showSocialResult: true,
              conversationIntent: 'conversation',
            },
          ];
        });
      })
      .catch(() => {
        profileCompletionBootstrapRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentUserId,
    isLoggedIn,
    isRealAgent,
    isRunning,
    location.search,
    messages,
    mode,
    sessionRestoring,
    setMessages,
    shellView,
  ]);

  const { refreshThreads, startNewThread, loadThread, renameThread, deleteThread } =
    useAgentThreadRuntime({
      isRealAgent,
      isLoggedIn,
      isRunning,
      activeTaskId,
      activeThreadId,
      canonicalActiveThreadId,
      messages,
      userResult,
      branchSelections,
      navigate,
      setThreads,
      setThreadsLoading,
      setActiveThreadId,
      setActiveTaskId,
      setActiveTaskStatus,
      setUserResult,
      setMessages,
      setBranchSelections,
      setRecovery,
      setSessionRestoring,
      resetConversation,
      refreshLatestCheckpointRecovery,
      responseFromSessionSnapshot,
      messagesFromSessionSnapshot,
      threadBranchSnapshot,
      shouldFetchCheckpointRecovery,
      buildBranchSnapshot,
      buildThreadMetadata,
    });

  const {
    toggleReminders: toggleReminderRuntime,
    disableReminders: disableReminderRuntime,
    dismissReminder: dismissReminderRuntime,
    updateReminderSettings: updateReminderSettingsRuntime,
  } = useAgentReminderRuntime({
    isRealAgent,
    isLoggedIn,
    isRunning,
    activeTaskId,
    activeTaskStatus,
    sessionRestoring,
    routeTaskId,
    locationPathname: location.pathname,
    locationState: location.state,
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
  });

  const { finishUserFacing } = useAgentFinalResultRuntime({
    activeTaskId,
    messages,
    finishedRef,
    runConversationIntentRef,
    createBranchForNextAssistantRef,
    pendingOpportunityClarificationRef,
    pendingApprovalDispatchCardsRef,
    setUserResult,
    setRecovery,
    setMessages,
    setSteps,
    settleStreamingAssistantAfterInterruption,
    nextId,
  });

  const { handleAgentStreamEvent } = useAgentStreamEventHandler({
    activeTaskId,
    runConversationIntentRef,
    observedRunThreadIdRef,
    setActiveTaskId,
    setActiveThreadId,
    setSteps,
    appendAssistantDelta,
    appendStreamingAssistant,
    finishAssistantDelta,
    finishUserFacing,
  });

  const { submit } = useAgentSubmitRuntime({
    isRunning,
    isRealAgent,
    isLoggedIn,
    activeTaskId,
    canonicalActiveThreadId,
    mode,
    shellView,
    agentAdapter,
    branchReloadUserIdRef,
    createBranchForNextAssistantRef,
    pendingOpportunityClarificationRef,
    runConversationIntentRef,
    observedRunThreadIdRef,
    finishedRef,
    stopRequestedRef,
    skipNextRestoreRef,
    setMessages,
    setUserResult,
    setRecovery,
    setIsRunning,
    setSteps,
    setActiveTaskId,
    setActiveThreadId,
    appendStreamingAssistant,
    beginAbortableRun,
    finishAbortableRun,
    finishUserFacing,
    handleAgentStreamEvent,
    settleStreamingAssistantAfterInterruption,
    refreshThreads,
    navigate,
    nextId,
  });

  const currentGoal =
    [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';

  const { runCheckpointStream } = useAgentCheckpointRuntime({
    isRunning,
    activeTaskId,
    currentGoal,
    fallbackSteps: conversationSteps,
    finishedRef,
    stopRequestedRef,
    setRecovery,
    setIsRunning,
    setSteps,
    setActiveTaskId,
    beginAbortableRun,
    finishAbortableRun,
    handleAgentStreamEvent,
    finishUserFacing,
    settleStreamingAssistantAfterInterruption,
    findTaskId,
    isAbortError,
    createRecoveryFromError: createAgentRecoveryFromError,
  });

  const { appendApprovalDispatchResultMessage } = useAgentApprovalDispatchMessages({
    activeTaskId,
    pendingApprovalDispatchCardsRef,
    setMessages,
    nextId,
  });

  const { runCardActionStream } = useAgentCardActionRuntime({
    isRunning,
    activeTaskId,
    currentGoal,
    agentAdapter,
    actionSteps: socialSteps,
    finishedRef,
    stopRequestedRef,
    runConversationIntentRef,
    setRecovery,
    setIsRunning,
    setSteps,
    setActiveTaskId,
    beginAbortableRun,
    finishAbortableRun,
    appendStreamingAssistant,
    handleAgentStreamEvent,
    finishUserFacing,
    settleStreamingAssistantAfterInterruption,
    refreshThreads,
    isAbortError,
    createRecoveryFromError: createAgentRecoveryFromError,
  });

  const {
    stopRun,
    reloadLastUserMessage,
    retryRecovery,
    toggleReminders,
    disableReminders,
    dismissReminder,
    updateReminderSettings,
    resumeState,
    retryTool,
    replayState,
    forkState,
  } = useAgentRuntimeActions({
    messages,
    isRunning,
    currentGoal,
    recovery,
    reminderPreference,
    reminderSaving,
    branchReloadUserIdRef,
    requestStop,
    submit,
    runCheckpointStream,
    toggleReminderRuntime,
    disableReminderRuntime,
    dismissReminderRuntime,
    updateReminderSettingsRuntime,
    settleStreamingAssistantAfterInterruption,
    setIsRunning,
    setSteps,
  });

  const { approveInlineApproval, rejectInlineApproval } = useAgentApprovalRuntime({
    isRunning,
    activeTaskId,
    currentGoal,
    messages,
    steps,
    setMessages,
    setSteps,
    setRecovery,
    runCheckpointStream,
    reloadLastUserMessage,
    appendApprovalDispatchResultMessage,
    publicText,
    nextId,
  });

  const { submitFeedback } = useAgentFeedbackRuntime({
    messages,
    activeTaskId,
    setMessages,
  });

  const { decoratedMessages, switchAssistantBranch } = useAgentThreadBranches({
    messages,
    branchSelections,
    branchSyncStatus,
    canonicalActiveThreadId,
    isRealAgent,
    isLoggedIn,
    setBranchSelections,
    setBranchSyncStatus,
    decorateAssistantBranches,
    buildBranchSnapshot,
  });

  const assistantProps = buildAgentAssistantProps({
    messages: decoratedMessages,
    threads,
    threadsLoading,
    activeThreadId,
    steps,
    isRunning,
    sessionRestoring,
    recovery,
    profileGate,
    requiresAuth: isRealAgent && !isLoggedIn,
    onSubmit: submit,
    onStop: stopRun,
    onReloadLast: reloadLastUserMessage,
    onFeedback: submitFeedback,
    onBranchSwitch: switchAssistantBranch,
    abortRef,
    startNewThread,
    loadThread,
    onThreadRename: renameThread,
    onThreadDelete: deleteThread,
    onLogin: openLogin,
    onRetryRecovery: retryRecovery,
    onDismissRecovery: () => setRecovery(null),
    reminderPreference,
    reminderLoading,
    reminderSaving,
    reminderError,
    focusReminderSettings,
    onToggleReminders: isRealAgent && isLoggedIn ? toggleReminders : undefined,
    onDisableReminders: isRealAgent && isLoggedIn ? disableReminders : undefined,
    onDismissReminder: isRealAgent && isLoggedIn ? dismissReminder : undefined,
    onUpdateReminderPreference: isRealAgent && isLoggedIn ? updateReminderSettings : undefined,
    onApproveApproval: approveInlineApproval,
    onRejectApproval: rejectInlineApproval,
    onResumeState: resumeState,
    onRetryTool: retryTool,
    onReplayState: replayState,
    onForkState: forkState,
    onCardAction: runCardActionStream,
  });

  return { assistantProps };
}

function shouldShowProfileCompletionCard(completion: SocialProfileCompletion | null | undefined) {
  if (!completion) return true;
  if (completion.readinessLevel !== 'agent_ready') return true;
  return (completion.missingFields ?? []).length > 0;
}

function messageHasProfileCompletionCard(message: { result?: UserFacingAgentResponse | null }) {
  return Boolean(
    message.result?.cards?.some(
      (card) => card.type === 'profile_completion' || card.schemaType === 'profile.completion',
    ),
  );
}

function shouldPollMatchingSnapshot(
  response: UserFacingAgentResponse | null,
  taskStatus: string | null,
) {
  if (!response) return false;
  if (response.publicLoop?.stage === 'dismissed') return false;
  if (response.publicLoop?.stage === 'candidates_recommended') return false;
  if (response.workflow?.state === 'CANDIDATES_READY') return false;
  const normalizedTaskStatus = (taskStatus ?? '').trim().toLowerCase();
  if (normalizedTaskStatus === 'cancelled' || normalizedTaskStatus === 'failed') return false;
  const matchingJobStatus = response.cards
    .map((card) => {
      const matchingJob = isRecord(card.data?.matchingJob) ? card.data.matchingJob : null;
      return card.data?.matchingJobStatus ?? matchingJob?.status;
    })
    .find((value) => typeof value === 'string');
  if (matchingJobStatus === 'queued' || matchingJobStatus === 'running') return true;
  if (response.publicLoop?.stage === 'discover_visible') return true;
  if (response.workflow?.state === 'DISCOVER_VISIBLE') return true;
  return /正在匹配|正在筛选|等待匹配/.test(response.assistantMessage);
}

function numberFromUnknown(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildProfileCompletionBootstrapResponse(input: {
  userId: string;
  questions: SocialProfileQuestion[];
  completion: SocialProfileCompletion;
  pendingProposal?: ProfileUpdateProposal | null;
  permissionMode: UserFacingAgentResponse['permissionMode'];
}): UserFacingAgentResponse {
  const questions = normalizeProfileCompletionQuestions(input.questions);
  const card: FitMeetAlphaCard = {
    id: `profile_completion:onboarding:${input.userId}:${input.completion.percent ?? 0}`,
    type: 'profile_completion',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'profile.completion',
    title: '让 Agent 帮你补充个人信息',
    body: '回答几个问题后，我会先生成更新预览；确认后才保存到个人信息。',
    status: 'waiting_confirmation',
    data: {
      schemaName: 'ProfileCompletionCard',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'profile.completion',
      questionCount: questions.length,
      missingFields: input.completion.missingFields ?? [],
      pendingProposal: input.pendingProposal ?? null,
      questions,
      savePolicy: 'preview_before_write',
      boundaries: [
        '不会推荐具体人物',
        '不会生成邀约文案',
        '不会自动开始匹配',
        '所有问题都可以跳过',
      ],
    },
    actions: [],
  };
  return {
    assistantMessage:
      '我先帮你补充个人信息。你可以回答几个问题，我会先生成更新预览，确认后才保存。',
    assistantMessageSource: 'deterministic_route',
    lightStatus: '正在整理回复',
    cards: [card],
    safeStatus: {
      blocked: false,
      level: 'low',
      boundaryNotes: [],
      requiredConfirmations: [],
    },
    pendingConfirmations: [],
    publicLoop: {
      stage: 'profile_completion',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      messagesHref: null,
      requiredConfirmation: false,
    },
    permissionMode: input.permissionMode,
  };
}

function normalizeProfileCompletionQuestions(questions: SocialProfileQuestion[]) {
  const normalized = questions
    .map((question) => ({
      key: question.key,
      label: profileCompletionQuestionLabel(question),
      question: question.question,
      placeholder: profileCompletionQuestionPlaceholder(question),
      options: profileCompletionQuestionOptions(question),
    }))
    .filter((question) => question.key.trim() && question.question.trim());
  return normalized.length > 0 ? normalized.slice(0, 6) : fallbackProfileCompletionQuestions();
}

function profileCompletionQuestionLabel(question: SocialProfileQuestion) {
  const text = `${question.key} ${question.domain ?? ''} ${question.matchRole ?? ''} ${question.question}`;
  if (/city|nearby|location|地点|城市|附近|范围/i.test(text)) return '城市与活动范围';
  if (/time|available|availability|weekday|weekend|时间|周末|工作日/i.test(text)) {
    return '可约时间';
  }
  if (/interest|fitness|sport|activity|兴趣|运动|活动/i.test(text)) return '兴趣活动';
  if (/want|preferred|meet|preference|想认识|偏好|类型/i.test(text)) return '想认识的人';
  if (/privacy|reject|avoid|boundary|safe|安全|边界|隐私|拒绝/i.test(text)) return '安全边界';
  return '补充信息';
}

function profileCompletionQuestionPlaceholder(question: SocialProfileQuestion) {
  const label = profileCompletionQuestionLabel(question);
  if (label === '城市与活动范围') return '例如：青岛大学附近，3 公里内';
  if (label === '可约时间') return '例如：周末下午，工作日晚上也可以';
  if (label === '兴趣活动') return '例如：跑步、羽毛球、散步、健身';
  if (label === '想认识的人') return '例如：节奏轻松、愿意先站内沟通的人';
  if (label === '安全边界') return '例如：只接受公共场所，不交换联系方式';
  return '可以简单说一句，也可以选暂不确定';
}

function profileCompletionQuestionOptions(question: SocialProfileQuestion) {
  const label = profileCompletionQuestionLabel(question);
  if (label === '城市与活动范围') return ['青岛', '学校或公司附近', '3 公里内', '暂不确定'];
  if (label === '可约时间') return ['周末下午', '工作日晚上', '今天晚上', '暂不确定'];
  if (label === '兴趣活动') return ['跑步', '羽毛球', '散步', '健身', '暂不确定'];
  if (label === '想认识的人') return ['找运动搭子', '低压力轻松聊', '先运动后熟悉', '暂不确定'];
  if (label === '安全边界') {
    return ['只接受公共场所', '先站内沟通', '不交换联系方式', '不接受太晚见面', '暂不确定'];
  }
  return ['暂不确定'];
}

function fallbackProfileCompletionQuestions() {
  return [
    {
      key: 'currentGoal',
      label: '当前目标',
      question: '你这次最想达成什么？',
      placeholder: '例如：找一个周末下午能一起慢跑的搭子',
      options: ['找运动搭子', '找轻松聊天的人', '参加附近活动', '暂不确定'],
    },
    {
      key: 'interactionStyle',
      label: '互动形式',
      question: '你更偏好怎样开始互动？',
      placeholder: '例如：先站内聊，再约公共路线',
      options: ['先站内沟通', '低压力轻松聊', '先运动后熟悉', '暂不确定'],
    },
    {
      key: 'timeLocation',
      label: '时间和地点',
      question: '你方便的时间和地点范围？',
      placeholder: '例如：青岛大学附近，周末下午，3 公里内',
      options: ['今天晚上', '周末下午', '学校或公司附近', '3 公里内', '暂不确定'],
    },
    {
      key: 'activityPreference',
      label: '活动偏好',
      question: '你更想参加哪类活动？',
      placeholder: '例如：3-5km 慢跑，节奏轻松',
      options: ['跑步', '羽毛球', '散步', '健身', '暂不确定'],
    },
    {
      key: 'safetyBoundary',
      label: '安全边界',
      question: '有哪些必要的安全边界？',
      placeholder: '例如：只接受公共场所，不交换联系方式',
      options: ['只接受公共场所', '不交换联系方式', '不接受太晚见面', '暂不确定'],
    },
  ];
}
