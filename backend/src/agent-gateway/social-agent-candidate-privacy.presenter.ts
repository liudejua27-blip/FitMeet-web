import { cleanDisplayText } from '../common/display-text.util';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  normalizeSocialProfilePrivacyControls,
  type SocialProfilePrivacyControls,
} from '../users/social-profile-privacy-controls';

export type CandidatePrivacyPresentation = {
  controls: SocialProfilePrivacyControls;
  displayName: string;
  city: string;
  avatar: string;
  coarseArea: string;
  privacyLabel: string;
  privacySignals: string[];
  contactPolicyLabel: string;
  preciseLocationPolicyLabel: string;
  strangerActionPolicyLabels: string[];
};

export function buildCandidatePrivacyPresentation(input: {
  user: User;
  profile: UserSocialProfile | null;
  displayName: string;
  city: string;
}): CandidatePrivacyPresentation {
  const controls = normalizeSocialProfilePrivacyControls(input.profile);
  const coarseArea = firstText(
    controls.candidateCoarseArea,
    input.profile?.nearbyArea,
    input.city,
    input.profile?.city,
    input.user.city,
  );
  const fallbackArea = coarseArea || '附近';
  const originalName = firstText(
    input.displayName,
    input.profile?.nickname,
    input.user.name,
  );
  const displayName =
    controls.candidateDisplayMode === 'nickname_until_confirmed' && originalName
      ? originalName
      : anonymizedCandidateName(input.user.id, fallbackArea);
  const avatar =
    controls.candidateAvatarVisibility === 'public'
      ? cleanDisplayText(input.user.avatar, '')
      : '';
  const city =
    coarseArea || input.city || input.profile?.city || input.user.city || '';
  const contactPolicyLabel = contactDisclosureLabel(
    controls.contactDisclosurePolicy,
  );
  const preciseLocationPolicyLabel = preciseLocationLabel(
    controls.preciseLocationPolicy,
  );
  const strangerActionPolicyLabels = [
    openerPolicyLabel(controls.strangerOpenerPolicy),
    invitePolicyLabel(controls.strangerInvitePolicy),
    friendPolicyLabel(controls.strangerFriendPolicy),
  ].filter(Boolean);
  const privacySignals = [
    controls.candidateDisplayMode === 'anonymous_until_confirmed'
      ? '确认前匿名展示'
      : '确认前仅展示昵称',
    avatar ? '头像公开展示' : '头像确认前隐藏',
    coarseArea ? `粗略区域：${coarseArea}` : '仅展示粗略区域',
    contactPolicyLabel,
    preciseLocationPolicyLabel,
  ].filter(Boolean);
  return {
    controls,
    displayName,
    city,
    avatar,
    coarseArea,
    privacyLabel: `${contactPolicyLabel}；${preciseLocationPolicyLabel}`,
    privacySignals,
    contactPolicyLabel,
    preciseLocationPolicyLabel,
    strangerActionPolicyLabels,
  };
}

function anonymizedCandidateName(userId: number, area: string): string {
  const suffix = String(Math.abs(userId % 97) + 1).padStart(2, '0');
  const areaText = cleanDisplayText(area, '附近');
  return `${areaText}搭子 ${suffix}`;
}

function contactDisclosureLabel(policy: string): string {
  if (policy === 'owner_approved') return '联系方式需对方再次确认后披露';
  if (policy === 'never_public') return '联系方式不会公开展示';
  return '联系方式仅在站内匹配后沟通';
}

function preciseLocationLabel(policy: string): string {
  if (policy === 'after_confirmation') return '精确位置需双方确认后再透露';
  if (policy === 'never') return '不展示精确位置';
  return '仅展示城市或粗略区域';
}

function openerPolicyLabel(policy: string): string {
  if (policy === 'opener_allowed_after_match') return '匹配后可生成开场白';
  if (policy === 'opener_blocked') return '不接受陌生人开场白';
  return '开场白需确认后发送';
}

function invitePolicyLabel(policy: string): string {
  if (policy === 'invite_blocked') return '不接受陌生人邀请';
  return '邀请需确认后发送';
}

function friendPolicyLabel(policy: string): string {
  if (policy === 'friend_blocked') return '不接受陌生人加好友';
  return '加好友需确认后处理';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanDisplayText(value, '');
    if (text) return text;
  }
  return '';
}
