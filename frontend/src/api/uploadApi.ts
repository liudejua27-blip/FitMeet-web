import { ApiError, getToken } from './client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const token = getToken();
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Custom fetch for multipart form data - we don't set Content-Type manually
  const res = await fetch(url, {
    headers: { ...authHeaders, ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const parsed = parseErrorBody(body);
    throw new ApiError(
      res.status,
      resolveUploadErrorMessage(parsed, res.statusText),
      parsed,
      body,
    );
  }
  return res.json() as Promise<T>;
}

function parseErrorBody(body: string) {
  if (!body.trim()) return undefined;
  try {
    const data = JSON.parse(body) as { message?: string | string[]; error?: string };
    return typeof data === 'object' && data !== null ? data : undefined;
  } catch {
    return undefined;
  }
}

function resolveUploadErrorMessage(
  payload: { message?: string | string[]; error?: string } | undefined,
  statusText: string,
) {
  if (Array.isArray(payload?.message)) return payload.message.join('，');
  if (payload?.message) return payload.message;
  if (payload?.error) return payload.error;
  return statusText || '上传失败';
}

export async function uploadImage(file: File): Promise<{ url: string; width: number; height: number }> {
  const formData = new FormData();
  formData.append('file', file);

  return request<{ url: string; width: number; height: number }>('/uploads/image', {
    method: 'POST',
    body: formData,
    // Do not set Content-Type header; browser sets it with boundary
    headers: {},
  });
}

export async function uploadVideo(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  return request<{ url: string }>('/uploads/video', {
    method: 'POST',
    body: formData,
    headers: {},
  });
}
