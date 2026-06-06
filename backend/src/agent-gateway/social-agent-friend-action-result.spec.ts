import { buildSocialAgentFriendActionResult } from './social-agent-friend-action-result';

describe('buildSocialAgentFriendActionResult', () => {
  it('builds a connected friend result without opening a conversation', () => {
    expect(
      buildSocialAgentFriendActionResult({
        friendRecord: { id: 33, followId: 44 },
        taskId: 100,
        targetUserId: 2,
        friendRequestId: '44',
      }),
    ).toEqual({
      id: 33,
      followId: 44,
      success: true,
      taskId: 100,
      targetUserId: 2,
      candidateUserId: 2,
      friendRequestId: '44',
      conversationId: null,
      status: 'connected',
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId: 2,
        candidateUserId: 2,
        following: true,
        conversationId: null,
        friendRequestId: '44',
      },
    });
  });

  it('uses the opened conversation id in both top-level and nested action payloads', () => {
    const payload = buildSocialAgentFriendActionResult({
      friendRecord: { id: 33 },
      taskId: 100,
      targetUserId: 2,
      friendRequestId: '33',
      conversationId: 'conv_1',
    });

    expect(payload.conversationId).toBe('conv_1');
    expect(payload.friendAction.conversationId).toBe('conv_1');
  });

  it('preserves a null friend request id consistently', () => {
    const payload = buildSocialAgentFriendActionResult({
      friendRecord: {},
      taskId: 100,
      targetUserId: 2,
      friendRequestId: null,
      conversationId: null,
    });

    expect(payload.friendRequestId).toBeNull();
    expect(payload.friendAction.friendRequestId).toBeNull();
  });
});
