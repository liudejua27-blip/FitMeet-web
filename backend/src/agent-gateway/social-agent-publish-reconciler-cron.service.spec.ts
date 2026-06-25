import { SocialAgentPublishReconcilerCronService } from './social-agent-publish-reconciler-cron.service';
import { AgentTaskStatus } from './entities/agent-task.entity';

describe('SocialAgentPublishReconcilerCronService', () => {
  function makeRepo(tasks: Array<Record<string, unknown>>) {
    const queue = [...tasks];
    return {
      manager: {
        query: jest.fn(async () => {
          const next = queue.shift();
          return next ? [next] : [];
        }),
      },
    };
  }

  it('reconciles due published tasks and reports visible/repair counts', async () => {
    const repo = makeRepo([
      {
        id: 101,
        ownerUserId: 7,
        status: AgentTaskStatus.Succeeded,
      },
      {
        id: 102,
        ownerUserId: 7,
        status: AgentTaskStatus.WaitingResult,
      },
    ]);
    const reconciler = {
      reconcileTask: jest
        .fn()
        .mockResolvedValueOnce({ status: 'visible' })
        .mockResolvedValueOnce({ status: 'needs_repair' }),
    };
    const service = new SocialAgentPublishReconcilerCronService(
      repo as never,
      reconciler as never,
    );

    await expect(service.reconcileDuePublishedTasks(2)).resolves.toEqual({
      scanned: 2,
      visible: 1,
      needsRepair: 1,
      failed: 0,
    });
    expect(reconciler.reconcileTask).toHaveBeenCalledWith(
      7,
      101,
      expect.any(String),
    );
    expect(reconciler.reconcileTask).toHaveBeenCalledWith(
      7,
      102,
      expect.any(String),
    );
    expect(repo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      expect.arrayContaining([
        expect.arrayContaining([
          AgentTaskStatus.Succeeded,
          AgentTaskStatus.WaitingResult,
          AgentTaskStatus.AwaitingConfirmation,
        ]),
      ]),
    );
  });

  it('keeps scanning when one task reconciliation throws', async () => {
    const repo = makeRepo([
      { id: 101, ownerUserId: 7 },
      { id: 102, ownerUserId: 8 },
    ]);
    const reconciler = {
      reconcileTask: jest
        .fn()
        .mockRejectedValueOnce(new Error('db timeout'))
        .mockResolvedValueOnce({ status: 'visible' }),
    };
    const service = new SocialAgentPublishReconcilerCronService(
      repo as never,
      reconciler as never,
    );

    await expect(service.reconcileDuePublishedTasks(2)).resolves.toEqual({
      scanned: 2,
      visible: 1,
      needsRepair: 0,
      failed: 1,
    });
  });
});
