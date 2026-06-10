import type { SocialAgentToolCallRecord } from './social-agent-tool.types';
import { buildSocialAgentConfirmedCandidateMessageState } from './social-agent-confirmed-candidate-message.presenter';

function toolCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'action_send_candidate_message_1',
    toolName: 'send_message_to_candidate',
    status: 'succeeded',
    input: {},
    output: {},
    error: null,
    startedAt: '2026-06-07T00:00:00.000Z',
    finishedAt: '2026-06-07T00:00:01.000Z',
    ...overrides,
  } as SocialAgentToolCallRecord;
}

describe('buildSocialAgentConfirmedCandidateMessageState', () => {
  it('builds candidate action memory and confirmation copy from tool output', () => {
    expect(
      buildSocialAgentConfirmedCandidateMessageState({
        action: toolCall({
          output: { id: 'msg-1', conversationId: 'conv-1' },
        }),
        targetUserId: 22,
        candidate: { nickname: '小林' },
        text: '今晚先在青岛大学操场轻松跑一段吗？',
        candidateRecordId: 501,
        socialRequestId: 301,
      }),
    ).toMatchObject({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      candidateActionPatch: {
        send: 'sent',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        candidateRecordId: 501,
        socialRequestId: 301,
        toolCallId: 'action_send_candidate_message_1',
      },
      transitionPatch: {
        objective: 'candidate_messaging',
        nextStep: '等待候选人回复',
        waitingFor: 'candidate_reply',
        lastCompletedStep: 'message_sent',
      },
      assistantMessage: '已确认发送给小林：今晚先在青岛大学操场轻松跑一段吗？',
    });
  });

  it('uses messageId and displayName fallbacks', () => {
    expect(
      buildSocialAgentConfirmedCandidateMessageState({
        action: toolCall({
          output: { messageId: 'msg-2', conversationId: 'conv-2' },
        }),
        targetUserId: 23,
        candidate: { displayName: 'Alex' },
        text: 'hello',
        candidateRecordId: null,
        socialRequestId: null,
      }),
    ).toMatchObject({
      messageId: 'msg-2',
      conversationId: 'conv-2',
      assistantMessage: '已确认发送给Alex：hello',
    });
  });

  it('falls back to a user id label when candidate has no display name', () => {
    expect(
      buildSocialAgentConfirmedCandidateMessageState({
        action: toolCall(),
        targetUserId: 24,
        candidate: {},
        text: 'hello',
        candidateRecordId: null,
        socialRequestId: null,
      }),
    ).toMatchObject({
      messageId: null,
      conversationId: null,
      assistantMessage: '已确认发送给用户 #24：hello',
    });
  });
});
