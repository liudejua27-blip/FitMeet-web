import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AIService } from '../ai/ai.service';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { User } from './user.entity';
import { SocialProfileService } from './social-profile.service';
import { UserSocialProfile } from './user-social-profile.entity';
import { ProfileUpdateProposal } from './profile-update-proposal.entity';

const mockRepo = () => ({
  create: jest.fn((data) => data),
  findOne: jest.fn(),
  save: jest.fn((data) => data),
});

const profileCard = (
  visibility = {
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: true,
  },
) => ({
  basic: {
    nickname: 'Nova',
    city: 'Shanghai',
    ageRange: '25-34',
    gender: '',
    zodiac: '',
  },
  personality: {
    mbti: '',
    traits: [],
    socialStyle: '',
    communicationStyle: '',
  },
  interests: { sports: ['running'], lifestyle: [], socialScenes: [] },
  preferences: {
    wantToMeet: ['runner'],
    preferredTraits: [],
    avoid: [],
  },
  relationshipIntent: { goals: [], openness: '' },
  availability: { weekdays: '', weekends: '' },
  visibility,
  matchSignals: {
    publicTags: ['running'],
    privatePreferenceTags: [],
    sensitivePrivateTags: [],
    matchKeywords: ['running'],
    confidence: 0.5,
    source: 'fallback',
  },
  summary: '',
});

