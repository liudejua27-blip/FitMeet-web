import { Injectable } from '@nestjs/common';
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
    await this.syncAiDelegateProfile(userId, saved);
    return saved;
  }

  async generateQuestions(userId: number) {
    const profile = await this.get(userId);
    const questions = [
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
      { key: 'lifestyleTags', question: '运动之外，你还喜欢哪些生活方式或话题？' },
      { key: 'socialScenes', question: '你更适合哪些社交场景？' },
      { key: 'wantToMeet', question: '你想认识什么样的人？' },
      { key: 'preferredTraits', question: '你更看重对方哪些特质？' },
      { key: 'avoidTraits', question: '你不接受哪些行为或类型？' },
      { key: 'relationshipGoals', question: '你这次社交更偏向交友、找搭子、人脉还是长期陪伴？' },
      { key: 'availableTimes', question: '你通常什么时间方便社交或约练？' },
      { key: 'weekdayAvailability', question: '工作日通常什么时候方便？' },
      { key: 'weekendAvailability', question: '周末通常什么时候方便？' },
      { key: 'socialPreference', question: '你喜欢怎样的社交节奏和聊天风格？' },
      { key: 'rejectRules', question: '有哪些情况 AI 必须替你拒绝？' },
      { key: 'privacyBoundary', question: '哪些隐私信息绝对不能自动透露？' },
    ].filter(({ key }) => !this.hasValue(profile, key as keyof UserSocialProfile));
    return { questions: questions.slice(0, 12), completion: this.getCompletionFromProfile(profile) };
  }

  async saveAnswer(userId: number, key: string, answer: string) {
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
    ]);
    if (!this.isEditableKey(key)) return this.get(userId);
    const value = listFields.has(key)
      ? this.cleanArr(this.splitAnswer(answer))
      : booleanFields.has(key)
        ? this.toBool(answer)
        : answer;
    return this.upsert(userId, { [key]: value } as UpdateSocialProfileDto);
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
      user: { nickname: user?.name ?? profile.nickname, city: user?.city ?? profile.city },
      source: input.source ?? 'fitmeet_ai_profile_builder',
    });
    return {
      mode: this.ai.isLlmEnabled() ? 'ai' : 'fallback',
      draft,
      profileUsed: profile,
      completion: this.getCompletionFromProfile(profile),
    };
  }

  async saveAiDraft(
    userId: number,
    input: { profile?: AiProfileBuilderCard; enableMatching?: boolean },
  ) {
    const card = input.profile;
    const dto = this.profileCardToDto(card);
    const saved = await this.upsert(userId, dto);
    const shouldSync = input.enableMatching !== false;
    const delegateProfile = shouldSync
      ? await this.syncAiDelegateProfile(userId, saved)
      : null;
    return {
      profile: saved,
      aiDelegateProfile: delegateProfile,
      matchingEnabled: Boolean(delegateProfile?.enabled),
      completion: this.getCompletionFromProfile(saved),
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
      aiSummary: '',
      aiProfileCard: {},
      matchSignals: {},
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
    if (dto.rejectRules !== undefined)
      out.rejectRules = dto.rejectRules.trim();
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
    const keys: Array<keyof UserSocialProfile> = [
      'gender',
      'nickname',
      'ageRange',
      'city',
      'mbti',
      'traits',
      'socialStyle',
      'communicationStyle',
      'nearbyArea',
      'fitnessGoals',
      'interestTags',
      'lifestyleTags',
      'wantToMeet',
      'preferredTraits',
      'avoidTraits',
      'relationshipGoals',
      'availableTimes',
      'socialPreference',
      'rejectRules',
      'privacyBoundary',
    ];
    const filled = keys.filter((key) => this.hasValue(profile, key));
    return {
      completedFields: filled,
      missingFields: keys.filter((key) => !filled.includes(key)),
      percent: Math.round((filled.length / keys.length) * 100),
    };
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
      normalized.push({ question: '用户自由描述', answer: input.rawText.trim() });
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
        profile.weekdayAvailability ? `工作日：${profile.weekdayAvailability}` : '',
        profile.weekendAvailability ? `周末：${profile.weekendAvailability}` : '',
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
    const signals = profile.matchSignals as Partial<AiProfileMatchSignals> | null;
    return this.cleanArr([
      ...((signals?.publicTags as string[] | undefined) ?? []),
      ...((signals?.matchKeywords as string[] | undefined) ?? []),
    ]).filter((tag) => !this.isSensitiveTag(tag));
  }

  private privateSignalTags(profile: UserSocialProfile): string[] {
    const signals = profile.matchSignals as Partial<AiProfileMatchSignals> | null;
    return this.cleanArr([
      ...((signals?.privatePreferenceTags as string[] | undefined) ?? []),
      ...((signals?.sensitivePrivateTags as string[] | undefined) ?? []),
    ]);
  }

  private isSensitiveTag(tag: string): boolean {
    return /rich|money|wealth|income|salary|handsome|beautiful|good-looking|resources|status|有钱|富|收入|高薪|颜值|帅|美|资源|身份/i.test(
      tag,
    );
  }

  private joinText(parts: Array<string | null | undefined>): string {
    return parts.map((part) => (part ?? '').trim()).filter(Boolean).join('；').slice(0, 1200);
  }
}
