import { validate } from 'class-validator';

import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  it('accepts local development upload URLs for avatar smoke tests', async () => {
    const dto = new UpdateProfileDto();
    dto.avatar = 'http://localhost:3000/uploads/app-smoke.webp';

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects avatar values that are not absolute URLs', async () => {
    const dto = new UpdateProfileDto();
    dto.avatar = '/uploads/app-smoke.webp';

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'avatar' })]),
    );
  });
});
