import { BadRequestException } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { PaymentIntentStatus } from './entities/payment-intent.entity';
import { SocialAgentPaymentIntentToolService } from './social-agent-payment-intent-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

type MockRepository<T extends object = Record<string, unknown>> = {
  save: jest.Mock<Promise<T>, [T]>;
  create: jest.Mock<T, [Partial<T>]>;
};

const repo = <
  T extends object = Record<string, unknown>,
>(): MockRepository<T> => ({
  save: jest.fn<Promise<T>, [T]>((value) => Promise.resolve(value)),
  create: jest.fn<T, [Partial<T>]>((value) => value as T),
});

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    memory: {},
    ...overrides,
  } as AgentTask;
}

function makeService(paymentIntentRepo = repo()) {
  const toolInput = new SocialAgentToolInputParserService();
  return new SocialAgentPaymentIntentToolService(
    paymentIntentRepo as never,
    toolInput,
    new SocialAgentTaskMemoryService(toolInput),
  );
}

describe('SocialAgentPaymentIntentToolService', () => {
  it('creates payment intents without integrating a real payment gateway', async () => {
    const paymentIntentRepo = repo();
    paymentIntentRepo.save.mockImplementation((value) =>
      Promise.resolve({ id: 88, ...value }),
    );
    const service = makeService(paymentIntentRepo);

    const result = await service.record(
      makeTask(),
      {
        amount: '12.345',
        currency: 'usd',
        payeeUserId: '2',
        description: 'venue deposit',
        status: 'pending',
        provider: 'manual',
        metadata: { sourceUi: 'agent' },
      },
      'step_1',
    );

    expect(paymentIntentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 1,
        agentConnectionId: 7,
        agentTaskId: 100,
        stepId: 'step_1',
        targetUserId: 2,
        amount: '12.35',
        currency: 'USD',
        description: 'venue deposit',
        status: PaymentIntentStatus.Pending,
        provider: 'manual',
        metadata: expect.objectContaining({
          auditPolicy: 'payment_intent_only_no_silent_charge',
          gatewayStatus: 'not_integrated',
          reversible: true,
          sourceUi: 'agent',
        }),
      }),
    );
    expect(result.output).toMatchObject({
      paymentIntentId: 88,
      amount: '12.35',
      currency: 'USD',
      gatewayStatus: 'not_integrated',
      auditPolicy: 'payment_intent_only_no_silent_charge',
      reversible: true,
    });
    expect(result.paymentIntentKeys).toEqual([
      'payment:2:12.35:USD:venue deposit',
    ]);
  });

  it('skips duplicate payment intents using social loop memory keys', async () => {
    const paymentIntentRepo = repo();
    const service = makeService(paymentIntentRepo);

    const result = await service.record(
      makeTask({
        memory: {
          socialLoop: {
            paymentIntentKeys: ['payment:2:88.50:CNY:venue deposit'],
          },
        },
      }),
      {
        amount: 88.5,
        currency: 'cny',
        payeeUserId: 2,
        description: 'venue deposit',
      },
      'step_1',
    );

    expect(paymentIntentRepo.create).not.toHaveBeenCalled();
    expect(paymentIntentRepo.save).not.toHaveBeenCalled();
    expect(result).toEqual({
      output: {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_payment_intent',
        targetUserId: 2,
        amount: '88.50',
        currency: 'CNY',
        description: 'venue deposit',
      },
    });
  });

  it('rejects payment intents without a positive amount', async () => {
    const service = makeService();

    await expect(
      service.record(makeTask(), { amount: 0 }, 'step_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
