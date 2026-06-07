import { AgentTaskStatus } from './entities/agent-task.entity';
import {
  socialAgentRunNextActionState,
  socialAgentRunNextDecisionState,
  socialAgentRunNextReadReplyState,
  socialAgentRunNextSummaryFailedState,
} from './social-agent-run-next-state';

describe('social-agent-run-next-state', () => {
  it('keeps read-reply wait reasons stable for polling clients', () => {
    expect(
      socialAgentRunNextReadReplyState({
        readCallStatus: 'succeeded',
        newMessageCount: 0,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'no_new_reply',
    });

    expect(
      socialAgentRunNextReadReplyState({
        readCallStatus: 'failed',
        newMessageCount: 1,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'reply_read_failed',
    });
  });

  it('keeps summary and decision wait reasons stable', () => {
    expect(socialAgentRunNextSummaryFailedState()).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'reply_summary_failed',
    });

    expect(
      socialAgentRunNextDecisionState({
        nextAction: 'stop',
        hasExecutableTool: false,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'next_action_stop',
    });

    expect(
      socialAgentRunNextDecisionState({
        nextAction: 'reply',
        hasExecutableTool: false,
      }),
    ).toEqual({
      status: AgentTaskStatus.WaitingReply,
      statusReason: 'next_action_not_executable',
    });

    expect(
      socialAgentRunNextDecisionState({
        nextAction: 'reply',
        hasExecutableTool: true,
      }),
    ).toBeNull();
  });

  it('maps next action execution result to the next pollable task state', () => {
    expect(socialAgentRunNextActionState({ actionStatus: 'succeeded' })).toEqual(
      {
        status: AgentTaskStatus.WaitingReply,
        statusReason: 'next_action_executed_waiting_reply',
      },
    );

    expect(socialAgentRunNextActionState({ actionStatus: 'blocked' })).toEqual({
      status: AgentTaskStatus.WaitingResult,
      statusReason: 'next_action_needs_attention',
    });
  });
});
