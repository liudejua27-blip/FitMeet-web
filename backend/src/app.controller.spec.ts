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
    it('covers auth, feed, Social Agent chat, and uploads', () => {
      const contract = appController.getFitMeetCoreOpenApi();

      expect(contract.openapi).toBe('3.1.0');
      expect(Object.keys(contract.paths)).toEqual(
        expect.arrayContaining([
          '/auth/login',
          '/auth/refresh',
          '/auth/profile',
          '/feed',
          '/feed/{postId}/comments',
          '/social-agent/chat/messages',
          '/social-agent/chat/stream-user',
          '/uploads/image',
          '/uploads/video',
        ]),
      );
    });
  });
});
