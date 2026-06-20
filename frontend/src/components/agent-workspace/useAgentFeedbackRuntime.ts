import { useCallback } from 'react';

import { socialAgentApi } from '../../api/socialAgentApi';
import type { AgentThreadMessage } from './socialAgentThreadStore';

type SetState<T> = (value: T | ((current: T) => T)) => void;

type UseAgentFeedbackRuntimeInput = {
  messages: AgentThreadMessage[];
  activeTaskId: number | null;
  setMessages: SetState<AgentThreadMessage[]>;
};

export function useAgentFeedbackRuntime({
  messages,
  activeTaskId,
  setMessages,
}: UseAgentFeedbackRuntimeInput) {
  const submitFeedback = useCallback(
    async (messageId: string, value: 'positive' | 'negative') => {
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
    },
    [activeTaskId, messages, setMessages],
  );

  return { submitFeedback };
}
