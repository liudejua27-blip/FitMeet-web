import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AIService } from '../ai/ai.service';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { User } from './user.entity';
import { SocialProfileService } from './social-profile.service';
import { UserSocialProfile } from './user-social-profile.entity';

const mockRepo = () => ({
  create: jest.fn((data) => data),
  findOne: jest.fn(),
  save: jest.fn((data) => data),
});

describe('SocialProfileService', () => {
  let service: SocialProfileService;
  let profileRepo: ReturnType<typeof mockRepo>;
  let delegateRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    profileRepo = mockRepo();
    delegateRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialProfileService,
        { provide: getRepositoryToken(UserSocialProfile), useValue: profileRepo },
        { provide: getRepositoryToken(AiDelegateProfile), useValue: delegateRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        {
          provide: AIService,
          useValue: {
            generateProfileBuilderCard: jest.fn(),
            isLlmEnabled: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    service = module.get(SocialProfileService);
  });

  it('persists visibility, AI card, and match signals instead of dropping them', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue({
      userId: 1,
      enabled: true,
      privacyConsent: true,
      autoChatEnabled: true,
    });

    await service.upsert(1, {
      nickname: 'Nova',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: true,
      aiSummary: 'Good fit for thoughtful training partners.',
      aiProfileCard: { basic: { nickname: 'Nova' } },
      matchSignals: {
        publicTags: ['running'],
        privatePreferenceTags: ['founder'],
        sensitivePrivateTags: ['rich'],
        matchKeywords: ['running', 'founder', 'rich'],
      },
    });

    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profileDiscoverable: true,
        agentCanRecommendMe: true,
        agentCanStartChatAfterApproval: true,
        aiSummary: 'Good fit for thoughtful training partners.',
        aiProfileCard: { basic: { nickname: 'Nova' } },
        matchSignals: expect.objectContaining({
          sensitivePrivateTags: ['rich'],
        }),
      }),
    );
    expect(delegateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        privacyConsent: true,
      }),
    );
  });

  it('disables the delegate projection when profile matching consent is removed', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue({
      userId: 1,
      enabled: true,
      privacyConsent: true,
      autoChatEnabled: true,
    });

    await service.upsert(1, {
      profileDiscoverable: false,
      agentCanRecommendMe: false,
    });

    expect(delegateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        privacyConsent: false,
        autoChatEnabled: false,
      }),
    );
  });
});
