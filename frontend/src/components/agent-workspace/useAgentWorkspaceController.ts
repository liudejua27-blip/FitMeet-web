import { useCallback, useRef } from 'react';

import { useAuthStore } from '../../stores';
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
  const createBranchForNextAssistantRef = useRef(false);
  const { agentAdapter, isRealAgent } = useAgentAdapterRuntime();
  const currentUserId = user?.id ?? null;
  const canonicalActiveThreadId = socialCodexThreadIdOrExisting(activeThreadId, activeTaskId);
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
    resetConversationCore(conversationSteps);
    setIsRunning(false);
    runConversationIntentRef.current = 'conversation';
  }, [currentUserId, resetConversationCore, runConversationIntentRef, setIsRunning]);

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
    onUpdateReminderPreference:
      isRealAgent && isLoggedIn ? updateReminderSettings : undefined,
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
