import { Injectable } from '@nestjs/common';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';

type SensitiveDecision = {
  status?: string;
  category?: string;
  source?: string;
  visibility?: string;
  scope?: string;
  use?: string;
};

type ProfileMatchSignals = {
  publicTags?: string[];
  privatePreferenceTags?: string[];
  sensitivePrivateTags?: string[];
  matchKeywords?: string[];
  confidence?: number;
  source?: string;
};

export type SanitizedAiProfile = {
  nickname: string;
  ageRange: string;
  city: string;
  nearbyArea: string;
  mbti: string;
  zodiac: string;
  traits: string[];
  interestTags: string[];
  lifestyleTags: string[];
  socialScenes: string[];
  fitnessGoals: string[];
  relationshipGoals: string[];
  availableTimes: string[];
  socialStyle: string;
  communicationStyle: string;
  publicMatchTags: string[];
  privatePreferenceTags: string[];
  confirmedSensitiveMatchTags: string[];
  privacyFlags: {
    hasRejectRules: boolean;
    hasPrivacyBoundary: boolean;
    hideSensitiveTags: boolean;
  };
};

export type SanitizedAiRequest = {
  title: string;
  city: string;
  activityType: string;
  interestTags: string[];
  timePreference: string;
  socialGoal: string;
  personalityPreference: string[];
  locationPreference: string;
};

const CONTACT_OR_ID_RULES: Array<[RegExp, string]> = [
  [/([\w.+-]+)@([\w.-]+)\.[A-Za-z]{2,}/g, '[已隐藏]'],
  [/(?:\+?\d[\d\s-]{6,}\d)/g, '[已隐藏]'],
  [
    /(?:￥|¥|RMB|CNY|USD|\$|EUR|€)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:万|千|百|w|k|m))?/gi,
    '[金额已隐藏]',
  ],
  [/\d[\d,]*\s?(?:元|块|万|w|k|RMB)\b/gi, '[金额已隐藏]'],
  [
    /(身份证|护照|证件号|手机号|电话|微信|wechat|qq|邮箱|email)[:：]?\s*[^，。；;\n\s]{2,}/gi,
    '$1已隐藏',
  ],
  [
    /(住址|地址|门牌|楼栋|单元|房间|单位|公司|学校|大学|学院|收入|年薪|月薪|工资)[:：]?\s*[^，。；;\n]{2,}/gi,
    '$1已隐藏',
  ],
  [
    /([\u4e00-\u9fa5A-Za-z0-9_-]+(?:路|街|大道|巷|弄|小区|公寓|宿舍|酒店|楼|栋|单元|号楼|室)\s*\d+[\w-]*)/g,
    '[精确地址已隐藏]',
  ],
];

@Injectable()
export class MatchPrivacySanitizer {
  sanitizeRequestForAi(request: UserSocialRequest): SanitizedAiRequest {
    const metadata = request.metadata ?? {};
    return {
      title: this.sanitizeText(request.title, 120),
      city: this.sanitizeCoarseLocation(request.city),
      activityType: this.sanitizeText(request.activityType, 80),
      interestTags: this.cleanSafeTags(request.interestTags ?? [], 12),
      timePreference: this.sanitizeText(
        typeof metadata.timePreference === 'string'
          ? metadata.timePreference
          : '',
        120,
      ),
      socialGoal: this.sanitizeText(
        typeof metadata.socialGoal === 'string' ? metadata.socialGoal : '',
        120,
      ),
      personalityPreference: this.cleanSafeTags(
        Array.isArray(metadata.personalityPreference)
          ? (metadata.personalityPreference as string[])
          : [],
        8,
      ),
      locationPreference: this.sanitizeCoarseLocation(
        typeof metadata.locationPreference === 'string'
          ? metadata.locationPreference
          : '',
      ),
    };
  }

  sanitizeProfileForAi(
    profile: UserSocialProfile | null | undefined,
  ): SanitizedAiProfile | null {
    if (!profile) return null;
    return {
      nickname: this.sanitizeText(profile.nickname, 60),
      ageRange: this.sanitizeText(profile.ageRange, 30),
      city: this.sanitizeCoarseLocation(profile.city),
      nearbyArea: this.sanitizeCoarseLocation(profile.nearbyArea),
      mbti: this.sanitizeText(profile.mbti, 16),
      zodiac: this.sanitizeText(profile.zodiac, 20),
      traits: this.cleanSafeTags(profile.traits ?? [], 12),
      interestTags: this.cleanSafeTags(profile.interestTags ?? [], 12),
      lifestyleTags: this.cleanSafeTags(profile.lifestyleTags ?? [], 12),
      socialScenes: this.cleanSafeTags(profile.socialScenes ?? [], 12),
      fitnessGoals: this.cleanSafeTags(profile.fitnessGoals ?? [], 12),
      relationshipGoals: this.cleanSafeTags(
        profile.relationshipGoals ?? [],
        10,
      ),
      availableTimes: this.cleanSafeTags(profile.availableTimes ?? [], 10),
      socialStyle: this.sanitizeText(profile.socialStyle, 80),
      communicationStyle: this.sanitizeText(profile.communicationStyle, 80),
      publicMatchTags: this.publicProfileTags(profile),
      privatePreferenceTags: this.privatePreferenceTags(profile),
      confirmedSensitiveMatchTags: this.confirmedSensitiveMatchTags(profile),
      privacyFlags: {
        hasRejectRules: Boolean(profile.rejectRules?.trim()),
        hasPrivacyBoundary: Boolean(profile.privacyBoundary?.trim()),
        hideSensitiveTags: profile.hideSensitiveTags !== false,
      },
    };
  }

