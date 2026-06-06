import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { buildPublicIntentMatchSignal } from './public-social-intent.helpers';

export function serializePublicSocialIntent(intent: PublicSocialIntent) {
  return {
    id: intent.id,
    userId: intent.userId,
    linkedSocialRequestId: intent.linkedSocialRequestId,
    source: intent.source,
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
    filters: intent.filters,
    candidateUserIds: intent.candidateUserIds,
    matchedCount: intent.matchedCount,
    matchSignal: buildPublicIntentMatchSignal(intent),
    status: intent.status,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
