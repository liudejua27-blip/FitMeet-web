import {
  SocialActivity,
  SocialActivityStatus,
} from '../activities/entities/activity.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  SocialRequest,
  SocialRequestStatus,
} from './entities/social-request.entity';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import { normalizeCandidatePoolArray } from './social-agent-candidate-pool-query';

const ACTIVE_PUBLIC_STATUSES = [
  SocialRequestStatus.Active,
  SocialRequestStatus.Searching,
  SocialRequestStatus.Matched,
];

const ACTIVE_ACTIVITY_STATUSES = [
  SocialActivityStatus.PendingConfirm,
  SocialActivityStatus.Confirmed,
  SocialActivityStatus.InProgress,
];

const DISABLED_BOUNDARY_RE =
  /(不被推荐|不参与匹配|关闭推荐|不接受推荐|不要推荐|禁止推荐|退出匹配|关闭匹配)/i;

export function hasSocialAgentRecommendationBoundary(
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): boolean {
  return DISABLED_BOUNDARY_RE.test(
    [profile?.privacyBoundary, profile?.rejectRules, delegate?.boundaries]
      .filter(Boolean)
      .join(' '),
  );
}

export function isSocialAgentActivePublicIntent(
  intent: PublicSocialIntent,
): boolean {
  return (
    intent.mode === 'public' && ACTIVE_PUBLIC_STATUSES.includes(intent.status)
  );
}

export function isSocialAgentActiveLegacyRequest(
  request: SocialRequest,
): boolean {
  return (
    request.visibility === 'public' &&
    ACTIVE_PUBLIC_STATUSES.includes(request.status)
  );
}

export function isSocialAgentActiveActivity(
  activity: SocialActivity,
  nowMs = Date.now(),
): boolean {
  return (
    ACTIVE_ACTIVITY_STATUSES.includes(activity.status) &&
    (!activity.endTime || activity.endTime.getTime() >= nowMs)
  );
}

export function isSocialAgentActivityLikePublicIntent(
  intent: PublicSocialIntent,
  query: CandidatePoolResolvedQuery,
): boolean {
  const text = [
    intent.requestType,
    intent.title,
    intent.description,
    ...normalizeCandidatePoolArray(intent.interestTags),
  ]
    .join(' ')
    .toLowerCase();
  if (query.activityType && text.includes(query.activityType.toLowerCase()))
    return true;
  return /(活动|约练|跑步|羽毛球|健身|瑜伽|徒步|骑行|咖啡|拍照|摄影|city|walk|running|fitness|coffee|photo)/i.test(
    text,
  );
}
