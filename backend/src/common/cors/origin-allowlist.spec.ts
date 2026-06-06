import {
  getConfiguredAllowedOrigins,
  getHttpAllowedOrigins,
  getSocketAllowedOrigins,
} from './origin-allowlist';

describe('origin allowlist', () => {
  it('parses configured origins from CORS_ORIGIN before ALLOWED_ORIGINS', () => {
    expect(
      getConfiguredAllowedOrigins({
        CORS_ORIGIN: ' https://web.example.com,*, https://app.example.com ',
        ALLOWED_ORIGINS: 'https://ignored.example.com',
      }),
    ).toEqual(['https://web.example.com', 'https://app.example.com']);
  });

  it('falls back to ALLOWED_ORIGINS when CORS_ORIGIN is absent', () => {
    expect(
      getConfiguredAllowedOrigins({
        ALLOWED_ORIGINS: 'https://www.ourfitmeet.cn, https://ourfitmeet.cn',
      }),
    ).toEqual(['https://www.ourfitmeet.cn', 'https://ourfitmeet.cn']);
  });

  it('uses safe HTTP production defaults when no env origins are configured', () => {
    expect(getHttpAllowedOrigins({ NODE_ENV: 'production' })).toEqual([
      'https://www.ourfitmeet.cn',
      'https://ourfitmeet.cn',
    ]);
  });

  it('requires explicit Socket.IO production origins', () => {
    expect(() =>
      getSocketAllowedOrigins('messages', { NODE_ENV: 'production' }),
    ).toThrow(
      'ALLOWED_ORIGINS or CORS_ORIGIN is required for messages gateway',
    );
  });

  it('keeps local dev HTTP and Socket.IO origins aligned', () => {
    const env = { NODE_ENV: 'development' };

    expect(getHttpAllowedOrigins(env)).toEqual(
      getSocketAllowedOrigins('events', env),
    );
  });
});
