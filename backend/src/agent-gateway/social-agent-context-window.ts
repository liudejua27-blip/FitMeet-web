import { cleanDisplayText } from '../common/display-text.util';

// Stored conversation history is intentionally larger than the LLM window so
// restore, audit, and admin replay can retain context without sending it all to
// the model on every turn.
export const SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS = 80;
export const SOCIAL_AGENT_MAX_CONTEXT_TURNS = 120;
export const SOCIAL_AGENT_STORED_CONTEXT_MAX_TURNS =
  SOCIAL_AGENT_MAX_CONTEXT_TURNS;

export const SOCIAL_AGENT_LLM_CONTEXT_MIN_TURNS = 4;
export const SOCIAL_AGENT_LLM_CONTEXT_DEFAULT_TURNS = 12;
export const SOCIAL_AGENT_LLM_CONTEXT_MAX_TURNS = 40;

export type SocialAgentContextMode =
  | 'router'
  | 'ordinary_chat'
  | 'match'
  | 'life_graph'
  | 'answer'
  | 'deep_recovery';

export interface SocialAgentContextConfigReader {
  get(key: string): string | undefined;
}

export function socialAgentContextTurnLimit(
  config?: SocialAgentContextConfigReader | null,
): number {
  const configured = Number(
    config?.get('SOCIAL_AGENT_CONTEXT_TURN_LIMIT') ??
      config?.get('SOCIAL_AGENT_RECENT_MESSAGE_LIMIT') ??
      '',
  );
  if (!Number.isFinite(configured) || configured <= 0) {
    return SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS;
  }
  return Math.min(
    Math.max(Math.floor(configured), SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS),
    SOCIAL_AGENT_MAX_CONTEXT_TURNS,
  );
}

export function socialAgentLlmContextTurnLimit(
  config?: SocialAgentContextConfigReader | null,
  mode: SocialAgentContextMode = 'router',
): number {
  const configured = Number(
    config?.get('SOCIAL_AGENT_LLM_CONTEXT_TURN_LIMIT') ?? '',
  );
  const fallbackByMode: Record<SocialAgentContextMode, number> = {
    router: 4,
    ordinary_chat: 8,
    match: SOCIAL_AGENT_LLM_CONTEXT_DEFAULT_TURNS,
    life_graph: SOCIAL_AGENT_LLM_CONTEXT_DEFAULT_TURNS,
    answer: 8,
    deep_recovery: 32,
  };
  const raw =
    Number.isFinite(configured) && configured > 0
      ? Math.floor(configured)
      : fallbackByMode[mode];
  return Math.min(
    Math.max(raw, SOCIAL_AGENT_LLM_CONTEXT_MIN_TURNS),
    SOCIAL_AGENT_LLM_CONTEXT_MAX_TURNS,
  );
}

export function selectSocialAgentContextWindow<T>(
  history: T[] | undefined | null,
  limit = SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
): T[] {
  const safeHistory = Array.isArray(history) ? history : [];
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.max(Math.floor(limit), 1), SOCIAL_AGENT_MAX_CONTEXT_TURNS)
      : SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS;
  return safeHistory.slice(-safeLimit);
}

export function normalizeSocialAgentContextTurn(
  turn: Record<string, unknown>,
): { role: string; text: string } {
  return {
    role: cleanDisplayText(turn.role, ''),
    text: cleanDisplayText(turn.text ?? turn.content, ''),
  };
}
