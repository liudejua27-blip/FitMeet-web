import { AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

export type SocialAgentRunNextTaskState = {
  status: AgentTaskStatus;
  statusReason: string;
};

export function socialAgentRunNextReadReplyState(input: {
  readCallStatus: SocialAgentToolCallRecord['status'];
  newMessageCount: number;
  skippedCode?: string | null;
  retryable?: boolean | null;
}): SocialAgentRunNextTaskState {
  if (input.skippedCode && input.retryable === false) {
    return {
      status: AgentTaskStatus.Failed,
      statusReason: input.skippedCode,
    };
  }
  return {
    status: AgentTaskStatus.WaitingReply,
    statusReason:
      input.newMessageCount === 0 ? 'no_new_reply' : 'reply_read_failed',
  };
}

export function socialAgentRunNextSummaryFailedState(): SocialAgentRunNextTaskState {
  return {
    status: AgentTaskStatus.WaitingReply,
    statusReason: 'reply_summary_failed',
  };
}

export function socialAgentRunNextDecisionState(input: {
  nextAction?: string | null;
  hasExecutableTool: boolean;
}): SocialAgentRunNextTaskState | null {
  if (input.nextAction === 'stop') {
    return {
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'next_action_stop',
    };
  }
  if (!input.hasExecutableTool) {
    return {
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'next_action_not_executable',
    };
  }
  return null;
}

export function socialAgentRunNextActionState(input: {
  actionStatus: SocialAgentToolCallRecord['status'];
}): SocialAgentRunNextTaskState {
  return input.actionStatus === 'succeeded'
    ? {
        status: AgentTaskStatus.WaitingReply,
        statusReason: 'next_action_executed_waiting_reply',
      }
    : {
        status: AgentTaskStatus.WaitingResult,
        statusReason: 'next_action_needs_attention',
      };
}
