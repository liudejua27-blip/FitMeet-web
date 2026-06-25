import { DataSource } from 'typeorm';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from './1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { CoreBaseline1780000000000 } from './1780000000000-CoreBaseline';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase('Agent public loop P0 database migrations', () => {
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

  it('creates the stabilized ledger and checkpoint schema on a fresh database', async () => {
    const schema = await createSchema();
    const dataSource = migrationDataSource(schema, [
      CoreBaseline1780000000000,
      AgentPublicLoopP0DatabaseStabilization1781000000000,
    ]);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations({ transaction: 'each' });

      await expectLedgerSchema(dataSource, schema);
      await expectCheckpointSchema(dataSource, schema);
    } finally {
      await dataSource.destroy();
    }
  });

  it('upgrades the previous production checkpoint and ledger schema in place', async () => {
    const schema = await createSchema();
    const dataSource = migrationDataSource(schema, [
      AgentPublicLoopP0DatabaseStabilization1781000000000,
    ]);

    await dataSource.initialize();
    try {
      await createPreviousProductionSchema(dataSource);
      await dataSource.runMigrations({ transaction: 'each' });

      await expectLedgerSchema(dataSource, schema);
      await expectCheckpointSchema(dataSource, schema);

      const checkpointRows = await dataSource.query(
        `SELECT "agentTaskId", "runId", "status" FROM "agent_run_checkpoints"`,
      );
      expect(checkpointRows).toEqual([
        { agentTaskId: 1, runId: '123', status: 'active' },
      ]);

      const ledgerRows = await dataSource.query(
        `SELECT "requestHash", "leaseOwner", "completedAt" FROM "agent_side_effect_ledger"`,
      );
      expect(ledgerRows).toEqual([
        { requestHash: '', leaseOwner: null, completedAt: null },
      ]);
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

function migrationDataSource(
  schema: string,
  migrations: NonNullable<
    ConstructorParameters<typeof DataSource>[0]['migrations']
  >,
) {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    schema,
    migrations,
    migrationsTableName: `migrations_${schema}`,
    migrationsTransactionMode: 'each',
    synchronize: false,
    extra: {
      options: `-c search_path=${schema},public`,
    },
  });
}

async function createSchema() {
  const schema = `fitmeet_p0_${Date.now()}_${Math.random()
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

async function expectLedgerSchema(dataSource: DataSource, schema: string) {
  const columns = await tableColumns(
    dataSource,
    schema,
    'agent_side_effect_ledger',
  );
  expect(columns.get('leaseOwner')).toMatchObject({
    data_type: 'character varying',
    character_maximum_length: 120,
    is_nullable: 'YES',
  });
  expect(columns.get('leaseExpiresAt')).toMatchObject({
    data_type: 'timestamp with time zone',
    is_nullable: 'YES',
  });
  expect(columns.get('requestHash')).toMatchObject({
    data_type: 'character varying',
    character_maximum_length: 128,
    is_nullable: 'NO',
  });
  expect(columns.get('completedAt')).toMatchObject({
    data_type: 'timestamp with time zone',
    is_nullable: 'YES',
  });

  await expectIndexes(dataSource, schema, 'agent_side_effect_ledger', [
    'idx_agent_side_effect_action_key',
    'idx_agent_side_effect_owner_task',
    'idx_agent_side_effect_status_retry',
    'idx_agent_side_effect_status_lease',
    'idx_agent_side_effect_request_hash',
  ]);
}

async function expectCheckpointSchema(dataSource: DataSource, schema: string) {
  const columns = await tableColumns(
    dataSource,
    schema,
    'agent_run_checkpoints',
  );
  expect(columns.get('agentTaskId')).toMatchObject({
    data_type: 'integer',
    is_nullable: 'NO',
  });
  expect(columns.get('runId')).toMatchObject({
    data_type: 'character varying',
    character_maximum_length: 120,
  });
  expect(columns.get('status')?.column_default).toContain('active');
  expect(columns.get('toolName')).toMatchObject({
    data_type: 'character varying',
    character_maximum_length: 120,
  });

  await expectIndexes(dataSource, schema, 'agent_run_checkpoints', [
    'idx_agent_run_checkpoints_owner_task_created',
    'idx_agent_run_checkpoints_approval_status',
    'idx_agent_run_checkpoints_parent',
  ]);

  await expectConstraints(dataSource, schema, 'agent_run_checkpoints', [
    'fk_agent_run_checkpoints_agent_task_id',
    'fk_agent_run_checkpoints_approval_request_id',
    'fk_agent_run_checkpoints_parent_checkpoint_id',
  ]);
}

async function tableColumns(
  dataSource: DataSource,
  schema: string,
  table: string,
) {
  const rows = await dataSource.query(
    `SELECT "column_name", "data_type", "character_maximum_length", "is_nullable", "column_default"
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Map<string, Record<string, unknown>>(
    rows.map((row: Record<string, unknown>) => [String(row.column_name), row]),
  );
}

async function expectIndexes(
  dataSource: DataSource,
  schema: string,
  table: string,
  names: string[],
) {
  const rows = await dataSource.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
    [schema, table],
  );
  const actual = new Set(
    rows.map((row: { indexname: string }) => row.indexname),
  );
  for (const name of names) {
    expect(actual.has(name)).toBe(true);
  }
}

