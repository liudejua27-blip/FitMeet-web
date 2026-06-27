import {
  SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
  SOCIAL_AGENT_LLM_CONTEXT_DEFAULT_TURNS,
  SOCIAL_AGENT_LLM_CONTEXT_MAX_TURNS,
  SOCIAL_AGENT_MAX_CONTEXT_TURNS,
  selectSocialAgentContextWindow,
  socialAgentContextTurnLimit,
  socialAgentLlmContextTurnLimit,
} from './social-agent-context-window';

function config(env: Record<string, string | undefined>) {
  return { get: jest.fn((key: string) => env[key]) };
}

describe('social-agent-context-window', () => {
  it('defaults to the production conversation memory window', () => {
    expect(socialAgentContextTurnLimit()).toBe(
      SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
    );
  });

  it('allows larger configured windows but clamps them to a safe maximum', () => {
    expect(
      socialAgentContextTurnLimit(
        config({ SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '8' }),
      ),
    ).toBe(SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS);
    expect(
      socialAgentContextTurnLimit(
        config({ SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '80' }),
      ),
    ).toBe(SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS);
    expect(
      socialAgentContextTurnLimit(
        config({ SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '100' }),
      ),
    ).toBe(100);
    expect(
      socialAgentContextTurnLimit(
        config({ SOCIAL_AGENT_CONTEXT_TURN_LIMIT: '200' }),
      ),
    ).toBe(SOCIAL_AGENT_MAX_CONTEXT_TURNS);
  });

  it('uses compact mode-specific LLM windows', () => {
    expect(socialAgentLlmContextTurnLimit()).toBe(4);
    expect(socialAgentLlmContextTurnLimit(undefined, 'ordinary_chat')).toBe(8);
    expect(socialAgentLlmContextTurnLimit(undefined, 'match')).toBe(
      SOCIAL_AGENT_LLM_CONTEXT_DEFAULT_TURNS,
    );
    expect(socialAgentLlmContextTurnLimit(undefined, 'deep_recovery')).toBe(32);
    expect(
      socialAgentLlmContextTurnLimit(
        config({ SOCIAL_AGENT_LLM_CONTEXT_TURN_LIMIT: '2' }),
        'match',
      ),
    ).toBe(4);
    expect(
      socialAgentLlmContextTurnLimit(
        config({ SOCIAL_AGENT_LLM_CONTEXT_TURN_LIMIT: '200' }),
        'match',
      ),
    ).toBe(SOCIAL_AGENT_LLM_CONTEXT_MAX_TURNS);
  });

  it('respects explicit tiny windows for LLM-facing selectors', () => {
    const history = Array.from({ length: 100 }, (_, index) => `turn-${index}`);

    expect(selectSocialAgentContextWindow(history, 20)).toEqual(
      history.slice(-20),
    );
    expect(selectSocialAgentContextWindow(history, 8)).toEqual(
      history.slice(-8),
    );
    expect(history).toHaveLength(100);
  });

  it('selects the latest turns without mutating the original history', () => {
    const history = Array.from({ length: 120 }, (_, index) => `turn-${index}`);

    expect(selectSocialAgentContextWindow(history, 100)).toEqual(
      history.slice(-100),
    );
    expect(history).toHaveLength(120);
  });
});
