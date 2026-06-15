import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  AgentUserController,
  PublicSocialIntentController,
} from './agent-gateway/agent-gateway.controller';
import { SocialAgentChatController } from './agent-gateway/social-agent-chat.controller';
import { SocialAgentReminderController } from './agent-gateway/social-agent-reminder.controller';
import { SocialAgentTasksController } from './agent-gateway/social-agent-tasks.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { CommentsController } from './comments/comments.controller';
import { MessagesController } from './messages/messages.controller';
import { PostsController } from './posts/posts.controller';
import { RedisService } from './redis/redis.service';
import { UploadsController } from './uploads/uploads.controller';
import { UsersController } from './users/users.controller';

const APP_CORE_CONTROLLERS = [
  AuthController,
  UsersController,
  PostsController,
  CommentsController,
  MessagesController,
  AgentUserController,
  PublicSocialIntentController,
  SocialAgentChatController,
  SocialAgentReminderController,
  SocialAgentTasksController,
  UploadsController,
] as const;

const LAUNCH_AUTH_REQUIRED_PATHS = {
  '/auth/register': 'post',
  '/auth/login': 'post',
  '/auth/sms/send': 'post',
  '/auth/sms/verify': 'post',
  '/auth/wechat/url': 'get',
  '/auth/wechat/login': 'post',
  '/auth/refresh': 'post',
  '/auth/profile': 'get',
} as const;

const IOS_APP_REQUIRED_PATHS = {
  '/auth/login': 'post',
  '/auth/refresh': 'post',
  '/auth/profile': 'get',
  '/users/profile': 'put',
  '/uploads/image': 'post',
  '/messages/start': 'post',
  '/messages/conversations': 'get',
  '/messages/conversations/{conversationId}': 'get',
  '/messages/conversations/{conversationId}/send': 'post',
  '/messages/unread': 'get',
  '/feed': ['get', 'post'],
  '/feed/interactions': 'get',
  '/social-agent/chat/run': 'post',
  '/social-agent/chat/run-async': 'post',
  '/social-agent/chat/session': 'get',
  '/social-agent/chat/tasks/{taskId}/session': 'get',
  '/social-agent/chat/tasks/{taskId}/runs/{runId}': 'get',
  '/social-agent/chat/messages': 'post',
  '/social-agent/chat/route-message': 'post',
  '/social-agent/chat/tasks/{taskId}/messages': 'post',
  '/social-agent/chat/tasks/{taskId}/save-candidate': 'post',
  '/social-agent/chat/tasks/{taskId}/send-message': 'post',
  '/social-agent/chat/tasks/{taskId}/connect-candidate': 'post',
} as const;

const WEB_APP_REQUIRED_PATHS = {
  '/public/social-intents': 'get',
  '/public/social-intents/{id}': 'get',
  '/public/social-intents/{id}/matches': 'get',
  '/social-agent/tasks/current': 'get',
  '/social-agent/tasks/{taskId}/timeline': 'get',
  '/social-agent/tasks/{taskId}/events': 'get',
  '/social-agent/tasks/{taskId}/replan': 'post',
  '/social-agent/reminders': 'get',
  '/social-agent/reminders/preferences': ['get', 'patch'],
  '/social-agent/reminders/run-once': 'post',
  '/social-agent/reminders/{id}/open': 'post',
  '/social-agent/reminders/{id}/dismiss': 'post',
  '/social-agent/chat/tasks/{taskId}/publish-social-request': 'post',
  '/social-agent/chat/tasks/{taskId}/replan-run': 'post',
  '/social-agent/chat/tasks/{taskId}/append-context': 'post',
  '/social-agent/chat/tasks/{taskId}/actions': 'post',
  '/social-agent/chat/tasks/{taskId}/actions/stream': 'post',
  '/social-agent/chat/checkpoints/{checkpointId}/resume/stream': 'post',
  '/social-agent/chat/checkpoints/{checkpointId}/replay/stream': 'post',
  '/social-agent/chat/checkpoints/{checkpointId}/fork/stream': 'post',
  '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/retry/stream':
    'post',
  '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/replay/stream':
    'post',
  '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/fork/stream':
    'post',
  '/agents/inbox/conversations': 'get',
  '/agents/inbox/conversations/{conversationId}/messages': 'get',
  '/agents/inbox/events': 'get',
  '/agents/inbox/events/ack': 'post',
  '/agents/inbox/conversations/{conversationId}/reply': 'post',
  '/agents/profile-matches': 'get',
  '/agents/profile-matches/{id}/ignore': 'post',
  '/agents/profile-matches/{id}/favorite': 'post',
  '/agents/profile-matches/{id}/draft-opener': 'post',
  '/agents/profile-matches/{id}/confirm-contact': 'post',
  '/agents/profile-matches/{id}/request-contact-exchange': 'post',
  '/agents/profile-matches/{id}/send-intro': 'post',
} as const;

