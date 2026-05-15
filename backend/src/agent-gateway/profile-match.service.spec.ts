import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import { MessagesService } from '../messages/messages.service';
import { SafetyService } from '../safety/safety.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';
import { AgentWebhookService } from './agent-webhook.service';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import { ProfileMatchService } from './profile-match.service';

const mockRepo = () => ({
  create: jest.fn((data) => data),
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn((data) => ({
    ...data,
    id: data.id ?? 300,
    createdAt: new Date('2026-05-15T00:00:00Z'),
  })),
  createQueryBuilder: jest.fn(),
});

function qbReturning(rows: unknown[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
}

describe('ProfileMatchService', () => {
  let service: ProfileMatchService;
  let profileRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let sessionRepo: ReturnType<typeof mockRepo>;
  let connectionRepo: ReturnType<typeof mockRepo>;
  let messages: { createAgentInboxEvent: jest.Mock };
  let webhooks: { emitToConnection: jest.Mock };
  let safety: { getMutualBlockUserIds: jest.Mock };

  beforeEach(async () => {
    profileRepo = mockRepo();
    userRepo = mockRepo();
    sessionRepo = mockRepo();
    sessionRepo.find.mockResolvedValue([]);
    connectionRepo = mockRepo();
    messages = { createAgentInboxEvent: jest.fn() };
    webhooks = { emitToConnection: jest.fn() };
    safety = { getMutualBlockUserIds: jest.fn().mockResolvedValue(new Set()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileMatchService,
        { provide: getRepositoryToken(UserSocialProfile), useValue: profileRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(AiMatchSession), useValue: sessionRepo },
        { provide: getRepositoryToken(AgentConnection), useValue: connectionRepo },
        { provide: SafetyService, useValue: safety },
        { provide: MessagesService, useValue: messages },
        { provide: AgentWebhookService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(ProfileMatchService);
  });

  it('creates review-only inbox/webhook recommendations from profiles', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      city: 'Shanghai',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      interestTags: ['running'],
      traits: ['focused'],
      wantToMeet: ['rich', 'founder'],
      preferredTraits: ['focused'],
      matchSignals: {
        privatePreferenceTags: ['founder'],
        sensitivePrivateTags: ['rich'],
      },
    });
    profileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([
        {
          userId: 2,
          city: 'Shanghai',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          interestTags: ['running'],
          traits: ['focused'],
          aiSummary: 'Safe public candidate summary.',
          matchSignals: {
            publicTags: ['running', 'founder'],
            sensitivePrivateTags: ['rich'],
          },
        },
      ]),
    );
    sessionRepo.find.mockResolvedValue([]);
    userRepo.find.mockResolvedValue([
      {
        id: 2,
        name: 'Candidate',
        avatar: 'C',
        color: '#16C784',
        city: 'Shanghai',
      },
    ]);
    connectionRepo.find.mockResolvedValue([
      { id: 9, userId: 1, status: ConnectionStatus.Active },
    ]);

    const result = await service.runOnce(1);

    expect(result.matchedCount).toBe(1);
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 9,
        ownerUserId: 1,
        eventType: 'profile.match.recommended',
        metadata: expect.objectContaining({
          aiMatchSessionId: 300,
          nextAction: 'owner_confirmation_required',
        }),
      }),
    );
    expect(webhooks.emitToConnection).toHaveBeenCalledWith(
      9,
      'profile.match.recommended',
      expect.objectContaining({ aiMatchSessionId: 300 }),
    );
  });

  it('does not recommend mutually blocked users', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    profileRepo.createQueryBuilder.mockReturnValue(qbReturning([{ userId: 2 }]));
    safety.getMutualBlockUserIds.mockResolvedValue(new Set([2]));

    const result = await service.runOnce(1);

    expect(result.matchedCount).toBe(0);
    expect(messages.createAgentInboxEvent).not.toHaveBeenCalled();
  });
});
