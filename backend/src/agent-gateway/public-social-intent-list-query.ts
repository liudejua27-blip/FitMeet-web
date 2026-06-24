import { sanitizeCity } from '../common/city.util';
import { SocialRequestStatus } from './entities/social-request.entity';

export type PublicSocialIntentListFilters = {
  city?: string;
  limit?: number;
  page?: number;
  publicIntentId?: string;
  q?: string;
  requestType?: string;
  status?: SocialRequestStatus;
};

export type NormalizedPublicSocialIntentListFilters = {
  city?: string;
  page: number;
  publicIntentId?: string;
  q?: string;
  requestType?: string;
  skip: number;
  status?: SocialRequestStatus;
  statuses: SocialRequestStatus[];
  take: number;
};

const DEFAULT_PUBLIC_INTENT_STATUSES = [
  SocialRequestStatus.Active,
  SocialRequestStatus.Matched,
  SocialRequestStatus.Searching,
];

export function normalizePublicSocialIntentListFilters(
  filters: PublicSocialIntentListFilters = {},
): NormalizedPublicSocialIntentListFilters {
  const page = Math.max(Number(filters.page) || 1, 1);
  const take = Math.min(Math.max(Number(filters.limit) || 30, 1), 50);
  const status = Object.values(SocialRequestStatus).includes(
    filters.status as SocialRequestStatus,
  )
    ? (filters.status as SocialRequestStatus)
    : undefined;
  return {
    page,
    take,
    skip: (page - 1) * take,
    publicIntentId: filters.publicIntentId?.trim() || undefined,
    q: filters.q?.trim() || undefined,
    city: sanitizeCity(filters.city) || undefined,
    requestType: filters.requestType?.trim() || undefined,
    status,
    statuses: status ? [status] : DEFAULT_PUBLIC_INTENT_STATUSES,
  };
}
