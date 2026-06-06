export type SocialAgentFriendActionResultInput = {
  friendRecord: Record<string, unknown>;
  taskId: number;
  targetUserId: number;
  friendRequestId: string | null;
  conversationId?: string | null;
};

export type SocialAgentFriendActionResult = Record<string, unknown> & {
  success: true;
  taskId: number;
  targetUserId: number;
  candidateUserId: number;
  friendRequestId: string | null;
  conversationId: string | null;
  status: 'connected';
  friendAction: {
    success: true;
    status: 'connected';
    targetUserId: number;
    candidateUserId: number;
    following: true;
    conversationId: string | null;
    friendRequestId: string | null;
  };
};

export function buildSocialAgentFriendActionResult(
  input: SocialAgentFriendActionResultInput,
): SocialAgentFriendActionResult {
  const conversationId = input.conversationId ?? null;

  return {
    ...input.friendRecord,
    success: true,
    taskId: input.taskId,
    targetUserId: input.targetUserId,
    candidateUserId: input.targetUserId,
    friendRequestId: input.friendRequestId,
    conversationId,
    status: 'connected',
    friendAction: {
      success: true,
      status: 'connected',
      targetUserId: input.targetUserId,
      candidateUserId: input.targetUserId,
      following: true,
      conversationId,
      friendRequestId: input.friendRequestId,
    },
  };
}
