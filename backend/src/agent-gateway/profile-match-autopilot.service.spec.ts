import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';

import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { MatchService } from '../match/match.service';
import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import { MatchCandidate } from './entities/match-candidate.entity';
import { UserPreference } from './entities/user-preference.entity';
import { ProfileMatchAutopilotService } from './profile-match-autopilot.service';
import { ProfileMatchService } from './profile-match.service';
import { AgentWebhookService } from './agent-webhook.service';

const mockRepo = () => ({
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

function qbReturning(rows: unknown[]) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
}

describe('ProfileMatchAutopilotService', () => {
  let service: ProfileMatchAutopilotService;
  let socialProfileRepo: ReturnType<typeof mockRepo>;
  let connectionRepo: ReturnType<typeof mockRepo>;
  let aiProfileRepo: ReturnType<typeof mockRepo>;
  let requestRepo: ReturnType<typeof mockRepo>;
  let preferenceRepo: ReturnType<typeof mockRepo>;
  let matchCandidateRepo: ReturnType<typeof mockRepo>;
  let socialRequestCandidateRepo: ReturnType<typeof mockRepo>;
  let sessionRepo: ReturnType<typeof mockRepo>;
  let profileMatch: { runOnce: jest.Mock };
  let matchService: { runMatch: jest.Mock };
  let notifications: { create: jest.Mock };
  let messages: { createAgentInboxEvent: jest.Mock };
  let webhooks: { emitToConnection: jest.Mock };

  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    socialProfileRepo = mockRepo();
    connectionRepo = mockRepo();
    aiProfileRepo = mockRepo();
    requestRepo = mockRepo();
    preferenceRepo = mockRepo();
    matchCandidateRepo = mockRepo();
    socialRequestCandidateRepo = mockRepo();
    sessionRepo = mockRepo();
    profileMatch = { runOnce: jest.fn() };
    matchService = { runMatch: jest.fn() };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    messages = { createAgentInboxEvent: jest.fn().mockResolvedValue({}) };
    webhooks = { emitToConnection: jest.fn().mockResolvedValue({ delivered: true }) };

    socialProfileRepo.find.mockResolvedValue([]);
    aiProfileRepo.createQueryBuilder.mockReturnValue(qbReturning([]));
    requestRepo.createQueryBuilder.mockReturnValue(qbReturning([]));
    requestRepo.find.mockResolvedValue([]);
    preferenceRepo.createQueryBuilder.mockReturnValue(qbReturning([]));
    matchCandidateRepo.find.mockResolvedValue([]);
    socialRequestCandidateRepo.find.mockResolvedValue([]);
    sessionRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileMatchAutopilotService,
        {
          provide: getRepositoryToken(UserSocialProfile),
          useValue: socialProfileRepo,
        },
        {
          provide: getRepositoryToken(AgentConnection),
          useValue: connectionRepo,
        },
        {
          provide: getRepositoryToken(AiDelegateProfile),
          useValue: aiProfileRepo,
        },
        {
          provide: getRepositoryToken(UserSocialRequest),
          useValue: requestRepo,
        },
        {
          provide: getRepositoryToken(UserPreference),
          useValue: preferenceRepo,
        },
        {
          provide: getRepositoryToken(MatchCandidate),
          useValue: matchCandidateRepo,
        },
        {
          provide: getRepositoryToken(SocialRequestCandidate),
          useValue: socialRequestCandidateRepo,
        },
        {
          provide: getRepositoryToken(AiMatchSession),
          useValue: sessionRepo,
        },
        { provide: ProfileMatchService, useValue: profileMatch },
        { provide: MatchService, useValue: matchService },
        { provide: NotificationsService, useValue: notifications },
        { provide: MessagesService, useValue: messages },
        { provide: AgentWebhookService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(ProfileMatchAutopilotService);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('cron does nothing when ENABLE_PROFILE_MATCH_AUTOPILOT is not set', async () => {
    delete process.env.ENABLE_PROFILE_MATCH_AUTOPILOT;
    await service.onCron();
    expect(profileMatch.runOnce).not.toHaveBeenCalled();
  });

  it('runs for website users even without an active agent connection', async () => {
    socialProfileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([
        { userId: 1 },
        { userId: 2 },
      ]),
    );
    connectionRepo.find.mockResolvedValue([
      { userId: 2, status: ConnectionStatus.Active },
    ]);
    profileMatch.runOnce.mockResolvedValue({
      ok: true,
      matchedCount: 1,
      recommendations: [],
    });

    const summary = await service.runOnce('manual');

    expect(profileMatch.runOnce).toHaveBeenCalledTimes(2);
    expect(profileMatch.runOnce).toHaveBeenCalledWith(1, expect.any(Number));
    expect(profileMatch.runOnce).toHaveBeenCalledWith(2, expect.any(Number));
    expect(summary).toMatchObject({
      triggeredBy: 'manual',
      skipped: false,
      scannedProfiles: 2,
      generatedRecommendations: 2,
      inboxEvents: 0,
      skippedDuplicates: 0,
      errors: 0,
    });
  });

  it('aggregates per-owner recommendation counts and survives per-owner errors', async () => {
    socialProfileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([{ userId: 1 }, { userId: 2 }, { userId: 3 }]),
    );
    connectionRepo.find.mockResolvedValue([
      { userId: 1, status: ConnectionStatus.Active },
      { userId: 2, status: ConnectionStatus.Active },
      { userId: 3, status: ConnectionStatus.Active },
    ]);
    profileMatch.runOnce
      .mockResolvedValueOnce({ ok: true, matchedCount: 2, recommendations: [] })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true, matchedCount: 0, recommendations: [] });

    const summary = await service.runOnce('cron');

    expect(profileMatch.runOnce).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      triggeredBy: 'cron',
      skipped: false,
      scannedProfiles: 3,
      generatedRecommendations: 2,
      errors: 1,
    });
  });

  it('returns skipped summary when a sweep is already running', async () => {
    socialProfileRepo.createQueryBuilder.mockReturnValue(qbReturning([]));
    connectionRepo.find.mockResolvedValue([]);

    // Manually flip the running flag to simulate concurrent invocation.
    (service as unknown as { running: boolean }).running = true;

    const summary = await service.runOnce('manual');

    expect(summary.skipped).toBe(true);
    expect(summary.reason).toBe('already_running');
    expect(profileMatch.runOnce).not.toHaveBeenCalled();

    (service as unknown as { running: boolean }).running = false;
  });

  it('respects PROFILE_MATCH_AUTOPILOT_PER_OWNER_LIMIT env override (capped at 10)', async () => {
    process.env.PROFILE_MATCH_AUTOPILOT_PER_OWNER_LIMIT = '50';
    socialProfileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([{ userId: 7 }]),
    );
    connectionRepo.find.mockResolvedValue([
      { userId: 7, status: ConnectionStatus.Active },
    ]);
    profileMatch.runOnce.mockResolvedValue({
      ok: true,
      matchedCount: 0,
      recommendations: [],
    });

    await service.runOnce('manual');

    expect(profileMatch.runOnce).toHaveBeenCalledWith(7, 10);
  });

  it('runs request-card matches and notifies both sides through the subconscious loop', async () => {
    socialProfileRepo.createQueryBuilder.mockReturnValue(
      qbReturning([{ userId: 7 }]),
    );
    connectionRepo.find.mockResolvedValue([
      { id: 99, userId: 7, status: ConnectionStatus.Active },
    ]);
    profileMatch.runOnce.mockResolvedValue({
      ok: true,
      matchedCount: 0,
      recommendations: [],
    });
    requestRepo.find.mockResolvedValue([
      {
        id: 55,
        userId: 7,
        agentAllowed: true,
        status: UserSocialRequestStatus.Matching,
        title: 'Weekend run',
        activityType: 'running',
      },
    ]);
    socialRequestCandidateRepo.find.mockResolvedValue([]);
    matchService.runMatch.mockResolvedValue({
      socialRequestId: 55,
      candidates: [
        {
          userId: 8,
          nickname: 'Candidate',
          avatar: 'C',
          color: '#16C784',
          score: 88,
          level: 'high',
          distanceKm: null,
          commonTags: ['running'],
          reasons: [],
          scoreBreakdown: {},
          risk: { level: 'low', warnings: [] },
          suggestedMessage: '',
          candidateRecordId: 501,
        },
      ],
    });

    const summary = await service.runOnce('manual');

    expect(matchService.runMatch).toHaveBeenCalledWith(55, 7, {
      limit: expect.any(Number),
    });
    expect(messages.createAgentInboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConnectionId: 99,
        ownerUserId: 7,
        eventType: 'social_request.match.recommended',
        requestId: 55,
      }),
    );
    expect(webhooks.emitToConnection).toHaveBeenCalledWith(
      99,
      'social_request.match.recommended',
      expect.objectContaining({ socialRequestId: 55 }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, type: 'subconscious_loop.request_match' }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 8, type: 'subconscious_loop.request_match' }),
    );
    expect(summary.generatedRequestCandidates).toBe(1);
    expect(summary.inboxEvents).toBe(1);
  });
});
