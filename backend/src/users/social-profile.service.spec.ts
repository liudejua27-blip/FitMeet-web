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
            generateProfileQuestions: jest.fn().mockResolvedValue([]),
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

  it('confirms sensitive private tags when saving an owner-confirmed AI draft', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue(null);

    const result = await service.saveAiDraft(1, {
      enableMatching: true,
      sensitiveTagsConfirmed: true,
      profile: {
        basic: {
          nickname: 'Nova',
          city: 'Shanghai',
          ageRange: '25-34',
          gender: '',
          zodiac: '',
        },
        personality: {
          mbti: 'ENTJ',
          traits: ['focused'],
          socialStyle: 'direct',
          communicationStyle: 'clear',
        },
        interests: {
          sports: ['running'],
          lifestyle: ['startup'],
          socialScenes: ['coffee'],
        },
        preferences: {
          wantToMeet: ['founder'],
          preferredTraits: ['business_builder'],
          avoid: [],
        },
        relationshipIntent: { goals: ['networking'], openness: 'medium' },
        availability: { weekdays: 'evening', weekends: 'afternoon' },
        visibility: {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          agentCanStartChatAfterApproval: false,
        },
        matchSignals: {
          publicTags: ['running'],
          privatePreferenceTags: ['founder'],
          sensitivePrivateTags: ['rich'],
          matchKeywords: ['running', 'founder', 'rich'],
          confidence: 0.8,
          source: 'deepseek',
        },
        summary: 'A focused runner.',
      },
    });

    expect(result.profile.sensitiveTagDecisions.rich).toMatchObject({
      status: 'confirmed',
      category: 'wealth',
    });
    expect(result.matchingEnabled).toBe(true);
  });

  it('keeps a saved AI draft out of the matching pool when enableMatching is false', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue(null);

    const result = await service.saveAiDraft(1, {
      enableMatching: false,
      profile: {
        basic: {
          nickname: 'Nova',
          city: 'Shanghai',
          ageRange: '',
          gender: '',
          zodiac: '',
        },
        personality: {
          mbti: '',
          traits: [],
          socialStyle: '',
          communicationStyle: '',
        },
        interests: { sports: [], lifestyle: [], socialScenes: [] },
        preferences: { wantToMeet: [], preferredTraits: [], avoid: [] },
        relationshipIntent: { goals: [], openness: '' },
        availability: { weekdays: '', weekends: '' },
        visibility: {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          agentCanStartChatAfterApproval: true,
        },
        matchSignals: {
          publicTags: [],
          privatePreferenceTags: [],
          sensitivePrivateTags: [],
          matchKeywords: [],
          confidence: 0.5,
          source: 'fallback',
        },
        summary: '',
      },
    });

    expect(result.profile).toMatchObject({
      profileDiscoverable: false,
      agentCanRecommendMe: false,
      agentCanStartChatAfterApproval: false,
    });
    expect(result.matchingEnabled).toBe(false);
  });

  it('returns interview questions with privacy metadata for profile building', async () => {
    profileRepo.findOne.mockResolvedValue(null);

    const result = await service.generateQuestions(1);

    expect(result.role).toBe('profile_interviewer');
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'wantToMeet',
          privacyTier: 'private_match',
          matchRole: 'match_preference',
        }),
        expect.objectContaining({
          key: 'privacyBoundary',
          privacyTier: 'sensitive_review',
          matchRole: 'safety_boundary',
        }),
      ]),
    );
  });

  it('maps interviewer aliases such as sports into canonical profile fields', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue(null);

    await service.saveAnswer(1, 'sports', 'running, yoga');

    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fitnessGoals: ['running', 'yoga'],
      }),
    );
  });
});
