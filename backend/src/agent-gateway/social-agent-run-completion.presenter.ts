import { FitMeetAgentRunStatus } from './entities/fitmeet-agent-runtime.entity';
import type { SocialAgentChatRunResult } from './social-agent-chat.types';

export type SocialAgentRunCompletionSnapshot = {
  status: FitMeetAgentRunStatus;
  resultPayload: {
    taskId: number;
    candidateCount: number;
    approvalRequiredCount: number;
  };
};

export function buildSocialAgentRunCompletionSnapshot(
  result: SocialAgentChatRunResult,
  taskId = result.taskId,
): SocialAgentRunCompletionSnapshot {
  const candidateCount = result.candidates.length;
  const approvalRequiredCount = result.approvalRequiredActions.length;

  return {
    status:
      approvalRequiredCount > 0 || candidateCount > 0
        ? FitMeetAgentRunStatus.WaitingConfirmation
        : FitMeetAgentRunStatus.Completed,
    resultPayload: {
      taskId,
      candidateCount,
      approvalRequiredCount,
    },
  };
}
