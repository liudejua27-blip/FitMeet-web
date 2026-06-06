import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  message?: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
}

interface ErrorDescriptor {
  code: string;
  retryable: boolean;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message = this.resolveMessage(exceptionResponse, status);
    const descriptor = this.resolveErrorDescriptor(
      status,
      request.url,
      message,
      exceptionResponse,
    );

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'backend.error',
          method: request.method,
          path: request.url,
          status,
          code: descriptor.code,
          userId: this.requestUserId(request),
        }),
        exception instanceof Error ? exception.stack : exception,
      );
    } else {
      this.logger.warn(
        JSON.stringify({
          event: 'backend.request_failed',
          method: request.method,
          path: request.url,
          status,
          code: descriptor.code,
          userId: this.requestUserId(request),
          response: exceptionResponse,
        }),
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      code: descriptor.code,
      message,
      ...(this.resolveDetails(exceptionResponse) !== undefined
        ? { details: this.resolveDetails(exceptionResponse) }
        : {}),
      error: {
        code: descriptor.code,
        message,
        retryable: descriptor.retryable,
      },
    });
  }

  private resolveMessage(
    response: string | object,
    status: number,
  ): string | string[] {
    if (status >= 500 && process.env.NODE_ENV === 'production') {
      return 'Internal server error';
    }

    if (typeof response === 'string') {
      return response;
    }

    const body = response as ErrorResponseBody;
    return body.message ?? 'Request failed';
  }

  private resolveErrorDescriptor(
    status: number,
    path: string,
    message: string | string[],
    raw: string | object,
  ): ErrorDescriptor {
    const normalized = Array.isArray(message)
      ? message.join(' ').toLowerCase()
      : String(message).toLowerCase();
    const rawCode =
      typeof raw === 'object' ? (raw as ErrorResponseBody).code : undefined;
    if (rawCode) {
      return { code: rawCode, retryable: this.isRetryable(status, rawCode) };
    }

    let code = 'REQUEST_FAILED';
    if (status === Number(HttpStatus.BAD_REQUEST)) code = 'VALIDATION_FAILED';
    if (status === Number(HttpStatus.UNAUTHORIZED)) code = 'UNAUTHORIZED';
    if (status === Number(HttpStatus.FORBIDDEN)) code = 'PERMISSION_DENIED';
    if (status === Number(HttpStatus.NOT_FOUND)) code = 'NOT_FOUND';
    if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) code = 'RATE_LIMITED';
    if (status >= 500) code = 'INTERNAL_ERROR';

    if (path.includes('/agent')) {
      if (
        status === Number(HttpStatus.UNAUTHORIZED) &&
        normalized.includes('missing')
      ) {
        code = 'AGENT_TOKEN_MISSING';
      } else if (
        status === Number(HttpStatus.UNAUTHORIZED) &&
        normalized.includes('invalid')
      ) {
        code = 'AGENT_TOKEN_INVALID';
      } else if (
        status === Number(HttpStatus.FORBIDDEN) &&
        normalized.includes('revoked')
      ) {
        code = 'AGENT_TOKEN_REVOKED';
      } else if (normalized.includes('approval')) {
        code = 'OWNER_CONFIRMATION_REQUIRED';
      } else if (normalized.includes('allow') && normalized.includes('send')) {
        code = 'RECIPIENT_AGENT_MESSAGES_DISABLED';
      } else if (
        normalized.includes('safety') ||
        normalized.includes('blocked') ||
        normalized.includes('policy')
      ) {
        code = 'SAFETY_BLOCKED';
      }
    }

    return { code, retryable: this.isRetryable(status, code) };
  }

  private isRetryable(status: number, code: string) {
    return (
      status === Number(HttpStatus.TOO_MANY_REQUESTS) ||
      status >= 500 ||
      code === 'OWNER_CONFIRMATION_REQUIRED'
    );
  }

  private resolveDetails(response: string | object) {
    if (typeof response !== 'object') {
      return undefined;
    }
    return (response as ErrorResponseBody).details;
  }

  private requestUserId(request: Request): number | null {
    const user = (request as Request & { user?: { id?: number } }).user;
    return typeof user?.id === 'number' ? user.id : null;
  }
}
