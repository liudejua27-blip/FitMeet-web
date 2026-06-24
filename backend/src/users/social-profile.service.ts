import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AIService,
  AiProfileBuilderCard,
  AiProfileMatchSignals,
} from '../ai/ai.service';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { User } from './user.entity';
import { UserSocialProfile } from './user-social-profile.entity';
import { UpdateSocialProfileDto } from './dto/update-social-profile.dto';

type AiProfileAnswer = {
  key?: string;
  question?: string;
  answer?: string;
  value?: unknown;
};

type SensitiveTagSaveStatus = 'confirmed' | 'rejected' | 'hidden';

type SaveAiDraftInput = {
  profile?: AiProfileBuilderCard;
  enableMatching?: boolean;
  ownerConfirmed?: boolean;
  matchingConsent?: boolean;
  profileVisibilityConsent?: boolean;
  sensitiveTagsConfirmed?: boolean;
  sensitiveTagDecisions?: Record<string, SensitiveTagSaveStatus>;
};

type ProfileReadinessLevel = 'empty' | 'basic' | 'match_ready' | 'agent_ready';

type ProfileCompletionSection = {
  key:
    | 'basic'
    | 'personality'
    | 'fitness'
    | 'preferences'
    | 'availability'
    | 'safety'
    | 'privacy';
  label: string;
  fields: Array<keyof UserSocialProfile>;
  weight: number;
};

type ProfileInterviewQuestion = {
  key: string;
  question: string;
  type?: string;
  domain:
    | 'basic'
    | 'personality'
    | 'location'
    | 'fitness'
    | 'lifestyle'
    | 'intent'
    | 'availability'
    | 'boundary'
    | 'privacy';
  privacyTier: 'public' | 'private_match' | 'sensitive_review';
  matchRole: 'profile_field' | 'match_preference' | 'safety_boundary';
};

export type SensitiveTagTier =
  | 'public'
  | 'private_match'
  | 'sensitive_private'
  | 'unavailable';

/**
 * Sensitive-tag categories. Order matters: first match wins.
 *
 *   wealth         — net worth / asset / wealth class
 *   income         — salary / monthly income / yearly compensation
 *   looks          — face / body shape / attractiveness
 *   status         — celebrity / executive / VIP-style identity
 *   relationship   — marital / dating / partner status
 *   contact        — phone / WeChat / email / IM handles
 *   location       — precise residential or workplace addresses
 *   identity       — school / employer / ID / passport / license info
 */
const SENSITIVE_TAG_CATEGORIES: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'wealth',
    /(rich|wealth|millionaire|net.?worth|asset|wealth_resource|有钱|富|资源|年少多金|高消费|资产|身家|豪)/i,
  ],
  ['income', /(income|salary|annual|monthly.?pay|高薪|收入|年薪|月薪|薪资)/i],
  [
    'looks',
    /(handsome|beautiful|good.?looking|attractive|颜值|帅|美|靓|肌肉)/i,
  ],
  [
    'status',
    /(ceo|founder|executive|elite|vip|celebrity|身份|地位|名流|大佬)/i,
  ],
  [
    'relationship',
    /(married|single|divorced|dating|partnered|girlfriend|boyfriend|已婚|未婚|离异|恋爱|有对象)/i,
  ],
  ['contact', /(phone|wechat|whatsapp|telegram|qq|email|手机|微信|联系方式)/i],
  [
    'location',
    /(home.?address|residence|apartment|公寓|住址|精确位置|家庭住址)/i,
  ],
  [
    'identity',
    /(school|university|employer|工作单位|学校|就读|身份证|护照|证件|车牌|学号|工号)/i,
  ],
];

/**
 * Hard-block patterns: never expose and never use for matching, regardless
 * of owner confirmation. These look like raw identifiers (phone numbers,
 * IDs, street addresses) rather than tag labels.
 */
const HARD_BLOCK_TAG_PATTERNS: ReadonlyArray<RegExp> = [
  /\b1\d{10}\b/, // CN mobile
  /\b\d{15,18}\b/, // CN national ID
  /[A-Z]{2}\d{6,}/, // passport-ish
  /\d{1,4}\s*(号|室|栋|单元|弄|楼)/, // street/apt level location
];

/** Private-but-matchable preference tags (lifestyle/avoid/boundary). */
const PRIVATE_MATCH_TAG_PATTERN =
  /(want.?to.?meet|preferred|avoid|boundary|relationship.?goal|想认识|拒绝|偏好|底线)/i;

