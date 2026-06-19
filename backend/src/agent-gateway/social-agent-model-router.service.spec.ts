import { ConfigService } from '@nestjs/config';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';

function makeConfig(
  env: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

describe('SocialAgentModelRouterService', () => {
  it('routes natural conversation use cases to explicit chat model env', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
  });

  it('routes structured agent work to deepseek-v4-flash', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('planner')).toBe('deepseek-v4-flash');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-flash');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-flash');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-flash');
  });

  it('falls back when env vars are missing', () => {
    const service = new SocialAgentModelRouterService(makeConfig());

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-flash');
    expect(service.getModel('final_response')).toBe('deepseek-v4-flash');
    expect(service.getModel('planner')).toBe('deepseek-v4-flash');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-flash');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-flash');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-flash');
    expect(service.getModel('safety_check')).toBe('deepseek-v4-flash');
  });

  it('uses specific agent model env vars before shared DeepSeek env vars', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_MODEL: 'legacy-model',
        DEEPSEEK_CHAT_MODEL: 'chat-shared',
        DEEPSEEK_FAST_MODEL: 'fast-shared',
        AGENT_FINAL_RESPONSE_MODEL: 'final-specific',
        AGENT_CASUAL_CHAT_MODEL: 'casual-specific',
        AGENT_PLANNER_MODEL: 'planner-specific',
        AGENT_EXTRACTOR_MODEL: 'extractor-specific',
        AGENT_CARD_MODEL: 'card-specific',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('casual-specific');
    expect(service.getModel('final_response')).toBe('final-specific');
    expect(service.getModel('planner')).toBe('planner-specific');
    expect(service.getModel('profile_extraction')).toBe('extractor-specific');
    expect(service.getModel('card_generation')).toBe('card-specific');
    expect(service.getModel('candidate_summary')).toBe('card-specific');
  });

  it('keeps chat use cases on fast flash fallback when only legacy flash is set', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-v4-flash' }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-flash');
    expect(service.getModel('final_response')).toBe('deepseek-v4-flash');
  });

  it('does not let shared DEEPSEEK_MODEL silently upgrade chat lanes to pro', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-flash');
    expect(service.getModel('final_response')).toBe('deepseek-v4-flash');
  });

  it('defaults thinking off and applies first chunk budgets', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS: '4200',
        SOCIAL_AGENT_PLANNER_THINKING: 'enabled',
      }),
    );

    expect(service.getThinkingMode('casual_chat')).toBe('disabled');
    expect(service.getThinkingMode('planner')).toBe('enabled');
    expect(service.getFirstChunkTimeout('casual_chat')).toBe(4200);
  });
});
