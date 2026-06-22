import { useCallback, type MutableRefObject } from 'react';

import type {
  UserFacingAgentAssistantMessageSource,
} from '../../api/socialAgentApi';
import type {
  AgentConversationIntent,
  AgentThreadMessage,
} from './socialAgentThreadStore';
import {
  findSingleRunAssistantMessageIndex,
  reduceSingleRunAssistantMessages,
  type AssistantRunMessageAnchor,
} from './agentAssistantMessageReducer';
import {
  collapseRepeatedAssistantTextBlocks,
  normalizeAssistantTextForMerge,
} from './assistantTextDedupe';
import { isNonBranchableAssistantSource } from './agentWorkspaceRuntime';

export { collapseRepeatedAssistantTextBlocks } from './assistantTextDedupe';

type SetState<T> = (value: T | ((current: T) => T)) => void;

export const ASSISTANT_STREAMING_PLACEHOLDER = '\u200b';

type UseAgentMessageStreamInput = {
  activeTaskId: number | null;
  runConversationIntentRef: MutableRefObject<AgentConversationIntent>;
  setMessages: SetState<AgentThreadMessage[]>;
  publicText: (value: unknown, fallback: string) => string;
  nextId: (prefix: string) => string;
};

export function useAgentMessageStream({
  activeTaskId,
  runConversationIntentRef,
  setMessages,
  publicText,
  nextId,
}: UseAgentMessageStreamInput) {
  const appendAssistantDelta = useCallback(
    (
      delta: string,
      source?: UserFacingAgentAssistantMessageSource,
      anchor: AssistantRunMessageAnchor = {},
    ) => {
      if (source === 'fallback') return;
      const cleanDelta = publicText(delta, '');
      if (!cleanDelta) return;
      setMessages((current) => {
        const anchoredIndex = findAssistantRunMessageIndex(current, anchor);
        const last = current.at(-1);
        const targetIndex =
          anchoredIndex >= 0
            ? anchoredIndex
            : last?.role === 'assistant' && last.status === 'streaming'
              ? current.length - 1
              : -1;
        if (targetIndex >= 0) {
          const target = current[targetIndex];
          const previousContent =
            target.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : target.content;
          const mergedContent = mergeAssistantDeltaText(previousContent, cleanDelta);
          const nextMessage = {
            ...target,
            content: mergedContent,
            status: 'streaming' as const,
            runId: anchor.runId ?? target.runId ?? null,
            messageId: anchor.messageId ?? target.messageId ?? null,
            assistantMessageSource: source ?? target.assistantMessageSource,
            branchable:
              isNonBranchableAssistantSource(source ?? target.assistantMessageSource)
                ? false
                : target.branchable,
          };
          if (
            nextMessage.content === target.content &&
            nextMessage.runId === target.runId &&
            nextMessage.messageId === target.messageId &&
            nextMessage.assistantMessageSource === target.assistantMessageSource
          ) {
            return current;
          }
          return reduceSingleRunAssistantMessages([
            ...current.slice(0, targetIndex),
            nextMessage,
            ...current.slice(targetIndex + 1),
          ]);
        }
        if (last?.role === 'assistant' && last.status === 'streaming') {
          const previousContent =
            last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : last.content;
          const mergedContent = mergeAssistantDeltaText(previousContent, cleanDelta);
          if (mergedContent === previousContent) return current;
          return reduceSingleRunAssistantMessages([
            ...current.slice(0, -1),
            {
              ...last,
              content: mergedContent,
              runId: anchor.runId ?? last.runId ?? null,
              messageId: anchor.messageId ?? last.messageId ?? null,
              assistantMessageSource: source ?? last.assistantMessageSource,
              branchable:
                isNonBranchableAssistantSource(source ?? last.assistantMessageSource)
                  ? false
                  : last.branchable,
            },
          ]);
        }
        return reduceSingleRunAssistantMessages([
          ...current,
          {
            id: nextId('assistant-stream'),
            role: 'assistant',
            content: cleanDelta,
            status: 'streaming',
            taskId: activeTaskId,
            runId: anchor.runId ?? null,
            messageId: anchor.messageId ?? null,
            conversationIntent: runConversationIntentRef.current,
            assistantMessageSource: source,
            branchable: undefined,
          },
        ]);
      });
    },
    [activeTaskId, nextId, publicText, runConversationIntentRef, setMessages],
  );

  const appendStreamingAssistant = useCallback(
    (
      taskId: number | null,
      conversationIntent: AgentConversationIntent,
      anchor: AssistantRunMessageAnchor = {},
    ) => {
      setMessages((current) => {
        if (findAssistantRunMessageIndex(current, anchor) >= 0) return current;
        const last = current.at(-1);
        if (last?.role === 'assistant' && last.status === 'streaming') return current;
        return reduceSingleRunAssistantMessages([
          ...current,
          {
            id: nextId('assistant-stream'),
            role: 'assistant',
            content: ASSISTANT_STREAMING_PLACEHOLDER,
            status: 'streaming',
            taskId,
            runId: anchor.runId ?? null,
            messageId: anchor.messageId ?? null,
            conversationIntent,
          },
        ]);
      });
    },
    [nextId, setMessages],
  );

  const finishAssistantDelta = useCallback((
    source?: UserFacingAgentAssistantMessageSource,
    anchor: AssistantRunMessageAnchor = {},
  ) => {
    setMessages((current) => {
      const anchoredIndex = findAssistantRunMessageIndex(current, anchor);
      const targetIndex =
        anchoredIndex >= 0
          ? anchoredIndex
          : current.at(-1)?.role === 'assistant' && current.at(-1)?.status === 'streaming'
            ? current.length - 1
            : -1;
      if (targetIndex < 0) return current;
      const target = current[targetIndex];
      if (target.role !== 'assistant' || target.status !== 'streaming') return current;
      if (source === 'fallback' && target.content === ASSISTANT_STREAMING_PLACEHOLDER) {
        return reduceSingleRunAssistantMessages([
          ...current.slice(0, targetIndex),
          ...current.slice(targetIndex + 1),
        ]);
      }
      return reduceSingleRunAssistantMessages([
        ...current.slice(0, targetIndex),
        {
          ...target,
          status: 'done',
          assistantMessageSource: source ?? target.assistantMessageSource,
          branchable:
            isNonBranchableAssistantSource(source ?? target.assistantMessageSource)
              ? false
              : target.branchable,
        },
        ...current.slice(targetIndex + 1),
      ]);
    });
  }, [setMessages]);

  const settleStreamingAssistantAfterInterruption = useCallback(
    (status: 'done' | 'error' = 'done') => {
      setMessages((current) => {
        const last = current.at(-1);
        if (last?.role !== 'assistant' || last.status !== 'streaming') return current;
        const content =
          last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : publicText(last.content, '');
        if (!content.trim()) {
          return reduceSingleRunAssistantMessages(current.slice(0, -1));
        }
        return reduceSingleRunAssistantMessages([
          ...current.slice(0, -1),
          { ...last, content, status },
        ]);
      });
    },
    [publicText, setMessages],
  );

  return {
    appendAssistantDelta,
    appendStreamingAssistant,
    finishAssistantDelta,
    settleStreamingAssistantAfterInterruption,
  };
}

export function mergeAssistantDeltaText(previous: string, delta: string): string {
  if (!previous) return collapseRepeatedAssistantTextBlocks(delta);
  if (!delta) return collapseRepeatedAssistantTextBlocks(previous);
  const previousNorm = normalizeAssistantTextForMerge(previous);
  const deltaNorm = normalizeAssistantTextForMerge(delta);
  if (!deltaNorm) return collapseRepeatedAssistantTextBlocks(previous);
  if (previousNorm === deltaNorm) return collapseRepeatedAssistantTextBlocks(previous);
  if (previousNorm.endsWith(deltaNorm)) return collapseRepeatedAssistantTextBlocks(previous);
  if (deltaNorm.startsWith(previousNorm)) return collapseRepeatedAssistantTextBlocks(delta);
  return collapseRepeatedAssistantTextBlocks(`${previous}${delta}`);
}

export function findAssistantRunMessageIndex(
  messages: AgentThreadMessage[],
  anchor: AssistantRunMessageAnchor,
): number {
  return findSingleRunAssistantMessageIndex(messages, anchor);
}
