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
        query: manager.query,
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

  it('casts claimed completion timestamps for postgres', async () => {
    const { manager, repo } = makeRepo();
    manager.query.mockResolvedValueOnce([
      {
        id: 1,
        status: MatchingJobStatus.CandidatesReady,
        candidateCount: 1,
      },
    ]);
    const service = new MatchingJobService(repo as never);

    await service.markCompleted(1, 1, {}, 'worker-a');

    const [sql, params] = manager.query.mock.calls[0];
    expect(String(sql)).toContain('"completedAt" = $4::timestamptz');
    expect(String(sql)).toContain('"updatedAt" = $4::timestamptz');
    expect(typeof params[3]).toBe('string');
  });

  it('casts claimed failure and cancellation timestamps for postgres', async () => {
    const { manager, repo } = makeRepo();
    manager.query
      .mockResolvedValueOnce([{ id: 1, status: MatchingJobStatus.FailedFinal }])
      .mockResolvedValueOnce([{ id: 1, status: MatchingJobStatus.Cancelled }]);
    const service = new MatchingJobService(repo as never);

    await service.markFailed(1, new Error('boom'), false, 'worker-a');
    await service.cancelClaimed(1, 'worker-a', 'cancelled');

    const [, failedParams] = manager.query.mock.calls[0];
    const [, cancelledParams] = manager.query.mock.calls[1];
    expect(typeof failedParams[2]).toBe('object');
    expect(typeof failedParams[4]).toBe('string');
    expect(typeof cancelledParams[2]).toBe('string');
  });
});
