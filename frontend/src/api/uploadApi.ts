import { API_BASE_URL, ApiError, getToken } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

type UploadErrorResponse = {
  message?: string | string[] | Record<string, unknown>;
  error?:
    | string
    | {
        code?: string;
        message?: string;
        retryable?: boolean;
      };
  code?: string;
  details?: unknown;
  statusCode?: number;
};

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getToken();
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Custom fetch for multipart form data - we don't set Content-Type manually
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
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
    const data = JSON.parse(body) as UploadErrorResponse;
    return typeof data === 'object' && data !== null ? data : undefined;
  } catch {
    return undefined;
  }
}

function resolveUploadErrorMessage(
  payload: UploadErrorResponse | undefined,
  statusText: string,
) {
  if (Array.isArray(payload?.message)) return payload.message.join('，');
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
  if (typeof payload?.message === 'object' && payload.message !== null) {
    const nested = payload.message.message;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  if (typeof payload?.error === 'object' && typeof payload.error.message === 'string') {
    return payload.error.message;
  }
  if (typeof payload?.error === 'string') return payload.error;
  return statusText || '上传失败';
}

export async function uploadImage(file: File): Promise<{ url: string; width: number; height: number }> {
  const formData = new FormData();
  formData.append('file', file);

  return request<{ url: string; width: number; height: number }>(fitMeetCoreEndpoints.uploads.image, {
    method: 'POST',
    body: formData,
    // Do not set Content-Type header; browser sets it with boundary
    headers: {},
  });
}

export async function uploadVideo(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  return request<{ url: string }>(fitMeetCoreEndpoints.uploads.video, {
    method: 'POST',
    body: formData,
    headers: {},
  });
}

type UploadWithProgressOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: {
    loaded: number;
    total: number | null;
    percent: number | null;
  }) => void;
};

function requestUploadWithProgress<T>(
  endpoint: string,
  file: File,
  options: UploadWithProgressOptions = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    const abort = () => {
      xhr.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : null;
      options.onProgress?.({
        loaded: event.loaded,
        total,
        percent: total ? Math.round((event.loaded / total) * 100) : null,
      });
    };

    xhr.onerror = () => reject(new ApiError(0, '网络上传失败'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.onload = () => {
      options.signal?.removeEventListener('abort', abort);
      const body = xhr.responseText ?? '';
      if (xhr.status < 200 || xhr.status >= 300) {
        const parsed = parseErrorBody(body);
        reject(
          new ApiError(
            xhr.status,
            resolveUploadErrorMessage(parsed, xhr.statusText),
            parsed,
            body,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new ApiError(xhr.status, '上传响应不可读', undefined, body));
      }
    };

    xhr.send(formData);
  });
}

export function uploadImageWithProgress(
  file: File,
  options?: UploadWithProgressOptions,
): Promise<{ url: string; width: number; height: number }> {
  return requestUploadWithProgress(fitMeetCoreEndpoints.uploads.image, file, options);
}

export function uploadVideoWithProgress(
  file: File,
  options?: UploadWithProgressOptions,
): Promise<{ url: string }> {
  return requestUploadWithProgress(fitMeetCoreEndpoints.uploads.video, file, options);
}
