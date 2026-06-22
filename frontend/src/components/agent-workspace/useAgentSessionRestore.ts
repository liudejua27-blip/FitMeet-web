import { type MutableRefObject, useCallback, useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
  type SocialAgentPermissionMode,
  type SocialCodexReplayPackage,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
  socialAgentApi,
} from '../../api/socialAgentApi';
import { type AgentCheckpointSummary, agentApprovalsApi } from '../../api/agentApprovalsApi';
import {
  isGenericSocialCodexProcessTitle,
  socialCodexStageTitle,
} from '../../lib/socialCodexProcessCopy';
import { sanitizePublicProcessText } from '../assistant-ui/public-process-text';
import { isNonBranchableAssistantSource } from './agentWorkspaceRuntime';
import { mapUserFacingAgentStreamEvent, type AgentAdapter, type AgentStreamEvent } from './api';
import { socialCodexThreadIdForTask } from './socialCodexThreadId';
import type {
  AgentConversationIntent,
  AgentThreadMessage,
  AgentThreadSnapshot,
  Step,
} from './socialAgentThreadStore';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentSessionRestoreInput = {
  agentAdapter: AgentAdapter;
  isRealAgent: boolean;
  isLoggedIn: boolean;
  currentUserId: number | string | null;
  routeTaskId: number | null;
  shellView: string;
  navigate: NavigateFunction;
  skipNextRestoreRef: MutableRefObject<boolean>;
  activeTaskId: number | null;
  canonicalActiveThreadId: string | null;
  messages: AgentThreadMessage[];
  userResult: UserFacingAgentResponse | null;
  mode: SocialAgentPermissionMode;
  branchSelections: Record<string, number>;
  setActiveTaskId: SetState<number | null>;
  setActiveThreadId: SetState<string | null>;
  setActiveTaskStatus: SetState<string | null>;
  setUserResult: SetState<UserFacingAgentResponse | null>;
  setBranchSelections: SetState<Record<string, number>>;
  setMessages: SetState<AgentThreadMessage[]>;
  setProfileGate: SetState<Awaited<ReturnType<typeof socialAgentApi.getProfileGate>> | null>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  setSessionRestoring: SetState<boolean>;
  setSteps: SetState<Step[]>;
  readStoredAgentThread: (userId?: number | string | null) => AgentThreadSnapshot | null;
  writeStoredAgentThread: (
    userId: number | string | null | undefined,
    snapshot: Omit<AgentThreadSnapshot, 'savedAt'>,
  ) => void;
  responseFromSessionSnapshot: (
    snapshot: UserFacingAgentSessionSnapshot | null | undefined,
  ) => UserFacingAgentResponse | null;
  messagesFromSessionSnapshot: (
    snapshot: UserFacingAgentSessionSnapshot,
    restored: UserFacingAgentResponse | null,
    taskId: number | null,
  ) => AgentThreadMessage[];
  sanitizeRestoredResponse: (value: UserFacingAgentResponse) => UserFacingAgentResponse;
  restoredResponseHasUsefulSurface: (value: UserFacingAgentResponse) => boolean;
  isGenericRecoveryAssistantText: (value: unknown) => boolean;
  shouldFetchCheckpointRecovery: (
    response: UserFacingAgentResponse,
    taskStatus: string | null,
    routeTaskExplicit: boolean,
  ) => boolean;
  createCheckpointAvailableRecovery: (
    checkpoint: AgentCheckpointSummary | null | undefined,
  ) => FitMeetAssistantRecovery | null;
  intentForRestoredResponse: (
    response: UserFacingAgentResponse,
    fallback: AgentConversationIntent,
  ) => AgentConversationIntent;
  shouldRestoreReplayTrace: (
    replay: Awaited<ReturnType<typeof socialAgentApi.getTaskEventReplay>>,
    intent: AgentConversationIntent,
  ) => boolean;
  intentForReplayTrace: (
    replay: Awaited<ReturnType<typeof socialAgentApi.getTaskEventReplay>>,
    fallback: AgentConversationIntent,
  ) => AgentConversationIntent;
  mergeProgressStep: (
    steps: Step[],
    event: Extract<AgentStreamEvent, { type: 'progress' }>,
    intent: AgentConversationIntent,
  ) => Step[];
  publicText: (value: unknown, fallback: string) => string;
  nextId: (prefix: string) => string;
};

