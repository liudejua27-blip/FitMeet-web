import { DataSource } from 'typeorm';

import { CoreBaseline1780000000000 } from '../database/migrations/1780000000000-CoreBaseline';
import { AgentPublicLoopP0DatabaseStabilization1781000000000 } from '../database/migrations/1781000000000-AgentPublicLoopP0DatabaseStabilization';
import { MatchingJobs1781400000000 } from '../database/migrations/1781400000000-MatchingJobs';
import { AgentDismissPersistenceStabilization1781600000000 } from '../database/migrations/1781600000000-AgentDismissPersistenceStabilization';
import { SocialContactLoopV11781700000000 } from '../database/migrations/1781700000000-SocialContactLoopV1';
import { MatchingWorkerReconcilerStabilization1781800000000 } from '../database/migrations/1781800000000-MatchingWorkerReconcilerStabilization';
import { CandidateSearchIndex1782200000000 } from '../database/migrations/1782200000000-CandidateSearchIndex';
import { AgentGlobalTimeGeoFoundation1782400000000 } from '../database/migrations/1782400000000-AgentGlobalTimeGeoFoundation';
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
  SocialRequestType,
  SocialRequestSafety,
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

    it('rejects cross-user public intent dismissal and leaves the other user card active', async () => {
      const { dataSource, service } = await serviceWithFreshDatabase();
      try {
        const owner = await insertDismissFixture(dataSource, {
          email: 'dismiss-owner@example.com',
          title: '今晚青岛轻松跑步',
        });
        const other = await insertDismissFixture(dataSource, {
          email: 'dismiss-other@example.com',
          title: '明天北京篮球搭子',
        });

        await expect(
          service.dismissDraft(owner.ownerUserId, owner.taskId, {
            action: 'social_intent.decline_publish',
            socialRequestId: owner.socialRequestId,
            publicIntentId: other.publicIntentId,
          }),
        ).rejects.toThrow('不属于当前用户');

        const otherIntent = await dataSource
          .getRepository(PublicSocialIntent)
          .findOneByOrFail({ id: other.publicIntentId });
        expect(otherIntent.status).toBe(SocialRequestStatus.Searching);
        expect(otherIntent.metadata).not.toMatchObject({
          tombstoned: true,
        });

        const otherJob = await dataSource
          .getRepository(MatchingJob)
          .findOneByOrFail({ id: other.matchingJobId });
        expect(otherJob.status).toBe(MatchingJobStatus.Queued);
      } finally {
        await dataSource.destroy();
      }
    });

    it('does not cancel matching jobs owned by another user even when they point at the same request', async () => {
      const { dataSource, service } = await serviceWithFreshDatabase();
      try {
        const fixture = await insertDismissFixture(dataSource);
        const otherUserId = await insertUser(dataSource, {
          email: 'job-owner-other@example.com',
          name: 'Other Job Owner',
        });
        const otherJobRows = await dataSource.query(
          `INSERT INTO "matching_jobs"
             ("publicIntentId", "ownerUserId", "linkedSocialRequestId",
              "sourceVersion", "idempotencyKey", "status")
           VALUES ($1, $2, $3, 'source-v1', $4, 'queued')
           RETURNING "id"`,
          [
            fixture.publicIntentId,
            otherUserId,
            fixture.socialRequestId,
            `matching-job:foreign-owner:${fixture.publicIntentId}`,
          ],
        );
        const otherJobId = Number(otherJobRows[0].id);

        await service.dismissDraft(fixture.ownerUserId, fixture.taskId, {
          action: 'social_intent.decline_publish',
          socialRequestId: fixture.socialRequestId,
          publicIntentId: fixture.publicIntentId,
        });

        const otherJob = await dataSource
          .getRepository(MatchingJob)
          .findOneByOrFail({ id: otherJobId });
        expect(otherJob.status).toBe(MatchingJobStatus.Queued);
      } finally {
        await dataSource.destroy();
      }
    });

    it('validates legacy public intents with null userId through the linked social request owner', async () => {
      const { dataSource, service } = await serviceWithFreshDatabase();
      try {
        const owner = await insertDismissFixture(dataSource, {
          email: 'legacy-owner@example.com',
          title: '今晚青岛 legacy 跑步',
        });
        const other = await insertDismissFixture(dataSource, {
          email: 'legacy-other@example.com',
          title: '明天北京 legacy 篮球',
        });
        await dataSource.query(
          `UPDATE "public_social_intents" SET "userId" = NULL WHERE "id" IN ($1, $2)`,
          [owner.publicIntentId, other.publicIntentId],
        );

        await expect(
          service.dismissDraft(owner.ownerUserId, owner.taskId, {
            action: 'social_intent.decline_publish',
            socialRequestId: owner.socialRequestId,
            publicIntentId: other.publicIntentId,
          }),
        ).rejects.toThrow('不属于当前用户');

        const result = await service.dismissDraft(
          owner.ownerUserId,
          owner.taskId,
          {
            action: 'social_intent.decline_publish',
            socialRequestId: owner.socialRequestId,
            publicIntentId: owner.publicIntentId,
            idempotencyKey: `dismiss-owner-legacy:${owner.taskId}`,
          },
        );
        expect(result).toMatchObject({
          status: 'dismissed',
          publicIntentIds: [owner.publicIntentId],
        });

        const otherIntent = await dataSource
          .getRepository(PublicSocialIntent)
          .findOneByOrFail({ id: other.publicIntentId });
        expect(otherIntent.status).toBe(SocialRequestStatus.Searching);
      } finally {
        await dataSource.destroy();
      }
    });

    it('fails publish after cancellation wins the aggregate lock first', async () => {
      const { dataSource, service } = await serviceWithFreshDatabase();
      try {
        const fixture = await insertDraftFixture(dataSource, {
          email: 'cancel-before-publish@example.com',
        });
        await service.dismissDraft(fixture.ownerUserId, fixture.taskId, {
          action: 'social_intent.decline_publish',
          socialRequestId: fixture.socialRequestId,
        });

        await expect(
          service.publishDraft(
            fixture.ownerUserId,
            fixture.taskId,
            publishDraftForFixture(fixture),
          ),
        ).rejects.toThrow('这张约练卡已取消发布，不能再次发布。');

        const state = await readRequestProjectionState(
          dataSource,
          fixture.socialRequestId,
          fixture.publicIntentId,
        );
        expect(state.request?.status).toBe(UserSocialRequestStatus.Cancelled);
        expect(state.activeIntentCount).toBe(0);
        expect(state.activeMatchingJobCount).toBe(0);
      } finally {
        await dataSource.destroy();
      }
    });

    it('tombstones public intent and cancels matching job when cancellation follows a completed publish', async () => {
      const fresh = await serviceWithFreshDatabase({
        executorFactory: (dataSource) => createPublishingExecutor(dataSource),
      });
      try {
        const fixture = await insertDraftFixture(fresh.dataSource, {
          email: 'publish-before-cancel@example.com',
        });
        const publish = await fresh.service.publishDraft(
          fixture.ownerUserId,
          fixture.taskId,
          publishDraftForFixture(fixture),
        );
        expect(publish).toMatchObject({
          status: 'published',
          publicIntentId: fixture.publicIntentId,
        });

        await fresh.service.dismissDraft(fixture.ownerUserId, fixture.taskId, {
          action: 'social_intent.decline_publish',
          socialRequestId: fixture.socialRequestId,
          publicIntentId: fixture.publicIntentId,
        });

        const state = await readRequestProjectionState(
          fresh.dataSource,
          fixture.socialRequestId,
          fixture.publicIntentId,
        );
        expect(state.request?.status).toBe(UserSocialRequestStatus.Cancelled);
        expect(state.publicIntent?.status).toBe(SocialRequestStatus.Inactive);
        expect(state.publicIntent?.metadata).toMatchObject({
          tombstoned: true,
        });
        expect(state.activeMatchingJobCount).toBe(0);
      } finally {
        await fresh.dataSource.destroy();
      }
    });

    it('stages one private draft request and publishes the same request without a prefilled socialRequestId', async () => {
      const fresh = await serviceWithFreshDatabase({
        executorFactory: (dataSource) => createPublishingExecutor(dataSource),
      });
      try {
        const fixture = await insertTaskOnlyFixture(fresh.dataSource, {
          email: 'stage-without-id@example.com',
          title: '今晚青岛中山公园散步搭子',
        });
        const draft = {
          type: SocialRequestType.RunningPartner,
          rawText: fixture.title,
          title: fixture.title,
          city: fixture.city,
          activityType: 'walking',
          safetyRequirement: SocialRequestSafety.LowRiskOnly,
          visibility: SocialRequestVisibility.Private,
          status: UserSocialRequestStatus.Draft,
          metadata: {
            locationPreference: '青岛中山公园',
            timePreference: '今晚 18:00',
            safetyBoundary: '首次见面只在公共场所，先站内沟通',
          },
        };

        const staged = await fresh.service.stagePrivateDraftForPublish(
          fixture.ownerUserId,
          fixture.taskId,
          draft,
        );

        expect(staged.socialRequestId).toBeGreaterThan(0);
        expect(staged.draft.socialRequestId).toBe(staged.socialRequestId);
        const privateRequests = await fresh.dataSource
          .getRepository(UserSocialRequest)
          .findBy({ userId: fixture.ownerUserId });
        expect(privateRequests).toHaveLength(1);
        expect(privateRequests[0]).toMatchObject({
          id: staged.socialRequestId,
          status: UserSocialRequestStatus.Draft,
          visibility: SocialRequestVisibility.Private,
          agentAllowed: true,
          requireUserConfirmation: true,
        });
        expect(privateRequests[0].metadata).toMatchObject({
          publishStatus: 'draft',
          visibility: 'private',
          stagedForDiscover: true,
          agentTaskId: fixture.taskId,
        });

        const publish = await fresh.service.publishDraft(
          fixture.ownerUserId,
          fixture.taskId,
          draft,
        );

        expect(publish).toMatchObject({
          status: 'published',
          socialRequestId: staged.socialRequestId,
          publicIntentId: `social_request_${staged.socialRequestId}`,
        });
        const requestsAfterPublish = await fresh.dataSource
          .getRepository(UserSocialRequest)
          .findBy({ userId: fixture.ownerUserId });
        expect(requestsAfterPublish).toHaveLength(1);
        expect(requestsAfterPublish[0]).toMatchObject({
          id: staged.socialRequestId,
          status: UserSocialRequestStatus.Matching,
          visibility: SocialRequestVisibility.Public,
        });
        const publicIntent = await fresh.dataSource
          .getRepository(PublicSocialIntent)
          .findOneByOrFail({
            id: `social_request_${staged.socialRequestId}`,
          });
        expect(publicIntent).toMatchObject({
          userId: fixture.ownerUserId,
          linkedSocialRequestId: staged.socialRequestId,
          status: SocialRequestStatus.Searching,
        });
        const matchingJobs = await fresh.dataSource
          .getRepository(MatchingJob)
          .findBy({ linkedSocialRequestId: staged.socialRequestId });
        expect(matchingJobs).toHaveLength(1);
        expect(matchingJobs[0]).toMatchObject({
          ownerUserId: fixture.ownerUserId,
          publicIntentId: `social_request_${staged.socialRequestId}`,
          status: MatchingJobStatus.Queued,
        });
      } finally {
        await fresh.dataSource.destroy();
      }
    });

    it('keeps publish and dismiss concurrent execution in a complete final state', async () => {
      const fresh = await serviceWithFreshDatabase({
        executorFactory: (dataSource) =>
          createPublishingExecutor(dataSource, 25),
      });
      try {
        const fixture = await insertDraftFixture(fresh.dataSource, {
          email: 'publish-dismiss-race@example.com',
        });

        const [publish, dismiss] = await Promise.allSettled([
          fresh.service.publishDraft(
            fixture.ownerUserId,
            fixture.taskId,
            publishDraftForFixture(fixture),
          ),
          fresh.service.dismissDraft(fixture.ownerUserId, fixture.taskId, {
            action: 'social_intent.decline_publish',
            socialRequestId: fixture.socialRequestId,
          }),
        ]);

        const state = await readRequestProjectionState(
          fresh.dataSource,
          fixture.socialRequestId,
          fixture.publicIntentId,
        );
        const isDismissed =
          state.request?.status === UserSocialRequestStatus.Cancelled;
        const isPublished =
          state.request?.status === UserSocialRequestStatus.Matching &&
          state.publicIntent?.status === SocialRequestStatus.Searching &&
          state.activeMatchingJobCount === 1;

        expect(isDismissed || isPublished).toBe(true);
        if (isDismissed) {
          expect(state.activeIntentCount).toBe(0);
          expect(state.activeMatchingJobCount).toBe(0);
        }
        if (isPublished) {
          expect(publish.status).toBe('fulfilled');
          expect(dismiss.status).toBe('rejected');
        }
      } finally {
        await fresh.dataSource.destroy();
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

async function serviceWithFreshDatabase(
  options: {
    executor?: unknown;
    executorFactory?: (dataSource: DataSource) => unknown;
  } = {},
) {
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
      SocialContactLoopV11781700000000,
      MatchingWorkerReconcilerStabilization1781800000000,
      CandidateSearchIndex1782200000000,
      AgentGlobalTimeGeoFoundation1782400000000,
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
  const executor = options.executor ??
    options.executorFactory?.(dataSource) ?? {
      executeToolAction: jest.fn(),
    };
  return {
    dataSource,
    service: new SocialAgentDraftPublicationService(
      dataSource.getRepository(AgentTask),
      dataSource.getRepository(AgentTaskEvent),
      executor as never,
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

type SocialRequestFixture = {
  city: string;
  matchingJobId?: number;
  ownerUserId: number;
  publicIntentId: string;
  socialRequestId: number;
  taskId: number;
  title: string;
};

async function insertUser(
  dataSource: DataSource,
  input: { email: string; name: string },
) {
  const rows = await dataSource.query(
    `INSERT INTO "users" ("email", "password", "name")
     VALUES ($1, $2, $3)
     RETURNING "id"`,
    [input.email, 'password', input.name],
  );
  return Number(rows[0].id);
}

async function insertDismissFixture(
  dataSource: DataSource,
  input: {
    city?: string;
    email?: string;
    title?: string;
  } = {},
): Promise<SocialRequestFixture & { matchingJobId: number }> {
  const title = input.title ?? '今晚青岛轻松跑步';
  const city = input.city ?? '青岛';
  const ownerUserId = await insertUser(dataSource, {
    email:
      input.email ??
      `dismiss-db-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Dismiss DB User',
  });

  const socialRequestRows = await dataSource.query(
    `INSERT INTO "user_social_requests"
       ("userId", "source", "type", "title", "rawText", "city",
        "activityType", "status", "visibility", "metadata")
     VALUES ($1, 'fitmeet_agent', 'running_partner', $2, $3, $4,
       'running', 'draft', 'matched_only', '{}'::jsonb)
     RETURNING "id"`,
    [ownerUserId, title, title, city],
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
      title,
      JSON.stringify({
        chatRun: {
          socialRequestDraft: {
            socialRequestId,
            publicIntentId,
            title,
          },
        },
      }),
      JSON.stringify({
        socialAgentChat: {
          socialRequestDraft: {
            socialRequestId,
            publicIntentId,
            title,
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
     VALUES ($1, $2, $3, 'running_partner', $4, $5, $6, '五四广场',
       'running_partner', '[11,12]'::jsonb, 2, 'searching',
       '{"sourceVersion":"source-v1"}'::jsonb)`,
    [publicIntentId, ownerUserId, socialRequestId, title, title, city],
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
    city,
    ownerUserId,
    publicIntentId,
    socialRequestId,
    taskId,
    title,
  };
}

async function insertDraftFixture(
  dataSource: DataSource,
  input: {
    city?: string;
    email?: string;
    title?: string;
  } = {},
): Promise<SocialRequestFixture> {
  const title = input.title ?? '今晚青岛轻松跑步';
  const city = input.city ?? '青岛';
  const ownerUserId = await insertUser(dataSource, {
    email:
      input.email ??
      `draft-db-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Draft DB User',
  });

  const socialRequestRows = await dataSource.query(
    `INSERT INTO "user_social_requests"
       ("userId", "source", "type", "title", "rawText", "city",
        "activityType", "status", "visibility", "metadata")
     VALUES ($1, 'fitmeet_agent', 'running_partner', $2, $3, $4,
       'running', 'draft', 'matched_only', '{}'::jsonb)
     RETURNING "id"`,
    [ownerUserId, title, title, city],
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
      title,
      JSON.stringify({
        chatRun: {
          socialRequestDraft: {
            socialRequestId,
            title,
          },
        },
      }),
      JSON.stringify({
        socialAgentChat: {
          socialRequestDraft: {
            socialRequestId,
            title,
          },
        },
      }),
      AgentTaskStatus.AwaitingConfirmation,
      AgentTaskPermissionMode.Confirm,
    ],
  );

  return {
    city,
    ownerUserId,
    publicIntentId,
    socialRequestId,
    taskId: Number(taskRows[0].id),
    title,
  };
}

async function insertTaskOnlyFixture(
  dataSource: DataSource,
  input: {
    city?: string;
    email?: string;
    title?: string;
  } = {},
): Promise<Omit<SocialRequestFixture, 'publicIntentId' | 'socialRequestId'>> {
  const title = input.title ?? '今晚青岛轻松跑步';
  const city = input.city ?? '青岛';
  const ownerUserId = await insertUser(dataSource, {
    email:
      input.email ??
      `task-only-db-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Task Only DB User',
  });
  const taskRows = await dataSource.query(
    `INSERT INTO "agent_tasks"
       ("ownerUserId", "taskType", "title", "goal", "result", "memory",
        "status", "permissionMode")
     VALUES ($1, 'social_agent_chat', 'FitMeet Agent 聊天任务', $2,
       '{}'::jsonb, '{}'::jsonb, $3, $4)
     RETURNING "id"`,
    [
      ownerUserId,
      title,
      AgentTaskStatus.AwaitingConfirmation,
      AgentTaskPermissionMode.Confirm,
    ],
  );
  return {
    city,
    ownerUserId,
    taskId: Number(taskRows[0].id),
    title,
  };
}

function publishDraftForFixture(fixture: SocialRequestFixture) {
  return {
    socialRequestId: fixture.socialRequestId,
    type: SocialRequestType.RunningPartner,
    rawText: fixture.title,
    title: fixture.title,
    city: fixture.city,
    activityType: 'running',
    visibility: SocialRequestVisibility.Private,
    status: UserSocialRequestStatus.Draft,
    metadata: {
      locationPreference: '五四广场',
      timePreference: '今晚 19:00',
    },
  };
}

function createPublishingExecutor(dataSource: DataSource, delayMs = 0) {
  return {
    executeToolAction: jest.fn(
      async (
        _taskId: number,
        _toolName: unknown,
        payload: Record<string, unknown>,
        ownerUserId: number,
      ) => {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        const socialRequestId = Number(payload.socialRequestId);
        const title =
          typeof payload.title === 'string'
            ? payload.title
            : '今晚青岛轻松跑步';
        const city = typeof payload.city === 'string' ? payload.city : '青岛';
        const publicIntentId = `social_request_${socialRequestId}`;
        const sourceVersion = `source-v-${socialRequestId}`;
        const updatedRows = await dataSource.query(
          `UPDATE "user_social_requests"
           SET "status" = 'matching',
               "visibility" = 'public',
               "metadata" = COALESCE("metadata", '{}'::jsonb) || $3::jsonb
           WHERE "id" = $1
             AND "userId" = $2
             AND "status" <> 'cancelled'
           RETURNING "id"`,
          [
            socialRequestId,
            ownerUserId,
            JSON.stringify({
              publishStatus: 'published',
              sourceVersion,
            }),
          ],
        );
        if (!updatedRows[0]) {
          return {
            id: 'publish_cancelled',
            status: 'failed',
            output: null,
            error: { message: 'request_cancelled_before_publish' },
          };
        }
        await dataSource.query(
          `INSERT INTO "public_social_intents"
             ("id", "userId", "linkedSocialRequestId", "requestType", "title",
              "description", "city", "loc", "timePreference",
              "locationPreference", "socialGoal", "candidateUserIds",
              "matchedCount", "status", "metadata")
           VALUES ($1, $2, $3, 'running_partner', $4, $5, $6, '五四广场',
             '今晚 19:00', '五四广场', 'running_partner', '[]'::jsonb,
             0, 'searching', $7::jsonb)
           ON CONFLICT ("id") DO UPDATE
           SET "userId" = EXCLUDED."userId",
               "linkedSocialRequestId" = EXCLUDED."linkedSocialRequestId",
               "title" = EXCLUDED."title",
               "description" = EXCLUDED."description",
               "city" = EXCLUDED."city",
               "status" = 'searching',
               "metadata" = EXCLUDED."metadata",
               "updatedAt" = now()`,
          [
            publicIntentId,
            ownerUserId,
            socialRequestId,
            title,
            title,
            city,
            JSON.stringify({ sourceVersion }),
          ],
        );
        return {
          id: 'action_create_social_request_publish_db',
          toolName: 'create_social_request',
          status: 'succeeded',
          output: {
            id: socialRequestId,
            socialRequestId,
            publicIntentId,
            synced: true,
            publicIntent: {
              id: publicIntentId,
              title,
              city,
              timePreference: '今晚 19:00',
              locationPreference: '五四广场',
            },
            socialRequest: {
              id: socialRequestId,
              status: UserSocialRequestStatus.Matching,
            },
          },
          error: null,
        };
      },
    ),
  };
}

async function readRequestProjectionState(
  dataSource: DataSource,
  socialRequestId: number,
  publicIntentId: string,
) {
  const request = await dataSource
    .getRepository(UserSocialRequest)
    .findOneBy({ id: socialRequestId });
  const publicIntent = await dataSource
    .getRepository(PublicSocialIntent)
    .findOneBy({ id: publicIntentId });
  const activeIntentRows = await dataSource.query(
    `SELECT COUNT(*)::int AS count
     FROM "public_social_intents"
     WHERE "linkedSocialRequestId" = $1
       AND "status" IN ('active', 'searching', 'matched')
       AND COALESCE("metadata" ->> 'tombstoned', 'false') <> 'true'`,
    [socialRequestId],
  );
  const activeMatchingJobRows = await dataSource.query(
    `SELECT COUNT(*)::int AS count
     FROM "matching_jobs"
     WHERE "linkedSocialRequestId" = $1
       AND "status" IN ('queued', 'running')`,
    [socialRequestId],
  );
  return {
    activeIntentCount: Number(activeIntentRows[0]?.count ?? 0),
    activeMatchingJobCount: Number(activeMatchingJobRows[0]?.count ?? 0),
    publicIntent,
    request,
  };
}
