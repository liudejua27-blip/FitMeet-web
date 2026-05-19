import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserSocialProfile } from '../users/user-social-profile.entity';

/**
 * AI Match Reasoner
 * -----------------
 * Produces rich, safety-filtered match explanations to attach to profile
 * recommendations. Designed so the whole pipeline keeps working without an
 * LLM key — DeepSeek augmentation is opt-in via `DEEPSEEK_API_KEY` and
 * falls back deterministically on any failure.
 *
 * Output contract (per product spec):
 *   publicReason            -> safe to show on the recommendation card
 *   privateReason           -> only owner / authorized agent eyes
 *   sharedPoints            -> common ground (public)
 *   complementaryPoints     -> how they complement each other (public)
 *   riskWarnings            -> things to be careful about
 *   suggestedOpener         -> first-message draft
 *   nextAction              -> recommended next step for the owner
 *   requiresUserConfirmation-> true whenever any outbound action implied
 *   confidence              -> 0..1 reasoner confidence
 *
 * Safety filters enforced regardless of source:
 *   - no income numbers / currency amounts
 *   - no contact info (phone, email, IM handles)
 *   - no precise addresses (street/door numbers)
 *   - no employer / school / id-bearing identifiers
 *   - no "because they are rich" style framing
 *   - wealth/resource preferences are reframed as voluntary lifestyle tags
 */

export interface MatchReasonerInput {
  ownerProfile: UserSocialProfile;
  candidateProfile: UserSocialProfile;
  matchSignals?: {
    publicTags?: string[];
    privatePreferenceTags?: string[];
    sensitivePrivateTags?: string[];
    matchKeywords?: string[];
    confidence?: number;
  } | null;
  publicTags?: { owner: string[]; candidate: string[]; shared: string[] };
  privatePreferenceSignals?: string[];
  confirmedSensitiveTags?: string[];
  avoidSignals?: string[];
  safetySignals?: string[];
  scoreBreakdown?: {
    score: number;
    cityMatch?: boolean;
    mbtiMatch?: boolean;
    zodiacMatch?: boolean;
    traitOverlap?: string[];
    privateOverlap?: string[];
  };
}

export interface MatchReasonerOutput {
  publicReason: string;
  privateReason: string;
  sharedPoints: string[];
  complementaryPoints: string[];
  riskWarnings: string[];
  suggestedOpener: string;
  nextAction: string;
  requiresUserConfirmation: boolean;
  confidence: number;
  source: 'deepseek' | 'fallback';
}

export interface MatchScoreSecondPass {
  score: number;
  confidence: number;
  source: 'deepseek' | 'fallback';
  publicReason: string;
  privateReason: string;
  riskWarnings: string[];
}

const MAX_REASON_LEN = 320;
const MAX_OPENER_LEN = 220;
const MAX_LIST_ITEM = 80;

// Wealth/resource framing keywords — when seen, prepend the safe disclaimer
// instead of "because they are rich" style language.
const WEALTH_KEYWORDS =
  /(财富|有钱|富|资源|身份|高薪|高消费|高净值|事业型|创业|商业|商务|wealth|rich|status|resource|business|entrepreneur)/i;

// Strict redaction patterns — applied to every text field in the output.
const REDACTION_RULES: Array<[RegExp, string]> = [
  // emails
  [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[已隐藏]'],
  // phone numbers (intl / cn)
  [/(?:\+?\d[\d\s-]{6,}\d)/g, '[已隐藏]'],
  // explicit money amounts
  [
    /(?:￥|¥|RMB|CNY|USD|\$|EUR|€)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:万|千|百|w|k|m))?/gi,
    '[金额已隐藏]',
  ],
  [/\d[\d,]*\s?(?:元|块|万|w|k|RMB)\b/gi, '[金额已隐藏]'],
  // labels with leaky values
  [
    /(微信|wechat|qq|手机号|电话|身份证|住址|地址|门牌|单位|公司|学校|大学|学院|收入|年薪|月薪|工资|身份)[:：]?\s*[^，。；;\n]{2,}/gi,
    '$1已隐藏',
  ],
  // "because they are rich" framing → softer reframing
  [
    /(因为|由于)[^。；\n]{0,12}(有钱|很有钱|是富二代|很富|身份很高)/g,
    '因对方画像中含有自愿公开的相关生活方式标签',
  ],
];

