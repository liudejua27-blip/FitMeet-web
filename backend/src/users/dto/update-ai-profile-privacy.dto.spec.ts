import { validate } from 'class-validator';

import { UpdateProfilePrivacyDto } from './update-ai-profile-privacy.dto';

describe('UpdateProfilePrivacyDto', () => {
  it('accepts explicit matching authorization confirmations under the global whitelist policy', async () => {
    const dto = Object.assign(new UpdateProfilePrivacyDto(), {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      candidateDisplayMode: 'anonymous_until_confirmed',
      candidateAvatarVisibility: 'hidden_until_confirmed',
      candidateCoarseArea: '青岛市南区',
      contactDisclosurePolicy: 'in_app_after_match',
      preciseLocationPolicy: 'coarse_only',
      strangerOpenerPolicy: 'opener_requires_confirmation',
      strangerInvitePolicy: 'invite_requires_confirmation',
      strangerFriendPolicy: 'friend_requires_confirmation',
      ownerConfirmed: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });
});
