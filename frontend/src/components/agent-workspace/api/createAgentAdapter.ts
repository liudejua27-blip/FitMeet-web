import type { AgentAdapter } from './agentAdapter.types';
import { createRealAgentAdapter } from './realAgentAdapter';

export type AgentAdapterMode = 'real';

export function resolveAgentAdapterMode(env: ImportMetaEnv = import.meta.env): AgentAdapterMode {
  const explicit = env.VITE_AGENT_ADAPTER;
  if (explicit && explicit !== 'real') {
    console.warn('[Agent] VITE_AGENT_ADAPTER only supports "real" in this build.');
  }
  return 'real';
}

export function isRealAgentMode(env: ImportMetaEnv = import.meta.env): boolean {
  return resolveAgentAdapterMode(env) === 'real';
}

export function createAgentAdapter(
  mode: AgentAdapterMode = resolveAgentAdapterMode(),
): AgentAdapter {
  void mode;
  return createRealAgentAdapter();
}
