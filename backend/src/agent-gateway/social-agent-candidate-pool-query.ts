import { extractKnownCity, sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { AgentTask } from './entities/agent-task.entity';
import {
  extractCandidateActivity,
  extractCandidateTags,
  extractCandidateTime,
} from './social-agent-candidate-query-parser';

export type CandidatePoolIntent = 'social_search' | 'activity_search';

export type CandidatePoolQuery = {
  ownerUserId: number;
  intent?: CandidatePoolIntent;
  taskId?: number | null;
  socialRequestId?: number | null;
  city?: string | null;
  activityType?: string | null;
  interestTags?: string[] | null;
  timePreference?: string | null;
  locationPreference?: string | null;
  rawText?: string | null;
  acceptsStrangers?: boolean | null;
  limit?: number | null;
  persistCandidates?: boolean;
};

export type CandidatePoolResolvedQuery = {
  city: string;
  intent: CandidatePoolIntent;
  interestTags: string[];
  activityType: string;
  timePreference: string;
  locationPreference: string;
  socialRequestId: number | null;
  rawText: string;
  acceptsStrangers: boolean | null;
};

export function buildCandidatePoolResolvedQuery(input: {
  query: CandidatePoolQuery;
  socialRequestId: number | null;
  request?: UserSocialRequest | null;
  task?: AgentTask | null;
}): CandidatePoolResolvedQuery {
  const { query, request, task } = input;
  const inputCity = sanitizeCity(query.city);
  const inputActivityType = cleanDisplayText(query.activityType, '');
  const inputTimePreference = cleanDisplayText(query.timePreference, '');
  const inputLocationPreference = cleanDisplayText(
    query.locationPreference,
    '',
  );
  const rawText = cleanDisplayText(
    query.rawText ?? request?.rawText ?? request?.title ?? task?.goal,
    '',
  );
  const city = sanitizeCity(
    inputCity || request?.city || extractKnownCity(rawText),
  );
  const activityType = cleanDisplayText(
    inputActivityType ||
      request?.activityType ||
      extractCandidateActivity(rawText),
    '',
  );
  const interestTags = uniqueCandidatePoolStrings([
    ...(Array.isArray(query.interestTags) ? query.interestTags : []),
    ...(Array.isArray(request?.interestTags) ? request.interestTags : []),
    ...extractCandidateTags(rawText),
    activityType,
  ]);
  const timePreference = cleanDisplayText(
    inputTimePreference || extractCandidateTime(rawText),
    '',
  );
  const acceptsStrangers = resolveCandidatePoolStrangerPolicy({
    explicit: query.acceptsStrangers,
    rawText,
  });

  return {
    city,
    intent: query.intent ?? 'social_search',
    interestTags,
    activityType,
    timePreference,
    locationPreference: inputLocationPreference,
    socialRequestId: input.socialRequestId,
    rawText,
    acceptsStrangers,
  };
}

export function resolveCandidatePoolStrangerPolicy(input: {
  explicit?: boolean | null;
  rawText?: string | null;
}): boolean | null {
  if (typeof input.explicit === 'boolean') return input.explicit;
  const text = cleanDisplayText(input.rawText, '');
  if (!text) return null;
  if (
    /(不接受陌生人|不要陌生人|别推荐陌生人|不要推荐陌生人|只推荐熟人|只看熟人|只找熟人|不想认识陌生人)/i.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /(接受陌生人|可以接受陌生人|愿意认识陌生人|可以认识陌生人|可以推荐陌生人|愿意认识新朋友)/i.test(
      text,
    )
  ) {
    return true;
  }
  return null;
}

export function normalizeCandidatePoolArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueCandidatePoolStrings(value.map((item) => String(item)));
  }
  if (typeof value === 'string') {
    return uniqueCandidatePoolStrings(value.split(/[、,，;；|]/u));
  }
  return [];
}

export function uniqueCandidatePoolStrings(values: unknown[]): string[] {
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
