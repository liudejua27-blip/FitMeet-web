import {
  buildProductionEnvReport,
  parseEnvFile,
} from './production-env-readiness';

const validEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  BASE_URL: 'https://api.socialworld.world',
  FRONTEND_BASE_URL: 'https://socialworld.world',
  ALLOWED_ORIGINS: 'https://socialworld.world,https://www.socialworld.world',
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_USERNAME: 'fitmeet',
  DB_PASSWORD: 'strong-postgres-password',
  DB_DATABASE: 'fitness_app',
  DB_MIGRATIONS_RUN: 'false',
  DB_SYNCHRONIZE: 'false',
  MONGO_USERNAME: 'fitmeet_mongo',
  MONGO_PASSWORD: 'strong-mongo-password',
  MONGO_URI:
    'mongodb://fitmeet_mongo:strong-mongo-password@mongo:27017/fitness_app?authSource=admin',
  REDIS_HOST: 'redis',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: 'strong-redis-password',
  SOCIAL_AGENT_CACHE_BACKEND: 'redis',
  SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND: 'redis',
  JWT_SECRET: '1234567890abcdef1234567890abcdef',
  AGENT_WEBHOOK_SIGNING_SECRET: 'webhook-secret-1234567890abcdef',
  ALIYUN_ACCESS_KEY_ID: 'aliyun-key-id',
  ALIYUN_ACCESS_KEY_SECRET: 'aliyun-secret',
  ALIYUN_OSS_REGION: 'oss-cn-qingdao',
  ALIYUN_OSS_BUCKET: 'fitmeet-uploads',
  ALIYUN_OSS_ENDPOINT: 'https://oss-cn-qingdao.aliyuncs.com',
  ALIYUN_OSS_PUBLIC_BASE_URL:
    'https://fitmeet-uploads.oss-cn-qingdao.aliyuncs.com',
  UPLOAD_TEMP_DIR: '/tmp/fitmeet/uploads/temp',
  DEEPSEEK_API_KEY: 'deepseek-key',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
  DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
  DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
  SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '30000',
  SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS: '20000',
  SOCIAL_AGENT_MODEL_ROUTING_MODE: 'quality',
  SOCIAL_AGENT_INTENT_ROUTER_MODE: 'llm_first',
  SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '80',
  SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS: '30000',
  SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS: '20000',
  SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS: '30000',
  SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS: '20000',
  SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS: '1200',
  SOCIAL_AGENT_PLANNER_TIMEOUT_MS: '25000',
  SOCIAL_AGENT_INTENT_TIMEOUT_MS: '25000',
  SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '2',
  AGENT_PLANNER_MODEL: 'deepseek-v4-pro',
  FITMEET_SUBAGENT_WORKER_MODE: 'db_queue',
  FITMEET_SUBAGENT_WORKER_CONCURRENCY: '2',
  FITMEET_SUBAGENT_WORKER_POLL_MS: '1000',
  FITMEET_SUBAGENT_WORKER_TIMEOUT_MS: '30000',
  FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS: '10000',
  FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS: '90000',
  AGENT_OBSERVABILITY_ALERTS_ENABLED: 'false',
  AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL: '',
  AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN: '',
  AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS: '300000',
};

