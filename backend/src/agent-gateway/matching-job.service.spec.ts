import { BadRequestException } from '@nestjs/common';

import { MatchingJobService } from './matching-job.service';
import { MatchingJobStatus } from './entities/matching-job.entity';

describe('MatchingJobService', () => {
  function makeRepo() {
    const manager = {
      query: jest.fn(),
    };
    const repo = {
      manager: {
        transaction: jest.fn((callback) => callback(manager)),
      },
      findOne: jest.fn(),
      save: jest.fn(async (job) => job),
    };
    return { manager, repo };
  }

  it('enqueues a matching job with an idempotency key', async () => {
    const { manager, repo } = makeRepo();
    manager.query.mockResolvedValueOnce([
      {
        id: 1,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
        status: MatchingJobStatus.Queued,
        candidateCount: 0,
      },
    ]);
    const service = new MatchingJobService(repo as never);

    await expect(
      service.enqueue({
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
        ownerUserId: 7,
        linkedSocialRequestId: 301,
      }),
    ).resolves.toMatchObject({
      reused: false,
      job: {
        id: 1,
        status: MatchingJobStatus.Queued,
      },
    });
  });

  it('reuses the existing matching job for the same public intent version', async () => {
    const { manager, repo } = makeRepo();
    manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
        status: MatchingJobStatus.Queued,
        candidateCount: 0,
      },
    ]);
    const service = new MatchingJobService(repo as never);

    await expect(
      service.enqueue({
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
      }),
    ).resolves.toMatchObject({
      reused: true,
      job: { id: 1 },
    });
  });

  it('enqueues a recovery child job with parent lineage', async () => {
    const { manager, repo } = makeRepo();
    manager.query.mockResolvedValueOnce([
      {
        id: 2,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1:relax:expand_time',
        idempotencyKey: 'matching-job:social_request_301:source-v1:relax',
        status: MatchingJobStatus.Queued,
        parentJobId: 1,
        recoveryStrategyId: 'expand_time',
      },
    ]);
    const service = new MatchingJobService(repo as never);

    await service.enqueue({
      publicIntentId: 'social_request_301',
      sourceVersion: 'source-v1:relax:expand_time',
      idempotencyKey: 'matching-job:social_request_301:source-v1:relax',
      parentJobId: 1,
      recoveryStrategyId: 'expand_time',
    });

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"parentJobId", "recoveryStrategyId"'),
      expect.arrayContaining([1, 'expand_time']),
    );
  });

  it('rejects idempotency key reuse for another public intent version', async () => {
    const { manager, repo } = makeRepo();
    manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v1',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
        status: MatchingJobStatus.Queued,
        candidateCount: 0,
      },
    ]);
    const service = new MatchingJobService(repo as never);

    await expect(
      service.enqueue({
        publicIntentId: 'social_request_301',
        sourceVersion: 'source-v2',
        idempotencyKey: 'matching-job:social_request_301:source-v1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only marks candidates_ready when candidateCount is positive', async () => {
    const { repo } = makeRepo();
    repo.findOne.mockResolvedValueOnce({
      id: 1,
      status: MatchingJobStatus.Running,
      candidateCount: 0,
    });
    const service = new MatchingJobService(repo as never);

    await expect(service.markCompleted(1, 0)).resolves.toMatchObject({
      status: MatchingJobStatus.NoCandidates,
      candidateCount: 0,
    });

    repo.findOne.mockResolvedValueOnce({
      id: 2,
      status: MatchingJobStatus.Running,
      candidateCount: 0,
    });
    await expect(service.markCompleted(2, 3)).resolves.toMatchObject({
      status: MatchingJobStatus.CandidatesReady,
      candidateCount: 3,
    });
  });
});