@Injectable()
export class MatchReasonerService {
  private readonly logger = new Logger(MatchReasonerService.name);

  constructor(@Optional() private readonly config?: ConfigService) {}

  /**
   * Main entry point — always resolves. LLM failures fall back silently
   * to the deterministic builder so callers never need a try/catch.
   */
  async explain(input: MatchReasonerInput): Promise<MatchReasonerOutput> {
    const fallback = this.buildFallback(input);
    if (!this.isDeepseekEnabled()) {
      return fallback;
    }
    try {
      const augmented = await this.tryDeepseek(input, fallback);
      return this.sanitizeOutput(augmented ?? fallback);
    } catch (err) {
      this.logger.warn(
        `MatchReasoner deepseek augmentation failed: ${
          (err as Error)?.message ?? err
        }`,
      );
      return fallback;
    }
  }

  async adjustScore(
    input: MatchReasonerInput,
    baseScore: number,
  ): Promise<MatchScoreSecondPass> {
    const fallbackExplanation = this.buildFallback(input);
    const base = this.clampScore(baseScore);
    const fallback: MatchScoreSecondPass = {
      score: base,
      confidence: fallbackExplanation.confidence,
      source: 'fallback',
      publicReason: fallbackExplanation.publicReason,
      privateReason:
        '未启用 DeepSeek 二次评分，当前分数来自确定性画像兼容度评分。',
      riskWarnings: fallbackExplanation.riskWarnings,
    };
    if (!this.isDeepseekEnabled()) return fallback;

    try {
      const scored = await this.tryDeepseekScore(input, base, fallback);
      return scored ?? fallback;
    } catch (err) {
      this.logger.warn(
        `MatchReasoner deepseek score adjustment failed: ${
          (err as Error)?.message ?? err
        }`,
      );
      return fallback;
    }
  }

  // ---------------------------------------------------------------- helpers

  private isDeepseekEnabled(): boolean {
    if (!this.config) return false;
    const enabled = this.config.get<string>('ENABLE_MATCH_REASONER_LLM');
    if (enabled && enabled !== 'true' && enabled !== '1') return false;
    return Boolean(this.config.get<string>('DEEPSEEK_API_KEY'));
  }

