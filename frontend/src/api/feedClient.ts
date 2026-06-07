import type {
  Comment,
  Post,
  PublicSocialIntent,
  PublicSocialIntentMatches,
} from '../types';
import { request } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export interface FeedPageMetadata {
  total: number;
  page: number;
  lastPage: number;
}

export interface FeedPage {
  data: Post[];
  metadata: FeedPageMetadata;
}

export type FeedQueryParams = {
  category?: string;
  page?: number;
  pageSize?: number;
  lat?: number;
  lng?: number;
};

function feedPath(params?: FeedQueryParams): string {
  const search = new URLSearchParams();
  if (params?.category && params.category !== 'all') search.set('category', params.category);
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize) search.set('limit', String(params.pageSize));
  if (Number.isFinite(params?.lat)) search.set('lat', String(params?.lat));
  if (Number.isFinite(params?.lng)) search.set('lng', String(params?.lng));
  const qs = search.toString();
  return `${fitMeetCoreEndpoints.feed.getFeed}${qs ? `?${qs}` : ''}`;
}

export function getFeedPage(params?: FeedQueryParams): Promise<FeedPage> {
  return request<FeedPage>(feedPath(params));
}

export function getFeed(params?: FeedQueryParams): Promise<Post[]> {
  return getFeedPage(params).then((r) => r.data);
}

export function createPost(data: Partial<Post>): Promise<Post> {
  return request<Post>(fitMeetCoreEndpoints.feed.createPost, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function likePost(id: number): Promise<{ liked: boolean }> {
  return request(fitMeetCoreEndpoints.feed.likePost(id), { method: 'POST' });
}

export function savePost(id: number): Promise<{ saved: boolean }> {
  return request(fitMeetCoreEndpoints.feed.savePost(id), { method: 'POST' });
}

export function getPostInteractions(): Promise<{ likedPostIds: number[]; savedPostIds: number[] }> {
  return request(fitMeetCoreEndpoints.feed.getPostInteractions);
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
  return request<{ data: PublicSocialIntent[] }>(
    `${fitMeetCoreEndpoints.feed.publicSocialIntents}${qs ? `?${qs}` : ''}`,
  ).then((r) => r.data);
}

export function getPublicSocialIntent(id: string): Promise<PublicSocialIntent> {
  return request<PublicSocialIntent>(
    fitMeetCoreEndpoints.feed.publicSocialIntent(id),
  );
}

export function getPublicSocialIntentMatches(
  id: string,
): Promise<PublicSocialIntentMatches> {
  return request<PublicSocialIntentMatches>(
    fitMeetCoreEndpoints.feed.publicSocialIntentMatches(id),
  );
}

export function getComments(postId: number): Promise<Comment[]> {
  return request<Comment[]>(fitMeetCoreEndpoints.feed.getComments(postId));
}

export function addComment(postId: number, text: string): Promise<Comment> {
  return request<Comment>(fitMeetCoreEndpoints.feed.addComment(postId), {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export function likeComment(commentId: number): Promise<void> {
  return request(fitMeetCoreEndpoints.feed.likeComment(commentId), { method: 'POST' });
}
