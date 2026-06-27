import { cleanDisplayText } from '../common/display-text.util';
import { UserSocialProfile } from './user-social-profile.entity';

export const SOCIAL_PROFILE_PRIVACY_DEFAULTS = {
  candidateDisplayMode: 'anonymous_until_confirmed',
  candidateAvatarVisibility: 'hidden_until_confirmed',
  candidateCoarseArea: '',
  contactDisclosurePolicy: 'in_app_after_match',
  preciseLocationPolicy: 'coarse_only',
  strangerOpenerPolicy: 'opener_requires_confirmation',
  strangerInvitePolicy: 'invite_requires_confirmation',
  strangerFriendPolicy: 'friend_requires_confirmation',
} as const;

export const CANDIDATE_DISPLAY_MODES = [
  'anonymous_until_confirmed',
  'nickname_until_confirmed',
] as const;
export const CANDIDATE_AVATAR_VISIBILITY = [
  'hidden_until_confirmed',
  'public',
] as const;
export const CONTACT_DISCLOSURE_POLICIES = [
  'in_app_after_match',
  'owner_approved',
  'never_public',
] as const;
export const PRECISE_LOCATION_POLICIES = [
  'coarse_only',
  'after_confirmation',
  'never',
] as const;
export const STRANGER_OPENER_POLICIES = [
  'opener_requires_confirmation',
  'opener_allowed_after_match',
  'opener_blocked',
] as const;
export const STRANGER_INVITE_POLICIES = [
  'invite_requires_confirmation',
  'invite_blocked',
] as const;
export const STRANGER_FRIEND_POLICIES = [
  'friend_requires_confirmation',
  'friend_blocked',
] as const;

export type CandidateDisplayMode = (typeof CANDIDATE_DISPLAY_MODES)[number];
export type CandidateAvatarVisibility =
  (typeof CANDIDATE_AVATAR_VISIBILITY)[number];
export type ContactDisclosurePolicy =
  (typeof CONTACT_DISCLOSURE_POLICIES)[number];
export type PreciseLocationPolicy = (typeof PRECISE_LOCATION_POLICIES)[number];
export type StrangerOpenerPolicy = (typeof STRANGER_OPENER_POLICIES)[number];
export type StrangerInvitePolicy = (typeof STRANGER_INVITE_POLICIES)[number];
export type StrangerFriendPolicy = (typeof STRANGER_FRIEND_POLICIES)[number];

export type SocialProfilePrivacyControls = {
  candidateDisplayMode: CandidateDisplayMode;
  candidateAvatarVisibility: CandidateAvatarVisibility;
  candidateCoarseArea: string;
  contactDisclosurePolicy: ContactDisclosurePolicy;
  preciseLocationPolicy: PreciseLocationPolicy;
  strangerOpenerPolicy: StrangerOpenerPolicy;
  strangerInvitePolicy: StrangerInvitePolicy;
  strangerFriendPolicy: StrangerFriendPolicy;
};

export function normalizeSocialProfilePrivacyControls(
  input?: Partial<UserSocialProfile> | null,
): SocialProfilePrivacyControls {
  return {
    candidateDisplayMode: pickAllowed(
      input?.candidateDisplayMode,
      CANDIDATE_DISPLAY_MODES,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.candidateDisplayMode,
    ),
    candidateAvatarVisibility: pickAllowed(
      input?.candidateAvatarVisibility,
      CANDIDATE_AVATAR_VISIBILITY,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.candidateAvatarVisibility,
    ),
    candidateCoarseArea: cleanDisplayText(
      input?.candidateCoarseArea,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.candidateCoarseArea,
    ).slice(0, 120),
    contactDisclosurePolicy: pickAllowed(
      input?.contactDisclosurePolicy,
      CONTACT_DISCLOSURE_POLICIES,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.contactDisclosurePolicy,
    ),
    preciseLocationPolicy: pickAllowed(
      input?.preciseLocationPolicy,
      PRECISE_LOCATION_POLICIES,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.preciseLocationPolicy,
    ),
    strangerOpenerPolicy: pickAllowed(
      input?.strangerOpenerPolicy,
      STRANGER_OPENER_POLICIES,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.strangerOpenerPolicy,
    ),
    strangerInvitePolicy: pickAllowed(
      input?.strangerInvitePolicy,
      STRANGER_INVITE_POLICIES,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.strangerInvitePolicy,
    ),
    strangerFriendPolicy: pickAllowed(
      input?.strangerFriendPolicy,
      STRANGER_FRIEND_POLICIES,
      SOCIAL_PROFILE_PRIVACY_DEFAULTS.strangerFriendPolicy,
    ),
  };
}

function pickAllowed<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const text = cleanDisplayText(value, '');
  return allowed.includes(text) ? (text as T[number]) : fallback;
}
