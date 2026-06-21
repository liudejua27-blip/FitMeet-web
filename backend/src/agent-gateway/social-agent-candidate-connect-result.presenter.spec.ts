import type { SocialAgentToolCallRecord } from './social-agent-tool.types';
import { buildSocialAgentCandidateConnectResult } from './social-agent-candidate-connect-result.presenter';

function toolCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'action_add_friend_1',
    toolName: 'add_friend',
    status: 'succeeded',
    input: {},
    output: {},
    error: null,
    startedAt: '2026-06-07T00:00:00.000Z',
    finishedAt: '2026-06-07T00:00:01.000Z',
    ...overrides,
  } as SocialAgentToolCallRecord;
}

describe('buildSocialAgentCandidateConnectResult', () => {
  it('normalizes a connected candidate result', () => {
    const friendAction = toolCall({
      output: {
        id: '601',
        friendRequestId: '601',
        conversationId: 'conv-22',
      },
    });

    expect(
      buildSocialAgentCandidateConnectResult({
        taskId: 101,
        targetUserId: 22,
        friendAction,
      }),
    ).toEqual({
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      success: true,
      status: 'connected',
      following: true,
      friendRequestId: '601',
      conversationId: 'conv-22',
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId: 22,
        candidateUserId: 22,
        following: true,
        conversationId: 'conv-22',
        friendRequestId: '601',
      },
      toolCall: friendAction,
    });
  });

  it('uses followId when friendRequestId is absent', () => {
    expect(
      buildSocialAgentCandidateConnectResult({
        taskId: 101,
        targetUserId: 22,
        friendAction: toolCall({
          output: { followId: 'follow-22', conversationId: 'conv-22' },
        }),
      }),
    ).toMatchObject({
      status: 'connected',
      friendRequestId: 'follow-22',
      conversationId: 'conv-22',
      friendAction: {
        friendRequestId: 'follow-22',
        conversationId: 'conv-22',
      },
    });
  });

  it('preserves pending approval state and approval id', () => {
    const friendAction = toolCall({
      output: {
        status: 'pending',
        requiresApproval: true,
        approvalId: '701',
      },
    });

    expect(
      buildSocialAgentCandidateConnectResult({
        taskId: 101,
        targetUserId: 22,
        friendAction,
      }),
    ).toEqual({
      taskId: 101,
      targetUserId: 22,
      candidateUserId: 22,
      success: true,
      status: 'pending_approval',
      following: false,
      friendRequestId: null,
      conversationId: null,
      approvalId: 701,
      requiresApproval: true,
      message: '加好友并聊天需要你确认',
      friendAction: {
        success: true,
        status: 'pending_approval',
        targetUserId: 22,
        candidateUserId: 22,
        following: false,
        conversationId: null,
        friendRequestId: null,
      },
      toolCall: friendAction,
    });
  });
});
