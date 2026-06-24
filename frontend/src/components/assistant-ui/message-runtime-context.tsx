import type { ReactNode } from 'react';

import {
  AssistantMessageRuntimeContext,
  type AssistantMessageRuntimeContextValue,
} from './message-runtime-store';

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
