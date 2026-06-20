import { cleanDisplayText } from '../common/display-text.util';
import type {
  SocialAgentBrainAvailableTool,
  SocialAgentBrainPlannedTool,
} from './social-agent-brain.service';
import type { SocialAgentIntentType } from './social-agent-intent-router.service';

export interface SocialAgentLlmPlan {
  userIntent: SocialAgentIntentType;
  reason: string;
  state: string;
  shouldCallTool: boolean;
  tools: SocialAgentBrainPlannedTool[];
  needUserConfirmation: boolean;
  responseGoal: string;
}

export function normalizeSocialAgentBrainLlmPlan(
  parsed: Record<string, unknown>,
): SocialAgentLlmPlan {
  const rawIntent = parsed.intent ?? parsed.userIntent;
  const rawTools = Array.isArray(parsed.toolCalls)
    ? parsed.toolCalls
    : Array.isArray(parsed.tools)
      ? parsed.tools
      : [];
  return {
    userIntent: allowedIntent(rawIntent) ? rawIntent : 'unknown',
    reason: cleanDisplayText(parsed.reason, ''),
    state: cleanDisplayText(parsed.state, ''),
    shouldCallTool:
      parsed.shouldCallTools === true || parsed.shouldCallTool === true,
    tools: rawTools.flatMap((tool) => {
      if (!isRecord(tool)) return [];
      if (typeof tool.name !== 'string') return [];
      const name = cleanDisplayText(tool.name, '');
      const args = isRecord(tool.arguments) ? tool.arguments : {};
      return [{ name, arguments: args }];
    }),
    needUserConfirmation: parsed.needUserConfirmation === true,
    responseGoal: cleanDisplayText(parsed.responseGoal, ''),
  };
}

export function normalizeSocialAgentBrainPlannedTools(input: {
  tools: SocialAgentBrainPlannedTool[];
  intent: SocialAgentIntentType;
  availableTools: SocialAgentBrainAvailableTool[];
}): SocialAgentBrainPlannedTool[] {
  const allowed = new Set(input.availableTools.map((tool) => tool.name));
  return input.tools
    .map((tool) => ({ ...tool, name: canonicalBrainToolName(tool.name) }))
    .filter((tool) => allowed.has(tool.name))
    .filter((tool) => executableBrainToolNames.has(tool.name))
    .filter((tool) => isToolAllowedForIntent(tool.name, input.intent));
}

function isToolAllowedForIntent(
  name: string,
  intent: SocialAgentIntentType,
): boolean {
  if (name === 'update_profile_from_agent_context') {
    return profileWritingIntents.has(intent);
  }
  if (name === 'append_profile_memory') {
    return profileMemoryIntents.has(intent);
  }
  if (readOnlyBrainToolNames.has(name)) return true;
  if (name === 'search_real_candidates') return intent === 'social_search';
  if (name === 'search_public_intents') return intent === 'activity_search';
  if (name === 'create_social_request') return intent === 'social_search';
  if (confirmedActionToolNames.has(name)) return intent === 'action_request';
  return false;
}

function canonicalBrainToolName(name: string): string {
  const normalized = cleanDisplayText(name, '');
  const aliases: Record<string, string> = {
    search_candidates: 'search_real_candidates',
    search_matches: 'search_real_candidates',
    search_real_users: 'search_real_candidates',
    search_activities: 'create_social_request',
    request_action_confirmation: 'send_message_to_candidate',
    update_social_profile: 'update_profile_from_agent_context',
    update_ai_profile: 'update_profile_from_agent_context',
    save_profile_memory: 'update_profile_from_agent_context',
    get_conversation_history: 'get_conversation_messages',
  };
  return aliases[normalized] ?? normalized;
}

function allowedIntent(value: unknown): value is SocialAgentIntentType {
  return (
    typeof value === 'string' &&
    [
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
    ].includes(value)
  );
}

const executableBrainToolNames = new Set([
  'get_user_profile',
  'get_conversation_messages',
  'get_candidate_detail',
  'update_profile_from_agent_context',
  'append_profile_memory',
  'search_real_candidates',
  'search_public_intents',
  'create_social_request',
  'send_message_to_candidate',
  'connect_candidate',
  'create_activity',
]);

const readOnlyBrainToolNames = new Set([
  'get_user_profile',
  'get_conversation_messages',
  'get_candidate_detail',
]);

const confirmedActionToolNames = new Set([
  'send_message_to_candidate',
  'connect_candidate',
  'create_activity',
]);

const profileWritingIntents = new Set<SocialAgentIntentType>([
  'profile_enrichment',
  'profile_enrichment_request',
  'correction_or_clarification',
]);

const profileMemoryIntents = new Set<SocialAgentIntentType>([
  'profile_enrichment',
  'profile_enrichment_request',
  'correction_or_clarification',
  'profile_update',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
