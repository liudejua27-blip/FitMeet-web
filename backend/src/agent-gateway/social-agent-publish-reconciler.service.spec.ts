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
      findOne: jest.fn().mockResolvedValue(intent),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(intent),
      })),
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
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn(async (value) => value),
    };
    const publicIntentRepo = makePublicIntentRepo(makePublicIntent());
    const matchingJobs = {
      enqueue: jest.fn(async () => ({
        job: {
          id: 9001,
          status: MatchingJobStatus.Queued,
          publicIntentId: 'public_301',
          sourceVersion: 'source-v1',
        },
        reused: false,
      })),
    };
    const service = new SocialAgentPublishReconcilerService(
      taskRepo as never,
      publicIntentRepo as never,
      makeUserSocialRequestRepo() as never,
      matchingJobs as never,
    );

    await expect(service.reconcileTask(7, 101)).resolves.toEqual({
      status: 'visible',
      taskId: 101,
      publicIntentId: 'public_301',
    });
    expect(taskRepo.save).toHaveBeenCalledWith(
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
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn(async (value) => value),
    };
    const publicIntentRepo = makePublicIntentRepo(null);
    const service = new SocialAgentPublishReconcilerService(
      taskRepo as never,
      publicIntentRepo as never,
      makeUserSocialRequestRepo() as never,
    );

    await expect(service.reconcileTask(7, 101)).resolves.toEqual({
      status: 'needs_repair',
      taskId: 101,
      publicIntentId: 'public_301',
    });
    expect(taskRepo.save).toHaveBeenCalledWith(
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
});
