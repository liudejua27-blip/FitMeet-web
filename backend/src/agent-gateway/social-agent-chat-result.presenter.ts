import { cleanDisplayText } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { UpdateSocialRequestDto } from '../social-requests/dto/update-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import type {
  SocialAgentChatCandidate,
  SocialAgentRequestDraft,
} from './social-agent-chat.types';

export {
  candidateExplanationFromRecord,
  emotionalInsightFromRecord,
  toSocialAgentChatCandidate,
} from './social-agent-chat-candidate.presenter';

export function buildSocialAgentRequestDraft(input: {
  agentTaskId: number;
  draft: CreateSocialRequestDto;
  card: unknown;
  profileUsed: unknown;
}): SocialAgentRequestDraft {
  const { agentTaskId, draft, card, profileUsed } = input;
  return {
    ...draft,
    type: normalizeSocialRequestType(draft.type),
    rawText: cleanDisplayText(draft.rawText, ''),
    title: cleanDisplayText(draft.title, '约练草稿'),
    description: cleanDisplayText(
      draft.description,
      cleanDisplayText(draft.rawText, ''),
    ),
    city: sanitizeCity(draft.city),
    radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
    interestTags: Array.isArray(draft.interestTags) ? draft.interestTags : [],
    activityType: cleanDisplayText(draft.activityType, ''),
    safetyRequirement:
      draft.safetyRequirement ?? SocialRequestSafety.LowRiskOnly,
    visibility: SocialRequestVisibility.Private,
    status: UserSocialRequestStatus.Draft,
    requireUserConfirmation: true,
    agentAllowed: true,
    metadata: {
      ...(draft.metadata ?? {}),
      agentTaskId,
      source: 'social_agent_chat',
      publishPolicy: 'requires_user_confirmation',
    },
    agentTaskId,
    socialRequestId: null,
    mode: 'draft',
    card: isRecord(card) ? card : undefined,
    profileUsed: isRecord(profileUsed) ? profileUsed : undefined,
  };
}

export function toSocialAgentDraftDto(
  draft: SocialAgentRequestDraft,
): CreateSocialRequestDto {
  return {
    ...draft,
    type: normalizeSocialRequestType(draft.type),
    city: sanitizeCity(draft.city),
    status: UserSocialRequestStatus.Draft,
    visibility: SocialRequestVisibility.Private,
    requireUserConfirmation: true,
    source: SocialRequestSource.CustomAgent,
    metadata: {
      ...(draft.metadata ?? {}),
      socialRequestId: draft.socialRequestId ?? null,
    },
  };
}

export function toSocialAgentPublishDto(
  agentTaskId: number,
  draft: CreateSocialRequestDto & { socialRequestId?: number | null },
): UpdateSocialRequestDto & CreateSocialRequestDto {
  return {
    ...draft,
    type: normalizeSocialRequestType(draft.type),
    status: UserSocialRequestStatus.Matching,
    visibility: SocialRequestVisibility.Public,
    requireUserConfirmation: true,
    source: SocialRequestSource.CustomAgent,
    metadata: {
      ...(draft.metadata ?? {}),
      agentTaskId,
      socialRequestId: numberValue(
        draft.socialRequestId ?? draft.metadata?.socialRequestId,
      ),
      confirmationSource: 'social_agent_chat',
    },
  };
}

export function buildRecommendationAssistantMessage(
  candidates: SocialAgentChatCandidate[],
): string {
  if (candidates.length === 0) {
    return '当前没有找到符合条件的真实用户，我可以帮你发布一个约练需求，或者你可以放宽城市、时间、兴趣条件。';
  }
  const first = candidates[0];
  const visibleCount = Math.min(candidates.length, 3);
  const explanation = first.candidateExplanation;
  const reason =
    explanation?.fitReasons?.[0] ||
    first.emotionalInsight?.fitReason ||
    first.reasons.slice(0, 2).join('；') ||
    '画像和需求较匹配';
  const opener =
    explanation?.suggestedOpener ||
    first.emotionalInsight?.openerAdvice ||
    first.suggestedMessage;
  const safeStep =
    explanation?.safeFirstStep ||
    first.emotionalInsight?.safeFirstStep ||
    '第一次建议选择公开场所，并先在站内确认时间、地点和边界。';
  return `我先给你整理出 ${visibleCount} 个安全机会。优先看 ${first.nickname}：${reason} 开场白可以这样说：${opener} 第一步建议：${safeStep}。你确认后我才会发送邀请或连接对方。`;
}

function normalizeSocialRequestType(value: unknown): SocialRequestType {
  return Object.values(SocialRequestType).includes(value as SocialRequestType)
    ? (value as SocialRequestType)
    : SocialRequestType.Custom;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}
