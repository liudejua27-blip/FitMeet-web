import { useCallback, useMemo } from 'react';

import {
  type FitMeetAgentThreadBranchSnapshot,
  socialAgentApi,
} from '../../api/socialAgentApi';
import type {
  AgentMessageBranchState,
  AgentThreadMessage,
} from './socialAgentThreadStore';

type BranchSelections = Record<string, number>;
type BranchSyncStatus = Record<string, AgentMessageBranchState['syncStatus']>;

type UseAgentThreadBranchesInput = {
  messages: AgentThreadMessage[];
  branchSelections: BranchSelections;
  branchSyncStatus: BranchSyncStatus;
  canonicalActiveThreadId: string | null;
  isRealAgent: boolean;
  isLoggedIn: boolean;
  setBranchSelections: (value: BranchSelections | ((current: BranchSelections) => BranchSelections)) => void;
  setBranchSyncStatus: (
    value: BranchSyncStatus | ((current: BranchSyncStatus) => BranchSyncStatus),
  ) => void;
  decorateAssistantBranches: (
    messages: AgentThreadMessage[],
    selections: BranchSelections,
    syncStatus: BranchSyncStatus,
  ) => AgentThreadMessage[];
  buildBranchSnapshot: (
    messages: AgentThreadMessage[],
    selections: BranchSelections,
  ) => FitMeetAgentThreadBranchSnapshot | null;
};

export function useAgentThreadBranches({
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
}: UseAgentThreadBranchesInput) {
  const decoratedMessages = useMemo(
    () => decorateAssistantBranches(messages, branchSelections, branchSyncStatus),
    [branchSelections, branchSyncStatus, decorateAssistantBranches, messages],
  );

  const switchAssistantBranch = useCallback(
    (messageId: string, direction: 'previous' | 'next') => {
      const message = decoratedMessages.find((item) => item.id === messageId);
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
    },
    [
      branchSelections,
      buildBranchSnapshot,
      canonicalActiveThreadId,
      decoratedMessages,
      isLoggedIn,
      isRealAgent,
      messages,
      setBranchSelections,
      setBranchSyncStatus,
    ],
  );

  return {
    decoratedMessages,
    switchAssistantBranch,
  };
}
