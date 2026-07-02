import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  it('does not enable Aliyun image moderation just because OSS credentials exist', () => {
    const service = makeService({
      ALIYUN_ACCESS_KEY_ID: 'aliyun-key-id',
      ALIYUN_ACCESS_KEY_SECRET: 'aliyun-secret',
      ALIYUN_IMAGE_MODERATION_SERVICE: 'baselineCheck_global',
    });

    expect(service.isAliyunImageModerationEnabled()).toBe(false);
  });

  it('enables Aliyun image moderation only when explicitly configured', () => {
    const service = makeService({
      ALIYUN_ACCESS_KEY_ID: 'aliyun-key-id',
      ALIYUN_ACCESS_KEY_SECRET: 'aliyun-secret',
      ALIYUN_IMAGE_MODERATION_ENABLED: 'true',
      ALIYUN_IMAGE_MODERATION_SERVICE: 'baselineCheck_global',
    });

    expect(service.isAliyunImageModerationEnabled()).toBe(true);
  });
});

function makeService(env: Record<string, string>) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  };

  return new ModerationService(configService as never);
}