  sanitizeUserForAi(
    user: User,
    profile?: UserSocialProfile | null,
  ): {
    nickname: string;
    city: string;
    verified: boolean;
    trustScore: number;
    publicTags: string[];
  } {
    return {
      nickname: this.sanitizeText(user.name, 60),
      city: this.sanitizeCoarseLocation(profile?.city || user.city || ''),
      verified: Boolean(user.verified),
      trustScore: Math.max(0, Math.min(100, Number(user.trustScore ?? 0))),
      publicTags: this.cleanSafeTags(
        [
          ...(user.interestTags ?? []),
          ...(profile?.interestTags ?? []),
          ...(profile?.fitnessGoals ?? []),
          ...(profile?.lifestyleTags ?? []),
          ...(profile?.socialScenes ?? []),
          ...(profile?.traits ?? []),
        ],
        16,
      ),
    };
  }

  publicProfileTags(profile: UserSocialProfile | null | undefined): string[] {
    if (!profile) return [];
    const signals = this.matchSignals(profile);
    return this.cleanSafeTags(
      [
        ...(profile.interestTags ?? []),
        ...(profile.fitnessGoals ?? []),
        ...(profile.lifestyleTags ?? []),
        ...(profile.socialScenes ?? []),
        ...(profile.traits ?? []),
        ...(signals.publicTags ?? []),
        ...(signals.matchKeywords ?? []).filter(
          (tag) => !this.isSensitiveTag(tag),
        ),
      ],
      40,
    );
  }

  privatePreferenceTags(
    profile: UserSocialProfile | null | undefined,
  ): string[] {
    if (!profile) return [];
    const signals = this.matchSignals(profile);
    return this.cleanSafeTags(
      [
        ...(profile.wantToMeet ?? []),
        ...(profile.preferredTraits ?? []),
        ...(profile.relationshipGoals ?? []),
        ...(signals.privatePreferenceTags ?? []).filter(
          (tag) => !this.isSensitiveTag(tag),
        ),
      ],
      30,
    );
  }

  confirmedSensitiveMatchTags(
    profile: UserSocialProfile | null | undefined,
  ): string[] {
    if (!profile) return [];
    const signals = this.matchSignals(profile);
    return this.cleanSafeTags(
      (signals.sensitivePrivateTags ?? []).filter((tag) =>
        this.isConfirmedMatchOnlySensitiveTag(profile, tag),
      ),
      20,
      { allowSensitive: true },
    );
  }

  isConfirmedMatchOnlySensitiveTag(
    profile: UserSocialProfile | null | undefined,
    tag: string,
  ): boolean {
    if (!profile || !tag) return false;
    const decision = (profile.sensitiveTagDecisions ?? {})[tag] as
      | SensitiveDecision
      | undefined;
    if (decision?.status !== 'confirmed') return false;
    if (!this.isWealthOrResourceTag(tag)) return true;
    const source = (decision.source ?? '').toLowerCase();
    const scope = (
      decision.scope ??
      decision.visibility ??
      decision.use ??
      ''
    ).toLowerCase();
    return source === 'self_declared' && scope === 'match_only';
  }

  sanitizeText(value: unknown, max = 220): string {
    if (value == null) return '';
    let text =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value).replace(/\s+/g, ' ').trim()
        : '';
    for (const [pattern, replacement] of CONTACT_OR_ID_RULES) {
      text = text.replace(pattern, replacement);
    }
    if (max > 0 && text.length > max) return `${text.slice(0, max - 1)}…`;
    return text;
  }

  sanitizeCoarseLocation(value: unknown): string {
    const text = this.sanitizeText(value, 80);
    if (!text) return '';
    if (
      /(门牌|房间|单元|楼栋|身份证|手机号|微信|电话|邮箱|详细地址)/i.test(text)
    ) {
      return '';
    }
    return text.replace(/\d+[\w-]*(?:号|室|单元|楼|栋)/g, '').trim();
  }

  cleanSafeTags(
    tags: string[],
    limit = 20,
    options: { allowSensitive?: boolean } = {},
  ): string[] {
    return Array.from(
      new Set(
        (tags ?? [])
          .map((tag) => this.sanitizeText(tag, 40))
          .filter(Boolean)
          .filter((tag) => options.allowSensitive || !this.isSensitiveTag(tag)),
      ),
    ).slice(0, limit);
  }

  isSensitiveTag(tag: string): boolean {
    return /wealth_resource|status_signal|rich|money|wealth|income|salary|handsome|beautiful|good-looking|resources|status|身份证|手机号|微信|电话|邮箱|住址|地址|单位|学校|有钱|富|收入|高薪|颜值|帅|美|资源|身份/i.test(
      tag,
    );
  }

  isWealthOrResourceTag(tag: string): boolean {
    return /wealth_resource|rich|money|wealth|income|salary|resource|resources|asset|net.?worth|有钱|财富|资源|收入|高薪|年少多金|身价|资产|高消费/i.test(
      tag,
    );
  }

  private matchSignals(profile: UserSocialProfile): ProfileMatchSignals {
    return (profile.matchSignals ?? {}) as ProfileMatchSignals;
  }
}
