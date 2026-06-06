import { summarizeSocialAgentToolCalls } from './social-agent-tool-execution-summary';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';
import { SocialAgentToolName } from './social-agent-tool.types';

function call(
  status: SocialAgentToolCallRecord['status'],
): SocialAgentToolCallRecord {
  return {
    id: `call_${status}`,
    stepId: `step_${status}`,
    toolName: SocialAgentToolName.GetMyProfile,
    status,
    input: {},
    output: status === 'succeeded' ? { ok: true } : null,
    error: status === 'succeeded' ? null : { message: status },
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:00:00.010Z',
    durationMs: 10,
  };
}

describe('summarizeSocialAgentToolCalls', () => {
  it('counts succeeded, failed, and blocked tool calls for task execution results', () => {
    expect(
      summarizeSocialAgentToolCalls([
        call('succeeded'),
        call('failed'),
        call('blocked'),
        call('succeeded'),
      ]),
    ).toEqual({
      executedSteps: 4,
      succeededSteps: 2,
      failedSteps: 1,
      blockedSteps: 1,
      hasFailureOrBlock: true,
    });
  });

  it('marks all-success call sets as safe for final task completion', () => {
    expect(summarizeSocialAgentToolCalls([call('succeeded')])).toMatchObject({
      executedSteps: 1,
      succeededSteps: 1,
      failedSteps: 0,
      blockedSteps: 0,
      hasFailureOrBlock: false,
    });
  });
});
