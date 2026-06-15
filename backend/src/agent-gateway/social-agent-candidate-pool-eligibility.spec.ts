import {
  SocialActivity,
  SocialActivityStatus,
} from '../activities/entities/activity.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  SocialRequest,
  SocialRequestStatus,
} from './entities/social-request.entity';
import {
  hasSocialAgentRecommendationBoundary,
  hasSocialAgentSafetyExclusionBoundary,
  isSocialAgentProfileCandidateOptedIn,
  isSocialAgentActiveActivity,
  isSocialAgentActiveLegacyRequest,
  isSocialAgentActivePublicIntent,
  isSocialAgentActivityLikePublicIntent,
} from './social-agent-candidate-pool-eligibility';
import {
  resolveCandidatePoolStrangerPolicy,
  type CandidatePoolResolvedQuery,
} from './social-agent-candidate-pool-query';

function publicIntent(
  overrides: Partial<PublicSocialIntent> = {},
): PublicSocialIntent {
  return {
    mode: 'public',
    status: SocialRequestStatus.Searching,
    requestType: 'coffee_chat',
    title: '周末咖啡',
    description: '找人喝咖啡',
    interestTags: ['咖啡'],
    ...overrides,
  } as PublicSocialIntent;
}

function legacyRequest(overrides: Partial<SocialRequest> = {}): SocialRequest {
  return {
    visibility: 'public',
    status: SocialRequestStatus.Searching,
    ...overrides,
  } as SocialRequest;
}

function activity(overrides: Partial<SocialActivity> = {}): SocialActivity {
  return {
    status: SocialActivityStatus.Confirmed,
    endTime: null,
    ...overrides,
  } as SocialActivity;
}

function query(
  overrides: Partial<CandidatePoolResolvedQuery> = {},
): CandidatePoolResolvedQuery {
  return {
    city: '青岛',
    intent: 'activity_search',
    interestTags: [],
    activityType: '',
    timePreference: '',
    locationPreference: '',
    socialRequestId: null,
    rawText: '',
    acceptsStrangers: null,
    ...overrides,
  };
}

