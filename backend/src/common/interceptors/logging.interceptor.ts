import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

type HttpLogger = Pick<Logger, 'log' | 'warn'>;

@Injectable()
export class LoggingInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(
    private readonly slowRequestMs = Number(
      process.env.HTTP_SLOW_REQUEST_MS ?? 1000,
    ),
    private readonly logger: HttpLogger = new Logger('HTTP'),
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - now;
        const payload = {
          event:
            durationMs >= this.slowRequestMs
              ? 'backend.http.slow_request'
              : 'backend.http.request',
          method,
          path: this.safePath(request),
          status: response.statusCode,
          durationMs,
          userId: this.requestUserId(request),
        };

        if (durationMs >= this.slowRequestMs) {
          this.logger.warn(JSON.stringify(payload));
        } else {
          this.logger.log(JSON.stringify(payload));
        }
      }),
    );
  }

  private safePath(request: Request): string {
    if (typeof request.path === 'string' && request.path.length > 0) {
      return request.path;
    }
    return request.url.split('?')[0] || '/';
  }

  private requestUserId(request: Request): number | null {
    const user = (request as Request & { user?: { id?: number } }).user;
    return typeof user?.id === 'number' ? user.id : null;
  }
}
