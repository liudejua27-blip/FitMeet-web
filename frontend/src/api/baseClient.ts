import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
export const AUTH_EXPIRED_MESSAGE = '登录已过期，请重新登录';

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
