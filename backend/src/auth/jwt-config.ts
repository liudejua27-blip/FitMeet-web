import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

type JwtExpiresIn = NonNullable<
  NonNullable<JwtModuleOptions['signOptions']>['expiresIn']
>;

const PLACEHOLDER_PATTERN =
  /^(|change_me.*|your-.*|replace-.*|.*_here|dev-secret|secret_key|password)$/i;

export function getJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  if (!secret || PLACEHOLDER_PATTERN.test(secret)) {
    if (isProduction) {
      throw new Error('JWT_SECRET is required in production');
    }

    return 'dev-secret';
  }

  if (isProduction && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  return secret;
}

export function getJwtModuleOptions(
  configService: ConfigService,
): JwtModuleOptions {
  const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') ??
    '7d') as JwtExpiresIn;

  return {
    secret: getJwtSecret(configService),
    signOptions: {
      expiresIn,
    },
  };
}
