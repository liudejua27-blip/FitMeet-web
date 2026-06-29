import type { AgentTask } from '../entities/agent-task.entity';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from '../social-agent-chat.types';

export type AgentEntrySource =
  | 'workout_loop_owner'
  | 'workout_loop_intent'
  | 'profile_loop_intent'
  | 'friend_loop_intent'
  | 'travel_loop_intent'
  | 'legacy_fallback';

export type AgentEntryInput = {
  ownerUserId: number;
  task: AgentTask;
  body: SocialAgentRouteMessageBody;
  message: string;
  startedAt: number;
  signal?: AbortSignal | null;
};

export type AgentEntryResult = {
  source: AgentEntrySource;
  task: AgentTask;
  result: SocialAgentIntentRouteResult | null;
};