export function useAgentSessionRestore({
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
}: UseAgentSessionRestoreInput) {
  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) return;
    const stored = readStoredAgentThread(currentUserId);
    if (!stored || (stored.messages.length === 0 && !stored.userResult)) return;
    setActiveTaskId((current) => current ?? stored.activeTaskId);
    setActiveThreadId(
      (current) =>
        current ??
        stored.activeThreadId ??
        socialCodexThreadIdForTask(stored.activeTaskId),
    );
    const usefulStoredResult =
      stored.userResult && restoredResponseHasUsefulSurface(stored.userResult)
        ? stored.userResult
        : null;
    setUserResult((current) => current ?? usefulStoredResult);
    setBranchSelections((current) =>
      Object.keys(current).length > 0 ? current : stored.branchSelections,
    );
    setMessages((current) => {
      if (current.length > 0) return current;
      if (!usefulStoredResult) return stored.messages;
      const messageHasResult = stored.messages.some((item) => !!item.result);
      if (messageHasResult) return stored.messages;
      return stored.messages.map((item, index) =>
        item.role === 'assistant' && index === stored.messages.length - 1
          ? { ...item, result: usefulStoredResult }
          : item,
      );
    });
  }, [
    currentUserId,
    isLoggedIn,
    isGenericRecoveryAssistantText,
    isRealAgent,
    readStoredAgentThread,
    restoredResponseHasUsefulSurface,
    setActiveTaskId,
    setActiveThreadId,
    setBranchSelections,
    setMessages,
    setUserResult,
  ]);

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
  }, [currentUserId, isLoggedIn, isRealAgent, setProfileGate]);

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
    writeStoredAgentThread,
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
    [createCheckpointAvailableRecovery, isLoggedIn, isRealAgent, setRecovery],
  );

  useEffect(() => {
    if (!isRealAgent || !isLoggedIn) return undefined;
    if (skipNextRestoreRef.current) {
      skipNextRestoreRef.current = false;
      return undefined;
    }
    let cancelled = false;
    setSessionRestoring(true);
    void restoreSessionWithMessages({
      taskId: routeTaskId ?? undefined,
      agentAdapter,
      responseFromSessionSnapshot,
      messagesFromSessionSnapshot,
    })
      .then((restored) => {
        if (cancelled || !restored) return;
        const restoredResponse = sanitizeRestoredResponse(restored.response);
        const restoredTaskId = restored.taskId ?? null;
        setActiveTaskId(restoredTaskId);
        setActiveThreadId(socialCodexThreadIdForTask(restoredTaskId));
        setActiveTaskStatus(restored.taskStatus ?? null);
        const usefulRestoredResponse = restoredResponseHasUsefulSurface(restoredResponse)
          ? restoredResponse
          : null;
        const restoredIsGeneric = isGenericRecoveryAssistantText(restoredResponse.assistantMessage);
        const restoredIsNonBranchable = isNonBranchableAssistantSource(
          restoredResponse.assistantMessageSource,
        );
        setUserResult(usefulRestoredResponse);
        setRecovery(null);
        if (
          shouldFetchCheckpointRecovery(
            restoredResponse,
            restored.taskStatus ?? null,
            Boolean(routeTaskId),
          )
        ) {
          void refreshLatestCheckpointRecovery(restoredTaskId);
        }
        const restoredIntent = intentForRestoredResponse(restoredResponse, 'conversation');
        setMessages((current) => {
          if (current.length > 0) return current;
          if (restored.messages.length > 0) return restored.messages;
          if (!usefulRestoredResponse) return current;
          return [
            {
              id: nextId('assistant'),
              role: 'assistant',
              status: 'done',
              content: restoredIsGeneric
                ? ''
                : publicText(restoredResponse.assistantMessage, '我已经恢复了上一次对话。'),
              result: usefulRestoredResponse,
              taskId: restoredTaskId,
              conversationIntent: restoredIntent,
              showSocialResult: restoredIntent !== 'conversation',
              surfaceKind: restoredIsGeneric ? 'recovery' : 'answer',
              assistantMessageSource: restoredResponse.assistantMessageSource,
              branchable: !restoredIsGeneric && !restoredIsNonBranchable,
            },
          ];
        });
        if (shellView !== 'chat') navigate('/agent/chat', { replace: true });
        if (restoredTaskId) {
          void socialAgentApi
            .getTaskEventReplay(restoredTaskId)
            .then((replay) => {
              if (cancelled || !shouldRestoreReplayTrace(replay, restoredIntent)) return;
              const replayIntent = intentForReplayTrace(replay, restoredIntent);
              if (replayIntent !== restoredIntent) {
                setMessages((current) => {
                  if (current.length === 0) {
                    if (!usefulRestoredResponse && replayIntent !== 'conversation') {
                      return [
                        {
                          id: nextId('assistant'),
                          role: 'assistant',
                          status: 'done',
                          content: '',
                          result: null,
                          taskId: restoredTaskId,
                          conversationIntent: replayIntent,
                          showSocialResult: replayIntent === 'approval',
                          surfaceKind: 'recovery',
                          branchable: false,
                        },
                      ];
                    }
                    if (!usefulRestoredResponse) return current;
                    return [
                      {
                        id: nextId('assistant'),
                        role: 'assistant',
                        status: 'done',
                        content: restoredIsGeneric
                          ? ''
                          : publicText(
                              restoredResponse.assistantMessage,
                              '我已经恢复了这段对话。',
                            ),
                        result: usefulRestoredResponse,
                        taskId: restoredTaskId,
                        conversationIntent: replayIntent,
                        showSocialResult: replayIntent === 'approval',
                        surfaceKind: restoredIsGeneric ? 'recovery' : 'answer',
                        assistantMessageSource: restoredResponse.assistantMessageSource,
                        branchable: !restoredIsGeneric && !restoredIsNonBranchable,
                      },
                    ];
                  }
                  return current.map((message, index) =>
                    index === current.length - 1 && message.role === 'assistant'
                      ? {
                          ...message,
                          conversationIntent: replayIntent,
                          showSocialResult: message.showSocialResult || replayIntent === 'approval',
                        }
                      : message,
                  );
                });
              }
              const replaySteps = replay.events
                .map(mapUserFacingAgentStreamEvent)
                .filter(
                  (event): event is Extract<AgentStreamEvent, { type: 'progress' }> =>
                    event?.type === 'progress',
                );
              const summaryStep = progressEventFromReplaySummary(replay);
              if (replaySteps.length === 0 && !summaryStep) return;
              setSteps((current) =>
                (summaryStep ? [summaryStep] : replaySteps).reduce(
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
    intentForReplayTrace,
    intentForRestoredResponse,
    isLoggedIn,
    isGenericRecoveryAssistantText,
    isRealAgent,
    mergeProgressStep,
    navigate,
    nextId,
    publicText,
    refreshLatestCheckpointRecovery,
    responseFromSessionSnapshot,
    restoredResponseHasUsefulSurface,
    routeTaskId,
    sanitizeRestoredResponse,
    setActiveTaskId,
    setActiveTaskStatus,
    setActiveThreadId,
    setMessages,
    setRecovery,
    setSessionRestoring,
    setSteps,
    setUserResult,
    shellView,
    shouldFetchCheckpointRecovery,
    shouldRestoreReplayTrace,
    skipNextRestoreRef,
    messagesFromSessionSnapshot,
  ]);

  return {
    refreshLatestCheckpointRecovery,
  };
}

async function restoreSessionWithMessages(input: {
  taskId?: number | null;
  agentAdapter: AgentAdapter;
  responseFromSessionSnapshot: (
    snapshot: UserFacingAgentSessionSnapshot | null | undefined,
  ) => UserFacingAgentResponse | null;
  messagesFromSessionSnapshot: (
    snapshot: UserFacingAgentSessionSnapshot,
    restored: UserFacingAgentResponse | null,
    taskId: number | null,
  ) => AgentThreadMessage[];
}): Promise<{
  response: UserFacingAgentResponse;
  taskId: number | null;
  taskStatus: string | null;
  messages: AgentThreadMessage[];
} | null> {
  try {
    const snapshot = await socialAgentApi.restoreSession(input.taskId ?? undefined);
    const response = input.responseFromSessionSnapshot(snapshot);
    if (response) {
      const taskId = snapshot.activeTaskId ?? null;
      return {
        response,
        taskId,
        taskStatus: typeof snapshot.task?.status === 'string' ? snapshot.task.status : null,
        messages: input.messagesFromSessionSnapshot(snapshot, response, taskId),
      };
    }
  } catch {
    // Full server snapshots restore thread history. If that endpoint is unavailable,
    // keep the older adapter fallback so a fresh chat still opens.
  }

  const restored = await input.agentAdapter.restoreSession(input.taskId ?? undefined);
  return restored
    ? {
        response: restored.response,
        taskId: restored.taskId ?? null,
        taskStatus: restored.taskStatus ?? null,
        messages: [],
      }
    : null;
}

function progressEventFromReplaySummary(
  replay: SocialCodexReplayPackage,
): Extract<AgentStreamEvent, { type: 'progress' }> | null {
  const summary = replay.summary;
  if (!summary) return null;
  const state = progressStateFromReplaySummary(summary.state);
  const title = replaySummaryTitle(summary, state);
  if (!title) return null;
  const detail = summary.detail ? sanitizePublicProcessText(summary.detail) : null;
  return {
    type: 'progress',
    id: 'social-codex:summary',
    kind: 'status',
    title,
    detail: detail ?? undefined,
    state,
    metadata: {
      processType: 'run_summary',
      taskId: replay.taskId,
      runId: replay.runId,
      currentStage: summary.currentStage,
      currentEventId: summary.currentEventId,
      currentSeq: summary.currentSeq,
      visibleStepCount: summary.visibleStepCount,
      expandable: summary.expandable,
      pendingApproval: summary.pendingApproval,
      candidateCount: summary.candidateCount,
      activityCount: summary.activityCount,
      hasOpportunityCard: summary.hasOpportunityCard,
      savedMemory: summary.savedMemory,
      source: 'replay.summary',
      displayMode: summary.displayMode ?? 'covering_status',
      updateModel: summary.updateModel ?? 'latest_state',
      defaultVisibleCount: summary.defaultVisibleCount ?? 1,
      historyVisibility: summary.historyVisibility ?? 'collapsed',
    },
  };
}

function replaySummaryTitle(
  summary: NonNullable<SocialCodexReplayPackage['summary']>,
  state: Extract<AgentStreamEvent, { type: 'progress' }>['state'],
) {
  const sanitized = summary.title ? sanitizePublicProcessText(summary.title) : null;
  const stageTitle = socialCodexStageTitle(summary.currentStage, socialCodexStateFromProgress(state));
  if (!sanitized) return stageTitle;
  const rawTitle = summary.title.trim();
  if (isGenericSocialCodexProcessTitle(sanitized) || isInternalReplaySummaryTitle(rawTitle)) {
    return stageTitle ?? sanitized;
  }
  return sanitized;
}

function isInternalReplaySummaryTitle(title: string) {
  return /^[a-z][a-z0-9_.:-]*$/i.test(title.trim()) && title.includes('_');
}

function socialCodexStateFromProgress(
  state: Extract<AgentStreamEvent, { type: 'progress' }>['state'],
) {
  if (state === 'failed') return 'failed';
  if (state === 'waiting') return 'waiting';
  if (state === 'done') return 'done';
  return 'running';
}

function progressStateFromReplaySummary(
  state: NonNullable<SocialCodexReplayPackage['summary']>['state'],
): Extract<AgentStreamEvent, { type: 'progress' }>['state'] {
  if (state === 'completed') return 'done';
  if (state === 'failed') return 'failed';
  if (state === 'waiting') return 'waiting';
  return 'running';
}