const CHECKPOINT_STREAM_OPERATION_IDS = {
  '/social-agent/chat/checkpoints/{checkpointId}/resume/stream':
    'socialAgentResumeCheckpointStream',
  '/social-agent/chat/checkpoints/{checkpointId}/replay/stream':
    'socialAgentReplayCheckpointStream',
  '/social-agent/chat/checkpoints/{checkpointId}/fork/stream':
    'socialAgentForkCheckpointStream',
  '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/retry/stream':
    'socialAgentRetryCheckpointStepStream',
  '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/replay/stream':
    'socialAgentReplayCheckpointStepStream',
  '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/fork/stream':
    'socialAgentForkCheckpointStepStream',
} as const;

const IOS_CORE_ENDPOINT_REGISTRY_PATH = resolve(
  __dirname,
  '../../../../Documents/FitMeet app/FitMeetAlpha/Networking/FitMeetCoreEndpoint.swift',
);

type RouteMethod = Lowercase<keyof typeof RequestMethod>;
type ControllerType = (typeof APP_CORE_CONTROLLERS)[number];

type ControllerRoute = {
  method: string;
  path: string;
};

describe('AppController', () => {
  let appController: AppController;
  const dataSource = { query: jest.fn() };
  const mongoConnection = { db: { admin: jest.fn() }, readyState: 1 };
  const mongoAdmin = { ping: jest.fn() };
  const redisClient = { ping: jest.fn() };
  const redisService = { getClient: jest.fn(() => redisClient) };

  beforeEach(async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mongoConnection.readyState = 1;
    mongoConnection.db.admin.mockReturnValue(mongoAdmin);
    mongoAdmin.ping.mockResolvedValue({ ok: 1 });
    redisClient.ping.mockResolvedValue('PONG');
    redisService.getClient.mockReturnValue(redisClient);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DataSource, useValue: dataSource },
        { provide: getConnectionToken(), useValue: mongoConnection },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return a healthy status payload', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        release: {
          commit: expect.any(String),
          source: expect.any(String),
          builtAt: null,
        },
      });
    });

    it('should return readiness when storage dependencies respond', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ok',
        uptime: expect.any(Number),
        timestamp: expect.any(String),
        release: {
          commit: expect.any(String),
          source: expect.any(String),
          builtAt: null,
        },
        checks: {
          postgres: { status: 'ok', latencyMs: expect.any(Number) },
          mongo: { status: 'ok', latencyMs: expect.any(Number) },
          redis: { status: 'ok', latencyMs: expect.any(Number) },
        },
      });
      expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
      expect(mongoAdmin.ping).toHaveBeenCalled();
      expect(redisClient.ping).toHaveBeenCalled();
    });

    it('should fail readiness without exposing dependency error details', async () => {
      dataSource.query.mockRejectedValueOnce(new Error('password leaked'));

      await expect(appController.getReadiness()).rejects.toMatchObject({
        response: {
          code: 'SERVICE_NOT_READY',
          message: 'Service dependencies are not ready',
          details: {
            postgres: { status: 'error', latencyMs: expect.any(Number) },
            mongo: { status: 'ok', latencyMs: expect.any(Number) },
            redis: { status: 'ok', latencyMs: expect.any(Number) },
          },
        },
        status: 503,
      });
    });
  });

  describe('FitMeet core OpenAPI', () => {
    it('covers auth, users, feed, messages, Social Agent chat, and uploads', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(contract.openapi).toBe('3.1.0');
      expect(Object.keys(contract.paths)).toEqual(
        expect.arrayContaining([
          '/health',
          '/ready',
          '/auth/login',
          '/auth/refresh',
          '/auth/profile',
          '/users/profile',
          '/feed',
          '/public/social-intents',
          '/public/social-intents/{id}',
          '/public/social-intents/{id}/matches',
          '/feed/{postId}/comments',
          '/feed/comments/{commentId}/like',
          '/messages/start',
          '/messages/conversations',
          '/messages/conversations/{conversationId}',
          '/messages/conversations/{conversationId}/send',
          '/messages/public-intents/{id}/start',
          '/messages/unread',
          '/agents/inbox/conversations',
          '/agents/inbox/conversations/{conversationId}/messages',
          '/agents/inbox/events',
          '/agents/inbox/events/ack',
          '/agents/inbox/conversations/{conversationId}/reply',
          '/agents/profile-matches',
          '/agents/profile-matches/{id}/ignore',
          '/agents/profile-matches/{id}/favorite',
          '/agents/profile-matches/{id}/draft-opener',
          '/agents/profile-matches/{id}/confirm-contact',
          '/agents/profile-matches/{id}/request-contact-exchange',
          '/agents/profile-matches/{id}/send-intro',
          '/social-agent/chat/run',
          '/social-agent/chat/run-async',
          '/social-agent/chat/session',
          '/social-agent/chat/messages',
          '/social-agent/chat/stream',
          '/social-agent/chat/stream-user',
          '/social-agent/chat/tasks/{taskId}/session',
          '/social-agent/chat/tasks/{taskId}/runs/{runId}',
          '/social-agent/chat/tasks/{taskId}/messages',
          '/social-agent/chat/tasks/{taskId}/publish-social-request',
          '/social-agent/chat/tasks/{taskId}/replan-run',
          '/social-agent/chat/tasks/{taskId}/append-context',
          '/social-agent/chat/tasks/{taskId}/actions',
          '/social-agent/chat/tasks/{taskId}/actions/stream',
          '/social-agent/chat/tasks/{taskId}/save-candidate',
          '/social-agent/chat/tasks/{taskId}/send-message',
          '/social-agent/chat/tasks/{taskId}/connect-candidate',
          '/social-agent/chat/checkpoints/{checkpointId}/resume/stream',
          '/social-agent/chat/checkpoints/{checkpointId}/replay/stream',
          '/social-agent/chat/checkpoints/{checkpointId}/fork/stream',
          '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/retry/stream',
          '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/replay/stream',
          '/social-agent/chat/checkpoints/{checkpointId}/steps/{stepId}/fork/stream',
          '/social-agent/tasks/current',
          '/social-agent/tasks/{taskId}/timeline',
          '/social-agent/tasks/{taskId}/events',
          '/social-agent/tasks/{taskId}/replan',
          '/uploads/image',
          '/uploads/video',
        ]),
      );
    });

    it('keeps the iOS app API contract explicit', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      for (const [path, methodOrMethods] of Object.entries(
        IOS_APP_REQUIRED_PATHS,
      )) {
        const methods = Array.isArray(methodOrMethods)
          ? methodOrMethods
          : [methodOrMethods];
        expect(contract.paths[path]).toBeDefined();
        for (const method of methods) {
          expect(contract.paths[path][method]).toBeDefined();
        }
      }
    });

    it('maps the launch auth OpenAPI contract to registered controllers', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const controllerRoutes = collectControllerRoutes(APP_CORE_CONTROLLERS);

      for (const [path, method] of Object.entries(LAUNCH_AUTH_REQUIRED_PATHS)) {
        expect(contract.paths[path][method]).toBeDefined();
        expect(controllerRoutes).toContainEqual({
          method,
          path: normalizePathParams(path),
        });
      }
    });

    it('documents the shared Error response shape for all non-health core operations', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      for (const [path, pathItem] of Object.entries(contract.paths)) {
        for (const operation of Object.values(pathItem)) {
          if (path === '/health') continue;
          const responses = operation.responses ?? {};
          const errorResponses = Object.entries(responses).filter(
            ([status]) => !status.startsWith('2'),
          );

          expect(errorResponses.length).toBeGreaterThan(0);
          for (const [, response] of errorResponses) {
            expect(response).toEqual({ $ref: '#/components/responses/Error' });
          }
        }
      }
    });

    it('documents stable 400 errors for message conversation validation failures', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(
        contract.paths['/messages/conversations/{conversationId}'].get
          .responses['400'],
      ).toEqual({ $ref: '#/components/responses/Error' });
      expect(
        contract.paths['/messages/conversations/{conversationId}/send'].post
          .responses['400'],
      ).toEqual({ $ref: '#/components/responses/Error' });
    });

    it('maps the iOS app OpenAPI contract to registered controllers', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const controllerRoutes = collectControllerRoutes(APP_CORE_CONTROLLERS);

      for (const [path, methodOrMethods] of Object.entries(
        IOS_APP_REQUIRED_PATHS,
      )) {
        const methods = Array.isArray(methodOrMethods)
          ? methodOrMethods
          : [methodOrMethods];

        for (const method of methods) {
          const openApiOperation = contract.paths[path][method];
          expect(openApiOperation).toBeDefined();
          expect(controllerRoutes).toContainEqual({
            method,
            path: normalizePathParams(path),
          });
        }
      }
    });

    it('maps the Web Social Agent workspace contract to registered controllers', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const controllerRoutes = collectControllerRoutes(APP_CORE_CONTROLLERS);

      for (const [path, methodOrMethods] of Object.entries(
        WEB_APP_REQUIRED_PATHS,
      )) {
        const methods = Array.isArray(methodOrMethods)
          ? methodOrMethods
          : [methodOrMethods];

        for (const method of methods) {
          const openApiOperation = contract.paths[path][method];
          expect(openApiOperation).toBeDefined();
          expect(controllerRoutes).toContainEqual({
            method,
            path: normalizePathParams(path),
          });
        }
      }
    });

    it('documents checkpoint recovery endpoints as authenticated SSE operations', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      for (const [path, operationId] of Object.entries(
        CHECKPOINT_STREAM_OPERATION_IDS,
      )) {
        const operation = contract.paths[path].post;
        expect(operation.operationId).toBe(operationId);
        expect(operation.tags).toContain('social-agent-chat');
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
        expect(operation.responses['200'].content).toHaveProperty(
          'text/event-stream',
        );
        expect(operation.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'checkpointId',
              in: 'path',
              required: true,
            }),
          ]),
        );

        if (path.includes('/steps/{stepId}/')) {
          expect(operation.parameters).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: 'stepId',
                in: 'path',
                required: true,
              }),
            ]),
          );
        }
      }
    });

    it('keeps the frontend typed endpoint registry aligned with OpenAPI paths', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const openApiPaths = new Set(
        Object.keys(contract.paths).map(normalizePathParams),
      );
      const frontendContract = readFileSync(
        resolve(__dirname, '../../frontend/src/api/fitmeetCoreContract.ts'),
        'utf8',
      );

      for (const endpoint of collectEndpointLiterals(frontendContract)) {
        expect(openApiPaths).toContain(normalizeEndpointPath(endpoint));
      }
    });

    it('keeps the iOS Swift endpoint registry aligned with OpenAPI paths', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const openApiPaths = new Set(
        Object.keys(contract.paths).map(normalizePathParams),
      );
      const iosContract = readFileSync(IOS_CORE_ENDPOINT_REGISTRY_PATH, 'utf8');
      const iosEndpoints = collectSwiftEndpointTemplates(iosContract);

      expect(iosEndpoints).toEqual(
        expect.arrayContaining([
          '/auth/login',
          '/auth/refresh',
          '/auth/profile',
          '/users/profile',
          '/uploads/image',
          '/messages/start',
          '/messages/conversations',
          '/messages/conversations/:param',
          '/messages/conversations/:param/send',
          '/messages/unread',
          '/feed',
          '/social-agent/chat/messages',
          '/social-agent/chat/session',
          '/social-agent/chat/tasks/:param/session',
          '/social-agent/chat/tasks/:param/messages',
          '/social-agent/chat/tasks/:param/save-candidate',
          '/social-agent/chat/tasks/:param/send-message',
          '/social-agent/chat/tasks/:param/connect-candidate',
        ]),
      );

      for (const endpoint of iosEndpoints) {
        expect(openApiPaths).toContain(normalizeEndpointPath(endpoint));
      }
    });

    it('documents the iOS avatar upload and profile update contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(
        contract.paths['/uploads/image'].post.requestBody.content[
          'multipart/form-data'
        ].schema,
      ).toEqual({ $ref: '#/components/schemas/FileUploadInput' });
      expect(contract.components.schemas.FileUploadInput).toMatchObject({
        required: ['file'],
        properties: { file: { type: 'string', format: 'binary' } },
      });
      expect(contract.components.schemas.ImageUploadResult).toMatchObject({
        required: ['url', 'width', 'height'],
      });
      expect(
        contract.paths['/users/profile'].put.requestBody.content[
          'application/json'
        ].schema,
      ).toEqual({ $ref: '#/components/schemas/UpdateProfileInput' });
      expect(
        contract.components.schemas.UpdateProfileInput.properties,
      ).toMatchObject({
        avatar: { type: 'string', format: 'uri' },
      });
      expect(
        contract.paths['/users/profile'].put.responses['200'],
      ).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserProfile' },
          },
        },
      });
    });

    it('documents conversation history separately from sent message payloads', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const historySchema =
        contract.paths['/messages/conversations/{conversationId}'].get
          .responses['200'].content['application/json'].schema;
      const summarySchema = contract.components.schemas.ConversationSummary;
      const conversationsSchema =
        contract.paths['/messages/conversations'].get.responses['200'].content[
          'application/json'
        ].schema;
      const unreadSchema =
        contract.paths['/messages/unread'].get.responses['200'].content[
          'application/json'
        ].schema;

      expect(conversationsSchema).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/ConversationSummary' },
      });
      expect(historySchema).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/ConversationHistoryMessage' },
      });
      expect(summarySchema.required).toEqual(['id', 'conversationId']);
      expect(
        contract.components.schemas.ConversationHistoryMessage.required,
      ).toEqual(['id', 'text', 'isMine']);
      expect(
        contract.components.schemas.ConversationMessage.required,
      ).toContain('conversationId');
      expect(unreadSchema).toEqual({
        $ref: '#/components/schemas/UnreadCount',
      });
      expect(contract.components.schemas.UnreadCount.required).toEqual([
        'unreadCount',
      ]);
    });

    it('documents the Web public intent conversation start contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const controllerRoutes = collectControllerRoutes(APP_CORE_CONTROLLERS);
      const publicIntentStart =
        contract.paths['/messages/public-intents/{id}/start'].post;

      expect(publicIntentStart.parameters).toEqual([
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ]);
      expect(
        publicIntentStart.requestBody.content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/StartPublicIntentConversationInput',
      });
      expect(
        contract.components.schemas.StartPublicIntentConversationInput,
      ).toEqual({
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string', minLength: 1 } },
      });
      expect(
        publicIntentStart.responses['201'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/PublicIntentConversationStartResult',
      });
      expect(
        contract.components.schemas.PublicIntentConversationStartResult,
      ).toMatchObject({
        allOf: [
          { $ref: '#/components/schemas/ConversationStartResult' },
          {
            type: 'object',
            required: ['publicIntentId', 'agentConnectionId', 'message'],
          },
        ],
      });
      expect(controllerRoutes).toContainEqual({
        method: 'post',
        path: normalizePathParams('/messages/public-intents/{id}/start'),
      });
    });

    it('documents the Web Agent inbox conversation contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const conversations = contract.paths['/agents/inbox/conversations'].get;
      const messages =
        contract.paths['/agents/inbox/conversations/{conversationId}/messages']
          .get;
      const reply =
        contract.paths['/agents/inbox/conversations/{conversationId}/reply']
          .post;
      const events = contract.paths['/agents/inbox/events'].get;
      const ack = contract.paths['/agents/inbox/events/ack'].post;

      expect(conversations.security).toEqual([{ bearerAuth: [] }]);
      expect(conversations.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'agentProfileId', in: 'query' }),
          expect.objectContaining({ name: 'limit', in: 'query' }),
          expect.objectContaining({ name: 'unreadOnly', in: 'query' }),
        ]),
      );
      expect(
        conversations.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/AgentInboxConversationsResult',
      });
      expect(messages.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'conversationId', in: 'path' }),
          expect.objectContaining({ name: 'agentProfileId', in: 'query' }),
          expect.objectContaining({ name: 'limit', in: 'query' }),
        ]),
      );
      expect(
        messages.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/AgentInboxMessagesResult',
      });
      expect(reply.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/AgentInboxReplyInput',
      });
      expect(reply.responses['200'].content['application/json'].schema).toEqual(
        {
          $ref: '#/components/schemas/AgentInboxReplyResult',
        },
      );
      expect(events.security).toEqual([{ bearerAuth: [] }]);
      expect(events.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'agentProfileId', in: 'query' }),
          expect.objectContaining({ name: 'limit', in: 'query' }),
          expect.objectContaining({ name: 'unreadOnly', in: 'query' }),
        ]),
      );
      expect(
        events.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/AgentInboxEventsResult',
      });
      expect(ack.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/AgentInboxAckInput',
      });
      expect(ack.responses['200'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/AgentInboxAckResult',
      });
      expect(contract.components.schemas.AgentInboxReplyInput).toMatchObject({
        required: ['content'],
        properties: {
          agentProfileId: { type: 'integer', minimum: 1 },
          content: { type: 'string', minLength: 1 },
        },
      });
      expect(
        contract.components.schemas.AgentInboxConversationsResult,
      ).toMatchObject({
        required: ['agentProfileId', 'agentName', 'conversations'],
      });
      expect(
        contract.components.schemas.AgentInboxMessagesResult,
      ).toMatchObject({
        required: ['agentProfileId', 'agentName', 'conversationId', 'messages'],
      });
      expect(contract.components.schemas.AgentInboxEventsResult).toMatchObject({
        required: ['events'],
        properties: {
          events: {
            type: 'array',
            items: { $ref: '#/components/schemas/AgentInboxEvent' },
          },
        },
      });
      expect(contract.components.schemas.AgentInboxAckInput).toMatchObject({
        required: ['eventIds'],
        properties: {
          eventIds: {
            type: 'array',
            maxItems: 100,
            items: { type: 'string', minLength: 1 },
          },
        },
      });
    });

    it('documents the Web Agent profile-match recommendation contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const list = contract.paths['/agents/profile-matches'].get;
      const ignore = contract.paths['/agents/profile-matches/{id}/ignore'].post;
      const favorite =
        contract.paths['/agents/profile-matches/{id}/favorite'].post;
      const draft =
        contract.paths['/agents/profile-matches/{id}/draft-opener'].post;
      const confirm =
        contract.paths['/agents/profile-matches/{id}/confirm-contact'].post;
      const exchange =
        contract.paths['/agents/profile-matches/{id}/request-contact-exchange']
          .post;
      const sendIntro =
        contract.paths['/agents/profile-matches/{id}/send-intro'].post;

      expect(list.security).toEqual([{ bearerAuth: [] }]);
      expect(list.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'limit', in: 'query' }),
        ]),
      );
      expect(list.responses['200'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProfileMatchRecommendationsResult',
      });
      for (const operation of [
        ignore,
        favorite,
        draft,
        confirm,
        exchange,
        sendIntro,
      ]) {
        expect(operation.security).toEqual([{ bearerAuth: [] }]);
        expect(operation.parameters).toEqual(
          expect.arrayContaining([
            { $ref: '#/components/parameters/ProfileMatchId' },
          ]),
        );
      }
      expect(draft.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProfileMatchDraftOpenerInput',
      });
      expect(draft.responses['200'].content['application/json'].schema).toEqual(
        {
          $ref: '#/components/schemas/ProfileMatchDraftOpenerResult',
        },
      );
      expect(confirm.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProfileMatchOwnerConfirmationInput',
      });
      expect(exchange.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProfileMatchOwnerConfirmationInput',
      });
      expect(sendIntro.requestBody.content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ProfileMatchSendIntroInput',
      });
      expect(
        sendIntro.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/ProfileMatchSendIntroResult',
      });
      expect(
        contract.components.schemas.ProfileMatchRecommendationsResult,
      ).toMatchObject({
        required: ['recommendations'],
      });
    });

    it('documents the iOS moment feed contract used by staging E2E', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const feedPath = contract.paths['/feed'];
      const limitParam = feedPath.get.parameters.find(
        (param) => param.name === 'limit',
      );

      expect(limitParam?.schema).toMatchObject({ maximum: 50 });
      expect(contract.components.schemas.FeedPage).toMatchObject({
        required: ['data', 'metadata'],
        properties: {
          metadata: { $ref: '#/components/schemas/FeedMetadata' },
        },
      });
      expect(contract.components.schemas.FeedMetadata.required).toEqual([
        'total',
        'page',
        'lastPage',
      ]);
      expect(contract.components.schemas.CreatePostInput).toMatchObject({
        required: ['type', 'sport', 'text'],
        properties: {
          type: { type: 'string', minLength: 1 },
          sport: { type: 'string', minLength: 1 },
          text: { type: 'string', minLength: 1 },
          title: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/FeedImage' },
          },
          city: { type: 'string' },
          loc: { type: 'string' },
          address: { type: 'string' },
        },
      });
      expect(contract.components.schemas.Post.properties).toMatchObject({
        userId: { type: 'integer' },
        type: { type: 'string' },
        sport: { type: 'string' },
        title: { type: 'string' },
        username: { type: 'string' },
        images: {
          type: 'array',
          items: { $ref: '#/components/schemas/FeedImage' },
        },
      });
    });

    it('documents the Web public hall social intents contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const publicHallPath = contract.paths['/public/social-intents'].get;
      const detailPath = contract.paths['/public/social-intents/{id}'].get;
      const matchesPath =
        contract.paths['/public/social-intents/{id}/matches'].get;
      const limitParam = publicHallPath.parameters.find(
        (param) => param.name === 'limit',
      );

      expect(limitParam?.schema).toMatchObject({ maximum: 50 });
      expect(
        publicHallPath.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/PublicSocialIntentPage',
      });
      expect(contract.components.schemas.PublicSocialIntentPage).toMatchObject({
        required: ['data', 'metadata'],
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/PublicSocialIntent' },
          },
        },
      });
      expect(contract.components.schemas.PublicSocialIntent).toMatchObject({
        required: expect.arrayContaining([
          'id',
          'requestType',
          'title',
          'city',
          'status',
        ]),
        properties: {
          id: { type: 'string' },
          candidateUserIds: { type: 'array', items: { type: 'integer' } },
          matchSignal: { type: 'object', additionalProperties: true },
        },
      });
      expect(
        detailPath.responses['200'].content['application/json'].schema,
      ).toEqual({ $ref: '#/components/schemas/PublicSocialIntent' });
      expect(
        matchesPath.responses['200'].content['application/json'].schema,
      ).toEqual({ $ref: '#/components/schemas/PublicSocialIntentMatches' });
      expect(
        contract.components.schemas.PublicSocialIntentMatches,
      ).toMatchObject({
        required: ['request', 'candidates', 'matchedBy'],
        properties: {
          request: { $ref: '#/components/schemas/PublicSocialIntent' },
          candidates: {
            type: 'array',
            items: { $ref: '#/components/schemas/PublicSocialCandidate' },
          },
          matchedBy: { type: 'string' },
        },
      });
      expect(contract.components.schemas.PublicSocialCandidate).toMatchObject({
        required: [
          'profile',
          'score',
          'reasonTags',
          'reasonText',
          'nextAction',
        ],
        properties: {
          profile: expect.objectContaining({
            required: expect.arrayContaining([
              'id',
              'name',
              'verified',
              'interestTags',
              'distanceKm',
            ]),
          }),
          nextAction: { type: 'string', enum: ['draft_invitation'] },
        },
      });
    });

    it('documents the iOS session restore auth contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(contract.paths['/auth/login'].post.responses['200']).toEqual({
        $ref: '#/components/responses/AuthResult',
      });
      expect(contract.paths['/auth/refresh'].post.responses['200']).toEqual({
        $ref: '#/components/responses/AuthResult',
      });
      expect(
        contract.paths['/auth/profile'].get.responses['200'],
      ).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserProfile' },
          },
        },
      });
      expect(contract.components.schemas.AuthResult).toMatchObject({
        required: ['access_token', 'user'],
        properties: {
          access_token: { type: 'string' },
          refresh_token: { type: 'string' },
          user: { $ref: '#/components/schemas/UserProfile' },
        },
      });
      expect(contract.components.schemas.UserProfile.properties).toMatchObject({
        id: { type: 'integer' },
        email: { type: 'string' },
        name: { type: 'string' },
        avatar: { type: 'string' },
        city: { type: 'string' },
      });
    });

    it('documents the iOS Social Agent chat and candidate action contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const run = contract.paths['/social-agent/chat/run'].post;
      const runAsync = contract.paths['/social-agent/chat/run-async'].post;
      const sendCandidate =
        contract.paths['/social-agent/chat/tasks/{taskId}/send-message'].post
          .requestBody.content['application/json'].schema;
      const taskSession =
        contract.paths['/social-agent/chat/tasks/{taskId}/session'].get;
      const runStatus =
        contract.paths['/social-agent/chat/tasks/{taskId}/runs/{runId}'].get;

      for (const route of [
        '/social-agent/chat/messages',
        '/social-agent/chat/tasks/{taskId}/messages',
      ]) {
        expect(
          contract.paths[route].post.requestBody.content['application/json']
            .schema,
        ).toEqual({
          $ref: '#/components/schemas/SocialAgentRouteMessageInput',
        });
        expect(contract.paths[route].post.responses['200']).toEqual({
          $ref: '#/components/responses/UserFacingAgentResponse',
        });
      }
      for (const operation of [run, runAsync]) {
        expect(
          operation.requestBody.content['application/json'].schema,
        ).toEqual({
          $ref: '#/components/schemas/SocialAgentRunInput',
        });
      }
      expect(run.responses['200'].content['application/json'].schema).toEqual({
        $ref: '#/components/schemas/SocialAgentChatRunResult',
      });
      expect(
        runAsync.responses['202'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentAsyncRunSnapshot',
      });
      expect(contract.components.schemas.SocialAgentRunInput).toMatchObject({
        required: ['goal'],
        properties: {
          goal: { type: 'string', minLength: 1 },
          permissionMode: { type: 'string' },
        },
      });
      expect(
        contract.components.schemas.SocialAgentChatRunResult,
      ).toMatchObject({
        required: [
          'taskId',
          'status',
          'visibleSteps',
          'assistantMessage',
          'socialRequestDraft',
          'candidates',
          'approvalRequiredActions',
          'events',
        ],
        properties: {
          taskId: { type: 'integer' },
          status: { type: 'string' },
          assistantMessage: { type: 'string' },
          socialRequestDraft: {
            type: ['object', 'null'],
            additionalProperties: true,
          },
        },
      });
      expect(
        contract.components.schemas.SocialAgentRouteMessageInput.properties,
      ).toMatchObject({
        message: { type: 'string' },
        taskId: { type: 'integer' },
        hasCandidates: { type: 'boolean' },
      });
      expect(
        contract.components.schemas.SocialAgentCandidateActionInput.properties,
      ).toMatchObject({
        targetUserId: { type: 'integer' },
        candidateUserId: { type: 'integer' },
        candidateRecordId: { type: 'integer' },
        publicIntentId: { type: 'string' },
        socialRequestId: { type: 'integer' },
        candidate: { type: 'object', additionalProperties: true },
        suggestedOpener: { type: 'string' },
      });
      expect(sendCandidate).toMatchObject({
        allOf: [
          { $ref: '#/components/schemas/SocialAgentCandidateActionInput' },
          {
            type: 'object',
            required: ['message'],
            properties: { message: { type: 'string', minLength: 1 } },
          },
        ],
      });
      expect(taskSession.parameters).toEqual([
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
        },
      ]);
      expect(
        taskSession.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentSessionSnapshot',
      });
      expect(runStatus.parameters).toEqual([
        {
          name: 'taskId',
          in: 'path',
          required: true,
          schema: { type: 'integer' },
        },
        {
          name: 'runId',
          in: 'path',
          required: true,
          schema: { type: 'string', minLength: 1 },
        },
      ]);
      expect(
        runStatus.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentAsyncRunSnapshot',
      });
      expect(
        contract.components.schemas.SocialAgentAsyncRunSnapshot,
      ).toMatchObject({
        required: [
          'taskId',
          'runId',
          'status',
          'phase',
          'message',
          'pollAfterMs',
        ],
        properties: {
          taskId: { type: 'integer' },
          runId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['queued', 'running', 'completed', 'failed'],
          },
          pollAfterMs: { type: 'integer' },
        },
      });
    });

    it('documents the Web Social Agent continuation and publish contract', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(
        contract.paths['/social-agent/tasks/{taskId}/events'].get.responses[
          '200'
        ].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentTaskEventsResult',
      });
      expect(
        contract.paths['/social-agent/tasks/{taskId}/replan'].post.requestBody
          .content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentReplanInput',
      });
      expect(
        contract.paths['/social-agent/tasks/{taskId}/replan'].post.responses[
          '200'
        ].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentReplanResult',
      });
      expect(
        contract.paths['/social-agent/tasks/{taskId}/run-next'].post.responses[
          '200'
        ].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentRunNextResult',
      });
      expect(
        contract.paths[
          '/social-agent/chat/tasks/{taskId}/publish-social-request'
        ].post.requestBody.content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentPublishSocialRequestInput',
      });
      expect(
        contract.paths[
          '/social-agent/chat/tasks/{taskId}/publish-social-request'
        ].post.responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentPublishResult',
      });
      expect(
        contract.paths['/social-agent/chat/tasks/{taskId}/replan-run'].post
          .responses['202'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentAsyncRunSnapshot',
      });
      expect(
        contract.paths['/social-agent/chat/tasks/{taskId}/append-context'].post
          .responses['200'].content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentAppendContextResult',
      });
      expect(
        contract.paths['/social-agent/chat/tasks/{taskId}/actions'].post
          .requestBody.content['application/json'].schema,
      ).toEqual({
        $ref: '#/components/schemas/SocialAgentCardActionInput',
      });
      expect(
        contract.paths['/social-agent/chat/tasks/{taskId}/actions'].post
          .responses['200'],
      ).toEqual({
        $ref: '#/components/responses/UserFacingAgentResponse',
      });
      expect(
        contract.components.schemas.SocialAgentCardActionInput.properties
          .action,
      ).toMatchObject({
        type: 'string',
        enum: expect.arrayContaining([
          'activity.upload_proof',
          'activity.view_detail',
          'life_graph.accept_update',
          'life_graph.reject_update',
        ]),
      });
      expect(
        contract.components.schemas.UserFacingAgentResponse.properties.cards
          .items,
      ).toEqual({ $ref: '#/components/schemas/FitMeetAlphaCard' });
      expect(
        contract.components.schemas.FitMeetAlphaCard.properties.type,
      ).toEqual({ $ref: '#/components/schemas/FitMeetAlphaCardType' });
      expect(contract.components.schemas.FitMeetAlphaCardType.enum).toEqual(
        expect.arrayContaining(['activity_status', 'profile_proposal']),
      );
      expect(
        contract.components.schemas.FitMeetAlphaCardAction.properties.action
          .enum,
      ).toEqual(expect.arrayContaining(['view_activity', 'upload_proof']));
      expect(
        contract.components.schemas.FitMeetAlphaCardAction.properties
          .schemaAction,
      ).toEqual({ $ref: '#/components/schemas/FitMeetAgentSchemaAction' });
      expect(contract.components.schemas.FitMeetAgentSchemaAction.enum).toEqual(
        expect.arrayContaining([
          'activity.upload_proof',
          'activity.view_detail',
        ]),
      );
      expect(contract.components.schemas.SocialAgentReplanInput).toMatchObject({
        required: ['userMessage'],
        properties: {
          userMessage: { type: 'string', minLength: 1 },
          reason: {
            type: 'string',
            enum: [
              'user_follow_up',
              'failure_recovery',
              'manual_replan',
              'initial',
            ],
          },
        },
      });
      expect(
        contract.components.schemas.SocialAgentRunNextResult.properties.cards
          .items,
      ).toEqual({ $ref: '#/components/schemas/FitMeetAlphaCard' });
      expect(
        contract.components.schemas.SocialAgentRunNextResult.properties
          .handledReply,
      ).toEqual({ type: 'boolean' });
      expect(
        contract.components.schemas.SocialAgentPublishResult,
      ).toMatchObject({
        required: [
          'success',
          'taskId',
          'socialRequestId',
          'publicIntentId',
          'status',
          'taskStatus',
          'synced',
          'socialRequest',
        ],
        properties: {
          success: { type: 'boolean' },
          taskId: { type: 'integer' },
          socialRequestId: { type: 'integer' },
          synced: { type: 'boolean' },
        },
      });
      expect(
        contract.components.schemas.SocialAgentAppendContextResult,
      ).toMatchObject({
        required: [
          'taskId',
          'saved',
          'eventType',
          'userMessage',
          'previousGoal',
          'refreshedGoal',
          'appendedAt',
        ],
        properties: {
          taskId: { type: 'integer' },
          saved: { type: 'boolean', enum: [true] },
          eventType: {
            type: 'string',
            enum: ['social_agent.context.appended'],
          },
        },
      });
    });
  });
});

