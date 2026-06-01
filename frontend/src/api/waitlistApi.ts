import { request, requestProtected } from './client';

export type WaitlistDeviceType = 'ios' | 'android' | 'both';
export type WaitlistUserRole =
  | 'student'
  | 'white_collar'
  | 'fitness_user'
  | 'coach'
  | 'merchant'
  | 'developer'
  | 'other';
export type WaitlistQualityLevel = 'high' | 'medium' | 'low';
export type WaitlistStatus = 'pending' | 'invited' | 'accepted' | 'rejected' | 'exported';

export interface SubmitAppWaitlistInput {
  email: string;
  phone?: string;
  country: string;
  region?: string;
  city: string;
  preferredLanguage: string;
  timezone: string;
  deviceType: WaitlistDeviceType;
  scenarios: string[];
  interests?: string[];
  userRole: WaitlistUserRole;
  interviewWilling: boolean;
  inviteCode?: string;
  source?: string;
}

export interface WaitlistEntry {
  id: number;
  email: string;
  phone?: string | null;
  country: string;
  region?: string;
  city: string;
  preferredLanguage?: string;
  timezone?: string;
  deviceType: WaitlistDeviceType;
  scenarios: string[];
  interests?: string[];
  userRole: WaitlistUserRole;
  interviewWilling: boolean;
  inviteCode?: string | null;
  source?: string;
  qualityScore?: number;
  qualityLevel: WaitlistQualityLevel;
  qualityReasons?: string[];
  status: WaitlistStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface WaitlistStats {
  total: number;
  highQuality: number;
  interviewWilling: number;
  byCountry: CountItem[];
  byCity: CountItem[];
  byDevice: CountItem[];
  byScenario: CountItem[];
  byUserRole: CountItem[];
  byInviteSource: CountItem[];
}

export interface CountItem {
  label: string;
  count: number;
}

export interface InviteCodeDto {
  id: number;
  code: string;
  batchName: string;
  source: string;
  city: string;
  scenario: string;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const waitlistApi = {
  submitApp(data: SubmitAppWaitlistInput) {
    return request<WaitlistEntry>('/waitlist/app', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  validateInvite(inviteCode: string) {
    return request<{
      valid: boolean;
      reason?: string;
      code?: string;
      batchName?: string;
      remainingUses?: number;
    }>('/waitlist/validate-invite', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  },

  track(eventName: string, metadata?: Record<string, unknown>) {
    return request<{ ok: boolean }>('/waitlist/events', {
      method: 'POST',
      body: JSON.stringify({ eventName, metadata: metadata ?? {} }),
    });
  },

  listAdmin(params: {
    page?: number;
    limit?: number;
    q?: string;
    city?: string;
    deviceType?: WaitlistDeviceType | '';
    status?: WaitlistStatus | '';
    qualityLevel?: WaitlistQualityLevel | '';
  }) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return requestProtected<{
      data: WaitlistEntry[];
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }>(`/admin/waitlist?${search.toString()}`);
  },

  getStats() {
    return requestProtected<WaitlistStats>('/admin/waitlist/stats');
  },

  createInviteCode(data: Partial<InviteCodeDto> & { code: string }) {
    return requestProtected<InviteCodeDto>('/admin/invite-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  listInviteCodes() {
    return requestProtected<InviteCodeDto[]>('/admin/invite-codes');
  },
};
