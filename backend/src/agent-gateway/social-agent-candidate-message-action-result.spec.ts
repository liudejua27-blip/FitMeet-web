import { buildSocialAgentCandidateMessageActionResult } from './social-agent-candidate-message-action-result';

const string = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined;

describe('buildSocialAgentCandidateMessageActionResult', () => {
  it('normalizes a sent candidate message action for Web/iOS clients', () => {
    const result = buildSocialAgentCandidateMessageActionResult({
      output: {
        id: 'msg_1',
        conversationId: 'conv_1',
        body: '周末一起跑步吗？',
      },
      taskId: 100,
      targetUserId: 22,
      string,
    });

    expect(result).toMatchObject({
      id: 'msg_1',
      conversationId: 'conv_1',
      success: true,
      taskId: 100,
      targetUserId: 22,
      candidateUserId: 22,
      messageId: 'msg_1',
      status: 'sent',
      messageAction: {
        status: 'sent',
        messageId: 'msg_1',
        conversationId: 'conv_1',
      },
    });
  });

  it('uses messageId when id is absent', () => {
    const result = buildSocialAgentCandidateMessageActionResult({
      output: {
        messageId: 'msg_2',
        conversationId: 'conv_2',
      },
      taskId: 101,
      targetUserId: 23,
      string,
    });

    expect(result.messageId).toBe('msg_2');
    expect(result.messageAction.messageId).toBe('msg_2');
  });

  it('preserves skipped status and null ids', () => {
    const result = buildSocialAgentCandidateMessageActionResult({
      output: { skipped: true, reason: 'duplicate_message' },
      taskId: 102,
      targetUserId: 24,
      string,
    });

    expect(result).toMatchObject({
      success: true,
      taskId: 102,
      targetUserId: 24,
      candidateUserId: 24,
      messageId: null,
      conversationId: null,
      status: 'skipped',
      messageAction: {
        status: 'skipped',
        messageId: null,
        conversationId: null,
      },
    });
  });
});
