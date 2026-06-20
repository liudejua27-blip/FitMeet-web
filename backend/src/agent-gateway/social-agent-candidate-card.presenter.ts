import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { SocialRequestCandidateStatus } from '../match/social-request-candidate.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { CandidateExplanationService, type CandidateExplanation } from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { buildSocialMatchDynamicExplanation } from './social-agent-candidate-dynamic-explanation';
import { buildCandidateEmotionalInsight } from './social-agent-candidate-emotional-insight';
import { buildCandidateMatchedSignals } from './social-agent-candidate-display-fields';
import { buildCandidateIdentityFields } from './social-agent-candidate-identity-fields';
import type { CandidatePoolCandidate } from './social-agent-candidate-pool.service';
import type { CandidatePoolResolvedQuery } from './social-agent-candidate-pool-query';
import type { CandidatePoolSource } from './social-agent-candidate-pool-activity-result';
import { candidateDataQuality } from './social-agent-candidate-profile-presenter';
import { buildCandidateRiskSnapshot, firstCandidateRiskWarning } from './social-agent-candidate-risk';
import { candidateMatchLevel } from './social-agent-candidate-scoring';

type CandidateCardSceneRisk = Pick<SceneRiskPolicyService, 'evaluate' | 'normalizeScene'>;

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
  const sceneText = [...input.interestTags, ...input.commonTags, ...input.matchReasons].join(' ');
  const sceneType = input.sceneRisk.normalizeScene(null, sceneText);
  const policy = input.sceneRisk.evaluate({ sceneType, actionType: 'send_message', text: sceneText, permissionMode: 'limited_auto', safetySignals: input.lifeGraphSignals?.safetySignals });
  const candidateRisk = buildCandidateRiskSnapshot({
    dataQuality: quality,
    sceneRiskLevel: policy.riskLevel,
    safetyPrompts: policy.safetyPrompts,
  });
  const explanation = input.candidateExplanation.explain({
    userRequest: { rawText: sceneText, interestTags: input.interestTags },
    candidate: { displayName: input.displayName, city: input.city, commonTags: input.commonTags, interestTags: input.interestTags },
    matchScore: input.matchScore,
    matchReasons: input.matchReasons,
    sceneType,
    riskWarnings: candidateRisk.riskWarnings,
    lifeGraphSignals: input.lifeGraphSignals,
  });
  const dynamicExplanation = buildSocialMatchDynamicExplanation({ displayName: input.displayName, city: input.city, interestTags: input.interestTags, commonTags: input.commonTags, matchReasons: input.matchReasons, scoreBreakdown: input.scoreBreakdown, riskWarnings: candidateRisk.riskWarnings, lifeGraphSignals: input.lifeGraphSignals });
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
  const i = input.input;
  const d = input.dynamicExplanation;
  const suggestedOpener = input.explanation.suggestedOpener;
  const relationshipGoal = firstVisibleProfileText(i.profile?.relationshipGoals, i.lifeGraphSignals?.socialIntentSignals?.relationshipGoal);
  const idealType = firstVisibleProfileText(
    i.profile?.wantToMeet,
    i.profile?.preferredTraits,
    i.lifeGraphSignals?.socialIntentSignals?.wantToMeet,
    i.lifeGraphSignals?.socialIntentSignals?.preferredTraits,
  );
  const invitePolicy = i.profile?.agentCanStartChatAfterApproval === true
      ? '仅在你确认后，由 Agent 发送站内邀请'
      : '先生成开场白，你确认后再决定是否邀请';
  const strangerPolicyLabel = candidateStrangerPolicyLabel(i.query?.acceptsStrangers);
  return {
    source: i.source,
    isRealData: true,
    publicIntentId: i.publicIntentId,
    socialRequestId: i.socialRequestId,
    activityId: i.activityId,
    ...buildCandidateIdentityFields({ user: i.user, displayName: i.displayName, city: i.city }),
    interestTags: i.interestTags,
    profileCompleteness: i.profileCompleteness,
    dataQuality: candidateDataQuality(i.profileCompleteness),
    matchScore: i.matchScore,
    score: i.matchScore,
    level: candidateMatchLevel(i.matchScore),
    matchReasons: i.matchReasons,
    reasons: i.matchReasons,
    riskWarnings: input.riskWarnings,
    risk: input.risk,
    suggestedOpener,
    suggestedMessage: suggestedOpener,
    commonTags: i.commonTags,
    distanceKm: null,
    scoreBreakdown: i.scoreBreakdown,
    candidateRecordId: null,
    status: SocialRequestCandidateStatus.Suggested,
    matchedSignals: buildCandidateMatchedSignals({ commonTags: i.commonTags, dynamicSignalReasons: d.dynamicSignalReasons }),
    publicReason: d.whyYouMayLike,
    privateReason: d.whyNow,
    riskWarning: firstCandidateRiskWarning({ boundaryNotes: d.boundaryNotes, riskWarnings: input.riskWarnings }),
    nextAction: input.explanation.nextActionSuggestion,
    recommendationConsent: {
      profileDiscoverable: i.profile?.profileDiscoverable === true,
      agentCanRecommendMe: i.profile?.agentCanRecommendMe === true,
      sourceLabel: i.source === 'profile_candidate' ? '公开可发现且已允许 Agent 推荐' : '来自公开社交意图',
      privacyLabel: '资料已脱敏，不展示手机号、精确位置或私聊内容',
      strangerPolicyLabel,
    },
    relationshipGoal,
    idealType,
    invitePolicy,
    coldStartSignals: [
      i.city ? `同城：${i.city}` : '',
      strangerPolicyLabel,
      i.commonTags.length ? `共同兴趣：${i.commonTags.slice(0, 2).join('、')}` : '',
      d.dynamicSignalReasons[0] ?? '',
      d.boundaryNotes[0] ?? '',
    ].filter(Boolean),
    whyYouMayLike: d.whyYouMayLike,
    whyNow: d.whyNow,
    matchPoints: d.matchPoints,
    boundaryNotes: d.boundaryNotes,
    openerStrategy: d.openerStrategy,
    dynamicSignalReasons: d.dynamicSignalReasons,
    recentPublicActivity: i.recentPublicActivity ?? [],
    preferenceHistorySignals: d.preferenceHistoryReasons,
    continuousFilterHints: d.continuousFilterHints,
    candidateExplanation: input.explanation,
    emotionalInsight: buildCandidateEmotionalInsight({ explanation: input.explanation, highRisk: input.highRisk }),
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
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const text = typeof item === 'string' ? item.trim() : '';
      if (text) return text;
    }
  }
  return null;
}
