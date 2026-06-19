import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { SocialRequestCandidateStatus } from '../match/social-request-candidate.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  CandidateExplanationService,
  type CandidateExplanation,
} from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { buildSocialMatchDynamicExplanation } from './social-agent-candidate-dynamic-explanation';
import { buildCandidateEmotionalInsight } from './social-agent-candidate-emotional-insight';
import { buildCandidateMatchedSignals } from './social-agent-candidate-display-fields';
import { buildCandidateIdentityFields } from './social-agent-candidate-identity-fields';
import type { CandidatePoolCandidate } from './social-agent-candidate-pool.service';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import type { CandidatePoolSource } from './social-agent-candidate-pool-activity-result';
import { candidateDataQuality } from './social-agent-candidate-profile-presenter';
import {
  buildCandidateRiskSnapshot,
  firstCandidateRiskWarning,
} from './social-agent-candidate-risk';
import { candidateMatchLevel } from './social-agent-candidate-scoring';

type CandidateCardSceneRisk = Pick<
  SceneRiskPolicyService,
  'evaluate' | 'normalizeScene'
>;

export function buildCandidatePoolCandidate(input: {
  source: Exclude<CandidatePoolSource, 'activity'>;
  user: User;
  profile: UserSocialProfile | null;
  city: string;
  displayName: string;
  interestTags: string[];
  profileCompleteness: number;
  matchScore: number;
  scoreBreakdown: Record<string, number>;
  commonTags: string[];
  matchReasons: string[];
  recentPublicActivity?: string[];
  publicIntentId: string | null;
  socialRequestId: number | null;
  activityId: number | null;
  query?: Pick<CandidatePoolResolvedQuery, 'acceptsStrangers'> | null;
  lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  sceneRisk: CandidateCardSceneRisk;
  candidateExplanation: Pick<CandidateExplanationService, 'explain'>;
}): CandidatePoolCandidate {
  const quality = candidateDataQuality(input.profileCompleteness);
  const sceneText = [
    ...input.interestTags,
    ...input.commonTags,
    ...input.matchReasons,
  ].join(' ');
  const sceneType = input.sceneRisk.normalizeScene(null, sceneText);
  const policy = input.sceneRisk.evaluate({
    sceneType,
    actionType: 'send_message',
    text: sceneText,
    permissionMode: 'limited_auto',
    safetySignals: input.lifeGraphSignals?.safetySignals,
  });
  const candidateRisk = buildCandidateRiskSnapshot({
    dataQuality: quality,
    sceneRiskLevel: policy.riskLevel,
    safetyPrompts: policy.safetyPrompts,
  });
  const explanation = input.candidateExplanation.explain({
    userRequest: {
      rawText: sceneText,
      interestTags: input.interestTags,
    },
    candidate: {
      displayName: input.displayName,
      city: input.city,
      commonTags: input.commonTags,
      interestTags: input.interestTags,
    },
    matchScore: input.matchScore,
    matchReasons: input.matchReasons,
    sceneType,
    riskWarnings: candidateRisk.riskWarnings,
    lifeGraphSignals: input.lifeGraphSignals,
  });
  const dynamicExplanation = buildSocialMatchDynamicExplanation({
    displayName: input.displayName,
    city: input.city,
    interestTags: input.interestTags,
    commonTags: input.commonTags,
    matchReasons: input.matchReasons,
    scoreBreakdown: input.scoreBreakdown,
    riskWarnings: candidateRisk.riskWarnings,
    lifeGraphSignals: input.lifeGraphSignals,
  });
  return buildCandidatePoolCandidateCard({
    input,
    explanation,
    dynamicExplanation,
    riskWarnings: candidateRisk.riskWarnings,
    risk: candidateRisk.risk,
    highRisk: policy.riskLevel === 'high' || policy.riskLevel === 'critical',
  });
}

