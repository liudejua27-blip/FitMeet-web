import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sanitizeCity } from '../common/city.util';
import {
  callDeepSeekChatCompletion,
  resolveDeepSeekModel,
} from '../common/deepseek.util';

/** 完整的社交需求草稿卡输出结构（用于站内 AI 助手页面）。 */
export interface SocialRequestCard {
  title: string;
  description: string;
  interestTags: string[];
  locationPreference: string;
  timePreference: string;
  socialGoal: string;
  personalityPreference: string[];
  riskNotes: string[];
  privacyNotes: string[];
}

export interface AiProfileBuilderCard {
  basic: {
    nickname: string;
    city: string;
    ageRange: string;
    gender: string;
    zodiac: string;
  };
  personality: {
    mbti: string;
    traits: string[];
    socialStyle: string;
    communicationStyle: string;
  };
  interests: {
    sports: string[];
    lifestyle: string[];
    socialScenes: string[];
  };
  preferences: {
    wantToMeet: string[];
    preferredTraits: string[];
    avoid: string[];
  };
  relationshipIntent: {
    goals: string[];
    openness: string;
  };
  availability: {
    weekdays: string;
    weekends: string;
  };
  visibility: {
    profileDiscoverable: boolean;
    agentCanRecommendMe: boolean;
    agentCanStartChatAfterApproval: boolean;
  };
  matchSignals: AiProfileMatchSignals;
  summary: string;
}

export interface AiProfileMatchSignals {
  publicTags: string[];
  privatePreferenceTags: string[];
  sensitivePrivateTags: string[];
  matchKeywords: string[];
  confidence: number;
  source: string;
}

export interface AiCompatibilityRescore {
  score: number;
  confidence: number;
  source: 'deepseek' | 'fallback';
  publicReason: string;
  privateReason: string;
  reasons: string[];
  riskWarnings: string[];
}

export interface AiCandidateMatchContent {
  source: 'deepseek' | 'fallback';
  recommendationReasons: string[];
  icebreakerMessage: string;
  riskWarnings: string[];
}

export interface AiGenerationOptions {
  signal?: AbortSignal | null;
}

const AI_DEEPSEEK_TIMEOUT_FLOOR_MS = 25_000;
const AI_DEEPSEEK_TIMEOUT_FALLBACK_MS = 30_000;

/**
 * Pluggable AI capability surface used across FitMeet.
 *
 * The default implementation is a deterministic rule-based fallback so the
 * system keeps working without any external API key. When DEEPSEEK_API_KEY
 * is configured we route through DeepSeek's Chat Completions endpoint.
 *
 * Methods are intentionally narrow — each one maps to a concrete product
 * feature so callers never need to construct prompts by hand.
 */