describe('SocialProfileService', () => {
  let service: SocialProfileService;
  let profileRepo: ReturnType<typeof mockRepo>;
  let proposalRepo: ReturnType<typeof mockRepo>;
  let delegateRepo: ReturnType<typeof mockRepo>;
  let aiService: jest.Mocked<Pick<AIService, 'generateProfileQuestions'>>;

  beforeEach(async () => {
    profileRepo = mockRepo();
    proposalRepo = mockRepo();
    delegateRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialProfileService,
        {
          provide: getRepositoryToken(UserSocialProfile),
          useValue: profileRepo,
        },
        {
          provide: getRepositoryToken(ProfileUpdateProposal),
          useValue: proposalRepo,
        },
        {
          provide: getRepositoryToken(AiDelegateProfile),
          useValue: delegateRepo,
        },
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
    aiService = module.get(AIService);
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
      ownerConfirmed: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
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

  it('requires explicit owner authorization before AI draft enters matching pool', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue(null);

    await expect(
      service.saveAiDraft(1, {
        enableMatching: true,
        profile: {
          basic: {
            nickname: 'Nova',
            city: 'Shanghai',
            ageRange: '25-34',
            gender: '',
            zodiac: '',
          },
          personality: {
            mbti: '',
            traits: [],
            socialStyle: '',
            communicationStyle: '',
          },
          interests: { sports: ['running'], lifestyle: [], socialScenes: [] },
          preferences: {
            wantToMeet: ['runner'],
            preferredTraits: [],
            avoid: [],
          },
          relationshipIntent: { goals: [], openness: '' },
          availability: { weekdays: '', weekends: '' },
          visibility: {
            profileDiscoverable: true,
            agentCanRecommendMe: true,
            agentCanStartChatAfterApproval: false,
          },
          matchSignals: {
            publicTags: ['running'],
            privatePreferenceTags: [],
            sensitivePrivateTags: [],
            matchKeywords: ['running'],
            confidence: 0.5,
            source: 'fallback',
          },
          summary: '',
        },
      }),
    ).rejects.toThrow(
      'Enabling AI profile matching requires explicit owner confirmation.',
    );
  });

  it('saves an AI draft without enabling matching by default', async () => {
    profileRepo.findOne.mockResolvedValue(null);
    delegateRepo.findOne.mockResolvedValue(null);

    const result = await service.saveAiDraft(1, {
      profile: profileCard(),
    });

    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profileDiscoverable: false,
        agentCanRecommendMe: false,
        agentCanStartChatAfterApproval: false,
      }),
    );
    expect(result.matchingEnabled).toBe(false);
  });

  it('applies a persisted profile update proposal with optimistic version', async () => {
    const proposal = {
      proposalId: 10,
      userId: 1,
      baseProfileVersion: 2,
      proposedFields: {
        nickname: 'Nova',
        city: 'Shanghai',
        fitnessGoals: ['running'],
      },
      draft: profileCard(),
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      appliedAt: null,
      rejectedAt: null,
    };
    proposalRepo.findOne.mockResolvedValue(proposal);
    profileRepo.findOne.mockResolvedValue({
      ...({} as UserSocialProfile),
      userId: 1,
      profileVersion: 2,
      profileDiscoverable: false,
      agentCanRecommendMe: false,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      sensitiveTagDecisions: {},
      matchSignals: {},
    });
    delegateRepo.findOne.mockResolvedValue(null);

    await service.saveAiDraft(1, {
      proposalId: 10,
      expectedProfileVersion: 2,
      profile: profileCard(),
    });

    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        nickname: 'Nova',
        city: 'Shanghai',
        fitnessGoals: ['running'],
        profileVersion: 3,
        profileDiscoverable: false,
        agentCanRecommendMe: false,
      }),
    );
    expect(proposalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: 10,
        status: 'applied',
        appliedAt: expect.any(Date),
      }),
    );
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
    expect(aiService.generateProfileQuestions).not.toHaveBeenCalled();
  });

  it('returns weighted completion, readiness, and authorization state', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      profileVersion: 1,
      nickname: 'Nova',
      gender: 'female',
      ageRange: '25-34',
      city: 'Qingdao',
      mbti: 'ENFP',
      traits: ['easygoing'],
      socialStyle: 'low pressure',
      communicationStyle: 'friendly',
      nearbyArea: 'Shinan',
      fitnessGoals: ['running'],
      interestTags: ['running'],
      lifestyleTags: ['coffee'],
      wantToMeet: ['runner'],
      preferredTraits: ['punctual'],
      avoidTraits: ['pushy'],
      relationshipGoals: ['workout partner'],
      availableTimes: ['evening'],
      socialPreference: '',
      rejectRules: 'no private places',
      privacyBoundary: 'no phone or WeChat before trust',
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      aiSummary: '',
      aiProfileCard: {},
      matchSignals: {},
      sensitiveTagDecisions: {},
      openness: '',
      zodiac: '',
      socialScenes: [],
      weekdayAvailability: '',
      weekendAvailability: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserSocialProfile);

    const completion = await service.getCompletion(1);

    expect(completion.percent).toBeGreaterThanOrEqual(80);
    expect(completion.readinessLevel).toBe('agent_ready');
    expect(completion.canEnterMatchPool).toBe(true);
    expect(completion.authorization.matchPoolEnabled).toBe(true);
    expect(completion.sections.length).toBeGreaterThan(0);
  });

  it('does not block matching on optional age range or gender gaps', async () => {
    profileRepo.findOne.mockResolvedValue({
      userId: 1,
      profileVersion: 1,
      nickname: 'Nova',
      gender: '',
      ageRange: '',
      city: '青岛',
      mbti: '',
      traits: [],
      socialStyle: '',
      communicationStyle: '',
      nearbyArea: '',
      fitnessGoals: ['羽毛球'],
      interestTags: [],
      lifestyleTags: [],
      wantToMeet: ['运动伙伴'],
      preferredTraits: [],
      avoidTraits: [],
      primaryPurpose: '',
      relationshipGoals: [],
      availableTimes: ['晚上'],
      defaultMatchRadiusKm: null,
      socialPreference: '',
      rejectRules: '',
      privacyBoundary: '公共场所，先站内聊',
      profileDiscoverable: true,
      agentCanRecommendMe: false,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      aiSummary: '',
      aiProfileCard: {},
      matchSignals: {},
      sensitiveTagDecisions: {},
      openness: '',
      zodiac: '',
      socialScenes: [],
      weekdayAvailability: '',
      weekendAvailability: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserSocialProfile);

    const completion = await service.getCompletion(1);

    expect(completion.canEnterMatchPool).toBe(true);
    expect(completion.missingRequired).toEqual([]);
    expect(completion.missingOptional).toEqual(
      expect.arrayContaining(['ageRange', 'gender']),
    );
    expect(completion.missingFields).not.toEqual(
      expect.arrayContaining(['ageRange', 'gender']),
    );
    expect(completion.questionQueue).not.toEqual(
      expect.arrayContaining(['ageRange', 'gender']),
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