const PROFILE_INTERVIEW_BANK: ProfileInterviewQuestion[] = [
  {
    key: 'nickname',
    question: '你希望人物画像里展示什么昵称？',
    type: 'text',
    domain: 'basic',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'city',
    question: '你常驻或优先匹配的城市是哪里？',
    type: 'text',
    domain: 'location',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'nearbyArea',
    question: '你通常在哪个区、商圈或健身房附近活动？可以只写模糊区域。',
    type: 'text',
    domain: 'location',
    privacyTier: 'private_match',
    matchRole: 'match_preference',
  },
  {
    key: 'mbti',
    question: '你的 MBTI 或最接近的性格关键词是什么？不确定可以写“不确定”。',
    type: 'text',
    domain: 'personality',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'zodiac',
    question: '你的星座是什么？不想参与匹配可以跳过。',
    type: 'text',
    domain: 'personality',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'traits',
    question: '你觉得自己最明显的性格标签有哪些？比如慢热、主动、真诚、自律。',
    type: 'text',
    domain: 'personality',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'fitnessGoals',
    question: '你最近的运动或健身目标是什么？',
    type: 'text',
    domain: 'fitness',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'lifestyleTags',
    question:
      '运动之外，你的生活方式或话题偏好是什么？比如创业、旅行、咖啡、高消费生活方式等。',
    type: 'text',
    domain: 'lifestyle',
    privacyTier: 'sensitive_review',
    matchRole: 'match_preference',
  },
  {
    key: 'socialScenes',
    question:
      '你更适合哪些社交场景？比如约练、咖啡、饭局、创业交流、周末活动。',
    type: 'text',
    domain: 'intent',
    privacyTier: 'public',
    matchRole: 'profile_field',
  },
  {
    key: 'wantToMeet',
    question:
      '你想认识什么样的人？可以写性格、城市、事业阶段、资源互补或生活方式偏好。',
    type: 'text',
    domain: 'intent',
    privacyTier: 'private_match',
    matchRole: 'match_preference',
  },
  {
    key: 'preferredTraits',
    question:
      '你更看重对方哪些特质？比如真诚、自律、外向、资源型、创业者、共同兴趣。',
    type: 'text',
    domain: 'intent',
    privacyTier: 'private_match',
    matchRole: 'match_preference',
  },
  {
    key: 'avoidTraits',
    question: '你不接受哪些行为或类型？这些会作为安全边界参与匹配。',
    type: 'text',
    domain: 'boundary',
    privacyTier: 'private_match',
    matchRole: 'safety_boundary',
  },
  {
    key: 'relationshipGoals',
    question: '这次匹配更偏交友、约练、人脉、创业交流还是长期陪伴？',
    type: 'text',
    domain: 'intent',
    privacyTier: 'private_match',
    matchRole: 'match_preference',
  },
  {
    key: 'availableTimes',
    question: '你通常什么时间方便社交或约练？',
    type: 'text',
    domain: 'availability',
    privacyTier: 'private_match',
    matchRole: 'match_preference',
  },
  {
    key: 'socialPreference',
    question: '你喜欢怎样的聊天节奏和相处方式？',
    type: 'text',
    domain: 'personality',
    privacyTier: 'private_match',
    matchRole: 'match_preference',
  },
  {
    key: 'privacyBoundary',
    question:
      '哪些信息永远不能公开或用于匹配？比如手机号、微信、详细住址、单位、收入数字。',
    type: 'text',
    domain: 'privacy',
    privacyTier: 'sensitive_review',
    matchRole: 'safety_boundary',
  },
];

const PROFILE_COMPLETION_SECTIONS: ProfileCompletionSection[] = [
  {
    key: 'basic',
    label: '基础信息',
    fields: ['nickname', 'ageRange', 'city', 'gender'],
    weight: 18,
  },
  {
    key: 'personality',
    label: '社交风格',
    fields: ['mbti', 'traits', 'socialStyle', 'communicationStyle'],
    weight: 16,
  },
  {
    key: 'fitness',
    label: '运动与兴趣',
    fields: ['nearbyArea', 'fitnessGoals', 'interestTags', 'lifestyleTags'],
    weight: 16,
  },
  {
    key: 'preferences',
    label: '想认识谁',
    fields: ['wantToMeet', 'preferredTraits', 'relationshipGoals'],
    weight: 18,
  },
  {
    key: 'availability',
    label: '时间安排',
    fields: ['availableTimes'],
    weight: 10,
  },
  {
    key: 'safety',
    label: '安全边界',
    fields: ['avoidTraits', 'rejectRules', 'privacyBoundary'],
    weight: 16,
  },
  {
    key: 'privacy',
    label: '授权状态',
    fields: ['profileDiscoverable', 'agentCanRecommendMe'],
    weight: 6,
  },
];

/**
 * 读 / upsert 当前登录用户的社交画像。最小可用版本：
 *   - 永远返回一份对象（未保存过则返回带默认空值的占位）
 *   - PUT 只覆盖请求中显式提供的字段
 */
@Injectable()
export class SocialProfileService {
  constructor(
    @InjectRepository(UserSocialProfile)
    private readonly repo: Repository<UserSocialProfile>,
    @InjectRepository(AiDelegateProfile)
    private readonly aiDelegateRepo: Repository<AiDelegateProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly ai: AIService,
  ) {}

  /** 永不抛错；未保存过时返回带默认空值的占位（不入库）。 */
  async get(userId: number): Promise<UserSocialProfile> {
    const found = await this.repo.findOne({ where: { userId } });
    if (found) return found;
    return this.empty(userId);
  }

  async upsert(
    userId: number,
    dto: UpdateSocialProfileDto,
  ): Promise<UserSocialProfile> {
    const existing = await this.repo.findOne({ where: { userId } });
    const merged: UserSocialProfile = {
      ...(existing ?? this.empty(userId)),
      ...this.sanitize(dto),
      userId,
    } as UserSocialProfile;
    const saved = await this.repo.save(merged);
    const reseeded = await this.refreshSensitiveDecisions(saved);
    await this.syncAiDelegateProfile(userId, reseeded);
    return reseeded;
  }

