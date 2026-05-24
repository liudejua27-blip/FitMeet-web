export function messageUrlWithSocialAgentReturn(
  conversationId: string,
  agentTaskId: number | null | undefined,
): string {
  const params = new URLSearchParams({
    conversationId,
    from: 'social-agent',
  });
  if (agentTaskId != null) params.set('agentTaskId', String(agentTaskId));
  return `/messages?${params.toString()}`;
}
