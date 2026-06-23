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
  LifeGraphAuditLogDto,
  CorrectLifeGraphDto,
  LifeGraphDynamicSignalsDto,
  LifeGraphBehaviorEventDto,
  LifeGraphCorrectionDto,
  LifeGraphProposalDto,
  LifeGraphProposedFieldDto,
  LifeGraphFieldDto,
  LifeGraphMatchSignalsDto,
  LifeGraphMissingFieldDto,
  LifeGraphProfileDto,
  LifeGraphPreferenceHistoryItemDto,
  LifeGraphUnifiedMatchSignalsDto,
  LifeGraphSignalScoreDto,
  LifeGraphUpdateAuditDto,
  ConfirmLifeGraphUpdateDto,
  ExtractLifeGraphFromChatDto,
  RejectLifeGraphUpdateDto,
  RecordLifeGraphBehaviorEventDto,
  RevokeLifeGraphFieldDto,
  LifeGraphResponseDto,
  UpdateLifeGraphDto,
  UpdateLifeGraphFieldDto,
  LifeGraphExportDto,
} from './dto/life-graph.dto';
import { LifeGraphAuditLog } from './entities/life-graph-audit-log.entity';
import { LifeGraphBehaviorEvent } from './entities/life-graph-behavior-event.entity';
import { LifeGraphCorrection } from './entities/life-graph-correction.entity';
import { LifeGraphField } from './entities/life-graph-field.entity';
import { LifeGraphProfile } from './entities/life-graph-profile.entity';
import { LifeGraphProposal } from './entities/life-graph-proposal.entity';
import { LifeGraphSignalScore } from './entities/life-graph-signal-score.entity';
import { LifeGraphUpdateAudit } from './entities/life-graph-update-audit.entity';
import { LifeGraphExtractionService } from './life-graph-extraction.service';
import {
  LifeGraphAuditAction,
  LifeGraphBehaviorEventType,
  LifeGraphCorrectionType,
  LifeGraphDataTier,
  LifeGraphFieldCategory,
  LifeGraphProposalStatus,
  LifeGraphFieldSource,
  LifeGraphSignalKey,
  LifeGraphSignalType,
  LifeGraphUpdateAuditStatus,
} from './life-graph.enums';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import {
  classifyLifeGraphField,
  redactLifeGraphValueForTier,
  shouldExposeInMatching,
} from './life-graph-privacy.util';
import { redactSensitiveValue } from '../common/privacy-redaction.util';
import { LifeGraphComplianceService } from './life-graph-compliance.service';

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

type BehaviorSignalSnapshot = {
  recentEventCount: number;
  completed: number;
  cancelled: number;
  noShow: number;
  positiveFeedback: number;
  negativeFeedback: number;
  nightDeclines: number;
  privatePlaceDeclines: number;
  preciseLocationDeclines: number;
  scoreByKey: Map<LifeGraphSignalKey, LifeGraphSignalScore>;
  feedbackPatterns: string[];
};

