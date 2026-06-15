import { ConfigService } from '@nestjs/config';

import { SafetyReport } from './report.entity';
import { SafetyService } from './safety.service';

function repo<T>(rows: T[] = []) {
  return {
    find: jest.fn(
      async ({ where }: { where?: Partial<Record<keyof T, unknown>> } = {}) => {
        if (!where) return rows;
        return rows.filter((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        );
      },
    ),
    findOne: jest.fn(async () => null),
    save: jest.fn(async (value: T) => value),
    delete: jest.fn(async () => ({ affected: 1 })),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

function report(
  targetId: number,
  status: SafetyReport['status'],
  targetType: SafetyReport['targetType'] = 'user',
): SafetyReport {
  return {
    id: targetId,
    reporterId: 900 + targetId,
    targetType,
    targetId,
    reason: 'unsafe',
    description: '',
    status,
    adminNote: '',
    handledById: null,
    createdAt: new Date('2026-06-14T00:00:00.000Z'),
    updatedAt: new Date('2026-06-14T00:00:00.000Z'),
  };
}

describe('SafetyService Agent recommendation exclusions', () => {
  it('excludes blocked users and active user reports from stranger recommendations', async () => {
    const reportRepo = repo<SafetyReport>([
      report(2, 'pending'),
      report(3, 'reviewing'),
      report(4, 'resolved'),
      report(5, 'rejected'),
      report(6, 'pending', 'post'),
      report(1, 'pending'),
    ]);
    const service = new SafetyService(
      reportRepo as never,
      {
        find: jest
          .fn()
          .mockResolvedValueOnce([{ blockedId: 7 }])
          .mockResolvedValueOnce([{ blockerId: 8 }]),
        findOne: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
      } as never,
      repo() as never,
      repo() as never,
      repo() as never,
      { get: jest.fn() } as unknown as ConfigService,
    );

    const excluded = await service.getAgentRecommendationExcludedUserIds(1);

    expect(reportRepo.find).toHaveBeenCalledWith({
      where: { targetType: 'user' },
      select: ['targetId', 'status'],
    });
    expect([...excluded].sort((a, b) => a - b)).toEqual([2, 3, 4, 7, 8]);
    expect(excluded.has(1)).toBe(false);
    expect(excluded.has(5)).toBe(false);
    expect(excluded.has(6)).toBe(false);
  });
});
