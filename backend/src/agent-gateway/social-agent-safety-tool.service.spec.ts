import { BadRequestException } from '@nestjs/common';

import { SocialAgentSafetyToolService } from './social-agent-safety-tool.service';

describe('SocialAgentSafetyToolService', () => {
  function makeService() {
    const safety = {
      createReport: jest.fn().mockResolvedValue({
        id: 88,
        status: 'pending',
        targetType: 'user',
        targetId: 42,
      }),
    };
    const socialPolicy = {
      inspectPublicText: jest.fn().mockReturnValue({
        allowed: true,
        publicMessage: '',
        fields: [],
      }),
    };
    const service = new SocialAgentSafetyToolService(
      safety as never,
      socialPolicy as never,
    );
    return { safety, socialPolicy, service };
  }

  it('blocks risky side effects and returns a safety boundary card with redacted payload', async () => {
    const { service } = makeService();

    const result = await service.checkSafetyPolicy({
      ownerUserId: 1,
      taskId: 100,
      action: 'send_message_to_candidate',
      text: '加我微信 wx_fitmeet 或打 13800001111',
      payload: { text: '加我微信 wx_fitmeet 或打 13800001111' },
    });

    expect(result).toMatchObject({
      allowed: false,
      level: 'blocked',
      reasons: expect.arrayContaining([
        expect.stringContaining('直接联系方式'),
      ]),
      requiredConfirmations: ['safety_review_required'],
      card: expect.objectContaining({
        type: 'safety_boundary',
        status: 'blocked',
      }),
    });
    expect(JSON.stringify(result.redactedPayload)).toContain(
      '[REDACTED_PHONE]',
    );
    expect(JSON.stringify(result.redactedPayload)).toContain(
      '[REDACTED_CONTACT]',
    );
  });

  it('redacts sensitive output without changing safe fields', () => {
    const { service } = makeService();

    const result = service.redactSensitiveOutput({
      payload: {
        title: '周末散步',
        phone: '13800001111',
        nested: { email: 'person@example.com' },
      },
      text: '邮箱 person@example.com',
    });

    expect(result.payload).toMatchObject({
      title: '周末散步',
      phone: '[REDACTED_PHONE]',
      nested: { email: '[REDACTED_EMAIL]' },
    });
    expect(result.text).toContain('[REDACTED_EMAIL]');
  });

  it('uses SocialPolicy public text decisions as a blocking source for side effects', async () => {
    const { service, socialPolicy } = makeService();
    socialPolicy.inspectPublicText.mockReturnValue({
      allowed: false,
      publicMessage: '公开内容不能包含微信号。',
      fields: ['wechat'],
    });

    const result = await service.checkSafetyPolicy({
      ownerUserId: 1,
      taskId: 100,
      action: 'publish_social_request',
      text: '一起散步，加我微信 fitmeet_test',
      payload: { title: '散步搭子' },
    });

    expect(socialPolicy.inspectPublicText).toHaveBeenCalledWith({
      action: 'publish_social_request',
      text: '一起散步，加我微信 fitmeet_test',
      payload: { title: '散步搭子' },
    });
    expect(result).toMatchObject({
      allowed: false,
      level: 'blocked',
      reasons: expect.arrayContaining(['公开内容不能包含微信号。']),
    });
  });

  it('creates safety reports through SafetyService', async () => {
    const { safety, service } = makeService();

    const result = await service.reportSafetyIssue(1, {
      targetType: 'user',
      targetId: 42,
      reason: '骚扰',
      description: '对方持续发送联系方式。',
    });

    expect(safety.createReport).toHaveBeenCalledWith(1, {
      targetType: 'user',
      targetId: 42,
      reason: '骚扰',
      description: '对方持续发送联系方式。',
    });
    expect(result).toMatchObject({
      success: true,
      reportId: 88,
      status: 'pending',
      message: '已提交安全上报，平台会优先审核。',
    });
  });

  it('rejects malformed report targets', async () => {
    const { service } = makeService();

    await expect(
      service.reportSafetyIssue(1, {
        targetType: 'unknown',
        targetId: 0,
        reason: '骚扰',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
