import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentAssistantMessageSource } from './social-agent-chat.types';
import type { ExtractedProfileFields } from './social-agent-chat.types';
import type { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import type { SocialAgentMemoryContext } from './social-agent-memory-context.service';

export type LongTermMemorySnapshot = Awaited<
  ReturnType<SocialAgentLongTermMemoryService['readSnapshot']>
>;

export type SocialAgentGeneratedAnswer = {
  text: string;
  source: SocialAgentAssistantMessageSource;
};

export type SocialAgentDeltaHandler = (delta: string) => void | Promise<void>;

export type SocialAgentDirectReplyInput = {
  message: string;
  traceId?: string | null;
  route: SocialAgentIntentRouterResult;
  profile: Record<string, unknown> | null;
  task: AgentTask;
  longTermSnapshot: LongTermMemorySnapshot | null;
  memoryContext: SocialAgentMemoryContext | null;
  taskContext?: Record<string, unknown> | null;
  conversationHistory?: Array<Record<string, unknown>> | null;
  toolResults?: Array<Record<string, unknown>>;
  onDelta?: SocialAgentDeltaHandler;
  signal?: AbortSignal | null;
};

export type SocialAgentBrainReplyInput = {
  message: string;
  traceId?: string | null;
  task: AgentTask;
  intent: SocialAgentIntentType;
  mode: 'profile_extraction' | 'profile_correction' | 'profile_updated';
  extractedProfile: ExtractedProfileFields;
  sourceMessage: string;
  toolOutput?: Record<string, unknown>;
  fallbackReply: string;
  memoryContext: SocialAgentMemoryContext | null;
  taskContext?: Record<string, unknown> | null;
  conversationHistory?: Array<Record<string, unknown>> | null;
  onDelta?: SocialAgentDeltaHandler;
  signal?: AbortSignal | null;
};
