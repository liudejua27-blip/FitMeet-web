import { AgentTask } from './entities/agent-task.entity';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import {
  SocialAgentRunNextResult,
  SocialAgentToolCallRecord,
} from './social-agent-tool.types';
import { summarizeSocialAgentToolCalls } from './social-agent-tool-execution-summary';

export function buildSocialAgentRunNextResult(input: {
  task: Pick<AgentTask, 'id' | 'status'>;
  calls: SocialAgentToolCallRecord[];
  handledReply: boolean;
  decision: Record<string, unknown> | null;
  cards?: FitMeetAlphaCard[];
}): SocialAgentRunNextResult {
  const summary = summarizeSocialAgentToolCalls(input.calls);
  return {
    taskId: input.task.id,
    executedSteps: summary.executedSteps,
    succeededSteps: summary.succeededSteps,
    failedSteps: summary.failedSteps,
    blockedSteps: summary.blockedSteps,
    toolCalls: input.calls,
    status: input.task.status,
    handledReply: input.handledReply,
    decision: input.decision,
    ...(input.cards && input.cards.length > 0 ? { cards: input.cards } : {}),
  };
}
