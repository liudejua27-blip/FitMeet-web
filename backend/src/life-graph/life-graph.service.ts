import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { cleanDisplayText } from '../common/display-text.util';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  LifeGraphCompletenessDto,
  LifeGraphDynamicSignalsDto,
  LifeGraphProposalDto,
  LifeGraphProposedFieldDto,
  LifeGraphFieldDto,
  LifeGraphMatchSignalsDto,
  LifeGraphMissingFieldDto,
  LifeGraphProfileDto,
  LifeGraphUnifiedMatchSignalsDto,
  ConfirmLifeGraphUpdateDto,
  ExtractLifeGraphFromChatDto,
  RejectLifeGraphUpdateDto,
  RevokeLifeGraphFieldDto,
  LifeGraphResponseDto,
  UpdateLifeGraphDto,
  UpdateLifeGraphFieldDto,
} from './dto/life-graph.dto';
import { LifeGraphAuditLog } from './entities/life-graph-audit-log.entity';
import { LifeGraphField } from './entities/life-graph-field.entity';
import { LifeGraphProfile } from './entities/life-graph-profile.entity';
import { LifeGraphProposal } from './entities/life-graph-proposal.entity';
import { LifeGraphExtractionService } from './life-graph-extraction.service';
import {
  LifeGraphAuditAction,
  LifeGraphFieldCategory,
  LifeGraphProposalStatus,
  LifeGraphFieldSource,
  LifeGraphSignalType,
} from './life-graph.enums';
import { RealtimeEventService } from '../realtime/realtime-event.service';

type LifeGraphFieldDefinition = {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  label: string;
  required?: boolean;
  priority: 'high' | 'medium' | 'low';
  private?: boolean;
};

type ImportCandidate = {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  fieldValue: unknown;
  confidence?: number;
  confirmedByUser?: boolean;
  signalType?: LifeGraphSignalType;
  visibleInRecommendationReason?: boolean;
  userCanDisableForMatching?: boolean;
  enabledForMatching?: boolean;
};

type StoredProposalField = LifeGraphProposedFieldDto & {
  confirmedAt?: string | null;
  rejectedAt?: string | null;
};

const ENTERTAINMENT_SIGNAL_KEYS = new Set([
  'zodiac',
  'zodiacSign',
  'mbti',
  'birthdayPersonality',
  'mysticInterestTags',
  'fortuneInterestTags',
  'astrologyInterestTags',
]);

const SENSITIVE_SIGNAL_KEYS = new Set([
  'birthDate',
  'preciseLocationSharing',
  'healthDataEnabled',
  'periodCycleEnabled',
  'contactSharing',
  'contactSharingRequiresApproval',
  'paymentBoundary',
  'paymentAutoExecution',
]);

const LIFE_GRAPH_DEFINITIONS: LifeGraphFieldDefinition[] = [
  field(LifeGraphFieldCategory.Identity, 'nickname', '昵称', 'high', true),
  field(LifeGraphFieldCategory.Identity, 'ageRange', '年龄段', 'medium', true),
  field(LifeGraphFieldCategory.Identity, 'gender', '性别', 'low'),
  field(LifeGraphFieldCategory.Identity, 'country', '国家', 'low'),
  field(LifeGraphFieldCategory.Identity, 'region', '地区', 'low'),
  field(LifeGraphFieldCategory.Identity, 'city', '城市', 'high', true),
  field(LifeGraphFieldCategory.Identity, 'timezone', '时区', 'medium', true),
  field(
    LifeGraphFieldCategory.Identity,
    'preferredLanguage',
    '偏好语言',
    'medium',
    true,
  ),
  field(LifeGraphFieldCategory.Identity, 'school', '学校', 'low'),
  field(LifeGraphFieldCategory.Identity, 'company', '公司', 'low'),
  field(LifeGraphFieldCategory.Identity, 'nearbyArea', '常活动区域', 'medium'),
  field(
    LifeGraphFieldCategory.Identity,
    'verifiedStatus',
    '认证状态',
    'medium',
  ),

  field(
    LifeGraphFieldCategory.SocialIntent,
    'currentSocialGoal',
    '当前社交目标',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.SocialIntent,
    'relationshipGoal',
    '关系目标',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.SocialIntent,
    'preferredPeople',
    '偏好认识的人',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.SocialIntent,
    'preferredSocialStyle',
    '偏好社交风格',
    'medium',
    true,
  ),
  field(
    LifeGraphFieldCategory.SocialIntent,
    'unacceptableBehaviors',
    '不可接受行为',
    'medium',
    true,
  ),
  field(
    LifeGraphFieldCategory.SocialIntent,
    'privacyBoundary',
    '隐私边界',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.SocialIntent,
    'temporaryIntent',
    '临时意图',
    'low',
  ),

  field(LifeGraphFieldCategory.Lifestyle, 'activeHours', '活跃时段', 'medium'),
  field(
    LifeGraphFieldCategory.Lifestyle,
    'availableTimes',
    '可约时间',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.Lifestyle,
    'weekendAvailability',
    '周末可用时间',
    'medium',
    true,
  ),
  field(
    LifeGraphFieldCategory.Lifestyle,
    'routinePreference',
    '作息偏好',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.Lifestyle,
    'activityRadius',
    '活动半径',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.Lifestyle,
    'acceptsNightMeet',
    '是否接受夜间见面',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.Lifestyle,
    'preferredMeetingTime',
    '偏好见面时间',
    'medium',
  ),

  field(
    LifeGraphFieldCategory.FitnessActivity,
    'fitnessGoals',
    '健身目标',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.FitnessActivity,
    'sportsPreferences',
    '运动偏好',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.FitnessActivity,
    'exerciseFrequency',
    '运动频率',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.FitnessActivity,
    'preferredIntensity',
    '偏好强度',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.FitnessActivity,
    'acceptsMixedGenderWorkout',
    '是否接受混合性别约练',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.FitnessActivity,
    'publicPlaceOnly',
    '只接受公开场所',
    'high',
    true,
  ),

  field(
    LifeGraphFieldCategory.TrustSafety,
    'realNameVerified',
    '实名验证',
    'high',
    true,
    true,
  ),
  field(
    LifeGraphFieldCategory.TrustSafety,
    'activityCompletionRate',
    '活动完成率',
    'medium',
    false,
    true,
  ),
  field(
    LifeGraphFieldCategory.TrustSafety,
    'reportCount',
    '被举报次数',
    'medium',
    false,
    true,
  ),
  field(
    LifeGraphFieldCategory.TrustSafety,
    'blockCount',
    '被拉黑次数',
    'medium',
    false,
    true,
  ),
  field(
    LifeGraphFieldCategory.TrustSafety,
    'riskFlags',
    '风险标记',
    'high',
    false,
    true,
  ),
  field(
    LifeGraphFieldCategory.TrustSafety,
    'requiresStrictConfirmation',
    '需要严格确认',
    'high',
    true,
    true,
  ),

  field(
    LifeGraphFieldCategory.InteractionMemory,
    'preferredAgentTone',
    '偏好 Agent 语气',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.InteractionMemory,
    'rejectedCandidateReasons',
    '拒绝候选原因',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.InteractionMemory,
    'openerStylePreference',
    '开场风格偏好',
    'medium',
  ),
  field(
    LifeGraphFieldCategory.InteractionMemory,
    'lastSuccessfulMatchReasons',
    '成功匹配原因',
    'low',
  ),
  field(
    LifeGraphFieldCategory.InteractionMemory,
    'dislikedRecommendationPatterns',
    '不喜欢的推荐模式',
    'medium',
  ),

  field(
    LifeGraphFieldCategory.PrivacyBoundary,
    'privacyBoundary',
    '隐私边界',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.PrivacyBoundary,
    'preciseLocationSharing',
    '精确定位共享',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.PrivacyBoundary,
    'contactSharing',
    '联系方式共享',
    'high',
    true,
  ),
  field(
    LifeGraphFieldCategory.PrivacyBoundary,
    'paymentBoundary',
    '支付边界',
    'high',
    true,
  ),
];

