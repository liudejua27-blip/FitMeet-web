import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, setToken } from '../api/baseClient';
import { uploadImage } from '../api/uploadApi';

describe('uploadApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('sends multipart image uploads with auth and browser-managed content type', async () => {
    setToken('access.jwt');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        url: 'https://cdn.fitmeet.test/avatar.webp',
        width: 640,
        height: 640,
      }),
    );

    const file = new File(['image-bytes'], 'avatar.jpg', { type: 'image/jpeg' });
    const result = await uploadImage(file);

    expect(result.url).toBe('https://cdn.fitmeet.test/avatar.webp');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/uploads/image',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
        headers: { Authorization: 'Bearer access.jwt' },
      }),
    );
  });

  it('maps structured backend upload errors into ApiError code and retryability', async () => {
    setToken('access.jwt');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          error: {
            code: 'VALIDATION_FAILED',
            message: 'No file uploaded',
            retryable: false,
          },
        },
        400,
      ),
    );

    try {
      await uploadImage(new File([], 'empty.jpg', { type: 'image/jpeg' }));
      throw new Error('Expected upload to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        retryable: false,
        message: 'No file uploaded',
      });
    }
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
