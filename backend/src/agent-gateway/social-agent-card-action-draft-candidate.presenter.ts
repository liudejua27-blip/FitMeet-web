export function readSocialAgentCardActionDraftCandidateValue(
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const candidate = draft.candidate;
  return typeof candidate === 'object' &&
    candidate !== null &&
    !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : {};
}
