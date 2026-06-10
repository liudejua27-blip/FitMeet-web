import type { AgentAdapter } from './agentAdapter.types';
import { createMockAgentAdapter } from './mockAgentAdapter';
import { createRealAgentAdapter } from './realAgentAdapter';

export type AgentAdapterMode = 'mock' | 'real';

export function resolveAgentAdapterMode(env: ImportMetaEnv = import.meta.env): AgentAdapterMode {
  const explicit = env.VITE_AGENT_ADAPTER;
  if (explicit === 'real') return 'real';
  if (explicit === 'mock') return 'mock';
  if (env.VITE_AGENT_MOCK_FLOW === 'true') return 'mock';
  return env.PROD ? 'real' : 'mock';
}

export function isRealAgentMode(env: ImportMetaEnv = import.meta.env): boolean {
  return resolveAgentAdapterMode(env) === 'real';
}

export function createAgentAdapter(
  mode: AgentAdapterMode = resolveAgentAdapterMode(),
): AgentAdapter {
  return mode === 'real' ? createRealAgentAdapter() : createMockAgentAdapter();
}
