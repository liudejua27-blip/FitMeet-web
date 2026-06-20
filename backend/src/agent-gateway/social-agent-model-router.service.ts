import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SocialAgentModelUseCase =
  | 'casual_chat'
  | 'final_response'
  | 'planner'
  | 'profile_extraction'
  | 'card_generation'
  | 'candidate_summary'
  | 'safety_check';
export type SocialAgentModelRoutingMode = 'balanced' | 'quality' | 'fast';

export const SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS = 30_000;
export const SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS = 20_000;
export const SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS = 25_000;
export const SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS = 20_000;
export const SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS = 25_000;
export const SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS = 20_000;
export const SOCIAL_AGENT_DEFAULT_FAST_MODEL = 'deepseek-v4-flash';
export const SOCIAL_AGENT_DEFAULT_REASONING_MODEL = 'deepseek-v4-pro';

export function normalizeSocialAgentModel(value?: string | null): string | null {
  const model = `${value ?? ''}`.trim();
  if (!model) return null;
  if (model === 'deepseek-v4') return SOCIAL_AGENT_DEFAULT_REASONING_MODEL;
  return model;
}

export function isSocialAgentLegacyDeepSeekAlias(model: string): boolean {
  return /^deepseek-chat$/i.test(model);
}

export function isSocialAgentFastModel(model: string): boolean {
  return /(^|[-_])(flash|fast|lite)([-_]|$)/i.test(model);
}

export function selectSocialAgentConfiguredModel(
  value?: string | null,
  options: { allowFast?: boolean } = {},
): string | null {
  const model = normalizeSocialAgentModel(value);
  if (!model) return null;
  if (isSocialAgentLegacyDeepSeekAlias(model)) return null;
  if (!options.allowFast && isSocialAgentFastModel(model)) return null;
  return model;
}

@Injectable()
export class SocialAgentModelRouterService {
  constructor(private readonly config: ConfigService) {}

  getModel(useCase: SocialAgentModelUseCase): string {
    switch (useCase) {
      case 'casual_chat':
        return (
          this.firstModel(['AGENT_CASUAL_CHAT_MODEL', 'DEEPSEEK_CHAT_MODEL'], {
            allowFast: false,
          }) ??
          this.chatCompatibleLegacyModel() ??
          this.defaultChatModel()
        );
      case 'final_response':
        return (
          this.firstModel([
            'AGENT_FINAL_RESPONSE_MODEL',
            'DEEPSEEK_CHAT_MODEL',
          ], {
            allowFast: false,
          }) ??
          this.chatCompatibleLegacyModel() ??
          this.defaultChatModel()
        );
      case 'planner':
        return this.plannerModel();
      case 'profile_extraction':
        return this.reasoningToolModel(['AGENT_EXTRACTOR_MODEL']);
      case 'card_generation':
      case 'candidate_summary':
        return this.reasoningToolModel(['AGENT_CARD_MODEL']);
      case 'safety_check':
        return this.reasoningToolModel(['AGENT_SAFETY_MODEL']);
      default:
        return SOCIAL_AGENT_DEFAULT_REASONING_MODEL;
    }
  }

  getTimeout(useCase: SocialAgentModelUseCase): number {
    const specific = this.config.get<string>(this.timeoutEnvKey(useCase));
    const shared =
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS');
    const fallback =
      this.routingMode() === 'quality'
        ? useCase === 'final_response' || useCase === 'casual_chat'
          ? SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS
          : useCase === 'planner'
            ? SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS
            : SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS
        : useCase === 'final_response' || useCase === 'casual_chat'
          ? SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS
          : useCase === 'planner'
            ? SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS
            : SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS;
    return this.enforceMinimumTimeout(
      useCase,
      this.positiveNumber(specific ?? shared, fallback),
    );
  }

  getFirstChunkTimeout(useCase: SocialAgentModelUseCase): number {
    const specific = this.config.get<string>(
      this.firstChunkTimeoutEnvKey(useCase),
    );
    const shared =
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS') ??
      this.config.get<string>('DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS');
    const fallback =
      this.routingMode() === 'quality'
        ? useCase === 'final_response' || useCase === 'casual_chat'
          ? SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS
          : useCase === 'planner'
            ? SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS
            : SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS
        : useCase === 'final_response' || useCase === 'casual_chat'
          ? SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS
          : useCase === 'planner'
            ? SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS
            : SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS;
    return this.enforceMinimumFirstChunkTimeout(
      useCase,
      this.positiveNumber(specific ?? shared, fallback),
    );
  }

