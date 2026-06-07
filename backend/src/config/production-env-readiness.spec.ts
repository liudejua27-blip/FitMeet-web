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
  JWT_SECRET: '1234567890abcdef1234567890abcdef',
  AGENT_WEBHOOK_SIGNING_SECRET: 'webhook-secret-1234567890abcdef',
  ALIYUN_ACCESS_KEY_ID: 'aliyun-key-id',
  ALIYUN_ACCESS_KEY_SECRET: 'aliyun-secret',
  ALIYUN_OSS_REGION: 'oss-cn-qingdao',
  ALIYUN_OSS_BUCKET: 'fitmeet-uploads',
  ALIYUN_OSS_ENDPOINT: 'https://oss-cn-qingdao.aliyuncs.com',
  ALIYUN_OSS_PUBLIC_BASE_URL:
    'https://fitmeet-uploads.oss-cn-qingdao.aliyuncs.com',
  DEEPSEEK_API_KEY: 'deepseek-key',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
  DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
  DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
  KAFKA_BROKERS: 'kafka:29092',
  ENABLE_KAFKA: 'true',
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
