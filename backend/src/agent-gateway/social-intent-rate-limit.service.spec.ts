import { SocialIntentRateLimitService } from './social-intent-rate-limit.service';

describe('SocialIntentRateLimitService', () => {
  it('returns a rate limit card when hourly public publish limit is reached', async () => {
    const repo = { count: jest.fn(async () => 5) };
    const service = new SocialIntentRateLimitService(repo as never);

    const result = await service.check(7);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(5);
    expect(service.buildRateLimitedCard({ taskId: 10, result })).toEqual(
      expect.objectContaining({
        schemaType: 'social_match.rate_limited',
        status: 'blocked',
      }),
    );
  });
});