  /**
   * Build a deterministic explanation from the inputs alone. Guaranteed
   * to never leak sensitive content because we synthesize from already
   * tier-classified inputs (caller is expected to pass match-view tags).
   */
  buildFallback(input: MatchReasonerInput): MatchReasonerOutput {
    const owner = input.ownerProfile;
    const candidate = input.candidateProfile;
    const shared = this.uniq(input.publicTags?.shared ?? []);
    const ownerPub = this.uniq(input.publicTags?.owner ?? []);
    const candPub = this.uniq(input.publicTags?.candidate ?? []);
    const priv = this.uniq(input.privatePreferenceSignals ?? []);
    const confirmedSensitive = this.uniq(input.confirmedSensitiveTags ?? []);
    const avoid = this.uniq(input.avoidSignals ?? []);
    const breakdown = input.scoreBreakdown ?? { score: 0 };

    const cityLine =
      breakdown.cityMatch && candidate.city
        ? `同在 ${candidate.city}，线下约见的可行性较高。`
        : owner.city && candidate.city && owner.city !== candidate.city
          ? '两人所在城市不同，建议先线上充分了解后再考虑线下。'
          : '';
    const mbtiLine = breakdown.mbtiMatch
      ? `MBTI 相同（${owner.mbti}），沟通节奏可能比较合拍。`
      : '';
    const zodiacLine = breakdown.zodiacMatch
      ? `星座一致（${owner.zodiac}），相处时可作为破冰话题。`
      : '';

    const sharedPoints = this.takeList(
      [
        shared.length
          ? `共同兴趣：${shared.slice(0, 3).join('、')}`
          : '',
        breakdown.traitOverlap?.length
          ? `相似性格：${breakdown.traitOverlap.slice(0, 3).join('、')}`
          : '',
        mbtiLine,
        zodiacLine,
      ].filter(Boolean),
      4,
    );

    const complementaryPoints = this.takeList(
      [
        ownerPub.length && candPub.length
          ? `你常出现的标签是「${ownerPub.slice(0, 2).join('、')}」，对方的画像中能看到「${candPub
              .filter((t) => !shared.includes(t))
              .slice(0, 2)
              .join('、') || candPub.slice(0, 2).join('、')}」，可作为互补的切入点。`
          : '',
        priv.length
          ? '你设置的私密偏好与对方公开的标签存在交集，建议先以兴趣话题切入。'
          : '',
      ].filter(Boolean),
      3,
    );

    const wealthMention = [...priv, ...confirmedSensitive].some((t) =>
      WEALTH_KEYWORDS.test(t),
    );
    const publicLines = [
      shared.length
        ? `你们都关注 ${shared.slice(0, 3).join('、')}`
        : '画像中能找到一些可聊的共同方向',
      cityLine,
      breakdown.score >= 70
        ? '画像匹配度较高，但仍建议先线上聊一聊再做线下安排。'
        : breakdown.score >= 55
          ? '画像有一定契合度，可以先用轻松的话题打开。'
          : '画像信号较弱，建议先了解一下再判断是否继续。',
    ].filter(Boolean);
    const publicReason = this.clipReason(publicLines.join(' ')) ;

    const privateLines = [
      priv.length
        ? `你的私密偏好（${priv.slice(0, 3).join('、')}）与对方画像存在重叠。`
        : '',
      wealthMention
        ? '对方画像中包含创业、商业交流、高消费生活方式等自愿标签，与你当前想认识事业型 / 资源型朋友的目标接近——这是你的偏好侧的解读，对方公开页不会显示。'
        : '',
      confirmedSensitive.length
        ? `你已确认参与匹配的私密标签：${confirmedSensitive.slice(0, 3).join('、')}（仅本人和授权 Agent 可见）。`
        : '',
    ].filter(Boolean);
    const privateReason = this.clipReason(
      privateLines.join(' ') ||
        '没有额外的私密匹配理由，更多依赖公开标签的契合度。',
    );

    const riskWarnings = this.takeList(
      [
        avoid.length
          ? `对方的避雷项包含「${avoid.slice(0, 2).join('、')}」，首次接触请避开。`
          : '',
        owner.privacyBoundary
          ? '尊重你设定的隐私边界，不要主动交换联系方式 / 精确地址。'
          : '',
        breakdown.score < 55
          ? '画像信号较弱，资料较少，建议先线上了解清楚再考虑下一步。'
          : '',
        wealthMention
          ? '涉及资源 / 财富类偏好的匹配存在被误读风险，避免把对方框定为某一类人。'
          : '',
        '禁止把站内画像、推荐理由发到外部平台。',
      ].filter(Boolean),
      4,
    );

    const opener = this.buildOpener({
      candidateName: candidate.nickname || '你好',
      shared,
      candPub,
      cityMatch: Boolean(breakdown.cityMatch),
    });

    const nextAction =
      breakdown.score >= 55
        ? '建议本人审核推荐后，再决定是否让 Agent 代为发起一句问候；不要直接交换联系方式。'
        : '资料较少，建议先线上观察对方画像更新一段时间，不要立刻发起联系。';

    const confidence = Math.max(
      0.3,
      Math.min(
        0.92,
        (input.matchSignals?.confidence ?? 0.5) * 0.6 +
          Math.min(1, (breakdown.score ?? 0) / 100) * 0.4,
      ),
    );

    return this.sanitizeOutput({
      publicReason,
      privateReason,
      sharedPoints,
      complementaryPoints,
      riskWarnings,
      suggestedOpener: opener,
      nextAction,
      requiresUserConfirmation: true,
      confidence: Number(confidence.toFixed(2)),
      source: 'fallback',
    });
  }

  private buildOpener(args: {
    candidateName: string;
    shared: string[];
    candPub: string[];
    cityMatch: boolean;
  }): string {
    const topic =
      args.shared[0] || args.candPub[0] || '最近在 FitMeet 看到的内容';
    const cityClause = args.cityMatch ? '同城的运动 / 社交安排' : '兴趣方向';
    return this.clip(
      `你好 ${args.candidateName}，看到我们都在关注「${topic}」，想轻松聊聊 ${cityClause}。如果方便，回我一句就好，不用有压力。`,
      MAX_OPENER_LEN,
    );
  }

