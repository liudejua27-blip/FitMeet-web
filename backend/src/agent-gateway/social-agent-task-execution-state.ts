import { AgentTaskStatus } from './entities/agent-task.entity';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

export type SocialAgentTaskFailureState = {
  status: AgentTaskStatus.Failed;
  statusReason: string;
  error: Record<string, unknown> | null;
};

export type SocialAgentTaskCompletionState =
  | {
      status: AgentTaskStatus.WaitingReply;
      statusReason: 'waiting_for_counterpart_reply';
      completedAt: null;
    }
  | {
      status: AgentTaskStatus.Succeeded;
      completedAt: Date;
    };

export function socialAgentTaskFailureState(input: {
  call: SocialAgentToolCallRecord;
  readErrorText: (value: unknown) => string | undefined;
}): SocialAgentTaskFailureState {
  const { call, readErrorText } = input;
  return {
    status: AgentTaskStatus.Failed,
    statusReason:
      readErrorText(call.error?.message) ??
      readErrorText(call.error?.code) ??
      call.status,
    error: call.error,
  };
}

export function socialAgentTaskCompletionState(input: {
  shouldWaitForReply: boolean;
  completedAt?: Date;
}): SocialAgentTaskCompletionState {
  if (input.shouldWaitForReply) {
    return {
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'waiting_for_counterpart_reply',
      completedAt: null,
    };
  }
  return {
    status: AgentTaskStatus.Succeeded,
    completedAt: input.completedAt ?? new Date(),
  };
}
