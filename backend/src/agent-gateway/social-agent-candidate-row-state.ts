import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import type { CandidatePoolCandidate } from './social-agent-candidate-pool.service';

type CandidateRowSource = Pick<
  CandidatePoolCandidate,
  | 'matchScore'
  | 'level'
  | 'scoreBreakdown'
  | 'matchReasons'
  | 'commonTags'
  | 'risk'
  | 'suggestedOpener'
>;

type CandidateRowTarget = Pick<
  CandidatePoolCandidate,
  'candidateRecordId' | 'socialRequestId'
>;

export function applySocialAgentCandidateRowState(input: {
  row: SocialRequestCandidate;
  candidate: CandidateRowSource;
  existingStatus?: SocialRequestCandidateStatus | null;
}): SocialRequestCandidate {
  const { candidate, existingStatus, row } = input;
  row.score = candidate.matchScore;
  row.level = candidate.level;
  row.scoreBreakdown = candidate.scoreBreakdown;
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
