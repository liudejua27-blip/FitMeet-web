import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, AUTH_EXPIRED_MESSAGE, request } from '../api/baseClient';

describe('baseClient ApiError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('maps the backend standard error envelope to code and retryable fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          statusCode: 503,
          code: 'SERVICE_NOT_READY',
          message: 'Service dependencies are not ready',
          error: {
            code: 'SERVICE_NOT_READY',
            message: 'Service dependencies are not ready',
            retryable: true,
          },
        },
        503,
      ),
    );

    await expect(request('/ready')).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_NOT_READY',
      retryable: true,
      message: 'Service dependencies are not ready',
    } satisfies Partial<ApiError>);
  });

  it('uses nested backend error messages when the top-level message is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          error: {
            code: 'VALIDATION_FAILED',
            message: '动态内容不能为空',
            retryable: false,
          },
        },
        400,
      ),
    );

    try {
      await request('/public/social-intents', {
        method: 'POST',
        body: JSON.stringify({ text: ' ' }),
      });
      throw new Error('Expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        retryable: false,
        message: '动态内容不能为空',
      });
    }
  });

  it('keeps Unauthorized responses mapped to the shared login-expired message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401),
    );

    await expect(request('/auth/profile')).rejects.toMatchObject({
      status: 401,
      message: AUTH_EXPIRED_MESSAGE,
    });
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
