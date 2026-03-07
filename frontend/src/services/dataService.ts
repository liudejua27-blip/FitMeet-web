/**
 * Data service layer — wraps api/client with mock data fallback.
 *
 * In development (no backend), automatically falls back to local mock data.
 * In production (with backend), calls the real API.
 */
import * as api from '../api/client';
import {
  FEED_DATA,
  MEET_DATA,
  COACH_DATA,
  CATEGORIES,
  FRIENDS,
  VIRTUAL_GIFTS,
  MEET_RECORDS,
  SAMPLE_COMMENTS,
} from '../data/mockData';
import type { Post, Meet, Coach, Category, Friend, UserProfile, MeetRecord, Comment, VirtualGift } from '../types';

/** Whether to attempt real API calls first (set via env var) */
const USE_API = true; // Enabled for backend integration

/**
 * Try API first; on failure fall back to mock data.
 */
async function withFallback<T>(apiFn: () => Promise<T>, mockData: T): Promise<T> {
  if (!USE_API) return mockData;
  try {
    return await apiFn();
  } catch (err) {
    console.warn('[dataService] API unavailable, using mock data', err);
    return mockData;
  }
}

/** Fire-and-forget API call with silent catch */
async function fireApi<T>(apiFn: () => Promise<T>): Promise<T | undefined> {
  if (!USE_API) return undefined;
  try {
    return await apiFn();
  } catch {
    // Optimistic update — already handled in store
    return undefined;
  }
}

// ── Auth ───────────────────────────────────────────────
export async function register(data: { email: string; password: string; name: string }) {
  return api.register(data);
}

export async function login(data: { email: string; password: string }) {
  return api.login(data);
}

export async function getProfile() {
  return api.getProfile();
}

// ── Feed / Discover ────────────────────────────────────
export async function getFeed(params?: { category?: string }): Promise<Post[]> {
  return withFallback(() => api.getFeed(params), filterMock(FEED_DATA, params?.category));
}

export async function createPost(data: Partial<Post>): Promise<Post | undefined> {
  return fireApi(() => api.createPost(data));
}

export async function likePost(id: number) {
  return fireApi(() => api.likePost(id));
}

export async function savePost(id: number) {
  return fireApi(() => api.savePost(id));
}

export async function getPostInteractions() {
  return withFallback(() => api.getPostInteractions(), { likedPostIds: [], savedPostIds: [] });
}

// ── Comments ───────────────────────────────────────────
export async function getComments(postId: number): Promise<Comment[]> {
  return withFallback(() => api.getComments(postId), SAMPLE_COMMENTS);
}

export async function addComment(postId: number, text: string) {
  return fireApi(() => api.addComment(postId, text));
}

export async function likeComment(commentId: number) {
  return fireApi(() => api.likeComment(commentId));
}

// ── Users ──────────────────────────────────────────────
export async function getUser(id: number) {
  return fireApi(() => api.getUser(id));
}

export async function updateUserProfile(data: Partial<UserProfile>) {
  return fireApi(() => api.updateProfile(data));
}

// ── Friends / Follow ───────────────────────────────────
export async function getFriends(): Promise<Friend[]> {
  return withFallback(() => api.getFriends(), FRIENDS);
}

export async function toggleFollow(userId: number) {
  return fireApi(() => api.toggleFollow(userId));
}

export async function getFollowedIds(): Promise<number[]> {
  return withFallback(() => api.getFollowedIds(), []);
}

// ── Meet ───────────────────────────────────────────────
export async function getMeets(params?: { type?: string }): Promise<Meet[]> {
  return withFallback(
    () => api.getMeets(params),
    params?.type && params.type !== 'all'
      ? MEET_DATA.filter((m) => m.type === params.type)
      : MEET_DATA,
  );
}

export async function createMeet(data: Partial<Meet>) {
  return fireApi(() => api.createMeet(data));
}

export async function joinMeet(id: number) {
  return fireApi(() => api.joinMeet(id));
}

export async function getMeetRecords(): Promise<MeetRecord[]> {
  return withFallback(() => api.getMeetRecords(), MEET_RECORDS);
}

// ── Coach ──────────────────────────────────────────────
export async function getCoaches(params?: { specialty?: string }): Promise<Coach[]> {
  return withFallback(
    () => api.getCoaches(params),
    params?.specialty && params.specialty !== 'all'
      ? COACH_DATA.filter((c) => c.specialtyCode === params.specialty)
      : COACH_DATA,
  );
}

export async function getCoachDetail(id: number) {
  return fireApi(() => api.getCoachDetail(id));
}

export async function addCoachReview(coachId: number, data: { rating: number; text: string; tags?: string[] }) {
  return fireApi(() => api.addCoachReview(coachId, data));
}

// ── Categories ─────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  return withFallback(() => api.getCategories(), CATEGORIES);
}

// ── Messages ───────────────────────────────────────────
export async function getConversations() {
  return fireApi(() => api.getConversations());
}

export async function getMessages(conversationId: string) {
  return fireApi(() => api.getMessages(conversationId));
}

export async function sendMessage(conversationId: string, text: string) {
  return fireApi(() => api.sendMessage(conversationId, text));
}

export async function startConversation(otherUserId: number) {
  return fireApi(() => api.startConversation(otherUserId));
}

export async function getUnreadMessageCount() {
  return fireApi(() => api.getUnreadMessageCount());
}

// ── Notifications ──────────────────────────────────────
export async function getNotifications() {
  return fireApi(() => api.getNotifications());
}

export async function getUnreadNotificationCount() {
  return fireApi(() => api.getUnreadNotificationCount());
}

export async function markNotificationAsRead(id: string) {
  return fireApi(() => api.markNotificationAsRead(id));
}

export async function markAllNotificationsRead() {
  return fireApi(() => api.markAllNotificationsRead());
}

// ── Gifts ──────────────────────────────────────────────
export async function getGifts(): Promise<VirtualGift[]> {
  return withFallback(() => api.getGifts(), VIRTUAL_GIFTS);
}

// ── Helpers ────────────────────────────────────────────
function filterMock(data: Post[], category?: string): Post[] {
  if (!category || category === 'all') return data;
  return data.filter((p) => p.type === category || p.sport === category);
}
