import type { ConfigService } from '@nestjs/config';
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

  it('keeps card and summary work on card or fast models without a router', () => {
    expect(
      selectSocialAgentToolModel('candidate_summary', {
        config: makeConfig({
          AGENT_CARD_MODEL: 'card-specific',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('card-specific');
    expect(
      selectSocialAgentToolModel('card_generation', {
        config: makeConfig({
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('fast-shared');
  });

  it('keeps safety checks on fast or legacy structured models', () => {
    expect(
      selectSocialAgentToolModel('safety_check', {
        config: makeConfig({
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('fast-shared');
    expect(
      selectSocialAgentToolModel('safety_check', {
        config: makeConfig({ DEEPSEEK_MODEL: 'legacy' }),
      }),
    ).toBe('legacy');
  });

  it('uses planner-specific, fast, legacy, then default model for planner work', () => {
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({
          AGENT_PLANNER_MODEL: 'planner-specific',
          DEEPSEEK_FAST_MODEL: 'fast-shared',
          DEEPSEEK_MODEL: 'legacy',
        }),
      }),
    ).toBe('planner-specific');
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({ DEEPSEEK_FAST_MODEL: 'fast-shared' }),
      }),
    ).toBe('fast-shared');
    expect(
      selectSocialAgentToolModel('planner', {
        config: makeConfig({ DEEPSEEK_MODEL: 'legacy' }),
      }),
    ).toBe('legacy');
    expect(
      selectSocialAgentToolModel('planner', { config: makeConfig() }),
    ).toBe('deepseek-v4-flash');
  });

  it('resolves bounded DeepSeek timeouts without a router', () => {
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '7000' }),
      }),
    ).toBe(7000);
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({
          SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: undefined,
          DEEPSEEK_TIMEOUT_MS: '9000',
        }),
      }),
    ).toBe(9000);
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '20000' }),
      }),
    ).toBe(15_000);
    expect(
      selectSocialAgentToolTimeoutMs('planner', {
        config: makeConfig({ SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '-1' }),
      }),
    ).toBe(5000);
  });
});
