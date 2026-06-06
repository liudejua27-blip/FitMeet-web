import type { CandidatePoolCandidate } from './social-agent-candidate-pool.service';
import { uniqueCandidatePoolStrings } from './social-agent-candidate-pool-query';

export function mergeSocialAgentCandidatePool(
  candidates: CandidatePoolCandidate[],
): CandidatePoolCandidate[] {
  const byUser = new Map<number, CandidatePoolCandidate>();
  for (const candidate of candidates) {
    const existing = byUser.get(candidate.candidateUserId);
    if (!existing) {
      byUser.set(candidate.candidateUserId, candidate);
      continue;
    }

    const mergedReasons = uniqueCandidatePoolStrings([
      ...existing.matchReasons,
      ...candidate.matchReasons,
    ]).slice(0, 6);
    const mergedTags = uniqueCandidatePoolStrings([
      ...existing.interestTags,
      ...candidate.interestTags,
    ]);
    const winner =
      candidate.matchScore > existing.matchScore ? candidate : existing;
    byUser.set(candidate.candidateUserId, {
      ...winner,
      publicIntentId:
        winner.publicIntentId ??
        existing.publicIntentId ??
        candidate.publicIntentId,
      socialRequestId:
        winner.socialRequestId ??
        existing.socialRequestId ??
        candidate.socialRequestId,
      matchReasons: mergedReasons,
      reasons: mergedReasons,
      interestTags: mergedTags,
      commonTags: uniqueCandidatePoolStrings([
        ...existing.commonTags,
        ...candidate.commonTags,
      ]),
    });
  }
  return [...byUser.values()].sort((a, b) => b.matchScore - a.matchScore);
}
