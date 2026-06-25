import { validate } from 'class-validator';

import { UpdateProfilePrivacyDto } from './update-ai-profile-privacy.dto';

describe('UpdateProfilePrivacyDto', () => {
  it('accepts explicit matching authorization confirmations under the global whitelist policy', async () => {
    const dto = Object.assign(new UpdateProfilePrivacyDto(), {
      profileDiscoverable: true,
      agentCanRecommendMe: true,
      agentCanStartChatAfterApproval: false,
      ownerConfirmed: true,
      matchingConsent: true,
      profileVisibilityConsent: true,
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });
});