async function expectConstraints(
  dataSource: DataSource,
  schema: string,
  table: string,
  names: string[],
) {
  const rows = await dataSource.query(
    `SELECT c.conname
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1 AND t.relname = $2`,
    [schema, table],
  );
  const actual = new Set(rows.map((row: { conname: string }) => row.conname));
  for (const name of names) {
    expect(actual.has(name)).toBe(true);
  }
}

async function createPreviousProductionSchema(dataSource: DataSource) {
  await dataSource.query(`
    CREATE TABLE "users" (
      "id" SERIAL PRIMARY KEY
    )
  `);
  await dataSource.query(`
    CREATE TABLE "agent_tasks" (
      "id" SERIAL PRIMARY KEY,
      "ownerUserId" integer NOT NULL
    )
  `);
  await dataSource.query(`
    CREATE TABLE "agent_approval_requests" (
      "id" SERIAL PRIMARY KEY
    )
  `);
  await dataSource.query(`INSERT INTO "users" ("id") VALUES (1)`);
  await dataSource.query(
    `INSERT INTO "agent_tasks" ("id", "ownerUserId") VALUES (1, 1)`,
  );
  await dataSource.query(`
    CREATE TABLE "agent_run_checkpoints" (
      "id" SERIAL PRIMARY KEY,
      "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "taskId" integer NOT NULL REFERENCES "agent_tasks"("id") ON DELETE CASCADE,
      "runId" integer,
      "parentCheckpointId" integer,
      "type" varchar NOT NULL DEFAULT 'step',
      "status" varchar NOT NULL DEFAULT 'open',
      "approvalId" varchar(120),
      "stepId" varchar(120),
      "toolName" varchar(80),
      "branchId" varchar(120),
      "traceId" varchar(120),
      "summary" text NOT NULL DEFAULT '',
      "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "messages" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "retryCount" integer NOT NULL DEFAULT 0,
      "replayCount" integer NOT NULL DEFAULT 0,
      "forkCount" integer NOT NULL DEFAULT 0,
      "version" integer NOT NULL DEFAULT 0,
      "closedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`
    INSERT INTO "agent_run_checkpoints" ("ownerUserId", "taskId", "runId")
    VALUES (1, 1, 123)
  `);
  await dataSource.query(`
    CREATE TABLE "agent_side_effect_ledger" (
      "id" SERIAL PRIMARY KEY,
      "ownerUserId" integer NOT NULL,
      "agentTaskId" integer,
      "actionType" varchar(96) NOT NULL,
      "idempotencyKey" varchar(180) NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending',
      "resourceType" varchar(80) NOT NULL DEFAULT '',
      "resourceId" varchar(120) NOT NULL DEFAULT '',
      "attemptCount" integer NOT NULL DEFAULT 0,
      "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "errorMessage" text NOT NULL DEFAULT '',
      "lastAttemptAt" timestamptz,
      "nextRetryAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(`
    INSERT INTO "agent_side_effect_ledger" ("ownerUserId", "actionType", "idempotencyKey")
    VALUES (1, 'publish_to_discover', 'publish:1')
  `);
}
