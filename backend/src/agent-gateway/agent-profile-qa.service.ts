import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIService } from '../ai/ai.service';
import { SocialProfileService } from '../users/social-profile.service';
import { AgentActionLogService } from './agent-action-log.service';
import {
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  AgentAutonomyLevel,
  AgentProfile,
} from './entities/agent-profile.entity';
import {
  AgentSettings,
  AgentSettingsMode,
} from './entities/agent-settings.entity';
import { AgentSettingsService } from './agent-settings.service';

/**
 * Question keys used by the AI profile interview. Each key has exactly one
 * canonical persistence destination (see {@link AgentProfileQAService.saveOne}).
 *
 * Keys are intentionally distinct from raw `UserSocialProfile` fields so the
 * UI / LLM can ask "soft" questions about the agent's policy without having
 * to know about backend column names.
 */
export type ProfileQuestionKey =
  | 'wanted_people' // 你想认识什么样的人 → AgentProfile.preferredTargets
  | 'unwanted_people' // 你不想认识什么样的人 → AgentProfile.boundaries + rejectRules
  | 'social_style' // 你喜欢什么社交方式 → UserSocialProfile.socialPreference
  | 'autonomy_level' // AI 自动做到什么程度 → AgentProfile.autonomyLevel + AgentSettings.mode
  | 'allow_auto_chat' // 允许 AI 主动聊天 → AgentSettings.allowSendMessage
  | 'allow_auto_add_friend' // 允许 AI 加好友 → AgentSettings.allowContactExchange
  | 'allow_auto_organize' // 允许 AI 组织活动 → AgentSettings.allowCreateActivity
  // 复用 UserSocialProfile 已有字段，方便基础画像也能问
  | 'city'
  | 'nearbyArea'
  | 'fitnessGoals'
  | 'interestTags'
  | 'availableTimes';

export interface QuestionDef {
  key: ProfileQuestionKey;
  question: string;
  type: 'text' | 'choice' | 'boolean';
  options?: string[];
}

const QUESTION_BANK: Record<ProfileQuestionKey, QuestionDef> = {
  wanted_people: {
    key: 'wanted_people',
    question: '你希望 AI 帮你认识什么样的人？',
    type: 'text',
  },
  unwanted_people: {
    key: 'unwanted_people',
    question: '有哪些类型的人你完全不想被推荐？',
    type: 'text',
  },
  social_style: {
    key: 'social_style',
    question: '你喜欢什么样的社交方式（节奏、聊天风格、约见频率）？',
    type: 'text',
  },
  autonomy_level: {
    key: 'autonomy_level',
    question: '你接受 AI 自动做到什么程度？',
    type: 'choice',
    options: ['assisted', 'normal', 'open'],
  },
  allow_auto_chat: {
    key: 'allow_auto_chat',
    question: '是否允许 AI 主动发消息给陌生人？',
    type: 'boolean',
  },
  allow_auto_add_friend: {
    key: 'allow_auto_add_friend',
    question: '是否允许 AI 主动加好友 / 交换联系方式？',
    type: 'boolean',
  },
  allow_auto_organize: {
    key: 'allow_auto_organize',
    question: '是否允许 AI 主动组织活动？',
    type: 'boolean',
  },
  city: { key: 'city', question: '你常驻或希望匹配的城市？', type: 'text' },
  nearbyArea: {
    key: 'nearbyArea',
    question: '你通常在哪个区域活动？',
    type: 'text',
  },
  fitnessGoals: {
    key: 'fitnessGoals',
    question: '最近的健身目标是什么？',
    type: 'text',
  },
  interestTags: {
    key: 'interestTags',
    question: '希望 AI 代表你展示哪些兴趣标签？',
    type: 'text',
  },
  availableTimes: {
    key: 'availableTimes',
    question: '通常什么时间方便社交或约练？',
    type: 'text',
  },
};

/** Order matters: earlier = higher priority when falling back. */
const ORDERED_KEYS: ProfileQuestionKey[] = [
  'autonomy_level',
  'allow_auto_chat',
  'allow_auto_add_friend',
  'allow_auto_organize',
  'wanted_people',
  'unwanted_people',
  'social_style',
  'city',
  'nearbyArea',
  'fitnessGoals',
  'interestTags',
  'availableTimes',
];

@Injectable()
export class AgentProfileQAService {
  private readonly logger = new Logger(AgentProfileQAService.name);

  constructor(
    private readonly ai: AIService,
    private readonly socialProfiles: SocialProfileService,
    private readonly settings: AgentSettingsService,
    private readonly actionLogs: AgentActionLogService,
    @InjectRepository(AgentProfile)
    private readonly agentRepo: Repository<AgentProfile>,
  ) {}