  async generateQuestions(userId: number) {
    const profile = await this.get(userId);
    const missing = PROFILE_INTERVIEW_BANK.filter(
      ({ key }) => !this.hasValue(profile, key as keyof UserSocialProfile),
    );
    const completion = this.getCompletionFromProfile(profile);
    const aiQuestions = await this.ai.generateProfileQuestions({
      missingKeys: missing.map((item) => item.key),
      contextSummary: this.buildInterviewContext(profile),
    });
    const bankByKey = new Map(missing.map((item) => [item.key, item]));
    const selected: ProfileInterviewQuestion[] = aiQuestions.flatMap((item) => {
      const fromBank = bankByKey.get(item.key);
      if (!fromBank) return [];
      return [
        {
          ...fromBank,
          question: item.question || fromBank.question,
          type: item.type || fromBank.type,
        },
      ];
    });
    const seen = new Set(selected.map((item) => item.key));
    const questions = [
      ...selected,
      ...missing.filter((item) => !seen.has(item.key)),
    ].slice(0, 12);
    const privacyBoundary = missing.find(
      (item) => item.key === 'privacyBoundary',
    );
    if (
      privacyBoundary &&
      !questions.some((item) => item.key === 'privacyBoundary')
    ) {
      questions[questions.length >= 12 ? 11 : questions.length] =
        privacyBoundary;
    }
    return {
      role: 'profile_interviewer',
      questions,
      completion,
      guidance: {
        public: 'public fields can be shown on profile cards',
        private_match:
          'private_match fields only affect matching and are not shown to other users',
        sensitive_review:
          'sensitive_review answers require owner confirmation before matching',
      },
    };
    const legacyQuestions = [
      { key: 'nickname', question: '你希望人物画像里展示什么昵称？' },
      { key: 'gender', question: '你希望展示的性别是？' },
      { key: 'ageRange', question: '你希望展示的年龄段是？' },
      { key: 'city', question: '你常驻或希望匹配的城市是哪里？' },
      { key: 'nearbyArea', question: '你通常在哪个区域活动或约见？' },
      { key: 'mbti', question: '你的 MBTI 是什么？不确定可以说“不知道”。' },
      { key: 'zodiac', question: '你的星座是什么？不想展示可以跳过。' },
      { key: 'traits', question: '你觉得自己最明显的性格标签有哪些？' },
      { key: 'fitnessGoals', question: '你最近的健身目标是什么？' },
      { key: 'interestTags', question: '你希望 AI 代表你展示哪些兴趣标签？' },
      {
        key: 'lifestyleTags',
        question: '运动之外，你还喜欢哪些生活方式或话题？',
      },
      { key: 'socialScenes', question: '你更适合哪些社交场景？' },
      { key: 'wantToMeet', question: '你想认识什么样的人？' },
      { key: 'preferredTraits', question: '你更看重对方哪些特质？' },
      { key: 'avoidTraits', question: '你不接受哪些行为或类型？' },
      {
        key: 'relationshipGoals',
        question: '你这次社交更偏向交友、找搭子、人脉还是长期陪伴？',
      },
      { key: 'availableTimes', question: '你通常什么时间方便社交或约练？' },
      { key: 'weekdayAvailability', question: '工作日通常什么时候方便？' },
      { key: 'weekendAvailability', question: '周末通常什么时候方便？' },
      { key: 'socialPreference', question: '你喜欢怎样的社交节奏和聊天风格？' },
      { key: 'rejectRules', question: '有哪些情况 AI 必须替你拒绝？' },
      { key: 'privacyBoundary', question: '哪些隐私信息绝对不能自动透露？' },
    ].filter(
      ({ key }) => !this.hasValue(profile, key as keyof UserSocialProfile),
    );
    return {
      questions: legacyQuestions.slice(0, 12),
      completion: this.getCompletionFromProfile(profile),
    };
  }

  async saveAnswer(userId: number, key: string, answer: string) {
    const normalizedKey = this.normalizeAnswerKey(key);
    const listFields = new Set([
      'fitnessGoals',
      'interestTags',
      'traits',
      'lifestyleTags',
      'socialScenes',
      'wantToMeet',
      'preferredTraits',
      'avoidTraits',
      'relationshipGoals',
      'availableTimes',
    ]);
    const booleanFields = new Set([
      'profileDiscoverable',
      'agentCanRecommendMe',
      'agentCanStartChatAfterApproval',
      'hideSensitiveTags',
    ]);
    if (!this.isEditableKey(normalizedKey)) return this.get(userId);
    const value = listFields.has(normalizedKey)
      ? this.cleanArr(this.splitAnswer(answer))
      : booleanFields.has(normalizedKey)
        ? this.toBool(answer)
        : answer;
    return this.upsert(userId, {
      [normalizedKey]: value,
    } as UpdateSocialProfileDto);
  }

  async getCompletion(userId: number) {
    return this.getCompletionFromProfile(await this.get(userId));
  }

  async generateAiDraft(
    userId: number,
    input: { answers?: AiProfileAnswer[]; rawText?: string; source?: string },
  ) {
    const [profile, user] = await Promise.all([
      this.get(userId),
      this.userRepo.findOne({ where: { id: userId } }),
    ]);
    const answers = this.normalizeAiAnswers(input);
    const draft = await this.ai.generateProfileBuilderCard({
      answers,
      existingProfile: profile as unknown as Record<string, unknown>,
      user: {
        nickname: user?.name ?? profile.nickname,
        city: user?.city ?? profile.city,
      },
      source: input.source ?? 'fitmeet_ai_profile_builder',
    });
    return {
      mode: this.ai.isLlmEnabled() ? 'ai' : 'fallback',
      draft,
      profileUsed: profile,
      completion: this.getCompletionFromProfile(profile),
    };
  }

  async saveAiDraft(userId: number, input: SaveAiDraftInput) {
    const card = input.profile;
    const dto = this.profileCardToDto(card);
    const wantsMatching = input.enableMatching !== false;
    if (wantsMatching) {
      this.assertOwnerAuthorizedProfileVisibility(input);
      dto.agentCanRecommendMe = true;
    }
    if (input.enableMatching === false) {
      dto.profileDiscoverable = false;
      dto.agentCanRecommendMe = false;
      dto.agentCanStartChatAfterApproval = false;
    }
    const saved = await this.upsert(userId, dto);
    const decided = await this.applySensitiveTagSaveDecisions(saved, {
      confirmAll: input.sensitiveTagsConfirmed === true,
      decisions: input.sensitiveTagDecisions,
    });
    const delegateProfile = await this.syncAiDelegateProfile(userId, decided);
    return {
      profile: decided,
      aiDelegateProfile: delegateProfile,
      matchingEnabled: Boolean(delegateProfile?.enabled),
      sensitiveTagSummary: this.summarizeDecisions(
        decided.sensitiveTagDecisions ?? {},
      ),
      completion: this.getCompletionFromProfile(decided),
    };
  }

  private empty(userId: number): UserSocialProfile {
    return {
      userId,
      gender: '',
      ageRange: '',
      city: '',
      nickname: '',
      nearbyArea: '',
      fitnessGoals: [],
      zodiac: '',
      mbti: '',
      traits: [],
      socialStyle: '',
      communicationStyle: '',
      interestTags: [],
      availableTimes: [],
      socialPreference: '',
      lifestyleTags: [],
      socialScenes: [],
      wantToMeet: [],
      preferredTraits: [],
      avoidTraits: [],
      relationshipGoals: [],
      openness: '',
      rejectRules: '',
      weekdayAvailability: '',
      weekendAvailability: '',
      privacyBoundary: '',
      createdAt: new Date(0),
      updatedAt: new Date(0),
      profileDiscoverable: false,
      agentCanRecommendMe: false,
      agentCanStartChatAfterApproval: false,
      hideSensitiveTags: true,
      aiSummary: '',
      aiProfileCard: {},
      matchSignals: {},
      sensitiveTagDecisions: {},
    } as UserSocialProfile;
  }

