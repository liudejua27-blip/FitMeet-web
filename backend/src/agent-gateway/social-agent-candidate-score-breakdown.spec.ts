import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import {
  buildProfileCandidateScoreBreakdown,
  buildPublicIntentCandidateScoreBreakdown,
  candidateLifeRhythmScore,
  candidateRelationshipGoalScore,
  candidateSafetyRiskScore,
  candidateSocialEnergyScore,
} from './social-agent-candidate-score-breakdown';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';

const now = new Date('2026-05-23T08:00:00.000Z');

function query(
  overrides: Partial<CandidatePoolResolvedQuery> = {},
): CandidatePoolResolvedQuery {
  return {
    city: '青岛',
    intent: 'social_search',
    interestTags: ['跑步'],
    activityType: 'running_partner',
    timePreference: '周末',
    locationPreference: '',
    socialRequestId: 101,
    rawText: '周末找青岛低压力跑步搭子',
    ...overrides,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 2,
    city: '青岛',
    verified: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as User;
}

function profile(
  overrides: Partial<UserSocialProfile> = {},
): UserSocialProfile {
  return {
    userId: 2,
    city: '青岛',
    availableTimes: ['周末'],
    weekdayAvailability: '',
    weekendAvailability: '',
    lifestyleTags: [],
    socialScenes: [],
    socialStyle: '适中',
    openness: '',
    socialPreference: '',
    traits: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as UserSocialProfile;
}

describe('candidate score breakdown', () => {
  const sceneRisk = new SceneRiskPolicyService();

  it('builds profile score parts without repository state', () => {
    const score = buildProfileCandidateScoreBreakdown({
      user: user(),
      profile: profile(),
      delegate: null,
      query: query(),
      tags: ['跑步'],
      city: '青岛',
      completeness: 0.8,
      commonTags: ['跑步'],
      sceneRisk,
    });

    expect(score).toMatchObject({
      distance: 14,
      timeOverlap: 15,
      interestSimilarity: 10,
      lifeRhythm: 10,
      socialEnergy: 8,
      relationshipGoal: 9,
      trustworthiness: 9,
      safetyRisk: 6,
    });
    expect(score.lifeGraphBehaviorFit).toBe(0);
    expect(score.boundaryFit).toBe(0);
  });

  it('builds public intent score parts and recency trust', () => {
    const score = buildPublicIntentCandidateScoreBreakdown({
      query: query(),
      city: '青岛',
      tags: ['跑步'],
      commonTags: ['跑步'],
      completeness: 0.6,
      updatedAt: new Date(),
      sceneRisk,
    });

    expect(score).toMatchObject({
      distance: 14,
      timeOverlap: 10,
      interestSimilarity: 10,
      lifeRhythm: 7,
      socialEnergy: 5,
      relationshipGoal: 9,
      trustworthiness: 8,
      safetyRisk: 6,
    });
  });

  it('keeps subscore copy and risk thresholds stable', () => {
    expect(candidateLifeRhythmScore(profile(), null)).toBe(10);
    expect(
      candidateSocialEnergyScore(profile({ socialStyle: '慢热' }), null),
    ).toBe(6);
    expect(candidateRelationshipGoalScore(query(), ['跑步'])).toBe(9);
    expect(candidateSafetyRiskScore('critical')).toBe(0);
    expect(candidateSafetyRiskScore('high')).toBe(3);
    expect(candidateSafetyRiskScore('medium')).toBe(6);
    expect(candidateSafetyRiskScore('low')).toBe(9);
  });
});
