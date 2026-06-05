import type { UserProfile } from '../types';
import { request } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

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
  return request<AuthResult>(fitMeetCoreEndpoints.auth.register, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function login(data: { email: string; password: string }): Promise<AuthResult> {
  return request<AuthResult>(fitMeetCoreEndpoints.auth.login, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function sendSmsCode(phone: string): Promise<{ message: string; expiresIn: number }> {
  return request(fitMeetCoreEndpoints.auth.sendSmsCode, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function loginWithPhone(phone: string, code: string): Promise<AuthResult> {
  return request<AuthResult>(fitMeetCoreEndpoints.auth.loginWithPhone, {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function getWechatLoginUrl(): Promise<{ url: string }> {
  return request(fitMeetCoreEndpoints.auth.getWechatLoginUrl);
}

export function loginWithWechat(code: string): Promise<AuthResult> {
  return request<AuthResult>(fitMeetCoreEndpoints.auth.loginWithWechat, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function refreshToken(token: string): Promise<AuthResult> {
  return request<AuthResult>(fitMeetCoreEndpoints.auth.refreshToken, {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>(fitMeetCoreEndpoints.auth.getProfile);
}
