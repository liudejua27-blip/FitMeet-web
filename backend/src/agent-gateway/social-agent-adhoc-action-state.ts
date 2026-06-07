import { AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

export type SocialAgentAdhocActionTaskState =
  | {
      status: AgentTaskStatus.WaitingReply;
      statusReason: 'action_executed_waiting_reply';
    }
  | {
      status: AgentTaskStatus.WaitingResult;
      statusReason: string;
      error?: Record<string, unknown> | null;
    };

export function socialAgentUnconfirmedAdhocActionState(input: {
  call: SocialAgentToolCallRecord;
  readErrorText: (value: unknown) => string | undefined;
}): SocialAgentAdhocActionTaskState {
  const { call, readErrorText } = input;
  return {
    status: AgentTaskStatus.WaitingResult,
    statusReason: readErrorText(call.error?.message) ?? 'approval_required',
    error: call.error,
  };
}

export function socialAgentAdhocActionCompletionState(input: {
  call: SocialAgentToolCallRecord;
  shouldWaitForReply: boolean;
  readErrorText: (value: unknown) => string | undefined;
}): SocialAgentAdhocActionTaskState {
  const { call, readErrorText, shouldWaitForReply } = input;
  if (call.status === 'succeeded') {
    if (shouldWaitForReply) {
      return {
        status: AgentTaskStatus.WaitingReply,
        statusReason: 'action_executed_waiting_reply',
      };
    }
    return {
      status: AgentTaskStatus.WaitingResult,
      statusReason: 'action_executed_waiting_result',
    };
  }

  return {
    status: AgentTaskStatus.WaitingResult,
    statusReason: readErrorText(call.error?.message) ?? call.status,
    error: call.error,
  };
}
