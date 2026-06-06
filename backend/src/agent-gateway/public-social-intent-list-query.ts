import { sanitizeCity } from '../common/city.util';
import { SocialRequestStatus } from './entities/social-request.entity';

export type PublicSocialIntentListFilters = {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: string;
  status?: SocialRequestStatus;
};

export type NormalizedPublicSocialIntentListFilters = {
  page: number;
  take: number;
  skip: number;
  q?: string;
  city?: string;
  requestType?: string;
  status: SocialRequestStatus;
};

export function normalizePublicSocialIntentListFilters(
  filters: PublicSocialIntentListFilters = {},
): NormalizedPublicSocialIntentListFilters {
  const page = Math.max(Number(filters.page) || 1, 1);
  const take = Math.min(Math.max(Number(filters.limit) || 30, 1), 50);
  const status = Object.values(SocialRequestStatus).includes(
    filters.status as SocialRequestStatus,
  )
    ? (filters.status as SocialRequestStatus)
    : SocialRequestStatus.Active;

  return {
    page,
    take,
    skip: (page - 1) * take,
    q: filters.q?.trim() || undefined,
    city: sanitizeCity(filters.city) || undefined,
    requestType: filters.requestType?.trim() || undefined,
    status,
  };
}
