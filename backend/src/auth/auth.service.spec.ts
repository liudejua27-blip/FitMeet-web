import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService production provider safety', () => {
  function makeService(env: Record<string, string | undefined>) {
    const redisClient = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const userRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const jwtService = { sign: jest.fn(() => 'jwt') };
    const redisService = { getClient: jest.fn(() => redisClient) };
    const configService = {
      get: jest.fn((key: string) => env[key]),
    };

    const service = new AuthService(
      userRepo as never,
      jwtService as never,
      redisService as never,
      configService as never,
    );

    return { service, redisClient, userRepo };
  }

  it('does not persist SMS codes when production SMS config is missing', async () => {
    const { service, redisClient } = makeService({
      NODE_ENV: 'production',
      SMS_ACCESS_KEY: '',
      SMS_SECRET_KEY: '',
    });

    await expect(
      service.sendSmsCode({ phone: '13800138000' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(redisClient.get).toHaveBeenCalledWith('sms:throttle:13800138000');
    expect(redisClient.setex).not.toHaveBeenCalled();
  });

  it('persists SMS codes only after provider configuration is accepted', async () => {
    const { service, redisClient } = makeService({
      NODE_ENV: 'production',
      SMS_ACCESS_KEY: 'sms-key',
      SMS_SECRET_KEY: 'sms-secret',
    });

    await expect(
      service.sendSmsCode({ phone: '13800138000' }),
    ).resolves.toEqual({
      message: '验证码已发送',
      expiresIn: 300,
    });

    expect(redisClient.setex).toHaveBeenCalledWith(
      'sms:code:13800138000',
      300,
      expect.stringMatching(/^\d{6}$/),
    );
    expect(redisClient.setex).toHaveBeenCalledWith(
      'sms:throttle:13800138000',
      60,
      '1',
    );
  });

  it('blocks production WeChat OAuth mock fallback when provider config is missing', async () => {
    const { service, userRepo } = makeService({
      NODE_ENV: 'production',
      WECHAT_APP_ID: '',
      WECHAT_APP_SECRET: '',
    });

    await expect(
      service.loginWithWechat({ code: 'dev-code' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('blocks production WeChat mini mock fallback when provider config is missing', async () => {
    const { service, userRepo } = makeService({
      NODE_ENV: 'production',
      WECHAT_MINI_APP_ID: '',
      WECHAT_MINI_APP_SECRET: '',
      WECHAT_APP_ID: '',
      WECHAT_APP_SECRET: '',
    });

    await expect(
      service.loginWithWechatMini({ code: 'mini-dev-code' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });
});
