import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentAssistantMessageSource } from './social-agent-chat.types';
import type { SocialAgentDeltaHandler } from './social-agent-chat-llm.types';

export function createTrackedSocialAgentDeltaHandler(
  handler: SocialAgentDeltaHandler | undefined,
): {
  onDelta: SocialAgentDeltaHandler | undefined;
  emittedDelta: () => boolean;
} {
  let emitted = false;
  return {
    onDelta: handler
      ? async (delta: string) => {
          if (cleanDisplayText(delta, '').trim()) emitted = true;
          await handler(delta);
        }
      : undefined,
    emittedDelta: () => emitted,
  };
}

export function socialAgentAnswerSource(
  answer: string,
  fallbackReply: string,
  emittedDelta: boolean,
): SocialAgentAssistantMessageSource {
  if (emittedDelta) return 'llm';
  return cleanDisplayText(answer, '').trim() ===
    cleanDisplayText(fallbackReply, '').trim()
    ? 'fallback'
    : 'llm';
}