  /**
   * DeepSeek augmentation. Returns null if the response is unusable.
   * The fallback object is given as a hint so the LLM doesn't have to
   * re-derive the structural data; we only ask it to enrich tone.
   */
  private async tryDeepseek(
    input: MatchReasonerInput,
    fallback: MatchReasonerOutput,
  ): Promise<MatchReasonerOutput | null> {
    const apiKey = this.config?.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config?.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model =
      this.config?.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';

    const system = [
      '你是 FitMeet 的 AI 匹配解释器。',
      '严格遵守隐私安全规范：',
      '1. 禁止输出收入 / 金额 / 工资数字；',
      '2. 禁止输出手机号、微信号、邮箱等任何联系方式；',
      '3. 禁止输出精确地址、门牌、单位、学校、身份证明；',
      '4. 不允许使用"因为对方有钱所以推荐"等价值评判式表述；',
      '5. 如果涉及资源型 / 财富型偏好，请表达为"对方画像中包含创业、商业交流、高消费生活方式等自愿标签，与你当前想认识事业型 / 资源型朋友的目标接近"；',
      '6. 涉及线下见面 / 联系方式 / 加好友 / 发消息的建议，必须把 requiresUserConfirmation 设为 true；',
      '7. 资料不足时输出"资料较少，建议先线上了解"。',
      '只输出严格 JSON，字段：publicReason, privateReason, sharedPoints, complementaryPoints, riskWarnings, suggestedOpener, nextAction, requiresUserConfirmation, confidence。',
    ].join('\n');

    const user = JSON.stringify({
      hint_from_fallback: fallback,
      owner: this.shapeForPrompt(input.ownerProfile),
      candidate: this.shapeForPrompt(input.candidateProfile),
      publicTags: input.publicTags,
      privatePreferenceSignals: input.privatePreferenceSignals,
      confirmedSensitiveTags: input.confirmedSensitiveTags,
      avoidSignals: input.avoidSignals,
      safetySignals: input.safetySignals,
      scoreBreakdown: input.scoreBreakdown,
    });

    const res = await fetch(
      `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
    );
    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const out: MatchReasonerOutput = {
      publicReason: this.asString(parsed.publicReason, fallback.publicReason),
      privateReason: this.asString(
        parsed.privateReason,
        fallback.privateReason,
      ),
      sharedPoints: this.asList(parsed.sharedPoints, fallback.sharedPoints),
      complementaryPoints: this.asList(
        parsed.complementaryPoints,
        fallback.complementaryPoints,
      ),
      riskWarnings: this.asList(parsed.riskWarnings, fallback.riskWarnings),
      suggestedOpener: this.asString(
        parsed.suggestedOpener,
        fallback.suggestedOpener,
      ),
      nextAction: this.asString(parsed.nextAction, fallback.nextAction),
      requiresUserConfirmation:
        typeof parsed.requiresUserConfirmation === 'boolean'
          ? parsed.requiresUserConfirmation
          : true,
      confidence:
        typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : fallback.confidence,
      source: 'deepseek',
    };
    // Hard-rule: any contact / offline / friend-add intent forces confirmation.
    if (
      /联系方式|加好友|加微信|加 wechat|线下|见面|约会|交换号码|交换联系方式/i.test(
        `${out.publicReason} ${out.privateReason} ${out.suggestedOpener} ${out.nextAction}`,
      )
    ) {
      out.requiresUserConfirmation = true;
    }
    return out;
  }

  private async tryDeepseekScore(
    input: MatchReasonerInput,
    baseScore: number,
    fallback: MatchScoreSecondPass,
  ): Promise<MatchScoreSecondPass | null> {
    const apiKey = this.config?.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) return null;
    const baseUrl =
      this.config?.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const model =
      this.config?.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    const system = [
      '你是 FitMeet 的画像匹配二次评分器。',
      '确定性 CompatibilityScorerService 已经完成硬过滤、隐私过滤和基础评分。',
      '你只能根据安全画像摘要对 baseScore 小幅修正，不能泄漏敏感画像。',
      '规则：score 为 0-100 整数，且相对 baseScore 调整不超过 12 分；资料不足时降低 confidence；任何加好友、私信、线下见面都必须双方确认。',
      '只输出 JSON：{"score":number,"confidence":number,"publicReason":string,"privateReason":string,"riskWarnings":string[]}',
    ].join('\n');
    const user = JSON.stringify({
      baseScore,
      owner: this.shapeForPrompt(input.ownerProfile),
      candidate: this.shapeForPrompt(input.candidateProfile),
      publicTags: input.publicTags,
      privatePreferenceSignals: input.privatePreferenceSignals,
      confirmedSensitiveTags: input.confirmedSensitiveTags,
      avoidSignals: input.avoidSignals,
      safetySignals: input.safetySignals,
      scoreBreakdown: input.scoreBreakdown,
    });
    const res = await fetch(
      `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.25,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
    );
    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return {
      score: this.boundedScore(
        typeof parsed.score === 'number' ? parsed.score : baseScore,
        baseScore,
      ),
      confidence:
        typeof parsed.confidence === 'number'
          ? Number(Math.max(0, Math.min(1, parsed.confidence)).toFixed(2))
          : fallback.confidence,
      source: 'deepseek',
      publicReason: this.clipReason(
        this.sanitizeText(
          this.asString(parsed.publicReason, fallback.publicReason),
        ),
      ),
      privateReason: this.clipReason(
        this.sanitizeText(
          this.asString(parsed.privateReason, fallback.privateReason),
        ),
      ),
      riskWarnings: this.sanitizeList(
        this.asList(parsed.riskWarnings, fallback.riskWarnings),
      ),
    };
  }