  private sanitize(dto: UpdateSocialProfileDto): Partial<UserSocialProfile> {
    const out: Partial<UserSocialProfile> = {};
    if (dto.gender !== undefined) out.gender = dto.gender.trim();
    if (dto.ageRange !== undefined) out.ageRange = dto.ageRange.trim();
    if (dto.city !== undefined) out.city = dto.city.trim();
    if (dto.nickname !== undefined) out.nickname = dto.nickname.trim();
    if (dto.nearbyArea !== undefined) out.nearbyArea = dto.nearbyArea.trim();
    if (dto.fitnessGoals !== undefined)
      out.fitnessGoals = this.cleanArr(dto.fitnessGoals);
    if (dto.zodiac !== undefined) out.zodiac = dto.zodiac.trim();
    if (dto.mbti !== undefined) out.mbti = dto.mbti.trim().toUpperCase();
    if (dto.traits !== undefined) out.traits = this.cleanArr(dto.traits);
    if (dto.socialStyle !== undefined) out.socialStyle = dto.socialStyle.trim();
    if (dto.communicationStyle !== undefined)
      out.communicationStyle = dto.communicationStyle.trim();
    if (dto.interestTags !== undefined)
      out.interestTags = this.cleanArr(dto.interestTags);
    if (dto.availableTimes !== undefined)
      out.availableTimes = this.cleanArr(dto.availableTimes);
    if (dto.lifestyleTags !== undefined)
      out.lifestyleTags = this.cleanArr(dto.lifestyleTags);
    if (dto.socialScenes !== undefined)
      out.socialScenes = this.cleanArr(dto.socialScenes);
    if (dto.wantToMeet !== undefined)
      out.wantToMeet = this.cleanArr(dto.wantToMeet);
    if (dto.preferredTraits !== undefined)
      out.preferredTraits = this.cleanArr(dto.preferredTraits);
    if (dto.avoidTraits !== undefined)
      out.avoidTraits = this.cleanArr(dto.avoidTraits);
    if (dto.relationshipGoals !== undefined)
      out.relationshipGoals = this.cleanArr(dto.relationshipGoals);
    if (dto.openness !== undefined) out.openness = dto.openness.trim();
    if (dto.socialPreference !== undefined)
      out.socialPreference = dto.socialPreference.trim();
    if (dto.weekdayAvailability !== undefined)
      out.weekdayAvailability = dto.weekdayAvailability.trim();
    if (dto.weekendAvailability !== undefined)
      out.weekendAvailability = dto.weekendAvailability.trim();
    if (dto.rejectRules !== undefined) out.rejectRules = dto.rejectRules.trim();
    if (dto.privacyBoundary !== undefined)
      out.privacyBoundary = dto.privacyBoundary.trim();
    if (dto.profileDiscoverable !== undefined)
      out.profileDiscoverable = Boolean(dto.profileDiscoverable);
    if (dto.agentCanRecommendMe !== undefined)
      out.agentCanRecommendMe = Boolean(dto.agentCanRecommendMe);
    if (dto.agentCanStartChatAfterApproval !== undefined)
      out.agentCanStartChatAfterApproval = Boolean(
        dto.agentCanStartChatAfterApproval,
      );
    if (dto.hideSensitiveTags !== undefined)
      out.hideSensitiveTags = Boolean(dto.hideSensitiveTags);
    if (dto.aiSummary !== undefined) out.aiSummary = dto.aiSummary.trim();
    if (dto.aiProfileCard !== undefined) out.aiProfileCard = dto.aiProfileCard;
    if (dto.matchSignals !== undefined) out.matchSignals = dto.matchSignals;
    return out;
  }

  private cleanArr(arr: string[]): string[] {
    return Array.from(
      new Set(arr.map((s) => (s ?? '').trim()).filter(Boolean)),
    ).slice(0, 30);
  }

  private splitAnswer(answer: string): string[] {
    return answer.split(/[,，、\s]+/).filter(Boolean);
  }

  private toBool(answer: string): boolean {
    return ['true', '1', 'yes', 'y', '是', '允许', '可以', '开启'].includes(
      (answer || '').trim().toLowerCase(),
    );
  }

  private normalizeAnswerKey(key: string): string {
    const aliases: Record<string, string> = {
      sports: 'fitnessGoals',
      sport: 'fitnessGoals',
      avoid: 'avoidTraits',
      goals: 'relationshipGoals',
      availability: 'availableTimes',
      lifestyle: 'lifestyleTags',
      interests: 'interestTags',
    };
    const normalized = (key ?? '').trim();
    return aliases[normalized] ?? normalized;
  }

  private buildInterviewContext(profile: UserSocialProfile): string {
    return JSON.stringify({
      city: profile.city,
      nearbyArea: profile.nearbyArea,
      mbti: profile.mbti,
      zodiac: profile.zodiac,
      traits: profile.traits ?? [],
      fitnessGoals: profile.fitnessGoals ?? [],
      lifestyleTags: profile.lifestyleTags ?? [],
      wantToMeet: profile.wantToMeet ?? [],
      preferredTraits: profile.preferredTraits ?? [],
      relationshipGoals: profile.relationshipGoals ?? [],
      privacyBoundary: profile.privacyBoundary,
      profileDiscoverable: profile.profileDiscoverable,
      agentCanRecommendMe: profile.agentCanRecommendMe,
      hideSensitiveTags: profile.hideSensitiveTags,
    });
  }

  private isEditableKey(key: string): key is keyof UpdateSocialProfileDto {
    return [
      'gender',
      'nickname',
      'ageRange',
      'city',
      'zodiac',
      'mbti',
      'traits',
      'socialStyle',
      'communicationStyle',
      'nearbyArea',
      'fitnessGoals',
      'interestTags',
      'lifestyleTags',
      'socialScenes',
      'wantToMeet',
      'preferredTraits',
      'avoidTraits',
      'relationshipGoals',
      'openness',
      'availableTimes',
      'weekdayAvailability',
      'weekendAvailability',
      'socialPreference',
      'rejectRules',
      'privacyBoundary',
      'profileDiscoverable',
      'agentCanRecommendMe',
      'agentCanStartChatAfterApproval',
      'hideSensitiveTags',
      'aiSummary',
      'aiProfileCard',
      'matchSignals',
    ].includes(key);
  }

