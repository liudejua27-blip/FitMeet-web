import { useCallback, useEffect, useRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import {
  type FitMeetAgentThreadBranchSnapshot,
  type FitMeetAgentThreadSummary,
  type UserFacingAgentResponse,
  type UserFacingAgentSessionSnapshot,
  socialAgentApi,
} from '../../api/socialAgentApi';
import type { AgentThreadMessage } from './socialAgentThreadStore';
import type { FitMeetAssistantRecovery } from './FitMeetAssistantUI.types';
import { socialCodexThreadIdForTask } from './socialCodexThreadId';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentThreadRuntimeInput = {
  isRealAgent: boolean;
  isLoggedIn: boolean;
  isRunning: boolean;
  activeTaskId: number | null;
  activeThreadId: string | null;
  canonicalActiveThreadId: string | null;
  messages: AgentThreadMessage[];
  userResult: UserFacingAgentResponse | null;
  branchSelections: Record<string, number>;
  navigate: NavigateFunction;
  setThreads: SetState<FitMeetAgentThreadSummary[]>;
  setThreadsLoading: SetState<boolean>;
  setActiveThreadId: SetState<string | null>;
  setActiveTaskId: SetState<number | null>;
  setActiveTaskStatus: SetState<string | null>;
  setUserResult: SetState<UserFacingAgentResponse | null>;
  setMessages: SetState<AgentThreadMessage[]>;
  setBranchSelections: SetState<Record<string, number>>;
  setRecovery: SetState<FitMeetAssistantRecovery | null>;
  setSessionRestoring: SetState<boolean>;
  resetConversation: () => void;
  refreshLatestCheckpointRecovery: (taskId: number | string | null | undefined) => Promise<void>;
  responseFromSessionSnapshot: (
    snapshot: UserFacingAgentSessionSnapshot | null | undefined,
  ) => UserFacingAgentResponse | null;
  messagesFromSessionSnapshot: (
    snapshot: UserFacingAgentSessionSnapshot,
    restored: UserFacingAgentResponse | null,
    taskId: number | null,
  ) => AgentThreadMessage[];
  threadBranchSnapshot: (
    thread: FitMeetAgentThreadSummary,
  ) => FitMeetAgentThreadBranchSnapshot | null;
  shouldFetchCheckpointRecovery: (
    response: UserFacingAgentResponse | null,
    taskStatus: string | null,
    explicitTaskRoute: boolean,
  ) => boolean;
  buildBranchSnapshot: (
    messages: AgentThreadMessage[],
    selections: Record<string, number>,
  ) => FitMeetAgentThreadBranchSnapshot | null;
  buildThreadMetadata: (
    messages: AgentThreadMessage[],
    result: UserFacingAgentResponse | null,
  ) => Record<string, unknown>;
};

export function useAgentThreadRuntime({
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
}: UseAgentThreadRuntimeInput) {
  const newThreadCreatingRef = useRef(false);

  const refreshThreads = useCallback(async () => {
    if (!isRealAgent || !isLoggedIn) return;
    setThreadsLoading(true);
    try {
      const next = await socialAgentApi.listThreads(40);
      setThreads(next.threads);
      if (!activeThreadId && activeTaskId) {
        setActiveThreadId(socialCodexThreadIdForTask(activeTaskId));
      }
    } catch {
      // Thread list persistence should not block the chat surface.
    } finally {
      setThreadsLoading(false);
    }
  }, [
    activeTaskId,
    activeThreadId,
    isLoggedIn,
    isRealAgent,
    setActiveThreadId,
    setThreads,
    setThreadsLoading,
  ]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

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
    branchSelections,
    buildBranchSnapshot,
    buildThreadMetadata,
    canonicalActiveThreadId,
    isLoggedIn,
    isRealAgent,
    isRunning,
    messages,
    userResult,
  ]);

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
      if (
        shouldFetchCheckpointRecovery(
          restored,
          typeof detail.session.task?.status === 'string' ? detail.session.task.status : null,
          true,
        )
      ) {
        void refreshLatestCheckpointRecovery(detail.thread.taskId);
      }
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

  const startNewThread = async () => {
    if (newThreadCreatingRef.current) return;
    newThreadCreatingRef.current = true;
    resetConversation();
    if (!isRealAgent || !isLoggedIn) {
      newThreadCreatingRef.current = false;
      navigate('/agent/chat', { replace: false });
      return;
    }
    setSessionRestoring(true);
    try {
      const created = await socialAgentApi.createThread();
      setActiveThreadId(created.thread.id);
      setActiveTaskId(created.thread.taskId);
      setActiveTaskStatus(created.thread.status ?? null);
      setUserResult(null);
      setMessages([]);
      setBranchSelections({});
      setRecovery(null);
      setThreads((current) => [
        created.thread,
        ...current.filter((thread) => thread.id !== created.thread.id),
      ]);
      navigate(`/agent/chat/${created.thread.taskId}`, { replace: false });
    } catch {
      void refreshThreads();
      navigate('/agent/chat', { replace: false });
    } finally {
      newThreadCreatingRef.current = false;
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

  return {
    refreshThreads,
    startNewThread,
    loadThread,
    renameThread,
    deleteThread,
  };
}
