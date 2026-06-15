import { cleanDisplayText } from '../common/display-text.util';
import { readSocialAgentCardActionDraftCandidateValue } from './social-agent-card-action-draft-candidate.presenter';
import { buildRegeneratedCandidateMessageDraft } from './social-agent-candidate-message-regeneration.presenter';

const DEFAULT_CANDIDATE_MESSAGE_DRAFT =
  '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。';

export function buildSocialAgentCandidateMessageDraft(
  input: Parameters<typeof buildRegeneratedCandidateMessageDraft>[0],
): string {
  if (input.regenerate) {
    const regenerated = buildRegeneratedCandidateMessageDraft(input);
    if (regenerated) return regenerated;
  }

  const draftMessage = cleanDisplayText(
    input.cardActionDraft?.message ?? input.cardActionDraft?.suggestedOpener,
    '',
  ).trim();
  if (draftMessage) return draftMessage;

  const suggested = cleanDisplayText(
    input.candidates?.[0]?.suggestedMessage,
    '',
  ).trim();
  return suggested || DEFAULT_CANDIDATE_MESSAGE_DRAFT;
}
export function readSocialAgentCardActionDraftCandidate(
  draft: Record<string, unknown>,
) {
  return readSocialAgentCardActionDraftCandidateValue(draft);
}
