import { FITMEET_MATCH_SCORE_VERSION } from './social-agent-candidate-scoring';
import type { CandidatePoolCandidate } from './social-agent-candidate-pool.service';

export type CandidateRowSource = Pick<
  CandidatePoolCandidate,
  | 'matchScore'
  | 'level'
  | 'scoreBreakdown'
  | 'matchReasons'
  | 'commonTags'
  | 'risk'
  | 'suggestedOpener'
> &
  CandidateRowMetadataSource &
  Partial<Pick<CandidatePoolCandidate, 'source' | 'rankPosition'>>;

export type CandidateRowTarget = Pick<
  CandidatePoolCandidate,
  'candidateRecordId' | 'socialRequestId'
>;

export type CandidateRowMetadataSource = Partial<
  Pick<
    CandidatePoolCandidate,
    | 'candidateUserId'
    | 'publicIntentId'
    | 'activityId'
    | 'scoreVersion'
    | 'candidateExplanation'
    | 'preferenceHistorySignals'
    | 'recentPublicActivity'
    | 'recommendationConsent'
    | 'relationshipGoal'
    | 'idealType'
    | 'invitePolicy'
    | 'whyYouMayLike'
    | 'whyNow'
    | 'matchPoints'
    | 'boundaryNotes'
    | 'dynamicSignalReasons'
  >
> & {
  matchReasons?: string[];
};

export function candidateRowSourceId(
  candidate: CandidateRowMetadataSource,
): string {
  if (candidate.publicIntentId) return candidate.publicIntentId;
  if (candidate.activityId) return String(candidate.activityId);
  return candidate.candidateUserId ? String(candidate.candidateUserId) : '';
}

export function candidateRowExplanation(
  candidate: CandidateRowMetadataSource,
): Record<string, unknown> {
  return {
    scoreVersion: candidate.scoreVersion || FITMEET_MATCH_SCORE_VERSION,
    whyYouMayLike: candidate.whyYouMayLike,
    whyNow: candidate.whyNow,
    matchPoints: candidate.matchPoints,
    boundaryNotes: candidate.boundaryNotes,
    dynamicSignalReasons: candidate.dynamicSignalReasons,
    preferenceHistorySignals: candidate.preferenceHistorySignals,
    recentPublicActivity: candidate.recentPublicActivity,
    nextAction: candidate.candidateExplanation?.nextActionSuggestion,
  };
}

export function candidateRowRelationshipState(
  candidate: CandidateRowMetadataSource,
): Record<string, unknown> {
  return {
    relationshipGoal: candidate.relationshipGoal,
    idealType: candidate.idealType,
    invitePolicy: candidate.invitePolicy,
    recommendationConsent: candidate.recommendationConsent,
  };
}

export function candidateRowExposureReason(
  candidate: CandidateRowMetadataSource,
): string {
  const reason =
    candidate.preferenceHistorySignals?.[0] ||
    candidate.dynamicSignalReasons?.[0] ||
    candidate.matchReasons?.[0] ||
    candidate.whyYouMayLike ||
    '';
  return reason.slice(0, 120);
}
