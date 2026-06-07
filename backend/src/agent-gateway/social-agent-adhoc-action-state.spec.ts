import { AgentTaskStatus } from './entities/agent-task.entity';
import {
  socialAgentAdhocActionCompletionState,
  socialAgentUnconfirmedAdhocActionState,
} from './social-agent-adhoc-action-state';
import { SocialAgentToolName } from './social-agent-tool.types';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

function call(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'action_send_message_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'succeeded',
    input: {},
    output: { ok: true },
    error: null,
    startedAt: '2026-06-07T00:00:00.000Z',
    completedAt: '2026-06-07T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  };
}

const readErrorText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

describe('social-agent-adhoc-action-state', () => {
  it('keeps successful adhoc action wait reasons stable', () => {
    expect(
      socialAgentAdhocActionCompletionState({
        call: call(),
        shouldWaitForReply: true,
        readErrorText,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'action_executed_waiting_reply',
    });

    expect(
      socialAgentAdhocActionCompletionState({
        call: call(),
        shouldWaitForReply: false,
        readErrorText,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingResult,
      statusReason: 'action_executed_waiting_result',
    });
  });

  it('uses error message then status for failed adhoc action reasons', () => {
    expect(
      socialAgentAdhocActionCompletionState({
        call: call({
          status: 'failed',
          output: null,
          error: { message: 'delivery failed', code: 'SEND_FAILED' },
        }),
        shouldWaitForReply: false,
        readErrorText,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingResult,
      statusReason: 'delivery failed',
      error: { message: 'delivery failed', code: 'SEND_FAILED' },
    });

    expect(
      socialAgentAdhocActionCompletionState({
        call: call({ status: 'blocked', output: null, error: null }),
        shouldWaitForReply: false,
        readErrorText,
      }).statusReason,
    ).toBe('blocked');
  });

  it('keeps unconfirmed dangerous actions waiting for approval', () => {
    expect(
      socialAgentUnconfirmedAdhocActionState({
        call: call({
          status: 'blocked',
          output: null,
          error: { message: 'approval required', code: 'APPROVAL_REQUIRED' },
        }),
        readErrorText,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingResult,
      statusReason: 'approval required',
      error: { message: 'approval required', code: 'APPROVAL_REQUIRED' },
    });

    expect(
      socialAgentUnconfirmedAdhocActionState({
        call: call({ status: 'blocked', output: null, error: null }),
        readErrorText,
      }).statusReason,
    ).toBe('approval_required');
  });
});