  private hasValue(profile: UserSocialProfile, key: keyof UserSocialProfile) {
    const value = profile[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }

  private getCompletionFromProfile(profile: UserSocialProfile) {
    const keys = PROFILE_COMPLETION_SECTIONS.flatMap(
      (section) => section.fields,
    );
    const filled = keys.filter((key) => this.hasValue(profile, key));
    const sections = PROFILE_COMPLETION_SECTIONS.map((section) => {
      const completedFields = section.fields.filter((key) =>
        this.hasValue(profile, key),
      );
      const missingFields = section.fields.filter(
        (key) => !completedFields.includes(key),
      );
      return {
        key: section.key,
        label: section.label,
        completedFields,
        missingFields,
        percent: Math.round(
          (completedFields.length / section.fields.length) * 100,
        ),
        weight: section.weight,
      };
    });
    const weightedPercent = Math.round(
      sections.reduce(
        (sum, section) => sum + (section.percent * section.weight) / 100,
        0,
      ),
    );
    const hasMatchBasics =
      this.hasValue(profile, 'city') &&
      (this.hasValue(profile, 'fitnessGoals') ||
        this.hasValue(profile, 'interestTags')) &&
      this.hasValue(profile, 'wantToMeet') &&
      (this.hasValue(profile, 'avoidTraits') ||
        this.hasValue(profile, 'rejectRules')) &&
      this.hasValue(profile, 'privacyBoundary');
    const authorization = this.profileAuthorizationState(profile);
    const readinessLevel: ProfileReadinessLevel =
      weightedPercent >= 80 && authorization.matchPoolEnabled
        ? 'agent_ready'
        : weightedPercent >= 65 && hasMatchBasics
          ? 'match_ready'
          : weightedPercent >= 30
            ? 'basic'
            : 'empty';
    const nextActions = this.profileNextActions(
      sections,
      authorization,
      hasMatchBasics,
    );
    return {
      completedFields: filled,
      missingFields: keys.filter((key) => !filled.includes(key)),
      percent: weightedPercent,
      readinessLevel,
      canEnterMatchPool: hasMatchBasics && weightedPercent >= 65,
      authorizationRequired: !authorization.matchPoolEnabled,
      authorization,
      sections,
      nextActions,
    };
  }

  private profileAuthorizationState(profile: UserSocialProfile) {
    const matchPoolEnabled =
      profile.profileDiscoverable || profile.agentCanRecommendMe;
    return {
      matchPoolEnabled,
      profileDiscoverable: profile.profileDiscoverable,
      agentCanRecommendMe: profile.agentCanRecommendMe,
      agentCanStartChatAfterApproval: profile.agentCanStartChatAfterApproval,
      hideSensitiveTags: profile.hideSensitiveTags,
      requiresOwnerConfirmationToEnable:
        !profile.profileDiscoverable && !profile.agentCanRecommendMe,
      consentSource: matchPoolEnabled
        ? 'owner_confirmed_profile_switch'
        : 'not_enabled',
    };
  }

  private profileNextActions(
    sections: Array<{
      key: string;
      label: string;
      missingFields: Array<keyof UserSocialProfile>;
      percent: number;
    }>,
    authorization: ReturnType<
      SocialProfileService['profileAuthorizationState']
    >,
    hasMatchBasics: boolean,
  ): string[] {
    const actions: string[] = [];
    const weakest = sections
      .filter((section) => section.percent < 100)
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 2);
    for (const section of weakest) {
      actions.push(`补全${section.label}`);
    }
    if (!hasMatchBasics) {
      actions.push('补充城市、运动兴趣、想认识的人和安全边界');
    }
    if (!authorization.matchPoolEnabled) {
      actions.push('本人确认后开启匹配池授权');
    }
    return Array.from(new Set(actions)).slice(0, 4);
  }

  private assertOwnerAuthorizedProfileVisibility(input: SaveAiDraftInput) {
    if (
      input.ownerConfirmed === true &&
      input.matchingConsent === true &&
      input.profileVisibilityConsent === true
    ) {
      return;
    }
    throw new BadRequestException({
      code: 'profile_visibility_owner_confirmation_required',
      message:
        'Enabling AI profile matching requires explicit owner confirmation.',
      required: [
        'ownerConfirmed',
        'matchingConsent',
        'profileVisibilityConsent',
      ],
    });
  }

  private normalizeAiAnswers(input: {
    answers?: AiProfileAnswer[];
    rawText?: string;
  }): Array<{ question: string; answer: string }> {
    const answers = Array.isArray(input.answers) ? input.answers : [];
    const normalized = answers
      .map((item) => {
        const answer =
          typeof item.answer === 'string'
            ? item.answer
            : typeof item.value === 'string'
              ? item.value
              : Array.isArray(item.value)
                ? item.value.join('、')
                : '';
        return {
          question: item.question || item.key || '补充信息',
          answer: answer.trim(),
        };
      })
      .filter((item) => item.answer);
    if (input.rawText?.trim()) {
      normalized.push({
        question: '用户自由描述',
        answer: input.rawText.trim(),
      });
    }
    return normalized.slice(0, 20);
  }

