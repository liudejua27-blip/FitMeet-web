import { SocialRequestStatus } from '../agent-gateway/entities/social-request.entity';

export const PUBLIC_INTENT_APPLICABLE_STATUSES = [
  SocialRequestStatus.Active,
  SocialRequestStatus.Searching,
  SocialRequestStatus.Matched,
] as const;

export function isPublicIntentAcceptingApplications(
  status: string | SocialRequestStatus | null | undefined,
): boolean {
  return PUBLIC_INTENT_APPLICABLE_STATUSES.includes(
    status as (typeof PUBLIC_INTENT_APPLICABLE_STATUSES)[number],
  );
}
