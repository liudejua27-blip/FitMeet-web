import { ForbiddenException } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller';
import { WaitlistDeviceType, WaitlistUserRole } from './waitlist.enums';
import type { WaitlistService } from './waitlist.service';

describe('WaitlistController', () => {
  const service = {
    submitAppWaitlist: jest.fn(),
    validateInvite: jest.fn(),
    track: jest.fn(),
    hashIp: jest.fn(),
    listAdminWaitlist: jest.fn(),
    getStats: jest.fn(),
    createInviteCode: jest.fn(),
    listInviteCodes: jest.fn(),
  } as unknown as jest.Mocked<WaitlistService>;

  let controller: WaitlistController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WaitlistController(service);
    service.hashIp.mockReturnValue('ip_hash');
  });

  it('submits app waitlist entries through the public API', () => {
    const dto = {
      email: 'runner@example.com',
      country: '中国',
      city: '青岛',
      preferredLanguage: 'zh-CN',
      timezone: 'Asia/Shanghai',
      deviceType: WaitlistDeviceType.Ios,
      scenarios: ['跑步搭子'],
      userRole: WaitlistUserRole.FitnessUser,
      interviewWilling: true,
    };
    service.submitAppWaitlist.mockResolvedValue({ id: 1 } as never);

    void controller.submitAppWaitlist(dto, {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    });

    expect(service.submitAppWaitlist).toHaveBeenCalledWith(dto, {
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });
  });

  it('validates invite codes through the public API', () => {
    service.validateInvite.mockResolvedValue({ valid: true } as never);

    void controller.validateInvite({ inviteCode: 'QDU2026' });

    expect(service.validateInvite).toHaveBeenCalledWith('QDU2026');
  });

  it('records analytics events without raw user identifiers', async () => {
    service.track.mockResolvedValue(undefined as never);

    await controller.trackEvent(
      { eventName: 'app_page_view', metadata: { source: 'app_page' } },
      { ip: '127.0.0.1', headers: {} },
    );

    expect(service.hashIp).toHaveBeenCalledWith('127.0.0.1');
    expect(service.track).toHaveBeenCalledWith('app_page_view', 'ip_hash', {
      source: 'app_page',
    });
  });

  it('allows configured admins to read waitlist stats and invite codes', () => {
    service.getStats.mockResolvedValue({ total: 0 } as never);
    service.listInviteCodes.mockResolvedValue([] as never);
    const req = { user: { id: 1 }, headers: {} };

    void controller.getAdminStats(req);
    void controller.listInviteCodes(req);

    expect(service.getStats).toHaveBeenCalledTimes(1);
    expect(service.listInviteCodes).toHaveBeenCalledTimes(1);
  });

  it('blocks non-admin users from admin waitlist APIs', () => {
    expect(() => controller.listAdminWaitlist({}, { user: { id: 999 }, headers: {} })).toThrow(
      ForbiddenException,
    );
    expect(service.listAdminWaitlist).not.toHaveBeenCalled();
  });
});
