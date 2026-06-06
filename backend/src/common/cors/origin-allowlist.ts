const DEFAULT_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

const DEFAULT_PRODUCTION_HTTP_ORIGINS = [
  'https://www.ourfitmeet.cn',
  'https://ourfitmeet.cn',
];

type CorsEnv = Partial<
  Record<'ALLOWED_ORIGINS' | 'CORS_ORIGIN' | 'NODE_ENV', string>
>;

export function getHttpAllowedOrigins(env: CorsEnv = process.env): string[] {
  return (
    getConfiguredAllowedOrigins(env) ??
    (env.NODE_ENV === 'production'
      ? DEFAULT_PRODUCTION_HTTP_ORIGINS
      : DEFAULT_DEVELOPMENT_ORIGINS)
  );
}

export function getSocketAllowedOrigins(
  gatewayName: string,
  env: CorsEnv = process.env,
): string[] {
  const configured = getConfiguredAllowedOrigins(env);
  if (configured) {
    return configured;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `ALLOWED_ORIGINS or CORS_ORIGIN is required for ${gatewayName} gateway`,
    );
  }

  return DEFAULT_DEVELOPMENT_ORIGINS;
}

export function getConfiguredAllowedOrigins(
  env: CorsEnv = process.env,
): string[] | undefined {
  const configured = env.CORS_ORIGIN || env.ALLOWED_ORIGINS;
  const origins = configured
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*');

  return origins?.length ? origins : undefined;
}
