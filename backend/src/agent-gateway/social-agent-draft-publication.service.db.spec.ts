import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from '../database/migrations/1780000000000-CoreBaseline';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from '../database/migrations/1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { MatchingJobs1781400000000 } from '../database/migrations/1781400000000-MatchingJobs';
import { AgentDismissPersistenceStabilization1781600000000 } from '../database/migrations/1781600000000-AgentDismissPersistenceStabilization';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  AgentSideEffectLedger,
  AgentSideEffectLedgerStatus,
} from './entities/agent-side-effect-ledger.entity';
import { MatchingJob, MatchingJobStatus } from './entities/matching-job.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { User } from '../users/user.entity';
import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';
import { MatchingJobService } from './matching-job.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const schemas: string[] = [];

describeWithDatabase(
  'SocialAgentDraftPublicationService database semantics',
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

    it('deduplicates concurrent dismiss clicks and persists cancellation projections', async () => {
      const { dataSource, service } = await serviceWithFreshDatabase();
      try {
        const fixture = await insertDismissFixture(dataSource);

        const payload = {
          action: 'social_intent.decline_publish',
          socialRequestId: fixture.socialRequestId,
          publicIntentId: fixture.publicIntentId,
        };
        const [first, second] = await Promise.all([
          service.dismissDraft(fixture.ownerUserId, fixture.taskId, payload),
          service.dismissDraft(fixture.ownerUserId, fixture.taskId, payload),
        ]);

        expect(second).toEqual(first);
        expect(first).toMatchObject({
          status: 'dismissed',
          socialRequestId: fixture.socialRequestId,
          publicIntentId: null,
          publicIntentIds: [fixture.publicIntentId],
          publicIntentsTombstoned: 1,
          socialRequestDismissed: true,
        });

        const task = await dataSource
          .getRepository(AgentTask)
          .findOneByOrFail({ id: fixture.taskId });
        expect(task).toMatchObject({
          status: AgentTaskStatus.Cancelled,
          statusReason: 'social_intent_publish_dismissed',
        });
        expect(task.result).toMatchObject({
          activityDraft: null,
          publishSocialRequest: {
            status: 'dismissed',
            publicIntentId: null,
            publicIntentIds: [fixture.publicIntentId],
            publicIntentsTombstoned: 1,
          },
        });

        const socialRequest = await dataSource
          .getRepository(UserSocialRequest)
          .findOneByOrFail({ id: fixture.socialRequestId });
        expect(socialRequest).toMatchObject({
          status: UserSocialRequestStatus.Cancelled,
          visibility: SocialRequestVisibility.Private,
          agentAllowed: false,
        });
        expect(socialRequest.metadata).toMatchObject({
          dismissed: true,
          publishStatus: 'dismissed',
          visibility: 'hidden',
        });

        const publicIntent = await dataSource
          .getRepository(PublicSocialIntent)
          .findOneByOrFail({ id: fixture.publicIntentId });
        expect(publicIntent).toMatchObject({
          status: SocialRequestStatus.Inactive,
          candidateUserIds: [],
          matchedCount: 0,
        });
        expect(publicIntent.metadata).toMatchObject({
          tombstoned: true,
          tombstoneReason: 'social_intent_publish_dismissed',
        });

        const matchingJob = await dataSource
          .getRepository(MatchingJob)
          .findOneByOrFail({ id: fixture.matchingJobId });
        expect(matchingJob).toMatchObject({
          status: MatchingJobStatus.Cancelled,
          errorMessage: 'cancelled_by_user',
        });

        const ledgerRows = await dataSource
          .getRepository(AgentSideEffectLedger)
          .findBy({
            actionType: 'dismiss_social_request_publish',
            idempotencyKey: `dismiss-social-request:${fixture.taskId}:social-request:${fixture.socialRequestId}`,
          });
        expect(ledgerRows).toHaveLength(1);
        expect(ledgerRows[0]).toMatchObject({
          status: AgentSideEffectLedgerStatus.Succeeded,
          attemptCount: 1,
        });
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

async function serviceWithFreshDatabase() {
  const schema = await createSchema();
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    schema,
    entities: [
      AgentSideEffectLedger,
      AgentConnection,
      AgentTask,
      AgentTaskEvent,
      MatchingJob,
      PublicSocialIntent,
      User,
      UserSocialRequest,
    ],
    migrations: [
      CoreBaseline1780000000000,
      AgentPublicLoopP0DatabaseStabilization1781000000000,
      MatchingJobs1781400000000,
      AgentDismissPersistenceStabilization1781600000000,
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
    service: new SocialAgentDraftPublicationService(
      dataSource.getRepository(AgentTask),
      dataSource.getRepository(AgentTaskEvent),
      {
        executeToolAction: jest.fn(),
      } as never,
      undefined,
      dataSource.getRepository(PublicSocialIntent),
      new AgentSideEffectLedgerService(
        dataSource.getRepository(AgentSideEffectLedger),
      ),
      new MatchingJobService(dataSource.getRepository(MatchingJob)),
      dataSource.getRepository(UserSocialRequest),
      dataSource.getRepository(MatchingJob),
    ),
  };
}

async function createSchema() {
  const schema = `fitmeet_dismiss_service_${Date.now()}_${Math.random()
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

async function insertDismissFixture(dataSource: DataSource) {
  const userRows = await dataSource.query(
    `INSERT INTO "users" ("email", "password", "name")
     VALUES ($1, $2, $3)
     RETURNING "id"`,
    ['dismiss-db@example.com', 'password', 'Dismiss DB User'],
  );
  const ownerUserId = Number(userRows[0].id);

  const socialRequestRows = await dataSource.query(
    `INSERT INTO "user_social_requests"
       ("userId", "source", "type", "title", "rawText", "city",
        "activityType", "status", "visibility", "metadata")
     VALUES ($1, 'fitmeet_agent', 'running_partner', $2, $2, '青岛',
       'running', 'draft', 'matched_only', '{}'::jsonb)
     RETURNING "id"`,
    [ownerUserId, '今晚青岛轻松跑步'],
  );
  const socialRequestId = Number(socialRequestRows[0].id);
  const publicIntentId = `social_request_${socialRequestId}`;

  const taskRows = await dataSource.query(
    `INSERT INTO "agent_tasks"
       ("ownerUserId", "taskType", "title", "goal", "result", "memory",
        "status", "permissionMode")
     VALUES ($1, 'social_agent_chat', 'FitMeet Agent 聊天任务', $2,
       $3::jsonb, $4::jsonb, $5, $6)
     RETURNING "id"`,
    [
      ownerUserId,
      '今晚青岛轻松跑步',
      JSON.stringify({
        chatRun: {
          socialRequestDraft: {
            socialRequestId,
            publicIntentId,
            title: '今晚青岛轻松跑步',
          },
        },
      }),
      JSON.stringify({
        socialAgentChat: {
          socialRequestDraft: {
            socialRequestId,
            publicIntentId,
            title: '今晚青岛轻松跑步',
          },
        },
      }),
      AgentTaskStatus.AwaitingConfirmation,
      AgentTaskPermissionMode.Confirm,
    ],
  );
  const taskId = Number(taskRows[0].id);

  await dataSource.query(
    `INSERT INTO "public_social_intents"
       ("id", "userId", "linkedSocialRequestId", "requestType", "title",
        "description", "city", "loc", "socialGoal", "candidateUserIds",
        "matchedCount", "status", "metadata")
     VALUES ($1, $2, $3, 'running_partner', $4, $4, '青岛', '五四广场',
       'running_partner', '[11,12]'::jsonb, 2, 'searching',
       '{"sourceVersion":"source-v1"}'::jsonb)`,
    [publicIntentId, ownerUserId, socialRequestId, '今晚青岛轻松跑步'],
  );

  const matchingJobRows = await dataSource.query(
    `INSERT INTO "matching_jobs"
       ("publicIntentId", "ownerUserId", "linkedSocialRequestId",
        "sourceVersion", "idempotencyKey", "status")
     VALUES ($1, $2, $3, 'source-v1', $4, 'queued')
     RETURNING "id"`,
    [
      publicIntentId,
      ownerUserId,
      socialRequestId,
      `matching-job:${publicIntentId}:source-v1`,
    ],
  );

  return {
    matchingJobId: Number(matchingJobRows[0].id),
    ownerUserId,
    publicIntentId,
    socialRequestId,
    taskId,
  };
}
