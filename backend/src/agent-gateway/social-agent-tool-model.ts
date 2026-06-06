import type { ConfigService } from '@nestjs/config';
import type {
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
} from './social-agent-model-router.service';

export type SocialAgentToolModelConfig = Pick<ConfigService, 'get'>;
export type SocialAgentToolModelRouter = Pick<
  SocialAgentModelRouterService,
  'getModel'
> &
  Partial<Pick<SocialAgentModelRouterService, 'getTimeout'>>;

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

export function selectSocialAgentToolTimeoutMs(
  useCase: SocialAgentModelUseCase,
  input: {
    config: SocialAgentToolModelConfig;
    modelRouter?: SocialAgentToolModelRouter | null;
  },
): number {
  if (input.modelRouter?.getTimeout) {
    return input.modelRouter.getTimeout(useCase);
  }
  const configured =
    input.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
    input.config.get<string>('DEEPSEEK_TIMEOUT_MS');
  return positiveTimeoutMs(configured, 5000, 15_000);
}

function positiveTimeoutMs(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
