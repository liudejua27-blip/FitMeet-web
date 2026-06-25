import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from './1780000000000-CoreBaseline';
import { MatchingJobs1781400000000 } from './1781400000000-MatchingJobs';
import { AgentDismissPersistenceStabilization1781600000000 } from './1781600000000-AgentDismissPersistenceStabilization';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase('Agent dismiss persistence migration', () => {
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

  it('creates dismiss lookup indexes on a fresh database', async () => {
    const schema = await createSchema();
    const dataSource = migrationDataSource(schema, [
      CoreBaseline1780000000000,
      MatchingJobs1781400000000,
      AgentDismissPersistenceStabilization1781600000000,
    ]);

    await dataSource.initialize();
    try {
      await dataSource.runMigrations({ transaction: 'each' });
      await expectDismissIndexes(dataSource, schema);
    } finally {
      await dataSource.destroy();
    }
  });

  it('upgrades the previous production dismiss schema in place', async () => {
    const schema = await createSchema();
    const dataSource = migrationDataSource(schema, [
      AgentDismissPersistenceStabilization1781600000000,
    ]);

    await dataSource.initialize();
    try {
      await createPreviousDismissSchema(dataSource);
      await dataSource.runMigrations({ transaction: 'each' });
      await expectDismissIndexes(dataSource, schema);
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
  const schema = `fitmeet_dismiss_${Date.now()}_${Math.random()
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

async function createPreviousDismissSchema(dataSource: DataSource) {
  await dataSource.query(`
    CREATE TABLE "user_social_requests" (
      "id" SERIAL PRIMARY KEY,
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await dataSource.query(`
    CREATE TABLE "public_social_intents" (
      "id" varchar(80) PRIMARY KEY,
      "status" varchar(40) NOT NULL DEFAULT 'searching',
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await dataSource.query(`
    CREATE TABLE "matching_jobs" (
      "id" SERIAL PRIMARY KEY,
      "linkedSocialRequestId" integer,
      "publicIntentId" varchar(80) NOT NULL,
      "status" varchar(40) NOT NULL DEFAULT 'queued'
    )
  `);
}

async function expectDismissIndexes(dataSource: DataSource, schema: string) {
  const indexes = await dataSource.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = $1
       AND indexname = ANY($2::text[])`,
    [
      schema,
      [
        'idx_user_social_requests_publish_status',
        'idx_public_social_intents_tombstone',
        'idx_matching_jobs_request_status',
        'idx_matching_jobs_public_status',
      ],
    ],
  );
  expect(
    indexes.map((row: { indexname: string }) => row.indexname).sort(),
  ).toEqual([
    'idx_matching_jobs_public_status',
    'idx_matching_jobs_request_status',
    'idx_public_social_intents_tombstone',
    'idx_user_social_requests_publish_status',
  ]);
}