  /**
   * Build the LLM context summary + the list of unfilled keys, then ask the
   * AI for 3-5 personalized questions. Falls back to a deterministic slice
   * of the question bank on any error — never throws.
   */
  async generateQuestions(userId: number) {
    const ctx = await this.loadContext(userId);
    const missing = this.computeMissingKeys(ctx);
    let questions = await this.aiQuestions(missing, ctx);
    if (questions.length < 3) {
      // Fill up to 5 with deterministic fallbacks (skip duplicates).
      const have = new Set(questions.map((q) => q.key));
      for (const key of missing) {
        if (questions.length >= 5) break;
        if (have.has(key)) continue;
        questions.push(QUESTION_BANK[key]);
      }
    }
    questions = questions.slice(0, 5);

    await this.actionLogs.logAgentAction({
      ownerUserId: userId,
      actionType: AgentActionType.GenerateProfileQuestion,
      actionStatus: AgentActionStatus.Executed,
      inputSummary: `missing=${missing.length}`,
      outputSummary: questions.map((q) => q.key).join(','),
      payload: { questionKeys: questions.map((q) => q.key) },
    });

    return {
      questions,
      completion: await this.getCompletion(userId),
    };
  }

  /**
   * Persist a batch of answers. `answers` is an array of `{ key, value }`.
   * Unknown keys are ignored (never throws). Each accepted answer routes to
   * its single canonical destination — see field comment on
   * {@link ProfileQuestionKey}.
   */
  async saveAnswers(
    userId: number,
    answers: Array<{ key: string; value: unknown }>,
    options: { confirm?: boolean } = {},
  ) {
    if (!Array.isArray(answers) || answers.length === 0) {
      throw new BadRequestException('answers must be a non-empty array');
    }
    const normalizedAnswers = this.normalizeAnswersForPreview(answers);
    if (normalizedAnswers.length === 0) {
      throw new BadRequestException(
        'answers must include at least one known key',
      );
    }
    if (options.confirm !== true) {
      await this.actionLogs.logAgentAction({
        ownerUserId: userId,
        actionType: AgentActionType.UpdateProfile,
        actionStatus: AgentActionStatus.PendingApproval,
        inputSummary: normalizedAnswers.map((item) => item.key).join(','),
        outputSummary: `preview=${normalizedAnswers.length}`,
        payload: {
          acceptedKeys: normalizedAnswers.map((item) => item.key),
          schemaType: 'profile.update_preview',
          confirmationRequired: true,
        },
      });

      return {
        mode: 'preview' as const,
        status: 'pending_confirmation' as const,
        acceptedKeys: normalizedAnswers.map((item) => item.key),
        preview: {
          schemaVersion: 'fitmeet.profile-update.v1',
          schemaType: 'profile.update_preview',
          title: '个人信息更新预览',
          description: '确认保存前不会写入个人信息。',
          fields: normalizedAnswers,
          confirmationRequired: true,
        },
        completion: await this.getCompletion(userId),
      };
    }

    const accepted: string[] = [];
    for (const ans of normalizedAnswers) {
      const ok = await this.saveOne(userId, ans.key, ans.value);
      if (ok) accepted.push(ans.key);
    }

    await this.actionLogs.logAgentAction({
      ownerUserId: userId,
      actionType: AgentActionType.UpdateProfile,
      actionStatus: AgentActionStatus.Executed,
      inputSummary: accepted.join(','),
      outputSummary: `accepted=${accepted.length}`,
      payload: { acceptedKeys: accepted },
    });

    return {
      mode: 'saved' as const,
      status: 'saved' as const,
      acceptedKeys: accepted,
      completion: await this.getCompletion(userId),
    };
  }

  /** Combined completion across UserSocialProfile + AgentProfile + AgentSettings. */
  async getCompletion(userId: number) {
    const ctx = await this.loadContext(userId);
    const filled: string[] = [];
    const missing: string[] = [];
    for (const key of ORDERED_KEYS) {
      (this.isFilled(key, ctx) ? filled : missing).push(key);
    }
    return {
      completedFields: filled,
      missingFields: missing,
      percent: Math.round((filled.length / ORDERED_KEYS.length) * 100),
    };
  }

  // ── Internal ─────────────────────────────────────────────────────

  private async loadContext(userId: number) {
    const [socialProfile, primaryAgent, settings] = await Promise.all([
      this.socialProfiles.get(userId),
      this.findPrimaryAgent(userId),
      this.settings.getOrCreate(userId),
    ]);
    return { socialProfile, primaryAgent, settings };
  }

