import { cleanDisplayText } from '../common/display-text.util';

const DEFAULT_CANDIDATE_MESSAGE_DRAFT =
  '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。';

export function buildSocialAgentCandidateMessageDraft(input: {
  cardActionDraft?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown> | undefined>;
}): string {
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
): Record<string, unknown> {
  return isRecord(draft.candidate) ? draft.candidate : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
