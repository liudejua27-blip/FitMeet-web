import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
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
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import {
  candidateCityMatches,
  candidateRecentScore,
} from './social-agent-candidate-scoring';
import {
  candidateLifeRhythmScore,
  candidateProfileTimeMatches,
  candidateRelationshipGoalScore,
  candidateSafetyRiskScore,
  candidateSocialBoundaryScore,
  candidateSocialEnergyScore,
  evaluateCandidateScoreSceneRisk,
  publicIntentSocialBoundaryScore,
  type CandidateScoreSceneRisk,
} from './social-agent-candidate-score-breakdown-rules';
export {
  candidateLifeRhythmScore,
  candidateRelationshipGoalScore,
  candidateSafetyRiskScore,
  candidateSocialBoundaryScore,
  candidateSocialEnergyScore,
  publicIntentSocialBoundaryScore,
} from './social-agent-candidate-score-breakdown-rules';

export function buildProfileCandidateScoreBreakdown(input: {
  user: User;
  profile: UserSocialProfile | null;
  delegate: AiDelegateProfile | null;
  query: CandidatePoolResolvedQuery;
  tags: string[];
  city: string;
  completeness: number;
  commonTags: string[];
  lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  sceneRisk: CandidateScoreSceneRisk;
}): Record<string, number> {
  const policy = evaluateCandidateScoreSceneRisk(input);
  const cityMatches = candidateCityMatches;
  return {
    distance: Math.min(
      18,
      (candidateCityMatches(input.query.city, input.city) ? 14 : 6) +
        lifeGraphLocationBoost(input.city, input.lifeGraphSignals, cityMatches),
    ),
    timeOverlap: Math.min(
      15,
      candidateProfileTimeMatches(
        input.query.timePreference,
        input.profile,
        input.delegate,
      ) + lifeGraphTimeBoost(input.lifeGraphSignals),
    ),
    interestSimilarity: Math.min(
      20,
      input.commonTags.length * 10 +
        lifeGraphSportBoost(input.tags, input.lifeGraphSignals),
    ),
    lifeRhythm: Math.min(
      10,
      candidateLifeRhythmScore(input.profile, input.delegate) +
        lifeGraphRhythmBoost(input.lifeGraphSignals),
    ),
    socialEnergy: candidateSocialEnergyScore(input.profile, input.delegate),
    socialBoundaryFit: candidateSocialBoundaryScore(
      input.query,
      input.profile,
      input.delegate,
    ),
    relationshipGoal: Math.min(
      10,
      candidateRelationshipGoalScore(input.query, input.tags) +
        lifeGraphGoalBoost(input.query, input.tags, input.lifeGraphSignals),
    ),
    lifeGraphBehaviorFit: lifeGraphBehaviorFit(
      {
        query: input.query,
        city: input.city,
        tags: input.tags,
        commonTags: input.commonTags,
        signals: input.lifeGraphSignals,
      },
      cityMatches,
    ),
    boundaryFit: lifeGraphBoundaryFit(input.query, input.lifeGraphSignals),
    trustworthiness: Math.min(
      10,
      Math.round(input.completeness * 5) + (input.user.verified ? 5 : 0),
    ),
    safetyRisk: Math.max(
      0,
      candidateSafetyRiskScore(policy.riskLevel) -
        lifeGraphSafetyPenalty(input.user, input.lifeGraphSignals),
    ),
  };
}

export function buildPublicIntentCandidateScoreBreakdown(input: {
  query: CandidatePoolResolvedQuery;
  city: string;
  tags: string[];
  commonTags: string[];
  completeness: number;
  updatedAt: Date;
  lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  sceneRisk: CandidateScoreSceneRisk;
}): Record<string, number> {
  const policy = evaluateCandidateScoreSceneRisk(input);
  const cityMatches = candidateCityMatches;
  return {
    distance: Math.min(
      18,
      (candidateCityMatches(input.query.city, input.city) ? 14 : 6) +
        lifeGraphLocationBoost(input.city, input.lifeGraphSignals, cityMatches),
    ),
    timeOverlap: Math.min(
      15,
      (input.query.timePreference ? 10 : 6) +
        lifeGraphTimeBoost(input.lifeGraphSignals),
    ),
    interestSimilarity: Math.min(
      20,
      input.commonTags.length * 10 +
        lifeGraphSportBoost(input.tags, input.lifeGraphSignals),
    ),
    lifeRhythm: Math.min(
      10,
      (input.query.timePreference ? 7 : 4) +
        lifeGraphRhythmBoost(input.lifeGraphSignals),
    ),
    socialEnergy: 5,
    socialBoundaryFit: publicIntentSocialBoundaryScore(input.query),
    relationshipGoal: Math.min(
      10,
      candidateRelationshipGoalScore(input.query, input.tags) +
        lifeGraphGoalBoost(input.query, input.tags, input.lifeGraphSignals),
    ),
    lifeGraphBehaviorFit: lifeGraphBehaviorFit(
      {
        query: input.query,
        city: input.city,
        tags: input.tags,
        commonTags: input.commonTags,
        signals: input.lifeGraphSignals,
      },
      cityMatches,
    ),
    boundaryFit: lifeGraphBoundaryFit(input.query, input.lifeGraphSignals),
    trustworthiness: Math.min(
      10,
      Math.round(input.completeness * 5) +
        candidateRecentScore(input.updatedAt, 5),
    ),
    safetyRisk: candidateSafetyRiskScore(policy.riskLevel),
  };
}
