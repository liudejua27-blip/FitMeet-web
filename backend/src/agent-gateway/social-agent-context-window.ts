import { cleanDisplayText } from '../common/display-text.util';

// Real Agent chats include assistant text, visible process, tool, approval,
// and recovery events. Keep eighty message turns by default so DeepSeek still
// sees roughly twenty meaningful user/assistant rounds after those artifacts.
export const SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS = 80;
export const SOCIAL_AGENT_MAX_CONTEXT_TURNS = 120;

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

export function selectSocialAgentContextWindow<T>(
  history: T[] | undefined | null,
  limit = SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
): T[] {
  const safeHistory = Array.isArray(history) ? history : [];
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(
          Math.max(Math.floor(limit), SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS),
          SOCIAL_AGENT_MAX_CONTEXT_TURNS,
        )
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
