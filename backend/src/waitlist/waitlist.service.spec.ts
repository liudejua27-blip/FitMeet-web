/* eslint-disable @typescript-eslint/require-await */
import { InviteCode } from './entities/invite-code.entity';
import { WaitlistAnalyticsEvent } from './entities/waitlist-analytics-event.entity';
import { WaitlistAppEntry } from './entities/waitlist-app-entry.entity';
import { WaitlistQualityScoringService } from './waitlist-quality-scoring.service';
import { WaitlistService } from './waitlist.service';
import {
  WaitlistDeviceType,
  WaitlistQualityLevel,
  WaitlistStatus,
  WaitlistUserRole,
} from './waitlist.enums';

const now = new Date('2026-05-26T01:00:00.000Z');

function repo<T extends Record<string, unknown>>(initialRows: T[] = []) {
  const rows = [...initialRows];
  let nextId = rows.length + 1;
  const matches = (row: T, where?: Record<string, unknown>) =>
    Object.entries(where ?? {}).every(([key, value]) => {
      if (
        value &&
        typeof value === 'object' &&
        '_type' in (value as Record<string, unknown>)
      ) {
        return true;
      }
      return (row as Record<string, unknown>)[key] === value;
    });
  return {
    rows,
    create: jest.fn((value: Partial<T>) => ({
      id: nextId++,
      createdAt: now,
      updatedAt: now,
      ...value,
    })),
    save: jest.fn(async (value: T) => {
      const existingIndex = rows.findIndex((row) => row.id === value.id);
      const saved = {
        ...value,
        id: value.id ?? nextId++,
        createdAt: value.createdAt ?? now,
        updatedAt: now,
      } as T;
      if (existingIndex >= 0) rows[existingIndex] = saved;
      else rows.push(saved);
      return saved;
    }),
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.find((row) => matches(row, where)) ?? null,
    ),
    find: jest.fn(
      async ({
        where,
        take,
      }: { where?: Record<string, unknown>; take?: number } = {}) =>
        rows.filter((row) => matches(row, where)).slice(0, take),
    ),
    findAndCount: jest.fn(
      async ({
        where,
        skip = 0,
        take = 30,
      }: {
        where?: Record<string, unknown>;
        skip?: number;
        take?: number;
      } = {}) => {
        const filtered = Array.isArray(where)
          ? rows.filter((row) => where.some((item) => matches(row, item)))
          : rows.filter((row) => matches(row, where));
        return [filtered.slice(skip, skip + take), filtered.length];
      },
    ),
    count: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.filter((row) => matches(row, where)).length,
    ),
  };
}

function makeService() {
  const entries = repo<WaitlistAppEntry & Record<string, unknown>>();
  const inviteCodes = repo<InviteCode & Record<string, unknown>>();
  const events = repo<WaitlistAnalyticsEvent & Record<string, unknown>>();
  const service = new WaitlistService(
    entries as never,
    inviteCodes as never,
    events as never,
    new WaitlistQualityScoringService(),
  );
  return { service, entries, inviteCodes, events };
}

const input = {
  email: 'Runner@Example.com',
  phone: '13800000000',
  country: '中国',
  region: '山东',
  city: '青岛',
  preferredLanguage: 'zh-CN',
  timezone: 'Asia/Shanghai',
  deviceType: WaitlistDeviceType.Ios,
  scenarios: ['跑步搭子', '周末活动'],
  interests: ['跑步'],
  userRole: WaitlistUserRole.Student,
  interviewWilling: true,
  source: 'app_page',
};

describe('WaitlistService', () => {
  it('submits an app waitlist entry', async () => {
    const { service, entries, events } = makeService();

    const result = await service.submitAppWaitlist(input, {
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    expect(result).toMatchObject({
      email: 'ru***@example.com',
      city: '青岛',
      deviceType: WaitlistDeviceType.Ios,
      status: WaitlistStatus.Pending,
    });
    expect(entries.rows[0]).toMatchObject({
      email: 'runner@example.com',
      qualityLevel: WaitlistQualityLevel.High,
    });
    expect(events.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventName: 'waitlist_submit_success' }),
      ]),
    );
  });

  it('deduplicates repeated email submissions without dirty duplicate rows', async () => {
    const { service, entries } = makeService();

    await service.submitAppWaitlist(input, { ip: '127.0.0.1' });
    await service.submitAppWaitlist(
      { ...input, email: 'runner@example.com', city: '北京', phone: undefined },
      { ip: '127.0.0.2' },
    );

    expect(entries.rows).toHaveLength(1);
    expect(entries.rows[0].city).toBe('北京');
  });

  it('validates invite codes and increments usedCount on submit', async () => {
    const { service, inviteCodes } = makeService();
    await service.createInviteCode({
      code: 'QDU2026',
      batchName: '青岛大学种子用户',
      source: 'campus',
      city: '青岛',
      scenario: '跑步搭子',
      maxUses: 2,
    });

    await expect(service.validateInvite('QDU2026')).resolves.toMatchObject({
      valid: true,
      remainingUses: 2,
    });
    await service.submitAppWaitlist(
      { ...input, inviteCode: 'QDU2026' },
      { ip: '127.0.0.1' },
    );

    expect(inviteCodes.rows[0].usedCount).toBe(1);
  });

  it('rejects expired invite codes', async () => {
    const { service } = makeService();
    await service.createInviteCode({
      code: 'OLD2026',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    await expect(
      service.submitAppWaitlist(
        { ...input, inviteCode: 'OLD2026' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toThrow('邀请码已过期');
  });

  it('returns admin stats for city, device, scenario, role and interview willingness', async () => {
    const { service } = makeService();
    await service.submitAppWaitlist(input, { ip: '127.0.0.1' });
    await service.submitAppWaitlist(
      {
        ...input,
        email: 'android@example.com',
        phone: '13900000000',
        city: '北京',
        deviceType: WaitlistDeviceType.Android,
        scenarios: ['健身约练'],
        userRole: WaitlistUserRole.FitnessUser,
      },
      { ip: '127.0.0.2' },
    );

    const stats = await service.getStats();

    expect(stats.total).toBe(2);
    expect(stats.byCity).toEqual(
      expect.arrayContaining([
        { label: '青岛', count: 1 },
        { label: '北京', count: 1 },
      ]),
    );
    expect(stats.byDevice).toEqual(
      expect.arrayContaining([
        { label: WaitlistDeviceType.Ios, count: 1 },
        { label: WaitlistDeviceType.Android, count: 1 },
      ]),
    );
    expect(stats.byScenario).toEqual(
      expect.arrayContaining([{ label: '跑步搭子', count: 1 }]),
    );
    expect(stats.interviewWilling).toBe(2);
  });
});
