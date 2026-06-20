import type { FitMeetAssistantUIProps } from './FitMeetAssistantUI';

type BuildAgentAssistantPropsInput = Omit<
  FitMeetAssistantUIProps,
  'onNewConversation' | 'onThreadSelect'
> & {
  abortRef: { current: AbortController | null };
  startNewThread: () => Promise<void> | void;
  loadThread: (threadId: string) => Promise<void> | void;
};

export function buildAgentAssistantProps({
  abortRef,
  startNewThread,
  loadThread,
  ...props
}: BuildAgentAssistantPropsInput): FitMeetAssistantUIProps {
  return {
    ...props,
    onNewConversation: () => {
      abortRef.current?.abort();
      void startNewThread();
    },
    onThreadSelect: (threadId) => {
      void loadThread(threadId);
    },
  };
}
