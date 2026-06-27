import { SocialSideEffectService } from './social-side-effect.service';

describe('SocialSideEffectService', () => {
  it('runs a social side effect through the agent side-effect ledger', async () => {
    const ledger = {
      run: jest.fn(async (_input, operation) => ({
        result: await operation(),
        reused: false,
      })),
    };
    const service = new SocialSideEffectService(ledger as never);

    const result = await service.runOnce({
      actorUserId: 7,
      taskId: 101,
      effectType: 'create_activity',
      idempotencyKey: 'activity:101:abc',
      resourceType: 'activity',
      resourceId: 'abc',
      payloadHash: 'hash-1',
      payload: { title: '周末散步' },
      metadata: { toolName: 'create_activity' },
      execute: jest.fn().mockResolvedValue({ activityId: 33 }),
    });

    expect(result).toEqual({ result: { activityId: 33 }, reused: false });
    expect(ledger.run).toHaveBeenCalledWith(
      {
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: 'create_activity',
        idempotencyKey: 'activity:101:abc',
        resourceType: 'activity',
        resourceId: 'abc',
        metadata: {
          toolName: 'create_activity',
          payloadHash: 'hash-1',
          hasCompensation: false,
        },
        request: { title: '周末散步' },
      },
      expect.any(Function),
    );
  });

  it('fails closed without an idempotency key', async () => {
    const ledger = { run: jest.fn() };
    const service = new SocialSideEffectService(ledger as never);

    await expect(
      service.runOnce({
        actorUserId: 7,
        effectType: 'send_message',
        idempotencyKey: '   ',
        execute: jest.fn().mockResolvedValue({ ok: true }),
      }),
    ).rejects.toThrow('social_side_effect_idempotency_key_required');
    expect(ledger.run).not.toHaveBeenCalled();
  });
});
