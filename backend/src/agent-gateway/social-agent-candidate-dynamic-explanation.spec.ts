import { buildSocialMatchDynamicExplanation } from './social-agent-candidate-dynamic-explanation';

describe('buildSocialMatchDynamicExplanation', () => {
  it('uses Life Graph behavior and safety signals in user-facing candidate reasoning', () => {
    const explanation = buildSocialMatchDynamicExplanation({
      displayName: '林同学',
      city: '青岛',
      interestTags: ['跑步'],
      commonTags: ['跑步', '同校'],
      matchReasons: ['都喜欢周末下午慢跑'],
      scoreBreakdown: { lifeGraphBehaviorFit: 8 },
      riskWarnings: ['资料较少，建议先站内沟通确认。'],
      lifeGraphSignals: {
        identitySignals: { city: '青岛', nearbyArea: '青岛大学附近' },
        socialIntentSignals: {},
        lifestyleSignals: {},
        fitnessSignals: {},
        behaviorSignals: {
          activityLevel: 'quiet',
          socialEnergy: 'sports',
          completionTrend: 'reliable',
          cancellationPattern: 'rare',
          pressurePreference: 'low',
          nightBoundary: 'avoids_late_private',
          locationPreference: 'same_school_or_area',
          feedbackPattern: ['跑步', '同校'],
          scores: {
            rhythmConfidence: 0.8,
            sportsAffinity: 0.9,
            lowPressureFit: 0.95,
            safetyBoundaryClarity: 0.9,
            reliability: 0.85,
          },
          recommendationWeights: {
            sameSchoolOrArea: 88,
            sameCity: 72,
            commonInterest: 70,
            lowPressure: 92,
            sports: 90,
            reliability: 86,
            recency: 38,
            safetyBoundary: 90,
          },
          matchingGuidance: {
            shouldPreferSameSchoolOrArea: true,
            shouldPreferSameCity: false,
            shouldPreferCommonInterest: false,
            shouldPreferLowPressure: true,
            shouldPreferSports: true,
            shouldAvoidNight: true,
            shouldUsePublicPlace: true,
            shouldReduceDisturbance: true,
            suggestedFilters: ['只看同校', '只看低压力', '不要晚上'],
            rankingNotes: ['优先同校、低压力、公共场所的跑步搭子。'],
          },
          summary: '你最近更适合低压力运动社交。',
          insights: ['你更容易接受同校或活动区域接近的人。'],
        },
        safetySignals: {
          publicPlaceOnly: true,
          locationSharingAllowed: false,
          strictConfirmationRequired: true,
          realNameRequired: false,
          acceptsNightMeet: false,
          blockedScenarios: [],
        },
        confidence: { overall: 0.9, byField: {} },
        missingCriticalFields: [],
      },
    });

    expect(explanation.whyYouMayLike).toContain('不是只因为分数高');
    expect(explanation.whyNow).toContain('低压力的 跑步');
    expect(explanation.matchPoints).toEqual(
      expect.arrayContaining([
        expect.stringContaining('低压力社交'),
        expect.stringContaining('运动型连接'),
        expect.stringContaining('同校'),
      ]),
    );
    expect(explanation.boundaryNotes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('公共场所'),
        expect.stringContaining('不建议直接共享精确位置'),
        expect.stringContaining('白天'),
      ]),
    );
    expect(explanation.dynamicSignalReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('低压力运动社交'),
        expect.stringContaining('优先同校'),
      ]),
    );
    expect(explanation.continuousFilterHints).toEqual(
      expect.arrayContaining(['只看同校', '只看低压力', '不要晚上']),
    );
  });

  it('falls back to safe public-place boundaries without Life Graph signals', () => {
    const explanation = buildSocialMatchDynamicExplanation({
      displayName: 'Alex',
      city: '',
      interestTags: [],
      commonTags: [],
      matchReasons: [],
      scoreBreakdown: {},
      riskWarnings: [],
      lifeGraphSignals: null,
    });

    expect(explanation.whyYouMayLike).toContain('Alex');
    expect(explanation.whyNow).toContain('轻量沟通');
    expect(explanation.boundaryNotes).toEqual([
      '第一次建议先站内沟通，选择公共场所，不共享精确位置。',
    ]);
    expect(explanation.continuousFilterHints).toEqual(
      expect.arrayContaining(['只看同校', '不要晚上', '只看低压力']),
    );
  });
});