  private plannerModel(): string {
    return (
      this.firstModel(
        ['AGENT_PLANNER_MODEL', 'DEEPSEEK_CHAT_MODEL'],
        {
          fallback: SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
          allowFast: false,
        },
      ) ?? SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private reasoningToolModel(specificKeys: string[]): string {
    return (
      this.firstModel(
        [...specificKeys, 'DEEPSEEK_CHAT_MODEL'],
        {
          fallback: SOCIAL_AGENT_DEFAULT_REASONING_MODEL,
          allowFast: false,
        },
      ) ??
      SOCIAL_AGENT_DEFAULT_REASONING_MODEL
    );
  }

  private routingMode(): SocialAgentModelRoutingMode {
    const value =
      `${this.config.get<string>('SOCIAL_AGENT_MODEL_ROUTING_MODE') ?? ''}`
        .trim()
        .toLowerCase();
    if (value === 'quality') return 'quality';
    if (value === 'fast') return 'fast';
    return 'quality';
  }

  getThinkingMode(useCase: SocialAgentModelUseCase): 'disabled' | 'enabled' {
    const specific = this.config.get<string>(this.thinkingEnvKey(useCase));
    const shared = this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_THINKING');
    const value = `${specific ?? shared ?? ''}`.trim().toLowerCase();
    if (['enabled', 'true', '1', 'yes'].includes(value)) return 'enabled';
    if (['disabled', 'false', '0', 'no'].includes(value)) return 'disabled';
    return 'disabled';
  }

  getTemperature(useCase: SocialAgentModelUseCase): number {
    switch (useCase) {
      case 'planner':
      case 'profile_extraction':
      case 'safety_check':
        return 0.15;
      case 'final_response':
      case 'casual_chat':
        return 0.6;
      case 'card_generation':
      case 'candidate_summary':
        return 0.35;
      default:
        return 0.2;
    }
  }

  private firstModel(
    keys: string[],
    options: { fallback?: string; allowFast?: boolean } = {},
  ): string | null {
    for (const key of keys) {
      const value = selectSocialAgentConfiguredModel(
        this.config.get<string>(key),
        {
          allowFast: options.allowFast,
        },
      );
      if (value) return value;
    }
    return options.fallback ?? null;
  }

  private chatCompatibleLegacyModel(): string | null {
    const legacy = selectSocialAgentConfiguredModel(
      this.config.get<string>('DEEPSEEK_MODEL'),
      { allowFast: false },
    );
    if (!legacy) return null;
    return /chat/i.test(legacy) ? legacy : null;
  }

  private defaultChatModel(): string {
    return SOCIAL_AGENT_DEFAULT_REASONING_MODEL;
  }

  private timeoutEnvKey(useCase: SocialAgentModelUseCase): string {
    switch (useCase) {
      case 'final_response':
        return 'SOCIAL_AGENT_FINAL_RESPONSE_TIMEOUT_MS';
      case 'casual_chat':
        return 'SOCIAL_AGENT_CHAT_LLM_TIMEOUT_MS';
      case 'planner':
        return 'SOCIAL_AGENT_PLANNER_TIMEOUT_MS';
      case 'profile_extraction':
        return 'SOCIAL_AGENT_EXTRACTOR_TIMEOUT_MS';
      case 'card_generation':
        return 'SOCIAL_AGENT_CARD_TIMEOUT_MS';
      case 'candidate_summary':
        return 'SOCIAL_AGENT_CANDIDATE_SUMMARY_TIMEOUT_MS';
      case 'safety_check':
        return 'SOCIAL_AGENT_SAFETY_TIMEOUT_MS';
      default:
        return 'SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS';
    }
  }

  private firstChunkTimeoutEnvKey(useCase: SocialAgentModelUseCase): string {
    switch (useCase) {
      case 'final_response':
        return 'SOCIAL_AGENT_FINAL_RESPONSE_FIRST_CHUNK_TIMEOUT_MS';
      case 'casual_chat':
        return 'SOCIAL_AGENT_CHAT_FIRST_CHUNK_TIMEOUT_MS';
      case 'planner':
        return 'SOCIAL_AGENT_PLANNER_FIRST_CHUNK_TIMEOUT_MS';
      case 'profile_extraction':
        return 'SOCIAL_AGENT_EXTRACTOR_FIRST_CHUNK_TIMEOUT_MS';
      case 'card_generation':
        return 'SOCIAL_AGENT_CARD_FIRST_CHUNK_TIMEOUT_MS';
      case 'candidate_summary':
        return 'SOCIAL_AGENT_CANDIDATE_SUMMARY_FIRST_CHUNK_TIMEOUT_MS';
      case 'safety_check':
        return 'SOCIAL_AGENT_SAFETY_FIRST_CHUNK_TIMEOUT_MS';
      default:
        return 'SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS';
    }
  }

  private thinkingEnvKey(useCase: SocialAgentModelUseCase): string {
    switch (useCase) {
      case 'final_response':
        return 'SOCIAL_AGENT_FINAL_RESPONSE_THINKING';
      case 'casual_chat':
        return 'SOCIAL_AGENT_CHAT_THINKING';
      case 'planner':
        return 'SOCIAL_AGENT_PLANNER_THINKING';
      case 'profile_extraction':
        return 'SOCIAL_AGENT_EXTRACTOR_THINKING';
      case 'card_generation':
        return 'SOCIAL_AGENT_CARD_THINKING';
      case 'candidate_summary':
        return 'SOCIAL_AGENT_CANDIDATE_SUMMARY_THINKING';
      case 'safety_check':
        return 'SOCIAL_AGENT_SAFETY_THINKING';
      default:
        return 'SOCIAL_AGENT_DEEPSEEK_THINKING';
    }
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private enforceMinimumTimeout(
    useCase: SocialAgentModelUseCase,
    timeoutMs: number,
  ): number {
    if (useCase === 'casual_chat' || useCase === 'final_response') {
      return Math.max(timeoutMs, SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS);
    }
    if (useCase === 'planner') {
      return Math.max(timeoutMs, SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS);
    }
    return Math.max(timeoutMs, SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS);
  }

  private enforceMinimumFirstChunkTimeout(
    useCase: SocialAgentModelUseCase,
    timeoutMs: number,
  ): number {
    if (useCase === 'casual_chat' || useCase === 'final_response') {
      return Math.max(
        timeoutMs,
        SOCIAL_AGENT_QUALITY_CHAT_FIRST_CHUNK_TIMEOUT_MS,
      );
    }
    if (useCase === 'planner') {
      return Math.max(
        timeoutMs,
        SOCIAL_AGENT_QUALITY_PLANNER_FIRST_CHUNK_TIMEOUT_MS,
      );
    }
    return Math.max(
      timeoutMs,
      SOCIAL_AGENT_QUALITY_TOOL_FIRST_CHUNK_TIMEOUT_MS,
    );
  }
}
