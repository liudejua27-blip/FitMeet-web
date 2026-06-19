import type {
  AgentActionRequest,
  AgentRunRequest,
  AgentRunResponse,
  AgentStreamEvent,
} from './agentApi.types';

export interface AgentAdapter {
  run(
    request: AgentRunRequest,
    handlers: {
      onEvent: (event: AgentStreamEvent) => void;
      signal?: AbortSignal;
    },
  ): Promise<AgentRunResponse>;

  performAction(
    taskId: number,
    request: AgentActionRequest,
    handlers?: {
      onEvent: (event: AgentStreamEvent) => void;
      signal?: AbortSignal;
    },
  ): Promise<AgentRunResponse>;

  restoreSession(taskId?: number): Promise<AgentRunResponse | null>;
}
