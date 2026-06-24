import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AIService } from '../ai/ai.service';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { User } from './user.entity';
import { SocialProfileService } from './social-profile.service';
import { UserSocialProfile } from './user-social-profile.entity';
import { ProfileUpdateProposal } from './profile-update-proposal.entity';

/**
 * Privacy / sensitive-tag invariants for SocialProfileService.
 *
 * The five invariants exercised here mirror the privacy spec:
 *   1. sensitive private tags must not appear in the public view
 *   2. agent public read must not leak sensitive private tags
 *   3. an unconfirmed wealth/income tag must NOT participate in matching
 *   4. private_match tags must not be exposed in the public view
 *   5. when profileDiscoverable=false the user must stay out of the pool
 */

const makeRepo = () => ({
  create: jest.fn((data) => data),
  findOne: jest.fn(),
  save: jest.fn((data) => data),
  find: jest.fn(),
});

const baseProfile = (
  overrides: Partial<UserSocialProfile> = {},
): UserSocialProfile =>
  ({
    userId: 1,
    nickname: 'Nova',
    gender: '',
    ageRange: '',
    city: 'Beijing',
    nearbyArea: '',
    mbti: '',
    zodiac: '',
    traits: [],
    socialStyle: '',
    communicationStyle: '',
    interestTags: ['running'],
    lifestyleTags: [],
    socialScenes: [],
    fitnessGoals: [],
    wantToMeet: [],
    preferredTraits: [],
    avoidTraits: [],
    relationshipGoals: [],
    availableTimes: [],
    weekdayAvailability: '',
    weekendAvailability: '',
    socialPreference: '',
    rejectRules: '',
    privacyBoundary: '',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    profileVersion: 1,
    aiSummary: '',
    aiProfileCard: {},
    matchSignals: {
      publicTags: ['running', 'photography'],
      privatePreferenceTags: ['want_to_meet:founder'],
      sensitivePrivateTags: ['有钱', 'handsome'],
      matchKeywords: [],
      confidence: 0.7,
      source: 'test',
    },
    sensitiveTagDecisions: {},
    openness: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as UserSocialProfile;

describe('SocialProfileService — privacy & sensitive tags', () => {
  let service: SocialProfileService;
  let profileRepo: ReturnType<typeof makeRepo>;
  let delegateRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    profileRepo = makeRepo();
    delegateRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialProfileService,
        {
          provide: getRepositoryToken(UserSocialProfile),
          useValue: profileRepo,
        },
        {
          provide: getRepositoryToken(AiDelegateProfile),
          useValue: delegateRepo,
        },
        {
          provide: getRepositoryToken(ProfileUpdateProposal),
          useValue: makeRepo(),
        },
        { provide: getRepositoryToken(User), useValue: makeRepo() },
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

  it('invariant 1: sensitive tags do not appear in public profile view', () => {
    const profile = baseProfile();
    const view = service.getPublicView(profile);
    const flat = JSON.stringify(view);
    expect(flat).not.toMatch(/有钱/);
    expect(flat).not.toMatch(/handsome/);
    expect(view.matchSignals).toBeDefined();
    expect(view.matchSignals).not.toHaveProperty('sensitivePrivateTags');
    expect(view.matchSignals).not.toHaveProperty('privatePreferenceTags');
  });

  it('invariant 2: agent public read does not leak sensitive_private tags', () => {
    const profile = baseProfile();
    const agentView = service.getAgentPublicView(profile);
    const flat = JSON.stringify(agentView);
    expect(flat).not.toMatch(/有钱/);
    expect(flat).not.toMatch(/handsome/);
    expect(agentView.matchSignals).not.toHaveProperty('sensitivePrivateTags');
  });

  it('invariant 3: unconfirmed wealth tag never participates in matching', () => {
    const profile = baseProfile({ sensitiveTagDecisions: {} });
    const match = service.getMatchView(profile);
    expect(match.confirmedSensitiveTags).toEqual([]);
    expect(match.publicTags).not.toContain('有钱');
    expect(match.privateMatchTags).not.toContain('有钱');

    const confirmed = baseProfile({
      sensitiveTagDecisions: {
        有钱: { status: 'confirmed', category: 'wealth' },
        handsome: { status: 'rejected', category: 'looks' },
      },
    });
    const match2 = service.getMatchView(confirmed);
    expect(match2.confirmedSensitiveTags).toEqual(['有钱']);
    expect(match2.confirmedSensitiveTags).not.toContain('handsome');
  });

  it('invariant 4: private_match-only tags are not exposed in public view', () => {
    const profile = baseProfile();
    const view = service.getPublicView(profile);
    const flat = JSON.stringify(view);
    expect(flat).not.toMatch(/want_to_meet:founder/);
  });

  it('invariant 5: discoverable=false keeps the user out of the pool', async () => {
    profileRepo.findOne.mockResolvedValue({
      ...baseProfile({
        profileDiscoverable: false,
        agentCanRecommendMe: false,
      }),
    });

    const privacy = await service.getPrivacy(1);
    expect(privacy.profileDiscoverable).toBe(false);
    expect(privacy.agentCanRecommendMe).toBe(false);
    expect(privacy.matchPoolEnabled).toBe(false);

    await service.updatePrivacy(1, {
      profileDiscoverable: false,
      agentCanRecommendMe: false,
    });

    expect(delegateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, privacyConsent: false }),
    );
  });

  it('requires explicit owner confirmation when enabling privacy switches', async () => {
    profileRepo.findOne.mockResolvedValue(
      baseProfile({ profileDiscoverable: false, agentCanRecommendMe: false }),
    );

    await expect(
      service.updatePrivacy(1, { profileDiscoverable: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'profile_visibility_owner_confirmation_required',
      }),
    });

    await service.updatePrivacy(1, {
      profileDiscoverable: true,
      ownerConfirmed: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
    });

    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ profileDiscoverable: true }),
    );
  });

  it('seeds pending decisions for new sensitive tags after upsert', async () => {
    profileRepo.findOne.mockResolvedValue(null);

    await service.upsert(1, {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      matchSignals: {
        publicTags: ['running'],
        privatePreferenceTags: [],
        sensitivePrivateTags: ['有钱', 'handsome'],
      },
    });

    const calls = profileRepo.save.mock.calls;
    const lastSaved = calls[calls.length - 1][0];
    expect(lastSaved.sensitiveTagDecisions['有钱']).toEqual(
      expect.objectContaining({ status: 'pending', category: 'wealth' }),
    );
    expect(lastSaved.sensitiveTagDecisions['handsome']).toEqual(
      expect.objectContaining({ status: 'pending', category: 'looks' }),
    );
  });

  it('confirm/reject endpoints flip a single tag without touching others', async () => {
    profileRepo.findOne.mockResolvedValue(
      baseProfile({
        sensitiveTagDecisions: {
          有钱: { status: 'pending', category: 'wealth' },
          handsome: { status: 'pending', category: 'looks' },
        },
      }),
    );

    const confirmed = await service.confirmSensitiveTag(1, '有钱');
    expect(confirmed.ok).toBe(true);
    const lastSavedConfirm =
      profileRepo.save.mock.calls[profileRepo.save.mock.calls.length - 1][0];
    expect(lastSavedConfirm.sensitiveTagDecisions['有钱'].status).toBe(
      'confirmed',
    );
    expect(lastSavedConfirm.sensitiveTagDecisions['handsome'].status).toBe(
      'pending',
    );

    const rejected = await service.rejectSensitiveTag(1, 'handsome');
    expect(rejected.ok).toBe(true);
    const lastSavedReject =
      profileRepo.save.mock.calls[profileRepo.save.mock.calls.length - 1][0];
    expect(lastSavedReject.sensitiveTagDecisions['handsome'].status).toBe(
      'rejected',
    );
  });

  it('hard-blocks identifier-like tags from ever being matchable', () => {
    expect(service.classifyTag('13800000000')).toBe('unavailable');
    expect(service.classifyTag('110105199001011234')).toBe('unavailable');
    expect(service.classifyTag('朝阳区幸福里小区5号楼3单元')).toBe(
      'unavailable',
    );
  });
});