  private profileCardToDto(
    card: AiProfileBuilderCard | undefined,
  ): UpdateSocialProfileDto {
    if (!card) return {};
    return {
      nickname: card.basic?.nickname ?? '',
      gender: card.basic?.gender ?? '',
      ageRange: card.basic?.ageRange ?? '',
      city: card.basic?.city ?? '',
      zodiac: card.basic?.zodiac ?? '',
      mbti: card.personality?.mbti ?? '',
      traits: card.personality?.traits ?? [],
      socialStyle: card.personality?.socialStyle ?? '',
      communicationStyle: card.personality?.communicationStyle ?? '',
      fitnessGoals: card.interests?.sports ?? [],
      interestTags: [
        ...(card.interests?.sports ?? []),
        ...(card.interests?.lifestyle ?? []),
      ],
      lifestyleTags: card.interests?.lifestyle ?? [],
      socialScenes: card.interests?.socialScenes ?? [],
      wantToMeet: card.preferences?.wantToMeet ?? [],
      preferredTraits: card.preferences?.preferredTraits ?? [],
      avoidTraits: card.preferences?.avoid ?? [],
      relationshipGoals: card.relationshipIntent?.goals ?? [],
      openness: card.relationshipIntent?.openness ?? '',
      availableTimes: this.cleanArr([
        card.availability?.weekdays ?? '',
        card.availability?.weekends ?? '',
      ]),
      weekdayAvailability: card.availability?.weekdays ?? '',
      weekendAvailability: card.availability?.weekends ?? '',
      socialPreference: [
        card.personality?.socialStyle,
        card.personality?.communicationStyle,
      ]
        .filter(Boolean)
        .join('；'),
      rejectRules: (card.preferences?.avoid ?? []).join('；'),
      privacyBoundary: '不公开手机号、微信号、精确住址、工作单位等敏感信息。',
      profileDiscoverable: Boolean(card.visibility?.profileDiscoverable),
      agentCanRecommendMe: Boolean(card.visibility?.agentCanRecommendMe),
      agentCanStartChatAfterApproval: Boolean(
        card.visibility?.agentCanStartChatAfterApproval,
      ),
      hideSensitiveTags: true,
      aiSummary: card.summary ?? '',
      aiProfileCard: card as unknown as Record<string, unknown>,
      matchSignals: this.normalizeMatchSignals(card.matchSignals),
    };
  }

  private async syncAiDelegateProfile(
    userId: number,
    profile: UserSocialProfile,
  ) {
    const existing = await this.aiDelegateRepo.findOne({ where: { userId } });
    const enabled = profile.profileDiscoverable || profile.agentCanRecommendMe;
    const publicSignals = this.publicSignalTags(profile);
    const privateSignals = this.privateSignalTags(profile);
    const delegate = this.aiDelegateRepo.create({
      ...existing,
      userId,
      enabled,
      privacyConsent: enabled,
      autoChatEnabled: enabled ? (existing?.autoChatEnabled ?? false) : false,
      dailyAutoChatLimit: existing?.dailyAutoChatLimit ?? 3,
      preferredName: profile.nickname || existing?.preferredName || '',
      city: profile.city || existing?.city || '',
      favoriteSports: this.cleanArr(profile.fitnessGoals ?? []),
      interests: this.joinText([
        profile.aiSummary,
        publicSignals.join(' '),
        profile.traits?.join('、'),
        profile.lifestyleTags?.join('、'),
        profile.socialScenes?.join('、'),
      ]),
      workExperience: existing?.workExperience ?? '',
      idealPartner: this.joinText([
        privateSignals.join(' '),
        profile.wantToMeet?.join('、'),
        profile.preferredTraits?.join('、'),
      ]),
      trainingGoals: this.joinText([
        profile.relationshipGoals?.join('、'),
        profile.fitnessGoals?.join('、'),
      ]),
      boundaries: this.joinText([
        profile.avoidTraits?.join('、'),
        profile.rejectRules,
        profile.privacyBoundary,
      ]),
      availability: this.joinText([
        profile.weekdayAvailability
          ? `工作日：${profile.weekdayAvailability}`
          : '',
        profile.weekendAvailability
          ? `周末：${profile.weekendAvailability}`
          : '',
        profile.availableTimes?.join('、'),
      ]),
    });
    return this.aiDelegateRepo.save(delegate);
  }

  private normalizeMatchSignals(
    signals: AiProfileMatchSignals | undefined,
  ): Record<string, unknown> {
    if (!signals) {
      return {
        publicTags: [],
        privatePreferenceTags: [],
        sensitivePrivateTags: [],
        matchKeywords: [],
        confidence: 0.5,
        source: 'fallback',
      };
    }
    return {
      publicTags: this.cleanArr(signals.publicTags ?? []),
      privatePreferenceTags: this.cleanArr(signals.privatePreferenceTags ?? []),
      sensitivePrivateTags: this.cleanArr(signals.sensitivePrivateTags ?? []),
      matchKeywords: this.cleanArr(signals.matchKeywords ?? []),
      confidence:
        typeof signals.confidence === 'number'
          ? Math.max(0, Math.min(1, signals.confidence))
          : 0.5,
      source: (signals.source ?? 'fallback').trim() || 'fallback',
    };
  }

  private publicSignalTags(profile: UserSocialProfile): string[] {
    const signals =
      profile.matchSignals as Partial<AiProfileMatchSignals> | null;
    return this.cleanArr([
      ...(signals?.publicTags ?? []),
      ...(signals?.matchKeywords ?? []),
    ]).filter((tag) => !this.isSensitiveTag(tag));
  }

  private privateSignalTags(profile: UserSocialProfile): string[] {
    const signals =
      profile.matchSignals as Partial<AiProfileMatchSignals> | null;
    const decisions = profile.sensitiveTagDecisions ?? {};
    const confirmedSensitive = (signals?.sensitivePrivateTags ?? []).filter(
      (tag) => decisions[tag]?.status === 'confirmed',
    );
    return this.cleanArr([
      ...(signals?.privatePreferenceTags ?? []),
      ...confirmedSensitive,
    ]);
  }

  private isSensitiveTag(tag: string): boolean {
    return this.classifyTag(tag) === 'sensitive_private';
  }

