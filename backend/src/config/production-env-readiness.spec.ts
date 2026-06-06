import {
  buildProductionEnvReport,
  parseEnvFile,
} from './production-env-readiness';

const validEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  BASE_URL: 'https://www.ourfitmeet.cn',
  FRONTEND_BASE_URL: 'https://www.ourfitmeet.cn',
  ALLOWED_ORIGINS: 'https://www.ourfitmeet.cn,https://ourfitmeet.cn',
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
    });

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ALIYUN_OSS_ENDPOINT' }),
        expect.objectContaining({ key: 'ALIYUN_OSS_PUBLIC_BASE_URL' }),
        expect.objectContaining({ key: 'S3_ENDPOINT' }),
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