  private normalizeAnswersForPreview(
    answers: Array<{ key: string; value: unknown }>,
  ): Array<{ key: ProfileQuestionKey; value: string }> {
    const normalized: Array<{ key: ProfileQuestionKey; value: string }> = [];
    const seen = new Set<ProfileQuestionKey>();
    for (const answer of answers) {
      if (!answer || typeof answer.key !== 'string') continue;
      if (!this.isQuestionKey(answer.key)) continue;
      const value = toAnswerText(answer.value);
      if (!value || seen.has(answer.key)) continue;
      seen.add(answer.key);
      normalized.push({ key: answer.key, value });
    }
    return normalized;
  }

  private isQuestionKey(value: string): value is ProfileQuestionKey {
    return ORDERED_KEYS.includes(value as ProfileQuestionKey);
  }

  private async findPrimaryAgent(userId: number): Promise<AgentProfile | null> {
    return this.agentRepo.findOne({
      where: { ownerUserId: userId },
      order: { createdAt: 'ASC' },
    });
  }

  private computeMissingKeys(
    ctx: Awaited<ReturnType<AgentProfileQAService['loadContext']>>,
  ): ProfileQuestionKey[] {
    return ORDERED_KEYS.filter((k) => !this.isFilled(k, ctx));
  }

  private isFilled(
    key: ProfileQuestionKey,
    ctx: Awaited<ReturnType<AgentProfileQAService['loadContext']>>,
  ): boolean {
    const { socialProfile, primaryAgent, settings } = ctx;
    switch (key) {
      case 'wanted_people':
        return !!primaryAgent && primaryAgent.preferredTargets?.length > 0;
      case 'unwanted_people':
        return (
          (!!primaryAgent && primaryAgent.boundaries?.length > 0) ||
          Boolean(socialProfile.rejectRules)
        );
      case 'social_style':
        return Boolean(socialProfile.socialPreference);
      case 'autonomy_level':
        return !!primaryAgent; // primaryAgent always carries an autonomyLevel (defaults Normal); presence == answered
      case 'allow_auto_chat':
      case 'allow_auto_add_friend':
      case 'allow_auto_organize':
        // Treat as answered once user has touched settings (mode != default Assisted OR any allow_* flipped).
        return this.settingsTouched(settings);
      case 'city':
        return Boolean(socialProfile.city);
      case 'nearbyArea':
        return Boolean(socialProfile.nearbyArea);
      case 'fitnessGoals':
        return socialProfile.fitnessGoals?.length > 0;
      case 'interestTags':
        return socialProfile.interestTags?.length > 0;
      case 'availableTimes':
        return socialProfile.availableTimes?.length > 0;
      default:
        return false;
    }
  }

  /**
   * AgentSettings rows are lazy-created with mode=Assisted and all allow_*
   * = false. Consider them "touched" once mode advanced beyond Assisted OR
   * any auto-execute flag was enabled.
   */
  private settingsTouched(s: AgentSettings): boolean {
    if (
      s.mode !== AgentSettingsMode.Assisted &&
      s.mode !== AgentSettingsMode.Basic
    ) {
      return true;
    }
    return Boolean(
      s.allowSendMessage || s.allowContactExchange || s.allowCreateActivity,
    );
  }

