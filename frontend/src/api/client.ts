import type {
  Post, Meet, Coach, Category, Friend, UserProfile,
  MeetRecord, Comment, Review, VirtualGift,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Stored JWT token key */
const TOKEN_KEY = 'fitmate-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Generic fetch wrapper with error handling and typing.
 * Automatically attaches JWT Authorization header.
 */
export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const token = getToken();
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${res.statusText} — ${body}`);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: UserProfile;
}

export function register(data: { email: string; password: string; name: string }): Promise<AuthResult> {
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

// ── Feed / Discover ──────────────────────────────────────

export function getFeed(params?: { category?: string }): Promise<Post[]> {
  const qs = params?.category && params.category !== 'all' ? `?category=${params.category}` : '';
  return request<Post[]>(`/feed${qs}`);
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

export function getMeets(params?: { type?: string }): Promise<Meet[]> {
  const qs = params?.type && params.type !== 'all' ? `?type=${params.type}` : '';
  return request<Meet[]>(`/meets${qs}`);
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

export function getMeetRecords(): Promise<MeetRecord[]> {
  return request<MeetRecord[]>('/meets/records/me');
}

// ── Coach ────────────────────────────────────────────────

export function getCoaches(params?: { specialty?: string }): Promise<Coach[]> {
  const qs = params?.specialty && params.specialty !== 'all' ? `?specialty=${params.specialty}` : '';
  return request<Coach[]>(`/coaches${qs}`);
}

export function getCoachDetail(id: number): Promise<Coach> {
  return request<Coach>(`/coaches/${id}`);
}

export function addCoachReview(coachId: number, data: { rating: number; text: string; tags?: string[] }): Promise<Review> {
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
}

export interface StartConversationResponse {
  conversationId: string;
}

export function getConversations(): Promise<ApiConversation[]> {
  return request<ApiConversation[]>('/messages/conversations');
}

export function getMessages(conversationId: string): Promise<ApiMessage[]> {
  return request<ApiMessage[]>(`/messages/conversations/${conversationId}/messages`);
}

export function sendMessage(conversationId: string, text: string): Promise<ApiMessage> {
  return request<ApiMessage>(`/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function startConversation(otherUserId: number): Promise<StartConversationResponse> {
  return request<StartConversationResponse>('/messages/conversations', {
    method: 'POST',
    body: JSON.stringify({ otherUserId }),
  });
}

export function getUnreadMessageCount(): Promise<{ unreadCount: number }> {
  return request('/messages/unread');
}

// ── Notifications ────────────────────────────────────────

export interface ApiNotification {
  _id: string;
  userId: number;
  type: 'like' | 'comment' | 'follow' | 'meet' | 'system';
  text: string;
  fromUserId?: number;
  fromUsername?: string;
  fromAvatar?: string;
  fromColor?: string;
  read: boolean;
  targetId?: number;
  createdAt: string;
}

export function getNotifications(): Promise<ApiNotification[]> {
  return request<ApiNotification[]>('/notifications');
}

export function getUnreadNotificationCount(): Promise<{ count: number }> {
  return request('/notifications/unread');
}

export function markNotificationAsRead(id: string): Promise<void> {
  return request(`/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<void> {
  return request('/notifications/read-all', { method: 'POST' });
}

// ── Gifts ────────────────────────────────────────────────

export function getGifts(): Promise<VirtualGift[]> {
  return request<VirtualGift[]>('/gifts');
}
