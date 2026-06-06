import * as crypto from 'crypto';

import { CreateSocialRequestDto } from './dto/agent-gateway.dto';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestRiskLevel } from './entities/social-request.entity';
import { User } from '../users/user.entity';

type PublicSocialIntentMeta = {
  ip?: string;
  forwardedFor?: string | string[];
  userAgent?: string;
  deviceId?: string | string[];
  origin?: string;
};

type PublicIntentCandidateSignal = {
  score?: number;
  reasonTags?: string[];
};

export function classifyPublicSocialRisk(
  dto: CreateSocialRequestDto,
): SocialRequestRiskLevel {
  const text = `${dto.requestType} ${dto.description}`.toLowerCase();
  if (/(酒|bar|pub|drink|drinking|急救|受伤|help|emergency)/i.test(text)) {
    return SocialRequestRiskLevel.High;
  }
  if (
    /(线下|见面|旅游|travel|trip|遛狗|dog|pet|搭车|自驾|offline)/i.test(text)
  ) {
    return SocialRequestRiskLevel.Medium;
  }
  return SocialRequestRiskLevel.Low;
}

export function buildPublicSocialRequestTitle(dto: CreateSocialRequestDto) {
  const labels: Record<string, string> = {
    fitness_partner: '寻找附近约练搭子',
    dog_walking: '寻找附近遛狗搭子',
    bar_friend: '寻找同场酒搭子',
    travel_partner: '寻找旅游出行搭子',
    offline_friend: '寻找附近线下朋友',
    photo_partner: '寻找拍照搭子',
  };
  return labels[dto.requestType] ?? `寻找${dto.requestType}`;
}

export function extractPublicRequestKeywords(text = '') {
  const lowered = text.toLowerCase();
  const pairs: Array<[RegExp, string]> = [
    [/健身|约练|gym|fitness|workout/, 'fitness'],
    [/跑步|run|running/, 'running'],
    [/遛狗|狗|dog|pet|宠物/, 'pet'],
    [/酒|bar|pub|喝酒|drinking/, 'bar'],
    [/旅游|旅行|travel|trip/, 'travel'],
    [/拍照|摄影|photo|camera/, 'photography'],
    [/咖啡|coffee/, 'coffee'],
  ];
  return pairs
    .filter(([pattern]) => pattern.test(lowered))
    .map(([, tag]) => tag);
}

export function buildPublicSocialCandidateReason(
  user: Pick<User, 'city' | 'verified'>,
  dto: CreateSocialRequestDto,
  overlap: string[],
  distanceKm: number | null = null,
) {
  const parts: string[] = [];
  if (distanceKm != null) {
    parts.push(`距离约 ${distanceKm.toFixed(2)}km`);
  } else if (dto.city && user.city === dto.city) {
    parts.push(`同在${user.city}`);
  }
  if (user.verified) parts.push('已完成认证');
  if (overlap.length) parts.push(`兴趣重合：${overlap.join('、')}`);
  if (!parts.length) parts.push('资料与本次需求有基础匹配');
  return `${parts.join('，')}，建议先发送礼貌邀约并等待对方确认。`;
}

export function buildPublicIntentMatchSignal(
  intent: PublicSocialIntent,
  candidates: PublicIntentCandidateSignal[] = [],
) {
  const metadataSignal = intent.metadata?.matchSignal;
  if (
    metadataSignal &&
    typeof metadataSignal === 'object' &&
    typeof (metadataSignal as { score?: unknown }).score === 'number'
  ) {
    return metadataSignal;
  }
  return buildPublicIntentMatchSignalFromRequest(
    {
      requestType: intent.requestType,
      title: intent.title,
      description: intent.description,
      city: intent.city,
      loc: intent.loc,
      timePreference: intent.timePreference,
      interests: intent.interestTags ?? [],
      verifiedOnly: Boolean(intent.filters?.verifiedOnly),
    } as CreateSocialRequestDto,
    candidates,
    intent.matchedCount,
  );
}

export function buildPublicIntentMatchSignalFromRequest(
  dto: CreateSocialRequestDto,
  candidates: PublicIntentCandidateSignal[] = [],
  matchedCount = candidates.length,
) {
  const scored = candidates
    .map((candidate) => Number(candidate.score))
    .filter((score) => Number.isFinite(score));
  const topScore = scored.length ? Math.max(...scored) : 0;
  const averageTop = scored.length
    ? scored.slice(0, 5).reduce((sum, score) => sum + score, 0) /
      Math.min(scored.length, 5)
    : 0;
  const signalCount =
    (dto.city ? 1 : 0) +
    (dto.loc ? 1 : 0) +
    (dto.timePreference ? 1 : 0) +
    ((dto.interests ?? []).length > 0 ? 1 : 0) +
    ((dto.description ?? '').trim().length >= 20 ? 1 : 0) +
    (dto.verifiedOnly ? 1 : 0);
  const fallbackScore = 38 + signalCount * 6 + Math.min(matchedCount, 5) * 5;
  const score = Math.round(
    Math.max(
      28,
      Math.min(
        98,
        topScore > 0 ? topScore * 0.7 + averageTop * 0.3 : fallbackScore,
      ),
    ),
  );
  const reasons = [
    dto.city ? `城市信号：${dto.city}` : '',
    dto.timePreference ? `时间偏好：${dto.timePreference}` : '',
    (dto.interests ?? []).length
      ? `兴趣重合：${(dto.interests ?? []).slice(0, 3).join('、')}`
      : '',
    dto.verifiedOnly ? '优先实名认证用户' : '',
    matchedCount > 0
      ? `已找到 ${matchedCount} 个候选`
      : '候选池仍在等待画像信号',
  ].filter(Boolean);

  return {
    score,
    confidence: matchedCount > 0 ? (score >= 75 ? 'high' : 'medium') : 'low',
    source:
      process.env.DEEPSEEK_API_KEY || process.env.ENABLE_MATCH_REASONER_LLM
        ? 'ai_dynamic_with_deterministic_fallback'
        : 'deterministic_fallback',
    reasons,
    updatedAt: new Date().toISOString(),
  };
}

export function previewPublicIntentText(text: string, max = 160): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 3))}...`
    : normalized;
}

export function hasPublicIntentSensitiveContent(text: string) {
  return /(微信|wechat|手机号|phone|电话|email|邮箱|转账|打钱|付款|裸照|私密照片|身份证|酒店房间|住址|home address|payment|bank|crypto|usdt)/i.test(
    text,
  );
}

export function scorePublicIntentSuspicion(
  dto: CreateSocialRequestDto,
  meta: {
    ip: string;
    deviceId: string;
    userAgent: string;
    origin: string;
  },
) {
  let score = 0;
  if (!meta.deviceId) score += 1;
  if (!meta.origin) score += 1;
  if ((dto.description ?? '').length < 12) score += 1;
  if ((dto.description ?? '').length > 1200) score += 1;
  if ((dto.limit ?? 5) > 10) score += 1;
  if ((dto.radiusKm ?? 5) > 25) score += 1;
  if (!dto.city && !dto.loc && (!dto.lat || !dto.lng)) score += 1;
  return score;
}

export function normalizePublicIntentIp(meta: PublicSocialIntentMeta) {
  const forwarded = normalizePublicIntentHeader(meta.forwardedFor);
  return (forwarded.split(',')[0] || meta.ip || 'unknown').trim();
}

export function normalizePublicIntentHeader(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function hashPublicIntentBucket(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}
