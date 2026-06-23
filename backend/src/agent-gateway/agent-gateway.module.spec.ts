import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

type NestCommon = typeof import('@nestjs/common');

jest.mock('../activities/activities.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class ActivitiesModule {}
  Module({})(ActivitiesModule);
  return { ActivitiesModule };
});

jest.mock('../friends/friends.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class FriendsModule {}
  Module({})(FriendsModule);
  return { FriendsModule };
});

jest.mock('../match/match.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class MatchModule {}
  Module({})(MatchModule);
  return { MatchModule };
});

jest.mock('../meets/meets.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class MeetsModule {}
  Module({})(MeetsModule);
  return { MeetsModule };
});

jest.mock('../messages/messages.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class MessagesModule {}
  Module({})(MessagesModule);
  return { MessagesModule };
});

jest.mock('../notifications/notifications.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class NotificationsModule {}
  Module({})(NotificationsModule);
  return { NotificationsModule };
});

jest.mock('../safety/safety.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class SafetyModule {}
  Module({})(SafetyModule);
  return { SafetyModule };
});

jest.mock('../social-requests/social-requests.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class SocialRequestsModule {}
  Module({})(SocialRequestsModule);
  return { SocialRequestsModule };
});

jest.mock('../users/users.module', () => {
  const { Module } = jest.requireActual<NestCommon>('@nestjs/common');
  class UsersModule {}
  Module({})(UsersModule);
  return { UsersModule };
});

import { AgentDiscoveryService } from './agent-discovery.service';
import { AgentGatewayModule } from './agent-gateway.module';
import { AgentProfileQAController } from './agent-profile-qa.controller';
import { PublicSocialIntentController } from './public-social-intent.controller';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';

type RouteInfo = { method: string; path: string };

type ExpressRouteLayer = {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
  };
  handle?: { stack?: ExpressRouteLayer[] };
};

function createRepositoryMock() {
  const queryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };

  return {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(<T>(value: T): T => value),
    createQueryBuilder: jest.fn(() => queryBuilder),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(<T>(value: T): Promise<T> => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };
}

function createDataSourceMock() {
  return {
    entityMetadatas: [],
    getMongoRepository: jest.fn(() => createRepositoryMock()),
    getRepository: jest.fn(() => createRepositoryMock()),
    getTreeRepository: jest.fn(() => createRepositoryMock()),
    options: { type: 'postgres' },
  };
}

function createGenericMock(): Record<string | symbol, jest.Mock | undefined> {
  return new Proxy<Record<string | symbol, jest.Mock | undefined>>(
    {},
    {
      get(target, prop) {
        if (prop === 'then') return undefined;
        if (!target[prop]) target[prop] = jest.fn();
        return target[prop];
      },
    },
  );
}

function collectRoutes(app: INestApplication): RouteInfo[] {
  const instance = app.getHttpAdapter().getInstance() as {
    _router?: { stack?: ExpressRouteLayer[] };
    router?: { stack?: ExpressRouteLayer[] };
  };
  const stack = instance._router?.stack ?? instance.router?.stack ?? [];

  return collectRouteStack(stack);
}

function collectRouteStack(stack: ExpressRouteLayer[]): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const layer of stack) {
    if (layer.route?.path && layer.route.methods) {
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled) {
          routes.push({ method: method.toUpperCase(), path: layer.route.path });
        }
      }
    }

    if (layer.handle?.stack) {
      routes.push(...collectRouteStack(layer.handle.stack));
    }
  }

  return routes;
}

function requireRouteIndex(
  routes: RouteInfo[],
  method: string,
  pathSuffix: string,
): number {
  const index = routes.findIndex(
    (route) => route.method === method && route.path.endsWith(pathSuffix),
  );

  if (index === -1) {
    throw new Error(
      `Expected ${method} ${pathSuffix}. Registered routes: ${routes
        .map((route) => `${route.method} ${route.path}`)
        .join(', ')}`,
    );
  }

  return index;
}

describe('AgentGatewayModule startup', () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it('starts and resolves retained public and profile controllers', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AgentGatewayModule],
    })
      .useMocker((token) => {
        if (token === DataSource) return createDataSourceMock();
        return createGenericMock();
      })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(AgentDiscoveryService)).toBeInstanceOf(
      AgentDiscoveryService,
    );
    expect(app.get(PublicSocialIntentController)).toBeInstanceOf(
      PublicSocialIntentController,
    );
    expect(app.get(AgentProfileQAController)).toBeInstanceOf(
      AgentProfileQAController,
    );

    await app.close();
  });

  it('wires final responses to the shared streaming DeepSeek client in production DI', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AgentGatewayModule],
    })
      .useMocker((token) => {
        if (token === DataSource) return createDataSourceMock();
        return createGenericMock();
      })
      .compile();

    const finalResponses = moduleRef.get(SocialAgentFinalResponseService);
    const deepSeek = moduleRef.get(SocialAgentChatDeepSeekClientService);

    expect(finalResponses).toBeInstanceOf(SocialAgentFinalResponseService);
    expect(deepSeek).toBeInstanceOf(SocialAgentChatDeepSeekClientService);
    expect(
      (
        finalResponses as unknown as {
          deepSeek?: SocialAgentChatDeepSeekClientService;
        }
      ).deepSeek,
    ).toBe(deepSeek);
  });

  it('wires chat LLM replies through the final response generator in production DI', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AgentGatewayModule],
    })
      .useMocker((token) => {
        if (token === DataSource) return createDataSourceMock();
        return createGenericMock();
      })
      .compile();

    const chatLlm = moduleRef.get(SocialAgentChatLlmService);
    const finalResponses = moduleRef.get(SocialAgentFinalResponseService);

    expect(chatLlm).toBeInstanceOf(SocialAgentChatLlmService);
    expect(
      (
        chatLlm as unknown as {
          finalResponses?: SocialAgentFinalResponseService;
        }
      ).finalResponses,
    ).toBe(finalResponses);
  });

  it('registers social agent restore routes before the generic task route', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AgentGatewayModule],
    })
      .useMocker((token) => {
        if (token === DataSource) return createDataSourceMock();
        return createGenericMock();
      })
      .compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const routes = collectRoutes(app);
    const currentRoute = requireRouteIndex(
      routes,
      'GET',
      '/social-agent/tasks/current',
    );
    const timelineRoute = requireRouteIndex(
      routes,
      'GET',
      '/social-agent/tasks/:id/timeline',
    );
    const eventsRoute = requireRouteIndex(
      routes,
      'GET',
      '/social-agent/tasks/:id/events',
    );
    const genericTaskRoute = requireRouteIndex(
      routes,
      'GET',
      '/social-agent/tasks/:id',
    );

    expect(currentRoute).toBeLessThan(genericTaskRoute);
    expect(timelineRoute).toBeLessThan(genericTaskRoute);
    expect(eventsRoute).toBeLessThan(genericTaskRoute);
    expect(
      requireRouteIndex(routes, 'GET', '/social-agent/chat/session'),
    ).toBeGreaterThanOrEqual(0);
    expect(
      requireRouteIndex(routes, 'GET', '/social-agent/chat/tasks/:id/session'),
    ).toBeGreaterThanOrEqual(0);

    await app.close();
  });
});
