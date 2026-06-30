import type { AgentTask } from '../entities/agent-task.entity';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from '../social-agent-chat.types';

export type LegacyAgentFallbackInput = {
  ownerUserId: number;
  task: AgentTask;
  message: string;
  body: SocialAgentRouteMessageBody;
  startedAt: number;
  signal?: AbortSignal | null;
  fallbackReason: string;
};

export type LegacyAgentFallbackResult = {
  task: AgentTask;
  result: SocialAgentIntentRouteResult | null;
};
