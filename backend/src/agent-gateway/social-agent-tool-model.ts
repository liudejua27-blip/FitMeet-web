import type { ConfigService } from '@nestjs/config';
import type {
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
} from './social-agent-model-router.service';

export type SocialAgentToolModelConfig = Pick<ConfigService, 'get'>;
export type SocialAgentToolModelRouter = Pick<
  SocialAgentModelRouterService,
  'getModel'
>;

export function socialAgentToolModelUseCaseForPurpose(
  purpose: string,
): SocialAgentModelUseCase {
  if (/candidate|match|summary|summarize/i.test(purpose)) {
    return 'candidate_summary';
  }
  if (/card|social_request|request/i.test(purpose)) return 'card_generation';
  if (/safety|boundary|risk/i.test(purpose)) return 'safety_check';
  return 'planner';
}

export function selectSocialAgentToolModel(
  useCase: SocialAgentModelUseCase,
  input: {
    config: SocialAgentToolModelConfig;
    modelRouter?: SocialAgentToolModelRouter | null;
  },
): string {
  if (input.modelRouter) return input.modelRouter.getModel(useCase);

  const legacy = input.config.get<string>('DEEPSEEK_MODEL');
  if (useCase === 'candidate_summary' || useCase === 'card_generation') {
    return (
      input.config.get<string>('AGENT_CARD_MODEL') ||
      input.config.get<string>('DEEPSEEK_FAST_MODEL') ||
      legacy ||
      'deepseek-v4-flash'
    );
  }
  if (useCase === 'safety_check') {
    return (
      input.config.get<string>('DEEPSEEK_FAST_MODEL') ||
      legacy ||
      'deepseek-v4-flash'
    );
  }
  return (
    input.config.get<string>('AGENT_PLANNER_MODEL') ||
    input.config.get<string>('DEEPSEEK_FAST_MODEL') ||
    legacy ||
    'deepseek-v4-flash'
  );
}
