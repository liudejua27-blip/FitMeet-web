import { createRequire } from 'module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { PublicSocialIntent } from '../src/agent-gateway/entities/public-social-intent.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from '../src/agent-gateway/entities/social-request.entity';
import { MeetParticipant } from '../src/meets/meet-participant.entity';
import { Meet } from '../src/meets/meet.entity';
import { Conversation } from '../src/messages/conversation.schema';
import { DomainOutboxWorkerService } from '../src/messages/domain-outbox-worker.service';
import { Message } from '../src/messages/message.schema';
import { ContactPermission } from '../src/social-loop/contact-permission.entity';
import { ContactPolicyService } from '../src/social-loop/contact-policy.service';
import { DomainOutboxEvent } from '../src/social-loop/domain-outbox-event.entity';
import { PublicIntentApplication } from '../src/social-loop/public-intent-application.entity';
import { MediaAsset } from '../src/users/media-asset.entity';
import { UserConsent } from '../src/users/user-consent.entity';
import { UserProfilePhoto } from '../src/users/user-profile-photo.entity';
import { UserSocialProfile } from '../src/users/user-social-profile.entity';
import { User } from '../src/users/user.entity';

const runId = `social-loop-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2)}`;
const password = 'Password123!';
const requireModule = createRequire(__filename);

type TestUser = {
  id: number;
  token: string;
  email: string;
};

function configureIntegrationEnvironment() {
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_SCHEDULER = 'false';
  process.env.FITMEET_PROCESS_ROLE = 'api';
  process.env.FITMEET_DISABLE_THROTTLE = 'true';
  process.env.DATABASE_URL =
    process.env.FITMEET_INTEGRATION_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://root:password123@localhost:5432/fitness_app';
  process.env.MONGO_URI =
    process.env.FITMEET_INTEGRATION_MONGO_URI ??
    process.env.MONGO_URI ??
    `mongodb://localhost:27017/fitness_app_${runId.replace(/-/g, '_')}`;
  process.env.REDIS_URL =
    process.env.FITMEET_INTEGRATION_REDIS_URL ??
    process.env.REDIS_URL ??
    'redis://localhost:6379/15';
}