  /**
   * Tag tiering for FitMeet AI profile privacy.
   *
   * - 'sensitive_private': wealth/income/looks/identity/contact/precise
   *   location/identity-bearing info — only used after explicit owner
   *   confirmation; never returned to public or to non-owner agent reads.
   * - 'unavailable': hard-blocked patterns (phone numbers, IDs, exact
   *   street addresses) — never exposed and never used for matching.
   * - 'private_match': preference signals retained for matching but not
   *   shown publicly.
   * - 'public': everything else (interests, MBTI, traits, scenes...).
   */
  classifyTag(tag: string): SensitiveTagTier {
    const value = (tag ?? '').trim();
    if (!value) return 'unavailable';
    if (HARD_BLOCK_TAG_PATTERNS.some((re) => re.test(value))) {
      return 'unavailable';
    }
    for (const [, pattern] of SENSITIVE_TAG_CATEGORIES) {
      if (pattern.test(value)) return 'sensitive_private';
    }
    if (PRIVATE_MATCH_TAG_PATTERN.test(value)) return 'private_match';
    return 'public';
  }

  /** Returns the high-level category for a sensitive tag, or 'other'. */
  classifySensitiveCategory(tag: string): string {
    for (const [category, pattern] of SENSITIVE_TAG_CATEGORIES) {
      if (pattern.test(tag)) return category;
    }
    return 'other';
  }

  /**
   * Public view: anything safe to render to other users or unauthenticated
   * Agent reads. Strips sensitive_private and unavailable tags, removes the
   * `matchSignals.sensitivePrivateTags` field entirely, and zeroes-out
   * free-text fields that often carry identity (privacyBoundary kept).
   */
  getPublicView(profile: UserSocialProfile): Record<string, unknown> {
    const signals = (profile.matchSignals ??
      {}) as Partial<AiProfileMatchSignals> & Record<string, unknown>;
    const view: Record<string, unknown> = {
      userId: profile.userId,
      nickname: profile.nickname,
      gender: profile.gender,
      ageRange: profile.ageRange,
      city: profile.city,
      nearbyArea: profile.nearbyArea,
      mbti: profile.mbti,
      zodiac: profile.zodiac,
      traits: this.filterPublic(profile.traits ?? []),
      interestTags: this.filterPublic(profile.interestTags ?? []),
      lifestyleTags: this.filterPublic(profile.lifestyleTags ?? []),
      socialScenes: this.filterPublic(profile.socialScenes ?? []),
      fitnessGoals: this.filterPublic(profile.fitnessGoals ?? []),
      socialStyle: profile.socialStyle,
      communicationStyle: profile.communicationStyle,
      aiSummary: profile.aiSummary,
      profileDiscoverable: profile.profileDiscoverable,
      matchSignals: {
        publicTags: this.filterPublic(signals.publicTags ?? []),
        matchKeywords: this.filterPublic(signals.matchKeywords ?? []),
        confidence:
          typeof signals.confidence === 'number' ? signals.confidence : 0.5,
        source: signals.source ?? 'fallback',
      },
    };
    return view;
  }

  /**
   * Agent public read: what an Agent Token holder may see about *another*
   * user. Mirrors getPublicView but is deliberately a separate entry point
   * so callers don't accidentally hand off the raw entity.
   */
  getAgentPublicView(profile: UserSocialProfile): Record<string, unknown> {
    return this.getPublicView(profile);
  }

  /**
   * Match view: tags actually fed into scoring. Sensitive tags are kept
   * ONLY when the owner has confirmed them via the privacy console.
   * 'unavailable' tags are always dropped.
   */
  getMatchView(profile: UserSocialProfile): {
    publicTags: string[];
    privateMatchTags: string[];
    confirmedSensitiveTags: string[];
  } {
    const signals = (profile.matchSignals ??
      {}) as Partial<AiProfileMatchSignals>;
    const decisions = profile.sensitiveTagDecisions ?? {};
    const sourceSensitive = this.cleanArr(signals.sensitivePrivateTags ?? []);
    const confirmedSensitive = sourceSensitive.filter(
      (tag) => decisions[tag]?.status === 'confirmed',
    );
    return {
      publicTags: this.filterPublic([
        ...(signals.publicTags ?? []),
        ...(signals.matchKeywords ?? []),
        ...(profile.interestTags ?? []),
        ...(profile.lifestyleTags ?? []),
        ...(profile.socialScenes ?? []),
        ...(profile.traits ?? []),
      ]),
      privateMatchTags: this.cleanArr([
        ...(signals.privatePreferenceTags ?? []),
        ...(profile.wantToMeet ?? []),
        ...(profile.preferredTraits ?? []),
        ...(profile.relationshipGoals ?? []),
      ]).filter((tag) => this.classifyTag(tag) !== 'unavailable'),
      confirmedSensitiveTags: confirmedSensitive,
    };
  }

  /** Filter helper: keep only tags whose tier is 'public'. */
  private filterPublic(arr: string[]): string[] {
    return this.cleanArr(arr).filter(
      (tag) => this.classifyTag(tag) === 'public',
    );
  }

  /**
   * After persisting matchSignals.sensitivePrivateTags, walk the new list
   * and seed a 'pending' decision for any tag the owner has not yet
   * decided on. Existing confirmed/rejected/hidden decisions are kept.
   */
  private async refreshSensitiveDecisions(
    profile: UserSocialProfile,
  ): Promise<UserSocialProfile> {
    const signals = (profile.matchSignals ??
      {}) as Partial<AiProfileMatchSignals>;
    const tags = this.cleanArr(signals.sensitivePrivateTags ?? []);
    const decisions = { ...(profile.sensitiveTagDecisions ?? {}) };
    let mutated = false;
    for (const tag of tags) {
      if (this.classifyTag(tag) === 'unavailable') continue;
      if (!decisions[tag]) {
        decisions[tag] = {
          status: 'pending',
          category: this.classifySensitiveCategory(tag),
        };
        mutated = true;
      }
    }
    if (!mutated) return profile;
    profile.sensitiveTagDecisions = decisions;
    return this.repo.save(profile);
  }

  /** GET /api/users/me/social-profile/privacy payload. */
  async getPrivacy(userId: number) {
    const profile = await this.get(userId);
    const completion = this.getCompletionFromProfile(profile);
    return {
      profileDiscoverable: profile.profileDiscoverable,
      agentCanRecommendMe: profile.agentCanRecommendMe,
      allowAgentRecommend: profile.agentCanRecommendMe,
      agentCanStartChatAfterApproval: profile.agentCanStartChatAfterApproval,
      hideSensitiveTags: profile.hideSensitiveTags,
      matchPoolEnabled:
        profile.profileDiscoverable || profile.agentCanRecommendMe,
      completion,
      authorization: completion.authorization,
      sensitiveTagSummary: this.summarizeDecisions(
        profile.sensitiveTagDecisions ?? {},
      ),
    };
  }

