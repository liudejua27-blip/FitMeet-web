import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from './entities/social-request.entity';
import { serializePublicSocialIntent } from './public-social-intent.presenter';

function makeIntent(
  overrides: Partial<PublicSocialIntent> = {},
): PublicSocialIntent {
  const now = new Date('2026-06-07T10:00:00.000Z');
  return {
    id: 'public-intent-1',
    userId: null,
    linkedSocialRequestId: null,
    source: 'public_intent',
    mode: 'public',
    requestType: 'fitness_partner',
    title: '寻找附近约练搭子',
    description: '周末一起练腿和拉伸',
    interestTags: undefined as unknown as string[],
    city: 'Shanghai',
    loc: '徐汇',
    lat: 31.2,
    lng: 121.4,
    radiusKm: 5,
    timePreference: '周末 morning',
    locationPreference: 'nearby gym',
    socialGoal: 'fitness_partner',
    riskLevel: SocialRequestRiskLevel.Low,
    requiresUserConfirmation: true,
    filters: { verifiedOnly: true },
    candidateUserIds: [101, 102],
    matchedCount: 2,
    status: SocialRequestStatus.Active,
    metadata: {
      matchSignal: {
        score: 82,
        confidence: 'high',
        source: 'deterministic_fallback',
        reasons: ['已有候选'],
        updatedAt: now.toISOString(),
      },
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PublicSocialIntent;
}

describe('serializePublicSocialIntent', () => {
  it('preserves the public intent response contract', () => {
    const createdAt = new Date('2026-06-07T10:00:00.000Z');
    const intent = makeIntent({ createdAt, updatedAt: createdAt });

    expect(serializePublicSocialIntent(intent)).toEqual({
      id: 'public-intent-1',
      userId: null,
      linkedSocialRequestId: null,
      source: 'public_intent',
      mode: 'public',
      requestType: 'fitness_partner',
      title: '寻找附近约练搭子',
      description: '周末一起练腿和拉伸',
      interestTags: [],
      city: 'Shanghai',
      loc: '徐汇',
      lat: 31.2,
      lng: 121.4,
      radiusKm: 5,
      timePreference: '周末 morning',
      locationPreference: 'nearby gym',
      socialGoal: 'fitness_partner',
      riskLevel: SocialRequestRiskLevel.Low,
      requiresUserConfirmation: true,
      filters: { verifiedOnly: true },
      candidateUserIds: [101, 102],
      matchedCount: 2,
      matchSignal: {
        score: 82,
        confidence: 'high',
        source: 'deterministic_fallback',
        reasons: ['已有候选'],
        updatedAt: createdAt.toISOString(),
      },
      status: SocialRequestStatus.Active,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('builds a deterministic match signal when metadata does not include one', () => {
    const response = serializePublicSocialIntent(
      makeIntent({ metadata: {}, matchedCount: 0 }),
    );

    expect(response.matchSignal).toEqual(
      expect.objectContaining({
        confidence: 'low',
        source: expect.any(String),
      }),
    );
  });
});
