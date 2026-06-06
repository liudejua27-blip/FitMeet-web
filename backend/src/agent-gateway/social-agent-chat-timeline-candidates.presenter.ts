import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import {
  candidateExplanationFromRecord,
  emotionalInsightFromRecord,
} from './social-agent-chat-result.presenter';
import type { SocialAgentChatCandidate } from './social-agent-chat.types';

export function readSocialAgentTimelineCandidates(
  task: AgentTask,
  value: unknown,
): SocialAgentChatCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => candidateFromStoredSummary(task, item))
    .filter((candidate): candidate is SocialAgentChatCandidate => !!candidate);
}

function candidateFromStoredSummary(
  task: AgentTask,
  candidate: Record<string, unknown>,
): SocialAgentChatCandidate | null {
  const targetUserId =
    numberValue(candidate.targetUserId) ??
    numberValue(candidate.candidateUserId) ??
    numberValue(candidate.userId);
  if (!targetUserId) return null;
  const warnings = stringList(candidate.riskWarnings);
  const risk = isRecord(candidate.risk) ? candidate.risk : {};
  const riskWarnings =
    warnings.length > 0 ? warnings : stringList(risk.warnings);
  const nickname = cleanDisplayText(
    candidate.displayName ?? candidate.nickname,
    `用户 #${targetUserId}`,
  );
  return {
    agentTaskId: task.id,
    source:
      cleanDisplayText(candidate.source, '') === 'public_intent' ||
      cleanDisplayText(candidate.source, '') === 'activity'
        ? (cleanDisplayText(candidate.source, '') as
            | 'public_intent'
            | 'activity')
        : 'profile_candidate',
    isRealData: candidate.isRealData === true,
    socialRequestId: numberValue(candidate.socialRequestId),
    targetUserId,
    userId: targetUserId,
    candidateUserId: targetUserId,
    publicIntentId: cleanDisplayText(candidate.publicIntentId, '') || null,
    activityId: numberValue(candidate.activityId),
    displayName: nickname,
    candidateRecordId: numberValue(candidate.candidateRecordId),
    nickname,
    avatar: cleanDisplayText(candidate.avatar, ''),
    color: cleanDisplayText(candidate.color, '#202124'),
    city: cleanDisplayText(candidate.city, ''),
    score:
      numberValue(candidate.score) ?? numberValue(candidate.matchScore) ?? 0,
    level: cleanDisplayText(candidate.level, 'medium'),
    distanceKm: numberValue(candidate.distanceKm),
    commonTags: stringList(candidate.commonTags),
    reasons: stringList(candidate.reasons ?? candidate.matchReasons),
    interestTags: stringList(candidate.interestTags),
    profileCompleteness:
      numberValue(candidate.profileCompleteness) ?? undefined,
    dataQuality:
      candidate.dataQuality === 'complete' ||
      candidate.dataQuality === 'partial' ||
      candidate.dataQuality === 'incomplete'
        ? candidate.dataQuality
        : undefined,
    matchScore: numberValue(candidate.matchScore) ?? undefined,
    matchReasons: stringList(candidate.matchReasons),
    riskWarnings,
    risk: {
      level: cleanDisplayText(risk.level ?? candidate.riskLevel, 'low'),
      warnings: riskWarnings,
    },
    suggestedOpener: cleanDisplayText(candidate.suggestedOpener, ''),
    suggestedMessage: cleanDisplayText(candidate.suggestedMessage, ''),
    candidateExplanation: candidateExplanationFromRecord(
      candidate.candidateExplanation,
    ),
    emotionalInsight: emotionalInsightFromRecord(candidate.emotionalInsight),
    status: cleanDisplayText(candidate.status, '') || undefined,
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

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