describe('Social Contact Loop V1 integration', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let mongoConnection: Connection;
  let outboxWorker: DomainOutboxWorkerService;
  let userRepo: Repository<User>;
  let publicIntentRepo: Repository<PublicSocialIntent>;
  let applicationRepo: Repository<PublicIntentApplication>;
  let meetRepo: Repository<Meet>;
  let participantRepo: Repository<MeetParticipant>;
  let permissionRepo: Repository<ContactPermission>;
  let outboxRepo: Repository<DomainOutboxEvent>;
  let contactPolicy: ContactPolicyService;
  let jwtService: JwtService;
  let conversationModel: Model<Conversation>;
  let messageModel: Model<Message>;

  beforeAll(async () => {
    configureIntegrationEnvironment();
    await bootTestApp({ runMigrations: true });
    await cleanupPostgres();
  }, 60_000);

  afterAll(async () => {
    if (dataSource) {
      await cleanupPostgres();
    }
    await mongoConnection?.dropDatabase().catch(() => undefined);
    await app?.close();
  }, 60_000);

  async function bootTestApp(options: { runMigrations?: boolean } = {}) {
    const { AppModule } = requireModule(
      '../src/app.module',
    ) as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    dataSource = moduleRef.get(DataSource);
    if (options.runMigrations) {
      await dataSource.runMigrations({ transaction: 'each' });
    }

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    mongoConnection = moduleRef.get<Connection>(getConnectionToken());
    outboxWorker = moduleRef.get(DomainOutboxWorkerService);
    userRepo = dataSource.getRepository(User);
    publicIntentRepo = dataSource.getRepository(PublicSocialIntent);
    applicationRepo = dataSource.getRepository(PublicIntentApplication);
    meetRepo = dataSource.getRepository(Meet);
    participantRepo = dataSource.getRepository(MeetParticipant);
    permissionRepo = dataSource.getRepository(ContactPermission);
    outboxRepo = dataSource.getRepository(DomainOutboxEvent);
    contactPolicy = moduleRef.get(ContactPolicyService);
    jwtService = moduleRef.get(JwtService);
    conversationModel = moduleRef.get<Model<Conversation>>(
      getModelToken(Conversation.name),
    );
    messageModel = moduleRef.get<Model<Message>>(getModelToken(Message.name));
  }

  async function restartTestApp() {
    await app?.close();
    await bootTestApp();
  }

  it('runs A/B application, accept, outbox, chat, and block through real stores', async () => {
    const owner = await registerReadyUser('owner');
    const applicant = await registerReadyUser('applicant');
    const publicIntentId = publicIntentIdFor('happy-path');
    await createPublicIntent(owner.id, publicIntentId);

    const createApplication = await request(app.getHttpServer())
      .post(`/api/public/social-intents/${publicIntentId}/applications`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .set('Idempotency-Key', `${runId}:apply`)
      .send({ message: '我周六下午可以一起打羽毛球' })
      .expect(201);

    const applicationId = createApplication.body.id as number;
    expect(createApplication.body.status).toBe('pending');
    const replayApplication = await request(app.getHttpServer())
      .post(`/api/public/social-intents/${publicIntentId}/applications`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .set('Idempotency-Key', `${runId}:apply`)
      .send({ message: '我周六下午可以一起打羽毛球' })
      .expect(201);
    expect(replayApplication.body).toEqual(createApplication.body);

    await request(app.getHttpServer())
      .post('/api/messages/start')
      .set('Authorization', `Bearer ${applicant.token}`)
      .set('Idempotency-Key', `${runId}:pending-message`)
      .send({
        targetUserId: owner.id,
        contextType: 'public_intent_application',
        contextId: String(applicationId),
        initialMessage: '报名还没通过，不能正常聊天',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/public/social-intents/${publicIntentId}/applications`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .set('Idempotency-Key', `${runId}:apply`)
      .send({ message: '我改成周日也可以' })
      .expect(409);

    const listApplications = await request(app.getHttpServer())
      .get(`/api/public/social-intents/${publicIntentId}/applications`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(listApplications.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: applicationId,
          status: 'pending',
          applicantUserId: applicant.id,
        }),
      ]),
    );

    const accept = await request(app.getHttpServer())
      .post(`/api/public-intent-applications/${applicationId}/accept`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', `${runId}:accept`)
      .send({})
      .expect(201);

    expect(accept.body).toEqual(
      expect.objectContaining({
        applicationId,
        status: 'accepted',
        conversation: expect.objectContaining({ status: 'provisioning' }),
      }),
    );
    const meetId = accept.body.meetId as number;

    const replayAccept = await request(app.getHttpServer())
      .post(`/api/public-intent-applications/${applicationId}/accept`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', `${runId}:accept`)
      .send({})
      .expect(201);
    expect(replayAccept.body).toEqual(accept.body);

    await outboxRepo.update(
      {
        aggregateType: 'public_intent_application',
        aggregateId: String(applicationId),
      },
      {
        status: 'processing',
        leaseOwner: 'crashed-worker',
        leaseExpiresAt: new Date(Date.now() - 1_000),
      },
    );
    const firstDrain = await outboxWorker.processPending(1);
    const secondDrain = await outboxWorker.processPending(1);
    const outboxAfterDrain = await outboxRepo.find({
      where: {
        aggregateType: 'public_intent_application',
        aggregateId: String(applicationId),
      },
    });
    expect({ firstDrain, secondDrain, outboxAfterDrain }).toEqual({
      firstDrain: { processed: 1 },
      secondDrain: { processed: 0 },
      outboxAfterDrain: [
        expect.objectContaining({
          status: 'completed',
          lastError: '',
        }),
      ],
    });

    const relationshipAfterAccept = await request(app.getHttpServer())
      .get(`/api/relationships/users/${owner.id}`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .expect(200);
    expect(relationshipAfterAccept.body.messagePermission).toBe('open');
    expect(relationshipAfterAccept.body.conversationId).toEqual(
      expect.any(String),
    );
    const conversationId = relationshipAfterAccept.body
      .conversationId as string;

    await request(app.getHttpServer())
      .post(`/api/messages/conversations/${conversationId}/send`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({ text: '太好了，我们到时候见。' })
      .expect(201);

    await assertPostgresAcceptedState(
      applicationId,
      meetId,
      conversationId,
      publicIntentId,
    );
    await assertMongoConversationState(conversationId, publicIntentId, 2);

    await request(app.getHttpServer())
      .post(`/api/safety/blocks/${applicant.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/messages/conversations/${conversationId}/send`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .send({ text: '拉黑后不能继续发消息。' })
      .expect(403);

    const relationshipAfterBlock = await request(app.getHttpServer())
      .get(`/api/relationships/users/${owner.id}`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .expect(200);
    expect(relationshipAfterBlock.body).toEqual(
      expect.objectContaining({
        messagePermission: 'closed',
        blocked: true,
      }),
    );
  }, 120_000);

  it('allows only one accepted application when two users race for the last slot', async () => {
    const owner = await registerReadyUser('race-owner');
    const applicantA = await registerReadyUser('race-applicant-a');
    const applicantB = await registerReadyUser('race-applicant-b');
    const intentId = publicIntentIdFor('race');
    await createPublicIntent(owner.id, intentId, { capacityMax: 1 });

    const applicationA = await createApplication(
      applicantA,
      intentId,
      `${runId}:race-apply-a`,
    );
    const applicationB = await createApplication(
      applicantB,
      intentId,
      `${runId}:race-apply-b`,
    );

    const [acceptA, acceptB] = await Promise.all([
      postAccept(owner, applicationA.id, `${runId}:race-accept-a`),
      postAccept(owner, applicationB.id, `${runId}:race-accept-b`),
    ]);

    const statuses = [acceptA.status, acceptB.status].sort();
    expect(statuses).toEqual([201, 409]);
    const acceptedApplications = await applicationRepo.find({
      where: { publicIntentId: intentId, status: 'accepted' },
    });
    expect(acceptedApplications).toHaveLength(1);
    const intent = await publicIntentRepo.findOneByOrFail({ id: intentId });
    expect(intent.acceptedCount).toBe(1);
    expect(intent.status).toBe(SocialRequestStatus.Closed);
    await outboxRepo.delete({
      aggregateType: 'public_intent_application',
      aggregateId: String(acceptedApplications[0].id),
    });
  }, 120_000);

  it('allows applications while public intents are searching or matched', async () => {
    const owner = await registerReadyUser('applicable-owner');
    const applicant = await registerReadyUser('applicable-applicant');

    for (const status of [
      SocialRequestStatus.Searching,
      SocialRequestStatus.Matched,
    ]) {
      const publicIntentId = publicIntentIdFor(`applicable-${status}`);
      await createPublicIntent(owner.id, publicIntentId, { status });

      const response = await request(app.getHttpServer())
        .post(`/api/public/social-intents/${publicIntentId}/applications`)
        .set('Authorization', `Bearer ${applicant.token}`)
        .set('Idempotency-Key', `${runId}:apply-${status}`)
        .send({ message: `我可以参加 ${status} 状态的约练` })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          publicIntentId,
          applicantUserId: applicant.id,
          status: 'pending',
        }),
      );
    }
  }, 120_000);

  it('rejects applications while public intents are not accepting applications', async () => {
    const owner = await registerReadyUser('not-applicable-owner');
    const applicant = await registerReadyUser('not-applicable-applicant');

    for (const status of [
      SocialRequestStatus.Closed,
      SocialRequestStatus.Inactive,
      SocialRequestStatus.Cancelled,
    ]) {
      const publicIntentId = publicIntentIdFor(`not-applicable-${status}`);
      await createPublicIntent(owner.id, publicIntentId, { status });

      await request(app.getHttpServer())
        .post(`/api/public/social-intents/${publicIntentId}/applications`)
        .set('Authorization', `Bearer ${applicant.token}`)
        .set('Idempotency-Key', `${runId}:reject-${status}`)
        .send({ message: `我尝试报名 ${status} 状态的约练` })
        .expect(409);
    }
  }, 120_000);

  it('keeps accepted application durable when Mongo is temporarily unavailable and provisions once after recovery', async () => {
    const owner = await registerReadyUser('mongo-owner');
    const applicant = await registerReadyUser('mongo-applicant');
    const intentId = publicIntentIdFor('mongo-recovery');
    await createPublicIntent(owner.id, intentId);
    const application = await createApplication(
      applicant,
      intentId,
      `${runId}:mongo-apply`,
    );

    const accept = await request(app.getHttpServer())
      .post(`/api/public-intent-applications/${application.id}/accept`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', `${runId}:mongo-accept`)
      .send({})
      .expect(201);
    expect(accept.body.conversation.status).toBe('provisioning');

    let failedOutbox!: DomainOutboxEvent;
    try {
      await mongoConnection.close(true);
      const failedDrain = await outboxWorker.processPending(1);
      expect(failedDrain).toEqual({ processed: 1 });
      failedOutbox = await outboxRepo.findOneByOrFail({
        aggregateType: 'public_intent_application',
        aggregateId: String(application.id),
      });
      expect(failedOutbox.status).toBe('failed');
      expect(failedOutbox.attemptCount).toBe(1);
    } finally {
      await restartTestApp();
    }
    await outboxRepo.update(
      { id: failedOutbox.id },
      { availableAt: new Date(), lastError: '' },
    );
    await outboxWorker.processPending(1);
    await outboxWorker.processPending(1);

    const relationship = await request(app.getHttpServer())
      .get(`/api/relationships/users/${owner.id}`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .expect(200);
    expect(relationship.body).toEqual(
      expect.objectContaining({
        messagePermission: 'open',
        conversationId: expect.any(String),
      }),
    );
    await assertMongoConversationState(
      relationship.body.conversationId as string,
      intentId,
      1,
    );
  }, 120_000);

  it('allows one opener and opens permission after the recipient replies', async () => {
    const sender = await registerReadyUser('opener-sender');
    const recipient = await registerReadyUser('opener-recipient');
    const context = {
      contextType: 'agent_candidate' as const,
      contextId: `${runId}:candidate:1`,
    };
    await contactPolicy.grantOpener(
      sender.id,
      recipient.id,
      context,
      undefined,
    );

    const start = await request(app.getHttpServer())
      .post('/api/messages/start')
      .set('Authorization', `Bearer ${sender.token}`)
      .set('Idempotency-Key', `${runId}:opener-start`)
      .send({
        targetUserId: recipient.id,
        contextType: context.contextType,
        contextId: context.contextId,
        initialMessage: '你好，我也想周末一起打球。',
      })
      .expect(201);
    const conversationId = start.body.conversationId as string;
    let relationship = await request(app.getHttpServer())
      .get(`/api/relationships/users/${recipient.id}`)
      .set('Authorization', `Bearer ${sender.token}`)
      .expect(200);
    expect(relationship.body.messagePermission).toBe('awaiting_reply');

    await request(app.getHttpServer())
      .post(`/api/messages/conversations/${conversationId}/send`)
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ text: '第二条 opener 不应该发出去。' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/messages/conversations/${conversationId}/send`)
      .set('Authorization', `Bearer ${recipient.token}`)
      .send({ text: '可以，我们聊一下时间。' })
      .expect(201);

    relationship = await request(app.getHttpServer())
      .get(`/api/relationships/users/${recipient.id}`)
      .set('Authorization', `Bearer ${sender.token}`)
      .expect(200);
    expect(relationship.body.messagePermission).toBe('open');

    await request(app.getHttpServer())
      .post(`/api/messages/conversations/${conversationId}/send`)
      .set('Authorization', `Bearer ${sender.token}`)
      .send({ text: '好的，那我们约周六下午。' })
      .expect(201);
  }, 120_000);

  async function registerReadyUser(label: string): Promise<TestUser> {
    const email = `${runId}.${label}@example.test`;
    const user = await userRepo.save(
      userRepo.create({
        email,
        password,
        name: `Loop ${label}`,
        avatar: 'L',
        color: '#C8FF00',
      }),
    );
    const userId = user.id;
    await makeOnboardingReady(user.id, label);
    return {
      id: userId,
      token: jwtService.sign({ sub: userId, email }),
      email,
    };
  }

  async function makeOnboardingReady(userId: number, label: string) {
    const now = new Date();
    await userRepo.update(userId, {
      name: `Loop ${label}`,
      dateOfBirth: '1996-06-01',
      age: 30,
      city: '青岛',
      interestTags: ['羽毛球', 'Citywalk', '咖啡'],
      onboardingCompletedAt: now,
      onboardingVersion: 1,
    });
    await dataSource.getRepository(UserSocialProfile).save({
      userId,
      profileVersion: 1,
      nickname: `Loop ${label}`,
      primaryPurpose: '找运动搭子',
      defaultMatchRadiusKm: 5,
      city: '青岛',
      interestTags: ['羽毛球', 'Citywalk', '咖啡'],
      relationshipGoals: ['找运动搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: true,
    });
    await dataSource
      .getRepository(UserConsent)
      .save([
        consent(userId, 'terms', '2026-01'),
        consent(userId, 'privacy', '2026-01'),
        consent(userId, 'adult_attestation', '2026-01'),
      ]);
    const mediaRepo = dataSource.getRepository(MediaAsset);
    const assets = await mediaRepo.save([
      mediaRepo.create({
        ownerUserId: userId,
        purpose: 'profile_photo',
        storageKey: `${runId}/${label}/cover.webp`,
        url: `https://cdn.example.test/${runId}/${label}/cover.webp`,
        mimeType: 'image/webp',
        width: 1200,
        height: 1600,
        sha256: `${runId}-${label}-cover`,
        moderationStatus: 'approved',
      }),
      mediaRepo.create({
        ownerUserId: userId,
        purpose: 'profile_photo',
        storageKey: `${runId}/${label}/second.webp`,
        url: `https://cdn.example.test/${runId}/${label}/second.webp`,
        mimeType: 'image/webp',
        width: 1200,
        height: 1600,
        sha256: `${runId}-${label}-second`,
        moderationStatus: 'approved',
      }),
    ]);
    const photoRepo = dataSource.getRepository(UserProfilePhoto);
    await photoRepo.save([
      photoRepo.create({
        userId,
        assetId: assets[0].id,
        sortOrder: 0,
        isCover: true,
        status: 'approved',
      }),
      photoRepo.create({
        userId,
        assetId: assets[1].id,
        sortOrder: 1,
        isCover: false,
        status: 'approved',
      }),
    ]);
  }

  function consent(
    userId: number,
    consentType: UserConsent['consentType'],
    version: string,
  ) {
    return dataSource.getRepository(UserConsent).create({
      userId,
      consentType,
      version,
      acceptedAt: new Date(),
      revokedAt: null,
    });
  }

  function publicIntentIdFor(suffix: string) {
    return `fitmeet-loop-${runId}-${suffix}`;
  }

  async function createApplication(
    applicant: TestUser,
    intentId: string,
    idempotencyKey: string,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/api/public/social-intents/${intentId}/applications`)
      .set('Authorization', `Bearer ${applicant.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ message: '我可以参加这个约练' })
      .expect(201);
    return response.body as { id: number; status: string };
  }

  async function postAccept(
    owner: TestUser,
    applicationId: number,
    idempotencyKey: string,
  ) {
    return request(app.getHttpServer())
      .post(`/api/public-intent-applications/${applicationId}/accept`)
      .set('Authorization', `Bearer ${owner.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});
  }

  async function createPublicIntent(
    ownerUserId: number,
    intentId: string,
    options: { capacityMax?: number; status?: SocialRequestStatus } = {},
  ) {
    await publicIntentRepo.save(
      publicIntentRepo.create({
        id: intentId,
        userId: ownerUserId,
        linkedSocialRequestId: null,
        source: 'integration_test',
        mode: 'public',
        requestType: 'badminton',
        title: '周六下午羽毛球约练',
        description: '找一个水平相近的羽毛球搭子',
        interestTags: ['羽毛球', '运动搭子'],
        city: '青岛',
        loc: '市南区',
        lat: null,
        lng: null,
        radiusKm: 5,
        timePreference: '周六下午',
        locationPreference: '市南区附近球馆',
        socialGoal: '一起打一小时羽毛球',
        riskLevel: SocialRequestRiskLevel.Low,
        requiresUserConfirmation: true,
        filters: {},
        candidateUserIds: [],
        matchedCount: 0,
        capacityMin: 1,
        capacityMax: options.capacityMax ?? 1,
        acceptedCount: 0,
        applicationPolicy: 'approval_required',
        linkedMeetId: null,
        closesAt: new Date(Date.now() + 60 * 60 * 1000),
        status: options.status ?? SocialRequestStatus.Active,
        metadata: { integrationTestId: runId },
      }),
    );
  }

  async function assertPostgresAcceptedState(
    applicationId: number,
    meetId: number,
    conversationId: string,
    intentId: string,
  ) {
    const [application, intent, meet, participants, permission, outboxEvents] =
      await Promise.all([
        applicationRepo.findOneByOrFail({ id: applicationId }),
        publicIntentRepo.findOneByOrFail({ id: intentId }),
        meetRepo.findOneByOrFail({ id: meetId }),
        participantRepo.find({ where: { meetId }, order: { userId: 'ASC' } }),
        permissionRepo.findOneByOrFail({ conversationId }),
        outboxRepo.find({
          where: {
            aggregateType: 'public_intent_application',
            aggregateId: String(applicationId),
          },
        }),
      ]);

    expect(application.status).toBe('accepted');
    expect(application.meetId).toBe(meetId);
    expect(intent.acceptedCount).toBe(1);
    expect(intent.linkedMeetId).toBe(meetId);
    expect(intent.status).toBe(SocialRequestStatus.Closed);
    expect(meet.maxSlots).toBe(1);
    expect(participants).toHaveLength(2);
    expect(participants.every((row) => row.status === 'active')).toBe(true);
    expect(permission.status).toBe('open');
    expect(permission.conversationId).toEqual(expect.any(String));
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]).toEqual(
      expect.objectContaining({
        status: 'completed',
        attemptCount: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    );
  }

  async function assertMongoConversationState(
    conversationId: string,
    intentId: string,
    expectedMessageCount: number,
  ) {
    const conversations = await conversationModel
      .find({ relatedPublicIntentId: intentId })
      .lean()
      .exec();
    expect(conversations).toHaveLength(1);
    expect(String(conversations[0]._id)).toBe(conversationId);
    expect(conversations[0].status).toBe('open');
    const messages = await messageModel
      .find({ conversationId: conversations[0]._id })
      .lean()
      .exec();
    expect(messages).toHaveLength(expectedMessageCount);
    expect(
      messages.filter((message) => message.metadata?.outboxDedupeKey != null),
    ).toHaveLength(1);
  }

  async function cleanupPostgres() {
    const users = await dataSource.query(
      'SELECT "id" FROM "users" WHERE "email" LIKE $1',
      [`${runId}.%@example.test`],
    );
    const userIds = users.map((row: { id: number }) => Number(row.id));
    await dataSource.query(
      'DELETE FROM "domain_outbox_events" WHERE "payload"->>\'publicIntentId\' LIKE $1',
      ['fitmeet-loop-social-loop-%'],
    );
    await dataSource.query(
      'DELETE FROM "public_social_intents" WHERE "id" LIKE $1',
      ['fitmeet-loop-social-loop-%'],
    );
    if (userIds.length === 0) return;
    await dataSource.query(
      'DELETE FROM "api_idempotency_records" WHERE "ownerUserId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "user_blocks" WHERE "blockerId" = ANY($1::int[]) OR "blockedId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "contact_permissions" WHERE "userLowId" = ANY($1::int[]) OR "userHighId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "meet_participants" WHERE "userId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "meets" WHERE "userId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "user_profile_photos" WHERE "userId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "media_assets" WHERE "ownerUserId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "user_consents" WHERE "userId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query(
      'DELETE FROM "user_social_profiles" WHERE "userId" = ANY($1::int[])',
      [userIds],
    );
    await dataSource.query('DELETE FROM "users" WHERE "id" = ANY($1::int[])', [
      userIds,
    ]);
  }
});
