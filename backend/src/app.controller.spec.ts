import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SocialAgentChatController } from './agent-gateway/social-agent-chat.controller';
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
  SocialAgentChatController,
  SocialAgentTasksController,
  UploadsController,
] as const;

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
  '/social-agent/chat/session': 'get',
  '/social-agent/chat/tasks/{taskId}/session': 'get',
  '/social-agent/chat/messages': 'post',
  '/social-agent/chat/route-message': 'post',
  '/social-agent/chat/tasks/{taskId}/messages': 'post',
  '/social-agent/chat/tasks/{taskId}/save-candidate': 'post',
  '/social-agent/chat/tasks/{taskId}/send-message': 'post',
  '/social-agent/chat/tasks/{taskId}/connect-candidate': 'post',
} as const;

const WEB_APP_REQUIRED_PATHS = {
  '/social-agent/tasks/current': 'get',
  '/social-agent/tasks/{taskId}/timeline': 'get',
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
      });
    });

    it('should return readiness when storage dependencies respond', async () => {
      await expect(appController.getReadiness()).resolves.toEqual({
        status: 'ok',
        uptime: expect.any(Number),
        timestamp: expect.any(String),
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
          '/feed/{postId}/comments',
          '/feed/comments/{commentId}/like',
          '/messages/start',
          '/messages/conversations',
          '/messages/conversations/{conversationId}',
          '/messages/conversations/{conversationId}/send',
          '/messages/public-intents/{id}/start',
          '/messages/unread',
          '/social-agent/chat/session',
          '/social-agent/chat/messages',
          '/social-agent/chat/stream',
          '/social-agent/chat/stream-user',
          '/social-agent/chat/tasks/{taskId}/session',
          '/social-agent/chat/tasks/{taskId}/messages',
          '/social-agent/chat/tasks/{taskId}/save-candidate',
          '/social-agent/chat/tasks/{taskId}/send-message',
          '/social-agent/chat/tasks/{taskId}/connect-candidate',
          '/social-agent/tasks/current',
          '/social-agent/tasks/{taskId}/timeline',
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

      for (const [path, method] of Object.entries(WEB_APP_REQUIRED_PATHS)) {
        const openApiOperation = contract.paths[path][method];
        expect(openApiOperation).toBeDefined();
        expect(controllerRoutes).toContainEqual({
          method,
          path: normalizePathParams(path),
        });
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
      const sendCandidate =
        contract.paths['/social-agent/chat/tasks/{taskId}/send-message'].post
          .requestBody.content['application/json'].schema;
      const taskSession =
        contract.paths['/social-agent/chat/tasks/{taskId}/session'].get;

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
    const prototype = controller.prototype as Record<string, unknown>;

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
