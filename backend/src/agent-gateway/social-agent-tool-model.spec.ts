import type { ConfigService } from '@nestjs/config';
import {
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
} from './social-agent-model-router.service';
import {
  selectSocialAgentToolModel,
  selectSocialAgentToolTimeoutMs,
  socialAgentToolModelUseCaseForPurpose,
} from './social-agent-tool-model';

function makeConfig(env: Record<string, string | undefined> = {}) {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

describe('social agent tool model helpers', () => {
  it('routes tool purposes to structured model use cases', () => {
    expect(socialAgentToolModelUseCaseForPurpose('summarize_reply')).toBe(
      'candidate_summary',
    );
    expect(socialAgentToolModelUseCaseForPurpose('match_candidates')).toBe(
      'candidate_summary',
    );
    expect(socialAgentToolModelUseCaseForPurpose('social_request_card')).toBe(
      'card_generation',
    );
    expect(socialAgentToolModelUseCaseForPurpose('boundary_risk_check')).toBe(
      'safety_check',
    );
    expect(
      socialAgentToolModelUseCaseForPurpose('decide_next_social_action'),
    ).toBe('planner');
  });

  it('uses the injected model router when available', () => {
    const modelRouter = {
      getModel: jest.fn(() => 'router-model'),
      getTimeout: jest.fn(() => 4321),
    };

    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({ AGENT_PLANNER_MODEL: 'planner-env' }),
        modelRouter,
      }),
    ).toBe('router-model');
    expect(modelRouter.getModel).toHaveBeenCalledWith('planner');
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '9000' }),
        modelRouter,
      }),
    ).toBe(4321);
    expect(modelRouter.getTimeout).toHaveBeenCalledWith('planner');
  });

  it('keeps card and summary work on quality models without a router', () => {
    expect(
      selectSocialAgentToolModel('candidate_summary', {
        config: makeConfig({
          AGENT_CARD_MODEL: 'card-specific',
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('card-specific');
    expect(
      selectSocialAgentToolModel('card_generation', {
        config: makeConfig({
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('chat-shared');
  });

  it('ignores flash overrides for quality tool work without a router', () => {
    const config = makeConfig({
      AGENT_PLANNER_MODEL: 'deepseek-v4-flash',
      AGENT_CARD_MODEL: 'deepseek-v4-flash',
      AGENT_SAFETY_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_CHAT_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_MODEL: 'deepseek-v4-flash',
    });

    expect(selectSocialAgentToolModel('planner', { config })).toBe(
      'deepseek-v4-pro',
    );
    expect(selectSocialAgentToolModel('candidate_summary', { config })).toBe(
      'deepseek-v4-pro',
    );
    expect(selectSocialAgentToolModel('card_generation', { config })).toBe(
      'deepseek-v4-pro',
    );
    expect(selectSocialAgentToolModel('safety_check', { config })).toBe(
      'deepseek-v4-pro',
    );
  });

  it('does not let fast routing mode downgrade lightweight card and summary work', () => {
    expect(
      selectSocialAgentToolModel('candidate_summary', {
        config: makeConfig({
          SOCIAL_AGENT_MODEL_ROUTING_MODE: 'fast',
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('chat-shared');
  });

  it('keeps safety checks on safety or quality models by default', () => {
    expect(
      selectSocialAgentToolModel('safety_check', {
        config: makeConfig({
          AGENT_SAFETY_MODEL: 'safety-specific',
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('safety-specific');
    expect(
      selectSocialAgentToolModel('safety_check', {
        config: makeConfig({
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('chat-shared');
  });

  it('uses planner-specific, shared, then quality default model for planner work', () => {
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({
          AGENT_PLANNER_MODEL: 'planner-specific',
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('planner-specific');
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({
          DEEPSEEK_CHAT_MODEL: 'chat-shared',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
        }),
      }),
    ).toBe('chat-shared');
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({ DEEPSEEK_FAST_MODEL: 'fast-shared' }),
      }),
    ).toBe('deepseek-v4-pro');
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({ DEEPSEEK_MODEL: 'legacy' }),
      }),
    ).toBe('deepseek-v4-pro');
    expect(
      selectSocialAgentToolModel('planner', { config: makeConfig() }),
    ).toBe('deepseek-v4-pro');
  });

  it('does not let fast routing mode downgrade planner fallback', () => {
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({ SOCIAL_AGENT_MODEL_ROUTING_MODE: 'fast' }),
      }),
    ).toBe('deepseek-v4-pro');
  });

  it('normalizes legacy deepseek-v4 aliases to the reasoning model', () => {
    expect(
      selectSocialAgentToolModel('candidate_summary', {
        config: makeConfig({
          AGENT_CARD_MODEL: 'deepseek-v4',
        }),
      }),
    ).toBe('deepseek-v4-pro');
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({
          AGENT_PLANNER_MODEL: 'deepseek-v4',
        }),
      }),
    ).toBe('deepseek-v4-pro');
  });

  it('resolves quality DeepSeek timeouts without weakening planner and tool lanes', () => {
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '7000' }),
      }),
    ).toBe(SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({
          SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: undefined,
          DEEPSEEK_TIMEOUT_MS: '9000',
        }),
      }),
    ).toBe(SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '20000' }),
      }),
    ).toBe(SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '-1' }),
      }),
    ).toBe(SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    expect(
      selectSocialAgentToolTimeoutMs('candidate_summary', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '5000' }),
      }),
    ).toBe(SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS);
    expect(
      selectSocialAgentToolTimeoutMs('candidate_summary', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '40000' }),
      }),
    ).toBe(30_000);
  });
});
