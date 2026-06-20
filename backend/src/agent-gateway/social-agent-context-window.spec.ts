import {
  SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS,
  SOCIAL_AGENT_MAX_CONTEXT_TURNS,
  selectSocialAgentContextWindow,
  socialAgentContextTurnLimit,
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

  it('does not let explicit tiny windows weaken LLM-facing memory', () => {
    const history = Array.from({ length: 100 }, (_, index) => `turn-${index}`);

    expect(selectSocialAgentContextWindow(history, 20)).toEqual(
      history.slice(-SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS),
    );
    expect(selectSocialAgentContextWindow(history, 8)).toEqual(
      history.slice(-SOCIAL_AGENT_DEFAULT_CONTEXT_TURNS),
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
