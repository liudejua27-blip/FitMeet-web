import {
  buildPublicSocialCandidates,
  parsePublicSocialTimeWindow,
} from './public-social-candidate.presenter';
import { CreateSocialRequestDto } from './dto/agent-gateway.dto';
import { UserPreference } from './entities/user-preference.entity';
import { User } from '../users/user.entity';

const nowMs = new Date('2026-06-01T00:00:00.000Z').getTime();

function request(overrides: Partial<CreateSocialRequestDto> = {}) {
  return {
    requestType: 'fitness_partner',
    description: '今晚想找附近跑步搭子，在公共场地先慢跑 3km',
    city: '青岛',
    interests: ['running', 'fitness'],
    verifiedOnly: true,
    radiusKm: 5,
    limit: 10,
    ...overrides,
  } as CreateSocialRequestDto;
}

function user(overrides: Partial<User> = {}) {
  return {
    id: 1,
    email: 'candidate@example.com',
    password: 'hash',
    phone: null,
    wechatOpenId: null,
    name: 'Candidate',
    avatar: '',
    color: '#C8FF00',
    gender: '',
    age: 28,
    city: '青岛',
    lat: 36.06,
    lng: 120.38,
    locationUpdatedAt: new Date('2026-05-31T00:00:00.000Z'),
    acceptNearbyMatch: true,
    gym: '',
    bio: 'running evening fitness',
    coverUrl: null,
    singleCert: false,
    verified: true,
    interestTags: ['running', 'fitness'],
    trainingDays: 0,
    trainingCount: 0,
    caloriesBurned: 0,
    bestRecords: [],
    isCoach: false,
    trustScore: 0,
    socialTrustCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as User;
}

function preference(overrides: Partial<UserPreference> = {}) {
  return {
    userId: 1,
    acceptAgentMessages: true,
    ...overrides,
  } as UserPreference;
}

describe('public social candidate presenter', () => {
  it('scores safe public candidate cards without exposing private contact data', () => {
    const candidates = buildPublicSocialCandidates({
      users: [
        user({ id: 1, name: 'Closer' }),
        user({
          id: 2,
          name: 'Farther',
          lat: 36.08,
          lng: 120.4,
          verified: false,
          interestTags: ['coffee'],
          bio: '',
        }),
      ],
      preferencesByUserId: new Map(),
      dto: request({ timePreference: '工作日晚上' }),
      ownerLat: 36.06,
      ownerLng: 120.38,
      radiusKm: 5,
      city: '青岛',
      nowMs,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      profile: {
        id: 1,
        name: 'Closer',
        verified: true,
        interestTags: ['running', 'fitness'],
      },
      nextAction: 'draft_invitation',
    });
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
    expect(candidates[0].reasonTags).toEqual(
      expect.arrayContaining([
        'within_5km',
        'verified',
        'interest_running',
        'time_evening',
      ]),
    );
    expect(candidates[0].profile).not.toHaveProperty('email');
    expect(candidates[0].profile.distanceKm).toBe(0);
  });

  it('filters candidates that opted out of agent messages or exceed radius', () => {
    const candidates = buildPublicSocialCandidates({
      users: [
        user({ id: 1, name: 'Opted out' }),
        user({ id: 2, name: 'Too far', lat: 36.3, lng: 120.8 }),
        user({ id: 3, name: 'Allowed', lat: 36.061, lng: 120.381 }),
      ],
      preferencesByUserId: new Map([
        [1, preference({ userId: 1, acceptAgentMessages: false })],
      ]),
      dto: request({ limit: 3 }),
      ownerLat: 36.06,
      ownerLng: 120.38,
      radiusKm: 5,
      city: '青岛',
      nowMs,
    });

    expect(candidates.map((candidate) => candidate.profile.name)).toEqual([
      'Allowed',
    ]);
  });

  it('uses city fallback and stale-location penalty consistently', () => {
    const candidates = buildPublicSocialCandidates({
      users: [
        user({
          id: 1,
          name: 'Same city',
          lat: null,
          lng: null,
          locationUpdatedAt: null,
        }),
        user({
          id: 2,
          name: 'Stale fix',
          locationUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ],
      preferencesByUserId: new Map(),
      dto: request({ timePreference: '' }),
      ownerLat: null,
      ownerLng: null,
      radiusKm: 5,
      city: '青岛',
      nowMs,
    });

    expect(candidates[0].reasonTags).toContain('same_city');
    expect(
      candidates.some((candidate) =>
        candidate.reasonTags.includes('stale_location'),
      ),
    ).toBe(false);

    const geoCandidates = buildPublicSocialCandidates({
      users: [
        user({
          id: 2,
          name: 'Stale fix',
          locationUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ],
      preferencesByUserId: new Map(),
      dto: request(),
      ownerLat: 36.06,
      ownerLng: 120.38,
      radiusKm: 5,
      city: '青岛',
      nowMs,
    });

    expect(geoCandidates[0].reasonTags).toContain('stale_location');
  });

  it('parses bilingual public social time windows', () => {
    expect(parsePublicSocialTimeWindow('周末 morning')).toEqual([
      'morning',
      'weekend',
    ]);
    expect(parsePublicSocialTimeWindow('工作日晚上')).toEqual([
      'evening',
      'weekday',
    ]);
  });
});
