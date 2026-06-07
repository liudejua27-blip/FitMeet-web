import type { SocialActivity } from '../activities/entities/activity.entity';
import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import type { CandidateExplanation } from './candidate-explanation.service';
import type { PublicSocialIntent } from './entities/public-social-intent.entity';
import { extractCandidateTags } from './social-agent-candidate-query-parser';
import {
  candidateCityMatches,
  candidateClampScore,
  candidateCommonTags,
  candidateRecentScore,
} from './social-agent-candidate-scoring';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import {
  normalizeCandidatePoolArray,
  uniqueCandidatePoolStrings,
} from './social-agent-candidate-pool-query';

export type CandidatePoolSource =
  | 'profile_candidate'
  | 'public_intent'
  | 'activity';

export type CandidatePoolActivityResult = {
  id: string;
  source: CandidatePoolSource;
  isRealData: true;
  targetUserId: number | null;
  candidateUserId: number | null;
  userId: number | null;
  activityId: number | null;
  publicIntentId: string | null;
  title: string;
  description: string;
  city: string;
  loc: string;
  requestType: string;
  interestTags: string[];
  timePreference: string;
  ownerUserId: number | null;
  status: string;
  createdAt: string | null;
  matchScore: number;
  matchReasons: string[];
  candidateExplanation?: CandidateExplanation;
};

export type CandidatePoolActivityExplanationInput = {
  title: string;
  city: string;
  tags: string[];
  query: CandidatePoolResolvedQuery;
  matchScore: number;
  matchReasons: string[];
};

type ActivityLike = Pick<
  SocialActivity,
  | 'id'
  | 'creatorId'
  | 'type'
  | 'title'
  | 'description'
  | 'locationName'
  | 'city'
  | 'startTime'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

type PublicIntentLike = Pick<
  PublicSocialIntent,
  | 'id'
  | 'userId'
  | 'requestType'
  | 'title'
  | 'description'
  | 'interestTags'
  | 'city'
  | 'loc'
  | 'timePreference'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

export function buildCandidatePoolActivityResult(input: {
  activity: ActivityLike;
  query: CandidatePoolResolvedQuery;
  explain: (
    input: CandidatePoolActivityExplanationInput,
  ) => CandidateExplanation;
}): CandidatePoolActivityResult {
  const { activity, explain, query } = input;
  const tags = uniqueCandidatePoolStrings([
    String(activity.type),
    ...extractCandidateTags(`${activity.title} ${activity.description}`),
  ]);
  const match = buildCandidatePoolActivityMatch(query, activity.city, tags, {
    updatedAt: activity.updatedAt,
  });
  const title = cleanDisplayText(activity.title, '真实活动');
  const city = sanitizeCity(activity.city);

  return {
    id: String(activity.id),
    source: 'activity',
    isRealData: true,
    targetUserId: activity.creatorId ?? null,
    candidateUserId: activity.creatorId ?? null,
    userId: activity.creatorId ?? null,
    activityId: activity.id,
    publicIntentId: null,
    title,
    description: cleanDisplayText(activity.description, ''),
    city,
    loc: cleanDisplayText(activity.locationName, ''),
    requestType: String(activity.type),
    interestTags: tags,
    timePreference: activity.startTime ? activity.startTime.toISOString() : '',
    ownerUserId: activity.creatorId,
    status: activity.status,
    createdAt: activity.createdAt ? activity.createdAt.toISOString() : null,
    matchScore: match.matchScore,
    matchReasons: match.matchReasons,
    candidateExplanation: explain({
      title: cleanDisplayText(activity.title, '活动'),
      city,
      tags,
      query,
      matchScore: match.matchScore,
      matchReasons: match.matchReasons,
    }),
  };
}

export function buildCandidatePoolPublicIntentActivityResult(input: {
  intent: PublicIntentLike;
  query: CandidatePoolResolvedQuery;
  explain: (
    input: CandidatePoolActivityExplanationInput,
  ) => CandidateExplanation;
}): CandidatePoolActivityResult {
  const { explain, intent, query } = input;
  const tags = uniqueCandidatePoolStrings([
    ...normalizeCandidatePoolArray(intent.interestTags),
    intent.requestType,
    ...extractCandidateTags(`${intent.title} ${intent.description}`),
  ]);
  const match = buildCandidatePoolActivityMatch(query, intent.city, tags, {
    updatedAt: intent.updatedAt,
  });
  const title = cleanDisplayText(intent.title, '公开约练卡片');
  const city = sanitizeCity(intent.city);

  return {
    id: intent.id,
    source: 'public_intent',
    isRealData: true,
    targetUserId: intent.userId ?? null,
    candidateUserId: intent.userId ?? null,
    userId: intent.userId ?? null,
    activityId: null,
    publicIntentId: intent.id,
    title,
    description: cleanDisplayText(intent.description, ''),
    city,
    loc: cleanDisplayText(intent.loc, ''),
    requestType: cleanDisplayText(intent.requestType, ''),
    interestTags: tags,
    timePreference: cleanDisplayText(intent.timePreference, ''),
    ownerUserId: intent.userId ?? null,
    status: intent.status,
    createdAt: intent.createdAt ? intent.createdAt.toISOString() : null,
    matchScore: match.matchScore,
    matchReasons: match.matchReasons,
    candidateExplanation: explain({
      title,
      city,
      tags,
      query,
      matchScore: match.matchScore,
      matchReasons: match.matchReasons,
    }),
  };
}

export function buildCandidatePoolActivityReasons(
  query: CandidatePoolResolvedQuery,
  city: string,
  commonTags: string[],
): string[] {
  const reasons = ['来自真实活动或公开约练卡片。'];
  if (candidateCityMatches(query.city, city)) {
    reasons.push(`城市匹配：${city}。`);
  }
  if (commonTags.length) {
    reasons.push(`标签匹配：${commonTags.slice(0, 3).join('、')}。`);
  }
  return reasons;
}

function buildCandidatePoolActivityMatch(
  query: CandidatePoolResolvedQuery,
  city: string,
  tags: string[],
  input: { updatedAt: Date | null },
): { matchScore: number; matchReasons: string[] } {
  const commonTags = candidateCommonTags(query.interestTags, tags);
  const cityScore = candidateCityMatches(query.city, city) ? 35 : 0;
  const tagScore = Math.min(35, commonTags.length * 15);
  const typeScore =
    query.activityType && tags.includes(query.activityType) ? 15 : 0;
  const recentScore = candidateRecentScore(input.updatedAt, 15);
  return {
    matchScore: candidateClampScore(
      cityScore + tagScore + typeScore + recentScore,
    ),
    matchReasons: buildCandidatePoolActivityReasons(query, city, commonTags),
  };
}