describe('production-env-readiness', () => {
  it('parses dotenv-style files without exposing values', () => {
    expect(
      parseEnvFile(`
        # comment
        export NODE_ENV=production
        JWT_SECRET="secret"
        EMPTY=
      `),
    ).toEqual({
      NODE_ENV: 'production',
      JWT_SECRET: 'secret',
      EMPTY: '',
    });
  });

  it('passes a complete production env', () => {
    const report = buildProductionEnvReport(validEnv);

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('passes Railway-style managed database and Redis URLs', () => {
    const env: Record<string, string> = { ...validEnv };
    for (const key of [
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_PASSWORD',
      'MONGO_USERNAME',
      'MONGO_PASSWORD',
    ]) {
      delete env[key];
    }
    const report = buildProductionEnvReport({
      ...env,
      DATABASE_URL:
        'postgresql://fitmeet:strong-postgres-password@postgres.railway.internal:5432/railway',
      REDIS_URL:
        'redis://default:strong-redis-password@redis.railway.internal:6379',
      MONGO_URI:
        'mongodb+srv://fitmeet:strong-mongo-password@cluster.example.mongodb.net/fitness_app?retryWrites=true&w=majority',
    });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('accepts CORS_ORIGIN as the shared HTTP and Socket.IO origin source', () => {
    const { ALLOWED_ORIGINS, ...env } = validEnv;
    const report = buildProductionEnvReport({
      ...env,
      CORS_ORIGIN: ALLOWED_ORIGINS,
    });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('allows JWT fallback for webhook signing while warning about the risk', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      AGENT_WEBHOOK_SIGNING_SECRET: '',
    });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'AGENT_WEBHOOK_SIGNING_SECRET' }),
      ]),
    );
  });

  it('rejects upload endpoints that would publish insecure production URLs', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      ALIYUN_OSS_ENDPOINT: 'http://oss-cn-qingdao.aliyuncs.com',
      ALIYUN_OSS_PUBLIC_BASE_URL:
        'http://fitmeet-uploads.oss-cn-qingdao.aliyuncs.com',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_PUBLIC_BASE_URL: 'http://cdn.fitmeet.test/uploads',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ALIYUN_OSS_ENDPOINT' }),
        expect.objectContaining({ key: 'ALIYUN_OSS_PUBLIC_BASE_URL' }),
        expect.objectContaining({ key: 'S3_ENDPOINT' }),
        expect.objectContaining({ key: 'S3_PUBLIC_BASE_URL' }),
      ]),
    );
  });

  it('requires a public HTTPS URL when S3-compatible storage uses a custom endpoint', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      ALIYUN_ACCESS_KEY_ID: '',
      ALIYUN_ACCESS_KEY_SECRET: '',
      ALIYUN_OSS_REGION: '',
      ALIYUN_OSS_BUCKET: '',
      ALIYUN_OSS_ENDPOINT: '',
      ALIYUN_OSS_PUBLIC_BASE_URL: '',
      AWS_REGION: 'auto',
      AWS_ACCESS_KEY_ID: 'r2-access-key',
      AWS_SECRET_ACCESS_KEY: 'r2-secret-key',
      AWS_BUCKET_NAME: 'fitmeet-uploads',
      S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      S3_PUBLIC_BASE_URL: '',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'S3_PUBLIC_BASE_URL' }),
      ]),
    );
  });

  it('accepts S3-compatible storage with a custom endpoint and HTTPS public URL', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      ALIYUN_ACCESS_KEY_ID: '',
      ALIYUN_ACCESS_KEY_SECRET: '',
      ALIYUN_OSS_REGION: '',
      ALIYUN_OSS_BUCKET: '',
      ALIYUN_OSS_ENDPOINT: '',
      ALIYUN_OSS_PUBLIC_BASE_URL: '',
      AWS_REGION: 'auto',
      AWS_ACCESS_KEY_ID: 'r2-access-key',
      AWS_SECRET_ACCESS_KEY: 'r2-secret-key',
      AWS_BUCKET_NAME: 'fitmeet-uploads',
      S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      S3_PUBLIC_BASE_URL: 'https://media.socialworld.world',
    });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('rejects invalid managed database and Redis URLs', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      DATABASE_URL: 'mysql://fitmeet:password@db.example.com:3306/fitmeet',
      REDIS_URL: 'http://redis.example.com:6379',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'DATABASE_URL' }),
        expect.objectContaining({ key: 'REDIS_URL' }),
      ]),
    );
  });

  it('rejects local production database and Redis hosts', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      DB_HOST: 'localhost',
      REDIS_HOST: '127.0.0.1',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'DB_HOST' }),
        expect.objectContaining({ key: 'REDIS_HOST' }),
      ]),
    );
  });

  it('requires distributed Social Agent cache in production', () => {
    const missingCache = buildProductionEnvReport({
      ...validEnv,
      SOCIAL_AGENT_CACHE_BACKEND: '',
      SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND: '',
    });
    const processLocalCache = buildProductionEnvReport({
      ...validEnv,
      SOCIAL_AGENT_CACHE_BACKEND: 'memory',
      SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND: 'memory',
    });

    expect(missingCache.ok).toBe(false);
    expect(processLocalCache.ok).toBe(false);
    expect(missingCache.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'SOCIAL_AGENT_CACHE_BACKEND' }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND',
        }),
      ]),
    );
    expect(processLocalCache.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'SOCIAL_AGENT_CACHE_BACKEND' }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND',
        }),
      ]),
    );
  });

  it('rejects missing or insecure WeChat OAuth redirect URIs', () => {
    const missingRedirect = buildProductionEnvReport({
      ...validEnv,
      WECHAT_APP_ID: 'wechat-app',
      WECHAT_APP_SECRET: 'wechat-secret',
      WECHAT_REDIRECT_URI: '',
    });
    const insecureRedirect = buildProductionEnvReport({
      ...validEnv,
      WECHAT_APP_ID: 'wechat-app',
      WECHAT_APP_SECRET: 'wechat-secret',
      WECHAT_REDIRECT_URI: 'http://localhost:3000/api/auth/wechat/callback',
    });

    expect(missingRedirect.ok).toBe(false);
    expect(insecureRedirect.ok).toBe(false);
    expect(missingRedirect.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'WECHAT_REDIRECT_URI' }),
      ]),
    );
    expect(insecureRedirect.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'WECHAT_REDIRECT_URI' }),
      ]),
    );
  });

  it('requires explicit DeepSeek production model ids', () => {
    const missingModels = buildProductionEnvReport({
      ...validEnv,
      DEEPSEEK_CHAT_MODEL: '',
      DEEPSEEK_FAST_MODEL: '',
    });
    const legacyAlias = buildProductionEnvReport({
      ...validEnv,
      DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
      DEEPSEEK_MODEL: 'deepseek-v4',
      DEEPSEEK_FAST_MODEL: 'deepseek-v4',
      AGENT_FINAL_RESPONSE_MODEL: 'deepseek-v4',
      AGENT_CASUAL_CHAT_MODEL: 'deepseek-reasoner',
      AGENT_SAFETY_MODEL: 'deepseek-v4',
    });

    expect(missingModels.ok).toBe(false);
    expect(missingModels.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'DEEPSEEK_CHAT_MODEL' }),
        expect.objectContaining({ key: 'DEEPSEEK_FAST_MODEL' }),
      ]),
    );
    expect(legacyAlias.ok).toBe(false);
    expect(legacyAlias.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'DEEPSEEK_MODEL' }),
        expect.objectContaining({ key: 'DEEPSEEK_CHAT_MODEL' }),
        expect.objectContaining({ key: 'DEEPSEEK_FAST_MODEL' }),
        expect.objectContaining({ key: 'AGENT_FINAL_RESPONSE_MODEL' }),
        expect.objectContaining({ key: 'AGENT_CASUAL_CHAT_MODEL' }),
        expect.objectContaining({ key: 'AGENT_SAFETY_MODEL' }),
      ]),
    );
  });

  it('requires release-quality Social Agent intelligence policy', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      SOCIAL_AGENT_MODEL_ROUTING_MODE: 'balanced',
      SOCIAL_AGENT_INTENT_ROUTER_MODE: 'hybrid',
      SOCIAL_AGENT_INTENT_LLM: 'false',
      SOCIAL_AGENT_BRAIN_LLM_PLANNER: 'false',
      SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '8',
      SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '5000',
      SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS: '3500',
      SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS: '5000',
      SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS: '3500',
      SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS: '5000',
      SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS: '3500',
      SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS: '512',
      SOCIAL_AGENT_PLANNER_TIMEOUT_MS: '2500',
      SOCIAL_AGENT_INTENT_TIMEOUT_MS: '2500',
      SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS: '1',
      SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS: '1',
      DEEPSEEK_MODEL: 'deepseek-v4-flash',
      AGENT_CASUAL_CHAT_MODEL: 'deepseek-v4-flash',
      AGENT_FINAL_RESPONSE_MODEL: 'deepseek-v4-flash',
      AGENT_PLANNER_MODEL: 'deepseek-v4-flash',
      AGENT_EXTRACTOR_MODEL: 'deepseek-v4-flash',
      AGENT_CARD_MODEL: 'deepseek-v4-flash',
      AGENT_SAFETY_MODEL: 'deepseek-v4-flash',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'SOCIAL_AGENT_MODEL_ROUTING_MODE' }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_INTENT_ROUTER_MODE' }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_INTENT_LLM' }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_BRAIN_LLM_PLANNER' }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT' }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS' }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS',
        }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS' }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS',
        }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS',
        }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS',
        }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_FINAL_RESPONSE_MAX_TOKENS',
        }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_PLANNER_TIMEOUT_MS' }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_INTENT_TIMEOUT_MS' }),
        expect.objectContaining({
          key: 'SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS',
        }),
        expect.objectContaining({ key: 'SOCIAL_AGENT_INTENT_RETRY_ATTEMPTS' }),
        expect.objectContaining({ key: 'DEEPSEEK_MODEL' }),
        expect.objectContaining({ key: 'AGENT_CASUAL_CHAT_MODEL' }),
        expect.objectContaining({ key: 'AGENT_FINAL_RESPONSE_MODEL' }),
        expect.objectContaining({ key: 'AGENT_PLANNER_MODEL' }),
        expect.objectContaining({ key: 'AGENT_EXTRACTOR_MODEL' }),
        expect.objectContaining({ key: 'AGENT_CARD_MODEL' }),
        expect.objectContaining({ key: 'AGENT_SAFETY_MODEL' }),
      ]),
    );
  });

  it('rejects per-lane quality model overrides that would silently downgrade DeepSeek', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      AGENT_CASUAL_CHAT_MODEL: 'deepseek-v4-flash',
      AGENT_FINAL_RESPONSE_MODEL: 'deepseek-v4-flash',
      AGENT_PLANNER_MODEL: 'deepseek-v4-flash',
      AGENT_EXTRACTOR_MODEL: 'deepseek-v4-flash',
      AGENT_CARD_MODEL: 'deepseek-v4-flash',
      AGENT_SAFETY_MODEL: 'deepseek-v4-flash',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'AGENT_CASUAL_CHAT_MODEL' }),
        expect.objectContaining({ key: 'AGENT_FINAL_RESPONSE_MODEL' }),
        expect.objectContaining({ key: 'AGENT_PLANNER_MODEL' }),
        expect.objectContaining({ key: 'AGENT_EXTRACTOR_MODEL' }),
        expect.objectContaining({ key: 'AGENT_CARD_MODEL' }),
        expect.objectContaining({ key: 'AGENT_SAFETY_MODEL' }),
      ]),
    );
  });

  it('rejects a fast model as the production Social Agent reasoning model', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-flash',
      AGENT_CASUAL_CHAT_MODEL: 'deepseek-v4-flash',
      AGENT_FINAL_RESPONSE_MODEL: 'deepseek-v4-flash',
      AGENT_PLANNER_MODEL: 'deepseek-v4-flash',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'DEEPSEEK_CHAT_MODEL' }),
        expect.objectContaining({ key: 'AGENT_CASUAL_CHAT_MODEL' }),
        expect.objectContaining({ key: 'AGENT_FINAL_RESPONSE_MODEL' }),
        expect.objectContaining({ key: 'AGENT_PLANNER_MODEL' }),
      ]),
    );
  });

  it('requires release-ready independent subagent worker settings', () => {
    const missingWorker = buildProductionEnvReport({
      ...validEnv,
      FITMEET_SUBAGENT_WORKER_MODE: '',
      FITMEET_SUBAGENT_WORKER_CONCURRENCY: '',
      FITMEET_SUBAGENT_WORKER_POLL_MS: '',
      FITMEET_SUBAGENT_WORKER_TIMEOUT_MS: '',
      FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS: '',
      FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS: '',
    });
    const residentWorker = buildProductionEnvReport({
      ...validEnv,
      FITMEET_SUBAGENT_WORKER_MODE: 'resident_in_process',
      FITMEET_SUBAGENT_WORKER_CONCURRENCY: '0',
      FITMEET_SUBAGENT_WORKER_POLL_MS: '1000.5',
      FITMEET_SUBAGENT_WORKER_TIMEOUT_MS: '-1',
      FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS: '0',
      FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS: '0',
    });

    expect(missingWorker.ok).toBe(false);
    expect(residentWorker.ok).toBe(false);
    expect(missingWorker.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_MODE' }),
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_CONCURRENCY' }),
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_POLL_MS' }),
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_TIMEOUT_MS' }),
        expect.objectContaining({
          key: 'FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS',
        }),
        expect.objectContaining({
          key: 'FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS',
        }),
      ]),
    );
    expect(residentWorker.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_MODE' }),
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_CONCURRENCY' }),
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_POLL_MS' }),
        expect.objectContaining({ key: 'FITMEET_SUBAGENT_WORKER_TIMEOUT_MS' }),
        expect.objectContaining({
          key: 'FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS',
        }),
        expect.objectContaining({
          key: 'FITMEET_SUBAGENT_WORKER_HEALTH_MAX_AGE_MS',
        }),
      ]),
    );
  });

  it('rejects subagent worker model overrides that would downgrade DeepSeek quality', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      FITMEET_LIFE_GRAPH_AGENT_WORKER_MODEL: 'deepseek-chat',
      FITMEET_MATCH_AGENT_WORKER_MODEL: 'deepseek-v4-flash',
      FITMEET_AGENT_BRAIN_WORKER_MODEL: 'deepseek-v4',
      FITMEET_SUBAGENT_WORKER_MODEL: 'deepseek-fast-worker',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'FITMEET_LIFE_GRAPH_AGENT_WORKER_MODEL',
        }),
        expect.objectContaining({
          key: 'FITMEET_MATCH_AGENT_WORKER_MODEL',
        }),
        expect.objectContaining({
          key: 'FITMEET_AGENT_BRAIN_WORKER_MODEL',
        }),
        expect.objectContaining({
          key: 'FITMEET_SUBAGENT_WORKER_MODEL',
        }),
      ]),
    );
  });

  it('allows external observability alert delivery to be disabled for first launch', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      AGENT_OBSERVABILITY_ALERTS_ENABLED: 'false',
      AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL: '',
      AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN: '',
    });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'AGENT_OBSERVABILITY_ALERTS_ENABLED',
        }),
      ]),
    );
  });

  it('requires real observability alert delivery when alerts are enabled', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      AGENT_OBSERVABILITY_ALERTS_ENABLED: 'true',
      AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL: 'http://localhost:9000/alerts',
      AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN: '',
      AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS: '-1',
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL',
        }),
        expect.objectContaining({
          key: 'AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN',
        }),
        expect.objectContaining({
          key: 'AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS',
        }),
      ]),
    );
  });

  it('rejects placeholders, unsafe origins, weak JWT, synchronize, and missing storage', () => {
    const report = buildProductionEnvReport({
      ...validEnv,
      BASE_URL: 'http://localhost:3000',
      ALLOWED_ORIGINS: '*,http://localhost:5173',
      DB_PASSWORD: 'CHANGE_ME_STRONG_POSTGRES_PASSWORD',
      DB_SYNCHRONIZE: 'true',
      JWT_SECRET: 'short',
      ALIYUN_ACCESS_KEY_ID: '',
      ALIYUN_ACCESS_KEY_SECRET: '',
      ALIYUN_OSS_BUCKET: '',
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
      AWS_BUCKET_NAME: '',
      DEEPSEEK_API_KEY: '',
    });

    expect(report.ok).toBe(false);
    expect(report.errors.map((issue) => issue.key)).toEqual(
      expect.arrayContaining([
        'BASE_URL',
        'ALLOWED_ORIGINS',
        'DB_PASSWORD',
        'DB_SYNCHRONIZE',
        'JWT_SECRET',
        'OBJECT_STORAGE',
        'DEEPSEEK_API_KEY',
      ]),
    );
  });
});
