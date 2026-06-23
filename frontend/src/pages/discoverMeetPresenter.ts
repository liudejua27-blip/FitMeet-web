import { normalizeSportGroup } from '../data/taxonomy';
import type { Meet, PublicSocialIntent } from '../types';

export type DiscoverMeet = Meet & {
  sourceKind?: 'meet' | 'publicIntent';
  publicIntentId?: string;
  linkedSocialRequestId?: number | null;
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
  return {
    id: publicIntentSyntheticId(intent.id, index),
    userId: intent.userId ?? undefined,
    title: intent.title || '新的社交机会',
    type: sport,
    sport,
    username: '同频发起人',
    color,
    colorBg: `${color}22`,
    time: intent.timePreference || '时间待定',
    loc: intent.locationPreference || intent.loc || intent.city || '地点待定',
    city: intent.city,
    lat: intent.lat,
    lng: intent.lng,
    dist: intent.radiusKm ? `${intent.radiusKm}km 内` : '附近',
    price: '免费',
    slots: Math.max(1, intent.matchedCount || 1),
    maxSlots: Math.max(3, (intent.matchedCount || 1) + 2),
    level: publicIntentLevel(intent),
    desc: intent.description || intent.socialGoal || '发起人正在寻找合适的同频伙伴。',
    status: 'active',
    participants: (intent.interestTags || []).filter(isPublicTag).slice(0, 3),
    cert: intent.riskLevel !== 'high',
    rating: Math.max(4, Math.min(5, (intent.matchSignal?.score ?? 86) / 20)),
    meetCount: intent.matchedCount || 1,
    startAt: intent.timePreference,
    createdAt: intent.createdAt,
    sourceKind: 'publicIntent',
    publicIntentId: intent.id,
    linkedSocialRequestId: intent.linkedSocialRequestId,
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
  const text = `${intent.description} ${intent.socialGoal} ${intent.interestTags?.join(' ') ?? ''}`;
  if (/(高强度|进阶|认真|训练)/i.test(text)) return '较高强度';
  if (/(轻松|低压力|散步|新手)/i.test(text)) return '轻松';
  return '中等';
}

function isPublicTag(tag: string) {
  return !/^(default|custom|seed|test|smoke)$/i.test(tag.trim());
}
