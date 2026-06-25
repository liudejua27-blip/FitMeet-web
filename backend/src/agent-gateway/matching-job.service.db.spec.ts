import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from '../database/migrations/1780000000000-CoreBaseline';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from '../database/migrations/1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { MatchingJobs1781400000000 } from '../database/migrations/1781400000000-MatchingJobs';
import { AgentDismissPersistenceStabilization1781600000000 } from '../database/migrations/1781600000000-AgentDismissPersistenceStabilization';
import { MatchingWorkerReconcilerStabilization1781800000000 } from '../database/migrations/1781800000000-MatchingWorkerReconcilerStabilization';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { MatchingJobService } from './matching-job.service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase('MatchingJobService database leases', () => {
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

  it('does not let two workers claim the same due job', async () => {
    const { dataSource, service } = await serviceWithFreshDatabase();
    try {
      await insertMatchingJobs(dataSource, 3);
      const [first, second] = await Promise.all([
        service.claimDueJobs({ workerId: 'worker-a', limit: 2 }),
        service.claimDueJobs({ workerId: 'worker-b', limit: 2 }),
      ]);
      const claimedIds = [...first, ...second].map((job) => job.id);
      expect(new Set(claimedIds).size).toBe(claimedIds.length);
      expect(claimedIds).toHaveLength(3);

      const rows = await dataSource.getRepository(MatchingJob).find();
      expect(rows).toHaveLength(3);
      expect(
        rows.every((row) => row.status === MatchingJobStatus.Running),
      ).toBe(true);
      expect(rows.every((row) => Boolean(row.leaseOwner))).toBe(true);
    } finally {
      await dataSource.destroy();
    }
  });

  it('recovers an expired running lease before retrying', async () => {
    const { dataSource, service } = await serviceWithFreshDatabase();
    try {
      await insertMatchingJobs(dataSource, 1, {
        status: MatchingJobStatus.Running,
        leaseOwner: 'dead-worker',
        leaseExpiresAt: new Date(Date.now() - 60_000),
        attemptCount: 1,
      });
      const claimed = await service.claimDueJobs({
        workerId: 'worker-recovery',
        limit: 1,
      });
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({
        status: MatchingJobStatus.Running,
        leaseOwner: 'worker-recovery',
        attemptCount: 2,
      });
      expect(claimed[0].leaseExpiresAt).toBeInstanceOf(Date);
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
    entities: [MatchingJob],
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
  return {
    dataSource,
    service: new MatchingJobService(dataSource.getRepository(MatchingJob)),
  };
}

async function createSchema() {
  const schema = `fitmeet_matching_job_service_${Date.now()}_${Math.random()
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

async function insertMatchingJobs(
  dataSource: DataSource,
  count: number,
  overrides: Partial<MatchingJob> = {},
) {
  for (let index = 0; index < count; index += 1) {
    await dataSource.query(
      `INSERT INTO "matching_jobs"
        ("publicIntentId", "ownerUserId", "linkedSocialRequestId",
         "sourceVersion", "idempotencyKey", "status", "attemptCount",
         "leaseOwner", "leaseExpiresAt")
       VALUES ($1, 7, $2, 'source-v1', $3, $4, $5, $6, $7)`,
      [
        `social_request_${index + 1}`,
        index + 1,
        `matching-job:${index + 1}`,
        overrides.status ?? MatchingJobStatus.Queued,
        overrides.attemptCount ?? 0,
        overrides.leaseOwner ?? null,
        overrides.leaseExpiresAt ?? null,
      ],
    );
  }
}
