import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from './1780000000000-CoreBaseline';
import { SocialAgentLongTermMemorySchemaAlignment1782100000000 } from './1782100000000-SocialAgentLongTermMemorySchemaAlignment';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describe('SocialAgentLongTermMemory schema contract', () => {
  it('keeps the incremental migration aligned with the entity-owned columns', () => {
    const entity = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'agent-gateway',
        'entities',
        'social-agent-long-term-memory.entity.ts',
      ),
      'utf8',
    );
    const migration = readFileSync(
      join(
        __dirname,
        '1782100000000-SocialAgentLongTermMemorySchemaAlignment.ts',
      ),
      'utf8',
    );

    for (const column of [
      'userId',
      'preferences',
      'boundaries',
      'activityPreferences',
      'matchSignals',
      'taskSummaries',
      'taskCount',
    ]) {
      expect(entity).toContain(column);
      expect(migration).toContain(`"${column}"`);
    }
    expect(migration).toContain('"ownerUserId"');
    expect(migration).toContain('"safetyMemory"');
    expect(migration).toContain('"relationshipMemory"');
  });
});

describeWithDatabase(
  'SocialAgentLongTermMemory schema alignment migration',
  () => {
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

    it('creates entity-compatible columns on a fresh database', async () => {
      const dataSource = await migratedDataSource([
        CoreBaseline1780000000000,
        SocialAgentLongTermMemorySchemaAlignment1782100000000,
      ]);
      try {
        await expectLongTermMemorySchema(dataSource);
      } finally {
        await dataSource.destroy();
      }
    });

    it('upgrades legacy production rows without losing memory payloads', async () => {
      const schema = await createSchema();
      const dataSource = migrationDataSource(schema, [
        SocialAgentLongTermMemorySchemaAlignment1782100000000,
      ]);
      await dataSource.initialize();
      try {
        await createLegacySchema(dataSource);
        await dataSource.runMigrations({ transaction: 'each' });
        await expectLongTermMemorySchema(dataSource);

        const rows = await dataSource.query(`
        SELECT
          "userId",
          "preferences",
          "boundaries",
          "activityPreferences",
          "matchSignals",
          "taskSummaries",
          "taskCount"
        FROM "social_agent_long_term_memory"
      `);
        expect(rows).toEqual([
          {
            userId: 1,
            preferences: { interests: ['羽毛球'] },
            boundaries: { publicPlaceOnly: true },
            activityPreferences: { favoriteCities: ['青岛'] },
            matchSignals: { successfulMatches: [{ candidateUserId: 2 }] },
            taskSummaries: [],
            taskCount: 0,
          },
        ]);
      } finally {
        await dataSource.destroy();
      }
    });
  },
);

function adminDataSource() {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
  });
}

async function migratedDataSource(
  migrations: NonNullable<
    ConstructorParameters<typeof DataSource>[0]['migrations']
  >,
) {
  const schema = await createSchema();
  const dataSource = migrationDataSource(schema, migrations);
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  return dataSource;
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
  const schema = `fitmeet_ltm_schema_${Date.now()}_${Math.random()
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

async function expectLongTermMemorySchema(dataSource: DataSource) {
  const columns = await dataSource.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'social_agent_long_term_memory'
      AND column_name IN (
        'userId',
        'preferences',
        'boundaries',
        'activityPreferences',
        'matchSignals',
        'taskSummaries',
        'taskCount'
      )
  `);
  const byName = new Map<string, Record<string, unknown>>(
    columns.map((row: Record<string, unknown>) => [
      String(row.column_name),
      row,
    ]),
  );

  expect(byName.get('userId')).toMatchObject({
    data_type: 'integer',
    is_nullable: 'NO',
  });
  for (const column of [
    'preferences',
    'boundaries',
    'activityPreferences',
    'matchSignals',
    'taskSummaries',
  ]) {
    expect(byName.get(column)).toMatchObject({
      data_type: 'jsonb',
      is_nullable: 'NO',
    });
  }
  expect(byName.get('taskCount')).toMatchObject({
    data_type: 'integer',
    is_nullable: 'NO',
  });

  const indexes = await dataSource.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'social_agent_long_term_memory'
      AND indexname = 'idx_social_agent_ltm_user_id'
  `);
  expect(indexes).toHaveLength(1);

  const constraints = await dataSource.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = current_schema()
      AND t.relname = 'social_agent_long_term_memory'
      AND c.conname = 'fk_social_agent_ltm_user_id'
  `);
  expect(constraints).toHaveLength(1);
}

async function createLegacySchema(dataSource: DataSource) {
  await dataSource.query(`
    CREATE TABLE "users" (
      "id" SERIAL PRIMARY KEY
    )
  `);
  await dataSource.query(`INSERT INTO "users" ("id") VALUES (1)`);
  await dataSource.query(`
    CREATE TABLE "social_agent_long_term_memory" (
      "id" SERIAL PRIMARY KEY,
      "ownerUserId" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
      "preferenceMemory" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "safetyMemory" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "relationshipMemory" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "activityMemory" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "recentHighlights" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "version" integer NOT NULL DEFAULT 0,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await dataSource.query(
    `
    INSERT INTO "social_agent_long_term_memory" (
      "ownerUserId",
      "preferenceMemory",
      "safetyMemory",
      "relationshipMemory",
      "activityMemory"
    )
    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
  `,
    [
      1,
      JSON.stringify({ interests: ['羽毛球'] }),
      JSON.stringify({ publicPlaceOnly: true }),
      JSON.stringify({ successfulMatches: [{ candidateUserId: 2 }] }),
      JSON.stringify({ favoriteCities: ['青岛'] }),
    ],
  );
}
