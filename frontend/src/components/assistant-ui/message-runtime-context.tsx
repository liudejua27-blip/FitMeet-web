import { createContext, useContext, type ReactNode } from 'react';

type AssistantMessageRuntimeContextValue = {
  isLatestAssistantMessage: boolean;
};

const AssistantMessageRuntimeContext = createContext<AssistantMessageRuntimeContextValue>({
  isLatestAssistantMessage: true,
});

export function AssistantMessageRuntimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AssistantMessageRuntimeContextValue;
}) {
  return (
    <AssistantMessageRuntimeContext.Provider value={value}>
      {children}
    </AssistantMessageRuntimeContext.Provider>
  );
}

export function useAssistantMessageRuntime() {
  return useContext(AssistantMessageRuntimeContext);
}
