export type SocialAgentCandidateMessageActionResult = Record<
  string,
  unknown
> & {
  success: true;
  taskId: number;
  targetUserId: number;
  candidateUserId: number;
  messageId: string | null;
  conversationId: string | null;
  status: 'sent' | 'skipped';
  messageAction: {
    status: 'sent' | 'skipped';
    messageId: string | null;
    conversationId: string | null;
  };
};

export function buildSocialAgentCandidateMessageActionResult(input: {
  output: Record<string, unknown>;
  taskId: number;
  targetUserId: number;
  string: (value: unknown) => string | undefined;
}): SocialAgentCandidateMessageActionResult {
  const messageId =
    input.string(input.output.id ?? input.output.messageId) ?? null;
  const conversationId = input.string(input.output.conversationId) ?? null;
  const status = input.output.skipped ? 'skipped' : 'sent';
  return {
    ...input.output,
    success: true,
    taskId: input.taskId,
    targetUserId: input.targetUserId,
    candidateUserId: input.targetUserId,
    messageId,
    conversationId,
    status,
    messageAction: {
      status,
      messageId,
      conversationId,
    },
  };
}
