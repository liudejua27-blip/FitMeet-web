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
    locale: 'zh-CN',
    countryCode: 'CN',
    timeZone: 'Asia/Shanghai',
    utcOffsetMinutes: 480,
    geoHash: 'wtw3sjq',
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
  it('returns only user-visible public intent fields', () => {
    const createdAt = new Date('2026-06-07T10:00:00.000Z');
    const intent = makeIntent({ createdAt, updatedAt: createdAt });

    expect(serializePublicSocialIntent(intent)).toEqual({
      id: 'public-intent-1',
      userId: null,
      requestType: 'fitness_partner',
      title: '寻找附近约练搭子',
      description: '周末一起练腿和拉伸',
      interestTags: [],
      city: 'Shanghai',
      locale: 'zh-CN',
      countryCode: 'CN',
      timeZone: 'Asia/Shanghai',
      utcOffsetMinutes: 480,
      geoHash: 'wtw3sjq',
      loc: '徐汇',
      radiusKm: 5,
      timePreference: '周末 morning',
      locationPreference: 'nearby gym',
      socialGoal: 'fitness_partner',
      matchedCount: 2,
      status: SocialRequestStatus.Active,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('does not expose internal sources, filters, candidate ids, location fixes, or match signals', () => {
    const response = serializePublicSocialIntent(makeIntent());

    expect(response).not.toHaveProperty('source');
    expect(response).not.toHaveProperty('filters');
    expect(response).not.toHaveProperty('candidateUserIds');
    expect(response).not.toHaveProperty('linkedSocialRequestId');
    expect(response).not.toHaveProperty('mode');
    expect(response).not.toHaveProperty('lat');
    expect(response).not.toHaveProperty('lng');
    expect(response).not.toHaveProperty('riskLevel');
    expect(response).not.toHaveProperty('requiresUserConfirmation');
    expect(response).not.toHaveProperty('matchSignal');
  });

  it('maps smoke fixture copy to user-facing public card copy', () => {
    const response = serializePublicSocialIntent(
      makeIntent({
        id: 'public_agent_api_smoke_qingdao_walk',
        source: 'agent_smoke_seed',
        requestType: 'agent_smoke',
        title: 'Agent Smoke Owner internal fixture',
        description: 'Agent smoke 专用公开场景，请勿展示。',
        interestTags: ['散步', 'agent smoke', 'seed'],
        city: '青岛',
        socialGoal: '周末下午找散步搭子',
      }),
    );

    expect(response).toMatchObject({
      requestType: 'custom',
      title: '青岛同频约练',
      description: '周末下午找散步搭子',
      interestTags: ['散步'],
      socialGoal: '周末下午找散步搭子',
    });
    const visiblePayload = { ...response };
    delete (visiblePayload as { id?: string }).id;
    expect(JSON.stringify(visiblePayload)).not.toMatch(
      /agent smoke|smoke|seed/i,
    );
  });

  it('keeps match signal metadata private even when the entity stores one', () => {
    const response = serializePublicSocialIntent(
      makeIntent({
        metadata: {
          matchSignal: {
            score: 99,
            confidence: 'high',
            source: 'private_engine',
            reasons: ['internal rule'],
          },
        },
      }),
    );

    expect(response).not.toHaveProperty('matchSignal');
    expect(JSON.stringify(response)).not.toMatch(
      /private_engine|internal rule/,
    );
  });
});
