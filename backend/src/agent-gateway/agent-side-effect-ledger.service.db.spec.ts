import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from '../database/migrations/1780000000000-CoreBaseline';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from '../database/migrations/1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';
import {
  AgentSideEffectLedger,
  AgentSideEffectLedgerStatus,
} from './entities/agent-side-effect-ledger.entity';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase('AgentSideEffectLedgerService database semantics', () => {
  afterEach(async () => {
    for (const schema of schemas.splice(0)) {
      const admin = adminDataSource();
      await admin.initialize();
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.destroy();
      }
    }
  });

  it('atomically claims one execution for two concurrent requests', async () => {
    const { dataSource, service } = await serviceWithFreshDatabase();
    try {
      let executions = 0;
      let releaseOperation: () => void = () => undefined;
      const operationGate = new Promise<void>((resolve) => {
        releaseOperation = resolve;
      });

      const input = {
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: 'send_message',
        idempotencyKey: 'message:101:22',
        resourceType: 'conversation',
        resourceId: 'conversation_1',
        request: {
          conversationId: 'conversation_1',
          senderId: 7,
          text: 'hello',
        },
        leaseMs: 5_000,
      };

      const first = service.run(input, async () => {
        executions += 1;
        await operationGate;
        return { messageId: 'msg_1' };
      });
      await waitFor(() => executions === 1);

      const second = service.run(input, async () => {
        executions += 1;
        return { messageId: 'msg_2' };
      });

      await sleep(150);
      expect(executions).toBe(1);
      releaseOperation();

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toEqual({
        result: { messageId: 'msg_1' },
        reused: false,
      });
      expect(secondResult).toEqual({
        result: { messageId: 'msg_1' },
        reused: true,
      });
      expect(executions).toBe(1);

      const rows = await dataSource
        .getRepository(AgentSideEffectLedger)
        .findBy({
          actionType: 'send_message',
          idempotencyKey: 'message:101:22',
        });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: AgentSideEffectLedgerStatus.Succeeded,
        attemptCount: 1,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      expect(rows[0].completedAt).toBeInstanceOf(Date);
      expect(rows[0].requestHash).toHaveLength(64);
    } finally {
      await dataSource.destroy();
    }
  });

  it('moves an expired running lease to unknown commit state before replay', async () => {
    const { dataSource, service } = await serviceWithFreshDatabase();
    try {
      const repo = dataSource.getRepository(AgentSideEffectLedger);
      await repo.save(
        repo.create({
          ownerUserId: 7,
          agentTaskId: 101,
          actionType: 'send_message',
          idempotencyKey: 'message:crashed',
          status: AgentSideEffectLedgerStatus.Running,
          resourceType: 'conversation',
          resourceId: 'conversation_1',
          attemptCount: 1,
          leaseOwner: 'crashed-worker',
          leaseExpiresAt: new Date(Date.now() - 5_000),
          requestHash: '',
          result: {},
          metadata: {},
          errorMessage: '',
          lastAttemptAt: new Date(Date.now() - 10_000),
        }),
      );
      const operation = jest.fn(async () => ({ messageId: 'msg_after_crash' }));

      await expect(
        service.run(
          {
            ownerUserId: 7,
            agentTaskId: 101,
            actionType: 'send_message',
            idempotencyKey: 'message:crashed',
            resourceType: 'conversation',
            resourceId: 'conversation_1',
            request: {
              conversationId: 'conversation_1',
              senderId: 7,
              text: 'hello',
            },
          },
          operation,
        ),
      ).rejects.toThrow('side_effect_reconciliation_required');

      expect(operation).not.toHaveBeenCalled();
      const row = await repo.findOneByOrFail({
        actionType: 'send_message',
        idempotencyKey: 'message:crashed',
      });
      expect(row).toMatchObject({
        status: AgentSideEffectLedgerStatus.UnknownCommitState,
        errorMessage: 'side_effect_lease_expired_reconciliation_required',
        leaseOwner: null,
        leaseExpiresAt: null,
      });
    } finally {
      await dataSource.destroy();
    }
  });
});

function adminDataSource() {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
  });
}

async function serviceWithFreshDatabase() {
  const schema = await createSchema();
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    schema,
    entities: [AgentSideEffectLedger],
    migrations: [
      CoreBaseline1780000000000,
      AgentPublicLoopP0DatabaseStabilization1781000000000,
    ],
    migrationsTableName: `migrations_${schema}`,
    migrationsTransactionMode: 'each',
    synchronize: false,
    extra: {
      options: `-c search_path=${schema},public`,
    },
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  return {
    dataSource,
    service: new AgentSideEffectLedgerService(
      dataSource.getRepository(AgentSideEffectLedger),
    ),
  };
}

async function createSchema() {
  const schema = `fitmeet_ledger_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const admin = adminDataSource();
  await admin.initialize();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.destroy();
  }
  schemas.push(schema);
  return schema;
}

async function waitFor(predicate: () => boolean) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 3_000) {
      throw new Error('condition_timeout');
    }
    await sleep(25);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
