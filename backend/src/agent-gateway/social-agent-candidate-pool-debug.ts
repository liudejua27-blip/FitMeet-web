import type { CandidateProfileDataQuality } from './social-agent-candidate-profile-presenter';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

export type CandidatePoolDebugReasons = {
  usersTotal: number;
  socialProfilesTotal: number;
  publicIntentsTotal: number;
  eligibleProfiles: number;
  eligiblePublicIntents: number;
  eligibleActivities: number;
  filteredBySelf: number;
  filteredByBlocked: number;
  filteredByCity: number;
  filteredByBoundary: number;
  scoreBelowThreshold: number;
};

export type CandidatePoolCounts = {
  users: number;
  socialProfiles: number;
  aiDelegateProfiles: number;
  publicSocialIntents: number;
  socialRequests: number;
  socialActivities: number;
};

export type CandidatePoolFiltered = {
  self: number;
  blocked: number;
  cityMismatch: number;
  boundaryMismatch: number;
  scoreBelowThreshold: number;
};

export type CandidatePoolDebugCandidate = {
  source: 'profile_candidate' | 'public_intent' | 'activity';
  isRealData: true;
  targetUserId: number;
  candidateUserId: number;
  userId: number;
  publicIntentId: string | null;
  socialRequestId: number | null;
  activityId: number | null;
  displayName: string;
  city: string;
  interestTags: string[];
  profileCompleteness: number;
  dataQuality: CandidateProfileDataQuality;
  matchScore: number;
  matchReasons: string[];
  riskWarnings: string[];
  suggestedOpener: string;
};

export type CandidatePoolDebugSnapshot = {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  counts: CandidatePoolCounts;
  eligible: {
    profileCandidates: number;
    publicIntentCandidates: number;
    activityCandidates: number;
  };
  filtered: CandidatePoolFiltered;
  finalCandidates: CandidatePoolDebugCandidate[];
};

export function emptyCandidatePoolFiltered(): CandidatePoolFiltered {
  return {
    self: 0,
    blocked: 0,
    cityMismatch: 0,
    boundaryMismatch: 0,
    scoreBelowThreshold: 0,
  };
}

export function buildCandidatePoolDebugSnapshot(input: {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  counts: CandidatePoolCounts;
  filtered: CandidatePoolFiltered;
  profileCandidates: number;
  publicIntentCandidates: number;
  activityCandidates: number;
  finalCandidates: CandidatePoolDebugCandidate[];
}): CandidatePoolDebugSnapshot {
  return {
    ownerUserId: input.ownerUserId,
    query: input.query,
    counts: input.counts,
    eligible: {
      profileCandidates: input.profileCandidates,
      publicIntentCandidates: input.publicIntentCandidates,
      activityCandidates: input.activityCandidates,
    },
    filtered: input.filtered,
    finalCandidates: input.finalCandidates.map((candidate) => ({
      source: candidate.source,
      isRealData: candidate.isRealData,
      targetUserId: candidate.targetUserId,
      candidateUserId: candidate.candidateUserId,
      userId: candidate.userId,
      publicIntentId: candidate.publicIntentId,
      socialRequestId: candidate.socialRequestId,
      activityId: candidate.activityId,
      displayName: candidate.displayName,
      city: candidate.city,
      interestTags: candidate.interestTags,
      profileCompleteness: candidate.profileCompleteness,
      dataQuality: candidate.dataQuality,
      matchScore: candidate.matchScore,
      matchReasons: candidate.matchReasons,
      riskWarnings: candidate.riskWarnings,
      suggestedOpener: candidate.suggestedOpener,
    })),
  };
}

export function toCandidatePoolDebugReasons(
  debug: CandidatePoolDebugSnapshot,
): CandidatePoolDebugReasons {
  return {
    usersTotal: debug.counts.users,
    socialProfilesTotal: debug.counts.socialProfiles,
    publicIntentsTotal: debug.counts.publicSocialIntents,
    eligibleProfiles: debug.eligible.profileCandidates,
    eligiblePublicIntents: debug.eligible.publicIntentCandidates,
    eligibleActivities: debug.eligible.activityCandidates,
    filteredBySelf: debug.filtered.self,
    filteredByBlocked: debug.filtered.blocked,
    filteredByCity: debug.filtered.cityMismatch,
    filteredByBoundary: debug.filtered.boundaryMismatch,
    scoreBelowThreshold: debug.filtered.scoreBelowThreshold,
  };
}
