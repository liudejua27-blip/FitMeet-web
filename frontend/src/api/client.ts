import type {
  Post,
  Meet,
  Club,
  ClubMember,
  Coach,
  Category,
  Friend,
  UserProfile,
  MeetRecord,
  Comment,
  Review,
  SocialCandidate,
  SocialRequest,
  PublicSocialIntent,
} from '../types';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
export const AUTH_EXPIRED_MESSAGE = '登录已过期，请重新登录';

/** Stored JWT token key */
const TOKEN_KEY = STORAGE_KEYS.token;
migrateLocalStorageKey(STORAGE_KEYS.legacyToken, TOKEN_KEY);
const TOKEN_FALLBACK_KEYS = [
  STORAGE_KEYS.legacyToken,
  'fitmeet-token',
  'fitmate-token',
  'accessToken',
  'authToken',
  'token',
  'fitmeet_token',
  'fitmeetToken',
] as const;

type ApiErrorResponse = {
  message?: string | string[] | Record<string, unknown>;
  error?: string;
  statusCode?: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload?: ApiErrorResponse;
  readonly rawBody?: string;

  constructor(
    status: number,
    message: string,
    payload?: ApiErrorResponse,
    rawBody?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.rawBody = rawBody;
  }
}

export function getToken(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const current = storage.getItem(TOKEN_KEY);
  if (current) return current;

  for (const key of TOKEN_FALLBACK_KEYS) {
    if (key === TOKEN_KEY) continue;
    const value = storage.getItem(key);
    if (value) {
      storage.setItem(TOKEN_KEY, value);
      storage.removeItem(key);
      return value;
    }
  }
  return null;
}

export function requireToken(): string {
  const token = getToken();
  if (!token) {
    throw new ApiError(401, AUTH_EXPIRED_MESSAGE, {
      message: AUTH_EXPIRED_MESSAGE,
      statusCode: 401,
    });
  }
  return token;
}

export function setToken(token: string): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(TOKEN_KEY, token);
  storage.removeItem(STORAGE_KEYS.legacyToken);
}

export function clearToken(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(STORAGE_KEYS.legacyToken);
  for (const key of TOKEN_FALLBACK_KEYS) {
    storage.removeItem(key);
  }
}

/**
 * Generic fetch wrapper with error handling and typing.
 * Automatically attaches JWT Authorization header.
 */
export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = resolveApiUrl(endpoint);
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: buildHeaders(options?.headers, token),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const payload = parseApiErrorBody(body);
    throw new ApiError(
      res.status,
      resolveApiErrorMessage(payload, body, res.statusText, res.status),
      payload,
      body,
    );
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function requestProtected<T>(endpoint: string, options?: RequestInit): Promise<T> {
  requireToken();
  return request<T>(endpoint, options);
}

export function fetchWithAuth(endpoint: string, options?: RequestInit): Promise<Response> {
  const token = requireToken();
  return fetch(resolveApiUrl(endpoint), {
    ...options,
    headers: buildHeaders(options?.headers, token),
  });
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function resolveApiUrl(endpoint: string): string {
  return /^https?:\/\//i.test(endpoint) ? endpoint : `${API_BASE_URL}${endpoint}`;
}

function buildHeaders(headers: HeadersInit | undefined, token: string | null): HeadersInit {
  const merged: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) merged.Authorization = `Bearer ${token}`;
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      merged[key] = value;
    });
  }
  return merged;
}

