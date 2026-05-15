import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { KafkaService } from '../src/kafka/kafka.service';

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: { id: number; email: string; name: string };
}

describe('Core flows (e2e)', () => {
  let app: INestApplication<App>;
  let httpServer: App;
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const userA = {
    email: `e2e-a-${runId}@fitmeet.test`,
    password: 'Password123!',
    name: `E2E甲${runId.slice(-4)}`,
  };
  const userB = {
    email: `e2e-b-${runId}@fitmeet.test`,
    password: 'Password123!',
    name: `E2E乙${runId.slice(-4)}`,
  };
  let authA: AuthResponse;
  let authB: AuthResponse;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = process.env.DB_HOST || 'localhost';
    process.env.DB_PORT = process.env.DB_PORT || '5432';
    process.env.DB_USERNAME = process.env.DB_USERNAME || 'root';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'password123';
    process.env.DB_DATABASE = process.env.DB_DATABASE || 'fitness_app';
    process.env.MONGO_URI =
      process.env.MONGO_URI || 'mongodb://localhost:27017/fitness_app';
    process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
    process.env.REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-secret-with-more-than-32-characters';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KafkaService)
      .useValue({
        onModuleInit: jest.fn(),
        emit: jest.fn(),
      })
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    app = moduleFixture.createNestApplication();
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
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  const authHeader = (token: string) => `Bearer ${token}`;

  it('registers, logs in, reads profile, and refreshes access token', async () => {
    const registerRes = await request(httpServer)
      .post('/api/auth/register')
      .send(userA)
      .expect(201);

    authA = registerRes.body as AuthResponse;
    expect(authA.access_token).toBeTruthy();
    expect(authA.refresh_token).toBeTruthy();
    expect(authA.user.email).toBe(userA.email);

    const loginRes = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);
    const loginBody = loginRes.body as AuthResponse;
    expect(loginBody.access_token).toBeTruthy();
    expect(loginBody.refresh_token).toBeTruthy();

    const profileRes = await request(httpServer)
      .get('/api/auth/profile')
      .set('Authorization', authHeader(loginBody.access_token))
      .expect(200);
    expect(profileRes.body).toMatchObject({
      id: authA.user.id,
      email: userA.email,
      name: userA.name,
    });

    const refreshRes = await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: loginBody.refresh_token })
      .expect(200);
    expect(refreshRes.body.access_token).toBeTruthy();
    expect(refreshRes.body.refresh_token).toBeTruthy();
  });

  it('creates a post, reads the feed, and comments on the post', async () => {
    const postRes = await request(httpServer)
      .post('/api/feed')
      .set('Authorization', authHeader(authA.access_token))
      .send({
        type: 'log',
        sport: 'run',
        title: 'E2E 跑步记录',
        text: '今天完成一次真实接口发帖测试',
        tags: ['e2e', 'free'],
      })
      .expect(201);

    expect(postRes.body.id).toEqual(expect.any(Number));
    expect(postRes.body.text).toBe('今天完成一次真实接口发帖测试');

    const feedRes = await request(httpServer).get('/api/feed').expect(200);
    expect(Array.isArray(feedRes.body.data)).toBe(true);
    expect(
      feedRes.body.data.some(
        (post: { id: number }) => post.id === postRes.body.id,
      ),
    ).toBe(true);

    await request(httpServer).get('/api/feed?page=1&limit=10').expect(200);
    await request(httpServer).get('/api/feed?page=abc&limit=10').expect(400);
    await request(httpServer).get('/api/feed?page=-5&limit=500').expect(200);

    const commentRes = await request(httpServer)
      .post(`/api/feed/${postRes.body.id}/comments`)
      .set('Authorization', authHeader(authA.access_token))
      .send({ text: 'E2E 评论成功' })
      .expect(201);
    expect(commentRes.body.text).toBe('E2E 评论成功');

    const commentsRes = await request(httpServer)
      .get(`/api/feed/${postRes.body.id}/comments`)
      .expect(200);
    expect(
      commentsRes.body.some(
        (comment: { text: string }) => comment.text === 'E2E 评论成功',
      ),
    ).toBe(true);
  });

  it('creates a free meet, lets another user join, and reads meet records', async () => {
    const userBRes = await request(httpServer)
      .post('/api/auth/register')
      .send(userB)
      .expect(201);
    authB = userBRes.body as AuthResponse;

    const meetRes = await request(httpServer)
      .post('/api/meets')
      .set('Authorization', authHeader(authA.access_token))
      .send({
        title: 'E2E 免费约练',
        type: 'run',
        sport: '跑步',
        time: '2030-05-01T08:00:00+08:00',
        loc: '奥林匹克森林公园',
        dist: '3km',
        price: '免费',
        maxSlots: 4,
        level: 'all',
        desc: '真实 API 免费约练测试',
        feeType: 'free',
        groupType: 'small',
        creatorType: 'find-coach',
      })
      .expect(201);

    expect(meetRes.body.id).toEqual(expect.any(Number));
    expect(meetRes.body.feeType).toBe('free');
    expect(meetRes.body.price).toBe('免费');

    await request(httpServer)
      .post(`/api/meets/${meetRes.body.id}/join`)
      .set('Authorization', authHeader(authB.access_token))
      .expect(201);

    const meetsRes = await request(httpServer).get('/api/meets').expect(200);
    expect(
      meetsRes.body.some((meet: { id: number }) => meet.id === meetRes.body.id),
    ).toBe(true);

    const recordsRes = await request(httpServer)
      .get('/api/meets/records/me')
      .set('Authorization', authHeader(authB.access_token))
      .expect(200);
    expect(
      recordsRes.body.some(
        (record: { id: number }) => record.id === meetRes.body.id,
      ),
    ).toBe(true);
  });

  it('starts a conversation, sends a message, reads conversations/messages, and updates unread count', async () => {
    const startRes = await request(httpServer)
      .post('/api/messages/start')
      .set('Authorization', authHeader(authA.access_token))
      .send({ otherUserId: authB.user.id })
      .expect(201);
    expect(startRes.body.conversationId).toBeTruthy();

    const sendRes = await request(httpServer)
      .post(`/api/messages/conversations/${startRes.body.conversationId}/send`)
      .set('Authorization', authHeader(authA.access_token))
      .send({ text: '你好，E2E 消息测试' })
      .expect(201);
    expect(sendRes.body.text).toBe('你好，E2E 消息测试');

    const unreadBefore = await request(httpServer)
      .get('/api/messages/unread')
      .set('Authorization', authHeader(authB.access_token))
      .expect(200);
    expect(unreadBefore.body.unreadCount).toBeGreaterThanOrEqual(1);

    const conversationsRes = await request(httpServer)
      .get('/api/messages/conversations')
      .set('Authorization', authHeader(authB.access_token))
      .expect(200);
    expect(
      conversationsRes.body.some(
        (conv: { id: string }) => conv.id === startRes.body.conversationId,
      ),
    ).toBe(true);

    const messagesRes = await request(httpServer)
      .get(`/api/messages/conversations/${startRes.body.conversationId}`)
      .set('Authorization', authHeader(authB.access_token))
      .expect(200);
    expect(
      messagesRes.body.some(
        (message: { text: string; isMine: boolean }) =>
          message.text === '你好，E2E 消息测试' && !message.isMine,
      ),
    ).toBe(true);

    const unreadAfter = await request(httpServer)
      .get('/api/messages/unread')
      .set('Authorization', authHeader(authB.access_token))
      .expect(200);
    expect(unreadAfter.body.unreadCount).toBe(0);
  });
});
