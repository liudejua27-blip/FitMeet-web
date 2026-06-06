import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs successful HTTP requests as structured JSON without query strings', async () => {
    const logger = createLogger();
    const interceptor = new LoggingInterceptor(1000, logger);
    const context = createContext({
      method: 'GET',
      path: '/api/auth/profile',
      url: '/api/auth/profile?token=secret',
      statusCode: 200,
      userId: 7,
    });
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(136);

    await lastValueFrom(interceptor.intercept(context, okHandler()));

    expect(logger.warn).not.toHaveBeenCalled();
    expect(JSON.parse(logger.log.mock.calls[0][0])).toEqual({
      event: 'backend.http.request',
      method: 'GET',
      path: '/api/auth/profile',
      status: 200,
      durationMs: 36,
      userId: 7,
    });
    expect(logger.log.mock.calls[0][0]).not.toContain('secret');
  });

  it('warns for slow HTTP requests', async () => {
    const logger = createLogger();
    const interceptor = new LoggingInterceptor(50, logger);
    const context = createContext({
      method: 'POST',
      path: '/api/feed',
      url: '/api/feed',
      statusCode: 201,
    });
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(190);

    await lastValueFrom(interceptor.intercept(context, okHandler()));

    expect(logger.log).not.toHaveBeenCalled();
    expect(JSON.parse(logger.warn.mock.calls[0][0])).toEqual({
      event: 'backend.http.slow_request',
      method: 'POST',
      path: '/api/feed',
      status: 201,
      durationMs: 90,
      userId: null,
    });
  });

  it('falls back to request url path while stripping query parameters', async () => {
    const logger = createLogger();
    const interceptor = new LoggingInterceptor(1000, logger);
    const context = createContext({
      method: 'GET',
      url: '/api/feed?Authorization=Bearer%20secret',
      statusCode: 200,
    });
    jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(105);

    await lastValueFrom(interceptor.intercept(context, okHandler()));

    expect(JSON.parse(logger.log.mock.calls[0][0])).toMatchObject({
      path: '/api/feed',
    });
    expect(logger.log.mock.calls[0][0]).not.toContain('secret');
  });
});

function createLogger() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
  };
}

function okHandler(): CallHandler<unknown> {
  return {
    handle: () => of({ ok: true }),
  };
}

function createContext(input: {
  method: string;
  path?: string;
  url: string;
  statusCode: number;
  userId?: number;
}): ExecutionContext {
  const request = {
    method: input.method,
    path: input.path,
    url: input.url,
    user: input.userId === undefined ? undefined : { id: input.userId },
  };
  const response = { statusCode: input.statusCode };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}
