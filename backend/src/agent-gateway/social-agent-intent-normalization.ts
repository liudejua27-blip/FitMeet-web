import { sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import type {
  SocialAgentIntentEntities,
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
  SocialAgentReplyStrategy,
} from './social-agent-intent-router.service';

export function normalizeDeepSeekIntentRouterResult(
  parsed: Record<string, unknown>,
  fallback: SocialAgentIntentRouterResult,
): SocialAgentIntentRouterResult {
  const intent = allowedIntent(parsed.intent) ? parsed.intent : fallback.intent;
  const confidence = clampConfidence(parsed.confidence, fallback.confidence);
  const entities = normalizeIntentEntities(parsed.entities, fallback.entities);
  const rawShouldSearch =
    typeof parsed.shouldSearch === 'boolean'
      ? parsed.shouldSearch
      : fallback.shouldSearch;
  const rawShouldReplan =
    typeof parsed.shouldReplan === 'boolean'
      ? parsed.shouldReplan
      : fallback.shouldReplan;
  const rawShouldUpdateProfile =
    typeof parsed.shouldUpdateProfile === 'boolean'
      ? parsed.shouldUpdateProfile
      : fallback.shouldUpdateProfile;
  const rawShouldExecuteAction =
    typeof parsed.shouldExecuteAction === 'boolean'
      ? parsed.shouldExecuteAction
      : fallback.shouldExecuteAction;
  const rawReplyStrategy = allowedReplyStrategy(parsed.replyStrategy)
    ? parsed.replyStrategy
    : fallback.replyStrategy;
  const replyStrategy = normalizeReplyStrategyForIntent(
    intent,
    rawReplyStrategy,
    rawShouldSearch,
  );
  const shouldSearch = isSearchAllowed(intent) ? rawShouldSearch : false;
  const shouldReplan = shouldSearch ? rawShouldReplan : false;
  const shouldUpdateProfile =
    intent === 'profile_update' ||
    intent === 'profile_enrichment' ||
    intent === 'safety_or_boundary'
      ? rawShouldUpdateProfile
      : false;
  const shouldExecuteAction =
    intent === 'action_request' ? rawShouldExecuteAction : false;

  return {
    intent,
    confidence,
    entities,
    shouldSearch,
    shouldReplan,
    shouldUpdateProfile,
    shouldExecuteAction,
    replyStrategy,
    source: 'deepseek',
  };
}

function normalizeIntentEntities(
  value: unknown,
  fallback: SocialAgentIntentEntities,
): SocialAgentIntentEntities {
  const record = isRecord(value) ? value : {};
  return {
    city: sanitizeCity(record.city ?? fallback.city),
    activityType: cleanDisplayText(record.activityType, fallback.activityType),
    targetGender: cleanDisplayText(record.targetGender, fallback.targetGender),
    timePreference: cleanDisplayText(
      record.timePreference,
      fallback.timePreference,
    ),
    locationPreference: cleanDisplayText(
      record.locationPreference,
      fallback.locationPreference,
    ),
  };
}

function allowedIntent(value: unknown): value is SocialAgentIntentType {
  return [
    'casual_chat',
    'product_help',
    'workflow_help',
    'profile_enrichment',
    'profile_enrichment_request',
    'correction_or_clarification',
    'profile_update',
    'social_search',
    'activity_search',
    'candidate_followup',
    'action_request',
    'safety_or_boundary',
    'fitness_math',
    'unknown',
  ].includes(String(value));
}

function allowedReplyStrategy(
  value: unknown,
): value is SocialAgentReplyStrategy {
  return (
    typeof value === 'string' &&
    [
      'conversational_answer',
      'direct_reply',
      'ask_clarifying_question',
      'append_context',
      'search_candidates',
      'search_activities',
      'execute_action',
    ].includes(value)
  );
}

function isSearchAllowed(intent: SocialAgentIntentType): boolean {
  return ['social_search', 'activity_search', 'candidate_followup'].includes(
    intent,
  );
}

function normalizeReplyStrategyForIntent(
  intent: SocialAgentIntentType,
  replyStrategy: SocialAgentReplyStrategy,
  shouldSearch: boolean,
): SocialAgentReplyStrategy {
  if (
    intent === 'product_help' ||
    intent === 'workflow_help' ||
    intent === 'profile_enrichment' ||
    intent === 'profile_enrichment_request' ||
    intent === 'correction_or_clarification' ||
    intent === 'fitness_math' ||
    intent === 'casual_chat' ||
    intent === 'unknown'
  ) {
    return 'conversational_answer';
  }
  if (intent === 'profile_update' || intent === 'safety_or_boundary') {
    return 'append_context';
  }
  if (intent === 'action_request') return 'execute_action';
  if (intent === 'activity_search') return 'search_activities';
  if (intent === 'social_search') return 'search_candidates';
  if (intent === 'candidate_followup') {
    return shouldSearch ? 'search_candidates' : 'direct_reply';
  }
  return replyStrategy;
}

function clampConfidence(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