function parseApiErrorBody(body: string): ApiErrorResponse | undefined {
  if (!body.trim()) return undefined;

  try {
    const parsed = JSON.parse(body) as ApiErrorResponse;
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function resolveApiErrorMessage(
  payload: ApiErrorResponse | undefined,
  rawBody: string,
  statusText: string,
  status: number,
): string {
  if (status === 504) return '请求超时，但你的补充信息已保存。请稍后重试。';
  const message = payload?.message;
  if (Array.isArray(message)) return message.join('；');
  if (typeof message === 'string' && message.trim()) {
    if (status === 401 && /^unauthorized$/i.test(message.trim())) return AUTH_EXPIRED_MESSAGE;
    return message;
  }
  if (typeof message === 'object' && message !== null) {
    const nested = message.message;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  if (status === 401) return AUTH_EXPIRED_MESSAGE;
  if (payload?.error) return payload.error;
  if (/^\s*</.test(rawBody)) return '服务器返回了不可读的错误页面，请稍后重试。';
  if (rawBody.trim()) return rawBody;
  return statusText || '请求失败';
}

// ── Auth ─────────────────────────────────────────────────

export interface AuthResult {
  access_token: string;
  refresh_token?: string;
  user: UserProfile;
}

export function register(data: {
  email: string;
  password: string;
  name: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function login(data: { email: string; password: string }): Promise<AuthResult> {
  return request<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── SMS / Phone Auth ─────────────────────────────────────

export function sendSmsCode(phone: string): Promise<{ message: string; expiresIn: number }> {
  return request('/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function loginWithPhone(phone: string, code: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/sms/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

// ── WeChat Auth ──────────────────────────────────────────

export function getWechatLoginUrl(): Promise<{ url: string }> {
  return request('/auth/wechat/url');
}

export function loginWithWechat(code: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/wechat/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

// ── Refresh Token ────────────────────────────────────────

export function refreshToken(token: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/auth/profile');
}

export interface CreateSocialRequestInput {
  requestType: string;
  title?: string;
  description: string;
  city?: string;
  loc?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  timePreference?: string;
  visibility?: string;
  verifiedOnly?: boolean;
  interests?: string[];
  limit?: number;
}

export function getSocialRequests(): Promise<SocialRequest[]> {
  return request<SocialRequest[]>('/agents/social-requests');
}

export function createSocialRequest(data: CreateSocialRequestInput): Promise<{
  request: SocialRequest;
  candidates: SocialCandidate[];
}> {
  return request('/agents/social-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Feed / Discover ──────────────────────────────────────

export function getFeed(params?: {
  category?: string;
  page?: number;
  pageSize?: number;
  lat?: number;
  lng?: number;
}): Promise<Post[]> {
  const search = new URLSearchParams();
  if (params?.category && params.category !== 'all') search.set('category', params.category);
  if (params?.page) search.set('page', String(params.page));
  // Backend uses "limit" for page size.
  if (params?.pageSize) search.set('limit', String(params.pageSize));
  if (Number.isFinite(params?.lat)) search.set('lat', String(params?.lat));
  if (Number.isFinite(params?.lng)) search.set('lng', String(params?.lng));
  const qs = search.toString();
  return request<{ data: Post[] }>(`/feed${qs ? `?${qs}` : ''}`).then((r) => r.data);
}

export function createPost(data: Partial<Post>): Promise<Post> {
  return request<Post>('/feed', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function likePost(id: number): Promise<{ liked: boolean }> {
  return request(`/feed/${id}/like`, { method: 'POST' });
}

export function savePost(id: number): Promise<{ saved: boolean }> {
  return request(`/feed/${id}/save`, { method: 'POST' });
}

export function getPostInteractions(): Promise<{ likedPostIds: number[]; savedPostIds: number[] }> {
  return request('/feed/interactions');
}

export function getPublicSocialIntents(params?: {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: string;
  status?: string;
}): Promise<PublicSocialIntent[]> {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.q) search.set('q', params.q);
  if (params?.city) search.set('city', params.city);
  if (params?.requestType) search.set('requestType', params.requestType);
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return request<{ data: PublicSocialIntent[] }>(`/public/social-intents${qs ? `?${qs}` : ''}`).then(
    (r) => r.data,
  );
}

// ── Comments ─────────────────────────────────────────────

export function getComments(postId: number): Promise<Comment[]> {
  return request<Comment[]>(`/feed/${postId}/comments`);
}

export function addComment(postId: number, text: string): Promise<Comment> {
  return request<Comment>(`/feed/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function likeComment(commentId: number): Promise<void> {
  return request(`/feed/comments/${commentId}/like`, { method: 'POST' });
}

// ── Users ────────────────────────────────────────────────

export function getUser(id: number): Promise<UserProfile> {
  return request<UserProfile>(`/users/${id}`);
}

export function updateProfile(data: Partial<UserProfile>): Promise<UserProfile> {
  return request<UserProfile>('/users/profile', {
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

// ── Messages ─────────────────────────────────────────────

export interface ApiConversation {
  id: string;
  userId: number;
  username: string;
  avatar: string;
  color: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

export interface ApiMessage {
  id: string;
  text: string;
  time: string;
  isMine: boolean;
  source?: 'user' | 'ai_delegate';
  card?: {
    type: 'fitmeet_contact_card';
    userId: number;
    name: string;
    profileUrl: string;
    sports: string[];
    city: string;
  } | null;
}

export interface StartConversationResponse {
  conversationId: string;
  targetUserId?: number;
  preexisting?: boolean;
}

export function getConversations(): Promise<ApiConversation[]> {
  return request<ApiConversation[]>('/messages/conversations');
}

export function getMessages(conversationId: string): Promise<ApiMessage[]> {
  return request<ApiMessage[]>(`/messages/conversations/${conversationId}`);
}

export function sendMessage(conversationId: string, text: string): Promise<ApiMessage> {
  return request<ApiMessage>(`/messages/conversations/${conversationId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function startConversation(otherUserId: number): Promise<StartConversationResponse> {
  return request<StartConversationResponse>('/messages/start', {
    method: 'POST',
    body: JSON.stringify({ otherUserId }),
  });
}

export function startPublicIntentConversation(publicIntentId: string, text: string): Promise<StartConversationResponse> {
  return request<StartConversationResponse>(`/messages/public-intents/${encodeURIComponent(publicIntentId)}/start`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function getUnreadMessageCount(): Promise<{ unreadCount: number }> {
  return request('/messages/unread');
}

// ── Notifications ────────────────────────────────────────

export interface ApiNotification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'meet' | 'system';
  username: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  read: boolean;
  targetId?: number;
}

export function getNotifications(): Promise<ApiNotification[]> {
  return request<ApiNotification[]>('/notifications');
}

export function getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
  return request('/notifications/unread');
}

export function markNotificationAsRead(id: string): Promise<void> {
  return request(`/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<void> {
  return request('/notifications/read-all', { method: 'POST' });
}

// Safety

export type SafetyReport = {
  id: number;
  reporterId: number;
  targetType: 'user' | 'post' | 'meet' | 'comment';
  targetId: number;
  reason: string;
  description: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'rejected';
  adminNote: string;
  createdAt: string;
};

export type VerificationRequest = {
  id: number;
  userId: number;
  type: 'real_name' | 'coach';
  realName: string;
  idNumberMasked: string;
  certName: string;
  certImageUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string;
  createdAt: string;
};

export type EmergencyContact = {
  id: number;
  name: string;
  phone: string;
  relation: string;
};

export function createReport(data: {
  targetType: SafetyReport['targetType'];
  targetId: number;
  reason: string;
  description?: string;
}) {
  return request<SafetyReport>('/safety/reports', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function blockUser(userId: number) {
  return request<{ blocked: boolean }>(`/safety/blocks/${userId}`, {
    method: 'POST',
  });
}

export function getBlockedUserIds() {
  return request<number[]>('/safety/blocks/ids');
}

export function createVerificationRequest(data: {
  type: VerificationRequest['type'];
  realName?: string;
  idNumberMasked?: string;
  certName?: string;
  certImageUrl?: string;
}) {
  return request<VerificationRequest>('/safety/verifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getMyVerificationRequests() {
  return request<VerificationRequest[]>('/safety/verifications/me');
}

export function getEmergencyContacts() {
  return request<EmergencyContact[]>('/safety/emergency-contacts');
}

export function addEmergencyContact(data: { name: string; phone: string; relation: string }) {
  return request<EmergencyContact>('/safety/emergency-contacts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteEmergencyContact(id: number) {
  return request<{ deleted: boolean }>(`/safety/emergency-contacts/${id}`, {
    method: 'DELETE',
  });
}

export function listSafetyReports() {
  return request<SafetyReport[]>('/safety/admin/reports');
}

export function updateSafetyReport(
  id: number,
  data: { status: SafetyReport['status']; adminNote?: string },
) {
  return request<SafetyReport>(`/safety/admin/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function listVerificationRequests() {
  return request<VerificationRequest[]>('/safety/admin/verifications');
}

export function updateVerificationRequest(
  id: number,
  data: { status: VerificationRequest['status']; adminNote?: string },
) {
  return request<VerificationRequest>(`/safety/admin/verifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
