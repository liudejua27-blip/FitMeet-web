import { AgentTaskStatus } from './entities/agent-task.entity';
import {
  socialAgentTaskCompletionState,
  socialAgentTaskFailureState,
} from './social-agent-task-execution-state';
import { SocialAgentToolName } from './social-agent-tool.types';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

function call(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'step_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'failed',
    input: {},
    output: null,
    error: { code: 'SEND_FAILED', message: 'send failed' },
    startedAt: '2026-06-07T00:00:00.000Z',
    completedAt: '2026-06-07T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  };
}

const readErrorText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

describe('social-agent-task-execution-state', () => {
  it('uses error message, code, then call status for failure reasons', () => {
    expect(
      socialAgentTaskFailureState({ call: call(), readErrorText }),
    ).toEqual({
      status: AgentTaskStatus.Failed,
      statusReason: 'send failed',
      error: { code: 'SEND_FAILED', message: 'send failed' },
    });

    expect(
      socialAgentTaskFailureState({
        call: call({ error: { code: 'SEND_FAILED' } }),
        readErrorText,
      }).statusReason,
    ).toBe('SEND_FAILED');

    expect(
      socialAgentTaskFailureState({
        call: call({ status: 'blocked', error: null }),
        readErrorText,
      }).statusReason,
    ).toBe('blocked');
  });

  it('keeps waiting-for-reply completion state stable', () => {
    expect(
      socialAgentTaskCompletionState({ shouldWaitForReply: true }),
    ).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'waiting_for_counterpart_reply',
      completedAt: null,
    });
  });

  it('keeps succeeded completion state from adding a status reason', () => {
    const completedAt = new Date('2026-06-07T01:00:00.000Z');

    expect(
      socialAgentTaskCompletionState({
        shouldWaitForReply: false,
        completedAt,
      }),
    ).toEqual({
      status: AgentTaskStatus.Succeeded,
      completedAt,
    });
  });
});
