import {
  type ArgumentMetadata,
  type PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

function getAllowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS)
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*');

  if (configured?.length) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    return ['https://www.ourfitmeet.cn', 'https://ourfitmeet.cn'];
  }

  return ['http://localhost:5173', 'http://localhost:3000'];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = getAllowedOrigins();

  app.use(stripCallerControlledUserId);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          scriptSrc: ["'self'", 'https://webapi.amap.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(
        allowedOrigins.includes(origin)
          ? null
          : new Error('Not allowed by CORS'),
        allowedOrigins.includes(origin),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-Token'],
  });

  app.use(compression());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new StripCallerControlledUserIdPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useStaticAssets(path.join(__dirname, '..', 'public'), {
    prefix: '/',
    maxAge: '1d',
  });
  app.set('trust proxy', 1);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api`);
}

class StripCallerControlledUserIdPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (
      metadata.type === 'body' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'userId' in value
    ) {
      delete (value as Record<string, unknown>).userId;
    }
    return value;
  }
}

function stripCallerControlledUserId(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const body = req.body as Record<string, unknown> | undefined;
  if (
    body &&
    typeof body === 'object' &&
    'userId' in body &&
    /\/api\/(social-requests|agent\/social-requests|agent\/social-intents|agents\/social-requests)/.test(
      req.path,
    )
  ) {
    delete body.userId;
  }
  next();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