  // ---- sanitization & shaping --------------------------------------------

  /** Final guard applied to every output (both fallback and LLM). */
  private sanitizeOutput(out: MatchReasonerOutput): MatchReasonerOutput {
    return {
      ...out,
      publicReason: this.clipReason(this.sanitizeText(out.publicReason)),
      privateReason: this.clipReason(this.sanitizeText(out.privateReason)),
      sharedPoints: this.sanitizeList(out.sharedPoints),
      complementaryPoints: this.sanitizeList(out.complementaryPoints),
      riskWarnings: this.sanitizeList(out.riskWarnings),
      suggestedOpener: this.clip(
        this.sanitizeText(out.suggestedOpener),
        MAX_OPENER_LEN,
      ),
      nextAction: this.clipReason(this.sanitizeText(out.nextAction)),
      requiresUserConfirmation: out.requiresUserConfirmation !== false,
      confidence: Number(
        Math.max(0, Math.min(1, out.confidence ?? 0.5)).toFixed(2),
      ),
    };
  }

  sanitizeText(input: string): string {
    let text = (input ?? '').toString();
    text = text.replace(
      /\s+(邮箱|邮件|单位|公司|学校|住址|地址|月薪|年薪|收入|email|company|school|address|salary)/gi,
      '；$1',
    );
    for (const [pattern, replacement] of REDACTION_RULES) {
      text = text.replace(pattern, replacement);
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  private sanitizeList(list: string[]): string[] {
    return this.uniq(
      (list ?? [])
        .map((item) => this.clip(this.sanitizeText(item), MAX_LIST_ITEM))
        .filter((item) => item.length > 0),
    ).slice(0, 5);
  }

  private clipReason(text: string): string {
    return this.clip(text, MAX_REASON_LEN);
  }

  private clip(text: string, max: number): string {
    if (!text) return '';
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  private uniq(arr: string[]): string[] {
    return Array.from(
      new Set((arr ?? []).map((s) => (s ?? '').trim()).filter(Boolean)),
    );
  }

  private takeList(arr: string[], n: number): string[] {
    return this.uniq(arr).slice(0, n);
  }

  private clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private boundedScore(value: number, baseScore: number): number {
    const base = this.clampScore(baseScore);
    const next = this.clampScore(value);
    return Math.max(base - 12, Math.min(base + 12, next));
  }

  private asString(value: unknown, def: string): string {
    return typeof value === 'string' && value.trim() ? value : def;
  }

  private asList(value: unknown, def: string[]): string[] {
    if (!Array.isArray(value)) return def;
    const list = value
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean);
    return list.length ? list : def;
  }

  /** Strip out anything that could leak from the raw entity in prompts. */
  private shapeForPrompt(p: UserSocialProfile) {
    return {
      nickname: p.nickname,
      ageRange: p.ageRange,
      city: p.city,
      mbti: p.mbti,
      zodiac: p.zodiac,
      traits: p.traits ?? [],
      interestTags: p.interestTags ?? [],
      lifestyleTags: p.lifestyleTags ?? [],
      socialScenes: p.socialScenes ?? [],
      fitnessGoals: p.fitnessGoals ?? [],
      socialStyle: p.socialStyle,
      communicationStyle: p.communicationStyle,
      privacyBoundary: p.privacyBoundary,
    };
  }
}
