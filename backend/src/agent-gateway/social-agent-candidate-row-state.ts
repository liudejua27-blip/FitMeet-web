import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import {
  FITMEET_MATCH_SCORE_VERSION,
  candidateClampScore,
  candidateMatchLevel,
} from './social-agent-candidate-scoring';
import {
  type CandidateRowSource,
  type CandidateRowTarget,
  candidateRowExposureReason,
  candidateRowExplanation,
  candidateRowRelationshipState,
  candidateRowSourceId,
} from './social-agent-candidate-row-metadata';

export function applySocialAgentCandidateRowState(input: {
  row: SocialRequestCandidate;
  candidate: CandidateRowSource;
  existingStatus?: SocialRequestCandidateStatus | null;
}): SocialRequestCandidate {
  const { candidate, existingStatus, row } = input;
  const score = candidateClampScore(candidate.matchScore);
  row.score = score;
  row.level = candidateMatchLevel(score);
  row.scoreBreakdown = candidate.scoreBreakdown;
  row.sourceType = candidate.source ?? 'profile_candidate';
  row.sourceId = candidateRowSourceId(candidate);
  row.publicIntentId = candidate.publicIntentId ?? null;
  row.activityId = candidate.activityId ?? null;
  row.rankPosition = candidate.rankPosition ?? null;
  row.scoreVersion = candidate.scoreVersion || FITMEET_MATCH_SCORE_VERSION;
  row.explanation = candidateRowExplanation(candidate);
  row.relationshipState = candidateRowRelationshipState(candidate);
  row.exposureReason = candidateRowExposureReason(candidate);
  row.reasons = candidate.matchReasons;
  row.commonTags = candidate.commonTags;
  row.distanceKm = null;
  row.riskLevel = candidate.risk.level;
  row.riskWarnings = candidate.risk.warnings;
  row.suggestedMessage = candidate.suggestedOpener;
  row.status = existingStatus ?? SocialRequestCandidateStatus.Suggested;
  return row;
}

export function applySavedSocialAgentCandidateRow(input: {
  candidate: CandidateRowTarget;
  saved: Pick<SocialRequestCandidate, 'id'>;
  socialRequestId: number;
}): void {
  input.candidate.candidateRecordId = input.saved.id;
  input.candidate.socialRequestId = input.socialRequestId;
}
