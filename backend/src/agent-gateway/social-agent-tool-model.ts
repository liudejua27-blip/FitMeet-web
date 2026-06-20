import type { ConfigService } from '@nestjs/config';
import {
  SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS,
  SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS,
  selectSocialAgentConfiguredModel,
  type SocialAgentModelRouterService,
  type SocialAgentModelUseCase,
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
    return firstModel([
      input.config.get<string>('AGENT_CARD_MODEL'),
      input.config.get<string>('DEEPSEEK_CHAT_MODEL'),
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
      legacy,
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
    ]);
  }
  if (useCase === 'safety_check') {
    return firstModel([
      input.config.get<string>('AGENT_SAFETY_MODEL'),
      input.config.get<string>('DEEPSEEK_CHAT_MODEL'),
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
      legacy,
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
    ]);
  }
  return firstModel([
    input.config.get<string>('AGENT_PLANNER_MODEL'),
    input.config.get<string>('DEEPSEEK_CHAT_MODEL'),
    SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
    legacy,
    SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
  ]);
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
  return boundedQualityTimeoutMs(configured, minimumToolTimeoutMs(useCase));
}

function minimumToolTimeoutMs(useCase: SocialAgentModelUseCase): number {
  return useCase === 'planner'
    ? SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS
    : SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS;
}

function boundedQualityTimeoutMs(
  value: string | undefined,
  minimum: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return minimum;
  return Math.min(Math.max(parsed, minimum), 30_000);
}

function firstModel(
  values: Array<string | undefined | null>,
  options: { allowFast?: boolean } = {},
): string {
  for (const value of values) {
    const normalized = selectSocialAgentConfiguredModel(value, {
      allowFast: options.allowFast,
    });
    if (normalized) return normalized;
  }
  return SOCIAL_AGENT_DEFAULT_REASONING_MODEL;
}
