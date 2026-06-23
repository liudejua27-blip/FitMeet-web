import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { buildPublicIntentMatchSignal } from './public-social-intent.helpers';

export function serializePublicSocialIntent(intent: PublicSocialIntent) {
  const matchSignal = toPublicMatchSignal(buildPublicIntentMatchSignal(intent));
  return {
    id: intent.id,
    userId: intent.userId,
    linkedSocialRequestId: intent.linkedSocialRequestId,
    mode: intent.mode,
    requestType: intent.requestType,
    title: intent.title,
    description: intent.description,
    interestTags: intent.interestTags ?? [],
    city: intent.city,
    loc: intent.loc,
    lat: intent.lat,
    lng: intent.lng,
    radiusKm: intent.radiusKm,
    timePreference: intent.timePreference,
    locationPreference: intent.locationPreference,
    socialGoal: intent.socialGoal,
    riskLevel: intent.riskLevel,
    requiresUserConfirmation: intent.requiresUserConfirmation,
    matchedCount: intent.matchedCount,
    matchSignal: {
      score: matchSignal.score,
      confidence: matchSignal.confidence,
      updatedAt: matchSignal.updatedAt,
    },
    status: intent.status,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

function toPublicMatchSignal(signal: unknown) {
  const record = isRecord(signal) ? signal : {};
  const score = typeof record.score === 'number' ? record.score : 0;
  const confidence =
    typeof record.confidence === 'string' ? record.confidence : 'low';
  const updatedAt =
    typeof record.updatedAt === 'string' ? record.updatedAt : undefined;
  return { score, confidence, updatedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
