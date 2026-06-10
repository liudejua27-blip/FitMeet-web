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

@Injectable()
export class SocialAgentModelRouterService {
  constructor(private readonly config: ConfigService) {}

  getModel(useCase: SocialAgentModelUseCase): string {
    switch (useCase) {
      case 'casual_chat':
        return (
          this.firstModel(['AGENT_CASUAL_CHAT_MODEL', 'DEEPSEEK_CHAT_MODEL']) ??
          this.chatCompatibleLegacyModel() ??
          'deepseek-v4-flash'
        );
      case 'final_response':
        return (
          this.firstModel([
            'AGENT_FINAL_RESPONSE_MODEL',
            'DEEPSEEK_CHAT_MODEL',
          ]) ??
          this.chatCompatibleLegacyModel() ??
          'deepseek-v4-flash'
        );
      case 'planner':
        return (
          this.firstModel(
            ['AGENT_PLANNER_MODEL', 'DEEPSEEK_FAST_MODEL', 'DEEPSEEK_MODEL'],
            'deepseek-v4-flash',
          ) ?? 'deepseek-v4-flash'
        );
      case 'profile_extraction':
        return (
          this.firstModel(
            ['AGENT_EXTRACTOR_MODEL', 'DEEPSEEK_FAST_MODEL', 'DEEPSEEK_MODEL'],
            'deepseek-v4-flash',
          ) ?? 'deepseek-v4-flash'
        );
      case 'card_generation':
      case 'candidate_summary':
        return (
          this.firstModel(
            ['AGENT_CARD_MODEL', 'DEEPSEEK_FAST_MODEL', 'DEEPSEEK_MODEL'],
            'deepseek-v4-flash',
          ) ?? 'deepseek-v4-flash'
        );
      case 'safety_check':
        return (
          this.firstModel(
            ['DEEPSEEK_FAST_MODEL', 'DEEPSEEK_MODEL'],
            'deepseek-v4-flash',
          ) ?? 'deepseek-v4-flash'
        );
      default:
        return 'deepseek-v4-flash';
    }
  }

  getTimeout(useCase: SocialAgentModelUseCase): number {
    const specific = this.config.get<string>(this.timeoutEnvKey(useCase));
    const shared =
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS');
    const fallback =
      useCase === 'final_response' || useCase === 'casual_chat' ? 7000 : 5000;
    return this.positiveNumber(specific ?? shared, fallback);
  }

  getFirstChunkTimeout(useCase: SocialAgentModelUseCase): number {
    const specific = this.config.get<string>(
      this.firstChunkTimeoutEnvKey(useCase),
    );
    const shared =
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS') ??
      this.config.get<string>('DEEPSEEK_FIRST_CHUNK_TIMEOUT_MS');
    const fallback =
      useCase === 'final_response' || useCase === 'casual_chat' ? 3500 : 5000;
    return this.positiveNumber(specific ?? shared, fallback);
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

  private firstModel(keys: string[], fallback?: string): string | null {
    for (const key of keys) {
      const value = this.normalizeModel(this.config.get<string>(key));
      if (value) return value;
    }
    return fallback ?? null;
  }

  private chatCompatibleLegacyModel(): string | null {
    const legacy = this.normalizeModel(
      this.config.get<string>('DEEPSEEK_MODEL'),
    );
    if (!legacy) return null;
    return /chat/i.test(legacy) ? legacy : null;
  }

  private normalizeModel(value?: string | null): string | null {
    const model = `${value ?? ''}`.trim();
    if (!model) return null;
    if (model === 'deepseek-v4') return 'deepseek-v4-flash';
    return model;
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
}