function field(
  category: LifeGraphFieldCategory,
  fieldKey: string,
  label: string,
  priority: 'high' | 'medium' | 'low',
  required = false,
  privateField = false,
): LifeGraphFieldDefinition {
  return {
    category,
    fieldKey,
    label,
    priority,
    required,
    private: privateField,
  };
}

@Injectable()
export class LifeGraphService {
  private readonly logger = new Logger(LifeGraphService.name);

  constructor(
    @InjectRepository(LifeGraphProfile)
    private readonly profiles: Repository<LifeGraphProfile>,
    @InjectRepository(LifeGraphField)
    private readonly fields: Repository<LifeGraphField>,
    @InjectRepository(LifeGraphAuditLog)
    private readonly auditLogs: Repository<LifeGraphAuditLog>,
    @InjectRepository(LifeGraphProposal)
    private readonly proposals: Repository<LifeGraphProposal>,
    @InjectRepository(UserSocialProfile)
    private readonly socialProfiles: Repository<UserSocialProfile>,
    private readonly extraction: LifeGraphExtractionService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
  ) {}

  async getLifeGraph(userId: number): Promise<LifeGraphResponseDto> {
    const profile = await this.ensureLifeGraph(userId);
    const fields = await this.findActiveFields(userId);
    const completeness = this.calculateCompleteness(fields, profile);
    const dynamicInsights = await this.buildDynamicLifeUnderstanding(
      userId,
      fields,
      profile,
    );
    return {
      profile: this.toProfileDto(profile),
      fields: this.groupFields(fields),
      completeness,
      dynamicInsights,
    };
  }

  async updateLifeGraph(
    userId: number,
    input: UpdateLifeGraphDto,
  ): Promise<LifeGraphResponseDto> {
    const profile = await this.ensureLifeGraph(userId);
    await this.updateProfileSummary(userId, profile, input);

    for (const update of input.fields ?? []) {
      await this.upsertField(userId, update, {
        source: LifeGraphFieldSource.Manual,
        confidence: 1,
        action: update.revoked
          ? LifeGraphAuditAction.Revoked
          : LifeGraphAuditAction.Updated,
        reason: update.reason || 'user_manual_update',
        confirmedByUser: update.confirmedByUser ?? true,
      });
    }

    await this.refreshProfileCompleteness(userId);
    this.logEvent('life_graph.field_updated', {
      userId,
      action: LifeGraphAuditAction.Updated,
      source: LifeGraphFieldSource.Manual,
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:updated',
      payload: {
        changedFields: input.fields?.map((field) => ({
          category: field.category,
          fieldKey: field.fieldKey,
          revoked: field.revoked === true,
        })),
      },
    });
    return this.getLifeGraph(userId);
  }

  async getCompleteness(userId: number): Promise<LifeGraphCompletenessDto> {
    const profile = await this.ensureLifeGraph(userId);
    const fields = await this.findActiveFields(userId);
    return this.calculateCompleteness(fields, profile);
  }

  async getMatchSignals(userId: number): Promise<LifeGraphMatchSignalsDto> {
    await this.ensureLifeGraph(userId);
    const fields = this.matchSignalFields(await this.findActiveFields(userId));
    const signals = {
      identity: this.signalGroup(fields, LifeGraphFieldCategory.Identity),
      socialIntent: this.signalGroup(
        fields,
        LifeGraphFieldCategory.SocialIntent,
      ),
      lifestyle: this.signalGroup(fields, LifeGraphFieldCategory.Lifestyle),
      fitnessActivity: this.signalGroup(
        fields,
        LifeGraphFieldCategory.FitnessActivity,
      ),
      trustSafety: this.signalGroup(fields, LifeGraphFieldCategory.TrustSafety),
      interactionMemory: this.signalGroup(
        fields,
        LifeGraphFieldCategory.InteractionMemory,
      ),
      privacyBoundary: this.signalGroup(
        fields,
        LifeGraphFieldCategory.PrivacyBoundary,
      ),
    };
    this.logEvent('life_graph.match_signals_generated', {
      userId,
      action: LifeGraphAuditAction.Updated,
      source: LifeGraphFieldSource.SystemGenerated,
    });
    return signals;
  }

  async getUnifiedMatchSignals(
    userId: number,
  ): Promise<LifeGraphUnifiedMatchSignalsDto> {
    const profile = await this.ensureLifeGraph(userId);
    const fields = this.matchSignalFields(await this.findActiveFields(userId));
    const byField: Record<string, number> = {};
    const value = (category: LifeGraphFieldCategory, fieldKey: string) => {
      const item = fields.find(
        (field) => field.category === category && field.fieldKey === fieldKey,
      );
      if (!item) return undefined;
      const confidence = this.effectiveFieldConfidence(item);
      byField[`${category}.${fieldKey}`] = confidence;
      return item.fieldValue;
    };
    const boolValue = (
      category: LifeGraphFieldCategory,
      fieldKey: string,
      fallback: boolean | null = null,
    ): boolean | null => {
      const raw = value(category, fieldKey);
      return typeof raw === 'boolean' ? raw : fallback;
    };
    const missingCriticalFields = this.calculateCompleteness(
      fields,
      profile,
    ).missingFields.filter((item) => item.priority === 'high');
    const confidenceValues = Object.values(byField);
    const overall = confidenceValues.length
      ? Math.round(
          (confidenceValues.reduce((sum, item) => sum + item, 0) /
            confidenceValues.length) *
            100,
        ) / 100
      : 0;

    const publicPlaceOnly =
      boolValue(LifeGraphFieldCategory.FitnessActivity, 'publicPlaceOnly') ===
        true ||
      boolValue(LifeGraphFieldCategory.PrivacyBoundary, 'publicPlaceOnly') ===
        true;
    const locationSharingAllowed =
      boolValue(
        LifeGraphFieldCategory.PrivacyBoundary,
        'preciseLocationSharing',
        false,
      ) === true;
    const acceptsNightMeet = boolValue(
      LifeGraphFieldCategory.Lifestyle,
      'acceptsNightMeet',
      null,
    );
    const behaviorSignals = await this.buildDynamicLifeUnderstanding(
      userId,
      fields,
      profile,
    );

    const signals = {
      identitySignals: {
        city: value(LifeGraphFieldCategory.Identity, 'city') ?? profile.city,
        region:
          value(LifeGraphFieldCategory.Identity, 'region') ?? profile.region,
        country:
          value(LifeGraphFieldCategory.Identity, 'country') ?? profile.country,
        timezone:
          value(LifeGraphFieldCategory.Identity, 'timezone') ??
          profile.timezone,
        nearbyArea: value(LifeGraphFieldCategory.Identity, 'nearbyArea'),
        preferredLanguage:
          value(LifeGraphFieldCategory.Identity, 'preferredLanguage') ??
          profile.preferredLanguage,
      },
      socialIntentSignals: {
        currentSocialGoal:
          value(LifeGraphFieldCategory.SocialIntent, 'currentSocialGoal') ??
          profile.currentSocialGoal,
        relationshipGoal: value(
          LifeGraphFieldCategory.SocialIntent,
          'relationshipGoal',
        ),
        preferredPeople: value(
          LifeGraphFieldCategory.SocialIntent,
          'preferredPeople',
        ),
        preferredSocialStyle: value(
          LifeGraphFieldCategory.SocialIntent,
          'preferredSocialStyle',
        ),
        unacceptableBehaviors: value(
          LifeGraphFieldCategory.SocialIntent,
          'unacceptableBehaviors',
        ),
      },
      lifestyleSignals: {
        activeHours: value(LifeGraphFieldCategory.Lifestyle, 'activeHours'),
        availableTimes: value(
          LifeGraphFieldCategory.Lifestyle,
          'availableTimes',
        ),
        weekendAvailability: value(
          LifeGraphFieldCategory.Lifestyle,
          'weekendAvailability',
        ),
        acceptsNightMeet,
        activityRadius: value(
          LifeGraphFieldCategory.Lifestyle,
          'activityRadius',
        ),
      },
      fitnessSignals: {
        sportsPreferences: value(
          LifeGraphFieldCategory.FitnessActivity,
          'sportsPreferences',
        ),
        exerciseFrequency: value(
          LifeGraphFieldCategory.FitnessActivity,
          'exerciseFrequency',
        ),
        preferredIntensity: value(
          LifeGraphFieldCategory.FitnessActivity,
          'preferredIntensity',
        ),
        publicPlaceOnly,
      },
      behaviorSignals,
      safetySignals: {
        realNameRequired:
          boolValue(LifeGraphFieldCategory.TrustSafety, 'realNameRequired') ===
          true,
        publicPlaceOnly,
        strictConfirmationRequired:
          boolValue(
            LifeGraphFieldCategory.TrustSafety,
            'requiresStrictConfirmation',
            false,
          ) === true,
        blockedScenarios: [
          ...(locationSharingAllowed ? [] : ['precise_location']),
          ...(acceptsNightMeet === false ? ['night_meet'] : []),
        ],
        locationSharingAllowed,
        acceptsNightMeet,
      },
      confidence: { overall, byField },
      missingCriticalFields,
    };
    this.logEvent('life_graph.match_signals_generated', {
      userId,
      action: LifeGraphAuditAction.Updated,
      source: LifeGraphFieldSource.SystemGenerated,
    });
    return signals;
  }

