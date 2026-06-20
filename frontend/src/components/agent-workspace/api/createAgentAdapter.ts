import type { AgentAdapter } from './agentAdapter.types';
import { createRealAgentAdapter } from './realAgentAdapter';

export type AgentAdapterMode = 'mock' | 'real';

const IS_PRODUCTION_AGENT_BUNDLE = import.meta.env.PROD || import.meta.env.MODE === 'production';

export function resolveAgentAdapterMode(env: ImportMetaEnv = import.meta.env): AgentAdapterMode {
  if (IS_PRODUCTION_AGENT_BUNDLE) return 'real';
  if (env.PROD || env.MODE === 'production') return 'real';

  const explicit = env.VITE_AGENT_ADAPTER;
  if (explicit === 'real') return 'real';
  if (explicit === 'mock') return 'mock';
  if (env.VITE_AGENT_MOCK_FLOW === 'true') return 'mock';
  return 'real';
}

export function isRealAgentMode(env: ImportMetaEnv = import.meta.env): boolean {
  return resolveAgentAdapterMode(env) === 'real';
}

export function createAgentAdapter(
  mode: AgentAdapterMode = resolveAgentAdapterMode(),
): AgentAdapter {
  if (IS_PRODUCTION_AGENT_BUNDLE) return createRealAgentAdapter();
  return mode === 'real' ? createRealAgentAdapter() : createLazyMockAgentAdapter();
}

const loadDevelopmentMockAgentAdapter = import.meta.env.DEV
  ? async () => {
      const module = await import('./mockAgentAdapter');
      return module.createMockAgentAdapter();
    }
  : null;

function createLazyMockAgentAdapter(): AgentAdapter {
  let adapterPromise: Promise<AgentAdapter> | null = null;
  const load = async () => {
    if (!loadDevelopmentMockAgentAdapter) {
      throw new Error('Agent mock adapter is disabled in production builds.');
    }
    adapterPromise ??= loadDevelopmentMockAgentAdapter();
    return adapterPromise;
  };

  return {
    async run(request, handlers) {
      const adapter = await load();
      return adapter.run(request, handlers);
    },
    async performAction(taskId, request, handlers) {
      const adapter = await load();
      return adapter.performAction(taskId, request, handlers);
    },
    async restoreSession(taskId) {
      const adapter = await load();
      return adapter.restoreSession(taskId);
    },
  };
}
