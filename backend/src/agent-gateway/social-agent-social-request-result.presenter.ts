export type SocialAgentSocialRequestResult = Record<string, unknown> & {
  socialRequest: Record<string, unknown>;
  socialRequestId: unknown;
  publicIntent?: Record<string, unknown>;
  publicIntentId?: unknown;
  publicIntentStatus?: unknown;
  synced?: true;
};

export function buildSocialAgentSocialRequestResult(input: {
  request: Record<string, unknown>;
  publicIntent?: Record<string, unknown>;
  asRecord: (value: unknown) => Record<string, unknown>;
}): SocialAgentSocialRequestResult {
  const request = input.asRecord(input.request);
  const result: SocialAgentSocialRequestResult = {
    ...request,
    socialRequest: input.request,
    socialRequestId: input.request.id,
  };

  if (!input.publicIntent) return result;

  return {
    ...result,
    publicIntent: input.publicIntent,
    publicIntentId: input.publicIntent.id,
    publicIntentStatus: input.publicIntent.status,
    synced: true,
  };
}
