import { PublicSocialIntent } from './entities/public-social-intent.entity';

export function serializePublicSocialIntent(intent: PublicSocialIntent) {
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
    requestType: publicIntentText(intent.requestType, 'custom'),
    title,
    description,
    interestTags: publicIntentTags(intent.interestTags ?? []),
    city: publicIntentText(intent.city, ''),
    locale: publicIntentText(intent.locale, 'zh-CN'),
    countryCode: publicIntentText(intent.countryCode, 'CN'),
    timeZone: publicIntentText(intent.timeZone, 'Asia/Shanghai'),
    utcOffsetMinutes: intent.utcOffsetMinutes,
    geoHash: publicIntentText(intent.geoHash, ''),
    loc: publicIntentText(intent.loc, ''),
    radiusKm: intent.radiusKm,
    timePreference: publicIntentText(intent.timePreference, ''),
    locationPreference: publicIntentText(intent.locationPreference, ''),
    socialGoal,
    matchedCount: intent.matchedCount,
    status: intent.status,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
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
