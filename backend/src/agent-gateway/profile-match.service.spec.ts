import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import { MessagesService } from '../messages/messages.service';
import { MatchReasonerService } from './match-reasoner.service';
import { SafetyService } from '../safety/safety.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';
import { AgentWebhookService } from './agent-webhook.service';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
/* eslint-disable @typescript-eslint/require-await */
import { ProfileMatchService } from './profile-match.service';
import { ContactRequest } from './entities/contact-request.entity';
import { AgentActionLogService } from './agent-action-log.service';
import { AgentApprovalService } from './agent-approval.service';
import { CompatibilityScorerService } from '../match/compatibility-scorer.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AgentTask, AgentTaskEvent } from './entities/agent-task.entity';

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
  let contactRepo: ReturnType<typeof mockRepo>;
  let taskRepo: ReturnType<typeof mockRepo>;
  let taskEventRepo: ReturnType<typeof mockRepo>;
  let messages: {
    createAgentInboxEvent: jest.Mock;
    startConversation: jest.Mock;
    sendMessage: jest.Mock;
  };
  let webhooks: { emitToConnection: jest.Mock };
  let safety: { getMutualBlockUserIds: jest.Mock };
  let actionLog: { logAgentAction: jest.Mock };
  let approvals: { create: jest.Mock };
  let notifications: { create: jest.Mock };

  beforeEach(async () => {
    profileRepo = mockRepo();
    userRepo = mockRepo();
    sessionRepo = mockRepo();
    sessionRepo.find.mockResolvedValue([]);
    connectionRepo = mockRepo();
    contactRepo = mockRepo();
    taskRepo = mockRepo();
    taskEventRepo = mockRepo();
    messages = {
      createAgentInboxEvent: jest.fn(),
      startConversation: jest
        .fn()
        .mockResolvedValue({ conversationId: 'conv-1' }),
      sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    };
    webhooks = { emitToConnection: jest.fn().mockResolvedValue(undefined) };
    safety = { getMutualBlockUserIds: jest.fn().mockResolvedValue(new Set()) };
    actionLog = { logAgentAction: jest.fn().mockResolvedValue(null) };
    approvals = {
      create: jest.fn(async (input) => ({ id: 9001, ...input })),
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileMatchService,
        {
          provide: getRepositoryToken(UserSocialProfile),
          useValue: profileRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(AiMatchSession), useValue: sessionRepo },
        {
          provide: getRepositoryToken(AgentConnection),
          useValue: connectionRepo,
        },
        { provide: getRepositoryToken(ContactRequest), useValue: contactRepo },
        { provide: getRepositoryToken(AgentTask), useValue: taskRepo },
        {
          provide: getRepositoryToken(AgentTaskEvent),
          useValue: taskEventRepo,
        },
        { provide: SafetyService, useValue: safety },
        { provide: MessagesService, useValue: messages },
        { provide: AgentWebhookService, useValue: webhooks },
        MatchReasonerService,
        CompatibilityScorerService,
        { provide: AgentActionLogService, useValue: actionLog },
        { provide: AgentApprovalService, useValue: approvals },
        { provide: NotificationsService, useValue: notifications },
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
    expect(result.recommendations[0]).toMatchObject({
      candidateUserId: 2,
      source: 'profile_pool',
      scoreBreakdown: expect.any(Object),
      matchedSignals: expect.any(Array),
      publicReason: expect.any(String),
      privateReason: expect.any(String),
      riskWarning: expect.any(String),
      suggestedOpener: expect.any(String),
      nextAction: 'owner_confirmation_required',
    });
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 9,
        ownerUserId: 1,
        eventType: 'profile.match.recommended',
        metadata: expect.objectContaining({
          aiMatchSessionId: 300,
          nextAction: 'owner_confirmation_required',
          publicReasons: expect.any(Array),
          privateReasonAvailable: true,
          riskTips: expect.any(Array),
        }),
      }),
    );
    const inboxPayload = messages.createAgentInboxEvent.mock.calls[0][0];
    expect(JSON.stringify(inboxPayload.metadata.safeProfile)).not.toMatch(
      /rich|收入|手机号|身份证/i,
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
    profileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([{ userId: 2 }]),
    );
    safety.getMutualBlockUserIds.mockResolvedValue(new Set([2]));

    const result = await service.runOnce(1);

    expect(result.matchedCount).toBe(0);
    expect(result.skippedReasons.blockedUser).toBe(1);
    expect(messages.createAgentInboxEvent).not.toHaveBeenCalled();
  });

  it('reports duplicate and below-threshold profile skips without leaking private tags', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      city: 'Shanghai',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      interestTags: ['running'],
    });
    profileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([
        {
          userId: 2,
          city: 'Shanghai',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          interestTags: ['running'],
          matchSignals: { sensitivePrivateTags: ['rich'] },
        },
        {
          userId: 3,
          city: 'Beijing',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          interestTags: [],
          matchSignals: { sensitivePrivateTags: ['income'] },
        },
      ]),
    );
    sessionRepo.find.mockResolvedValue([{ targetUserId: 2 }]);
    userRepo.find.mockResolvedValue([
      {
        id: 3,
        name: 'Low Score Candidate',
        avatar: 'L',
        color: '#64748B',
        city: 'Beijing',
      },
    ]);

    const result = await service.runOnce(1, 8, { debug: true });

    expect(result.matchedCount).toBe(0);
    expect(result.skippedDuplicates).toBe(1);
    expect(result.skippedReasons).toMatchObject({
      duplicateRecommendation: 1,
      scoreBelowThreshold: 1,
    });
    expect(result.debugEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateUserId: 2,
          reason: 'duplicateRecommendation',
        }),
        expect.objectContaining({
          candidateUserId: 3,
          reason: 'scoreBelowThreshold',
          threshold: expect.any(Number),
        }),
      ]),
    );
    expect(JSON.stringify(result.debugEvents)).not.toMatch(/rich|income/i);
    expect(messages.createAgentInboxEvent).not.toHaveBeenCalled();
  });

  it('does not auto-enable the profile match pool by default', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      profileDiscoverable: false,
      agentCanRecommendMe: false,
      interestTags: ['running'],
      traits: ['focused'],
    });

    await expect(service.runOnce(1)).rejects.toThrow(
      'Please enable AI continuous recommendations before running profile matches.',
    );

    expect(profileRepo.save).not.toHaveBeenCalled();
    expect(profileRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('writes profile recommendations to the built-in Agent Inbox without an active connection', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      city: 'Shanghai',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      interestTags: ['running'],
      traits: ['focused'],
      preferredTraits: ['focused'],
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
          matchSignals: { publicTags: ['running'] },
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
    connectionRepo.find.mockResolvedValue([]);

    const result = await service.runOnce(1);

    expect(result.inboxEvents).toBe(1);
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 0,
        ownerUserId: 1,
        eventType: 'profile.match.recommended',
      }),
    );
    expect(webhooks.emitToConnection).not.toHaveBeenCalled();
  });

  it('matches confirmed private wealth/resource signals semantically without public leakage', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      city: 'Shanghai',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      interestTags: ['running'],
      wantToMeet: ['resources'],
      matchSignals: {
        privatePreferenceTags: ['resources'],
        sensitivePrivateTags: ['resources'],
      },
      sensitiveTagDecisions: {
        resources: {
          status: 'confirmed',
          category: 'wealth',
          source: 'self_declared',
          visibility: 'match_only',
        },
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
          matchSignals: {
            publicTags: ['running'],
            sensitivePrivateTags: ['rich'],
          },
          sensitiveTagDecisions: {
            rich: {
              status: 'confirmed',
              category: 'wealth',
              source: 'self_declared',
              visibility: 'match_only',
            },
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
    const inboxPayload = messages.createAgentInboxEvent.mock.calls[0][0];
    expect(JSON.stringify(inboxPayload.metadata.publicReasons)).not.toMatch(
      /rich|wealth|resources/i,
    );
    expect(inboxPayload.metadata.privateReasonAvailable).toBe(true);
    expect(inboxPayload.metadata.privateReasons).toBeUndefined();
  });

  it('creates a target-consent contact request only after owner confirmation', async () => {
    sessionRepo.findOne.mockResolvedValue({
      id: 300,
      ownerId: 1,
      targetUserId: 2,
      score: 70,
      status: 'review',
      source: 'profile_pool',
      summary: 'Shared tags: running',
      reasons: ['Shared tags: running'],
      transcript: [],
      createdAt: new Date('2026-05-15T00:00:00Z'),
    });
    contactRepo.findOne.mockResolvedValue(null);
    contactRepo.save.mockResolvedValue({ id: 99 });
    connectionRepo.findOne.mockResolvedValue({
      id: 9,
      userId: 1,
      status: ConnectionStatus.Active,
    });

    const result = await service.confirmContact(1, 300, '手机号 13800000000', {
      ownerConfirmed: true,
    });

    expect(contactRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: 1,
        targetUserId: 2,
        agentConnectionId: 9,
        note: '手机号已隐藏',
      }),
    );
    expect(sessionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', contactCardSent: true }),
    );
    expect(result).toMatchObject({
      status: 'pending_target_consent',
      contactRequestId: 99,
      requiresTargetConsent: true,
    });
  });

  it('ignore writes action log + inbox event + webhook', async () => {
    sessionRepo.findOne.mockResolvedValue({
      id: 300,
      ownerId: 1,
      targetUserId: 2,
      score: 60,
      status: 'review',
      source: 'profile_pool',
      summary: 's',
      reasons: [],
      transcript: [],
      createdAt: new Date(),
    });
    profileRepo.findOne.mockResolvedValue({
      userId: 2,
      city: 'Shanghai',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      interestTags: ['running'],
      matchSignals: {},
    });
    userRepo.findOne.mockResolvedValue({
      id: 2,
      name: 'Candidate',
      avatar: 'C',
      color: '#16C784',
      city: 'Shanghai',
    });
    connectionRepo.find.mockResolvedValue([
      { id: 9, userId: 1, status: ConnectionStatus.Active },
    ]);

    const result = await service.ignore(1, 300);

    expect(result.action).toBe('recommendation.ignored');
    expect(actionLog.logAgentAction).toHaveBeenCalled();
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'recommendation.ignored',
        metadata: expect.objectContaining({
          recommendationId: 300,
          targetUserId: 2,
          action: 'recommendation.ignored',
        }),
      }),
    );
    expect(webhooks.emitToConnection).toHaveBeenCalledWith(
      9,
      'recommendation.ignored',
      expect.any(Object),
    );
  });

  it('send-intro requires owner confirmation before sending', async () => {
    sessionRepo.findOne.mockResolvedValue({
      id: 300,
      ownerId: 1,
      targetUserId: 2,
      score: 70,
      status: 'review',
      source: 'profile_pool',
      transcript: [],
      reasons: [],
      summary: '',
      createdAt: new Date(),
    });

    await expect(
      service.sendIntro(1, 300, {
        ownerConfirmed: false,
        text: 'hello',
      }),
    ).rejects.toThrow('Owner confirmation is required before sending an intro');
    expect(messages.startConversation).not.toHaveBeenCalled();
    expect(messages.sendMessage).not.toHaveBeenCalled();
  });

  it('send-intro sends after owner confirmation', async () => {
    sessionRepo.findOne.mockResolvedValue({
      id: 300,
      ownerId: 1,
      targetUserId: 2,
      score: 70,
      status: 'review',
      source: 'profile_pool',
      transcript: [],
      reasons: [],
      summary: '',
      createdAt: new Date(),
    });
    connectionRepo.find.mockResolvedValue([]);
    connectionRepo.findOne.mockResolvedValue({
      id: 44,
      userId: 1,
      status: ConnectionStatus.Active,
    });

    const result = await service.sendIntro(1, 300, {
      ownerConfirmed: true,
      text: 'hello',
    });

    expect(approvals.create).not.toHaveBeenCalled();
    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ agentConnectionId: 44 }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv-1',
      1,
      'hello',
      expect.objectContaining({ agentConnectionId: 44 }),
    );
    expect(result).toMatchObject({
      status: 'sent',
      requiresOwnerConfirmation: false,
      conversationId: 'conv-1',
    });
  });

  it('request-contact-exchange creates a target-consent contact request directly', async () => {
    sessionRepo.findOne.mockResolvedValue({
      id: 300,
      ownerId: 1,
      targetUserId: 2,
      score: 70,
      status: 'review',
      source: 'profile_pool',
      transcript: [],
      reasons: [],
      summary: '',
      createdAt: new Date(),
    });
    connectionRepo.find.mockResolvedValue([]);
    connectionRepo.findOne.mockResolvedValue({
      id: 44,
      userId: 1,
      status: ConnectionStatus.Active,
    });
    contactRepo.findOne.mockResolvedValue(null);
    contactRepo.save.mockResolvedValue({
      id: 800,
      requesterId: 1,
      targetUserId: 2,
      status: 'pending',
    });

    const result = await service.requestContactExchange(1, 300, {
      ownerConfirmed: true,
      note: 'lets exchange',
    });

    expect(approvals.create).not.toHaveBeenCalled();
    expect(contactRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: 1,
        targetUserId: 2,
        agentConnectionId: 44,
      }),
    );
    expect(result).toMatchObject({
      status: 'pending_target_consent',
      contactRequestId: 800,
      requiresTargetConsent: true,
    });
  });
});
