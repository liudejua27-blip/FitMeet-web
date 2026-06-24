import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';
import { AgentSideEffectLedgerStatus } from './entities/agent-side-effect-ledger.entity';

describe('AgentSideEffectLedgerService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function makeRepo(existing: Record<string, unknown> | null = null) {
    const saved: Record<string, unknown>[] = [];
    return {
      saved,
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => {
        saved.push({ ...value });
        return value;
      }),
    };
  }

  it('reuses a completed side effect by action type and idempotency key', async () => {
    const repo = makeRepo({
      status: AgentSideEffectLedgerStatus.Succeeded,
      result: { publicIntentId: 'public_1' },
    });
    const service = new AgentSideEffectLedgerService(repo as never);
    const operation = jest.fn();

    const result = await service.run(
      {
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: 'publish_social_request',
        idempotencyKey: 'publish:101:301',
      },
      operation,
    );

    expect(operation).not.toHaveBeenCalled();
    expect(result).toEqual({
      result: { publicIntentId: 'public_1' },
      reused: true,
    });
  });

  it('records success output for a first side effect execution', async () => {
    const repo = makeRepo();
    const service = new AgentSideEffectLedgerService(repo as never);

    const result = await service.run(
      {
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: 'publish_social_request',
        idempotencyKey: 'publish:101:301',
        resourceType: 'social_request',
        resourceId: 301,
      },
      async () => ({ publicIntentId: 'public_1' }),
    );

    expect(result.reused).toBe(false);
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: AgentSideEffectLedgerStatus.Succeeded,
        result: { publicIntentId: 'public_1' },
        errorMessage: '',
      }),
    );
  });

  it('waits for an in-flight side effect and reuses its completed result', async () => {
    jest.useFakeTimers();
    const repo = makeRepo();
    repo.findOne
      .mockResolvedValueOnce({
        status: AgentSideEffectLedgerStatus.Pending,
        lastAttemptAt: new Date(),
        result: {},
      })
      .mockResolvedValueOnce({
        status: AgentSideEffectLedgerStatus.Succeeded,
        result: { messageId: 'msg_1' },
      });
    const service = new AgentSideEffectLedgerService(repo as never);
    const operation = jest.fn();

    const promise = service.run(
      {
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: 'send_message',
        idempotencyKey: 'message:101:22',
      },
      operation,
    );
    await jest.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toEqual({
      result: { messageId: 'msg_1' },
      reused: true,
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it('records retryable failure metadata before rethrowing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const repo = makeRepo();
    const service = new AgentSideEffectLedgerService(repo as never);

    await expect(
      service.run(
        {
          ownerUserId: 7,
          agentTaskId: 101,
          actionType: 'publish_social_request',
          idempotencyKey: 'publish:101:301',
        },
        async () => {
          throw new Error('read-back failed');
        },
      ),
    ).rejects.toThrow('read-back failed');

    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: AgentSideEffectLedgerStatus.Failed,
        errorMessage: 'read-back failed',
        nextRetryAt: new Date(1_700_000_060_000),
      }),
    );
  });
});
