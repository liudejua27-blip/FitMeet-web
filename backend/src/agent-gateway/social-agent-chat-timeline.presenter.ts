import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunResult,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentSessionMessage,
  SocialAgentSessionTaskSummary,
  SocialAgentTaskTimelineSnapshot,
} from './social-agent-chat.types';
import { buildSocialAgentTimelineMessages } from './social-agent-chat-timeline-messages.presenter';

export { readSocialAgentTimelineCandidates } from './social-agent-chat-timeline-candidates.presenter';

export function buildSocialAgentTimelineSnapshot(input: {
  task: AgentTask;
  taskSummary: SocialAgentSessionTaskSummary;
  sessionMessages: SocialAgentSessionMessage[];
  memory: Record<string, unknown>;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  events: Array<Record<string, unknown>>;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  pendingApprovals: SocialAgentPendingApprovalSnapshot[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}): SocialAgentTaskTimelineSnapshot {
  const {
    task,
    taskSummary,
    sessionMessages,
    memory,
    result,
    events,
    latestRun,
    pendingApprovals,
    candidateActions,
    restoredAt,
  } = input;

  return {
    taskId: task.id,
    messages: buildSocialAgentTimelineMessages({
      task,
      result,
      pendingApprovals,
      events,
      sessionMessages,
    }),
    task: taskSummary,
    memory,
    result,
    events,
    latestRun,
    pendingApprovals,
    candidateActions,
    restoredAt,
  };
}
