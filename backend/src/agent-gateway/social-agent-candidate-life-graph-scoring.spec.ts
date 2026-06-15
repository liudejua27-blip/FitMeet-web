import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import {
  lifeGraphBehaviorFit,
  lifeGraphBoundaryFit,
  lifeGraphGoalBoost,
  lifeGraphLocationBoost,
  lifeGraphRhythmBoost,
  lifeGraphSafetyPenalty,
  lifeGraphSportBoost,
  lifeGraphTimeBoost,
} from './social-agent-candidate-life-graph-scoring';

function signals(
  overrides: Partial<LifeGraphUnifiedMatchSignalsDto> = {},
): LifeGraphUnifiedMatchSignalsDto {
  return {
    identitySignals: { city: '青岛', nearbyArea: '青岛大学附近' },
    socialIntentSignals: {
      currentSocialGoal: '找跑步搭子',
      relationshipGoal: '运动社交',
    },
    lifestyleSignals: {
      availableTimes: ['周末下午'],
      weekendAvailability: '周末下午',
      activeHours: 'afternoon',
    },
    fitnessSignals: { sportsPreferences: ['跑步'] },
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
      realNameRequired: true,
      publicPlaceOnly: true,
      strictConfirmationRequired: true,
      blockedScenarios: [],
      locationSharingAllowed: false,
      acceptsNightMeet: false,
    },
    confidence: { overall: 0.9, byField: {} },
    missingCriticalFields: [],
    preferenceHistory: {},
    ...overrides,
  };
}

const sameCity = (left: string, right: string) =>
  left.trim() !== '' && right.trim() !== '' && left.includes(right);

describe('candidate Life Graph scoring', () => {
  it('boosts location, time, sport, rhythm, and goal alignment from signals', () => {
    const lifeGraphSignals = signals({
      socialIntentSignals: {
        currentSocialGoal: '跑步',
        relationshipGoal: '运动社交',
      },
    });
    const query = {
      rawText: '帮我找青岛大学附近低压力跑步搭子',
      activityType: 'running_partner',
      interestTags: ['跑步'],
    };

    expect(lifeGraphLocationBoost('青岛', lifeGraphSignals, sameCity)).toBe(4);
    expect(lifeGraphTimeBoost(lifeGraphSignals)).toBe(3);
    expect(lifeGraphSportBoost(['跑步'], lifeGraphSignals)).toBe(5);
    expect(lifeGraphRhythmBoost(lifeGraphSignals)).toBe(2);
    expect(lifeGraphGoalBoost(query, ['跑步'], lifeGraphSignals)).toBe(2);
  });

  it('scores low-pressure same-area behavior but penalizes late-night matches', () => {
    const lifeGraphSignals = signals();

    expect(
      lifeGraphBehaviorFit(
        {
          query: {
            rawText: '青岛大学附近低压力慢跑，不要尴尬',
            activityType: 'running_partner',
            interestTags: ['跑步'],
          },
          city: '青岛',
          tags: ['跑步'],
          commonTags: ['跑步', '同校'],
          signals: lifeGraphSignals,
        },
        sameCity,
      ),
    ).toBe(12);

    expect(
      lifeGraphBehaviorFit(
        {
          query: {
            rawText: '今晚深夜私下见面',
            activityType: 'night_meet',
            interestTags: [],
          },
          city: '青岛',
          tags: [],
          commonTags: [],
          signals: lifeGraphSignals,
        },
        sameCity,
      ),
    ).toBeLessThan(8);
  });

  it('keeps boundary and safety penalties explicit for high-risk matches', () => {
    const lifeGraphSignals = signals();

    expect(
      lifeGraphBoundaryFit(
        {
          rawText: '今晚深夜见面',
          activityType: 'night_meet',
          interestTags: [],
          timePreference: '晚上',
          locationPreference: '私密地点',
        },
        lifeGraphSignals,
      ),
    ).toBe(0);
    expect(lifeGraphSafetyPenalty({ verified: false }, lifeGraphSignals)).toBe(
      3,
    );
    expect(lifeGraphSafetyPenalty({ verified: true }, lifeGraphSignals)).toBe(
      1,
    );
  });
});
