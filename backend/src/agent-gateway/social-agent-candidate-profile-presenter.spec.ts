import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  candidateDataQuality,
  candidateDisplayName,
  candidateProfileCompleteness,
  candidateProfileTags,
} from './social-agent-candidate-profile-presenter';

const now = new Date('2026-05-23T08:00:00.000Z');

function user(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    email: 'u7@fitmeet.test',
    password: '',
    phone: '',
    wechatOpenId: null,
    name: '真实用户 7',
    avatar: '',
    color: '#168a55',
    gender: '',
    age: 0,
    city: '青岛',
    lat: null,
    lng: null,
    locationUpdatedAt: null,
    acceptNearbyMatch: true,
    gym: '',
    bio: '',
    coverUrl: null,
    singleCert: false,
    verified: false,
    interestTags: ['咖啡', '跑步'],
    trainingDays: 0,
    trainingCount: 0,
    caloriesBurned: 0,
    bestRecords: [],
    isCoach: false,
    trustScore: 0,
    socialTrustCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as User;
}

function profile(
  overrides: Partial<UserSocialProfile> = {},
): UserSocialProfile {
  return {
    userId: 7,
    gender: '',
    nickname: '林同学',
    ageRange: '',
    city: '青岛',
    zodiac: '',
    mbti: '',
    traits: ['慢热'],
    socialStyle: '',
    communicationStyle: '',
    nearbyArea: '青岛大学附近',
    fitnessGoals: ['跑步'],
    interestTags: ['咖啡', '拍照'],
    lifestyleTags: [],
    socialScenes: [],
    wantToMeet: [],
    preferredTraits: [],
    avoidTraits: [],
    relationshipGoals: [],
    openness: '',
    availableTimes: ['周末下午'],
    weekdayAvailability: '',
    weekendAvailability: '',
    socialPreference: '低压力社交',
    rejectRules: '',
    privacyBoundary: '',
    profileDiscoverable: true,
    agentCanRecommendMe: true,
    agentCanStartChatAfterApproval: false,
    hideSensitiveTags: true,
    aiSummary: '',
    aiProfileCard: {},
    matchSignals: {},
    sensitiveTagDecisions: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as UserSocialProfile;
}

function delegate(
  overrides: Partial<AiDelegateProfile> = {},
): AiDelegateProfile {
  return {
    userId: 7,
    city: '青岛',
    favoriteSports: ['羽毛球'],
    interests: 'coffee and citywalk',
    trainingGoals: 'running fitness',
    idealPartner: '喜欢拍照和瑜伽的人',
    availability: '周末',
    boundaries: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AiDelegateProfile;
}

describe('candidate profile presenter', () => {
  it('combines profile, user, and delegate signals into deduplicated tags', () => {
    expect(candidateProfileTags(user(), profile(), delegate())).toEqual(
      expect.arrayContaining([
        '咖啡',
        '跑步',
        '拍照',
        '慢热',
        '羽毛球',
        'citywalk',
        '健身',
        '瑜伽',
      ]),
    );
    expect(candidateProfileTags(user(), profile(), delegate())).toEqual(
      expect.arrayContaining(['咖啡']),
    );
    expect(
      candidateProfileTags(user(), profile(), delegate()).filter(
        (tag) => tag === '咖啡',
      ),
    ).toHaveLength(1);
  });

  it('scores profile completeness and maps data quality thresholds', () => {
    const complete = candidateProfileCompleteness(
      user(),
      profile(),
      delegate(),
    );
    expect(complete).toBe(1);
    expect(candidateDataQuality(complete)).toBe('complete');

    const partial = candidateProfileCompleteness(
      user({ city: '', interestTags: [], name: '', avatar: '' }),
      null,
      null,
    );
    expect(partial).toBe(0);
    expect(candidateDataQuality(0.84)).toBe('partial');
    expect(candidateDataQuality(partial)).toBe('incomplete');
  });

  it('prefers real names and falls back to city-aware anonymized names', () => {
    expect(candidateDisplayName(user(), profile(), '青岛')).toBe('林同学');
    expect(
      candidateDisplayName(
        user({ name: 'FitMeet User M5l4' }),
        profile({ nickname: 'FitMeet User 12' }),
        '青岛',
      ),
    ).toBe('青岛用户 7');
    expect(
      candidateDisplayName(
        user({ name: 'FitMeet User M5l4', city: '' }),
        profile({ nickname: '' }),
        '',
      ),
    ).toBe('已脱敏用户 7');
  });
});
