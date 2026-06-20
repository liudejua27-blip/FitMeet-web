import { useMemo } from 'react';

import { createAgentAdapter, resolveAgentAdapterMode } from './api';

export function useAgentAdapterRuntime() {
  const agentAdapterMode = useMemo(() => resolveAgentAdapterMode(), []);
  const agentAdapter = useMemo(() => createAgentAdapter(agentAdapterMode), [agentAdapterMode]);

  return {
    agentAdapter,
    agentAdapterMode,
    isRealAgent: agentAdapterMode === 'real',
  };
}