  /**
   * Try to call DeepSeek with a sanitized context summary. Never throws —
   * returns [] on any failure so the caller falls through to the bank.
   */
  private async aiQuestions(
    missing: ProfileQuestionKey[],
    ctx: Awaited<ReturnType<AgentProfileQAService['loadContext']>>,
  ): Promise<QuestionDef[]> {
    if (missing.length === 0) return [];
    try {
      const summary = this.buildContextSummary(ctx);
      const llm = await this.ai.generateProfileQuestions({
        missingKeys: missing,
        contextSummary: summary,
      });
      const out: QuestionDef[] = [];
      for (const q of llm) {
        const def = QUESTION_BANK[q.key as ProfileQuestionKey];
        if (!def) continue;
        out.push({
          ...def,
          question: q.question || def.question,
        });
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `aiQuestions fell back: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /** Build a short, PII-light context blob for the LLM. No tokens / no API keys. */
  private buildContextSummary(
    ctx: Awaited<ReturnType<AgentProfileQAService['loadContext']>>,
  ): string {
    const { socialProfile, primaryAgent, settings } = ctx;
    const parts: string[] = [];
    if (socialProfile.city) parts.push(`城市:${socialProfile.city}`);
    if (socialProfile.fitnessGoals?.length)
      parts.push(`目标:${socialProfile.fitnessGoals.join('/')}`);
    if (socialProfile.interestTags?.length)
      parts.push(`兴趣:${socialProfile.interestTags.join('/')}`);
    if (socialProfile.socialPreference)
      parts.push(`社交风格:${socialProfile.socialPreference}`);
    if (primaryAgent?.preferredTargets?.length)
      parts.push(`想认识:${primaryAgent.preferredTargets.join('/')}`);
    if (primaryAgent?.autonomyLevel)
      parts.push(`自治度:${primaryAgent.autonomyLevel}`);
    parts.push(`设置模式:${settings.mode}`);
    return parts.join('；') || '(用户暂无任何画像)';
  }

  /**
   * Route a single answer to its canonical destination. Returns true if it
   * was applied. Bad value types are silently dropped (never throws).
   */
  private async saveOne(
    userId: number,
    key: string,
    value: unknown,
  ): Promise<boolean> {
    switch (key as ProfileQuestionKey) {
      case 'wanted_people': {
        const arr = toStringArray(value);
        if (!arr.length) return false;
        await this.updatePrimaryAgent(userId, { preferredTargets: arr });
        return true;
      }
      case 'unwanted_people': {
        const arr = toStringArray(value);
        if (!arr.length) return false;
        await this.updatePrimaryAgent(userId, { boundaries: arr });
        // Also mirror into UserSocialProfile.rejectRules as free text.
        await this.socialProfiles.upsert(userId, {
          rejectRules: arr.join('；'),
        });
        return true;
      }
      case 'social_style': {
        const text = toTrimmedString(value);
        if (!text) return false;
        await this.socialProfiles.upsert(userId, { socialPreference: text });
        await this.updatePrimaryAgent(userId, { personality: text });
        return true;
      }
      case 'autonomy_level': {
        const level = normalizeAutonomy(value);
        if (!level) return false;
        await this.updatePrimaryAgent(userId, { autonomyLevel: level });
        // Mirror to AgentSettings.mode so downstream guards align.
        const mode = autonomyToSettingsMode(level);
        await this.settings.update(userId, { mode });
        return true;
      }
      case 'allow_auto_chat': {
        const flag = toBool(value);
        if (flag === null) return false;
        await this.settings.update(userId, { allowSendMessage: flag });
        return true;
      }
      case 'allow_auto_add_friend': {
        const flag = toBool(value);
        if (flag === null) return false;
        await this.settings.update(userId, { allowContactExchange: flag });
        return true;
      }
      case 'allow_auto_organize': {
        const flag = toBool(value);
        if (flag === null) return false;
        await this.settings.update(userId, { allowCreateActivity: flag });
        return true;
      }
      // Pass-through to existing SocialProfileService.saveAnswer for
      // common base-profile fields.
      case 'city':
      case 'nearbyArea':
      case 'fitnessGoals':
      case 'interestTags':
      case 'availableTimes': {
        const text = toAnswerText(value);
        if (!text) return false;
        await this.socialProfiles.saveAnswer(userId, key, text);
        return true;
      }
      default:
        return false;
    }
  }

  private async updatePrimaryAgent(
    userId: number,
    patch: Partial<
      Pick<
        AgentProfile,
        'preferredTargets' | 'boundaries' | 'personality' | 'autonomyLevel'
      >
    >,
  ): Promise<void> {
    const existing = await this.findPrimaryAgent(userId);
    if (!existing) {
      // No user agent yet — silently skip the agent-side write. The
      // user-social-profile mirror (where applicable) still captures it.
      return;
    }
    Object.assign(existing, patch);
    await this.agentRepo.save(existing);
  }
}

// ── helpers ──────────────────────────────────────────────────────

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean),
      ),
    ).slice(0, 30);
  }
  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(/[,，、;；\n]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ).slice(0, 30);
  }
  return [];
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function toAnswerText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value))
    return value.filter((v) => typeof v === 'string').join(',');
  return '';
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', '允许', '是', '可以'].includes(v)) return true;
    if (['false', '0', 'no', '不允许', '否', '不'].includes(v)) return false;
  }
  return null;
}

function normalizeAutonomy(value: unknown): AgentAutonomyLevel | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'assisted') return AgentAutonomyLevel.Assisted;
  if (v === 'normal') return AgentAutonomyLevel.Normal;
  if (v === 'open') return AgentAutonomyLevel.Open;
  return null;
}

function autonomyToSettingsMode(level: AgentAutonomyLevel): AgentSettingsMode {
  switch (level) {
    case AgentAutonomyLevel.Assisted:
      return AgentSettingsMode.Assisted;
    case AgentAutonomyLevel.Normal:
      return AgentSettingsMode.Normal;
    case AgentAutonomyLevel.Open:
      return AgentSettingsMode.Open;
  }
}
