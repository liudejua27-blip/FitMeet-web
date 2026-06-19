import type { SocialAgentToolCallRecord } from './social-agent-tool.types';
import { buildSocialAgentDirectCandidateMessageResult } from './social-agent-direct-candidate-message-result.presenter';

function toolCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'action_send_message_1',
    toolName: 'send_message',
    status: 'succeeded',
    input: {},
    output: {},
    error: null,
    startedAt: '2026-06-07T00:00:00.000Z',
    finishedAt: '2026-06-07T00:00:01.000Z',
    ...overrides,
  } as SocialAgentToolCallRecord;
}

describe('buildSocialAgentDirectCandidateMessageResult', () => {
  it('normalizes a sent candidate message result', () => {
    const messageAction = toolCall({
      output: {
        id: 'msg-22',
        conversationId: 'conv-22',
        candidate: { status: 'messaged' },
      },
    });

    expect(
      buildSocialAgentDirectCandidateMessageResult({
        taskId: 101,
        targetUserId: 22,
        messageAction,
      }),
    ).toEqual({
      success: true,
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      status: 'sent',
      messageId: 'msg-22',
      conversationId: 'conv-22',
      approvalId: null,
      requiresApproval: undefined,
      message: undefined,
      candidateStatus: 'messaged',
      messageAction: {
        status: 'sent',
        conversationId: 'conv-22',
        messageId: 'msg-22',
      },
      toolCall: messageAction,
    });
  });

  it('preserves pending approval state and approval id', () => {
    const messageAction = toolCall({
      output: {
        status: 'pending',
        requiresApproval: true,
        approvalId: '501',
        candidate: { status: 'pending_approval' },
      },
    });

    expect(
      buildSocialAgentDirectCandidateMessageResult({
        taskId: 101,
        targetUserId: 22,
        messageAction,
      }),
    ).toMatchObject({
      success: true,
      status: 'pending_approval',
      approvalId: 501,
      requiresApproval: true,
      message: '发送消息需要你确认',
      candidateStatus: 'pending_approval',
      messageAction: {
        status: 'pending_approval',
        conversationId: null,
        messageId: null,
      },
    });
  });

  it('keeps failed tool-call results stable for callers', () => {
    expect(
      buildSocialAgentDirectCandidateMessageResult({
        taskId: 101,
        targetUserId: 22,
        messageAction: toolCall({ status: 'failed' }),
      }),
    ).toMatchObject({
      success: false,
      status: 'failed',
      messageId: null,
      conversationId: null,
      approvalId: null,
      candidateStatus: null,
      messageAction: {
        status: 'sent',
        conversationId: null,
        messageId: null,
      },
    });
  });
});
