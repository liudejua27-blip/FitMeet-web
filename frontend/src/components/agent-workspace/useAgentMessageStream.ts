import { useCallback, type MutableRefObject } from 'react';

import type {
  UserFacingAgentAssistantMessageSource,
} from '../../api/socialAgentApi';
import type {
  AgentConversationIntent,
  AgentThreadMessage,
} from './socialAgentThreadStore';

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
    (delta: string, source?: UserFacingAgentAssistantMessageSource) => {
      if (source === 'fallback') return;
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
              assistantMessageSource: source ?? last.assistantMessageSource,
              branchable:
                last.assistantMessageSource === 'fallback' ? false : last.branchable,
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
            assistantMessageSource: source,
            branchable: undefined,
          },
        ];
      });
    },
    [activeTaskId, nextId, publicText, runConversationIntentRef, setMessages],
  );

  const appendStreamingAssistant = useCallback(
    (taskId: number | null, conversationIntent: AgentConversationIntent) => {
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
    },
    [nextId, setMessages],
  );

  const finishAssistantDelta = useCallback((source?: UserFacingAgentAssistantMessageSource) => {
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role !== 'assistant' || last.status !== 'streaming') return current;
      if (source === 'fallback' && last.content === ASSISTANT_STREAMING_PLACEHOLDER) {
        return current.slice(0, -1);
      }
      return [
        ...current.slice(0, -1),
        {
          ...last,
          status: 'done',
          assistantMessageSource: source ?? last.assistantMessageSource,
          branchable:
            source === 'fallback' || last.assistantMessageSource === 'fallback'
              ? false
              : last.branchable,
        },
      ];
    });
  }, [setMessages]);

  const settleStreamingAssistantAfterInterruption = useCallback(
    (status: 'done' | 'error' = 'done') => {
      setMessages((current) => {
        const last = current.at(-1);
        if (last?.role !== 'assistant' || last.status !== 'streaming') return current;
        const content =
          last.content === ASSISTANT_STREAMING_PLACEHOLDER ? '' : publicText(last.content, '');
        if (!content.trim()) return current.slice(0, -1);
        return [...current.slice(0, -1), { ...last, content, status }];
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
