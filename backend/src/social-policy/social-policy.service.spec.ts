import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserBlock } from '../safety/user-block.entity';
import { OnboardingService } from '../users/onboarding.service';
import { SocialPolicyService } from './social-policy.service';

describe('SocialPolicyService', () => {
  const onboarding = {
    getStatus: jest.fn(),
  };
  const blockRepo = {
    count: jest.fn(),
  };

  let service: SocialPolicyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    onboarding.getStatus.mockResolvedValue({
      status: 'ready',
      completion: { missing: [] },
    });
    blockRepo.count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        SocialPolicyService,
        { provide: OnboardingService, useValue: onboarding },
        { provide: getRepositoryToken(UserBlock), useValue: blockRepo },
      ],
    }).compile();
    service = module.get(SocialPolicyService);
  });

  it('denies public intent application when applicant profile is not ready', async () => {
    onboarding.getStatus.mockImplementation(async (userId: number) => ({
      status: userId === 10 ? 'incomplete' : 'ready',
      completion: { missing: userId === 10 ? ['CITY_REQUIRED'] : [] },
    }));

    const decision = await service.evaluatePublicIntentApplication({
      applicantUserId: 10,
      ownerUserId: 20,
      publicIntentId: 'intent-1',
      status: 'active',
      acceptedCount: 0,
      capacityMax: 1,
      applicationPolicy: 'approval_required',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('social_profile_not_ready');
    expect(decision.metadata).toMatchObject({ userId: 10 });
  });

  it('denies public intent application between blocked users', async () => {
    blockRepo.count.mockResolvedValue(1);

    const decision = await service.evaluatePublicIntentApplication({
      applicantUserId: 10,
      ownerUserId: 20,
      publicIntentId: 'intent-1',
      status: 'active',
      acceptedCount: 0,
      capacityMax: 1,
      applicationPolicy: 'approval_required',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('user_blocked');
  });

  it('requires owner approval for normal public intent application', async () => {
    const decision = await service.evaluatePublicIntentApplication({
      applicantUserId: 10,
      ownerUserId: 20,
      publicIntentId: 'intent-1',
      status: 'active',
      acceptedCount: 0,
      capacityMax: 2,
      applicationPolicy: 'approval_required',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.level).toBe('confirm');
    expect(decision.requiredConfirmations).toContain(
      'public_intent_owner_approval',
    );
  });

  it('denies owner resolution when actor is not the owner', async () => {
    const decision = await service.evaluateOwnerApplicationResolution({
      actorUserId: 99,
      ownerUserId: 20,
      applicantUserId: 10,
      applicationStatus: 'pending',
      resolution: 'accepted',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('owner_required');
  });

  it('detects public text privacy violations', () => {
    const decision = service.inspectPublicText({
      title: '五四广场散步',
      description: '微信 abcde12345，到了联系我',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('public_text_privacy_violation');
    expect(decision.fields).toContain('wechat');
  });
});
