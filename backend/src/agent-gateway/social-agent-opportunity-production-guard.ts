import { BadRequestException } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';

type OpportunityGuardDraft = CreateSocialRequestDto & {
  socialRequestId?: number | null;
  locationName?: unknown;
  locationPreference?: unknown;
  timePreference?: unknown;
  safetyBoundary?: unknown;
};

export type SocialAgentOpportunityGuardIssue = {
  code:
    | 'expired_time'
    | 'contact_exchange'
    | 'precise_location'
    | 'city_location_mismatch'
    | 'public_boundary_missing';
  severity: 'block' | 'warn';
  message: string;
};

const CITY_NAMES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '南京',
  '成都',
  '重庆',
  '武汉',
  '青岛',
  '苏州',
  '西安',
  '长沙',
  '厦门',
  '天津',
];

export function socialAgentOpportunityGuardIssues(
  draft: OpportunityGuardDraft,
  now = new Date(),
): SocialAgentOpportunityGuardIssue[] {
  const issues: SocialAgentOpportunityGuardIssue[] = [];
  const city = text(draft.city);
  const location = text(draft.locationName ?? draft.locationPreference);
  const time = text(draft.timePreference);
  const haystack = [
    draft.title,
    draft.description,
    draft.locationName,
    draft.locationPreference,
    draft.safetyBoundary,
  ]
    .map(text)
    .join(' ');

  if (isExpiredTime(time, now)) {
    issues.push({
      code: 'expired_time',
      severity: 'block',
      message: '约练时间看起来已经过期，请重新选择可约时间。',
    });
  }
  if (containsContactExchange(haystack)) {
    issues.push({
      code: 'contact_exchange',
      severity: 'block',
      message: '约练卡不能包含手机号、微信或其他站外联系方式。',
    });
  }
  if (containsPreciseLocation(haystack)) {
    issues.push({
      code: 'precise_location',
      severity: 'warn',
      message: '约练卡建议只展示城市、商圈或公共场所，不展示精确门牌。',
    });
  }
  const mismatchedCity = mismatchedLocationCity(city, location);
  if (mismatchedCity) {
    issues.push({
      code: 'city_location_mismatch',
      severity: 'warn',
      message: `约练城市是${city}，但地点看起来在${mismatchedCity}，发布前需要确认。`,
    });
  }
  if (!hasPublicBoundary(draft, location)) {
    issues.push({
      code: 'public_boundary_missing',
      severity: 'warn',
      message: '建议补充公共场所、站内沟通和位置模糊边界。',
    });
  }
  return issues;
}

export function assertSocialAgentOpportunityPublishable(
  draft: OpportunityGuardDraft,
): void {
  const blockers = socialAgentOpportunityGuardIssues(draft).filter(
    (issue) => issue.severity === 'block',
  );
  if (blockers.length === 0) return;
  throw new BadRequestException(blockers[0].message);
}

export function withSocialAgentOpportunityGuard(draft: OpportunityGuardDraft) {
  const issues = socialAgentOpportunityGuardIssues(draft);
  return {
    ...draft,
    productionGuard: {
      issues,
      blocked: issues.some((issue) => issue.severity === 'block'),
      warningCount: issues.filter((issue) => issue.severity === 'warn').length,
    },
  };
}

function isExpiredTime(value: string, now: Date): boolean {
  if (!value) return false;
  if (/(昨天|前天|上周|去年|已过期)/.test(value)) return true;
  const match = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (!match) return false;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    23,
    59,
    59,
  );
  return date.getTime() < now.getTime();
}

function containsContactExchange(value: string): boolean {
  const normalized = value.replace(
    /不(?:公开|共享|交换|提供|透露|展示)[^。；，,]*(?:联系方式|手机号|微信|电话)/g,
    '',
  );
  return (
    /(?:微信|vx|v信|手机号|手机|电话|加我|联系方式)/i.test(normalized) ||
    /\b1[3-9]\d{9}\b/.test(normalized)
  );
}

function containsPreciseLocation(value: string): boolean {
  return /\d+\s*(号|室|单元|栋|幢|楼)/.test(value);
}

function mismatchedLocationCity(city: string, location: string): string | null {
  if (!city || !location) return null;
  const matched = CITY_NAMES.find(
    (candidate) => candidate !== city && location.includes(candidate),
  );
  return matched ?? null;
}

function hasPublicBoundary(
  draft: OpportunityGuardDraft,
  location: string,
): boolean {
  const boundary = text(draft.safetyBoundary);
  if (/(公共|公开|站内|不共享|模糊|人多|白天)/.test(boundary)) return true;
  return /(公园|球馆|健身房|商场|咖啡|学校|操场|图书馆|体育馆)/.test(location);
}

function text(value: unknown): string {
  return cleanDisplayText(value, '').trim();
}
