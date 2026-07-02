import { SocialCandidateAuditService } from './social-candidate-audit.service';

function repo<T extends { id?: number }>() {
  const rows: T[] = [];
  return {
    rows,
    create: jest.fn((value: T) => value),
    save: jest.fn(async (value: T) => {
      const row = { ...value, id: value.id ?? rows.length + 1 } as T;
      rows.push(row);
      return row;
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<T> }) => {
      return (
        rows.find((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        ) ?? null
      );
    }),
    find: jest.fn(async () => rows.slice().reverse()),
    manager: {
      getRepository: jest.fn(() => ({
        exist: jest.fn(async () => true),
      })),
    },
  };
}

describe('SocialCandidateAuditService', () => {
  it('stores a narrowed immutable candidate snapshot', async () => {
    const snapshotRepo = repo();
    const eventRepo = repo();
    const service = new SocialCandidateAuditService(
      snapshotRepo as never,
      eventRepo as never,
    );

    const snapshot = await service.createSnapshot({
      ownerUserId: 7,
      taskId: 101,
      socialRequestId: 55,
      publicIntentId: 'pub_1',
      matchingJobId: 9,
      snapshotType: 'matching_job_result',
      sourceVersion: 'v1',
      scoreVersion: 'score.v1',
      query: { city: '青岛', rawText: '明晚散步' },
      candidates: [
        {
          candidateUserId: 22,
          displayName: '青岛散步搭子',
          phone: '13800000000',
          exactAddress: '某小区 1 号楼 101',
          scoreBreakdown: { distance: 20 },
          explanationSteps: ['同城', '时间接近'],
        },
      ],
    });

    expect(snapshot.candidateCount).toBe(1);
    expect(snapshot.candidates[0]).toEqual(
      expect.objectContaining({
        candidateUserId: 22,
        displayName: '青岛散步搭子',
        scoreBreakdown: { distance: 20 },
      }),
    );
    expect(snapshot.candidates[0]).not.toHaveProperty('phone');
    expect(snapshot.candidates[0]).not.toHaveProperty('exactAddress');
  });

  it('reuses candidate events by stable idempotency key', async () => {
    const snapshotRepo = repo();
    const eventRepo = repo();
    const service = new SocialCandidateAuditService(
      snapshotRepo as never,
      eventRepo as never,
    );

    const first = await service.recordEvent({
      ownerUserId: 7,
      taskId: 101,
      eventType: 'candidate_saved',
      candidateUserId: 22,
      idempotencyKey: 'save:101:22',
    });
    const second = await service.recordEvent({
      ownerUserId: 7,
      taskId: 101,
      eventType: 'candidate_saved',
      candidateUserId: 22,
      idempotencyKey: 'save:101:22',
    });

    expect(second.id).toBe(first.id);
    expect(eventRepo.save).toHaveBeenCalledTimes(1);
  });
});
