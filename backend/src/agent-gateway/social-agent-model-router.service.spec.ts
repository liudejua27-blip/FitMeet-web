import { ConfigService } from '@nestjs/config';
import {
  SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
  SocialAgentModelRouterService,
  type SocialAgentModelUseCase,
} from './social-agent-model-router.service';

function makeConfig(
  env: Record<string, string | undefined> = {},
): ConfigService {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

describe('SocialAgentModelRouterService', () => {
  const useCases: SocialAgentModelUseCase[] = [
    'casual_chat',
    'final_response',
    'planner',
    'brain',
    'profile_extraction',
    'card_generation',
    'candidate_summary',
    'safety_check',
  ];

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

  it('keeps planner and reasoning tool work high-quality by default', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-pro');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-pro');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-pro');
    expect(service.getModel('safety_check')).toBe('deepseek-v4-pro');
  });

  it('ignores flash model overrides in quality mode so DeepSeek reasoning lanes are not downgraded', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_MODEL_ROUTING_MODE: 'quality',
        AGENT_CASUAL_CHAT_MODEL: 'deepseek-v4-flash',
        AGENT_FINAL_RESPONSE_MODEL: 'deepseek-v4-flash',
        AGENT_PLANNER_MODEL: 'deepseek-v4-flash',
        AGENT_BRAIN_MODEL: 'deepseek-v4-flash',
        AGENT_EXTRACTOR_MODEL: 'deepseek-v4-flash',
        AGENT_CARD_MODEL: 'deepseek-v4-flash',
        AGENT_SAFETY_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-pro');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-pro');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-pro');
    expect(service.getModel('safety_check')).toBe('deepseek-v4-pro');
  });

  it('routes planner to the high-quality chat model in quality mode', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_MODEL_ROUTING_MODE: 'quality',
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4-pro',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
    expect(service.getTimeout('planner')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
    );
    expect(service.getTimeout('brain')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('planner')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('brain')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('casual_chat')).toBe(
      SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
    );
  });

  it('does not let stale low planner timeout env weaken DeepSeek planning', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_PLANNER_TIMEOUT_MS: '2500',
        SOCIAL_AGENT_PLANNER_FIRST_CHUNK_TIMEOUT_MS: '3500',
      }),
    );

    expect(service.getTimeout('planner')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
    );
    expect(service.getTimeout('brain')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('planner')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('brain')).toBe(
      SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
    );
  });

  it('does not let stale low chat timeout env weaken natural conversation', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS: '5000',
        SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS: '3500',
        SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS: '5000',
        SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS: '3500',
      }),
    );

    expect(service.getTimeout('casual_chat')).toBe(
      SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('casual_chat')).toBe(
      SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getTimeout('final_response')).toBe(
      SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('final_response')).toBe(
      SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
    );
  });

  it('does not let fast mode or stale low tool timeout env weaken tool reasoning', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_MODEL_ROUTING_MODE: 'fast',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
        SOCIAL_AGENT_CARD_TIMEOUT_MS: '2500',
        SOCIAL_AGENT_CARD_FIRST_CHUNK_TIMEOUT_MS: '3500',
        SOCIAL_AGENT_CANDIDATE_SUMMARY_TIMEOUT_MS: '2500',
        SOCIAL_AGENT_CANDIDATE_SUMMARY_FIRST_CHUNK_TIMEOUT_MS: '3500',
        SOCIAL_AGENT_SAFETY_TIMEOUT_MS: '2500',
        SOCIAL_AGENT_SAFETY_FIRST_CHUNK_TIMEOUT_MS: '3500',
      }),
    );

    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-pro');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-pro');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-pro');
    expect(service.getModel('safety_check')).toBe('deepseek-v4-pro');
    expect(service.getTimeout('card_generation')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('card_generation')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getTimeout('candidate_summary')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('candidate_summary')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getTimeout('safety_check')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('safety_check')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
    );
  });

  it('falls back when env vars are missing', () => {
    const service = new SocialAgentModelRouterService(makeConfig());

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-pro');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-pro');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-pro');
    expect(service.getModel('safety_check')).toBe('deepseek-v4-pro');
  });

  it('normalizes legacy deepseek-v4 aliases to the reasoning model', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-v4',
        AGENT_CARD_MODEL: 'deepseek-v4',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-pro');
  });

  it('rejects legacy deepseek-chat aliases so Agent quality lanes stay on explicit v4 models', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
        DEEPSEEK_MODEL: 'deepseek-chat',
        AGENT_PLANNER_MODEL: 'deepseek-chat',
        AGENT_BRAIN_MODEL: 'deepseek-chat',
        AGENT_CARD_MODEL: 'deepseek-chat',
        AGENT_SAFETY_MODEL: 'deepseek-chat',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
    expect(service.getModel('profile_extraction')).toBe('deepseek-v4-pro');
    expect(service.getModel('card_generation')).toBe('deepseek-v4-pro');
    expect(service.getModel('candidate_summary')).toBe('deepseek-v4-pro');
    expect(service.getModel('safety_check')).toBe('deepseek-v4-pro');
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
        AGENT_BRAIN_MODEL: 'brain-specific',
        AGENT_EXTRACTOR_MODEL: 'extractor-specific',
        AGENT_CARD_MODEL: 'card-specific',
        AGENT_SAFETY_MODEL: 'safety-specific',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('casual-specific');
    expect(service.getModel('final_response')).toBe('final-specific');
    expect(service.getModel('planner')).toBe('planner-specific');
    expect(service.getModel('brain')).toBe('brain-specific');
    expect(service.getModel('profile_extraction')).toBe('extractor-specific');
    expect(service.getModel('card_generation')).toBe('card-specific');
    expect(service.getModel('candidate_summary')).toBe('card-specific');
    expect(service.getModel('safety_check')).toBe('safety-specific');
  });

  it('keeps chat use cases on the quality fallback when only legacy flash is set', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-v4-flash' }),
    );

    for (const useCase of useCases) {
      expect(service.getModel(useCase)).toBe('deepseek-v4-pro');
    }
  });

  it('does not let chat-shaped fast legacy models bypass the quality filter', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-v4-flash-chat' }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
  });

  it('keeps shared DEEPSEEK_MODEL from silently overriding quality chat lanes', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({ DEEPSEEK_MODEL: 'deepseek-v4-pro' }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
    expect(service.getModel('planner')).toBe('deepseek-v4-pro');
    expect(service.getModel('brain')).toBe('deepseek-v4-pro');
  });

  it('does not let explicit fast routing downgrade user-facing chat lanes', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_MODEL_ROUTING_MODE: 'fast',
        DEEPSEEK_FAST_MODEL: 'deepseek-v4-flash',
      }),
    );

    expect(service.getModel('casual_chat')).toBe('deepseek-v4-pro');
    expect(service.getModel('final_response')).toBe('deepseek-v4-pro');
  });

  it('defaults thinking off and protects quality first chunk budgets across chat and tools', () => {
    const service = new SocialAgentModelRouterService(
      makeConfig({
        SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS: '4200',
        SOCIAL_AGENT_PLANNER_THINKING: 'enabled',
      }),
    );

    expect(service.getThinkingMode('casual_chat')).toBe('disabled');
    expect(service.getThinkingMode('planner')).toBe('enabled');
    expect(service.getFirstChunkTimeout('casual_chat')).toBe(
      SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getFirstChunkTimeout('safety_check')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
    );
    expect(service.getTimeout('candidate_summary')).toBe(
      SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
    );
  });

  it.each(useCases)(
    'clamps stale shared and lane-specific timeout settings for %s',
    (useCase) => {
      const service = new SocialAgentModelRouterService(
        makeConfig({
          SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_PLANNER_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_PLANNER_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_BRAIN_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_BRAIN_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_EXTRACTOR_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_EXTRACTOR_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_CARD_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_CARD_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_CANDIDATE_SUMMARY_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_CANDIDATE_SUMMARY_FIRST_CHUNK_TIMEOUT_MS: '3500',
          SOCIAL_AGENT_SAFETY_TIMEOUT_MS: '2500',
          SOCIAL_AGENT_SAFETY_FIRST_CHUNK_TIMEOUT_MS: '3500',
        }),
      );

      const minimumTimeout =
        useCase === 'casual_chat' || useCase === 'final_response'
          ? SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS
          : useCase === 'planner' || useCase === 'brain'
            ? SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS
            : SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS;
      const minimumFirstChunkTimeout =
        useCase === 'casual_chat' || useCase === 'final_response'
          ? SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS
          : useCase === 'planner' || useCase === 'brain'
            ? SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS
            : SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS;

      expect(service.getTimeout(useCase)).toBe(minimumTimeout);
      expect(service.getFirstChunkTimeout(useCase)).toBe(
        minimumFirstChunkTimeout,
      );
    },
  );
});
