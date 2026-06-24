import {
  buildCandidatePoolActivitySearchResult,
  buildCandidatePoolSearchResult,
  EMPTY_ACTIVITY_MESSAGE,
  EMPTY_CANDIDATE_MESSAGE,
} from './social-agent-candidate-pool-result.presenter';
import type { CandidatePoolDebugSnapshot } from './social-agent-candidate-pool-debug';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

const query = {
  intent: 'social_search',
  city: '青岛',
  activityType: '',
  interestTags: ['跑步'],
  timePreference: '',
  locationPreference: '',
  rawText: '',
  socialRequestId: null,
  acceptsStrangers: null,
} satisfies CandidatePoolResolvedQuery;

const debug = {
  ownerUserId: 1,
  query,
  counts: {
    users: 2,
    socialProfiles: 1,
    aiDelegateProfiles: 0,
    publicSocialIntents: 0,
    socialRequests: 0,
    socialActivities: 0,
  },
  eligible: {
    profileCandidates: 1,
    publicIntentCandidates: 0,
    activityCandidates: 0,
  },
  filtered: {
    self: 0,
    blocked: 0,
    cityMismatch: 0,
    boundaryMismatch: 0,
    scoreBelowThreshold: 0,
  },
  finalCandidates: [
    {
      source: 'profile_candidate',
      isRealData: true,
      targetUserId: 2,
      candidateUserId: 2,
      userId: 2,
      publicIntentId: null,
      socialRequestId: null,
      activityId: null,
      displayName: '画像用户 2',
      city: '青岛',
      interestTags: ['跑步'],
      profileCompleteness: 0.8,
      dataQuality: 'partial',
      matchScore: 88,
      matchReasons: ['共同兴趣：跑步。'],
      riskWarnings: [],
      suggestedOpener: '一起跑步吗？',
    },
  ],
} satisfies CandidatePoolDebugSnapshot;

describe('social-agent-candidate-pool-result.presenter', () => {
  it('builds non-empty social candidate search envelopes without empty text', () => {
    const result = buildCandidatePoolSearchResult({
      ownerUserId: 1,
      query,
      candidates: [{ candidateUserId: 2 }],
      debug,
    });

    expect(result).toMatchObject({
      ownerUserId: 1,
      query,
      candidates: [{ candidateUserId: 2 }],
      emptyReason: null,
      message: '',
      debug,
    });
    expect(result.debugReasons).toMatchObject({
      usersTotal: 2,
      eligibleProfiles: 1,
      filteredBySelf: 0,
    });
  });

  it('builds stable empty social candidate search envelopes', () => {
    const result = buildCandidatePoolSearchResult({
      ownerUserId: 1,
      query,
      candidates: [],
      debug,
    });

    expect(result).toMatchObject({
      candidates: [],
      emptyReason: 'no_real_candidates',
      message: EMPTY_CANDIDATE_MESSAGE,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.message).toContain('发布');
    expect(result.message).toContain('放宽');
    expect(result.message).toContain('时间');
    expect(result.message).toContain('兴趣');
    expect(JSON.stringify(result)).not.toContain('mock');
    expect(JSON.stringify(result)).not.toContain('fallback');
  });

  it('builds stable empty activity search envelopes', () => {
    const result = buildCandidatePoolActivitySearchResult({
      ownerUserId: 1,
      query,
      activityResults: [],
      debug,
    });

    expect(result).toMatchObject({
      activityResults: [],
      emptyReason: 'no_real_candidates',
      message: EMPTY_ACTIVITY_MESSAGE,
    });
  });
});
