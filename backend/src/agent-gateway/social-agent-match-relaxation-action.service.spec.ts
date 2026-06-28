import { SocialAgentMatchRelaxationActionService } from './social-agent-match-relaxation-action.service';

describe('SocialAgentMatchRelaxationActionService', () => {
  it('updates the same public intent source version and enqueues one matching job', async () => {
    const matchingJobs = {
      enqueue: jest.fn(async () => ({ job: { id: 55 }, reused: false })),
    };
    const request = {
      id: 301,
      userId: 7,
      radiusKm: 5,
      metadata: {},
    };
    const intent = {
      id: 'public_301',
      userId: 7,
      linkedSocialRequestId: 301,
      radiusKm: 5,
      timePreference: '今晚',
      filters: {},
      metadata: { sourceVersion: 'source-v1' },
      updatedAt: new Date('2026-06-27T10:00:00Z'),
      status: 'searching',
    };
    const savedRequests: unknown[] = [];
    const savedIntents: unknown[] = [];
    const manager = {
      query: jest.fn(async () => []),
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity.name === 'AgentTask') {
          return {
            findOne: jest.fn(async () => ({ id: 101, ownerUserId: 7 })),
          };
        }
        if (entity.name === 'UserSocialRequest') {
          return {
            createQueryBuilder: jest.fn(() => queryBuilder(request)),
            save: jest.fn(async (value) => {
              savedRequests.push(value);
              return value;
            }),
          };
        }
        if (entity.name === 'PublicSocialIntent') {
          return {
            createQueryBuilder: jest.fn(() => queryBuilder(intent)),
            save: jest.fn(async (value) => {
              savedIntents.push(value);
              return value;
            }),
          };
        }
        if (entity.name === 'MatchingJob') {
          return {
            findOne: jest.fn(async () => ({
              id: 44,
              status: 'no_candidates',
            })),
          };
        }
        return {};
      }),
    };
    const taskRepo = {
      manager: {
        transaction: jest.fn(async (run) => run(manager)),
      },
    };
    const service = new SocialAgentMatchRelaxationActionService(
      matchingJobs as never,
      taskRepo as never,
    );

    const result = await service.applyRelaxation({
      ownerUserId: 7,
      taskId: 101,
      payload: {
        socialRequestId: 301,
        publicIntentId: 'public_301',
        strategyId: 'expand_distance',
        changedConstraints: { radiusKm: 15 },
      },
    });

    expect(result).toMatchObject({
      strategyId: 'expand_distance',
      matchingJobId: 55,
      parentMatchingJobId: 44,
      sourceVersion: 'source-v1:relax:expand_distance',
    });
    expect(savedRequests[0]).toMatchObject({
      radiusKm: 15,
      metadata: expect.objectContaining({
        matchingRelaxation: expect.objectContaining({
          strategyId: 'expand_distance',
        }),
      }),
    });
    expect(savedIntents[0]).toMatchObject({
      radiusKm: 15,
      metadata: expect.objectContaining({
        sourceVersion: 'source-v1:relax:expand_distance',
      }),
    });
    expect(matchingJobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        publicIntentId: 'public_301',
        sourceVersion: 'source-v1:relax:expand_distance',
        parentJobId: 44,
        recoveryStrategyId: 'expand_distance',
        idempotencyKey:
          'matching-job:public_301:source-v1:relax:expand_distance',
        metadata: expect.objectContaining({
          parentMatchingJobId: 44,
          recoveryTransition:
            'NO_CANDIDATES->RELAXATION_SELECTED->MATCHING_QUEUED',
        }),
      }),
    );
  });
});

function queryBuilder(result: unknown) {
  return {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => result),
  };
}
