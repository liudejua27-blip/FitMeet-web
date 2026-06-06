import type {
  SocialAgentTaskExecutionResult,
  SocialAgentToolCallRecord,
} from './social-agent-tool.types';

export type SocialAgentToolExecutionSummary = Pick<
  SocialAgentTaskExecutionResult,
  'executedSteps' | 'succeededSteps' | 'failedSteps' | 'blockedSteps'
> & {
  hasFailureOrBlock: boolean;
};

export function summarizeSocialAgentToolCalls(
  calls: SocialAgentToolCallRecord[],
): SocialAgentToolExecutionSummary {
  let succeededSteps = 0;
  let failedSteps = 0;
  let blockedSteps = 0;

  for (const call of calls) {
    if (call.status === 'succeeded') succeededSteps += 1;
    if (call.status === 'failed') failedSteps += 1;
    if (call.status === 'blocked') blockedSteps += 1;
  }

  return {
    executedSteps: calls.length,
    succeededSteps,
    failedSteps,
    blockedSteps,
    hasFailureOrBlock: failedSteps + blockedSteps > 0,
  };
}
