import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
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
  });

  describe('FitMeet core OpenAPI', () => {
    it('covers auth, users, feed, messages, Social Agent chat, and uploads', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(contract.openapi).toBe('3.1.0');
      expect(Object.keys(contract.paths)).toEqual(
        expect.arrayContaining([
          '/auth/login',
          '/auth/refresh',
          '/auth/profile',
          '/users/profile',
          '/feed',
          '/feed/{postId}/comments',
          '/messages/start',
          '/messages/conversations',
          '/messages/conversations/{conversationId}',
          '/messages/conversations/{conversationId}/send',
          '/messages/unread',
          '/social-agent/chat/session',
          '/social-agent/chat/messages',
          '/social-agent/chat/stream-user',
          '/social-agent/chat/tasks/{taskId}/session',
          '/social-agent/chat/tasks/{taskId}/messages',
          '/social-agent/chat/tasks/{taskId}/save-candidate',
          '/social-agent/chat/tasks/{taskId}/send-message',
          '/social-agent/chat/tasks/{taskId}/connect-candidate',
          '/uploads/image',
          '/uploads/video',
        ]),
      );
    });

    it('keeps the iOS staging E2E contract explicit', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const requiredPaths = {
        '/auth/login': 'post',
        '/auth/refresh': 'post',
        '/auth/profile': 'get',
        '/users/profile': 'put',
        '/uploads/image': 'post',
        '/messages/start': 'post',
        '/messages/conversations/{conversationId}': 'get',
        '/messages/conversations/{conversationId}/send': 'post',
        '/feed': ['get', 'post'],
        '/feed/interactions': 'get',
        '/social-agent/chat/session': 'get',
        '/social-agent/chat/messages': 'post',
        '/social-agent/chat/route-message': 'post',
      } as const;

      for (const [path, methodOrMethods] of Object.entries(requiredPaths)) {
        const methods = Array.isArray(methodOrMethods)
          ? methodOrMethods
          : [methodOrMethods];
        expect(contract.paths[path]).toBeDefined();
        for (const method of methods) {
          expect(contract.paths[path][method]).toBeDefined();
        }
      }
    });

    it('documents conversation history separately from sent message payloads', () => {
      const contract = appController.getFitMeetCoreOpenApi();
      const historySchema =
        contract.paths['/messages/conversations/{conversationId}'].get
          .responses['200'].content['application/json'].schema;

      expect(historySchema).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/ConversationHistoryMessage' },
      });
      expect(
        contract.components.schemas.ConversationHistoryMessage.required,
      ).toEqual(['id', 'text', 'isMine']);
      expect(
        contract.components.schemas.ConversationMessage.required,
      ).toContain('conversationId');
    });
  });
});
