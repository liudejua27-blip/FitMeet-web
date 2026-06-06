import {
  buildCandidatePoolDebugSnapshot,
  emptyCandidatePoolFiltered,
  toCandidatePoolDebugReasons,
} from './social-agent-candidate-pool-debug';

describe('social agent candidate pool debug helpers', () => {
  it('creates a fresh filtered counter object', () => {
    const filtered = emptyCandidatePoolFiltered();

    expect(filtered).toEqual({
      self: 0,
      blocked: 0,
      cityMismatch: 0,
      boundaryMismatch: 0,
      scoreBelowThreshold: 0,
    });

    filtered.self = 2;
    expect(emptyCandidatePoolFiltered().self).toBe(0);
  });

  it('builds a compact debug snapshot without leaking full candidate payloads', () => {
    const debug = buildCandidatePoolDebugSnapshot({
      ownerUserId: 1,
      query: {
        city: '青岛',
        intent: 'social_search',
        interestTags: ['跑步'],
        activityType: '跑步',
        timePreference: '周末',
        locationPreference: '',
        socialRequestId: 301,
        rawText: '找跑步搭子',
      },
      counts: {
        users: 5,
        socialProfiles: 4,
        aiDelegateProfiles: 3,
        publicSocialIntents: 2,
        socialRequests: 1,
        socialActivities: 6,
      },
      filtered: {
        self: 1,
        blocked: 2,
        cityMismatch: 3,
        boundaryMismatch: 4,
        scoreBelowThreshold: 5,
      },
      profileCandidates: 7,
      publicIntentCandidates: 8,
      activityCandidates: 9,
      finalCandidates: [
        {
          source: 'profile_candidate',
          isRealData: true,
          targetUserId: 2,
          candidateUserId: 2,
          userId: 2,
          publicIntentId: null,
          socialRequestId: 301,
          activityId: null,
          displayName: '画像用户 2',
          city: '青岛',
          interestTags: ['跑步', '咖啡'],
          profileCompleteness: 0.8,
          dataQuality: 'complete',
          matchScore: 86,
          matchReasons: ['共同兴趣：跑步。'],
          riskWarnings: ['建议先站内沟通确认。'],
          suggestedOpener: '周末一起跑步吗？',
          avatar: 'https://cdn.fitmeet.test/avatar.jpg',
          scoreBreakdown: { distance: 14 },
        } as never,
      ],
    });

    expect(debug).toMatchObject({
      ownerUserId: 1,
      eligible: {
        profileCandidates: 7,
        publicIntentCandidates: 8,
        activityCandidates: 9,
      },
      finalCandidates: [
        {
          source: 'profile_candidate',
          candidateUserId: 2,
          displayName: '画像用户 2',
          matchScore: 86,
          suggestedOpener: '周末一起跑步吗？',
        },
      ],
    });
    expect(debug.finalCandidates[0]).not.toHaveProperty('avatar');
    expect(debug.finalCandidates[0]).not.toHaveProperty('scoreBreakdown');
  });

  it('maps debug snapshots to stable debug reason counters', () => {
    const debug = buildCandidatePoolDebugSnapshot({
      ownerUserId: 1,
      query: {
        city: '',
        intent: 'activity_search',
        interestTags: [],
        activityType: '',
        timePreference: '',
        locationPreference: '',
        socialRequestId: null,
        rawText: '',
      },
      counts: {
        users: 11,
        socialProfiles: 12,
        aiDelegateProfiles: 13,
        publicSocialIntents: 14,
        socialRequests: 15,
        socialActivities: 16,
      },
      filtered: {
        self: 1,
        blocked: 2,
        cityMismatch: 3,
        boundaryMismatch: 4,
        scoreBelowThreshold: 5,
      },
      profileCandidates: 6,
      publicIntentCandidates: 7,
      activityCandidates: 8,
      finalCandidates: [],
    });

    expect(toCandidatePoolDebugReasons(debug)).toEqual({
      usersTotal: 11,
      socialProfilesTotal: 12,
      publicIntentsTotal: 14,
      eligibleProfiles: 6,
      eligiblePublicIntents: 7,
      eligibleActivities: 8,
      filteredBySelf: 1,
      filteredByBlocked: 2,
      filteredByCity: 3,
      filteredByBoundary: 4,
      scoreBelowThreshold: 5,
    });
  });
});
