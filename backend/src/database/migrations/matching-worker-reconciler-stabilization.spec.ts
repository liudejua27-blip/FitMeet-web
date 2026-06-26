import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from './1780000000000-CoreBaseline';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from './1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { MatchingJobs1781400000000 } from './1781400000000-MatchingJobs';
import { AgentDismissPersistenceStabilization1781600000000 } from './1781600000000-AgentDismissPersistenceStabilization';
import { MatchingWorkerReconcilerStabilization1781800000000 } from './1781800000000-MatchingWorkerReconcilerStabilization';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase('MatchingWorkerReconcilerStabilization migration', () => {
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

  it('adds matching job lease columns and indexes on a fresh database', async () => {
    const dataSource = await freshDataSource();
    try {
      const columns = await dataSource.query(
        `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'matching_jobs'
             AND column_name IN ('leaseOwner', 'leaseExpiresAt', 'lastHeartbeatAt')
           ORDER BY column_name`,
      );
      expect(
        columns.map((row: Record<string, string>) => row.column_name),
      ).toEqual(['lastHeartbeatAt', 'leaseExpiresAt', 'leaseOwner']);

      const indexes = await dataSource.query(
        `SELECT indexname
           FROM pg_indexes
           WHERE schemaname = current_schema()
             AND indexname IN ('idx_matching_jobs_status_lease', 'idx_matching_jobs_owner_status')
           ORDER BY indexname`,
      );
      expect(
        indexes.map((row: Record<string, string>) => row.indexname),
      ).toEqual([
        'idx_matching_jobs_owner_status',
        'idx_matching_jobs_status_lease',
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

async function freshDataSource() {
  const schema = `fitmeet_matching_worker_migration_${Date.now()}_${Math.random()
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
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    schema,
    migrations: [
      CoreBaseline1780000000000,
      AgentPublicLoopP0DatabaseStabilization1781000000000,
      MatchingJobs1781400000000,
      AgentDismissPersistenceStabilization1781600000000,
      MatchingWorkerReconcilerStabilization1781800000000,
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
  return dataSource;
}
