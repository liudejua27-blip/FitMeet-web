import { SocialAgentPublishReconcilerService } from './social-agent-publish-reconciler.service';
import { AgentTaskStatus } from './entities/agent-task.entity';
import { MatchingJobStatus } from './entities/matching-job.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import {
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';

describe('SocialAgentPublishReconcilerService', () => {
  function makeTask(overrides: Record<string, unknown> = {}) {
    return {
      id: 101,
      ownerUserId: 7,
      status: AgentTaskStatus.Succeeded,
      statusReason: 'social_request_published_and_synced',
      result: {
        publishSocialRequest: {
          publicIntentId: 'public_301',
          socialRequestId: 301,
          sourceVersion: 'source-v1',
        },
      },
      ...overrides,
    };
  }

  function makePublicIntent(overrides: Record<string, unknown> = {}) {
    return {
      id: 'public_301',
      userId: 7,
      linkedSocialRequestId: 301,
      mode: 'public',
      status: SocialRequestStatus.Searching,
      metadata: { sourceVersion: 'source-v1' },
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function makePublicIntentRepo(intent: Record<string, unknown> | null) {
    return {
      __intent: intent,
      findOne: jest.fn().mockResolvedValue(intent),
      createQueryBuilder: jest.fn(() => queryBuilder(intent)),
    };
  }

  function makeUserSocialRequestRepo(overrides: Record<string, unknown> = {}) {
    return {
      findOne: jest.fn().mockResolvedValue({
        id: 301,
        userId: 7,
        status: UserSocialRequestStatus.Matching,
        visibility: SocialRequestVisibility.Public,
        metadata: {},
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      }),
    };
  }

  it('marks a published task visible when public intent read-back succeeds', async () => {
    const task = makeTask();
    const publicIntentRepo = makePublicIntentRepo(makePublicIntent());
    const harness = makeHarness({ task, publicIntentRepo });
    const service = new SocialAgentPublishReconcilerService(
      harness.taskRepo as never,
      publicIntentRepo as never,
      makeUserSocialRequestRepo() as never,
      harness.matchingJobs as never,
      harness.matchingJobRepo as never,
    );

    await expect(service.reconcileTask(7, 101)).resolves.toEqual({
      status: 'visible',
      taskId: 101,
      publicIntentId: 'public_301',
    });
    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "matching_jobs"'),
      expect.arrayContaining(['public_301', 7, 301, 'source-v1']),
    );
    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statusReason: 'publish_reconcile_public_intent_visible',
        result: expect.objectContaining({
          publishReconcile: expect.objectContaining({
            status: 'visible',
            matchingJobId: 9001,
          }),
        }),
      }),
    );
  });

  it('marks a published task for repair when read-back fails', async () => {
    const task = makeTask();
    const publicIntentRepo = makePublicIntentRepo(null);
    const harness = makeHarness({ task, publicIntentRepo });
    const service = new SocialAgentPublishReconcilerService(
      harness.taskRepo as never,
      publicIntentRepo as never,
      makeUserSocialRequestRepo() as never,
      harness.matchingJobs as never,
      harness.matchingJobRepo as never,
    );

    await expect(service.reconcileTask(7, 101)).resolves.toEqual({
      status: 'needs_repair',
      taskId: 101,
      publicIntentId: 'public_301',
    });
    expect(harness.taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: AgentTaskStatus.AwaitingConfirmation,
        statusReason: 'publish_reconcile_readback_failed',
        result: expect.objectContaining({
          publishReconcile: expect.objectContaining({
            status: 'needs_repair',
            reason: 'publish_reconcile_readback_failed',
          }),
        }),
      }),
    );
  });

  it('does not let a stale lease owner overwrite a newer reconciler claim', async () => {
    const task = makeTask({
      result: {
        publishSocialRequest: {
          publicIntentId: 'public_301',
          socialRequestId: 301,
          sourceVersion: 'source-v1',
        },
        publishReconcile: {
          status: 'running',
          leaseOwner: 'new-worker',
        },
      },
    });
    const publicIntentRepo = makePublicIntentRepo(makePublicIntent());
    const harness = makeHarness({ task, publicIntentRepo });
    const service = new SocialAgentPublishReconcilerService(
      harness.taskRepo as never,
      publicIntentRepo as never,
      makeUserSocialRequestRepo() as never,
      harness.matchingJobs as never,
      harness.matchingJobRepo as never,
    );

    await expect(service.reconcileTask(7, 101, 'old-worker')).resolves.toEqual({
      status: 'lease_lost',
      taskId: 101,
      publicIntentId: 'public_301',
    });
    expect(harness.manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "matching_jobs"'),
      expect.anything(),
    );
  });
});

function makeHarness(input: {
  task: Record<string, unknown>;
  publicIntentRepo: { __intent: Record<string, unknown> | null };
}) {
  const taskRepo = {
    findOne: jest.fn().mockResolvedValue(input.task),
    save: jest.fn(async (value) => value),
    manager: {} as Record<string, unknown>,
  };
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (/SELECT pg_advisory_xact_lock/.test(sql)) return [];
      if (/INSERT INTO "matching_jobs"/.test(sql)) {
        return [
          {
            id: 9001,
            status: MatchingJobStatus.Queued,
            publicIntentId: 'public_301',
            sourceVersion: 'source-v1',
          },
        ];
      }
      return [];
    }),
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name?: string }).name;
      if (name === 'AgentTask') {
        return {
          save: taskRepo.save,
          createQueryBuilder: jest.fn(() => queryBuilder(input.task)),
        };
      }
      if (name === 'PublicSocialIntent') {
        return {
          createQueryBuilder: jest.fn(() =>
            queryBuilder(input.publicIntentRepo.__intent),
          ),
        };
      }
      if (name === 'UserSocialRequest') {
        return {
          createQueryBuilder: jest.fn(() =>
            queryBuilder({
              id: 301,
              userId: 7,
              status: UserSocialRequestStatus.Matching,
              visibility: SocialRequestVisibility.Public,
              metadata: {},
              expiresAt: new Date(Date.now() + 60_000),
            }),
          ),
        };
      }
      return {};
    }),
  };
  taskRepo.manager = {
    transaction: jest.fn(async (run: (manager: unknown) => Promise<unknown>) =>
      run(manager),
    ),
  };
  return {
    manager,
    matchingJobRepo: { manager },
    matchingJobs: {},
    taskRepo,
  };
}

function queryBuilder(result: unknown) {
  return {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => result),
  };
}
