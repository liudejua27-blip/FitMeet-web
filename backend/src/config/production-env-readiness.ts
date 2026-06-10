import { getConfiguredAllowedOrigins } from '../common/cors/origin-allowlist';

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
  'MONGO_URI',
  'JWT_SECRET',
];

const OPTIONAL_BUT_LAUNCH_CRITICAL_KEYS = [
  'SMS_ACCESS_KEY',
  'SMS_SECRET_KEY',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'WECHAT_MINI_APP_ID',
  'WECHAT_MINI_APP_SECRET',
  'AMAP_WEB_SERVICE_KEY',
];

const REQUIRED_DEEPSEEK_MODEL_KEYS = [
  'DEEPSEEK_CHAT_MODEL',
  'DEEPSEEK_FAST_MODEL',
];

const OPTIONAL_DEEPSEEK_MODEL_KEYS = [
  'DEEPSEEK_MODEL',
  'AGENT_FINAL_RESPONSE_MODEL',
  'AGENT_CASUAL_CHAT_MODEL',
  'AGENT_PLANNER_MODEL',
  'AGENT_EXTRACTOR_MODEL',
  'AGENT_CARD_MODEL',
];

const RELEASE_READY_SUBAGENT_WORKER_MODES = new Set([
  'db_queue',
  'queue_worker_ready',
]);

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
  checkAgentWebhookSecret(env, warning);
  checkWechatRedirectUri(env, error);
  checkPostgres(env, error);
  checkMongoUri(env, error);
  checkRedis(env, error);
  checkObjectStorage(env, error);
  checkAgentModel(env, error);
  checkKafka(env, error);
  checkSubagentWorker(env, error, warning);
  checkObservabilityAlerts(env, error);

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
  const originKey = env.CORS_ORIGIN ? 'CORS_ORIGIN' : 'ALLOWED_ORIGINS';
  const origins = getConfiguredAllowedOrigins(env) ?? [];
  if (origins.length === 0) {
    error(
      'ALLOWED_ORIGINS',
      'ALLOWED_ORIGINS or CORS_ORIGIN must include the production Web/App origins.',
    );
    return;
  }
  for (const origin of origins) {
    if (origin === '*' || /^http:\/\//i.test(origin)) {
      error(
        originKey,
        `origin ${origin} is not production-safe; use explicit https origins.`,
      );
    }
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(origin)) {
      error(originKey, `origin ${origin} points at a local address.`);
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

function checkAgentWebhookSecret(
  env: EnvMap,
  warning: (key: string, message: string) => void,
): void {
  if (!hasConfiguredValue(env.AGENT_WEBHOOK_SIGNING_SECRET)) {
    warning(
      'AGENT_WEBHOOK_SIGNING_SECRET',
      'missing or placeholder; runtime falls back to JWT_SECRET, but a dedicated webhook secret is safer for production.',
    );
    return;
  }
  if (env.AGENT_WEBHOOK_SIGNING_SECRET === env.JWT_SECRET) {
    warning(
      'AGENT_WEBHOOK_SIGNING_SECRET',
      'matches JWT_SECRET; use a separate value to isolate webhook and auth blast radius.',
    );
  }
}

function checkWechatRedirectUri(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  const hasWechatOAuthConfig =
    hasConfiguredValue(env.WECHAT_APP_ID) ||
    hasConfiguredValue(env.WECHAT_APP_SECRET);
  if (hasWechatOAuthConfig && !hasConfiguredValue(env.WECHAT_REDIRECT_URI)) {
    error(
      'WECHAT_REDIRECT_URI',
      'must be configured when WeChat OAuth credentials are present.',
    );
    return;
  }
  if (hasConfiguredValue(env.WECHAT_REDIRECT_URI)) {
    requireHttpsUrl(env, 'WECHAT_REDIRECT_URI', error);
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

function checkPostgres(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  if (hasConfiguredValue(env.DATABASE_URL)) {
    validateServiceUrl(
      env.DATABASE_URL,
      'DATABASE_URL',
      ['postgres:', 'postgresql:'],
      error,
    );
    return;
  }

  for (const key of [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_DATABASE',
  ]) {
    requireConfigured(env, key, error);
  }
  checkNonLocalServiceHost(env.DB_HOST, 'DB_HOST', error);
}

function checkRedis(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  if (hasConfiguredValue(env.REDIS_URL)) {
    validateServiceUrl(
      env.REDIS_URL,
      'REDIS_URL',
      ['redis:', 'rediss:'],
      error,
    );
    return;
  }

  for (const key of ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD']) {
    requireConfigured(env, key, error);
  }
  checkNonLocalServiceHost(env.REDIS_HOST, 'REDIS_HOST', error);
}

function validateServiceUrl(
  value: string | undefined,
  key: string,
  allowedProtocols: string[],
  error: (key: string, message: string) => void,
): void {
  try {
    const url = new URL(value ?? '');
    if (!allowedProtocols.includes(url.protocol)) {
      error(key, `must use one of: ${allowedProtocols.join(', ')}.`);
    }
    checkNonLocalServiceHost(url.hostname, key, error);
  } catch {
    error(key, 'must be a valid connection URL.');
  }
}

function checkNonLocalServiceHost(
  host: string | undefined,
  key: string,
  error: (key: string, message: string) => void,
): void {
  const normalizedHost = `${host ?? ''}`.trim();
  if (!hasConfiguredValue(normalizedHost)) return;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(normalizedHost)) {
    error(key, 'must not point at a local address in production.');
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
  if (aliyunReady) {
    requireHttpsUrl(env, 'ALIYUN_OSS_ENDPOINT', error);
    requireHttpsUrl(env, 'ALIYUN_OSS_PUBLIC_BASE_URL', error);
  }
  if (hasConfiguredValue(env.S3_ENDPOINT)) {
    requireHttpsUrl(env, 'S3_ENDPOINT', error);
    if (!hasConfiguredValue(env.S3_PUBLIC_BASE_URL)) {
      error(
        'S3_PUBLIC_BASE_URL',
        'must be configured when S3_ENDPOINT is set so upload responses use a browser-readable HTTPS public URL.',
      );
    }
  }
  if (hasConfiguredValue(env.S3_PUBLIC_BASE_URL)) {
    requireHttpsUrl(env, 'S3_PUBLIC_BASE_URL', error);
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
  for (const key of REQUIRED_DEEPSEEK_MODEL_KEYS) {
    requireConfigured(env, key, error);
    checkDeepSeekModelValue(env, key, error);
  }
  for (const key of OPTIONAL_DEEPSEEK_MODEL_KEYS) {
    checkDeepSeekModelValue(env, key, error);
  }
}

function checkDeepSeekModelValue(
  env: EnvMap,
  key: string,
  error: (key: string, message: string) => void,
): void {
  if (!hasConfiguredValue(env[key])) return;
  const value = env[key].trim();
  if (
    value === 'deepseek-v4' ||
    value === 'deepseek-chat' ||
    value === 'deepseek-reasoner'
  ) {
    error(
      key,
      'must use a current explicit DeepSeek V4 model id such as deepseek-v4-pro or deepseek-v4-flash; legacy aliases deepseek-v4, deepseek-chat, and deepseek-reasoner are not production-safe.',
    );
  }
}

function checkKafka(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  if (env.ENABLE_KAFKA === 'true' && !hasConfiguredValue(env.KAFKA_BROKERS)) {
    error('KAFKA_BROKERS', 'must be set when ENABLE_KAFKA=true.');
  }
}

function checkSubagentWorker(
  env: EnvMap,
  error: (key: string, message: string) => void,
  warning: (key: string, message: string) => void,
): void {
  const mode = `${env.FITMEET_SUBAGENT_WORKER_MODE ?? ''}`.trim().toLowerCase();
  if (!hasConfiguredValue(mode)) {
    error(
      'FITMEET_SUBAGENT_WORKER_MODE',
      'must be db_queue or queue_worker_ready so subagents run in an independent worker process before release.',
    );
  } else if (!RELEASE_READY_SUBAGENT_WORKER_MODES.has(mode)) {
    error(
      'FITMEET_SUBAGENT_WORKER_MODE',
      'must be db_queue or queue_worker_ready; resident in-process lanes are not release-ready for complex Agent workloads.',
    );
  }
  requirePositiveInt(env, 'FITMEET_SUBAGENT_WORKER_CONCURRENCY', error);
  requirePositiveInt(env, 'FITMEET_SUBAGENT_WORKER_POLL_MS', error);
  requirePositiveInt(env, 'FITMEET_SUBAGENT_WORKER_TIMEOUT_MS', error);

  const queues = `${env.FITMEET_SUBAGENT_WORKER_QUEUE ?? ''}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (queues.length > 0 && queues.length < 4) {
    warning(
      'FITMEET_SUBAGENT_WORKER_QUEUE',
      'custom queue list should include Life Graph, Social Match, Meet Loop, and Math worker queues unless this is an intentional partial rollout.',
    );
  }
}

function checkObservabilityAlerts(
  env: EnvMap,
  error: (key: string, message: string) => void,
): void {
  requireConfigured(env, 'AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL', error);
  requireHttpsUrl(env, 'AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL', error);
  requireConfigured(env, 'AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN', error);
  if (hasConfiguredValue(env.AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS)) {
    requireNonNegativeInt(env, 'AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS', error);
  }
}

function requirePositiveInt(
  env: EnvMap,
  key: string,
  error: (key: string, message: string) => void,
): void {
  requireConfigured(env, key, error);
  if (!hasConfiguredValue(env[key])) return;
  const value = Number(env[key]);
  if (!Number.isInteger(value) || value <= 0) {
    error(key, 'must be a positive integer.');
  }
}

function requireNonNegativeInt(
  env: EnvMap,
  key: string,
  error: (key: string, message: string) => void,
): void {
  const value = Number(env[key]);
  if (!Number.isInteger(value) || value < 0) {
    error(key, 'must be a non-negative integer.');
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
