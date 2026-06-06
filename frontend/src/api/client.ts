import type {
  Meet,
  Club,
  ClubMember,
  Coach,
  Category,
  Friend,
  UserProfile,
  MeetRecord,
  Review,
} from '../types';
import { request } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export * from './baseClient';
export * from './authClient';
export * from './feedClient';
export * from './messagesClient';
export * from './notificationsClient';
export * from './safetyClient';
export * from './socialRequestsClient';

// ── Users ────────────────────────────────────────────────

export function getUser(id: number): Promise<UserProfile> {
  return request<UserProfile>(`/users/${id}`);
}

export function updateProfile(data: Partial<UserProfile>): Promise<UserProfile> {
  return request<UserProfile>(fitMeetCoreEndpoints.users.updateProfile, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ── Friends / Follow ─────────────────────────────────────

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

// ── Meet ─────────────────────────────────────────────────

export function getMeets(params?: {
  type?: string;
  city?: string;
  clubId?: number;
  lat?: number;
  lng?: number;
}): Promise<Meet[]> {
  const search = new URLSearchParams();
  if (params?.type && params.type !== 'all') search.set('type', params.type);
  if (params?.city) search.set('city', params.city);
  if (Number.isFinite(params?.clubId)) search.set('clubId', String(params?.clubId));
  if (Number.isFinite(params?.lat)) search.set('lat', String(params?.lat));
  if (Number.isFinite(params?.lng)) search.set('lng', String(params?.lng));
  const qs = search.toString();
  return request<Meet[]>(`/meets${qs ? `?${qs}` : ''}`);
}

export function getMeetDetail(id: number): Promise<Meet> {
  return request<Meet>(`/meets/${id}`);
}

export function createMeet(data: Partial<Meet>): Promise<Meet> {
  return request<Meet>('/meets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function joinMeet(id: number): Promise<void> {
  return request(`/meets/${id}/join`, { method: 'POST' });
}

export function confirmMeetParticipant(
  meetId: number,
  participantId: number,
): Promise<{ confirmed: boolean }> {
  return request(`/meets/${meetId}/participants/${participantId}/confirm`, {
    method: 'POST',
  });
}

export function cancelMeet(id: number): Promise<{ cancelled: boolean }> {
  return request(`/meets/${id}/cancel`, { method: 'POST' });
}

export function createTripShare(id: number): Promise<{ token: string; url: string }> {
  return request(`/meets/${id}/trip-share`, { method: 'POST' });
}

export type TripShareInfo = {
  type: 'meet';
  meet: Meet;
  participant?: unknown;
};

export function getTripShare(token: string): Promise<TripShareInfo> {
  return request<TripShareInfo>(`/meets/trip/${encodeURIComponent(token)}`);
}

export function createMeetActivity(
  meetId: number,
): Promise<{ activityId: number; reused: boolean }> {
  return request(`/meets/${meetId}/create-activity`, { method: 'POST' });
}

export function getMeetRecords(): Promise<MeetRecord[]> {
  return request<MeetRecord[]>('/meets/records/me');
}

// Clubs

export type CreateClubInput = {
  name: string;
  city: string;
  sportType: string;
  description?: string;
  coverUrl?: string;
  joinPolicy?: Club['joinPolicy'];
  announcement?: string;
};

export type UpdateClubInput = Partial<CreateClubInput>;

export function getClubs(params?: {
  city?: string;
  sportType?: string;
  q?: string;
  mine?: boolean;
}): Promise<Club[]> {
  const search = new URLSearchParams();
  if (params?.city) search.set('city', params.city);
  if (params?.sportType && params.sportType !== 'all') search.set('sportType', params.sportType);
  if (params?.q) search.set('q', params.q);
  if (params?.mine) search.set('mine', 'true');
  const qs = search.toString();
  return request<Club[]>(`/clubs${qs ? `?${qs}` : ''}`);
}

export function createClub(data: CreateClubInput): Promise<Club> {
  return request<Club>('/clubs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getClub(id: number): Promise<Club> {
  return request<Club>(`/clubs/${id}`);
}

export function updateClub(id: number, data: UpdateClubInput): Promise<Club> {
  return request<Club>(`/clubs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function joinClub(id: number): Promise<ClubMember> {
  return request<ClubMember>(`/clubs/${id}/join`, { method: 'POST' });
}

export function approveClubMember(clubId: number, memberId: number): Promise<ClubMember> {
  return request<ClubMember>(`/clubs/${clubId}/members/${memberId}/approve`, {
    method: 'POST',
  });
}

export function rejectClubMember(clubId: number, memberId: number): Promise<ClubMember> {
  return request<ClubMember>(`/clubs/${clubId}/members/${memberId}/reject`, {
    method: 'POST',
  });
}

export function removeClubMember(clubId: number, memberId: number): Promise<{ removed: boolean }> {
  return request<{ removed: boolean }>(`/clubs/${clubId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export function getClubMeets(id: number, params?: { lat?: number; lng?: number }): Promise<Meet[]> {
  const search = new URLSearchParams();
  if (Number.isFinite(params?.lat)) search.set('lat', String(params?.lat));
  if (Number.isFinite(params?.lng)) search.set('lng', String(params?.lng));
  const qs = search.toString();
  return request<Meet[]>(`/clubs/${id}/meets${qs ? `?${qs}` : ''}`);
}

// ── Coach ────────────────────────────────────────────────

export function getCoaches(params?: { specialty?: string }): Promise<Coach[]> {
  const qs =
    params?.specialty && params.specialty !== 'all' ? `?specialty=${params.specialty}` : '';
  return request<Coach[]>(`/coaches${qs}`);
}

export function getCoachDetail(id: number): Promise<Coach> {
  return request<Coach>(`/coaches/${id}`);
}

export function addCoachReview(
  coachId: number,
  data: { rating: number; text: string; tags?: string[] },
): Promise<Review> {
  return request<Review>(`/coaches/${coachId}/reviews`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Categories ───────────────────────────────────────────

export function getCategories(): Promise<Category[]> {
  return request<Category[]>('/categories');
}