function buildCandidatePoolCandidateCard(input: {
  input: Parameters<typeof buildCandidatePoolCandidate>[0];
  explanation: CandidateExplanation;
  dynamicExplanation: ReturnType<typeof buildSocialMatchDynamicExplanation>;
  riskWarnings: string[];
  risk: CandidatePoolCandidate['risk'];
  highRisk: boolean;
}): CandidatePoolCandidate {
  const suggestedOpener = input.explanation.suggestedOpener;
  const relationshipGoal = firstVisibleProfileText(
    input.input.profile?.relationshipGoals,
    input.input.lifeGraphSignals?.socialIntentSignals?.relationshipGoal,
  );
  const idealType = firstVisibleProfileText(
    input.input.profile?.wantToMeet,
    input.input.profile?.preferredTraits,
    input.input.lifeGraphSignals?.socialIntentSignals?.wantToMeet,
    input.input.lifeGraphSignals?.socialIntentSignals?.preferredTraits,
  );
  const invitePolicy =
    input.input.profile?.agentCanStartChatAfterApproval === true
      ? '仅在你确认后，由 Agent 发送站内邀请'
      : '先生成开场白，你确认后再决定是否邀请';
  const strangerPolicyLabel = candidateStrangerPolicyLabel(
    input.input.query?.acceptsStrangers,
  );
  return {
    source: input.input.source,
    isRealData: true,
    publicIntentId: input.input.publicIntentId,
    socialRequestId: input.input.socialRequestId,
    activityId: input.input.activityId,
    ...buildCandidateIdentityFields({
      user: input.input.user,
      displayName: input.input.displayName,
      city: input.input.city,
    }),
    interestTags: input.input.interestTags,
    profileCompleteness: input.input.profileCompleteness,
    dataQuality: candidateDataQuality(input.input.profileCompleteness),
    matchScore: input.input.matchScore,
    score: input.input.matchScore,
    level: candidateMatchLevel(input.input.matchScore),
    matchReasons: input.input.matchReasons,
    reasons: input.input.matchReasons,
    riskWarnings: input.riskWarnings,
    risk: input.risk,
    suggestedOpener,
    suggestedMessage: suggestedOpener,
    commonTags: input.input.commonTags,
    distanceKm: null,
    scoreBreakdown: input.input.scoreBreakdown,
    candidateRecordId: null,
    status: SocialRequestCandidateStatus.Suggested,
    matchedSignals: buildCandidateMatchedSignals({
      commonTags: input.input.commonTags,
      dynamicSignalReasons: input.dynamicExplanation.dynamicSignalReasons,
    }),
    publicReason: input.dynamicExplanation.whyYouMayLike,
    privateReason: input.dynamicExplanation.whyNow,
    riskWarning: firstCandidateRiskWarning({
      boundaryNotes: input.dynamicExplanation.boundaryNotes,
      riskWarnings: input.riskWarnings,
    }),
    nextAction: input.explanation.nextActionSuggestion,
    recommendationConsent: {
      profileDiscoverable: input.input.profile?.profileDiscoverable === true,
      agentCanRecommendMe: input.input.profile?.agentCanRecommendMe === true,
      sourceLabel:
        input.input.source === 'profile_candidate'
          ? '公开可发现且已允许 Agent 推荐'
          : '来自公开社交意图',
      privacyLabel: '资料已脱敏，不展示手机号、精确位置或私聊内容',
      strangerPolicyLabel,
    },
    relationshipGoal,
    idealType,
    invitePolicy,
    coldStartSignals: [
      input.input.city ? `同城：${input.input.city}` : '',
      strangerPolicyLabel,
      input.input.commonTags.length
        ? `共同兴趣：${input.input.commonTags.slice(0, 2).join('、')}`
        : '',
      input.dynamicExplanation.dynamicSignalReasons[0] ?? '',
      input.dynamicExplanation.boundaryNotes[0] ?? '',
    ].filter(Boolean),
    whyYouMayLike: input.dynamicExplanation.whyYouMayLike,
    whyNow: input.dynamicExplanation.whyNow,
    matchPoints: input.dynamicExplanation.matchPoints,
    boundaryNotes: input.dynamicExplanation.boundaryNotes,
    openerStrategy: input.dynamicExplanation.openerStrategy,
    dynamicSignalReasons: input.dynamicExplanation.dynamicSignalReasons,
    recentPublicActivity: input.input.recentPublicActivity ?? [],
    preferenceHistorySignals: input.dynamicExplanation.preferenceHistoryReasons,
    continuousFilterHints: input.dynamicExplanation.continuousFilterHints,
    candidateExplanation: input.explanation,
    emotionalInsight: buildCandidateEmotionalInsight({
      explanation: input.explanation,
      highRisk: input.highRisk,
    }),
    lifeGraphExplanation: input.explanation.lifeGraphExplanation,
  };
}

function candidateStrangerPolicyLabel(value: boolean | null | undefined): string {
  if (value === true) return '你已同意查看公开可发现的陌生人机会';
  if (value === false) return '你不接受陌生人，本次不会推荐陌生人';
  return '仅展示公开可发现且已授权推荐的资料';
}

function firstVisibleProfileText(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = typeof item === 'string' ? item.trim() : '';
        if (text) return text;
      }
      continue;
    }
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
