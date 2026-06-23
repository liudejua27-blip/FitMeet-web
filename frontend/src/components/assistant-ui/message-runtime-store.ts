import { createContext, useContext } from 'react';

export type AssistantMessageRuntimeContextValue = {
  isLatestAssistantMessage: boolean;
};

export const AssistantMessageRuntimeContext = createContext<AssistantMessageRuntimeContextValue>({
  isLatestAssistantMessage: true,
});

export function useAssistantMessageRuntime() {
  return useContext(AssistantMessageRuntimeContext);
}
