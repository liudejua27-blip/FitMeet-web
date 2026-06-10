import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
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
import { normalizeCandidatePoolArray } from './social-agent-candidate-pool-query';
import {
  candidateCityMatches,
  candidateRecentScore,
} from './social-agent-candidate-scoring';

type CandidateScoreSceneRisk = Pick<
  SceneRiskPolicyService,
  'evaluate' | 'normalizeScene'
>;

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

export function candidateLifeRhythmScore(
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  const text = [
    ...normalizeCandidatePoolArray(profile?.availableTimes),
    profile?.weekdayAvailability ?? '',
    profile?.weekendAvailability ?? '',
    ...normalizeCandidatePoolArray(profile?.lifestyleTags),
    ...normalizeCandidatePoolArray(profile?.socialScenes),
    delegate?.availability ?? '',
  ].join(' ');
  if (!text.trim()) return 4;
  if (/周末|白天|规律|早睡|morning|weekend|day/i.test(text)) return 10;
  if (/晚上|夜间|night|evening/i.test(text)) return 7;
  return 6;
}

export function candidateSocialEnergyScore(
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  const text = [
    profile?.socialStyle,
    profile?.openness,
    profile?.socialPreference,
    ...(profile?.traits ?? []),
    delegate?.idealPartner,
  ]
    .filter(Boolean)
    .join(' ');
  if (!text.trim()) return 4;
  if (/适中|稳定|随和|balanced|medium/i.test(text)) return 8;
  if (/主动|外向|热情|开放|active|open|extrovert/i.test(text)) return 7;
  if (/慢热|安静|内向|克制|quiet|introvert/i.test(text)) return 6;
  return 5;
}

export function candidateRelationshipGoalScore(
  query: CandidatePoolResolvedQuery,
  tags: string[],
): number {
  const text = [
    query.rawText,
    query.activityType,
    ...query.interestTags,
    ...tags,
  ].join(' ');
  if (/相亲|恋爱|对象|dating|date/i.test(text)) return 10;
  if (/搭子|约练|跑步|健身|麻将|扑克|旅行|旅游|partner|buddy/i.test(text))
    return 9;
  if (/朋友|聊天|认识|friend|social/i.test(text)) return 8;
  if (/学习|自习|study/i.test(text)) return 7;
  return 5;
}

export function candidateSafetyRiskScore(
  riskLevel: ReturnType<SceneRiskPolicyService['evaluate']>['riskLevel'],
): number {
  if (riskLevel === 'critical') return 0;
  if (riskLevel === 'high') return 3;
  if (riskLevel === 'medium') return 6;
  return 9;
}

function evaluateCandidateScoreSceneRisk(input: {
  query: CandidatePoolResolvedQuery;
  tags: string[];
  lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  sceneRisk: CandidateScoreSceneRisk;
}): ReturnType<SceneRiskPolicyService['evaluate']> {
  const sceneType = input.sceneRisk.normalizeScene(
    null,
    [
      input.query.rawText,
      input.query.activityType,
      ...input.query.interestTags,
      ...input.tags,
    ].join(' '),
  );
  return input.sceneRisk.evaluate({
    sceneType,
    actionType: 'send_message',
    text: input.query.rawText,
    permissionMode: 'limited_auto',
    safetySignals: input.lifeGraphSignals?.safetySignals,
  });
}

function candidateProfileTimeMatches(
  queryTime: string,
  profile: UserSocialProfile | null,
  delegate: AiDelegateProfile | null,
): number {
  if (!queryTime) return 8;
  const text = [
    ...normalizeCandidatePoolArray(profile?.availableTimes),
    profile?.weekdayAvailability,
    profile?.weekendAvailability,
    delegate?.availability,
  ]
    .filter(Boolean)
    .join(' ');
  if (!text) return 4;
  return text.includes(queryTime) || queryTime.includes(text) ? 15 : 8;
}
