import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiMatchService } from './ai-match.service';
import { AiDelegateProfile } from './ai-delegate-profile.entity';
import { AiMatchSession } from './ai-match-session.entity';
import { FriendsService } from '../friends/friends.service';
import { MessagesService } from '../messages/messages.service';

const mockRepo = () => ({
  count: jest.fn(),
  create: jest.fn((data) => data),
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn((data) => ({
    ...data,
    id: data.id ?? 100,
    createdAt: data.createdAt ?? new Date('2026-05-03T10:00:00Z'),
  })),
});

const profile = (
  id: number,
  overrides: Partial<AiDelegateProfile> = {},
): AiDelegateProfile =>
  ({
    id,
    userId: id,
    enabled: true,
    privacyConsent: true,
    autoChatEnabled: true,
    dailyAutoChatLimit: 3,
    preferredName: `AI ${id}`,
    city: '上海',
    favoriteSports: ['跑步', '健身'],
    interests: '自律 早起 咖啡',
    workExperience: '互联网 产品',
    idealPartner: '稳定 真诚',
    trainingGoals: '每周三次训练',
    boundaries: '公开场地',
    availability: '周末上午',
    user: {
      id,
      name: `User ${id}`,
      avatar: `U${id}`,
      color: '#16C784',
    },
    ...overrides,
  }) as AiDelegateProfile;

describe('AiMatchService autopilot', () => {
  let service: AiMatchService;
  let profileRepo: ReturnType<typeof mockRepo>;
  let sessionRepo: ReturnType<typeof mockRepo>;
  let friendsService: { ensureFollowing: jest.Mock };
  let messagesService: {
    startConversation: jest.Mock;
    sendMessage: jest.Mock;
  };

  beforeEach(async () => {
    profileRepo = mockRepo();
    sessionRepo = mockRepo();
    friendsService = { ensureFollowing: jest.fn() };
    messagesService = {
      startConversation: jest
        .fn()
        .mockResolvedValue({ conversationId: 'conv-1' }),
      sendMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiMatchService,
        {
          provide: getRepositoryToken(AiDelegateProfile),
          useValue: profileRepo,
        },
        { provide: getRepositoryToken(AiMatchSession), useValue: sessionRepo },
        { provide: FriendsService, useValue: friendsService },
        { provide: MessagesService, useValue: messagesService },
      ],
    }).compile();

    service = module.get(AiMatchService);
  });

  it('rejects autopilot when the owner has not enabled automatic chat', async () => {
    profileRepo.findOne.mockResolvedValue(
      profile(1, { autoChatEnabled: false }),
    );

    await expect(service.runAutopilot(1)).rejects.toThrow(
      '请先开启 AI 自动关注和站内代聊。',
    );
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });

  it('only contacts targets that also enabled automatic AI chat', async () => {
    profileRepo.findOne.mockResolvedValue(profile(1));
    sessionRepo.count.mockResolvedValue(0);
    profileRepo.find.mockResolvedValue([
      profile(2, { autoChatEnabled: false }),
    ]);

    const result = await service.runAutopilot(1);

    expect(result.contacted).toHaveLength(0);
    expect(friendsService.ensureFollowing).not.toHaveBeenCalled();
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });

  it('does not contact low scoring candidates', async () => {
    profileRepo.findOne.mockResolvedValue(profile(1));
    sessionRepo.count.mockResolvedValue(0);
    profileRepo.find.mockResolvedValue([
      profile(2, {
        city: '北京',
        favoriteSports: ['游泳'],
        interests: '摄影',
        workExperience: '金融',
        idealPartner: '随缘',
        trainingGoals: '偶尔活动',
        availability: '工作日晚上',
      }),
    ]);

    const result = await service.runAutopilot(1);

    expect(result.contacted).toHaveLength(0);
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });

  it('auto follows, starts a conversation, and sends an AI contact card for a strong match', async () => {
    profileRepo.findOne.mockResolvedValue(profile(1));
    sessionRepo.count.mockResolvedValue(0);
    sessionRepo.findOne.mockResolvedValue(null);
    profileRepo.find.mockResolvedValue([profile(2)]);

    const result = await service.runAutopilot(1);

    expect(result.contacted).toHaveLength(1);
    expect(friendsService.ensureFollowing).toHaveBeenCalledWith(1, 2);
    expect(messagesService.startConversation).toHaveBeenCalledWith(1, 2);
    expect(messagesService.sendMessage).toHaveBeenCalledWith(
      'conv-1',
      1,
      expect.stringContaining('由我的 FitMeet AI 托管代发'),
      expect.objectContaining({
        source: 'ai_delegate',
        card: expect.objectContaining({
          type: 'fitmeet_contact_card',
          profileUrl: '/user/1',
        }),
      }),
    );
  });

  it('respects the daily automatic contact limit', async () => {
    profileRepo.findOne.mockResolvedValue(
      profile(1, { dailyAutoChatLimit: 1 }),
    );
    sessionRepo.count.mockResolvedValue(1);

    const result = await service.runAutopilot(1);

    expect(result.remaining).toBe(0);
    expect(result.contacted).toHaveLength(0);
    expect(profileRepo.find).not.toHaveBeenCalled();
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });

  it('does not repeat an existing autopilot contact', async () => {
    profileRepo.findOne.mockResolvedValue(profile(1));
    sessionRepo.count.mockResolvedValue(0);
    sessionRepo.findOne.mockResolvedValue({ id: 9 });
    profileRepo.find.mockResolvedValue([profile(2)]);

    const result = await service.runAutopilot(1);

    expect(result.contacted).toHaveLength(0);
    expect(result.skipped[0]).toContain('已由 AI 联系过');
    expect(messagesService.sendMessage).not.toHaveBeenCalled();
  });
});