type SignalScoreDraft = {
  signalKey: LifeGraphSignalKey;
  score: number;
  confidence: number;
  explanation: string;
  evidence: Record<string, unknown>;
  enabledForMatching?: boolean;
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
    @Optional()
    @InjectRepository(LifeGraphBehaviorEvent)
    private readonly behaviorEvents?: Repository<LifeGraphBehaviorEvent>,
    @Optional()
    @InjectRepository(LifeGraphSignalScore)
    private readonly signalScores?: Repository<LifeGraphSignalScore>,
    @Optional()
    @InjectRepository(LifeGraphUpdateAudit)
    private readonly updateAudits?: Repository<LifeGraphUpdateAudit>,
    @Optional()
    @InjectRepository(LifeGraphCorrection)
    private readonly corrections?: Repository<LifeGraphCorrection>,
    @Optional()
    private readonly compliance?: LifeGraphComplianceService,
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
    void this.auditSensitiveFieldAccess({
      userId,
      action: 'read_profile',
      purpose: 'user_life_graph_page',
      route: 'GET /life-graph/me',
      fields,
    });
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
    void this.auditSensitiveFieldAccess({
      userId,
      action: 'read_match_signals',
      purpose: 'matching_context',
      route: 'GET /life-graph/match-signals',
      fields,
    });
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
    const preferenceHistory = await this.buildPreferenceHistory(userId, fields);

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
      preferenceHistory,
      missingCriticalFields,
    };
    this.logEvent('life_graph.match_signals_generated', {
      userId,
      action: LifeGraphAuditAction.Updated,
      source: LifeGraphFieldSource.SystemGenerated,
    });
    return signals;
  }

  async recordBehaviorEvent(
    userId: number,
    input: RecordLifeGraphBehaviorEventDto,
  ): Promise<LifeGraphBehaviorEventDto> {
    await this.ensureLifeGraph(userId);
    if (!this.behaviorEvents) {
      throw new BadRequestException(
        'Life Graph behavior events are unavailable',
      );
    }

    const event = await this.behaviorEvents.save(
      this.behaviorEvents.create({
        userId,
        eventType: input.eventType,
        source: input.source ?? 'fitmeet_agent',
        taskId: input.taskId ?? null,
        activityId: input.activityId ?? null,
        candidateUserId: input.candidateUserId ?? null,
        metadata: input.metadata ?? {},
        naturalSummary:
          input.naturalSummary ??
          this.naturalEventSummary(input.eventType, input.metadata ?? {}),
        weight: Math.max(0, Math.min(3, input.weight ?? 1)),
      }),
    );

    await this.recalculateSignalScores(userId, event.id);
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:updated',
      payload: {
        eventType: event.eventType,
        summary: event.naturalSummary,
      },
    });
    return this.toBehaviorEventDto(event);
  }

  async getBehaviorEvents(
    userId: number,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<LifeGraphBehaviorEventDto[]> {
    if (!this.behaviorEvents) return [];
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const cursorDate = options.cursor ? new Date(options.cursor) : null;
    const events = await this.behaviorEvents.find({
      where:
        cursorDate && !Number.isNaN(cursorDate.getTime())
          ? { userId, createdAt: LessThan(cursorDate) }
          : { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return events.map((event) => this.toBehaviorEventDto(event));
  }

  async getSignalScores(userId: number): Promise<LifeGraphSignalScoreDto[]> {
    if (!this.signalScores) return [];
    await this.recalculateSignalScores(userId);
    const scores = await this.signalScores.find({
      where: { userId },
      order: { signalKey: 'ASC' },
    });
    return scores.map((score) => this.toSignalScoreDto(score));
  }

  async getUpdateAudits(
    userId: number,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<LifeGraphUpdateAuditDto[]> {
    if (!this.updateAudits) return [];
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const cursorDate = options.cursor ? new Date(options.cursor) : null;
    const audits = await this.updateAudits.find({
      where:
        cursorDate && !Number.isNaN(cursorDate.getTime())
          ? { userId, createdAt: LessThan(cursorDate) }
          : { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return audits.map((audit) => this.toUpdateAuditDto(audit));
  }

  async correctLifeGraph(
    userId: number,
    input: CorrectLifeGraphDto,
  ): Promise<LifeGraphCorrectionDto> {
    await this.ensureLifeGraph(userId);
    if (!this.corrections) {
      throw new BadRequestException('Life Graph corrections are unavailable');
    }

    const previousValue = await this.readCorrectionTarget(userId, input);
    const correctedValue = input.correctedValue ?? {};
    const correction = await this.corrections.save(
      this.corrections.create({
        userId,
        correctionType: input.correctionType,
        signalKey: input.signalKey ?? null,
        category: input.category ?? null,
        fieldKey: input.fieldKey ?? null,
        note: input.note,
        previousValue,
        correctedValue,
        applied: true,
      }),
    );

    await this.applyCorrection(userId, input, correction.id, previousValue);
    return this.toCorrectionDto(correction);
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
    const behavior = await this.loadBehaviorSignalSnapshot(userId);
    const scoreValue = (key: LifeGraphSignalKey): number | null => {
      const score = behavior.scoreByKey.get(key);
      if (!score || score.enabledForMatching === false) return null;
      return score.score;
    };
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
    const completedWithBehavior = completed + behavior.completed;
    const cancelledWithBehavior =
      cancelled + behavior.cancelled + behavior.noShow;
    const recentActivityScore = scoreValue(LifeGraphSignalKey.RecentActivity);
    const sportsAffinityScore = scoreValue(LifeGraphSignalKey.SportsAffinity);
    const socialOpennessScore = scoreValue(LifeGraphSignalKey.SocialOpenness);
    const lowPressureScore = scoreValue(
      LifeGraphSignalKey.LowPressurePreference,
    );
    const safetyClarityScore = scoreValue(
      LifeGraphSignalKey.SafetyBoundaryClarity,
    );
    const reliabilityScore = scoreValue(LifeGraphSignalKey.Reliability);
    const nightBoundaryScore = scoreValue(LifeGraphSignalKey.NightBoundary);
    const sameSchoolScore = scoreValue(LifeGraphSignalKey.SameSchoolPreference);
    const sameCityScore = scoreValue(LifeGraphSignalKey.SameCityPreference);
    const commonInterestScore = scoreValue(
      LifeGraphSignalKey.CommonInterestPreference,
    );

    const recentActivityCount =
      recentLogs.filter((log) => {
        const createdAt = new Date(log.createdAt);
        return Date.now() - createdAt.getTime() < 30 * 24 * 60 * 60 * 1000;
      }).length + behavior.recentEventCount;
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

    const finalReliability =
      reliabilityScore !== null
        ? this.clampScore(reliabilityScore)
        : completedWithBehavior + cancelledWithBehavior > 0
          ? this.clampScore(
              55 + completedWithBehavior * 10 - cancelledWithBehavior * 14,
            )
          : reliability;
    const finalActivityLevel =
      recentActivityScore !== null
        ? recentActivityScore >= 70
          ? 'active'
          : recentActivityScore <= 40
            ? 'quiet'
            : activityLevel
        : activityLevel;
    const finalSocialEnergy =
      (sportsAffinityScore ?? 0) >= 70 && (socialOpennessScore ?? 0) >= 70
        ? 'balanced'
        : (sportsAffinityScore ?? 0) >= 70
          ? 'sports'
          : (socialOpennessScore ?? 0) >= 70
            ? 'social'
            : socialEnergy;
    const finalCompletionTrend =
      completedWithBehavior === 0 && cancelledWithBehavior === 0
        ? completionTrend
        : finalReliability >= 72
          ? 'reliable'
          : finalReliability >= 48
            ? 'mixed'
            : 'fragile';
    const finalCancellationPattern =
      cancelledWithBehavior === 0 && completedWithBehavior > 0
        ? 'rare'
        : cancelledWithBehavior >= 3
          ? 'frequent'
          : cancelledWithBehavior > 0
            ? 'occasional'
            : cancellationPattern;
    const finalPressurePreference =
      (lowPressureScore ?? 0) >= 65 ? 'low' : pressurePreference;
    const finalNightBoundary =
      (nightBoundaryScore ?? 0) >= 70 || behavior.nightDeclines > 0
        ? 'avoids_late_private'
        : nightBoundary;
    const finalLocationPreference =
      (sameSchoolScore ?? 0) >= 70
        ? 'same_school_or_area'
        : (sameCityScore ?? 0) >= 70
          ? 'same_city'
          : (commonInterestScore ?? 0) >= 70
            ? 'interest_first'
            : locationPreference;

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
    const finalInsights = [
      ...this.behaviorSignalInsights({
        activityLevel: finalActivityLevel,
        socialEnergy: finalSocialEnergy,
        completionTrend: finalCompletionTrend,
        cancellationPattern: finalCancellationPattern,
        nightBoundary: finalNightBoundary,
        locationPreference: finalLocationPreference,
      }),
      ...insights,
    ].slice(0, 5);
    const summary = `我对你的了解：${finalInsights.slice(0, 4).join('')}`;
    const recommendationWeights = {
      sameSchoolOrArea: this.clampScore(sameSchoolScore ?? 45),
      sameCity: this.clampScore(sameCityScore ?? 45),
      commonInterest: this.clampScore(commonInterestScore ?? 50),
      lowPressure: this.clampScore(
        lowPressureScore ?? (finalPressurePreference === 'low' ? 82 : 45),
      ),
      sports: this.clampScore(
        sportsAffinityScore ?? (finalSocialEnergy === 'sports' ? 82 : 45),
      ),
      reliability: finalReliability,
      recency: this.clampScore(
        recentActivityScore ?? 35 + recentActivityCount * 8,
      ),
      safetyBoundary: this.clampScore(
        safetyClarityScore ??
          (finalNightBoundary === 'avoids_late_private' || publicBoundary
            ? 86
            : 42),
      ),
    };
    const matchingGuidance = {
      shouldPreferSameSchoolOrArea:
        finalLocationPreference === 'same_school_or_area',
      shouldPreferSameCity: finalLocationPreference === 'same_city',
      shouldPreferCommonInterest: finalLocationPreference === 'interest_first',
      shouldPreferLowPressure: finalPressurePreference === 'low',
      shouldPreferSports:
        finalSocialEnergy === 'sports' || finalSocialEnergy === 'balanced',
      shouldAvoidNight: finalNightBoundary === 'avoids_late_private',
      shouldUsePublicPlace:
        publicBoundary || finalNightBoundary === 'avoids_late_private',
      shouldReduceDisturbance: finalActivityLevel === 'quiet',
      suggestedFilters: this.uniqueStrings([
        finalLocationPreference === 'same_school_or_area' ? '只看同校' : '',
        finalLocationPreference === 'same_city' ? '只看同城' : '',
        finalPressurePreference === 'low' ? '只看低压力' : '',
        finalNightBoundary === 'avoids_late_private' ? '不要晚上' : '',
        finalSocialEnergy === 'sports' ? '换成散步或慢跑' : '',
      ]),
      rankingNotes: finalInsights.slice(0, 4),
    };
    return {
      activityLevel: finalActivityLevel,
      socialEnergy: finalSocialEnergy,
      completionTrend: finalCompletionTrend,
      cancellationPattern: finalCancellationPattern,
      pressurePreference: finalPressurePreference,
      nightBoundary: finalNightBoundary,
      locationPreference: finalLocationPreference,
      feedbackPattern: [
        ...behavior.feedbackPatterns,
        ...this.feedbackPatterns(value, socialText),
      ].slice(0, 4),
      scores: {
        rhythmConfidence: this.clampScore(
          recentActivityScore ?? 35 + recentActivityCount * 8,
        ),
        sportsAffinity: this.clampScore(
          sportsAffinityScore ?? (sportsKeywords ? 82 : 42),
        ),
        lowPressureFit: this.clampScore(
          lowPressureScore ?? (lowPressure ? 86 : publicBoundary ? 70 : 45),
        ),
        safetyBoundaryClarity: this.clampScore(
          safetyClarityScore ??
            (publicBoundary || avoidsNight ? 86 : safetyText ? 64 : 35),
        ),
        reliability: finalReliability,
      },
      recommendationWeights,
      matchingGuidance,
      summary,
      insights: finalInsights,
    };
  }

  private async buildPreferenceHistory(
    userId: number,
    fields: LifeGraphField[],
  ): Promise<Record<string, LifeGraphPreferenceHistoryItemDto[]>> {
    const activeKeys = new Set(
      fields.map((field) => `${field.category}.${field.fieldKey}`),
    );
    if (activeKeys.size === 0) return {};
    const logs = await this.auditLogs.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 120,
    });
    const history: Record<string, LifeGraphPreferenceHistoryItemDto[]> = {};
    for (const log of logs) {
      const key = `${log.category}.${log.fieldKey}`;
      if (!activeKeys.has(key)) continue;
      const entries = history[key] ?? [];
      if (entries.length >= 6) continue;
      entries.push({
        category: log.category,
        fieldKey: log.fieldKey,
        oldValue: log.oldValue,
        newValue: log.newValue,
        source: log.source,
        confidence: log.confidence,
        action: log.action,
        reason: log.reason,
        taskId: log.taskId,
        messageId: log.messageId,
        confirmedByUser:
          log.action === LifeGraphAuditAction.Confirmed ||
          log.source === LifeGraphFieldSource.Manual,
        createdAt: log.createdAt?.toISOString?.() ?? new Date().toISOString(),
      });
      history[key] = entries;
    }
    return history;
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

  private uniqueStrings(values: string[]): string[] {
    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private async loadBehaviorSignalSnapshot(
    userId: number,
  ): Promise<BehaviorSignalSnapshot> {
    const empty: BehaviorSignalSnapshot = {
      recentEventCount: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      positiveFeedback: 0,
      negativeFeedback: 0,
      nightDeclines: 0,
      privatePlaceDeclines: 0,
      preciseLocationDeclines: 0,
      scoreByKey: new Map<LifeGraphSignalKey, LifeGraphSignalScore>(),
      feedbackPatterns: [],
    };
    const [events, scores] = await Promise.all([
      this.behaviorEvents
        ? this.behaviorEvents.find({
            where: { userId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 120,
          })
        : Promise.resolve([]),
      this.signalScores
        ? this.signalScores.find({ where: { userId } })
        : Promise.resolve([]),
    ]);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    for (const event of events) {
      if (nowMs - event.createdAt.getTime() <= thirtyDaysMs) {
        empty.recentEventCount += 1;
      }
      if (event.eventType === LifeGraphBehaviorEventType.ActivityCompleted) {
        empty.completed += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.ActivityCancelled
      ) {
        empty.cancelled += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.ActivityNoShow
      ) {
        empty.noShow += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.CandidateLiked ||
        event.eventType === LifeGraphBehaviorEventType.ActivityReviewedPositive
      ) {
        empty.positiveFeedback += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.CandidateDisliked ||
        event.eventType === LifeGraphBehaviorEventType.ActivityReviewedNegative
      ) {
        empty.negativeFeedback += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.NightMeetDeclined
      ) {
        empty.nightDeclines += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.PrivatePlaceDeclined
      ) {
        empty.privatePlaceDeclines += 1;
      } else if (
        event.eventType === LifeGraphBehaviorEventType.PreciseLocationDeclined
      ) {
        empty.preciseLocationDeclines += 1;
      }
      const pattern = this.feedbackPatternFromEvent(event);
      if (pattern) empty.feedbackPatterns.push(pattern);
    }
    for (const score of scores) empty.scoreByKey.set(score.signalKey, score);
    empty.feedbackPatterns = Array.from(new Set(empty.feedbackPatterns)).slice(
      0,
      4,
    );
    return empty;
  }

  private behaviorSignalInsights(input: {
    activityLevel: LifeGraphDynamicSignalsDto['activityLevel'];
    socialEnergy: LifeGraphDynamicSignalsDto['socialEnergy'];
    completionTrend: LifeGraphDynamicSignalsDto['completionTrend'];
    cancellationPattern: LifeGraphDynamicSignalsDto['cancellationPattern'];
    nightBoundary: LifeGraphDynamicSignalsDto['nightBoundary'];
    locationPreference: LifeGraphDynamicSignalsDto['locationPreference'];
  }): string[] {
    const insights: string[] = [];
    if (input.activityLevel === 'active') {
      insights.push(
        '你最近对推荐和活动的反馈更活跃，我会适当提高及时机会的权重。',
      );
    } else if (input.activityLevel === 'quiet') {
      insights.push('你最近互动偏少，我会减少打扰，优先给少量但更准的推荐。');
    }
    if (input.socialEnergy === 'sports') {
      insights.push('你最近更适合从跑步、散步或轻运动开始认识人。');
    } else if (input.socialEnergy === 'social') {
      insights.push('你最近更适合轻松聊天和低压力认识新朋友。');
    }
    if (input.completionTrend === 'reliable') {
      insights.push('你的约练完成趋势不错，守时和同区域搭子的权重会更高。');
    } else if (
      input.completionTrend === 'fragile' ||
      input.cancellationPattern === 'frequent'
    ) {
      insights.push('你最近更适合可改期、低压力、时间更宽松的安排。');
    }
    if (input.nightBoundary === 'avoids_late_private') {
      insights.push('你对深夜或私人场所有清晰边界，首次见面会优先公共场所。');
    }
    if (input.locationPreference === 'same_school_or_area') {
      insights.push('你更容易接受同校或活动区域接近的人。');
    }
    return insights;
  }

  private async recalculateSignalScores(
    userId: number,
    eventId: number | null = null,
  ): Promise<void> {
    if (!this.behaviorEvents || !this.signalScores) return;
    const events = await this.behaviorEvents.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 120,
    });
    const existing = await this.signalScores.find({ where: { userId } });
    const existingByKey = new Map(
      existing.map((score) => [score.signalKey, score]),
    );
    const drafts = this.deriveSignalScoreDrafts(events);
    const before = Object.fromEntries(
      existing.map((score) => [score.signalKey, score.score]),
    );
    const after: Record<string, number> = {};

    for (const draft of drafts) {
      const current =
        existingByKey.get(draft.signalKey) ??
        this.signalScores.create({ userId, signalKey: draft.signalKey });
      current.score = this.clampScore(draft.score);
      current.confidence = Math.max(0, Math.min(1, draft.confidence));
      current.source = 'rules_v1';
      current.explanation = draft.explanation;
      current.evidence = draft.evidence;
      current.enabledForMatching =
        current.enabledForMatching === false
          ? false
          : (draft.enabledForMatching ?? true);
      current.correctionCount = current.correctionCount ?? 0;
      current.lastCalculatedAt = new Date();
      const saved = await this.signalScores.save(current);
      after[saved.signalKey] = saved.score;
    }

    await this.writeUpdateAudit({
      userId,
      updateType: 'signal_scores_recalculated',
      source: 'rules_v1',
      before,
      after,
      userFacingSummary:
        '我根据你最近的行为反馈，更新了生活节奏和推荐偏好判断。',
      eventId,
    });
  }

  private deriveSignalScoreDrafts(
    events: LifeGraphBehaviorEvent[],
  ): SignalScoreDraft[] {
    const count = (type: LifeGraphBehaviorEventType) =>
      events.filter((event) => event.eventType === type).length;
    const hasText = (pattern: RegExp) =>
      events.some((event) =>
        pattern.test(
          `${event.naturalSummary} ${this.signalText(event.metadata)}`,
        ),
      );
    const completed = count(LifeGraphBehaviorEventType.ActivityCompleted);
    const cancelled = count(LifeGraphBehaviorEventType.ActivityCancelled);
    const noShow = count(LifeGraphBehaviorEventType.ActivityNoShow);
    const liked = count(LifeGraphBehaviorEventType.CandidateLiked);
    const disliked = count(LifeGraphBehaviorEventType.CandidateDisliked);
    const positive = count(LifeGraphBehaviorEventType.ActivityReviewedPositive);
    const negative = count(LifeGraphBehaviorEventType.ActivityReviewedNegative);
    const activeEvents = events.filter((event) => {
      const ageMs = Date.now() - event.createdAt.getTime();
      return ageMs <= 30 * 24 * 60 * 60 * 1000;
    }).length;
    const sportsEvidence = hasText(
      /跑步|慢跑|散步|运动|健身|训练|球|骑行|游泳/i,
    );
    const lowPressureEvidence = hasText(/低压力|轻松|慢热|先聊|散步|慢跑/i);
    const sameSchoolEvidence = hasText(/同校|学校|大学|校园|青岛大学/i);
    const sameCityEvidence = hasText(/同城|附近|青岛|城市/i);
    const commonInterestEvidence = hasText(/同兴趣|共同兴趣|都喜欢|也喜欢/i);
    const nightDeclines = count(LifeGraphBehaviorEventType.NightMeetDeclined);
    const privateDeclines = count(
      LifeGraphBehaviorEventType.PrivatePlaceDeclined,
    );
    const locationDeclines = count(
      LifeGraphBehaviorEventType.PreciseLocationDeclined,
    );

    return [
      {
        signalKey: LifeGraphSignalKey.RecentActivity,
        score: 30 + activeEvents * 8,
        confidence: activeEvents > 0 ? 0.75 : 0.35,
        explanation:
          activeEvents > 0
            ? '你最近有真实互动记录，可以更及时地推荐机会。'
            : '近期行为样本还少，我会先保守推荐。',
        evidence: { activeEvents },
      },
      {
        signalKey: LifeGraphSignalKey.Reliability,
        score:
          completed + cancelled + noShow > 0
            ? 62 + completed * 14 - cancelled * 18 - noShow * 25
            : 50,
        confidence: completed + cancelled + noShow > 0 ? 0.78 : 0.3,
        explanation: '根据约练完成、取消和爽约记录估算履约稳定度。',
        evidence: { completed, cancelled, noShow },
      },
      {
        signalKey: LifeGraphSignalKey.CancellationRisk,
        score: cancelled * 25 + noShow * 35,
        confidence: cancelled + noShow > 0 ? 0.72 : 0.35,
        explanation:
          cancelled + noShow > 0
            ? '你最近有取消或未完成记录，需要更宽松的活动安排。'
            : '目前没有明显取消风险。',
        evidence: { cancelled, noShow },
      },
      {
        signalKey: LifeGraphSignalKey.SportsAffinity,
        score: sportsEvidence ? 82 : 42,
        confidence: sportsEvidence ? 0.75 : 0.35,
        explanation: sportsEvidence
          ? '你的近期行为更偏运动型社交。'
          : '还没有足够行为证明你最近偏运动。',
        evidence: { sportsEvidence },
      },
      {
        signalKey: LifeGraphSignalKey.SocialOpenness,
        score: 45 + (liked + positive) * 12 - (disliked + negative) * 10,
        confidence: liked + positive + disliked + negative > 0 ? 0.72 : 0.35,
        explanation: '根据候选反馈和活动评价估算近期社交开放度。',
        evidence: { liked, positive, disliked, negative },
      },
      {
        signalKey: LifeGraphSignalKey.LowPressurePreference,
        score: lowPressureEvidence ? 84 : 46,
        confidence: lowPressureEvidence ? 0.76 : 0.35,
        explanation: lowPressureEvidence
          ? '你最近更适合低压力、轻松开始的社交。'
          : '低压力偏好还需要更多反馈确认。',
        evidence: { lowPressureEvidence },
      },
      {
        signalKey: LifeGraphSignalKey.SafetyBoundaryClarity,
        score: nightDeclines + privateDeclines + locationDeclines > 0 ? 88 : 50,
        confidence:
          nightDeclines + privateDeclines + locationDeclines > 0 ? 0.82 : 0.35,
        explanation:
          nightDeclines + privateDeclines + locationDeclines > 0
            ? '你的线下安全边界比较清晰，推荐会优先公共场所。'
            : '首次见面安全边界还需要继续确认。',
        evidence: { nightDeclines, privateDeclines, locationDeclines },
      },
      {
        signalKey: LifeGraphSignalKey.NightBoundary,
        score: nightDeclines > 0 ? 86 : 40,
        confidence: nightDeclines > 0 ? 0.8 : 0.35,
        explanation:
          nightDeclines > 0
            ? '你经常拒绝深夜活动，我会降低晚间见面推荐。'
            : '还没有稳定的深夜活动偏好记录。',
        evidence: { nightDeclines },
      },
      {
        signalKey: LifeGraphSignalKey.SameSchoolPreference,
        score: sameSchoolEvidence ? 82 : 42,
        confidence: sameSchoolEvidence ? 0.74 : 0.35,
        explanation: sameSchoolEvidence
          ? '你对同校或校园附近的人反馈更好。'
          : '同校偏好还不明显。',
        evidence: { sameSchoolEvidence },
      },
      {
        signalKey: LifeGraphSignalKey.SameCityPreference,
        score: sameCityEvidence ? 74 : 45,
        confidence: sameCityEvidence ? 0.68 : 0.35,
        explanation: sameCityEvidence
          ? '你对同城或附近活动区域更敏感。'
          : '同城偏好还不明显。',
        evidence: { sameCityEvidence },
      },
      {
        signalKey: LifeGraphSignalKey.CommonInterestPreference,
        score: commonInterestEvidence ? 76 : 48,
        confidence: commonInterestEvidence ? 0.68 : 0.35,
        explanation: commonInterestEvidence
          ? '共同兴趣对你最近的推荐解释更重要。'
          : '共同兴趣权重暂时保持中等。',
        evidence: { commonInterestEvidence },
      },
    ];
  }

  private feedbackPatternFromEvent(
    event: LifeGraphBehaviorEvent,
  ): string | null {
    const text = `${event.naturalSummary} ${this.signalText(event.metadata)}`;
    if (/低压力|轻松|慢热|先聊|散步|慢跑/.test(text))
      return '更喜欢低压力、轻松开始的社交';
    if (/跑步|慢跑|散步|运动/.test(text)) return '更偏运动型社交';
    if (/同校|学校|大学|校园|青岛大学/.test(text))
      return '对同校或校园附近的人反馈更好';
    if (/公共|公园|操场|不共享精确位置/.test(text))
      return '更重视公共场所和位置边界';
    return null;
  }

  private async readCorrectionTarget(
    userId: number,
    input: CorrectLifeGraphDto,
  ): Promise<Record<string, unknown>> {
    if (input.signalKey && this.signalScores) {
      const score = await this.signalScores.findOne({
        where: { userId, signalKey: input.signalKey },
      });
      return score
        ? {
            signalKey: score.signalKey,
            score: score.score,
            confidence: score.confidence,
            enabledForMatching: score.enabledForMatching,
          }
        : {};
    }
    if (input.category && input.fieldKey) {
      const field = await this.fields.findOne({
        where: { userId, category: input.category, fieldKey: input.fieldKey },
      });
      return field
        ? {
            category: field.category,
            fieldKey: field.fieldKey,
            fieldValue: field.fieldValue,
            revoked: field.revoked,
            enabledForMatching: field.enabledForMatching,
          }
        : {};
    }
    return {};
  }

  private async applyCorrection(
    userId: number,
    input: CorrectLifeGraphDto,
    correctionId: number,
    previousValue: Record<string, unknown>,
  ): Promise<void> {
    const correctedValue = input.correctedValue ?? {};
    if (input.signalKey && this.signalScores) {
      const score = await this.signalScores.findOne({
        where: { userId, signalKey: input.signalKey },
      });
      if (score) {
        if (input.correctionType === LifeGraphCorrectionType.NotTrue) {
          score.enabledForMatching = false;
          score.confidence = Math.min(score.confidence, 0.35);
        } else if (
          input.correctionType === LifeGraphCorrectionType.PreferMore
        ) {
          score.score = this.clampScore(score.score + 12);
          score.confidence = Math.max(score.confidence, 0.75);
        } else if (
          input.correctionType === LifeGraphCorrectionType.PreferLess
        ) {
          score.score = this.clampScore(score.score - 12);
          score.confidence = Math.max(score.confidence, 0.75);
        }
        score.correctionCount = (score.correctionCount ?? 0) + 1;
        score.explanation = input.note;
        await this.signalScores.save(score);
      }
    }

    if (
      input.category &&
      input.fieldKey &&
      Object.prototype.hasOwnProperty.call(correctedValue, 'fieldValue')
    ) {
      await this.upsertField(
        userId,
        {
          category: input.category,
          fieldKey: input.fieldKey,
          fieldValue: correctedValue.fieldValue,
          confirmedByUser: true,
          reason: input.note,
        },
        {
          source: LifeGraphFieldSource.Manual,
          confidence: 1,
          action: LifeGraphAuditAction.Updated,
          reason: input.note || 'user_corrected_life_graph',
          confirmedByUser: true,
          allowManualOverride: true,
        },
      );
    } else if (
      input.category &&
      input.fieldKey &&
      input.correctionType === LifeGraphCorrectionType.NotTrue
    ) {
      const field = await this.fields.findOne({
        where: {
          userId,
          category: input.category,
          fieldKey: input.fieldKey,
          revoked: false,
        },
      });
      if (field) {
        field.revoked = true;
        field.revokedAt = new Date();
        await this.fields.save(field);
      }
    }

    await this.writeUpdateAudit({
      userId,
      updateType: 'user_correction',
      source: 'user',
      status: LifeGraphUpdateAuditStatus.Corrected,
      before: previousValue,
      after: correctedValue,
      userFacingSummary: input.note,
      correctionId,
    });
  }

  private naturalEventSummary(
    eventType: LifeGraphBehaviorEventType,
    metadata: Record<string, unknown>,
  ): string {
    const activity = cleanDisplayText(metadata.activityType, '');
    if (eventType === LifeGraphBehaviorEventType.ActivityCompleted) {
      return activity
        ? `你完成了一次${activity}活动。`
        : '你完成了一次线下活动。';
    }
    if (eventType === LifeGraphBehaviorEventType.ActivityCancelled) {
      return '你取消了一次活动，我会优先考虑更宽松的时间安排。';
    }
    if (eventType === LifeGraphBehaviorEventType.CandidateLiked) {
      return '你对一个候选人给出了正向反馈。';
    }
    if (eventType === LifeGraphBehaviorEventType.CandidateDisliked) {
      return '你不喜欢这次推荐，我会降低类似推荐权重。';
    }
    if (eventType === LifeGraphBehaviorEventType.NightMeetDeclined) {
      return '你拒绝了深夜见面，我会降低晚间活动推荐。';
    }
    if (eventType === LifeGraphBehaviorEventType.PrivatePlaceDeclined) {
      return '你拒绝了私人场所见面，我会优先公共场所。';
    }
    if (eventType === LifeGraphBehaviorEventType.PreciseLocationDeclined) {
      return '你拒绝共享精确位置，我会继续保护位置边界。';
    }
    return '我记录了一条新的生活偏好反馈。';
  }

  private async writeUpdateAudit(input: {
    userId: number;
    updateType: string;
    source: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    userFacingSummary: string;
    status?: LifeGraphUpdateAuditStatus;
    reversible?: boolean;
    eventId?: number | null;
    correctionId?: number | null;
  }): Promise<void> {
    if (!this.updateAudits) return;
    await this.updateAudits.save(
      this.updateAudits.create({
        userId: input.userId,
        updateType: input.updateType,
        source: input.source,
        status: input.status ?? LifeGraphUpdateAuditStatus.Applied,
        before: input.before,
        after: input.after,
        userFacingSummary: input.userFacingSummary,
        reversible: input.reversible ?? true,
        eventId: input.eventId ?? null,
        correctionId: input.correctionId ?? null,
        revokedAt: null,
      }),
    );
  }

  private toBehaviorEventDto(
    event: LifeGraphBehaviorEvent,
  ): LifeGraphBehaviorEventDto {
    return {
      id: event.id,
      userId: event.userId,
      eventType: event.eventType,
      source: event.source,
      taskId: event.taskId,
      activityId: event.activityId,
      candidateUserId: event.candidateUserId,
      metadata: event.metadata,
      naturalSummary: event.naturalSummary,
      weight: event.weight,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private toSignalScoreDto(
    score: LifeGraphSignalScore,
  ): LifeGraphSignalScoreDto {
    return {
      id: score.id,
      userId: score.userId,
      signalKey: score.signalKey,
      score: score.score,
      confidence: score.confidence,
      source: score.source,
      explanation: score.explanation,
      evidence: score.evidence,
      enabledForMatching: score.enabledForMatching,
      correctionCount: score.correctionCount,
      lastCalculatedAt: score.lastCalculatedAt?.toISOString() ?? null,
      createdAt: score.createdAt.toISOString(),
      updatedAt: score.updatedAt.toISOString(),
    };
  }

  private toUpdateAuditDto(
    audit: LifeGraphUpdateAudit,
  ): LifeGraphUpdateAuditDto {
    return {
      id: audit.id,
      userId: audit.userId,
      updateType: audit.updateType,
      source: audit.source,
      status: audit.status,
      before: audit.before,
      after: audit.after,
      userFacingSummary: audit.userFacingSummary,
      reversible: audit.reversible,
      eventId: audit.eventId,
      correctionId: audit.correctionId,
      revokedAt: audit.revokedAt?.toISOString() ?? null,
      createdAt: audit.createdAt.toISOString(),
    };
  }

  private toCorrectionDto(
    correction: LifeGraphCorrection,
  ): LifeGraphCorrectionDto {
    return {
      id: correction.id,
      userId: correction.userId,
      correctionType: correction.correctionType,
      signalKey: correction.signalKey,
      category: correction.category,
      fieldKey: correction.fieldKey,
      note: correction.note,
      previousValue: correction.previousValue,
      correctedValue: correction.correctedValue,
      applied: correction.applied,
      createdAt: correction.createdAt.toISOString(),
    };
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
  ): Promise<LifeGraphAuditLogDto[]> {
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
    return logs.map((log) => this.toAuditLogDto(log, true));
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
      if (
        (field.status === 'conflict' || field.status === 'revoked_conflict') &&
        input.allowConflicts !== true
      ) {
        await this.writeAuditLog({
          userId,
          category: field.category,
          fieldKey: field.fieldKey,
          oldValue: field.oldValue,
          newValue: field.fieldValue,
          source: LifeGraphFieldSource.AiInferred,
          confidence: field.confidence,
          action: LifeGraphAuditAction.ConflictDetected,
          reason: 'conflict_requires_explicit_user_override',
          taskId: proposal.taskId,
          messageId: proposal.messageId,
        });
        nextFields.push(field);
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

  async exportLifeGraph(userId: number): Promise<LifeGraphExportDto> {
    const profile = await this.ensureLifeGraph(userId);
    const fields = await this.findActiveFields(userId);
    void this.auditSensitiveFieldAccess({
      userId,
      action: 'export',
      purpose: 'user_confirmed_export',
      route: 'POST /life-graph/export-requests/:id/confirm',
      fields,
    });
    const auditLogs = await this.auditLogs.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 1000,
    });
    const tiers = Object.values(LifeGraphDataTier).reduce(
      (acc, tier) => {
        acc[tier] = 0;
        return acc;
      },
      {} as Record<LifeGraphDataTier, number>,
    );
    for (const field of fields) {
      tiers[this.classifyStoredField(field)] += 1;
    }
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        ...this.toProfileDto(profile),
        currentSocialGoal: cleanDisplayText(
          redactSensitiveValue(profile.currentSocialGoal),
          '',
        ),
        aiSummary: cleanDisplayText(
          redactSensitiveValue(profile.aiSummary),
          '',
        ),
      },
      fields: this.groupFields(fields, true),
      auditLogs: auditLogs.map((log) => this.toAuditLogDto(log, true)),
      behaviorEvents:
        (
          await this.behaviorEvents?.find({
            where: { userId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 1000,
          })
        )?.map((event) => ({
          ...this.toBehaviorEventDto(event),
          metadata: redactSensitiveValue(event.metadata) as Record<
            string,
            unknown
          >,
          naturalSummary: cleanDisplayText(
            redactSensitiveValue(event.naturalSummary),
            '',
          ),
        })) ?? [],
      signalScores:
        (
          await this.signalScores?.find({
            where: { userId },
            order: { updatedAt: 'DESC', id: 'DESC' },
            take: 1000,
          })
        )?.map((score) => ({
          ...this.toSignalScoreDto(score),
          explanation: cleanDisplayText(
            redactSensitiveValue(score.explanation),
            '',
          ),
          evidence: redactSensitiveValue(score.evidence) as Record<
            string,
            unknown
          >,
        })) ?? [],
      updateAudits:
        (
          await this.updateAudits?.find({
            where: { userId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 1000,
          })
        )?.map((audit) => ({
          ...this.toUpdateAuditDto(audit),
          before: redactSensitiveValue(audit.before) as Record<string, unknown>,
          after: redactSensitiveValue(audit.after) as Record<string, unknown>,
          userFacingSummary: cleanDisplayText(
            redactSensitiveValue(audit.userFacingSummary),
            '',
          ),
        })) ?? [],
      corrections:
        (
          await this.corrections?.find({
            where: { userId },
            order: { createdAt: 'DESC', id: 'DESC' },
            take: 1000,
          })
        )?.map((correction) => ({
          ...this.toCorrectionDto(correction),
          note: cleanDisplayText(redactSensitiveValue(correction.note), ''),
          previousValue: redactSensitiveValue(
            correction.previousValue,
          ) as Record<string, unknown>,
          correctedValue: redactSensitiveValue(
            correction.correctedValue,
          ) as Record<string, unknown>,
        })) ?? [],
      privacy: {
        redacted: true,
        tiers,
      },
    };
  }

  async deleteLifeGraphMemory(
    userId: number,
    input: { includeAuditLogs?: boolean } = {},
  ): Promise<{ deleted: true; revokedFields: number }> {
    const activeFields = await this.findActiveFields(userId);
    void this.auditSensitiveFieldAccess({
      userId,
      action: 'delete',
      purpose: 'user_confirmed_delete',
      route: 'POST /life-graph/delete-requests/:id/confirm',
      fields: activeFields,
      metadata: {
        includeAuditLogs: input.includeAuditLogs === true,
        revokedFields: activeFields.length,
      },
    });
    const now = new Date();
    await this.fields.update(
      { userId, revoked: false },
      { revoked: true, revokedAt: now },
    );
    await this.proposals.update(
      { userId },
      {
        status: LifeGraphProposalStatus.Revoked,
        rejectedAt: now,
      },
    );
    await this.behaviorEvents?.delete({ userId });
    await this.signalScores?.delete({ userId });
    await this.updateAudits?.delete({ userId });
    await this.corrections?.delete({ userId });
    await this.profiles.update(
      { userId },
      {
        completenessScore: 0,
        currentSocialGoal: '',
        aiSummary: '',
        lastUpdatedAt: now,
      },
    );
    if (input.includeAuditLogs === true) {
      await this.auditLogs.delete({ userId });
    } else {
      await this.writeAuditLog({
        userId,
        category: LifeGraphFieldCategory.PrivacyBoundary,
        fieldKey: 'all_memory',
        oldValue: { revokedFields: activeFields.length },
        newValue: null,
        source: LifeGraphFieldSource.Manual,
        confidence: 1,
        action: LifeGraphAuditAction.Revoked,
        reason: 'user_deleted_life_graph_memory',
      });
    }
    this.logEvent('life_graph.memory_deleted', {
      userId,
      category: LifeGraphFieldCategory.PrivacyBoundary,
      fieldKey: 'all_memory',
      action: LifeGraphAuditAction.Revoked,
      source: LifeGraphFieldSource.Manual,
    });
    this.realtime?.emitToUser({
      userId,
      eventType: 'life_graph:updated',
      payload: { deleted: true, revokedFields: activeFields.length },
    });
    return { deleted: true, revokedFields: activeFields.length };
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
    const dataTier = classifyLifeGraphField({
      category: update.category,
      fieldKey: update.fieldKey,
      signalType,
    });
    const visibleInRecommendationReason =
      update.visibleInRecommendationReason ??
      (!isEntertainment &&
        !isSensitive &&
        dataTier !== LifeGraphDataTier.Sensitive &&
        dataTier !== LifeGraphDataTier.UserSecret);
    const userCanDisableForMatching =
      update.userCanDisableForMatching ?? isEntertainment;
    const blockedSensitiveMatchingKeys = [
      'birthDate',
      'preciseLocationSharing',
      'healthDataEnabled',
      'periodCycleEnabled',
      'contactSharing',
      'paymentBoundary',
      'paymentAutoExecution',
    ];
    const defaultEnabledForMatching =
      shouldExposeInMatching(dataTier) &&
      !(isSensitive && blockedSensitiveMatchingKeys.includes(update.fieldKey));
    const enabledForMatching =
      update.enabledForMatching ?? defaultEnabledForMatching;

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
      (field) =>
        !field.revoked &&
        field.enabledForMatching !== false &&
        shouldExposeInMatching(this.classifyStoredField(field)),
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
        const dataTier = this.classifyStoredField(field);
        signals[field.fieldKey] = {
          value: redactLifeGraphValueForTier(field.fieldValue, dataTier),
          source: field.source,
          confidence: field.confidence,
          confirmedByUser: field.confirmedByUser,
          revoked: field.revoked,
          dataTier,
          redacted: dataTier !== LifeGraphDataTier.PublicProfile,
          ...metadata,
        };
        return signals;
      }, {});
  }

  private groupFields(
    fields: LifeGraphField[],
    redacted = false,
  ): Record<LifeGraphFieldCategory, LifeGraphFieldDto[]> {
    const grouped = Object.values(LifeGraphFieldCategory).reduce(
      (acc, category) => {
        acc[category] = [];
        return acc;
      },
      {} as Record<LifeGraphFieldCategory, LifeGraphFieldDto[]>,
    );
    for (const field of fields) {
      grouped[field.category].push(this.toFieldDto(field, redacted));
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

  private async auditSensitiveFieldAccess(input: {
    userId: number;
    action: string;
    purpose: string;
    route: string;
    fields: LifeGraphField[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.compliance?.auditSensitiveAccess({
      actorUserId: input.userId,
      ...input,
    });
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

  private toFieldDto(
    field: LifeGraphField,
    redacted = false,
  ): LifeGraphFieldDto {
    const signalMetadata = this.resolveStoredSignalMetadata(field);
    const dataTier = this.classifyStoredField(field);
    return {
      id: field.id,
      userId: field.userId,
      category: field.category,
      fieldKey: field.fieldKey,
      fieldValue: redacted
        ? redactLifeGraphValueForTier(field.fieldValue, dataTier)
        : field.fieldValue,
      dataTier,
      redacted,
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

  private toAuditLogDto(
    log: LifeGraphAuditLog,
    redacted = true,
  ): LifeGraphAuditLogDto {
    const dataTier = classifyLifeGraphField({
      category: log.category,
      fieldKey: log.fieldKey,
    });
    return {
      id: log.id,
      userId: log.userId,
      fieldKey: log.fieldKey,
      category: log.category,
      oldValue: redacted
        ? redactLifeGraphValueForTier(log.oldValue, dataTier)
        : log.oldValue,
      newValue: redacted
        ? redactLifeGraphValueForTier(log.newValue, dataTier)
        : log.newValue,
      redacted,
      source: log.source,
      confidence: log.confidence,
      action: log.action,
      reason: cleanDisplayText(redactSensitiveValue(log.reason), ''),
      taskId: log.taskId,
      messageId: log.messageId,
      createdAt: log.createdAt.toISOString(),
    };
  }

  private classifyStoredField(field: LifeGraphField): LifeGraphDataTier {
    const signalMetadata = this.resolveStoredSignalMetadata(field);
    return classifyLifeGraphField({
      category: field.category,
      fieldKey: field.fieldKey,
      signalType: signalMetadata.signalType,
    });
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
    if (!proposal) throw new NotFoundException('画像更新建议不存在');
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
