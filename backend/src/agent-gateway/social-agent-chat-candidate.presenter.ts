import { cleanDisplayText } from '../common/display-text.util';
import type { MatchedCandidateView } from '../match/match.service';
import { CandidateExplanation } from './candidate-explanation.service';
import type { SocialAgentChatCandidate } from './social-agent-chat.types';

export function candidateExplanationFromRecord(
  value: unknown,
): CandidateExplanation | undefined {
  if (!isRecord(value)) return undefined;
  const fitReasons = stringList(value.fitReasons);
  const awkwardPoints = stringList(value.awkwardPoints);
  const suggestedOpener = cleanDisplayText(value.suggestedOpener, '');
  const safeFirstStep = cleanDisplayText(value.safeFirstStep, '');
  if (!fitReasons.length || !suggestedOpener || !safeFirstStep)
    return undefined;
  return {
    fitReasons,
    suggestedOpener,
    awkwardPoints,
    safeFirstStep,
    nextActionSuggestion: cleanDisplayText(
      value.nextActionSuggestion,
      '确认后发送轻量开场',
    ),
    requiresConfirmation: value.requiresConfirmation === true,
  };
}

export function emotionalInsightFromRecord(
  value: unknown,
): SocialAgentChatCandidate['emotionalInsight'] {
  if (!isRecord(value)) return undefined;
  const fitReason = cleanDisplayText(value.fitReason, '');
  const openerAdvice = cleanDisplayText(value.openerAdvice, '');
  const possibleAwkwardness = cleanDisplayText(value.possibleAwkwardness, '');
  const safeFirstStep = cleanDisplayText(value.safeFirstStep, '');
  if (!fitReason || !openerAdvice || !safeFirstStep) return undefined;
  return {
    fitReason,
    openerAdvice,
    possibleAwkwardness,
    safeFirstStep,
    tone:
      value.tone === 'active' ||
      value.tone === 'careful' ||
      value.tone === 'gentle'
        ? value.tone
        : undefined,
  };
}

export function toSocialAgentChatCandidate(
  agentTaskId: number,
  socialRequestId: number | null,
  candidate: MatchedCandidateView,
): SocialAgentChatCandidate {
  const record = candidate as MatchedCandidateView & Record<string, unknown>;
  const candidateSource = cleanDisplayText(record.source, 'profile_candidate');
  const displayName = cleanDisplayText(
    record.displayName ?? candidate.nickname,
    '用户',
  );
  const matchScore =
    numberValue(record.matchScore) ?? Math.round(candidate.score);
  const matchReasons = Array.isArray(record.matchReasons)
    ? record.matchReasons
        .map((reason) => cleanDisplayText(reason, ''))
        .filter(Boolean)
    : (candidate.reasons ?? [])
        .map((reason) => cleanDisplayText(reason, ''))
        .filter(Boolean);
  const riskWarnings = Array.isArray(record.riskWarnings)
    ? record.riskWarnings
        .map((warning) => cleanDisplayText(warning, ''))
        .filter(Boolean)
    : (candidate.risk?.warnings ?? [])
        .map((warning) => cleanDisplayText(warning, ''))
        .filter(Boolean);
  const targetUserId =
    numberValue(record.targetUserId) ??
    numberValue(record.candidateUserId) ??
    numberValue(candidate.candidateUserId) ??
    numberValue(candidate.userId) ??
    candidate.userId;
  return {
    agentTaskId,
    source:
      candidateSource === 'public_intent' || candidateSource === 'activity'
        ? candidateSource
        : 'profile_candidate',
    isRealData: record.isRealData === true,
    socialRequestId: numberValue(record.socialRequestId) ?? socialRequestId,
    targetUserId,
    userId: targetUserId,
    candidateUserId: targetUserId,
    publicIntentId: cleanDisplayText(record.publicIntentId, '') || null,
    activityId: numberValue(record.activityId),
    displayName,
    candidateRecordId: candidate.candidateRecordId ?? null,
    nickname: displayName,
    avatar: cleanDisplayText(candidate.avatar, ''),
    color: cleanDisplayText(candidate.color, '#202124'),
    city: cleanDisplayText(record.city, ''),
    score: matchScore,
    level: String(candidate.level),
    distanceKm: candidate.distanceKm,
    commonTags: (candidate.commonTags ?? [])
      .map((tag) => cleanDisplayText(tag, ''))
      .filter(Boolean),
    reasons: matchReasons,
    interestTags: Array.isArray(record.interestTags)
      ? record.interestTags
          .map((tag) => cleanDisplayText(tag, ''))
          .filter(Boolean)
      : [],
    profileCompleteness: numberValue(record.profileCompleteness) ?? undefined,
    dataQuality:
      record.dataQuality === 'complete' ||
      record.dataQuality === 'partial' ||
      record.dataQuality === 'incomplete'
        ? record.dataQuality
        : undefined,
    matchScore,
    matchReasons,
    riskWarnings,
    recentPublicActivity: stringList(record.recentPublicActivity),
    risk: {
      level: String(candidate.risk?.level ?? 'low'),
      warnings: riskWarnings,
    },
    suggestedOpener: cleanDisplayText(record.suggestedOpener, ''),
    suggestedMessage: cleanDisplayText(
      candidate.suggestedMessage ?? record.suggestedOpener,
      '',
    ),
    candidateExplanation: candidateExplanationFromRecord(
      record.candidateExplanation,
    ),
    emotionalInsight: emotionalInsightFromRecord(record.emotionalInsight),
    status: candidate.status ? String(candidate.status) : undefined,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean)
        .slice(0, 20)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