function collectControllerRoutes(
  controllers: readonly ControllerType[],
): ControllerRoute[] {
  return controllers.flatMap((controller) => {
    const controllerPaths = toPathArray(
      Reflect.getMetadata(PATH_METADATA, controller),
    );
    const prototype = controller.prototype as unknown as Record<
      string,
      unknown
    >;

    return Object.getOwnPropertyNames(prototype).flatMap((propertyKey) => {
      const handler = prototype[propertyKey];
      if (typeof handler !== 'function') return [];

      const routeMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (routeMethod === undefined) return [];

      const method = methodName(routeMethod);
      if (!method) return [];

      const methodPaths = toPathArray(
        Reflect.getMetadata(PATH_METADATA, handler),
      );

      return controllerPaths.flatMap((controllerPath) =>
        methodPaths.map((methodPath) => ({
          method,
          path: normalizePathParams(joinRoutePath(controllerPath, methodPath)),
        })),
      );
    });
  });
}

function toPathArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(toPathArray);
  if (typeof value === 'string') return [value];
  return [''];
}

function methodName(method: RequestMethod): RouteMethod | null {
  const value = RequestMethod[method];
  return typeof value === 'string'
    ? (value.toLowerCase() as RouteMethod)
    : null;
}

function joinRoutePath(controllerPath: string, methodPath: string) {
  return `/${[controllerPath, methodPath]
    .filter(Boolean)
    .map((part) => part.replace(/^\/|\/$/g, ''))
    .filter(Boolean)
    .join('/')}`;
}

function normalizePathParams(path: string) {
  return path
    .replace(/\{[^/}]+\}/g, ':param')
    .replace(/:[^/]+/g, ':param')
    .replace(/\/+/g, '/');
}

function normalizeEndpointPath(path: string) {
  return normalizePathParams(path.replace(/\$\{[^}]+\}/g, ':param'));
}

function collectEndpointLiterals(source: string): string[] {
  const literalMatches = [
    ...source.matchAll(/(['"`])((?:\/|\$\{)[\s\S]*?)\1/g),
  ];
  return [
    ...new Set(
      literalMatches
        .map((match) => match[2].replace(/\s+/g, ''))
        .filter((value) => value.startsWith('/')),
    ),
  ];
}

function collectSwiftEndpointTemplates(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/"([^"]*\/[^"]*)"/g)]
        .map((match) => match[1].replace(/\\\([^)]+\)/g, ':param'))
        .map((endpoint) => endpoint.replace(/\s+/g, ''))
        .filter((endpoint) => endpoint.startsWith('/')),
    ),
  ].map(normalizeEndpointPath);
}
