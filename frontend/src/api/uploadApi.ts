import { getToken } from './client';

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
     throw new Error(`Upload Failed: ${res.statusText} ${body}`);
  }
  return res.json() as Promise<T>;
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
