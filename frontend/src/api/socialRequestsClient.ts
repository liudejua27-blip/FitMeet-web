import type { SocialCandidate, SocialRequest } from '../types';
import { request } from './baseClient';

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
