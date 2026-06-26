import type {
  UserFacingAgentPublicLoop,
  UserFacingAgentResponse,
} from './user-facing-agent-response';

const INTERNAL_TERM_PATTERN =
  /\b(traceId|checkpointId|toolName|planner|handoff|subagent|raw JSON|Life Graph Agent|Match Agent)\b/i;
const PUBLISHED_CLAIM_PATTERN =
  /(已发布|发布成功|已经发布|发现页可见|Discover\s*可见)/i;
const MATCHED_CLAIM_PATTERN =
  /(已匹配|匹配成功|已经匹配|找到候选|推荐候选|候选已返回)/i;

export function validateUserFacingAgentResponse(
  response: UserFacingAgentResponse,
): UserFacingAgentResponse {
  const serialized = JSON.stringify(response);
  if (INTERNAL_TERM_PATTERN.test(serialized)) {
    throw new Error('user_facing_response_internal_term_leaked');
  }
  const message = response.assistantMessage ?? '';
  if (
    PUBLISHED_CLAIM_PATTERN.test(message) &&
    !hasVerifiedPublicIntent(response.publicLoop)
  ) {
    throw new Error(
      'user_facing_response_claims_published_without_public_intent',
    );
  }
  if (
    MATCHED_CLAIM_PATTERN.test(message) &&
    candidateCardCount(response) === 0
  ) {
    throw new Error('user_facing_response_claims_matched_without_candidates');
  }
  if (
    response.publicLoop?.stage === 'candidates_recommended' &&
    !hasVerifiedPublicIntent(response.publicLoop)
  ) {
    throw new Error('user_facing_response_candidates_before_discover_verified');
  }
  if (
    response.publicLoop?.stage === 'dismissed' &&
    candidateCardCount(response) > 0
  ) {
    throw new Error('user_facing_response_dismissed_contains_candidates');
  }
  return response;
}

function hasVerifiedPublicIntent(
  publicLoop: UserFacingAgentPublicLoop | undefined,
): boolean {
  return Boolean(
    publicLoop?.publicIntentId &&
    (publicLoop.discoverHref || publicLoop.publicIntentHref),
  );
}

function candidateCardCount(response: UserFacingAgentResponse): number {
  return response.cards.filter((card) =>
    /candidate/i.test(`${card.type ?? ''} ${card.schemaType ?? ''}`),
  ).length;
}
