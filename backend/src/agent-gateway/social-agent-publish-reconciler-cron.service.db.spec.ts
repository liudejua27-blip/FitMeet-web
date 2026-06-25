import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from '../database/migrations/1780000000000-CoreBaseline';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from '../database/migrations/1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { ProfileUpdateProposals1781200000000 } from '../database/migrations/1781200000000-ProfileUpdateProposals';
import { MatchingJobs1781400000000 } from '../database/migrations/1781400000000-MatchingJobs';
import { AgentDismissPersistenceStabilization1781600000000 } from '../database/migrations/1781600000000-AgentDismissPersistenceStabilization';
import { MatchingWorkerReconcilerStabilization1781800000000 } from '../database/migrations/1781800000000-MatchingWorkerReconcilerStabilization';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { AgentConnection } from './entities/agent-connection.entity';
import { SocialAgentPublishReconcilerCronService } from './social-agent-publish-reconciler-cron.service';
import { User } from '../users/user.entity';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase(
  'SocialAgentPublishReconcilerCronService database leases',
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

    it('does not let two reconciler instances process the same task', async () => {
      const dataSource = await freshDataSource();
      try {
        const ownerUserId = await insertUser(dataSource);
        const taskIds = await insertPublishedTasks(dataSource, ownerUserId, 3);
        const processed: number[] = [];
        const reconciler = {
          reconcileTask: jest.fn(
            async (_ownerUserId: number, taskId: number) => {
              processed.push(taskId);
              await sleep(25);
              return { status: 'visible' };
            },
          ),
        };
        const first = new SocialAgentPublishReconcilerCronService(
          dataSource.getRepository(AgentTask),
          reconciler as never,
        );
        const second = new SocialAgentPublishReconcilerCronService(
          dataSource.getRepository(AgentTask),
          reconciler as never,
        );

        const [firstSummary, secondSummary] = await Promise.all([
          first.reconcileDuePublishedTasks(2),
          second.reconcileDuePublishedTasks(2),
        ]);

        expect(firstSummary.scanned + secondSummary.scanned).toBe(3);
        expect(new Set(processed).size).toBe(processed.length);
        expect([...processed].sort((a, b) => a - b)).toEqual(
          [...taskIds].sort((a, b) => a - b),
        );
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

async function freshDataSource() {
  const schema = `fitmeet_publish_reconciler_${Date.now()}_${Math.random()
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
    entities: [AgentConnection, AgentTask, User],
    migrations: [
      CoreBaseline1780000000000,
      AgentPublicLoopP0DatabaseStabilization1781000000000,
      ProfileUpdateProposals1781200000000,
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

async function insertUser(dataSource: DataSource) {
  const rows = await dataSource.query(
    `INSERT INTO "users" ("email", "password", "name")
     VALUES ($1, 'password', 'Reconciler User')
     RETURNING "id"`,
    [`reconciler-${Date.now()}@example.com`],
  );
  return Number(rows[0].id);
}

async function insertPublishedTasks(
  dataSource: DataSource,
  ownerUserId: number,
  count: number,
) {
  const taskIds: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const publicIntentId = `public_reconcile_${index + 1}`;
    const rows = await dataSource.query(
      `INSERT INTO "agent_tasks"
        ("ownerUserId", "taskType", "title", "goal", "result", "memory",
         "status", "permissionMode")
       VALUES ($1, 'social_agent_chat', $2, $3, $4::jsonb, '{}'::jsonb, $5, $6)
       RETURNING "id"`,
      [
        ownerUserId,
        `Reconcile task ${index + 1}`,
        `Reconcile task ${index + 1}`,
        JSON.stringify({
          publishSocialRequest: {
            publicIntentId,
            socialRequestId: index + 1,
            sourceVersion: 'source-v1',
          },
        }),
        AgentTaskStatus.WaitingResult,
        AgentTaskPermissionMode.Confirm,
      ],
    );
    taskIds.push(Number(rows[0].id));
  }
  return taskIds;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
