import { CreateSocialRequestDto } from './dto/agent-gateway.dto';
import { UserPreference } from './entities/user-preference.entity';
import { User } from '../users/user.entity';
import {
  buildPublicSocialCandidateReason,
  extractPublicRequestKeywords,
} from './public-social-intent.helpers';

type PublicSocialCandidateInput = {
  users: User[];
  preferencesByUserId: Map<number, UserPreference>;
  dto: CreateSocialRequestDto;
  ownerLat: number | null;
  ownerLng: number | null;
  radiusKm: number;
  city: string;
  nowMs?: number;
};

export type PublicSocialCandidateCard = {
  profile: {
    id: number;
    name: string;
    avatar: string;
    color: string;
    age: number;
    city: string;
    bio: string;
    verified: boolean;
    interestTags: string[];
    distanceKm: number | null;
  };
  score: number;
  reasonTags: string[];
  reasonText: string;
  nextAction: 'draft_invitation';
};

export function buildPublicSocialCandidates({
  users,
  preferencesByUserId,
  dto,
  ownerLat,
  ownerLng,
  radiusKm,
  city,
  nowMs = Date.now(),
}: PublicSocialCandidateInput): PublicSocialCandidateCard[] {
  const haveOrigin =
    typeof ownerLat === 'number' && typeof ownerLng === 'number';
  const timeTokens = parsePublicSocialTimeWindow(dto.timePreference);
  const desiredTags = new Set(
    [
      dto.requestType,
      ...(dto.interests ?? []),
      ...extractPublicRequestKeywords(dto.description),
    ]
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  const staleMs = 7 * 24 * 60 * 60 * 1000;

  return users
    .map((user) => {
      if (isInternalFixtureUser(user)) return null;

      const pref = preferencesByUserId.get(user.id);
      if (pref && pref.acceptAgentMessages === false) return null;

      let distanceKm: number | null = null;
      if (
        haveOrigin &&
        typeof user.lat === 'number' &&
        typeof user.lng === 'number'
      ) {
        distanceKm = haversineKm(ownerLat, ownerLng, user.lat, user.lng);
        if (distanceKm > radiusKm) return null;
      }

      const userTags = (user.interestTags ?? []).map((tag) =>
        tag.toLowerCase(),
      );
      const overlap = userTags.filter((tag) => desiredTags.has(tag));

      let score = 45;
      const reasonTags: string[] = [];

      if (distanceKm != null) {
        const decay = Math.max(0, 1 - distanceKm / radiusKm);
        score += Math.round(decay * 30);
        reasonTags.push(`within_${radiusKm}km`);
      } else if (city && user.city === city) {
        score += 15;
        reasonTags.push('same_city');
      }

      if (user.verified) {
        score += 10;
        reasonTags.push('verified');
      }
      score += Math.min(overlap.length * 10, 25);
      overlap.forEach((tag) => reasonTags.push(`interest_${tag}`));
      if (user.bio) score += 5;

      if (haveOrigin) {
        const fixAge = user.locationUpdatedAt
          ? nowMs - new Date(user.locationUpdatedAt).getTime()
          : Infinity;
        if (fixAge > staleMs) {
          score -= 10;
          reasonTags.push('stale_location');
        }
      }

      if (timeTokens.length) {
        const haystack =
          `${user.bio ?? ''} ${userTags.join(' ')}`.toLowerCase();
        const matchedWindow = timeTokens.find((token) =>
          haystack.includes(token),
        );
        if (matchedWindow) {
          score += 5;
          reasonTags.push(`time_${matchedWindow}`);
        }
      }

      return {
        profile: {
          id: user.id,
          name: publicProfileText(user.name, 'FitMeet 用户'),
          avatar: publicProfileText(user.avatar, ''),
          color: user.color,
          age: user.age,
          city: publicProfileText(user.city, ''),
          bio: publicProfileText(
            user.bio,
            '这位用户正在寻找同频的运动社交伙伴。',
          ),
          verified: user.verified,
          interestTags: (user.interestTags ?? [])
            .map((tag) => publicProfileText(tag, ''))
            .filter(Boolean),
          distanceKm:
            distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
        },
        score: Math.min(Math.max(score, 0), 98),
        reasonTags,
        reasonText: buildPublicSocialCandidateReason(
          user,
          dto,
          overlap,
          distanceKm,
        ),
        nextAction: 'draft_invitation' as const,
      };
    })
    .filter((candidate): candidate is PublicSocialCandidateCard => {
      return candidate !== null;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, dto.limit ?? 10);
}

export function parsePublicSocialTimeWindow(text?: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  if (/(早晨|早上|morning|上午|am)/.test(lower)) tokens.push('morning');
  if (/(中午|noon|午间)/.test(lower)) tokens.push('noon');
  if (/(下午|afternoon|pm)/.test(lower)) tokens.push('afternoon');
  if (/(傍晚|晚上|evening|夜里|tonight)/.test(lower)) tokens.push('evening');
  if (/(深夜|凌晨|night|midnight)/.test(lower)) tokens.push('night');
  if (/(周末|weekend|周六|周日|saturday|sunday)/.test(lower)) {
    tokens.push('weekend');
  }
  if (/(工作日|weekday|平日)/.test(lower)) tokens.push('weekday');
  return tokens;
}

/** Great-circle distance in kilometres. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const radius = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function publicProfileText(value: string | null | undefined, fallback: string) {
  const text = `${value ?? ''}`.trim();
  if (!text || /^unknown$/i.test(text) || isInternalFixtureText(text)) {
    return fallback;
  }
  return text;
}

function isInternalFixtureText(text: string) {
  const normalized = text.replace(/[_-]+/g, ' ');
  return /\b(agent\s*smoke|smoke\s*account|api\s*smoke|smoke|fixture|seed|test\s*account|mock)\b/i.test(
    normalized,
  );
}

function isInternalFixtureUser(user: User) {
  return [
    user.email,
    user.name,
    user.bio,
    user.gym,
    ...(user.interestTags ?? []),
  ].some((value) => isInternalFixtureText(`${value ?? ''}`));
}
