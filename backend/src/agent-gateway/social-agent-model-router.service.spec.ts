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
  it('routes natural conversation use cases to deepseek-chat', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-chat');
    expect(service.getModel('final_response')).toBe('deepseek-chat');
  });

  it('routes structured agent work to deepseek-v4-flash', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
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

    expect(service.getModel('casual_chat')).toBe('deepseek-chat');
    expect(service.getModel('final_response')).toBe('deepseek-chat');
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

  it('does not route legacy flash model into chat use cases', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-v4-flash' }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-chat');
    expect(service.getModel('final_response')).toBe('deepseek-chat');
  });

  it('keeps DEEPSEEK_MODEL as a compatible fallback for legacy chat envs', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-chat' }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-chat');
    expect(service.getModel('final_response')).toBe('deepseek-chat');
  });
});