@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when an LLM provider (currently DeepSeek) is configured. */
  isLlmEnabled(): boolean {
    return Boolean(this.config.get<string>('DEEPSEEK_API_KEY'));
  }

  /** Parse a free-text social intent into rough structured fields. */
  async parseSocialIntent(rawText: string): Promise<{
    activityType: string;
    tags: string[];
    summary: string;
  }> {
    const text = (rawText || '').trim();
    // Default rule-based fallback. Always safe to call.
    const fallback = this.fallbackParse(text);
    if (!this.isLlmEnabled() || !text) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是一个把中文社交需求拆成结构化字段的助手，输出 JSON：{"activityType","tags","summary"}。',
        text,
      );
      const parsed = this.safeJson<typeof fallback>(out);
      if (parsed?.activityType) return parsed;
      return fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `parseSocialIntent fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /** Generate an invite message tailored to a candidate. */
  async generateInviteText(
    input: {
      requestTitle: string;
      candidateNickname: string;
      commonTags?: string[];
    },
    options: AiGenerationOptions = {},
  ): Promise<string> {
    const tagPart =
      input.commonTags && input.commonTags.length > 0
        ? `我们都喜欢 ${input.commonTags.slice(0, 3).join('、')}，`
        : '';
    const fallback =
      `${input.candidateNickname} 你好！${tagPart}` +
      `我在 FitMeet 发起了「${input.requestTitle}」，时间地点可以先商量，方便先站内聊聊吗？`;
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的破冰文案助手，输出 60 字以内、自然、不油腻的开场白，中文。',
        JSON.stringify(input),
        options,
      );
      return out?.trim() || fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateInviteText fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /** Explain why a candidate matched. Currently a stub — returns reasons unchanged. */
  explainMatch(reasons: string[]): string {
    return reasons.filter(Boolean).join('；') || '兴趣和时间都比较接近。';
  }

  /**
   * Generate 3-5 short profile-building questions for the agent to ask its
   * owner. Caller passes a sanitized context summary (no API keys, no PII
   * beyond what the user already entered). Returns [] on any failure — the
   * caller MUST have a fallback list ready so the route never 500s.
   *
   * Each question MUST be one of the predefined keys so the saver can route
   * the answer to the correct destination.
   */
  async generateProfileQuestions(
    input: {
      missingKeys: string[];
      contextSummary: string;
    },
    options: AiGenerationOptions = {},
  ): Promise<Array<{ key: string; question: string; type: string }>> {
    if (!this.isLlmEnabled() || input.missingKeys.length === 0) return [];
    try {
      const out = await this.callDeepseekJson(
        '你是 FitMeet 的画像构建助手。' +
          '从给定的候选 key 中选 3-5 个最该补齐的，输出 JSON：' +
          '{"questions":[{"key":"<候选key>","question":"<中文一句话提问>","type":"text|choice|boolean"}]}。' +
          'key 必须严格来自候选列表，不要捏造新 key。' +
          'question 简短自然，避免重复用户已说过的信息。' +
          'allow_auto_* 类用 boolean，autonomy_level 用 choice，其它用 text。',
        JSON.stringify(input),
        options,
      );
      const parsed = this.safeJson<{
        questions?: Array<{ key?: string; question?: string; type?: string }>;
      }>(out);
      if (!parsed?.questions || !Array.isArray(parsed.questions)) return [];
      const allowed = new Set(input.missingKeys);
      return parsed.questions
        .filter((q) => q && typeof q.key === 'string' && allowed.has(q.key))
        .map((q) => ({
          key: q.key as string,
          question: (q.question ?? '').toString().slice(0, 200) || '请回答：',
          type: (q.type as string) ?? 'text',
        }))
        .slice(0, 5);
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateProfileQuestions fell back: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /** Generate a short post-activity recap (one or two sentences). */
  async generateRecap(
    input: {
      title: string;
      participantsCount: number;
      durationMinutes?: number;
    },
    options: AiGenerationOptions = {},
  ): Promise<string> {
    const fallback =
      `${input.title} 已完成，共 ${input.participantsCount} 位伙伴参与。` +
      (input.durationMinutes ? `时长约 ${input.durationMinutes} 分钟。` : '');
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的活动复盘助手，用 2 句中文总结刚结束的活动，鼓励下次再约。',
        JSON.stringify(input),
        options,
      );
      return out?.trim() || fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(`generateRecap fell back: ${(err as Error).message}`);
      return fallback;
    }
  }

  // ====================================================================
  // 阶段 4 新增的对外方法（命名对齐产品需求文档）。
  // 这些方法是"未来接 DeepSeek"的稳定入口；当前所有方法都有规则 fallback，
  // 没有 DEEPSEEK_API_KEY 时系统也必须能正常返回结果。
  // ====================================================================

  /**
   * 把用户的一段自然语言诉求拆成结构化字段，用于创建 SocialRequest。
   * fallback：纯规则匹配，永远不会抛出。
   */
  async parseSocialRequest(rawText: string): Promise<{
    goal: string;
    interestTags: string[];
    locationPreference: string;
    personalityPreference: string;
    suggestedTitle: string;
  }> {
    const text = (rawText || '').trim();
    const fallback = this.fallbackParseRich(text);
    if (!this.isLlmEnabled() || !text) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的需求理解助手。把中文社交诉求拆为 JSON：' +
          '{"goal","interestTags","locationPreference","personalityPreference","suggestedTitle"}。' +
          'interestTags 为字符串数组，其它字段为短句。',
        text,
      );
      const parsed = this.safeJson<typeof fallback>(out);
      if (parsed && typeof parsed.goal === 'string') {
        return {
          goal: parsed.goal || fallback.goal,
          interestTags: Array.isArray(parsed.interestTags)
            ? parsed.interestTags
            : fallback.interestTags,
          locationPreference:
            parsed.locationPreference || fallback.locationPreference,
          personalityPreference:
            parsed.personalityPreference || fallback.personalityPreference,
          suggestedTitle: parsed.suggestedTitle || fallback.suggestedTitle,
        };
      }
      return fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `parseSocialRequest fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /**
   * 为某个候选生成邀约话术。fallback 用模板拼接，绝不抛错。
   */
  async generateInviteMessage(
    request: {
      title?: string | null;
      activityType?: string | null;
      interestTags?: string[] | null;
    },
    candidate: {
      nickname?: string | null;
      commonTags?: string[] | null;
    },
    options: AiGenerationOptions = {},
  ): Promise<string> {
    const reqTitle = request.title || request.activityType || '一起约个运动';
    const nickname = candidate.nickname || '朋友';
    const tags =
      candidate.commonTags && candidate.commonTags.length > 0
        ? candidate.commonTags
        : (request.interestTags ?? []);
    const fallback = this.fallbackInviteZh(
      reqTitle,
      request.activityType,
      nickname,
      tags,
    );
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的破冰文案助手，输出 60 字以内、自然、不油腻的中文开场白。',
        JSON.stringify({ request, candidate }),
        options,
      );
      return out?.trim() || fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateInviteMessage fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /**
   * 解释为什么这个候选匹配上了。fallback：根据 tags/距离/时间/分数拼规则说明。
   */
  async explainMatchFor(
    request: {
      interestTags?: string[] | null;
      city?: string | null;
      activityType?: string | null;
    },
    candidate: {
      nickname?: string | null;
      tags?: string[] | null;
      distanceKm?: number | null;
      timeOverlap?: string | null;
    },
    score?: number,
    options: AiGenerationOptions = {},
  ): Promise<string> {
    const reasons: string[] = [];
    const reqTags = (request.interestTags ?? []).filter(Boolean);
    const candTags = (candidate.tags ?? []).filter(Boolean);
    const overlap = reqTags.filter((t) => candTags.includes(t));
    if (overlap.length > 0) {
      reasons.push(`共同兴趣：${overlap.slice(0, 3).join('、')}`);
    }
    if (typeof candidate.distanceKm === 'number') {
      reasons.push(`距离约 ${candidate.distanceKm.toFixed(1)} 公里`);
    }
    if (candidate.timeOverlap) {
      reasons.push(`时间重合：${candidate.timeOverlap}`);
    }
    if (typeof score === 'number') {
      reasons.push(`综合匹配分 ${score.toFixed(2)}`);
    }
    const fallback =
      reasons.length > 0
        ? reasons.join('；')
        : '兴趣方向、活动城市和你比较接近。';
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的匹配解释助手，用 1-2 句中文向用户解释为何推荐这位候选。',
        JSON.stringify({ request, candidate, score }),
        options,
      );
      return out?.trim() || fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(`explainMatchFor fell back: ${(err as Error).message}`);
      return fallback;
    }
  }

  /**
   * 活动完成后的复盘文案。fallback：根据状态、签到、证明、评价数生成基础总结。
   */
  async generateActivityReviewSummary(
    activity: {
      title?: string | null;
      status?: string | null;
      participantsCount?: number | null;
      checkedInCount?: number | null;
      proofCount?: number | null;
      durationMinutes?: number | null;
    },
    reviews: Array<{
      rating?: number | null;
      text?: string | null;
    }> = [],
    options: AiGenerationOptions = {},
  ): Promise<string> {
    const fallback = this.fallbackReviewSummary(activity, reviews);
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的活动复盘助手，用 2-3 句中文输出活动总结，' +
          '点出亮点和值得改进的地方，鼓励下次再约。',
        JSON.stringify({ activity, reviews }),
        options,
      );
      return out?.trim() || fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateActivityReviewSummary fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /**
   * 生成一张完整的社交需求草稿卡（用户在站内的 AI 助手页面会用到）。
   *
   * 9 字段严格输出。DeepSeek 不可用或 JSON 解析失败时，fallback 也必须返回
   * 完整结构，确保前端永远不会因为模型问题白屏。
   *
   * 安全策略写在 system prompt 里：不生成手机号 / 微信号 / 详细住址，
   * riskNotes 必须含线下安全提醒，privacyNotes 必须提醒不公开精确位置。
   */
  async generateSocialRequestCard(
    rawText: string,
    profile: {
      nickname?: string | null;
      city?: string | null;
      interestTags?: string[] | null;
      gender?: string | null;
      ageRange?: string | null;
      nearbyArea?: string | null;
      fitnessGoals?: string[] | null;
      availableTimes?: string[] | null;
      socialPreference?: string | null;
      rejectRules?: string | null;
      privacyBoundary?: string | null;
    } = {},
    options: AiGenerationOptions = {},
  ): Promise<SocialRequestCard> {
    const text = (rawText || '').trim();
    const fallback = this.fallbackSocialRequestCard(text, profile);
    if (!this.isLlmEnabled() || !text) return fallback;

    const systemPrompt = [
      '你是 FitMeet 的 AI 社交需求助手。',
      '你的任务是根据用户输入的自然语言需求和用户画像，整理一张适合发布到社交约练平台的需求卡。',
      '',
      '必须遵守：',
      '1. 不要生成手机号、微信号、详细住址等敏感联系方式。',
      '2. 不要鼓励用户去不安全的线下场所。',
      '3. 不要替用户承诺隐私外的信息。',
      '4. 输出必须是 JSON（只输出 JSON，不要任何 markdown、不要 ```、不要解释）。',
      '5. interestTags 控制在 5 到 8 个。',
      '6. description 要自然、礼貌、清晰。',
      '7. riskNotes 必须包含线下安全提醒（至少 2 条）。',
      '8. privacyNotes 必须提醒不要公开精确位置和联系方式（至少 2 条）。',
      '',
      '输出字段：',
      '{',
      '  "title": string,',
      '  "description": string,',
      '  "interestTags": string[],',
      '  "locationPreference": string,',
      '  "timePreference": string,',
      '  "socialGoal": string,',
      '  "personalityPreference": string[],',
      '  "riskNotes": string[],',
      '  "privacyNotes": string[]',
      '}',
    ].join('\n');

    const userPayload = JSON.stringify({
      rawText: text,
      profile: {
        nickname: profile.nickname ?? null,
        gender: profile.gender ?? null,
        ageRange: profile.ageRange ?? null,
        city: profile.city ?? null,
        nearbyArea: profile.nearbyArea ?? null,
        interestTags: profile.interestTags ?? [],
        fitnessGoals: profile.fitnessGoals ?? [],
        availableTimes: profile.availableTimes ?? [],
        socialPreference: profile.socialPreference ?? null,
        rejectRules: profile.rejectRules ?? null,
        privacyBoundary: profile.privacyBoundary ?? null,
      },
    });

    try {
      const out = await this.callDeepseekJson(
        systemPrompt,
        userPayload,
        options,
      );
      const parsed = this.safeJson<Partial<SocialRequestCard>>(out);
      if (parsed && typeof parsed === 'object') {
        return this.normalizeSocialRequestCard(parsed, fallback, profile, text);
      }
      return fallback;
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateSocialRequestCard fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /**
   * Generate a structured AI persona card from interview answers. This powers
   * both the in-app AI Profile Builder and OpenClaw social-skills profile fill.
   */
  async generateProfileBuilderCard(
    input: {
      answers: Array<{ question: string; answer: string }>;
      existingProfile?: Record<string, unknown>;
      user?: { nickname?: string | null; city?: string | null };
      source?: string;
    },
    options: AiGenerationOptions = {},
  ): Promise<AiProfileBuilderCard> {
    const text = this.profileAnswersToText(input.answers);
    const fallback = this.fallbackProfileBuilderCard(input, text);
    if (!this.isLlmEnabled() || !text) return fallback;

    const systemPrompt = [
      '你是 FitMeet 的 AI 人物画像生成器。',
      '根据用户在访谈中的回答，生成适合社交匹配的人物画像。',
      '画像用于匹配、推荐和 OpenClaw/social-skills 代理理解用户偏好。',
      '',
      '必须遵守：',
      '1. 只输出 JSON，不要 markdown，不要解释。',
      '2. 不要编造手机号、微信号、详细住址、收入数字、身份证等敏感信息。',
      '3. MBTI、星座不确定时可留空，不要强行断言。',
      '4. traits、sports、lifestyle、socialScenes、wantToMeet、preferredTraits、avoid、goals 都输出字符串数组。',
      '5. visibility 默认 profileDiscoverable=true、agentCanRecommendMe=true、agentCanStartChatAfterApproval=true，除非用户明确拒绝。',
      '6. summary 用 80 字以内中文总结这个人适合被怎样的人匹配。',
      '',
      '输出结构：',
      JSON.stringify({
        basic: {
          nickname: 'string',
          city: 'string',
          ageRange: 'string',
          gender: 'string',
          zodiac: 'string',
        },
        personality: {
          mbti: 'string',
          traits: ['string'],
          socialStyle: 'string',
          communicationStyle: 'string',
        },
        interests: {
          sports: ['string'],
          lifestyle: ['string'],
          socialScenes: ['string'],
        },
        preferences: {
          wantToMeet: ['string'],
          preferredTraits: ['string'],
          avoid: ['string'],
        },
        relationshipIntent: { goals: ['string'], openness: 'low|medium|high' },
        availability: { weekdays: 'string', weekends: 'string' },
        visibility: {
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          agentCanStartChatAfterApproval: true,
        },
        matchSignals: {
          publicTags: ['string'],
          privatePreferenceTags: ['string'],
          sensitivePrivateTags: ['string'],
          matchKeywords: ['string'],
          confidence: 0.7,
          source: 'deepseek',
        },
        summary: 'string',
      }),
    ].join('\n');

    try {
      const out = await this.callDeepseekJson(
        systemPrompt,
        JSON.stringify({
          source: input.source ?? 'fitmeet_ai_profile_builder',
          user: input.user ?? {},
          existingProfile: input.existingProfile ?? {},
          answers: input.answers,
        }),
        options,
      );
      const parsed = this.safeJson<Partial<AiProfileBuilderCard>>(out);
      return this.normalizeProfileBuilderCard(parsed, fallback);
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateProfileBuilderCard fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  /**
   * DeepSeek second pass for card/request matching.
   *
   * CompatibilityScorerService remains the deterministic source of truth for
   * hard filters and base ranking. This method lets DeepSeek adjust the final
   * score only inside a small bounded window and returns a deterministic
   * fallback when the model is unavailable.
   */
  async rescoreCompatibility(
    input: {
      baseScore: number;
      request: {
        title?: string | null;
        city?: string | null;
        activityType?: string | null;
        interestTags?: string[] | null;
        timePreference?: string | null;
        socialGoal?: string | null;
        personalityPreference?: string[] | null;
      };
      ownerProfile?: {
        city?: string | null;
        publicTags?: string[] | null;
        traits?: string[] | null;
        preferredTraits?: string[] | null;
        availability?: string[] | null;
      } | null;
      candidate: {
        nickname?: string | null;
        city?: string | null;
        publicTags?: string[] | null;
        traits?: string[] | null;
        commonTags?: string[] | null;
        verified?: boolean | null;
        acceptsAgentMessages?: boolean | null;
      };
      deterministicReasons?: string[];
      scoreBreakdown?: Record<string, number>;
    },
    options: AiGenerationOptions = {},
  ): Promise<AiCompatibilityRescore> {
    const baseScore = clampScore(input.baseScore);
    const fallback: AiCompatibilityRescore = {
      score: baseScore,
      confidence: baseScore >= 70 ? 0.72 : baseScore >= 55 ? 0.58 : 0.42,
      source: 'fallback',
      publicReason:
        input.deterministicReasons?.find(Boolean) ??
        '基础匹配器根据城市、时间、兴趣、画像和安全偏好给出该分数。',
      privateReason:
        '未启用 DeepSeek 二次评分，当前结果来自确定性兼容度评分器。',
      reasons: (input.deterministicReasons ?? []).slice(0, 4),
      riskWarnings: [],
    };
    if (!this.isLlmEnabled()) return fallback;

    try {
      const out = await this.callDeepseekJson(
        [
          '你是 FitMeet 的 AI 匹配二次评分器。',
          '输入已经通过确定性 CompatibilityScorerService 完成硬过滤和基础评分。',
          '你的任务是在不绕过安全边界的前提下，对 baseScore 做小幅修正，并解释原因。',
          '要求：',
          '1. 只输出 JSON，不要 markdown。',
          '2. score 必须是 0 到 100 的整数，且相对 baseScore 调整不超过 12 分。',
          '3. 不能输出手机号、邮箱、微信、精确地址、收入数字、学校/单位等敏感信息。',
          '4. 如果资料不足，降低 confidence，并保守调低分数。',
          '5. 线下见面、加好友、交换联系方式必须保留双方确认。',
          '输出字段：{"score":number,"confidence":number,"publicReason":string,"privateReason":string,"reasons":string[],"riskWarnings":string[]}',
        ].join('\n'),
        JSON.stringify(input),
        options,
      );
      const parsed = this.safeJson<Partial<AiCompatibilityRescore>>(out);
      if (!parsed) return fallback;
      const score = boundedAiScore(
        typeof parsed.score === 'number' ? parsed.score : baseScore,
        baseScore,
      );
      return {
        score,
        confidence:
          typeof parsed.confidence === 'number'
            ? Number(Math.max(0, Math.min(1, parsed.confidence)).toFixed(2))
            : fallback.confidence,
        source: 'deepseek',
        publicReason: sanitizeAiMatchText(
          parsed.publicReason || fallback.publicReason,
          220,
        ),
        privateReason: sanitizeAiMatchText(
          parsed.privateReason || fallback.privateReason,
          260,
        ),
        reasons: sanitizeAiMatchList(parsed.reasons, fallback.reasons),
        riskWarnings: sanitizeAiMatchList(parsed.riskWarnings, []),
      };
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `rescoreCompatibility fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  async generateCandidateMatchContent(
    input: {
      request: {
        title?: string | null;
        city?: string | null;
        activityType?: string | null;
        interestTags?: string[] | null;
        timePreference?: string | null;
        socialGoal?: string | null;
      };
      candidate: {
        nickname?: string | null;
        city?: string | null;
        commonTags?: string[] | null;
        publicTags?: string[] | null;
        distanceKm?: number | null;
        verified?: boolean | null;
      };
      score?: number | null;
      deterministicReasons?: string[];
      riskWarnings?: string[];
    },
    options: AiGenerationOptions = {},
  ): Promise<AiCandidateMatchContent> {
    const fallback = this.fallbackCandidateMatchContent(input);
    if (!this.isLlmEnabled()) return fallback;

    try {
      const out = await this.callDeepseekJson(
        [
          '你是 FitMeet 的社交匹配内容生成器。',
          '输入已经通过后端确定性匹配、权限检查和安全过滤。你的任务只负责生成用户可见文案，不得改变候选人、分数或权限结果。',
          '只输出 JSON，不要 markdown，不要解释。',
          '字段必须严格为：{"recommendationReasons":string[],"icebreakerMessage":string,"riskWarnings":string[]}',
          '要求：',
          '1. recommendationReasons 输出 2 到 4 条中文短句，每条不超过 42 字。',
          '2. icebreakerMessage 输出 1 句中文开场白，不超过 70 字，语气自然、低压力、尊重边界。',
          '3. riskWarnings 输出 1 到 3 条中文安全提示或边界提示，每条不超过 42 字。',
          '4. 不要输出手机号、微信、QQ、邮箱、详细住址、收入、学校单位等敏感信息。',
          '5. 不要承诺线下见面一定发生；涉及线下只建议公开地点、站内先沟通、用户确认。',
        ].join('\n'),
        JSON.stringify(input),
        options,
      );
      const parsed = this.safeJson<Partial<AiCandidateMatchContent>>(out);
      if (!parsed) return fallback;
      return {
        source: 'deepseek',
        recommendationReasons: sanitizeAiMatchList(
          parsed.recommendationReasons,
          fallback.recommendationReasons,
          4,
        ),
        icebreakerMessage:
          sanitizeAiMatchText(
            parsed.icebreakerMessage || fallback.icebreakerMessage,
            90,
          ) || fallback.icebreakerMessage,
        riskWarnings: sanitizeAiMatchList(
          parsed.riskWarnings,
          fallback.riskWarnings,
          3,
        ),
      };
    } catch (err) {
      if (this.isClientAbort(err)) throw this.toError(err);
      this.logger.warn(
        `generateCandidateMatchContent fell back: ${(err as Error).message}`,
      );
      return fallback;
    }
  }

  // ---------- internals ----------

  private profileAnswersToText(
    answers: Array<{ question: string; answer: string }>,
  ): string {
    return answers
      .map((item) => `${item.question || '问题'}：${item.answer || ''}`)
      .join('\n')
      .trim();
  }

  private fallbackProfileBuilderCard(
    input: {
      answers: Array<{ question: string; answer: string }>;
      existingProfile?: Record<string, unknown>;
      user?: { nickname?: string | null; city?: string | null };
    },
    text: string,
  ): AiProfileBuilderCard {
    const existing = input.existingProfile ?? {};
    const existingArr = (key: string) =>
      Array.isArray(existing[key])
        ? (existing[key] as unknown[])
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
        : [];
    const find = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() ?? '';
    const sports = this.pickKeywords(text, [
      '健身',
      '跑步',
      '瑜伽',
      '游泳',
      '骑行',
      '篮球',
      '羽毛球',
      '徒步',
    ]);
    const lifestyle = this.pickKeywords(text, [
      '科技',
      '创业',
      'AI',
      '摄影',
      '电影',
      '读书',
      '咖啡',
      '旅行',
      '自律',
    ]);
    const traits = this.pickKeywords(text, [
      '外向',
      '内向',
      '慢热',
      '主动',
      '真诚',
      '自律',
      '开朗',
      '理性',
      '目标感强',
      '执行力强',
    ]);
    const goals = this.pickKeywords(text, [
      '交朋友',
      '找搭子',
      '拓展人脉',
      '恋爱',
      '长期陪伴',
      '创业社交',
    ]);

    const nickname =
      stringValue(existing.nickname) ||
      input.user?.nickname ||
      find(/昵称[是为:]?([^\n，。]+)/) ||
      '';
    const city =
      stringValue(existing.city) ||
      input.user?.city ||
      find(/(?:常驻|城市|地区)[是为:]?([^\n，。]+)/);
    const ageRange =
      stringValue(existing.ageRange) || find(/(\d{2}\s*[-到至]\s*\d{2})/) || '';
    const gender = stringValue(existing.gender);

    return {
      basic: {
        nickname,
        city: sanitizeCity(city),
        ageRange,
        gender,
        zodiac: stringValue(existing.zodiac),
      },
      personality: {
        mbti: stringValue(existing.mbti),
        traits: this.cleanStrings([...existingArr('traits'), ...traits], 8),
        socialStyle:
          stringValue(existing.socialStyle) ||
          (text.includes('慢热')
            ? '慢热型'
            : text.includes('主动')
              ? '主动型'
              : '自然相处型'),
        communicationStyle:
          stringValue(existing.communicationStyle) ||
          (text.includes('直接') || text.includes('高效')
            ? '直接、高效'
            : '真诚、尊重边界'),
      },
      interests: {
        sports: this.cleanStrings(
          [...existingArr('fitnessGoals'), ...sports],
          8,
        ),
        lifestyle: this.cleanStrings(
          [...existingArr('lifestyleTags'), ...lifestyle],
          8,
        ),
        socialScenes: this.cleanStrings(
          [...existingArr('socialScenes'), '同城约练', '线下交流'],
          6,
        ),
      },
      preferences: {
        wantToMeet: this.cleanStrings(
          [...existingArr('wantToMeet'), ...goals, '健身搭子', '同城朋友'],
          8,
        ),
        preferredTraits: this.cleanStrings(
          [...existingArr('preferredTraits'), '真诚', '自律', '有边界感'],
          8,
        ),
        avoid: this.cleanStrings(
          [...existingArr('avoidTraits'), '骚扰', '欺骗', '低质量闲聊'],
          8,
        ),
      },
      relationshipIntent: {
        goals: this.cleanStrings(
          [...existingArr('relationshipGoals'), ...goals, '交朋友', '找搭子'],
          6,
        ),
        openness: stringValue(existing.openness) || 'medium',
      },
      availability: {
        weekdays:
          stringValue(existing.weekdayAvailability) ||
          find(/工作日([^\n。]*)/) ||
          '',
        weekends:
          stringValue(existing.weekendAvailability) ||
          find(/周末([^\n。]*)/) ||
          '',
      },
      visibility: {
        profileDiscoverable: true,
        agentCanRecommendMe: true,
        agentCanStartChatAfterApproval: true,
      },
      matchSignals: this.buildMatchSignals({
        publicTags: [...sports, ...lifestyle, ...traits],
        privatePreferenceTags: [
          ...goals,
          ...existingArr('preferredTraits'),
          ...existingArr('wantToMeet'),
        ],
        sensitivePrivateTags: this.extractSensitiveTags(text),
        matchKeywords: [
          ...sports,
          ...lifestyle,
          ...traits,
          ...goals,
          ...existingArr('interestTags'),
        ],
        confidence: text ? 0.55 : 0.35,
        source: 'fallback',
      }),
      summary:
        stringValue(existing.aiSummary) ||
        '适合匹配真诚、自律、尊重边界，并愿意一起运动或交流成长话题的人。',
    };
  }

  private normalizeProfileBuilderCard(
    parsed: Partial<AiProfileBuilderCard> | null,
    fallback: AiProfileBuilderCard,
  ): AiProfileBuilderCard {
    if (!parsed || typeof parsed !== 'object') return fallback;
    const arr = (value: unknown, fallbackValue: string[], limit = 8) => {
      if (!Array.isArray(value)) return fallbackValue;
      return this.cleanStrings(
        value.map((item) => (typeof item === 'string' ? item : '')),
        limit,
      );
    };
    const bool = (value: unknown, fallbackValue: boolean) =>
      typeof value === 'boolean' ? value : fallbackValue;
    const basic = (parsed.basic ?? {}) as Partial<
      AiProfileBuilderCard['basic']
    >;
    const personality = (parsed.personality ?? {}) as Partial<
      AiProfileBuilderCard['personality']
    >;
    const interests = (parsed.interests ?? {}) as Partial<
      AiProfileBuilderCard['interests']
    >;
    const preferences = (parsed.preferences ?? {}) as Partial<
      AiProfileBuilderCard['preferences']
    >;
    const relationshipIntent = (parsed.relationshipIntent ?? {}) as Partial<
      AiProfileBuilderCard['relationshipIntent']
    >;
    const availability = (parsed.availability ?? {}) as Partial<
      AiProfileBuilderCard['availability']
    >;
    const visibility = (parsed.visibility ?? {}) as Partial<
      AiProfileBuilderCard['visibility']
    >;
    const rawSignals =
      parsed.matchSignals && typeof parsed.matchSignals === 'object'
        ? (parsed.matchSignals as Partial<AiProfileMatchSignals>)
        : {};
    const matchSignals = this.buildMatchSignals({
      publicTags: arr(
        rawSignals.publicTags,
        fallback.matchSignals.publicTags,
        12,
      ),
      privatePreferenceTags: arr(
        rawSignals.privatePreferenceTags,
        fallback.matchSignals.privatePreferenceTags,
        12,
      ),
      sensitivePrivateTags: arr(
        rawSignals.sensitivePrivateTags,
        fallback.matchSignals.sensitivePrivateTags,
        12,
      ),
      matchKeywords: arr(
        rawSignals.matchKeywords,
        fallback.matchSignals.matchKeywords,
        24,
      ),
      confidence:
        typeof rawSignals.confidence === 'number'
          ? rawSignals.confidence
          : fallback.matchSignals.confidence,
      source: stringValue(rawSignals.source) || fallback.matchSignals.source,
    });

    return {
      basic: {
        nickname: stringValue(basic.nickname) || fallback.basic.nickname,
        city: stringValue(basic.city) || fallback.basic.city,
        ageRange: stringValue(basic.ageRange) || fallback.basic.ageRange,
        gender: stringValue(basic.gender) || fallback.basic.gender,
        zodiac: stringValue(basic.zodiac) || fallback.basic.zodiac,
      },
      personality: {
        mbti: stringValue(personality.mbti) || fallback.personality.mbti,
        traits: arr(personality.traits, fallback.personality.traits, 8),
        socialStyle:
          stringValue(personality.socialStyle) ||
          fallback.personality.socialStyle,
        communicationStyle:
          stringValue(personality.communicationStyle) ||
          fallback.personality.communicationStyle,
      },
      interests: {
        sports: arr(interests.sports, fallback.interests.sports, 8),
        lifestyle: arr(interests.lifestyle, fallback.interests.lifestyle, 8),
        socialScenes: arr(
          interests.socialScenes,
          fallback.interests.socialScenes,
          8,
        ),
      },
      preferences: {
        wantToMeet: arr(
          preferences.wantToMeet,
          fallback.preferences.wantToMeet,
          8,
        ),
        preferredTraits: arr(
          preferences.preferredTraits,
          fallback.preferences.preferredTraits,
          8,
        ),
        avoid: arr(preferences.avoid, fallback.preferences.avoid, 8),
      },
      relationshipIntent: {
        goals: arr(
          relationshipIntent.goals,
          fallback.relationshipIntent.goals,
          8,
        ),
        openness:
          stringValue(relationshipIntent.openness) ||
          fallback.relationshipIntent.openness,
      },
      availability: {
        weekdays:
          stringValue(availability.weekdays) || fallback.availability.weekdays,
        weekends:
          stringValue(availability.weekends) || fallback.availability.weekends,
      },
      visibility: {
        profileDiscoverable: bool(
          visibility.profileDiscoverable,
          fallback.visibility.profileDiscoverable,
        ),
        agentCanRecommendMe: bool(
          visibility.agentCanRecommendMe,
          fallback.visibility.agentCanRecommendMe,
        ),
        agentCanStartChatAfterApproval: bool(
          visibility.agentCanStartChatAfterApproval,
          fallback.visibility.agentCanStartChatAfterApproval,
        ),
      },
      matchSignals,
      summary: stringValue(parsed.summary) || fallback.summary,
    };
  }

  private buildMatchSignals(
    input: Partial<AiProfileMatchSignals>,
  ): AiProfileMatchSignals {
    const publicTags = this.cleanStrings(
      (input.publicTags ?? []).filter((tag) => !this.isSensitiveTag(tag)),
      12,
    );
    const privatePreferenceTags = this.cleanStrings(
      (input.privatePreferenceTags ?? []).filter(
        (tag) => !this.isSensitiveTag(tag),
      ),
      12,
    );
    const sensitivePrivateTags = this.cleanStrings(
      [
        ...(input.sensitivePrivateTags ?? []),
        ...(input.publicTags ?? []).filter((tag) => this.isSensitiveTag(tag)),
        ...(input.privatePreferenceTags ?? []).filter((tag) =>
          this.isSensitiveTag(tag),
        ),
      ],
      12,
    );
    const semanticPrivateTags = this.cleanStrings(
      sensitivePrivateTags.flatMap((tag) => this.semanticAliasesForTag(tag)),
      12,
    );
    const matchKeywords = this.cleanStrings(
      [
        ...(input.matchKeywords ?? []),
        ...publicTags,
        ...privatePreferenceTags,
        ...sensitivePrivateTags,
        ...semanticPrivateTags,
      ],
      24,
    );
    const confidence = Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(1, Number(input.confidence)))
      : 0.5;
    return {
      publicTags,
      privatePreferenceTags,
      sensitivePrivateTags,
      matchKeywords,
      confidence,
      source: stringValue(input.source) || 'fallback',
    };
  }

  private extractSensitiveTags(text: string): string[] {
    const lower = text.toLowerCase();
    return [
      'wealth_resource',
      '年少多金',
      '高消费',
      '有钱',
      '资源',
      'rich',
      'money',
      'wealth',
      'income',
      'salary',
      'handsome',
      'beautiful',
      'good-looking',
      'resources',
      'status',
      '有钱',
      '富',
      '收入',
      '高薪',
      '颜值',
      '帅',
      '美',
      '资源',
      '身份',
    ].filter((tag) => lower.includes(tag.toLowerCase()));
  }

  private isSensitiveTag(tag: string): boolean {
    if (/wealth_resource|status_signal/i.test(tag)) return true;
    return /rich|money|wealth|income|salary|handsome|beautiful|good-looking|resources|status|有钱|富|收入|高薪|颜值|帅|美|资源|身份/i.test(
      tag,
    );
  }

  private semanticAliasesForTag(tag: string): string[] {
    const normalized = (tag ?? '').trim().toLowerCase();
    const aliases: string[] = [];
    if (
      /(wealth_resource|rich|wealth|money|income|salary|resource|resources|asset|net.?worth|有钱|财富|资源|收入|高薪|年少多金|身价|资产|高消费)/i.test(
        normalized,
      )
    ) {
      aliases.push('wealth_resource');
    }
    if (
      /(founder|entrepreneur|startup|business|ceo|创业|创始人|企业家|商业|事业型)/i.test(
        normalized,
      )
    ) {
      aliases.push('business_builder');
    }
    if (
      /(status_signal|high.?status|elite|vip|身份|地位|名流|精英)/i.test(
        normalized,
      )
    ) {
      aliases.push('status_signal');
    }
    return aliases;
  }

  private pickKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter((keyword) => text.includes(keyword));
  }

  private cleanStrings(values: string[], limit = 30): string[] {
    return Array.from(
      new Set(values.map((v) => v.trim()).filter(Boolean)),
    ).slice(0, limit);
  }

  private normalizeSocialRequestCard(
    parsed: Partial<SocialRequestCard>,
    fallback: SocialRequestCard,
    profile: { city?: string | null; interestTags?: string[] | null },
    rawText: string,
  ): SocialRequestCard {
    const asStringArray = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .map((x) => (typeof x === 'string' ? x.trim() : ''))
            .filter((x): x is string => !!x)
        : [];

    // interestTags: dedupe → clamp 5..8 (pad from profile + keyword fallback)
    let tags = asStringArray(parsed.interestTags);
    tags = Array.from(new Set(tags));
    if (tags.length > 8) tags = tags.slice(0, 8);
    if (tags.length < 5) {
      const padPool = [
        ...(profile.interestTags ?? []),
        ...fallback.interestTags,
      ];
      for (const t of padPool) {
        const v = (t || '').trim();
        if (v && !tags.includes(v)) tags.push(v);
        if (tags.length >= 5) break;
      }
    }

    const riskNotes = asStringArray(parsed.riskNotes);
    if (riskNotes.length < 2) {
      for (const r of fallback.riskNotes) {
        if (!riskNotes.includes(r)) riskNotes.push(r);
        if (riskNotes.length >= 2) break;
      }
    }

    const privacyNotes = asStringArray(parsed.privacyNotes);
    if (privacyNotes.length < 2) {
      for (const p of fallback.privacyNotes) {
        if (!privacyNotes.includes(p)) privacyNotes.push(p);
        if (privacyNotes.length >= 2) break;
      }
    }

    let personality = asStringArray(parsed.personalityPreference);
    if (typeof parsed.personalityPreference === 'string') {
      personality = (parsed.personalityPreference as string)
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (personality.length === 0) personality = fallback.personalityPreference;

    return {
      title:
        (typeof parsed.title === 'string' && parsed.title.trim()) ||
        fallback.title,
      description:
        (typeof parsed.description === 'string' && parsed.description.trim()) ||
        fallback.description ||
        rawText,
      interestTags: tags,
      locationPreference:
        (typeof parsed.locationPreference === 'string' &&
          parsed.locationPreference.trim()) ||
        fallback.locationPreference,
      timePreference:
        (typeof parsed.timePreference === 'string' &&
          parsed.timePreference.trim()) ||
        fallback.timePreference,
      socialGoal:
        (typeof parsed.socialGoal === 'string' && parsed.socialGoal.trim()) ||
        fallback.socialGoal,
      personalityPreference: personality,
      riskNotes,
      privacyNotes,
    };
  }

  private fallbackSocialRequestCard(
    text: string,
    profile: { city?: string | null; interestTags?: string[] | null },
  ): SocialRequestCard {
    const rich = this.fallbackParseRich(text);
    const t = text;

    // interestTags: rich.tags + profile.interestTags + 关键词兜底，clamp 5..8
    const tagPool: string[] = [];
    for (const v of [...rich.interestTags, ...(profile.interestTags ?? [])]) {
      const x = (v || '').trim();
      if (x && !tagPool.includes(x)) tagPool.push(x);
    }
    const keywordPad = ['运动', '社交', '搭子', '同城', '兴趣', '约练'];
    for (const k of keywordPad) {
      if (tagPool.length >= 5) break;
      if (!tagPool.includes(k)) tagPool.push(k);
    }
    const interestTags = tagPool.slice(0, 8);

    const timePreference = (() => {
      const m = t.match(
        /(工作日|周末|周六|周日|早上|上午|中午|下午|晚上|傍晚|夜里|今晚|明天|后天)/,
      );
      return m ? m[1] : '时间灵活，可线上协商';
    })();

    const personalityPreference = (() => {
      const found: string[] = [];
      const map = [
        '安静',
        '外向',
        '内向',
        '健谈',
        '佛系',
        '认真',
        '轻松',
        '休闲',
      ];
      for (const w of map) if (t.includes(w)) found.push(w);
      return found.length > 0 ? found : ['友善', '尊重边界'];
    })();

    return {
      title: rich.suggestedTitle,
      description:
        text ||
        `${rich.suggestedTitle}，希望认识${
          personalityPreference[0] || '友善'
        }的伙伴，一起参与。`,
      interestTags,
      locationPreference: rich.locationPreference,
      timePreference,
      socialGoal: rich.goal,
      personalityPreference,
      riskNotes: [
        '建议首次见面选择白天、人流量大的公共场所，不要前往陌生封闭场地。',
        '可以提前告诉信任的朋友你的约见时间和大致地点。',
      ],
      privacyNotes: [
        '不要在公开需求中填写精确住址、门牌号或工作地点。',
        '不要在卡片或聊天中公开手机号、微信号等私人联系方式，先用站内消息沟通。',
      ],
    };
  }

  /** Same as callDeepseek but enforces `response_format: { type: 'json_object' }`. */
  private async callDeepseekJson(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions = {},
  ): Promise<string> {
    return this.callDeepseekCompletion(systemPrompt, userPrompt, options, {
      type: 'json_object',
    });
  }

  private fallbackParse(text: string): {
    activityType: string;
    tags: string[];
    summary: string;
  } {
    const t = text.toLowerCase();
    let activityType = 'custom';
    if (/(跑步|run|jogging)/.test(t)) activityType = 'running';
    else if (/(健身|gym|workout|训练)/.test(t)) activityType = 'fitness';
    else if (/(遛狗|dog\s*walk)/.test(t)) activityType = 'dog_walking';
    else if (/(咖啡|coffee)/.test(t)) activityType = 'coffee_chat';
    else if (/(散步|city\s*walk|遛弯)/.test(t)) activityType = 'city_walk';

    const tagCandidates = [
      '跑步',
      '健身',
      '瑜伽',
      '骑行',
      '篮球',
      '羽毛球',
      '咖啡',
      '电影',
      '摄影',
      '读书',
      '自习',
    ];
    const tags = tagCandidates.filter((c) => text.includes(c));
    return { activityType, tags, summary: text.slice(0, 120) };
  }

  private fallbackParseRich(text: string): {
    goal: string;
    interestTags: string[];
    locationPreference: string;
    personalityPreference: string;
    suggestedTitle: string;
  } {
    const basic = this.fallbackParse(text);
    const t = text;
    const locationPreference = (() => {
      const m = t.match(/(室内|户外|健身房|公园|球馆|海边|江边|河边|步道)/);
      return m ? m[1] : '不限';
    })();
    const personalityPreference = (() => {
      const m = t.match(/(安静|外向|内向|健谈|佛系|认真|轻松|休闲)/);
      return m ? m[1] : '随意';
    })();
    const goal = basic.summary || '一起运动、互相督促';
    const suggestedTitle = (() => {
      const map: Record<string, string> = {
        running: '一起跑步',
        fitness: '一起健身',
        dog_walking: '一起遛狗',
        coffee_chat: '一起喝咖啡',
        city_walk: '一起 City Walk',
        custom: '一起约个伴',
      };
      return map[basic.activityType] || '一起约个伴';
    })();
    return {
      goal,
      interestTags: basic.tags,
      locationPreference,
      personalityPreference,
      suggestedTitle,
    };
  }

  private fallbackCandidateMatchContent(input: {
    request: {
      title?: string | null;
      city?: string | null;
      activityType?: string | null;
      interestTags?: string[] | null;
    };
    candidate: {
      nickname?: string | null;
      city?: string | null;
      commonTags?: string[] | null;
      distanceKm?: number | null;
      verified?: boolean | null;
    };
    score?: number | null;
    riskWarnings?: string[];
  }): AiCandidateMatchContent {
    const nickname = stringValue(input.candidate.nickname) || '这位用户';
    const title =
      stringValue(input.request.title) ||
      stringValue(input.request.activityType) ||
      '这次约练';
    const city = sanitizeCity(
      stringValue(input.request.city) || stringValue(input.candidate.city),
    );
    const commonTags = this.cleanStrings(
      [
        ...(input.candidate.commonTags ?? []),
        ...(input.request.interestTags ?? []),
      ],
      4,
    );
    const reasons: string[] = [];
    if (commonTags.length > 0) {
      reasons.push(
        `你们在 ${commonTags.slice(0, 3).join('、')} 上有共同兴趣，开场成本比较低。`,
      );
    }
    if (city) {
      reasons.push(`活动城市与 ${city} 相关，适合先从公开地点的轻量约练开始。`);
    }
    if (typeof input.candidate.distanceKm === 'number') {
      reasons.push(
        `距离约 ${input.candidate.distanceKm.toFixed(1)} 公里，线下安排更容易控制节奏。`,
      );
    }
    if (typeof input.score === 'number') {
      reasons.push(
        `综合匹配度 ${Math.round(input.score)}%，兴趣、时间和安全边界较接近。`,
      );
    }
    if (input.candidate.verified) {
      reasons.push('对方资料已有认证信号，适合优先尝试站内沟通。');
    }
    if (reasons.length === 0) {
      reasons.push('对方画像与这次需求有基础重合，适合先用低压力方式了解。');
    }

    const riskWarnings = this.normalizeRiskWarningsZh(input.riskWarnings ?? []);
    if (riskWarnings.length === 0) {
      riskWarnings.push('先使用站内消息沟通，不交换手机号、微信或详细住址。');
      riskWarnings.push('如需线下见面，建议选择白天或人流量大的公开地点。');
    }

    return {
      source: 'fallback',
      recommendationReasons: reasons.slice(0, 4),
      icebreakerMessage: this.fallbackInviteZh(
        title,
        input.request.activityType,
        nickname,
        commonTags,
        city,
      ),
      riskWarnings,
    };
  }

  private normalizeRiskWarningsZh(values: string[]): string[] {
    const mapped = values
      .map((value) => {
        const text = stringValue(value);
        const lower = text.toLowerCase();
        if (!text) return '';
        if (lower.includes('not verified'))
          return '对方尚未完成认证，建议先通过站内消息确认基本信息。';
        if (lower.includes('profile is incomplete'))
          return '对方资料还不完整，建议先了解活动边界和时间地点。';
        if (lower.includes('verified-only'))
          return '本次偏好要求认证用户，请优先等待已认证候选人。';
        if (lower.includes('privacy') || lower.includes('boundary')) {
          return '双方隐私边界需要保留，避免交换联系方式或详细住址。';
        }
        return sanitizeAiMatchText(text, 60);
      })
      .filter(Boolean);
    return Array.from(new Set(mapped)).slice(0, 3);
  }

  private fallbackInviteZh(
    requestTitle: string | null | undefined,
    activityType: string | null | undefined,
    nickname: string,
    commonTags: string[],
    city?: string | null,
  ): string {
    const title =
      stringValue(requestTitle) || stringValue(activityType) || '这次约练';
    const tagPart =
      commonTags.length > 0
        ? `我也对 ${commonTags.slice(0, 2).join('、')} 感兴趣，`
        : '';
    const cityPart = city ? `，再确认在${city}是否合适` : '';
    return `${nickname} 你好，${tagPart}看到你和「${title}」比较匹配。方便先在 FitMeet 上聊聊${cityPart}吗？`;
  }

  private fallbackInvite(
    requestTitle: string,
    nickname: string,
    commonTags: string[],
  ): string {
    const tagPart =
      commonTags.length > 0
        ? `我们都喜欢 ${commonTags.slice(0, 3).join('、')}，`
        : '';
    return (
      `${nickname} 你好！${tagPart}` +
      `我在 FitMeet 发起了「${requestTitle}」，时间地点可以先商量，方便先站内聊聊吗？`
    );
  }

  private fallbackReviewSummary(
    activity: {
      title?: string | null;
      status?: string | null;
      participantsCount?: number | null;
      checkedInCount?: number | null;
      proofCount?: number | null;
      durationMinutes?: number | null;
    },
    reviews: Array<{ rating?: number | null; text?: string | null }>,
  ): string {
    const title = activity.title || '本次活动';
    const status = activity.status || 'completed';
    const participants = activity.participantsCount ?? 0;
    const checked = activity.checkedInCount ?? 0;
    const proofs = activity.proofCount ?? 0;
    const ratings = reviews
      .map((r) => (typeof r.rating === 'number' ? r.rating : null))
      .filter((v): v is number => v !== null);
    const avg =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;
    const parts: string[] = [];
    parts.push(`${title} 状态：${status}`);
    parts.push(
      `参与 ${participants} 人，签到 ${checked} 人，证明 ${proofs} 条。`,
    );
    if (avg !== null) {
      parts.push(
        `平均评分 ${avg.toFixed(1)} 分（共 ${ratings.length} 条评价）。`,
      );
    } else {
      parts.push('暂无评价。');
    }
    if (activity.durationMinutes) {
      parts.push(`时长约 ${activity.durationMinutes} 分钟。`);
    }
    return parts.join(' ');
  }

  private safeJson<T>(raw: string | null | undefined): T | null {
    if (!raw) return null;
    try {
      // Strip code fences if the model adds them.
      const cleaned = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }

  private async callDeepseek(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions = {},
  ): Promise<string> {
    return this.callDeepseekCompletion(systemPrompt, userPrompt, options);
  }

  private async callDeepseekCompletion(
    systemPrompt: string,
    userPrompt: string,
    options: AiGenerationOptions = {},
    responseFormat?: { type: 'json_object' },
  ): Promise<string> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');
    const model = this.deepseekModel();
    const timeoutMs = this.deepseekTimeoutMs();
    return callDeepSeekChatCompletion({
      apiKey,
      baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL'),
      model,
      temperature: 0.4,
      responseFormat,
      timeoutMs,
      retryAttempts: this.deepseekRetryAttempts(),
      signal: options.signal,
      timeoutMessage: `DeepSeek AIService timeout after ${timeoutMs}ms`,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
  }

  private deepseekModel(): string {
    return resolveDeepSeekModel(
      this.config.get<string>('DEEPSEEK_CHAT_MODEL') ??
        this.config.get<string>('DEEPSEEK_MODEL'),
    );
  }

  private deepseekTimeoutMs(): number {
    const raw =
      this.config.get<string>('AI_DEEPSEEK_TIMEOUT_MS') ??
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_TIMEOUT_MS') ??
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS');
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return AI_DEEPSEEK_TIMEOUT_FALLBACK_MS;
    }
    return Math.max(parsed, AI_DEEPSEEK_TIMEOUT_FLOOR_MS);
  }

  private deepseekRetryAttempts(): number {
    const raw =
      this.config.get<string>('AI_DEEPSEEK_RETRY_ATTEMPTS') ??
      this.config.get<string>('SOCIAL_AGENT_DEEPSEEK_RETRY_ATTEMPTS');
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 2;
    return Math.max(1, Math.trunc(parsed));
  }

  private isClientAbort(error: unknown): boolean {
    return (error as Error | undefined)?.message === 'client_aborted';
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function boundedAiScore(value: number, baseScore: number): number {
  const base = clampScore(baseScore);
  const next = clampScore(value);
  return Math.max(base - 12, Math.min(base + 12, next));
}

function sanitizeAiMatchList(
  value: unknown,
  fallback: string[],
  limit = 4,
): string[] {
  if (!Array.isArray(value)) return fallback.slice(0, limit);
  const list = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => sanitizeAiMatchText(item, 120))
    .filter(Boolean);
  const normalized = Array.from(new Set(list)).slice(0, limit);
  return normalized.length > 0 ? normalized : fallback.slice(0, limit);
}

function sanitizeAiMatchText(value: string, max: number): string {
  const redacted = (value || '')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[已隐藏]')
    .replace(/(?:\+?\d[\d\s-]{6,}\d)/g, '[已隐藏]')
    .replace(
      /(微信|wechat|qq|手机号|电话|地址|住址|门牌|收入|月薪|年薪)[:：]?\s*[^，。；;\n]{2,}/gi,
      '$1[已隐藏]',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return redacted.length > max ? `${redacted.slice(0, max - 1)}...` : redacted;
}
