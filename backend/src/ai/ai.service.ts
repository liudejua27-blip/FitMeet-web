import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
      this.logger.warn(`parseSocialIntent fell back: ${(err as Error).message}`);
      return fallback;
    }
  }

  /** Generate an invite message tailored to a candidate. */
  async generateInviteText(input: {
    requestTitle: string;
    candidateNickname: string;
    commonTags?: string[];
  }): Promise<string> {
    const tagPart =
      input.commonTags && input.commonTags.length > 0
        ? `我们都喜欢 ${input.commonTags.slice(0, 3).join('、')}，`
        : '';
    const fallback =
      `${input.candidateNickname} 你好！${tagPart}` +
      `我在 FitMeet 发起了「${input.requestTitle}」，时间地点都灵活，有空一起？`;
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的破冰文案助手，输出 60 字以内、自然、不油腻的开场白，中文。',
        JSON.stringify(input),
      );
      return out?.trim() || fallback;
    } catch (err) {
      this.logger.warn(`generateInviteText fell back: ${(err as Error).message}`);
      return fallback;
    }
  }

  /** Explain why a candidate matched. Currently a stub — returns reasons unchanged. */
  async explainMatch(reasons: string[]): Promise<string> {
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
  async generateProfileQuestions(input: {
    missingKeys: string[];
    contextSummary: string;
  }): Promise<Array<{ key: string; question: string; type: string }>> {
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
      this.logger.warn(
        `generateProfileQuestions fell back: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /** Generate a short post-activity recap (one or two sentences). */
  async generateRecap(input: {
    title: string;
    participantsCount: number;
    durationMinutes?: number;
  }): Promise<string> {
    const fallback =
      `${input.title} 已完成，共 ${input.participantsCount} 位伙伴参与。` +
      (input.durationMinutes ? `时长约 ${input.durationMinutes} 分钟。` : '');
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的活动复盘助手，用 2 句中文总结刚结束的活动，鼓励下次再约。',
        JSON.stringify(input),
      );
      return out?.trim() || fallback;
    } catch (err) {
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
  ): Promise<string> {
    const reqTitle =
      request.title || request.activityType || '一起约个运动';
    const nickname = candidate.nickname || '朋友';
    const tags =
      candidate.commonTags && candidate.commonTags.length > 0
        ? candidate.commonTags
        : request.interestTags ?? [];
    const fallback = this.fallbackInvite(reqTitle, nickname, tags);
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的破冰文案助手，输出 60 字以内、自然、不油腻的中文开场白。',
        JSON.stringify({ request, candidate }),
      );
      return out?.trim() || fallback;
    } catch (err) {
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
      );
      return out?.trim() || fallback;
    } catch (err) {
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
  ): Promise<string> {
    const fallback = this.fallbackReviewSummary(activity, reviews);
    if (!this.isLlmEnabled()) return fallback;
    try {
      const out = await this.callDeepseek(
        '你是 FitMeet 的活动复盘助手，用 2-3 句中文输出活动总结，' +
          '点出亮点和值得改进的地方，鼓励下次再约。',
        JSON.stringify({ activity, reviews }),
      );
      return out?.trim() || fallback;
    } catch (err) {
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
      const out = await this.callDeepseekJson(systemPrompt, userPayload);
      const parsed = this.safeJson<Partial<SocialRequestCard>>(out);
      if (parsed && typeof parsed === 'object') {
        return this.normalizeSocialRequestCard(parsed, fallback, profile, text);
      }
      return fallback;
    } catch (err) {
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
  async generateProfileBuilderCard(input: {
    answers: Array<{ question: string; answer: string }>;
    existingProfile?: Record<string, unknown>;
    user?: { nickname?: string | null; city?: string | null };
    source?: string;
  }): Promise<AiProfileBuilderCard> {
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
      );
      const parsed = this.safeJson<Partial<AiProfileBuilderCard>>(out);
      return this.normalizeProfileBuilderCard(parsed, fallback);
    } catch (err) {
      this.logger.warn(
        `generateProfileBuilderCard fell back: ${(err as Error).message}`,
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
      stringValue(existing.nickname) || input.user?.nickname || find(/昵称[是为:]?([^\n，。]+)/) || '';
    const city =
      stringValue(existing.city) || input.user?.city || find(/(?:常驻|城市|地区)[是为:]?([^\n，。]+)/);
    const ageRange =
      stringValue(existing.ageRange) || find(/(\d{2}\s*[-到至]\s*\d{2})/) || '';
    const gender = stringValue(existing.gender);

    return {
      basic: {
        nickname,
        city,
        ageRange,
        gender,
        zodiac: stringValue(existing.zodiac),
      },
      personality: {
        mbti: stringValue(existing.mbti),
        traits: this.cleanStrings([...existingArr('traits'), ...traits], 8),
        socialStyle:
          stringValue(existing.socialStyle) ||
          (text.includes('慢热') ? '慢热型' : text.includes('主动') ? '主动型' : '自然相处型'),
        communicationStyle:
          stringValue(existing.communicationStyle) ||
          (text.includes('直接') || text.includes('高效')
            ? '直接、高效'
            : '真诚、尊重边界'),
      },
      interests: {
        sports: this.cleanStrings([...existingArr('fitnessGoals'), ...sports], 8),
        lifestyle: this.cleanStrings([...existingArr('lifestyleTags'), ...lifestyle], 8),
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
        goals: this.cleanStrings([...existingArr('relationshipGoals'), ...goals, '交朋友', '找搭子'], 6),
        openness: stringValue(existing.openness) || 'medium',
      },
      availability: {
        weekdays: stringValue(existing.weekdayAvailability) || find(/工作日([^\n。]*)/) || '',
        weekends: stringValue(existing.weekendAvailability) || find(/周末([^\n。]*)/) || '',
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
    const basic = (parsed.basic ?? {}) as Partial<AiProfileBuilderCard['basic']>;
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
      publicTags: arr(rawSignals.publicTags, fallback.matchSignals.publicTags, 12),
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
          stringValue(personality.socialStyle) || fallback.personality.socialStyle,
        communicationStyle:
          stringValue(personality.communicationStyle) ||
          fallback.personality.communicationStyle,
      },
      interests: {
        sports: arr(interests.sports, fallback.interests.sports, 8),
        lifestyle: arr(interests.lifestyle, fallback.interests.lifestyle, 8),
        socialScenes: arr(interests.socialScenes, fallback.interests.socialScenes, 8),
      },
      preferences: {
        wantToMeet: arr(preferences.wantToMeet, fallback.preferences.wantToMeet, 8),
        preferredTraits: arr(
          preferences.preferredTraits,
          fallback.preferences.preferredTraits,
          8,
        ),
        avoid: arr(preferences.avoid, fallback.preferences.avoid, 8),
      },
      relationshipIntent: {
        goals: arr(relationshipIntent.goals, fallback.relationshipIntent.goals, 8),
        openness:
          stringValue(relationshipIntent.openness) || fallback.relationshipIntent.openness,
      },
      availability: {
        weekdays: stringValue(availability.weekdays) || fallback.availability.weekdays,
        weekends: stringValue(availability.weekends) || fallback.availability.weekends,
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
    const matchKeywords = this.cleanStrings(
      [
        ...(input.matchKeywords ?? []),
        ...publicTags,
        ...privatePreferenceTags,
        ...sensitivePrivateTags,
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
    return /rich|money|wealth|income|salary|handsome|beautiful|good-looking|resources|status|有钱|富|收入|高薪|颜值|帅|美|资源|身份/i.test(
      tag,
    );
  }

  private pickKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter((keyword) => text.includes(keyword));
  }

  private cleanStrings(values: string[], limit = 30): string[] {
    return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(
      0,
      limit,
    );
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

    let riskNotes = asStringArray(parsed.riskNotes);
    if (riskNotes.length < 2) {
      for (const r of fallback.riskNotes) {
        if (!riskNotes.includes(r)) riskNotes.push(r);
        if (riskNotes.length >= 2) break;
      }
    }

    let privacyNotes = asStringArray(parsed.privacyNotes);
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
        (typeof parsed.description === 'string' &&
          parsed.description.trim()) ||
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
    for (const v of [
      ...rich.interestTags,
      ...(profile.interestTags ?? []),
    ]) {
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
        '安静', '外向', '内向', '健谈', '佛系', '认真', '轻松', '休闲',
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
  ): Promise<string> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model =
      this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`DeepSeek HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
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
      '跑步', '健身', '瑜伽', '骑行', '篮球', '羽毛球', '咖啡',
      '电影', '摄影', '读书', '自习',
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
      `我在 FitMeet 发起了「${requestTitle}」，时间地点都灵活，有空一起？`
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
      parts.push(`平均评分 ${avg.toFixed(1)} 分（共 ${ratings.length} 条评价）。`);
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
  ): Promise<string> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');
    const baseUrl =
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model =
      this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`DeepSeek HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