describe('social agent candidate pool eligibility', () => {
  it('keeps only active public social intents eligible', () => {
    expect(
      isSocialAgentActivePublicIntent(
        publicIntent({ status: SocialRequestStatus.Active }),
      ),
    ).toBe(true);
    expect(
      isSocialAgentActivePublicIntent(
        publicIntent({ status: SocialRequestStatus.Matched }),
      ),
    ).toBe(true);
    expect(
      isSocialAgentActivePublicIntent(
        publicIntent({ status: SocialRequestStatus.Completed }),
      ),
    ).toBe(false);
    expect(
      isSocialAgentActivePublicIntent(publicIntent({ mode: 'private' })),
    ).toBe(false);
  });

  it('keeps only active public legacy requests eligible', () => {
    expect(
      isSocialAgentActiveLegacyRequest(
        legacyRequest({ status: SocialRequestStatus.Active }),
      ),
    ).toBe(true);
    expect(
      isSocialAgentActiveLegacyRequest(
        legacyRequest({ status: SocialRequestStatus.Cancelled }),
      ),
    ).toBe(false);
    expect(
      isSocialAgentActiveLegacyRequest(
        legacyRequest({ visibility: 'matched_users_only' }),
      ),
    ).toBe(false);
  });

  it('keeps only active, non-ended activities eligible', () => {
    const now = new Date('2026-06-07T12:00:00.000Z').getTime();

    expect(
      isSocialAgentActiveActivity(
        activity({ status: SocialActivityStatus.PendingConfirm }),
        now,
      ),
    ).toBe(true);
    expect(
      isSocialAgentActiveActivity(
        activity({ endTime: new Date('2026-06-07T12:00:00.000Z') }),
        now,
      ),
    ).toBe(true);
    expect(
      isSocialAgentActiveActivity(
        activity({ endTime: new Date('2026-06-07T11:59:59.000Z') }),
        now,
      ),
    ).toBe(false);
    expect(
      isSocialAgentActiveActivity(
        activity({ status: SocialActivityStatus.Completed }),
        now,
      ),
    ).toBe(false);
  });

  it('detects activity-like public intents from query type or public copy', () => {
    expect(
      isSocialAgentActivityLikePublicIntent(
        publicIntent({ requestType: 'running_partner' }),
        query({ activityType: 'running_partner' }),
      ),
    ).toBe(true);
    expect(
      isSocialAgentActivityLikePublicIntent(
        publicIntent({
          requestType: 'social',
          title: '周末羽毛球活动',
          interestTags: [],
        }),
        query(),
      ),
    ).toBe(true);
    expect(
      isSocialAgentActivityLikePublicIntent(
        publicIntent({
          requestType: 'social',
          title: '只想随便聊聊',
          description: '认识新朋友',
          interestTags: [],
        }),
        query(),
      ),
    ).toBe(false);
  });

  it('detects explicit recommendation opt-out boundary copy', () => {
    expect(
      hasSocialAgentRecommendationBoundary(
        {
          privacyBoundary: '我暂时不接受推荐',
          rejectRules: '',
        } as UserSocialProfile,
        null,
      ),
    ).toBe(true);
    expect(
      hasSocialAgentRecommendationBoundary(null, {
        boundaries: '请不要推荐给陌生人',
      } as never),
    ).toBe(true);
    expect(
      hasSocialAgentRecommendationBoundary(
        {
          privacyBoundary: '先站内沟通',
          rejectRules: '不接受深夜见面',
        } as UserSocialProfile,
        null,
      ),
    ).toBe(false);
  });

  it('detects safety exclusion boundaries without blocking normal public-meeting preferences', () => {
    expect(
      hasSocialAgentSafetyExclusionBoundary(
        {
          privacyBoundary: '这个用户有举报处理中，请不要再推荐',
          rejectRules: '',
        } as UserSocialProfile,
        null,
      ),
    ).toBe(true);
    expect(
      hasSocialAgentSafetyExclusionBoundary(null, {
        boundaries: '投诉处理中，暂时禁用匹配',
      } as never),
    ).toBe(true);
    expect(
      hasSocialAgentSafetyExclusionBoundary(
        {
          privacyBoundary: '先站内沟通，只在公共场所见面',
          rejectRules: '不接受深夜见面',
        } as UserSocialProfile,
        null,
      ),
    ).toBe(false);
  });

  it('requires both profile discoverability and Agent matching opt-in for cold profile candidates', () => {
    expect(
      isSocialAgentProfileCandidateOptedIn({
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      } as UserSocialProfile),
    ).toBe(true);
    expect(
      isSocialAgentProfileCandidateOptedIn({
        profileDiscoverable: true,
        agentCanRecommendMe: false,
      } as UserSocialProfile),
    ).toBe(false);
    expect(
      isSocialAgentProfileCandidateOptedIn({
        profileDiscoverable: false,
        agentCanRecommendMe: true,
      } as UserSocialProfile),
    ).toBe(false);
    expect(
      isSocialAgentProfileCandidateOptedIn({
        profileDiscoverable: false,
        agentCanRecommendMe: false,
      } as UserSocialProfile),
    ).toBe(false);
    expect(isSocialAgentProfileCandidateOptedIn(null)).toBe(false);
  });

  it('resolves explicit stranger policy from social search text', () => {
    expect(
      resolveCandidatePoolStrangerPolicy({
        rawText: '青岛周末跑步，只推荐熟人，不接受陌生人',
      }),
    ).toBe(false);
    expect(
      resolveCandidatePoolStrangerPolicy({
        rawText: '青岛周末跑步，接受陌生人，但要先站内聊',
      }),
    ).toBe(true);
    expect(
      resolveCandidatePoolStrangerPolicy({
        explicit: false,
        rawText: '接受陌生人',
      }),
    ).toBe(false);
    expect(
      resolveCandidatePoolStrangerPolicy({ rawText: '青岛周末跑步' }),
    ).toBeNull();
  });
});