  /** PATCH /api/users/me/social-profile/privacy — only privacy switches, never tags. */
  async updatePrivacy(
    userId: number,
    body: {
      profileDiscoverable?: boolean;
      agentCanRecommendMe?: boolean;
      allowAgentRecommend?: boolean;
      agentCanStartChatAfterApproval?: boolean;
      hideSensitiveTags?: boolean;
      ownerConfirmed?: boolean;
      matchingConsent?: boolean;
      profileVisibilityConsent?: boolean;
    },
  ) {
    const dto: UpdateSocialProfileDto = {};
    if (body.profileDiscoverable !== undefined)
      dto.profileDiscoverable = Boolean(body.profileDiscoverable);
    const agentCanRecommendMe =
      body.agentCanRecommendMe ?? body.allowAgentRecommend;
    if (agentCanRecommendMe !== undefined)
      dto.agentCanRecommendMe = Boolean(agentCanRecommendMe);
    if (body.agentCanStartChatAfterApproval !== undefined)
      dto.agentCanStartChatAfterApproval = Boolean(
        body.agentCanStartChatAfterApproval,
      );
    if (body.hideSensitiveTags !== undefined)
      dto.hideSensitiveTags = Boolean(body.hideSensitiveTags);
    if (this.enablesProfileVisibility(dto)) {
      this.assertOwnerAuthorizedProfileVisibility(body);
    }
    await this.upsert(userId, dto);
    return this.getPrivacy(userId);
  }

  private enablesProfileVisibility(dto: UpdateSocialProfileDto): boolean {
    return (
      dto.profileDiscoverable === true ||
      dto.agentCanRecommendMe === true ||
      dto.agentCanStartChatAfterApproval === true
    );
  }

  /** GET /api/users/me/social-profile/sensitive-tags/pending. */
  async getPendingSensitiveTags(userId: number) {
    const profile = await this.get(userId);
    await this.refreshSensitiveDecisions(profile);
    const fresh = await this.get(userId);
    const decisions = fresh.sensitiveTagDecisions ?? {};
    const pending = Object.entries(decisions)
      .filter(([, value]) => value?.status === 'pending')
      .map(([tag, value]) => ({
        tag,
        category: value.category ?? this.classifySensitiveCategory(tag),
      }));
    return { pending, total: pending.length };
  }

  /** POST /api/users/me/social-profile/sensitive-tags/confirm. */
  async confirmSensitiveTag(userId: number, tag: string) {
    return this.setSensitiveDecision(userId, tag, 'confirmed');
  }

  /** POST /api/users/me/social-profile/sensitive-tags/reject. */
  async rejectSensitiveTag(userId: number, tag: string) {
    return this.setSensitiveDecision(userId, tag, 'rejected');
  }

  private async setSensitiveDecision(
    userId: number,
    tag: string,
    status: 'confirmed' | 'rejected' | 'hidden',
  ) {
    const trimmed = (tag ?? '').trim();
    if (!trimmed) {
      return { ok: false, error: 'tag is required' };
    }
    const existing = await this.repo.findOne({ where: { userId } });
    const profile = existing ?? this.empty(userId);
    const decisions = { ...(profile.sensitiveTagDecisions ?? {}) };
    const prior = decisions[trimmed];
    decisions[trimmed] = {
      status,
      category: prior?.category ?? this.classifySensitiveCategory(trimmed),
      decidedAt: new Date().toISOString(),
    };
    const merged: UserSocialProfile = {
      ...profile,
      sensitiveTagDecisions: decisions,
      userId,
    } as UserSocialProfile;
    const saved = await this.repo.save(merged);
    await this.syncAiDelegateProfile(userId, saved);
    return {
      ok: true,
      tag: trimmed,
      status,
      decisions: saved.sensitiveTagDecisions,
    };
  }

  private async applySensitiveTagSaveDecisions(
    profile: UserSocialProfile,
    input: {
      confirmAll?: boolean;
      decisions?: Record<string, SensitiveTagSaveStatus>;
    },
  ): Promise<UserSocialProfile> {
    const signals = (profile.matchSignals ??
      {}) as Partial<AiProfileMatchSignals>;
    const tags = this.cleanArr(signals.sensitivePrivateTags ?? []).filter(
      (tag) => this.classifyTag(tag) !== 'unavailable',
    );
    if (!tags.length) return profile;

    const existing = { ...(profile.sensitiveTagDecisions ?? {}) };
    let mutated = false;
    for (const tag of tags) {
      const explicitStatus = input.decisions?.[tag];
      const nextStatus =
        explicitStatus ??
        (input.confirmAll ? 'confirmed' : (existing[tag]?.status ?? 'pending'));
      if (
        !['confirmed', 'rejected', 'hidden', 'pending'].includes(nextStatus)
      ) {
        continue;
      }
      const prior = existing[tag];
      const category = prior?.category ?? this.classifySensitiveCategory(tag);
      const changed =
        prior?.status !== nextStatus || prior?.category !== category;
      existing[tag] = {
        status: nextStatus,
        category,
        decidedAt:
          changed && nextStatus !== 'pending'
            ? new Date().toISOString()
            : prior?.decidedAt,
      };
      mutated = mutated || changed;
    }
    if (!mutated) return profile;
    profile.sensitiveTagDecisions = existing;
    return this.repo.save(profile);
  }

  private summarizeDecisions(
    decisions: Record<
      string,
      { status: string; category?: string; decidedAt?: string }
    >,
  ) {
    const summary = { pending: 0, confirmed: 0, rejected: 0, hidden: 0 };
    for (const entry of Object.values(decisions ?? {})) {
      const key = entry?.status as keyof typeof summary;
      if (key && key in summary) summary[key] += 1;
    }
    return summary;
  }

  private joinText(parts: Array<string | null | undefined>): string {
    return parts
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join('；')
      .slice(0, 1200);
  }
}
