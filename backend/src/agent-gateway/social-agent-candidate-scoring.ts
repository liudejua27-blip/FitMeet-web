import { cleanDisplayText } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { CandidateMatchLevel } from '../match/social-request-candidate.entity';

export const FITMEET_MATCH_SCORE_VERSION = 'fitmeet_match_v1';

export function candidateCommonTags(
  queryTags: string[],
  candidateTags: string[],
): string[] {
  const normalizedCandidates = candidateTags.map((tag) => tag.toLowerCase());
  return uniqueStrings(
    queryTags.filter((tag) => {
      const normalized = tag.toLowerCase();
      return normalizedCandidates.some(
        (candidate) =>
          candidate === normalized ||
          candidate.includes(normalized) ||
          normalized.includes(candidate),
      );
    }),
  );
}

export function candidateCityMatches(
  queryCity: string,
  candidateCity: string,
): boolean {
  if (!queryCity) return true;
  if (!candidateCity) return false;
  return (
    sanitizeCity(candidateCity).includes(queryCity) ||
    queryCity.includes(sanitizeCity(candidateCity))
  );
}

export function candidateRecentScore(
  date: Date | null | undefined,
  max: number,
): number {
  if (!date) return 0;
  const days = (Date.now() - date.getTime()) / 86_400_000;
  if (days <= 7) return max;
  if (days <= 30) return Math.round(max * 0.7);
  if (days <= 90) return Math.round(max * 0.35);
  return 0;
}

export function candidateTotalScore(parts: Record<string, number>): number {
  return candidateClampScore(
    Object.values(parts).reduce((sum, value) => sum + value, 0),
  );
}

export function candidateClampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function candidateMatchLevel(score: number): CandidateMatchLevel {
  if (score >= 75) return CandidateMatchLevel.High;
  if (score >= 45) return CandidateMatchLevel.Medium;
  return CandidateMatchLevel.Low;
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = cleanDisplayText(value, '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
