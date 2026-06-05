export type EnvIssueSeverity = 'error' | 'warning';

export interface ProductionEnvIssue {
  severity: EnvIssueSeverity;
  key: string;
  message: string;
}

export interface ProductionEnvReport {
  ok: boolean;
  errors: ProductionEnvIssue[];
  warnings: ProductionEnvIssue[];
}

type EnvMap = Record<string, string>;

const PLACEHOLDER_PATTERN =
  /^(|change_me.*|your-.*|replace-.*|.*_here|secret_key|password|example)$/i;

const CORE_REQUIRED_KEYS = [
  'NODE_ENV',
  'PORT',
  'BASE_URL',
  'FRONTEND_BASE_URL',
  'ALLOWED_ORIGINS',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'MONGO_URI',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'AGENT_WEBHOOK_SIGNING_SECRET',
];

const DOCKER_REQUIRED_KEYS = ['MONGO_USERNAME', 'MONGO_PASSWORD'];

const OPTIONAL_BUT_LAUNCH_CRITICAL_KEYS = [
  'SMS_ACCESS_KEY',
  'SMS_SECRET_KEY',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'WECHAT_MINI_APP_ID',
  'WECHAT_MINI_APP_SECRET',
  'AMAP_WEB_SERVICE_KEY',
];

export function parseEnvFile(content: string): EnvMap {
  const env: EnvMap = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = normalized.indexOf('=');
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    const value = stripEnvQuotes(normalized.slice(eq + 1).trim());
    if (key) env[key] = value;
  }
  return env;
}

export function buildProductionEnvReport(env: EnvMap): ProductionEnvReport {
  const issues: ProductionEnvIssue[] = [];
  const error = (key: string, message: string) =>
    issues.push({ severity: 'error', key, message });
  const warning = (key: string, message: string) =>
    issues.push({ severity: 'warning', key, message });

  for (const key of CORE_REQUIRED_KEYS) {
    requireConfigured(env, key, error);
  }
  for (const key of DOCKER_REQUIRED_KEYS) {
    requireConfigured(env, key, error);
  }

  if (env.NODE_ENV !== 'production') {
    error('NODE_ENV', 'must be exactly "production" for release readiness.');
  }
  if (env.DB_SYNCHRONIZE !== 'false') {
    error('DB_SYNCHRONIZE', 'must be false in production.');
  }
  if (env.DB_MIGRATIONS_RUN === 'true') {
    warning(
      'DB_MIGRATIONS_RUN',
      'auto-running migrations on boot is risky; prefer an explicit migration step before app rollout.',
    );
  }

  requireHttpsUrl(env, 'BASE_URL', error);
  requireHttpsUrl(env, 'FRONTEND_BASE_URL', error);
  checkAllowedOrigins(env, error);
  checkJwtSecret(env, error);
  checkMongoUri(env, error);
  checkObjectStorage(env, error);
  checkAgentModel(env, error);
  checkKafka(env, error);

  for (const key of OPTIONAL_BUT_LAUNCH_CRITICAL_KEYS) {
    if (!hasConfiguredValue(env[key])) {
      warning(
        key,
        'missing or placeholder; related login, map, or provider features may not work in production.',
      );
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings };
}

function checkAllowedOrigins(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  const raw = env.ALLOWED_ORIGINS ?? '';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    error('ALLOWED_ORIGINS', 'must include the production Web/App origins.');
    return;
  }
  for (const origin of origins) {
    if (origin === '*' || /^http:\/\//i.test(origin)) {
      error(
        'ALLOWED_ORIGINS',
        `origin ${origin} is not production-safe; use explicit https origins.`,
      );
    }
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin)) {
      error('ALLOWED_ORIGINS', `origin ${origin} points at a local address.`);
    }
  }
}

function checkJwtSecret(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  const secret = env.JWT_SECRET ?? '';
  if (secret.length < 32) {
    error('JWT_SECRET', 'must be at least 32 characters.');
  }
}

function checkMongoUri(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  const uri = env.MONGO_URI ?? '';
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    error('MONGO_URI', 'must be a mongodb:// or mongodb+srv:// URI.');
  }
  if (!/authSource=/.test(uri) && env.MONGO_USERNAME && env.MONGO_PASSWORD) {
    error(
      'MONGO_URI',
      'must include authSource when docker-compose.prod.yml uses root Mongo credentials.',
    );
  }
}

function checkObjectStorage(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  const aliyunReady = [
    'ALIYUN_ACCESS_KEY_ID',
    'ALIYUN_ACCESS_KEY_SECRET',
    'ALIYUN_OSS_REGION',
    'ALIYUN_OSS_BUCKET',
    'ALIYUN_OSS_ENDPOINT',
    'ALIYUN_OSS_PUBLIC_BASE_URL',
  ].every((key) => hasConfiguredValue(env[key]));
  const s3Ready = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_BUCKET_NAME',
  ].every((key) => hasConfiguredValue(env[key]));
  if (!aliyunReady && !s3Ready) {
    error(
      'OBJECT_STORAGE',
      'configure Aliyun OSS or S3; production uploads are disabled without object storage.',
    );
  }
}

function checkAgentModel(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  if (!hasConfiguredValue(env.DEEPSEEK_API_KEY)) {
    error(
      'DEEPSEEK_API_KEY',
      'is required for enterprise Social Agent quality; fallback mode is not release-ready.',
    );
  }
  requireHttpsUrl(env, 'DEEPSEEK_BASE_URL', error);
}

function checkKafka(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  if (env.ENABLE_KAFKA === 'true' && !hasConfiguredValue(env.KAFKA_BROKERS)) {
    error('KAFKA_BROKERS', 'must be set when ENABLE_KAFKA=true.');
  }
}

function requireConfigured(
  env: EnvMap,
  key: string,
  error: (key: string, message: string) => void,
): void {
  if (!hasConfiguredValue(env[key])) {
    error(key, 'missing or still using a placeholder value.');
  }
}

function requireHttpsUrl(
  env: EnvMap,
  key: string,
  error: (key: string, message: string) => void,
): void {
  const value = env[key] ?? '';
  if (!hasConfiguredValue(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      error(key, 'must use https in production.');
    }
  } catch {
    error(key, 'must be a valid URL.');
  }
}

function hasConfiguredValue(value?: string): boolean {
  const text = `${value ?? ''}`.trim();
  return Boolean(text) && !PLACEHOLDER_PATTERN.test(text);
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
