import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

jest.mock('../activities/activities.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class ActivitiesModule {}
  Module({})(ActivitiesModule);
  return { ActivitiesModule };
});

jest.mock('../friends/friends.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class FriendsModule {}
  Module({})(FriendsModule);
  return { FriendsModule };
});

jest.mock('../match/match.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class MatchModule {}
  Module({})(MatchModule);
  return { MatchModule };
});

jest.mock('../meets/meets.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class MeetsModule {}
  Module({})(MeetsModule);
  return { MeetsModule };
});

jest.mock('../messages/messages.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class MessagesModule {}
  Module({})(MessagesModule);
  return { MessagesModule };
});

jest.mock('../notifications/notifications.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class NotificationsModule {}
  Module({})(NotificationsModule);
  return { NotificationsModule };
});

jest.mock('../safety/safety.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class SafetyModule {}
  Module({})(SafetyModule);
  return { SafetyModule };
});

jest.mock('../social-requests/social-requests.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class SocialRequestsModule {}
  Module({})(SocialRequestsModule);
  return { SocialRequestsModule };
});

jest.mock('../users/users.module', () => {
  const { Module } = jest.requireActual('@nestjs/common');
  class UsersModule {}
  Module({})(UsersModule);
  return { UsersModule };
});

import { AgentDiscoveryService } from './agent-discovery.service';
import { AgentGatewayModule } from './agent-gateway.module';
import { AgentUserController } from './agent-gateway.controller';

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
    create: jest.fn((value) => value),
    createQueryBuilder: jest.fn(() => queryBuilder),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value) => value),
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

function createGenericMock() {
  return new Proxy<Record<string | symbol, unknown>>(
    {},
    {
      get(target, prop) {
        if (prop === 'then') return undefined;
        if (!(prop in target)) target[prop] = jest.fn();
        return target[prop];
      },
    },
  );
}

describe('AgentGatewayModule startup', () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it('starts and resolves AgentUserController dependencies', async () => {
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
    expect(app.get(AgentUserController)).toBeInstanceOf(AgentUserController);

    await app.close();
  });
});
