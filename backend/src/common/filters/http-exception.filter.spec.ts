import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let loggerError: jest.SpyInstance;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips query strings from 4xx logs and response paths', () => {
    const filter = new HttpExceptionFilter();
    const response = createResponse();
    const host = createHost({
      request: {
        method: 'POST',
        path: '/api/auth/login',
        url: '/api/auth/login?token=secret',
        user: { id: 7 },
      },
      response,
    });

    filter.catch(new BadRequestException('Invalid login'), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/auth/login',
        code: 'VALIDATION_FAILED',
        message: 'Invalid login',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'secret',
    );
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn.mock.calls[0][0]).toContain('/api/auth/login');
    expect(loggerWarn.mock.calls[0][0]).not.toContain('secret');
  });

  it('redacts sensitive fields from 4xx logs', () => {
    const filter = new HttpExceptionFilter();
    const response = createResponse();
    const host = createHost({
      request: {
        method: 'POST',
        path: '/api/life-graph/extract-from-chat',
        url: '/api/life-graph/extract-from-chat',
        user: { id: 7 },
      },
      response,
    });

    filter.catch(
      new BadRequestException({
        message: '手机号 15253005312，地址 青岛大学1号楼302',
        details: {
          content: '私聊里说微信 wx_fitmeet_2026',
          lat: 36.123456,
        },
      }),
      host,
    );

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    const log = loggerWarn.mock.calls[0][0];
    expect(log).not.toContain('15253005312');
    expect(log).not.toContain('wx_fitmeet_2026');
    expect(log).not.toContain('36.123456');
    expect(log).toContain('[REDACTED');
  });

  it('strips query strings from 5xx logs and response paths', () => {
    const filter = new HttpExceptionFilter();
    const response = createResponse();
    const host = createHost({
      request: {
        method: 'GET',
        url: '/api/ready?access_token=secret',
      },
      response,
    });

    filter.catch(new InternalServerErrorException('database offline'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/ready',
        code: 'INTERNAL_ERROR',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'secret',
    );
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(loggerError.mock.calls[0][0]).toContain('/api/ready');
    expect(loggerError.mock.calls[0][0]).not.toContain('secret');
  });
});

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

function createHost(input: {
  request: {
    method: string;
    path?: string;
    url: string;
    user?: { id: number };
  };
  response: ReturnType<typeof createResponse>;
}): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => input.request,
      getResponse: () => input.response,
    }),
  } as unknown as ArgumentsHost;
}
