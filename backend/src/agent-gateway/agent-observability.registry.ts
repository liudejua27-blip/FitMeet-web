import type { AgentObservabilityService } from './agent-observability.service';

let currentAgentObservability: AgentObservabilityService | null = null;

export const AgentObservabilityRegistry = {
  current(): AgentObservabilityService | null {
    return currentAgentObservability;
  },
  register(service: AgentObservabilityService): void {
    currentAgentObservability = service;
  },
};
