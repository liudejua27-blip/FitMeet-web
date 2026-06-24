import { SocialAgentPublishReconcilerService } from './social-agent-publish-reconciler.service';
import { AgentTaskStatus } from './entities/agent-task.entity';

describe('SocialAgentPublishReconcilerService', () => {
  function makeTask(overrides: Record<string, unknown> = {}) {
    return {
      id: 101,
      ownerUserId: 7,
      status: AgentTaskStatus.Succeeded,
      statusReason: 'social_request_published_and_synced',
      result: {
        publishSocialRequest: { publicIntentId: 'public_301' },
      },
      ...overrides,
    };
  }

  it('marks a published task visible when public intent read-back succeeds', async () => {
    const task = makeTask();
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn(async (value) => value),
    };
    const publicIntentRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'public_301', mode: 'public' }),
    };
    const service = new SocialAgentPublishReconcilerService(
      taskRepo as never,
      publicIntentRepo as never,
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
          publishReconcile: expect.objectContaining({ status: 'visible' }),
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
    const publicIntentRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new SocialAgentPublishReconcilerService(
      taskRepo as never,
      publicIntentRepo as never,
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
