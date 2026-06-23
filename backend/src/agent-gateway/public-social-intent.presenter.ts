import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { buildPublicIntentMatchSignal } from './public-social-intent.helpers';

export function serializePublicSocialIntent(intent: PublicSocialIntent) {
  const matchSignal = toPublicMatchSignal(buildPublicIntentMatchSignal(intent));
  const socialGoal = publicIntentText(intent.socialGoal, '');
  const title =
    publicIntentText(intent.title, '') ||
    fallbackPublicIntentTitle(intent.city, intent.requestType);
  const description =
    publicIntentText(intent.description, '') ||
    socialGoal ||
    '发起人正在寻找同频伙伴，建议先站内沟通并选择公共场所见面。';
  return {
    id: intent.id,
    userId: intent.userId,
    linkedSocialRequestId: intent.linkedSocialRequestId,
    mode: intent.mode,
    requestType: publicIntentText(intent.requestType, 'custom'),
    title,
    description,
    interestTags: publicIntentTags(intent.interestTags ?? []),
    city: publicIntentText(intent.city, ''),
    loc: publicIntentText(intent.loc, ''),
    lat: intent.lat,
    lng: intent.lng,
    radiusKm: intent.radiusKm,
    timePreference: publicIntentText(intent.timePreference, ''),
    locationPreference: publicIntentText(intent.locationPreference, ''),
    socialGoal,
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

function publicIntentTags(tags: string[]) {
  return tags
    .map((tag) => publicIntentText(tag, ''))
    .filter((tag) => tag.length > 0);
}

function publicIntentText(value: string | null | undefined, fallback: string) {
  const text = `${value ?? ''}`.trim();
  if (!text) return fallback;
  if (/^(default|unknown|null|undefined)$/i.test(text)) return fallback;
  if (isInternalFixtureText(text)) return fallback;
  return text;
}

function fallbackPublicIntentTitle(city?: string | null, requestType?: string) {
  const safeCity = publicIntentText(city, '附近');
  const safeType = publicIntentText(requestType, '');
  if (/run|running|跑步/i.test(safeType)) return `${safeCity}轻松跑步搭子`;
  if (/fitness|gym|健身|约练/i.test(safeType)) return `${safeCity}约练搭子`;
  if (/walk|city|散步/i.test(safeType)) return `${safeCity}散步搭子`;
  return `${safeCity}同频约练`;
}

function isInternalFixtureText(text: string) {
  const normalized = text.replace(/[_-]+/g, ' ');
  return /\b(agent\s*smoke|api\s*smoke|smoke\s*account|smoke|fixture|seed|test\s*account|mock)\b/i.test(
    normalized,
  );
}
