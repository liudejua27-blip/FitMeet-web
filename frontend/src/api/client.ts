import type {
  Friend,
  Meet,
  MeetRecord,
  PublicSocialIntent,
  PublicSocialIntentMatches,
  UserProfile,
} from '../types';
import { request } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export * from './baseClient';
export * from './authClient';
export * from './messagesClient';
export * from './safetyClient';

export function getUser(id: number): Promise<UserProfile> {
  return request<UserProfile>(`/users/${id}`);
}

export function updateProfile(data: Partial<UserProfile>): Promise<UserProfile> {
  return request<UserProfile>(fitMeetCoreEndpoints.users.updateProfile, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getFriends(): Promise<Friend[]> {
  return request<Friend[]>('/friends');
}

export function toggleFollow(userId: number): Promise<{ following: boolean }> {
  return request(`/users/${userId}/follow`, { method: 'POST' });
}

export function isFollowing(userId: number): Promise<{ following: boolean }> {
  return request(`/users/${userId}/following`);
}

export function getFollowedIds(): Promise<number[]> {
  return request<number[]>('/following/ids');
}

export function getMeets(params?: {
  type?: string;
  city?: string;
  lat?: number;
  lng?: number;
}): Promise<Meet[]> {
  const search = new URLSearchParams();
  if (params?.type && params.type !== 'all') search.set('type', params.type);
  if (params?.city) search.set('city', params.city);
  if (Number.isFinite(params?.lat)) search.set('lat', String(params?.lat));
  if (Number.isFinite(params?.lng)) search.set('lng', String(params?.lng));
  const qs = search.toString();
  return request<Meet[]>(`/meets${qs ? `?${qs}` : ''}`);
}

export function joinMeet(id: number): Promise<void> {
  return request(`/meets/${id}/join`, { method: 'POST' });
}

export function getMeetRecords(): Promise<MeetRecord[]> {
  return request<MeetRecord[]>('/meets/records/me');
}

export function getPublicSocialIntents(params?: {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: string;
  status?: string;
  publicIntentId?: string;
}): Promise<PublicSocialIntent[]> {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.q) search.set('q', params.q);
  if (params?.city) search.set('city', params.city);
  if (params?.requestType) search.set('requestType', params.requestType);
  if (params?.status) search.set('status', params.status);
  if (params?.publicIntentId) search.set('publicIntentId', params.publicIntentId);
  const qs = search.toString();
  return request<{ data: PublicSocialIntent[] }>(
    `${fitMeetCoreEndpoints.discover.publicSocialIntents}${qs ? `?${qs}` : ''}`,
  ).then((r) => r.data);
}

export function getPublicSocialIntent(id: string): Promise<PublicSocialIntent> {
  return request<PublicSocialIntent>(fitMeetCoreEndpoints.discover.publicSocialIntent(id));
}

export function getPublicSocialIntentMatches(id: string): Promise<PublicSocialIntentMatches> {
  return request<PublicSocialIntentMatches>(
    fitMeetCoreEndpoints.discover.publicSocialIntentMatches(id),
  );
}
