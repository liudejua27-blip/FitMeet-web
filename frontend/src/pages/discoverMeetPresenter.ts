import { normalizeSportGroup } from '../data/taxonomy';
import type { Meet, PublicSocialIntent } from '../types';

export type DiscoverMeet = Meet & {
  sourceKind?: 'meet' | 'publicIntent';
  publicIntentId?: string;
  detailHref?: string;
};

export function publicIntentToDiscoverMeet(
  intent: PublicSocialIntent,
  index: number,
): DiscoverMeet {
  const normalizedSport = normalizeSportGroup(
    intent.requestType || intent.interestTags?.[0] || 'custom',
  );
  const sport = normalizedSport === 'default' ? 'other' : normalizedSport;
  const color = ['#10a37f', '#f97316', '#4f46e5', '#d97706'][index % 4];
  const detailHref = `/public-intent/${encodeURIComponent(intent.id)}`;
  const title = publicIntentText(intent.title) || fallbackPublicIntentTitle(intent);
  const description =
    publicIntentText(intent.description) ||
    publicIntentText(intent.socialGoal) ||
    '发起人正在寻找合适的同频伙伴，建议先站内沟通并选择公共场所见面。';
  const city = publicIntentText(intent.city);
  const location =
    publicIntentText(intent.locationPreference) || publicIntentText(intent.loc) || city;
  const time = publicIntentText(intent.timePreference) || '时间待定';
  const participants = (intent.interestTags || [])
    .map((tag) => publicIntentText(tag))
    .filter((tag) => tag.length > 0 && isPublicTag(tag))
    .slice(0, 3);
  return {
    id: publicIntentSyntheticId(intent.id, index),
    userId: intent.userId ?? undefined,
    title,
    type: sport,
    sport,
    username: '同频发起人',
    color,
    colorBg: `${color}22`,
    time,
    loc: location || '地点待定',
    city,
    lat: null,
    lng: null,
    dist: intent.radiusKm ? `${intent.radiusKm}km 内` : '附近',
    price: '免费',
    slots: Math.max(1, intent.matchedCount || 1),
    maxSlots: Math.max(3, (intent.matchedCount || 1) + 2),
    level: publicIntentLevel(intent),
    desc: description,
    status: 'active',
    participants,
    cert: true,
    rating: publicIntentRating(intent),
    meetCount: intent.matchedCount || 1,
    startAt: time,
    createdAt: intent.createdAt,
    sourceKind: 'publicIntent',
    publicIntentId: intent.id,
    detailHref,
  };
}

export function detailHrefForDiscoverMeet(meet: DiscoverMeet) {
  if (meet.detailHref) return meet.detailHref;
  if (meet.sourceKind === 'publicIntent' && meet.publicIntentId) {
    return `/public-intent/${encodeURIComponent(meet.publicIntentId)}`;
  }
  return `/agent/chat?scene=${encodeURIComponent(meet.title)}`;
}

function publicIntentSyntheticId(id: string, index: number) {
  const hash = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return -100000 - index - hash;
}

function publicIntentLevel(intent: PublicSocialIntent) {
  const text = [
    publicIntentText(intent.description),
    publicIntentText(intent.socialGoal),
    ...(intent.interestTags ?? []).map((tag) => publicIntentText(tag)),
  ].join(' ');
  if (/(高强度|进阶|认真|训练)/i.test(text)) return '较高强度';
  if (/(轻松|低压力|散步|新手)/i.test(text)) return '轻松';
  return '中等';
}

function publicIntentRating(intent: PublicSocialIntent) {
  if (intent.matchedCount >= 3) return 4.8;
  if (intent.matchedCount > 0) return 4.4;
  return 4.1;
}

function isPublicTag(tag: string) {
  return !/^(default|custom)$/i.test(tag.trim()) && !isInternalFixtureText(tag);
}

function fallbackPublicIntentTitle(intent: PublicSocialIntent) {
  const city = publicIntentText(intent.city) || '附近';
  const type = publicIntentText(intent.requestType);
  const tags = (intent.interestTags ?? []).map((tag) => publicIntentText(tag)).join(' ');
  const source = `${type} ${tags}`;
  if (/run|running|跑步/i.test(source)) return `${city}轻松跑步搭子`;
  if (/walk|city|散步/i.test(source)) return `${city}散步搭子`;
  if (/fitness|gym|健身|约练/i.test(source)) return `${city}约练搭子`;
  return `${city}同频约练`;
}

function publicIntentText(value?: string | null) {
  const text = `${value ?? ''}`.trim();
  if (!text || /^(default|unknown|null|undefined)$/i.test(text)) return '';
  if (isInternalFixtureText(text)) return '';
  if (/^public\s*intent$/i.test(text)) return '';
  return text;
}

function isInternalFixtureText(value?: string | null) {
  const text = `${value ?? ''}`.trim().replace(/[_-]+/g, ' ');
  return /\b(agent\s*smoke|api\s*smoke|smoke\s*seed|smoke|fixture|seed\s*intent|seed|test\s*account|test|mock)\b/i.test(
    text,
  );
}