  private async buildDynamicLifeUnderstanding(
    userId: number,
    fields: LifeGraphField[],
    profile: LifeGraphProfile,
  ): Promise<LifeGraphDynamicSignalsDto> {
    const recentLogs = await this.auditLogs.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 40,
    });
    const value = (category: LifeGraphFieldCategory, fieldKey: string) =>
      fields.find(
        (field) => field.category === category && field.fieldKey === fieldKey,
      )?.fieldValue;
    const text = (...values: unknown[]) =>
      values
        .map((item) => this.signalText(item))
        .filter(Boolean)
        .join(' ');

    const locationText = text(
      value(LifeGraphFieldCategory.Identity, 'nearbyArea'),
      value(LifeGraphFieldCategory.Identity, 'school'),
      value(LifeGraphFieldCategory.Identity, 'city') ?? profile.city,
    );
    const socialText = text(
      value(LifeGraphFieldCategory.SocialIntent, 'currentSocialGoal') ??
        profile.currentSocialGoal,
      value(LifeGraphFieldCategory.SocialIntent, 'relationshipGoal'),
      value(LifeGraphFieldCategory.SocialIntent, 'preferredPeople'),
      value(LifeGraphFieldCategory.SocialIntent, 'preferredSocialStyle'),
      value(LifeGraphFieldCategory.SocialIntent, 'unacceptableBehaviors'),
      value(
        LifeGraphFieldCategory.InteractionMemory,
        'likedRecommendationPatterns',
      ),
      value(
        LifeGraphFieldCategory.InteractionMemory,
        'dislikedRecommendationPatterns',
      ),
    );
    const sportsText = text(
      value(LifeGraphFieldCategory.FitnessActivity, 'sportsPreferences'),
      value(LifeGraphFieldCategory.FitnessActivity, 'exerciseFrequency'),
      value(LifeGraphFieldCategory.FitnessActivity, 'preferredIntensity'),
      value(LifeGraphFieldCategory.FitnessActivity, 'fitnessGoals'),
    );
    const safetyText = text(
      value(LifeGraphFieldCategory.FitnessActivity, 'publicPlaceOnly'),
      value(LifeGraphFieldCategory.PrivacyBoundary, 'privacyBoundary'),
      value(LifeGraphFieldCategory.PrivacyBoundary, 'preciseLocationSharing'),
      value(LifeGraphFieldCategory.TrustSafety, 'requiresStrictConfirmation'),
    );
    const auditText = recentLogs
      .map((log) => `${log.fieldKey} ${log.reason}`)
      .join(' ');

    const completed =
      this.numberSignal(
        value(LifeGraphFieldCategory.InteractionMemory, 'completedActivities'),
        value(LifeGraphFieldCategory.InteractionMemory, 'completedMeetups'),
        value(LifeGraphFieldCategory.InteractionMemory, 'completedWorkouts'),
      ) + this.keywordCount(auditText, /完成|守时|评价|confirmed|completion/i);
    const cancelled =
      this.numberSignal(
        value(LifeGraphFieldCategory.InteractionMemory, 'cancelledActivities'),
        value(LifeGraphFieldCategory.InteractionMemory, 'cancelledMeetups'),
        value(LifeGraphFieldCategory.InteractionMemory, 'noShowCount'),
      ) +
      this.keywordCount(auditText, /取消|爽约|撤回|rejected|revoked|cancel/i);
    const trustScore = this.numberSignal(
      value(LifeGraphFieldCategory.InteractionMemory, 'trustScore'),
      value(LifeGraphFieldCategory.TrustSafety, 'trustScore'),
    );

    const recentActivityCount = recentLogs.filter((log) => {
      const createdAt = new Date(log.createdAt);
      return Date.now() - createdAt.getTime() < 30 * 24 * 60 * 60 * 1000;
    }).length;
    const sportsKeywords = /跑步|散步|慢跑|健身|运动|骑行|游泳|球|训练/.test(
      `${sportsText} ${socialText}`,
    );
    const socialKeywords = /聊天|朋友|搭子|认识|相亲|恋爱|探店|拍照/.test(
      socialText,
    );
    const lowPressure = /低压力|慢热|先聊|轻松|一对一|不急|自然/.test(
      `${socialText} ${safetyText}`,
    );
    const avoidsNight =
      /不接受夜|不想晚上|深夜|私人场所/.test(`${socialText} ${safetyText}`) ||
      value(LifeGraphFieldCategory.Lifestyle, 'acceptsNightMeet') === false;
    const publicBoundary =
      /公共|公开|校园|操场|公园/.test(`${safetyText} ${socialText}`) ||
      value(LifeGraphFieldCategory.FitnessActivity, 'publicPlaceOnly') === true;

    const reliability =
      trustScore > 0
        ? this.clampScore(trustScore)
        : completed + cancelled > 0
          ? this.clampScore(55 + completed * 10 - cancelled * 14)
          : 50;
    const activityLevel =
      recentActivityCount >= 6
        ? 'active'
        : recentActivityCount <= 1
          ? 'quiet'
          : 'unknown';
    const socialEnergy =
      sportsKeywords && /聊天|朋友|相亲|恋爱|探店|拍照/.test(socialText)
        ? 'balanced'
        : sportsKeywords
          ? 'sports'
          : socialKeywords
            ? 'social'
            : 'unknown';
    const completionTrend =
      completed === 0 && cancelled === 0
        ? 'unknown'
        : reliability >= 72
          ? 'reliable'
          : reliability >= 48
            ? 'mixed'
            : 'fragile';
    const cancellationPattern =
      cancelled === 0 && completed > 0
        ? 'rare'
        : cancelled >= 3
          ? 'frequent'
          : cancelled > 0
            ? 'occasional'
            : 'unknown';
    const pressurePreference = lowPressure
      ? 'low'
      : socialText
        ? 'medium'
        : 'unknown';
    const nightBoundary = avoidsNight ? 'avoids_late_private' : 'unknown';
    const locationPreference = /大学|学校|校|附近|园区/.test(locationText)
      ? 'same_school_or_area'
      : locationText
        ? 'same_city'
        : sportsKeywords || socialKeywords
          ? 'interest_first'
          : 'unknown';

    const insights = [
      activityLevel === 'active'
        ? '你最近对社交和活动反馈比较活跃，适合给你更及时的候选机会。'
        : activityLevel === 'quiet'
          ? '你最近互动不算频繁，更适合低打扰、少量但更准的推荐。'
          : '你的近期活跃度还不够稳定，我会先用更保守的节奏推荐。',
      socialEnergy === 'sports'
        ? '你最近更偏运动型社交，跑步、散步或轻运动会比泛聊天更自然。'
        : socialEnergy === 'social'
          ? '你最近更偏认识人和轻社交，可以先从聊天或低压力见面开始。'
          : socialEnergy === 'balanced'
            ? '你对运动和认识新朋友都有兴趣，适合从共同活动切入。'
            : '我还需要更多反馈来判断你最近更偏运动还是偏社交。',
      nightBoundary === 'avoids_late_private'
        ? '你对深夜或私人场所有明显边界，第一次见面会优先公共场所。'
        : publicBoundary
          ? '你更适合第一次在公共场所见面，不建议直接共享精确位置。'
          : '安全边界还可以再确认一次，尤其是首次见面地点和位置共享。',
      completionTrend === 'reliable'
        ? '你的过往完成表现比较稳定，可以适当提高守时、同区域搭子的推荐权重。'
        : completionTrend === 'fragile'
          ? '你的近期完成记录还不稳定，我会优先推荐更容易改期、压力更低的安排。'
          : '完成和取消趋势还不明显，我会先观察你对推荐的真实反馈。',
      locationPreference === 'same_school_or_area'
        ? '你更容易接受同校或活动区域接近的人。'
        : locationPreference === 'same_city'
          ? '你更适合先看同城、距离明确的人。'
          : '我会先把共同兴趣放在推荐解释里，而不是只看距离。',
    ];

    const summary = `我对你的了解：${insights.slice(0, 4).join('')}`;
    return {
      activityLevel,
      socialEnergy,
      completionTrend,
      cancellationPattern,
      pressurePreference,
      nightBoundary,
      locationPreference,
      feedbackPattern: this.feedbackPatterns(value, socialText),
      scores: {
        rhythmConfidence: this.clampScore(35 + recentActivityCount * 8),
        sportsAffinity: this.clampScore(sportsKeywords ? 82 : 42),
        lowPressureFit: this.clampScore(
          lowPressure ? 86 : publicBoundary ? 70 : 45,
        ),
        safetyBoundaryClarity: this.clampScore(
          publicBoundary || avoidsNight ? 86 : safetyText ? 64 : 35,
        ),
        reliability,
      },
      summary,
      insights,
    };
  }

  private feedbackPatterns(
    value: (category: LifeGraphFieldCategory, fieldKey: string) => unknown,
    socialText: string,
  ): string[] {
    const explicit = [
      value(
        LifeGraphFieldCategory.InteractionMemory,
        'likedRecommendationPatterns',
      ),
      value(LifeGraphFieldCategory.SocialIntent, 'preferredPeople'),
      value(
        LifeGraphFieldCategory.InteractionMemory,
        'dislikedRecommendationPatterns',
      ),
    ]
      .map((item) => this.signalText(item))
      .filter(Boolean);
    if (explicit.length) return explicit.slice(0, 4);
    const inferred: string[] = [];
    if (/守时/.test(socialText)) inferred.push('对守时的人反馈更好');
    if (/同校|附近|同城/.test(socialText))
      inferred.push('更容易接受同校或同区域的人');
    if (/慢热|低压力|先聊/.test(socialText)) inferred.push('更喜欢低压力开场');
    return inferred.slice(0, 4);
  }

  private signalText(value: unknown): string {
    if (Array.isArray(value))
      return value
        .map((item) => this.signalText(item))
        .filter(Boolean)
        .join('、');
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if ('value' in record) return this.signalText(record.value);
      return Object.values(record)
        .map((item) => this.signalText(item))
        .filter(Boolean)
        .join('、');
    }
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (value === null || value === undefined) return '';
    return cleanDisplayText(value, '').trim();
  }

  private numberSignal(...values: unknown[]): number {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const parsed = Number(this.signalText(value));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  private keywordCount(text: string, pattern: RegExp): number {
    return (text.match(pattern) ?? []).length;
  }

  private clampScore(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  async getAuditLogs(
    userId: number,
    options: { limit?: number; cursor?: string } = {},
  ) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const cursorDate = options.cursor ? new Date(options.cursor) : null;
    const logs = await this.auditLogs.find({
      where:
        cursorDate && !Number.isNaN(cursorDate.getTime())
          ? { userId, createdAt: LessThan(cursorDate) }
          : { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async extractFromChat(
    userId: number,
    input: ExtractLifeGraphFromChatDto,
  ): Promise<LifeGraphProposalDto> {
    await this.ensureLifeGraph(userId);
    const extraction = this.extraction.extractFromChat(input.message);
    const proposedFields: StoredProposalField[] = [];

    for (const [index, item] of extraction.proposedFields.entries()) {
      if (item.category === LifeGraphFieldCategory.TrustSafety) {
        await this.writeAuditLog({
          userId,
          category: item.category,
          fieldKey: item.fieldKey,
          oldValue: null,
          newValue: item.fieldValue,
          source: item.source,
          confidence: item.confidence,
          action: LifeGraphAuditAction.Rejected,
          reason: 'trust_safety_cannot_be_updated_from_chat',
          taskId: input.taskId ?? null,
          messageId: input.messageId ?? null,
        });
        continue;
      }
      const existing = await this.findFieldIncludingRevoked(
        userId,
        item.category,
        item.fieldKey,
      );
      const conflict =
        Boolean(existing) &&
        (existing?.source === LifeGraphFieldSource.Manual ||
          existing?.revoked === true ||
          JSON.stringify(existing?.fieldValue) !==
            JSON.stringify(item.fieldValue));
      const status = existing?.revoked
        ? 'revoked_conflict'
        : conflict
          ? 'conflict'
          : 'proposed';
      const proposed: StoredProposalField = {
        proposalFieldId: `${item.category}:${item.fieldKey}:${index + 1}`,
        category: item.category,
        fieldKey: item.fieldKey,
        fieldValue: item.fieldValue,
        source: item.source,
        confidence: item.confidence,
        reason: item.reason,
        requiresUserConfirmation: true,
        status,
        conflict,
        oldValue: existing?.fieldValue ?? null,
      };
      proposedFields.push(proposed);
      await this.writeAuditLog({
        userId,
        category: item.category,
        fieldKey: item.fieldKey,
        oldValue: existing?.fieldValue ?? null,
        newValue: item.fieldValue,
        source: item.source,
        confidence: item.confidence,
        action: conflict
          ? LifeGraphAuditAction.ConflictDetected
          : LifeGraphAuditAction.AiProposed,
        reason: item.reason,
        taskId: input.taskId ?? null,
        messageId: input.messageId ?? null,
      });
    }

    const proposal = await this.proposals.save(
      this.proposals.create({
        userId,
        taskId: input.taskId ?? null,
        messageId: input.messageId ?? null,
        proposedFields,
        status: LifeGraphProposalStatus.Proposed,
        aiSummary: extraction.summary,
        missingFields: extraction.missingFields,
        confirmationRequired: proposedFields.length > 0,
        confirmedAt: null,
        rejectedAt: null,
      }),
    );
    this.logEvent('life_graph.ai_proposed', {
      userId,
      action: LifeGraphAuditAction.AiProposed,
      source: LifeGraphFieldSource.AiInferred,
      requestId: input.messageId ?? undefined,
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:proposal_created',
      payload: {
        proposalId: proposal.id,
        taskId: proposal.taskId,
        messageId: proposal.messageId,
        proposedFieldCount: proposedFields.length,
        aiSummary: proposal.aiSummary,
      },
      rooms: input.taskId ? [`agent_task:${input.taskId}`] : [],
      notification: proposedFields.length
        ? {
            type: 'life_graph',
            text: 'Agent 识别到新的 Life Graph 更新，等待你确认。',
            pushPayload: { proposalId: proposal.id },
          }
        : undefined,
    });
    return this.toProposalDto(proposal);
  }

  async confirmUpdate(
    userId: number,
    input: ConfirmLifeGraphUpdateDto,
  ): Promise<LifeGraphProposalDto> {
    const proposal = await this.findProposalForUser(userId, input.proposalId);
    const selectedIds = new Set(input.fieldIds ?? []);
    const fields = this.proposalFields(proposal);
    let confirmedCount = 0;
    const nextFields: StoredProposalField[] = [];
    for (const field of fields) {
      const selected =
        selectedIds.size === 0 || selectedIds.has(field.proposalFieldId);
      if (
        !selected ||
        field.status === 'rejected' ||
        field.status === 'confirmed'
      ) {
        nextFields.push(field);
        continue;
      }
      if (field.category === LifeGraphFieldCategory.TrustSafety) {
        nextFields.push({
          ...field,
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
        });
        continue;
      }
      await this.upsertField(
        userId,
        {
          category: field.category,
          fieldKey: field.fieldKey,
          fieldValue: field.fieldValue,
          confirmedByUser: true,
          revoked: false,
          reason: field.reason,
        },
        {
          source: LifeGraphFieldSource.AiInferred,
          confidence: field.confidence,
          action: LifeGraphAuditAction.Confirmed,
          reason: field.reason || 'user_confirmed_ai_proposal',
          confirmedByUser: true,
          allowManualOverride: true,
          taskId: proposal.taskId,
          messageId: proposal.messageId,
        },
      );
      confirmedCount += 1;
      nextFields.push({
        ...field,
        status: 'confirmed',
        confirmedAt: new Date().toISOString(),
      });
    }
    if (confirmedCount === 0) {
      throw new BadRequestException('没有可确认的 Life Graph 字段');
    }
    proposal.proposedFields = nextFields;
    proposal.status = nextFields.every((item) => item.status === 'confirmed')
      ? LifeGraphProposalStatus.Confirmed
      : LifeGraphProposalStatus.PartiallyConfirmed;
    proposal.confirmedAt = new Date();
    const saved = await this.proposals.save(proposal);
    await this.refreshProfileCompleteness(userId);
    this.logEvent('life_graph.confirmed', {
      userId,
      action: LifeGraphAuditAction.Confirmed,
      source: LifeGraphFieldSource.AiInferred,
      requestId: proposal.messageId ?? undefined,
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:updated',
      payload: {
        proposalId: proposal.id,
        status: saved.status,
        confirmedCount,
      },
      rooms: proposal.taskId ? [`agent_task:${proposal.taskId}`] : [],
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:completeness_changed',
      payload: await this.getCompleteness(userId),
    });
    return this.toProposalDto(saved);
  }

  async rejectUpdate(
    userId: number,
    input: RejectLifeGraphUpdateDto,
  ): Promise<LifeGraphProposalDto> {
    const proposal = await this.findProposalForUser(userId, input.proposalId);
    const selectedIds = new Set(input.fieldIds ?? []);
    const fields = this.proposalFields(proposal);
    const nextFields: StoredProposalField[] = [];
    for (const field of fields) {
      const selected =
        selectedIds.size === 0 || selectedIds.has(field.proposalFieldId);
      if (!selected || field.status === 'confirmed') {
        nextFields.push(field);
        continue;
      }
      await this.writeAuditLog({
        userId,
        category: field.category,
        fieldKey: field.fieldKey,
        oldValue: field.oldValue,
        newValue: field.fieldValue,
        source: LifeGraphFieldSource.AiInferred,
        confidence: field.confidence,
        action: LifeGraphAuditAction.Rejected,
        reason: input.reason || field.reason || 'user_rejected_ai_proposal',
        taskId: proposal.taskId,
        messageId: proposal.messageId,
      });
      nextFields.push({
        ...field,
        status: 'rejected' as const,
        rejectedAt: new Date().toISOString(),
      });
    }
    proposal.proposedFields = nextFields;
    proposal.status = LifeGraphProposalStatus.Rejected;
    proposal.rejectedAt = new Date();
    const saved = await this.proposals.save(proposal);
    this.logEvent('life_graph.rejected', {
      userId,
      action: LifeGraphAuditAction.Rejected,
      source: LifeGraphFieldSource.AiInferred,
      requestId: proposal.messageId ?? undefined,
    });
    return this.toProposalDto(saved);
  }

  async revokeField(
    userId: number,
    input: RevokeLifeGraphFieldDto,
  ): Promise<LifeGraphResponseDto> {
    const existing = await this.fields.findOne({
      where: {
        userId,
        category: input.category,
        fieldKey: input.fieldKey,
        revoked: false,
      },
    });
    if (!existing) throw new NotFoundException('Life Graph 字段不存在或已撤回');
    const oldValue = existing.fieldValue;
    existing.revoked = true;
    existing.revokedAt = new Date();
    await this.fields.save(existing);
    await this.writeAuditLog({
      userId,
      category: existing.category,
      fieldKey: existing.fieldKey,
      oldValue,
      newValue: null,
      source: existing.source,
      confidence: existing.confidence,
      action: LifeGraphAuditAction.Revoked,
      reason: input.reason || 'user_revoked_life_graph_field',
    });
    await this.refreshProfileCompleteness(userId);
    this.logEvent('life_graph.revoked', {
      userId,
      category: existing.category,
      fieldKey: existing.fieldKey,
      action: LifeGraphAuditAction.Revoked,
      source: existing.source,
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:field_revoked',
      payload: {
        category: existing.category,
        fieldKey: existing.fieldKey,
      },
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:completeness_changed',
      payload: await this.getCompleteness(userId),
    });
    return this.getLifeGraph(userId);
  }

  async ensureLifeGraph(userId: number): Promise<LifeGraphProfile> {
    let profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      profile = this.profiles.create({
        userId,
        completenessScore: 0,
        currentSocialGoal: '',
        aiSummary: '',
        preferredLanguage: 'zh-CN',
        country: '中国',
        region: '',
        city: '',
        timezone: 'Asia/Shanghai',
        lastUpdatedAt: new Date(),
      });
      profile = await this.profiles.save(profile);
      this.logEvent('life_graph.initialized', {
        userId,
        action: LifeGraphAuditAction.Created,
        source: LifeGraphFieldSource.SystemGenerated,
      });
    }

    await this.importFromSocialProfile(userId, profile);
    return (await this.refreshProfileCompleteness(userId)) ?? profile;
  }

  private async importFromSocialProfile(
    userId: number,
    profile: LifeGraphProfile,
  ): Promise<void> {
    const socialProfile = await this.socialProfiles.findOne({
      where: { userId },
    });
    if (!socialProfile) return;

    const imports = this.importCandidatesFromSocialProfile(
      socialProfile,
      profile,
    );
    for (const item of imports) {
      await this.upsertField(userId, item, {
        source: LifeGraphFieldSource.ImportedFromSocialProfile,
        confidence: item.confidence ?? 0.82,
        action: LifeGraphAuditAction.Imported,
        reason: 'imported_from_user_social_profiles',
        confirmedByUser: item.confirmedByUser ?? true,
        importOnly: true,
      });
    }

    const patch: Partial<LifeGraphProfile> = {};
    if (!profile.aiSummary && socialProfile.aiSummary) {
      patch.aiSummary = socialProfile.aiSummary;
    }
    if (!profile.city && socialProfile.city) patch.city = socialProfile.city;
    if (!profile.currentSocialGoal && socialProfile.wantToMeet?.length) {
      patch.currentSocialGoal = socialProfile.wantToMeet.join('、');
    }
    if (Object.keys(patch).length > 0) {
      await this.profiles.update(
        { userId },
        { ...patch, lastUpdatedAt: new Date() },
      );
    }
  }

  private importCandidatesFromSocialProfile(
    socialProfile: UserSocialProfile,
    profile: LifeGraphProfile,
  ): ImportCandidate[] {
    const values: ImportCandidate[] = [
      imported(
        LifeGraphFieldCategory.Identity,
        'nickname',
        socialProfile.nickname,
      ),
      imported(
        LifeGraphFieldCategory.Identity,
        'ageRange',
        socialProfile.ageRange,
      ),
      imported(LifeGraphFieldCategory.Identity, 'gender', socialProfile.gender),
      imported(
        LifeGraphFieldCategory.Identity,
        'city',
        socialProfile.city || profile.city,
      ),
      imported(
        LifeGraphFieldCategory.Identity,
        'timezone',
        profile.timezone || 'Asia/Shanghai',
      ),
      imported(
        LifeGraphFieldCategory.Identity,
        'preferredLanguage',
        profile.preferredLanguage || 'zh-CN',
      ),
      imported(
        LifeGraphFieldCategory.Identity,
        'nearbyArea',
        socialProfile.nearbyArea,
      ),
      imported(
        LifeGraphFieldCategory.Identity,
        'verifiedStatus',
        socialProfile.profileDiscoverable ? 'discoverable' : 'private',
      ),
      imported(
        LifeGraphFieldCategory.SocialIntent,
        'currentSocialGoal',
        socialProfile.wantToMeet,
      ),
      imported(
        LifeGraphFieldCategory.SocialIntent,
        'relationshipGoal',
        socialProfile.relationshipGoals,
      ),
      imported(
        LifeGraphFieldCategory.SocialIntent,
        'preferredPeople',
        socialProfile.preferredTraits,
      ),
      imported(
        LifeGraphFieldCategory.SocialIntent,
        'preferredSocialStyle',
        socialProfile.socialStyle || socialProfile.socialPreference,
      ),
      imported(
        LifeGraphFieldCategory.SocialIntent,
        'unacceptableBehaviors',
        socialProfile.avoidTraits?.length
          ? socialProfile.avoidTraits
          : socialProfile.rejectRules,
      ),
      imported(
        LifeGraphFieldCategory.SocialIntent,
        'privacyBoundary',
        socialProfile.privacyBoundary,
      ),
      imported(
        LifeGraphFieldCategory.Lifestyle,
        'availableTimes',
        socialProfile.availableTimes,
      ),
      imported(
        LifeGraphFieldCategory.Lifestyle,
        'weekendAvailability',
        socialProfile.weekendAvailability,
      ),
      imported(
        LifeGraphFieldCategory.Lifestyle,
        'activeHours',
        [
          socialProfile.weekdayAvailability,
          socialProfile.weekendAvailability,
        ].filter(Boolean),
      ),
      imported(
        LifeGraphFieldCategory.Lifestyle,
        'routinePreference',
        socialProfile.lifestyleTags,
      ),
      imported(
        LifeGraphFieldCategory.FitnessActivity,
        'fitnessGoals',
        socialProfile.fitnessGoals,
      ),
      imported(
        LifeGraphFieldCategory.FitnessActivity,
        'sportsPreferences',
        socialProfile.interestTags,
      ),
      imported(
        LifeGraphFieldCategory.FitnessActivity,
        'publicPlaceOnly',
        /公开|公共|人多|不接受夜间私人/.test(
          `${socialProfile.rejectRules} ${socialProfile.privacyBoundary}`,
        ),
      ),
      imported(
        LifeGraphFieldCategory.TrustSafety,
        'requiresStrictConfirmation',
        Boolean(socialProfile.hideSensitiveTags),
      ),
      imported(
        LifeGraphFieldCategory.InteractionMemory,
        'preferredAgentTone',
        socialProfile.communicationStyle,
      ),
      imported(
        LifeGraphFieldCategory.PrivacyBoundary,
        'privacyBoundary',
        socialProfile.privacyBoundary,
      ),
      imported(
        LifeGraphFieldCategory.PrivacyBoundary,
        'preciseLocationSharing',
        false,
      ),
      imported(LifeGraphFieldCategory.PrivacyBoundary, 'contactSharing', false),
      imported(
        LifeGraphFieldCategory.PrivacyBoundary,
        'paymentBoundary',
        false,
      ),
    ];
    return values.filter((item) => hasMeaningfulValue(item.fieldValue));
  }

  private async updateProfileSummary(
    userId: number,
    profile: LifeGraphProfile,
    input: UpdateLifeGraphDto,
  ): Promise<void> {
    const update: Partial<LifeGraphProfile> = {};
    const summaryFields = [
      'currentSocialGoal',
      'preferredLanguage',
      'country',
      'region',
      'city',
      'timezone',
    ] as const;

    for (const key of summaryFields) {
      const value = input[key];
      if (typeof value !== 'string') continue;
      update[key] = value.trim();
      await this.writeAuditLog({
        userId,
        category:
          key === 'currentSocialGoal'
            ? LifeGraphFieldCategory.SocialIntent
            : LifeGraphFieldCategory.Identity,
        fieldKey: key,
        oldValue: profile[key],
        newValue: update[key],
        source: LifeGraphFieldSource.Manual,
        action: LifeGraphAuditAction.Updated,
        reason: 'user_manual_profile_update',
      });
    }

    if (Object.keys(update).length > 0) {
      await this.profiles.update(
        { userId },
        { ...update, lastUpdatedAt: new Date() },
      );
    }
  }

  private async upsertField(
    userId: number,
    update: UpdateLifeGraphFieldDto | ImportCandidate,
    options: {
      source: LifeGraphFieldSource;
      confidence: number;
      action: LifeGraphAuditAction;
      reason: string;
      confirmedByUser: boolean;
      importOnly?: boolean;
      taskId?: number | null;
      messageId?: string | null;
      allowManualOverride?: boolean;
    },
  ): Promise<LifeGraphField | null> {
    const existing = await this.fields.findOne({
      where: {
        userId,
        category: update.category,
        fieldKey: update.fieldKey,
      },
    });

    if (options.importOnly && existing) return existing;
    if (
      existing &&
      existing.source === LifeGraphFieldSource.Manual &&
      options.source !== LifeGraphFieldSource.Manual &&
      !options.allowManualOverride
    ) {
      await this.writeAuditLog({
        userId,
        category: update.category,
        fieldKey: update.fieldKey,
        oldValue: existing.fieldValue,
        newValue: update.fieldValue,
        source: options.source,
        confidence: options.confidence,
        action: LifeGraphAuditAction.AiProposed,
        reason: 'manual_field_not_overwritten',
        taskId: options.taskId ?? null,
        messageId: options.messageId ?? null,
      });
      return existing;
    }

    const revoked = 'revoked' in update ? Boolean(update.revoked) : false;
    const next = existing ?? this.fields.create({ userId });
    const oldValue = existing?.fieldValue ?? null;
    const signalMetadata = this.resolveSignalMetadata(update);
    next.category = update.category;
    next.fieldKey = update.fieldKey;
    next.fieldValue = update.fieldValue;
    next.source = options.source;
    next.confidence = options.confidence;
    next.confirmedByUser = options.confirmedByUser;
    next.editable = 'editable' in update ? update.editable !== false : true;
    next.revoked = revoked;
    next.revokedAt = revoked ? new Date() : null;
    next.lastInferredAt =
      options.source === LifeGraphFieldSource.AiInferred ? new Date() : null;
    next.signalType = signalMetadata.signalType;
    next.visibleInRecommendationReason =
      signalMetadata.visibleInRecommendationReason;
    next.userCanDisableForMatching = signalMetadata.userCanDisableForMatching;
    next.enabledForMatching = signalMetadata.enabledForMatching;
    const saved = await this.fields.save(next);

    await this.writeAuditLog({
      userId,
      category: update.category,
      fieldKey: update.fieldKey,
      oldValue,
      newValue: update.fieldValue,
      source: options.source,
      confidence: options.confidence,
      action:
        options.action === LifeGraphAuditAction.Confirmed
          ? LifeGraphAuditAction.Confirmed
          : existing
            ? options.action
            : LifeGraphAuditAction.Created,
      reason:
        'reason' in update && update.reason ? update.reason : options.reason,
      taskId: options.taskId ?? null,
      messageId: options.messageId ?? null,
    });

    return saved;
  }

  private resolveSignalMetadata(
    update: UpdateLifeGraphFieldDto | ImportCandidate,
  ): {
    signalType: LifeGraphSignalType;
    visibleInRecommendationReason: boolean;
    userCanDisableForMatching: boolean;
    enabledForMatching: boolean;
  } {
    const inferredType = this.inferSignalType(update.fieldKey);
    const signalType = update.signalType ?? inferredType;
    const isEntertainment =
      signalType === LifeGraphSignalType.Entertainment ||
      signalType === LifeGraphSignalType.Weak;
    const isSensitive = signalType === LifeGraphSignalType.Sensitive;
    const visibleInRecommendationReason =
      update.visibleInRecommendationReason ??
      (!isEntertainment && !isSensitive);
    const userCanDisableForMatching =
      update.userCanDisableForMatching ?? isEntertainment;
    const enabledForMatching =
      update.enabledForMatching ??
      (isSensitive
        ? ![
            'birthDate',
            'preciseLocationSharing',
            'healthDataEnabled',
            'periodCycleEnabled',
            'contactSharing',
            'paymentBoundary',
            'paymentAutoExecution',
          ].includes(update.fieldKey)
        : true);

    return {
      signalType,
      visibleInRecommendationReason,
      userCanDisableForMatching,
      enabledForMatching,
    };
  }

  private inferSignalType(fieldKey: string): LifeGraphSignalType {
    if (ENTERTAINMENT_SIGNAL_KEYS.has(fieldKey)) {
      return fieldKey === 'mbti'
        ? LifeGraphSignalType.Weak
        : LifeGraphSignalType.Entertainment;
    }
    if (SENSITIVE_SIGNAL_KEYS.has(fieldKey))
      return LifeGraphSignalType.Sensitive;
    return LifeGraphSignalType.Core;
  }

  private resolveStoredSignalMetadata(field: LifeGraphField): {
    signalType: LifeGraphSignalType;
    visibleInRecommendationReason: boolean;
    userCanDisableForMatching: boolean;
    enabledForMatching: boolean;
  } {
    const signalType = field.signalType ?? this.inferSignalType(field.fieldKey);
    const isEntertainment =
      signalType === LifeGraphSignalType.Entertainment ||
      signalType === LifeGraphSignalType.Weak;
    const isSensitive = signalType === LifeGraphSignalType.Sensitive;
    return {
      signalType,
      visibleInRecommendationReason:
        field.visibleInRecommendationReason ??
        (!isEntertainment && !isSensitive),
      userCanDisableForMatching:
        field.userCanDisableForMatching ?? isEntertainment,
      enabledForMatching: field.enabledForMatching ?? true,
    };
  }

  private async refreshProfileCompleteness(
    userId: number,
  ): Promise<LifeGraphProfile | null> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) return null;
    const fields = await this.findActiveFields(userId);
    const completeness = this.calculateCompleteness(fields, profile);
    profile.completenessScore = completeness.completenessScore;
    profile.lastUpdatedAt = new Date();
    return this.profiles.save(profile);
  }

  private calculateCompleteness(
    fields: LifeGraphField[],
    profile: LifeGraphProfile,
  ): LifeGraphCompletenessDto {
    const fieldMap = new Map(
      fields
        .filter((item) => hasMeaningfulValue(item.fieldValue))
        .map((item) => [`${item.category}:${item.fieldKey}`, item]),
    );
    const missingFields: LifeGraphMissingFieldDto[] = [];
    const modules = {} as Record<LifeGraphFieldCategory, number>;

    for (const category of Object.values(LifeGraphFieldCategory)) {
      const definitions = LIFE_GRAPH_DEFINITIONS.filter(
        (item) => item.category === category && item.required,
      );
      const total = definitions.length || 1;
      const filled = definitions.filter((item) => {
        if (item.fieldKey === 'currentSocialGoal') {
          return Boolean(profile.currentSocialGoal);
        }
        if (item.fieldKey === 'city') return Boolean(profile.city);
        return fieldMap.has(`${item.category}:${item.fieldKey}`);
      }).length;
      modules[category] = Math.round((filled / total) * 100);
      for (const item of definitions) {
        const exists =
          item.fieldKey === 'currentSocialGoal'
            ? Boolean(profile.currentSocialGoal)
            : item.fieldKey === 'city'
              ? Boolean(profile.city)
              : fieldMap.has(`${item.category}:${item.fieldKey}`);
        if (!exists) {
          missingFields.push({
            category: item.category,
            fieldKey: item.fieldKey,
            label: item.label,
            priority: item.priority,
          });
        }
      }
    }

    const visibleModules = Object.entries(modules).filter(
      ([category]) => category !== 'trust_safety',
    );
    const completenessScore = Math.round(
      visibleModules.reduce((sum, [, value]) => sum + value, 0) /
        Math.max(1, visibleModules.length),
    );
    return { completenessScore, modules, missingFields };
  }

  private async findActiveFields(userId: number): Promise<LifeGraphField[]> {
    return this.fields.find({
      where: { userId, revoked: false },
      order: { category: 'ASC', fieldKey: 'ASC' },
    });
  }

  private matchSignalFields(fields: LifeGraphField[]): LifeGraphField[] {
    return fields.filter(
      (field) => !field.revoked && field.enabledForMatching !== false,
    );
  }

  private signalGroup(
    fields: LifeGraphField[],
    category: LifeGraphFieldCategory,
  ): Record<string, unknown> {
    return fields
      .filter(
        (field) =>
          field.category === category &&
          !field.revoked &&
          field.enabledForMatching !== false,
      )
      .reduce<Record<string, unknown>>((signals, field) => {
        const metadata = this.resolveStoredSignalMetadata(field);
        signals[field.fieldKey] = {
          value: field.fieldValue,
          source: field.source,
          confidence: field.confidence,
          confirmedByUser: field.confirmedByUser,
          revoked: field.revoked,
          ...metadata,
        };
        return signals;
      }, {});
  }

  private groupFields(
    fields: LifeGraphField[],
  ): Record<LifeGraphFieldCategory, LifeGraphFieldDto[]> {
    const grouped = Object.values(LifeGraphFieldCategory).reduce(
      (acc, category) => {
        acc[category] = [];
        return acc;
      },
      {} as Record<LifeGraphFieldCategory, LifeGraphFieldDto[]>,
    );
    for (const field of fields) {
      grouped[field.category].push(this.toFieldDto(field));
    }
    return grouped;
  }

  private async writeAuditLog(input: {
    userId: number;
    fieldKey: string;
    category: LifeGraphFieldCategory;
    oldValue: unknown;
    newValue: unknown;
    source: LifeGraphFieldSource;
    action: LifeGraphAuditAction;
    reason: string;
    taskId?: number | null;
    messageId?: string | null;
    confidence?: number | null;
  }): Promise<void> {
    try {
      await this.auditLogs.save(
        this.auditLogs.create({
          userId: input.userId,
          fieldKey: input.fieldKey,
          category: input.category,
          oldValue: input.oldValue,
          newValue: input.newValue,
          source: input.source,
          confidence: input.confidence ?? null,
          action: input.action,
          reason: input.reason,
          taskId: input.taskId ?? null,
          messageId: input.messageId ?? null,
        }),
      );
    } catch (error) {
      this.logEvent(
        'life_graph.audit_write_failed',
        {
          userId: input.userId,
          category: input.category,
          fieldKey: input.fieldKey,
          action: input.action,
          source: input.source,
          requestId: input.messageId ?? undefined,
        },
        'error',
      );
      throw error;
    }
  }

  private logEvent(
    event: string,
    data: {
      userId: number;
      category?: LifeGraphFieldCategory;
      fieldKey?: string;
      action: LifeGraphAuditAction;
      source: LifeGraphFieldSource;
      requestId?: string;
    },
    level: 'debug' | 'error' = 'debug',
  ): void {
    const payload = JSON.stringify({
      event,
      userId: data.userId,
      category: data.category,
      fieldKey: data.fieldKey,
      action: data.action,
      source: data.source,
      requestId: data.requestId,
    });
    if (level === 'error') this.logger.error(payload);
    else this.logger.debug(payload);
  }

  private toProfileDto(profile: LifeGraphProfile): LifeGraphProfileDto {
    return {
      id: profile.id,
      userId: profile.userId,
      completenessScore: profile.completenessScore,
      currentSocialGoal: profile.currentSocialGoal,
      aiSummary: profile.aiSummary,
      preferredLanguage: profile.preferredLanguage,
      country: profile.country,
      region: profile.region,
      city: profile.city,
      timezone: profile.timezone,
      lastUpdatedAt: profile.lastUpdatedAt?.toISOString() ?? null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private toFieldDto(field: LifeGraphField): LifeGraphFieldDto {
    const signalMetadata = this.resolveStoredSignalMetadata(field);
    return {
      id: field.id,
      userId: field.userId,
      category: field.category,
      fieldKey: field.fieldKey,
      fieldValue: field.fieldValue,
      source: field.source,
      confidence: field.confidence,
      confirmedByUser: field.confirmedByUser,
      editable: field.editable,
      revoked: field.revoked,
      revokedAt: field.revokedAt?.toISOString() ?? null,
      lastInferredAt: field.lastInferredAt?.toISOString() ?? null,
      signalType: signalMetadata.signalType,
      visibleInRecommendationReason:
        signalMetadata.visibleInRecommendationReason,
      userCanDisableForMatching: signalMetadata.userCanDisableForMatching,
      enabledForMatching: signalMetadata.enabledForMatching,
      createdAt: field.createdAt.toISOString(),
      updatedAt: field.updatedAt.toISOString(),
    };
  }

  private effectiveFieldConfidence(field: LifeGraphField): number {
    const sourceWeight =
      field.source === LifeGraphFieldSource.Manual
        ? 1
        : field.confirmedByUser
          ? 0.92
          : field.source === LifeGraphFieldSource.AiInferred
            ? 0.45
            : 0.75;
    return (
      Math.round(
        Math.max(0, Math.min(1, field.confidence * sourceWeight)) * 100,
      ) / 100
    );
  }

  private async findProposalForUser(
    userId: number,
    proposalId: number,
  ): Promise<LifeGraphProposal> {
    const proposal = await this.proposals.findOne({
      where: { id: proposalId, userId },
    });
    if (!proposal) throw new NotFoundException('Life Graph 提案不存在');
    return proposal;
  }

  private proposalFields(proposal: LifeGraphProposal): StoredProposalField[] {
    return Array.isArray(proposal.proposedFields)
      ? proposal.proposedFields.filter((item): item is StoredProposalField =>
          this.isProposalField(item),
        )
      : [];
  }

  private isProposalField(value: unknown): value is StoredProposalField {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const item = value as Record<string, unknown>;
    return (
      typeof item.proposalFieldId === 'string' &&
      Object.values(LifeGraphFieldCategory).includes(
        item.category as LifeGraphFieldCategory,
      ) &&
      typeof item.fieldKey === 'string'
    );
  }

  private async findFieldIncludingRevoked(
    userId: number,
    category: LifeGraphFieldCategory,
    fieldKey: string,
  ): Promise<LifeGraphField | null> {
    return this.fields.findOne({ where: { userId, category, fieldKey } });
  }

  private toProposalDto(proposal: LifeGraphProposal): LifeGraphProposalDto {
    return {
      proposalId: proposal.id,
      userId: proposal.userId,
      taskId: proposal.taskId,
      messageId: proposal.messageId,
      proposedFields: this.proposalFields(proposal),
      status: proposal.status,
      aiSummary: proposal.aiSummary,
      missingFields: Array.isArray(proposal.missingFields)
        ? (proposal.missingFields as unknown as LifeGraphMissingFieldDto[])
        : [],
      confirmationRequired: proposal.confirmationRequired,
      createdAt: proposal.createdAt.toISOString(),
      confirmedAt: proposal.confirmedAt?.toISOString() ?? null,
      rejectedAt: proposal.rejectedAt?.toISOString() ?? null,
    };
  }
}

function imported(
  category: LifeGraphFieldCategory,
  fieldKey: string,
  fieldValue: unknown,
): ImportCandidate {
  return {
    category,
    fieldKey,
    fieldValue,
    source: LifeGraphFieldSource.ImportedFromSocialProfile,
    confidence: 0.82,
    confirmedByUser: true,
  } as ImportCandidate & { source: LifeGraphFieldSource };
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value))
    return value.some((item) => hasMeaningfulValue(item));
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}
