import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSocialRequestDto } from './dto/create-social-request.dto';
import { SearchSocialRequestDto } from './dto/search-social-request.dto';
import { UpdateSocialRequestDto } from './dto/update-social-request.dto';
import {
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from './social-request.entity';
import {
  AgentConnection,
  AgentPermissionLevel,
} from '../agent-gateway/entities/agent-connection.entity';
import { AIService } from '../ai/ai.service';
import type { SocialRequestCard } from '../ai/ai.service';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus as PublicSocialIntentStatus,
} from '../agent-gateway/entities/social-request.entity';
import { AgentActionLogService } from '../agent-gateway/agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from '../agent-gateway/entities/agent-action-log.entity';
import { extractKnownCity, sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';

/**
 * Activity types considered "offline / in-person" — for these we always
 * force `requireUserConfirmation = true` regardless of what the agent asks.
 */
const OFFLINE_TYPES = new Set<SocialRequestType>([
  SocialRequestType.RunningPartner,
  SocialRequestType.FitnessPartner,
  SocialRequestType.DogWalking,
  SocialRequestType.CoffeeChat,
  SocialRequestType.CityWalk,
]);

/** Permission levels allowed to set `requireUserConfirmation = false`. */
const PERMISSION_AUTO_CONFIRM_ALLOWED = new Set<AgentPermissionLevel>([
  AgentPermissionLevel.Standard,
  AgentPermissionLevel.Open,
  AgentPermissionLevel.SandboxInternal,
]);

@Injectable()
export class SocialRequestsService {
  constructor(
    @InjectRepository(UserSocialRequest)
    private readonly repo: Repository<UserSocialRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSocialProfile)
    private readonly socialProfileRepo: Repository<UserSocialProfile>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    private readonly ai: AIService,
    private readonly actionLogs: AgentActionLogService,
  ) {}

  // ---------- public API ----------

  async create(
    userId: number,
    dto: CreateSocialRequestDto,
    opts: { agent?: AgentConnection | null } = {},
  ): Promise<UserSocialRequest> {
    const agent = opts.agent ?? null;
    const type = dto.type;
    const title = dto.title?.trim() || this.autoTitle(type, dto.rawText);

    // Time sanity
    if (dto.timeStart && dto.timeEnd) {
      const s = new Date(dto.timeStart).getTime();
      const e = new Date(dto.timeEnd).getTime();
      if (Number.isFinite(s) && Number.isFinite(e) && e < s) {
        throw new BadRequestException('timeEnd must be >= timeStart');
      }
    }
    if (dto.ageMin != null && dto.ageMax != null && dto.ageMax < dto.ageMin) {
      throw new BadRequestException('ageMax must be >= ageMin');
    }

    // Decide source
    const source = agent
      ? this.agentSource(agent)
      : (dto.source ?? SocialRequestSource.Manual);

    // requireUserConfirmation policy
    let requireUserConfirmation = dto.requireUserConfirmation ?? true;
    if (OFFLINE_TYPES.has(type)) {
      // Offline activities always require confirmation by default
      requireUserConfirmation = true;
    }
    if (
      agent &&
      dto.requireUserConfirmation === false &&
      !PERMISSION_AUTO_CONFIRM_ALLOWED.has(agent.permissionLevel)
    ) {
      throw new ForbiddenException(
        'Agent permission level does not allow auto-confirmation for this request',
      );
    }
    if (agent && OFFLINE_TYPES.has(type)) {
      // Hard rule: agents may NOT auto-confirm offline meetups
      requireUserConfirmation = true;
    }

    const entity = this.repo.create({
      userId,
      agentId: agent?.id ?? null,
      source,
      type,
      title,
      description: dto.description ?? '',
      rawText: dto.rawText ?? '',
      city: sanitizeCity(dto.city),
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      radiusKm: dto.radiusKm ?? 5,
      timeStart: dto.timeStart ? new Date(dto.timeStart) : null,
      timeEnd: dto.timeEnd ? new Date(dto.timeEnd) : null,
      genderPreference: dto.genderPreference,
      ageMin: dto.ageMin ?? null,
      ageMax: dto.ageMax ?? null,
      interestTags: dto.interestTags ?? dto.tags ?? [],
      activityType: dto.activityType ?? '',
      safetyRequirement: dto.safetyRequirement,
      agentAllowed: dto.agentAllowed ?? true,
      requireUserConfirmation,
      visibility: dto.visibility,
      status: dto.status ?? UserSocialRequestStatus.Matching,
      metadata: {
        ...(dto.metadata ?? {}),
        ...(agent
          ? {
              sentBy: {
                actorType: 'agent',
                actorUserId: userId,
                agentConnectionId: agent.id,
                agentName: agent.agentDisplayName || agent.agentName,
              },
            }
          : {
              sentBy: {
                actorType: 'user',
                actorUserId: userId,
              },
            }),
      },
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    const saved = await this.repo.save(entity);
    await this.syncPublicIntent(saved);
    const agentTaskId = this.numberOrNull(saved.metadata?.agentTaskId);
    await this.actionLogs.logAgentAction({
      ownerUserId: userId,
      agentId: agent?.id ?? null,
      agentTaskId,
      actionType: AgentActionType.CreateSocialRequest,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: OFFLINE_TYPES.has(type)
        ? AgentActionRiskLevel.Medium
        : AgentActionRiskLevel.Low,
      relatedSocialRequestId: saved.id,
      inputSummary: `type=${type}, title=${title}`,
      outputSummary: `requireUserConfirmation=${requireUserConfirmation}, source=${source}`,
      payload: {
        agentTaskId,
        visibility: saved.visibility,
        status: saved.status,
        source,
      },
    });
    return saved;
  }

  /**
   * Natural-language → structured parsing entry-point.
   *
   * Tries `AIService.parseSocialRequest` first (which itself falls back to a
   * deterministic rule-based parser when DEEPSEEK_API_KEY is not configured),
   * then merges the result with the keyword-based `parseNaturalLanguage` so
   * the SocialRequestType enum is always populated — DeepSeek returns free-text
   * tags but our DTO needs a concrete `type`.
   */
  async createFromNaturalLanguage(
    rawText: string,
    userId: number,
    agent?: AgentConnection | null,
    trace: {
      agentTaskId?: number | null;
      source?: string | null;
      taskContext?: Record<string, unknown> | null;
    } = {},
  ): Promise<UserSocialRequest> {
    const text = cleanDisplayText(rawText, '');
    const taskContext = this.readPublicAiDraftTaskContext(trace.taskContext);
    const effectiveText = this.composeAiDraftEffectiveText(text, taskContext);
    const ruleBased = this.parseNaturalLanguage(effectiveText || text);
    let interestTags = this.mergePublicAiDraftTags(
      taskContext.activity,
      ruleBased.interestTags ?? [],
    );
    let title = ruleBased.title;
    let description = ruleBased.description || taskContext.summary;
    try {
      const ai = await this.ai.parseSocialRequest(effectiveText || text);
      if (Array.isArray(ai.interestTags) && ai.interestTags.length > 0) {
        interestTags = this.mergePublicAiDraftTags(
          taskContext.activity,
          ai.interestTags,
        );
      }
      if (!title && ai.suggestedTitle) title = ai.suggestedTitle;
      if (!description && ai.goal) description = ai.goal;
    } catch {
      // AIService never throws, but stay defensive.
    }
    return this.create(
      userId,
      {
        ...ruleBased,
        rawText: text || taskContext.summary,
        city: sanitizeCity(ruleBased.city, taskContext.city),
        interestTags,
        title,
        description,
        activityType: taskContext.activity || ruleBased.activityType,
        metadata: {
          ...(ruleBased.metadata ?? {}),
          agentTaskId: trace.agentTaskId ?? null,
          source: trace.source ?? 'social_requests.natural_language',
          taskSlotSummary: taskContext.taskSlotSummary,
          knownTaskSlotConstraints: taskContext.knownTaskSlotConstraints,
          timePreference: taskContext.timePreference || undefined,
          locationPreference: taskContext.locationPreference || undefined,
          nearbyArea: taskContext.geoArea || undefined,
          intensity: taskContext.intensity || undefined,
          safetyBoundary: taskContext.safetyBoundary || undefined,
          candidatePreference: taskContext.candidatePreference || undefined,
          candidatePreferencePolicy: taskContext.candidatePreference
            ? 'public_discoverable_profiles_and_user_consented_public_tags_only'
            : undefined,
        },
      },
      { agent: agent ?? null },
    );
  }

  /**
   * Build a structured DRAFT from free-text + caller profile, without
   * persisting anything. Used by the in-app "AI 社交需求助手" page so the
   * user can review/edit before publishing via the normal `create` path.
   *
   * Returns the full 9-field {@link SocialRequestCard} (including riskNotes /
   * privacyNotes / timePreference / personalityPreference for display only —
   * those are NOT persisted by `create()`).
   */
  async aiDraft(
    userId: number,
    rawText: string,
    trace: {
      agentTaskId?: number | null;
      agentId?: number | null;
      source?: string | null;
      taskContext?: Record<string, unknown> | null;
    } = {},
  ): Promise<{
    draft: CreateSocialRequestDto;
    card: SocialRequestCard;
    suggestedTitle: string;
    profileUsed: {
      city: string;
      interestTags: string[];
      ageRange: string;
      nearbyArea: string;
      fitnessGoals: string[];
      availableTimes: string[];
    };
    llmEnabled: boolean;
    mode: 'ai' | 'fallback';
  }> {
    const text = cleanDisplayText(rawText, '');
    const taskContext = this.readPublicAiDraftTaskContext(trace.taskContext);
    const effectiveText = this.composeAiDraftEffectiveText(text, taskContext);
    const ruleBased = this.parseNaturalLanguage(effectiveText || text);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const socialProfile = await this.socialProfileRepo.findOne({
      where: { userId },
    });

    // 社交画像优先，未填则回落到 user 表上的 city / interestTags。
    const textCity = extractKnownCity(effectiveText || text);
    const profileCity = sanitizeCity(
      taskContext.city || socialProfile?.city,
      sanitizeCity(user?.city, textCity),
    );
    const profileTags =
      socialProfile?.interestTags && socialProfile.interestTags.length > 0
        ? socialProfile.interestTags.filter(Boolean)
        : Array.isArray(user?.interestTags)
          ? user.interestTags.filter(Boolean)
          : [];
    const ageRange = socialProfile?.ageRange || '';
    const nearbyArea = socialProfile?.nearbyArea || '';
    const fitnessGoals = socialProfile?.fitnessGoals || [];
    const availableTimes = socialProfile?.availableTimes || [];

    const llmEnabled = this.ai.isLlmEnabled();
    let mode: 'ai' | 'fallback' = llmEnabled ? 'ai' : 'fallback';

    let card: SocialRequestCard;
    try {
      card = await this.ai.generateSocialRequestCard(effectiveText || text, {
        nickname: user?.name,
        city: profileCity,
        interestTags: profileTags,
        gender: socialProfile?.gender || user?.gender || null,
        ageRange,
        nearbyArea,
        fitnessGoals,
        availableTimes,
        socialPreference: socialProfile?.socialPreference || null,
        rejectRules: socialProfile?.rejectRules || null,
        privacyBoundary: socialProfile?.privacyBoundary || null,
      });
    } catch {
      // generateSocialRequestCard never throws, but stay defensive.
      mode = 'fallback';
      card = await this.ai.generateSocialRequestCard(effectiveText || '', {});
    }

    // Build the (persistable) CreateSocialRequestDto from the card.
    const fallbackTitle = this.autoTitle(ruleBased.type, text);
    const interestTags = this.mergePublicAiDraftTags(
      taskContext.activity,
      card.interestTags,
    );
    const draft: CreateSocialRequestDto = {
      type: ruleBased.type,
      title: card.title || fallbackTitle,
      description: card.description || taskContext.summary || text,
      rawText: text || taskContext.summary,
      city: profileCity,
      radiusKm: 5,
      interestTags,
      activityType: taskContext.activity || undefined,
      metadata: {
        taskSlotSummary: taskContext.taskSlotSummary,
        knownTaskSlotConstraints: taskContext.knownTaskSlotConstraints,
        timePreference: taskContext.timePreference || undefined,
        locationPreference: taskContext.locationPreference || undefined,
        nearbyArea: taskContext.geoArea || undefined,
        intensity: taskContext.intensity || undefined,
        safetyBoundary: taskContext.safetyBoundary || undefined,
        candidatePreference: taskContext.candidatePreference || undefined,
        candidatePreferencePolicy: taskContext.candidatePreference
          ? 'public_discoverable_profiles_and_user_consented_public_tags_only'
          : undefined,
      },
    };

    await this.actionLogs.logAgentAction({
      ownerUserId: userId,
      agentId: trace.agentId ?? null,
      agentTaskId: trace.agentTaskId ?? null,
      actionType: AgentActionType.CreateSocialRequest,
      actionStatus: AgentActionStatus.Planned,
      riskLevel: AgentActionRiskLevel.Low,
      inputSummary: `aiDraft: ${text.slice(0, 120)}`,
      outputSummary: `type=${ruleBased.type}, mode=${mode}, tags=${(card.interestTags ?? []).length}`,
      payload: {
        agentTaskId: trace.agentTaskId ?? null,
        source: trace.source ?? 'social_requests.ai_draft',
      },
    });

    return {
      draft,
      card,
      suggestedTitle: card.title || fallbackTitle,
      profileUsed: {
        city: profileCity,
        interestTags: profileTags,
        ageRange,
        nearbyArea,
        fitnessGoals,
        availableTimes,
      },
      llmEnabled,
      mode,
    };
  }

  private readPublicAiDraftTaskContext(
    context: Record<string, unknown> | null | undefined,
  ): {
    activity: string;
    timePreference: string;
    locationPreference: string;
    geoArea: string;
    city: string;
    intensity: string;
    safetyBoundary: string;
    candidatePreference: string;
    summary: string;
    taskSlotSummary: Record<string, string>;
    knownTaskSlotConstraints: unknown;
  } {
    const record = this.isRecord(context) ? context : {};
    const slots = this.isRecord(record.taskSlots) ? record.taskSlots : {};
    const summaryRecord = this.isRecord(record.taskSlotSummary)
      ? record.taskSlotSummary
      : {};
    const read = (key: string): string =>
      this.publicAiDraftText(
        this.readSlotText(slots, key) || summaryRecord[key],
      );
    const activity = read('activity');
    const timePreference = read('time_window');
    const locationPreference = read('location_text');
    const geoArea = read('geo_area');
    const intensity = read('intensity');
    const safetyBoundary = read('safety_boundary');
    const candidatePreference = read('candidate_preference');
    const taskSlotSummary = this.publicAiDraftSummary(summaryRecord);
    const city = sanitizeCity(
      this.publicAiDraftText(record.city) ||
        this.inferCityFromPublicContext(locationPreference, geoArea),
    );
    const summary = [
      activity ? `活动：${activity}` : '',
      timePreference ? `时间：${timePreference}` : '',
      locationPreference ? `地点：${locationPreference}` : '',
      geoArea ? `区域：${geoArea}` : '',
      intensity ? `强度：${intensity}` : '',
      safetyBoundary ? `安全边界：${safetyBoundary}` : '',
      candidatePreference ? `候选偏好：${candidatePreference}` : '',
    ]
      .filter(Boolean)
      .join('；');
    return {
      activity,
      timePreference,
      locationPreference,
      geoArea,
      city,
      intensity,
      safetyBoundary,
      candidatePreference,
      summary,
      taskSlotSummary,
      knownTaskSlotConstraints: record.knownTaskSlotConstraints ?? null,
    };
  }

  private composeAiDraftEffectiveText(
    rawText: string,
    context: ReturnType<SocialRequestsService['readPublicAiDraftTaskContext']>,
  ): string {
    const lines = [rawText];
    if (context.summary) {
      lines.push(`已确认信息：${context.summary}`);
      lines.push('请基于已确认信息生成约练草稿，不要重复追问这些字段。');
    }
    if (context.candidatePreference) {
      lines.push(
        '候选偏好只能基于公开可发现资料和用户自愿公开标签使用，不能读取或推断隐私字段。',
      );
    }
    return lines.filter(Boolean).join('\n').slice(0, 1200);
  }

  private mergePublicAiDraftTags(
    activity: string,
    tags: string[] | null | undefined,
  ): string[] {
    const out: string[] = [];
    const add = (value: unknown) => {
      const text = this.publicAiDraftText(value);
      if (text && !out.includes(text)) out.push(text);
    };
    add(activity);
    for (const tag of Array.isArray(tags) ? tags : []) add(tag);
    return out.slice(0, 20);
  }

  private publicAiDraftSummary(
    summary: Record<string, unknown>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(summary)) {
      const text = this.publicAiDraftText(value);
      if (text) out[key] = text;
    }
    return out;
  }

  private readSlotText(slots: Record<string, unknown>, key: string): string {
    const slot = slots[key];
    if (!this.isRecord(slot)) return '';
    const state = cleanDisplayText(slot.state, '');
    if (
      !(
        state === 'answered' ||
        state === 'confirmed' ||
        state === 'completed' ||
        state === 'modified' ||
        ((key === 'geo_area' || key === 'intensity') && state === 'inferred')
      )
    ) {
      return '';
    }
    return this.publicAiDraftText(slot.value);
  }

  private publicAiDraftText(value: unknown): string {
    const text = cleanDisplayText(value, '').slice(0, 180);
    if (!text || this.containsSensitivePublishInfo(text)) return '';
    return text;
  }

  private inferCityFromPublicContext(...values: string[]): string {
    const text = values.filter(Boolean).join(' ');
    if (!text) return '';
    if (
      /(青岛|崂山|市南|市北|李沧|黄岛|青岛大学|五四广场|奥帆中心|石老人|浮山|麦岛|台东|栈桥)/.test(
        text,
      )
    ) {
      return '青岛';
    }
    return sanitizeCity(text);
  }

  private containsSensitivePublishInfo(text: string): boolean {
    return /(\b1[3-9]\d{9}\b|微信|vx|wechat|手机号|电话|身份证|门牌|单元|楼栋|具体地址|精确位置|联系方式|加我|私聊我|转账|支付|红包)/i.test(
      text,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /** Pluggable rule-based parser. Always synchronous, always safe. */
  parseNaturalLanguage(rawText: string): CreateSocialRequestDto {
    const text = (rawText || '').toLowerCase();
    let type: SocialRequestType = SocialRequestType.Custom;
    if (/(跑步|run|jogging)/.test(text))
      type = SocialRequestType.RunningPartner;
    else if (/(健身|gym|workout|训练)/.test(text))
      type = SocialRequestType.FitnessPartner;
    else if (/(遛狗|dog\s*walk|walking the dog)/.test(text))
      type = SocialRequestType.DogWalking;
    else if (/(咖啡|coffee)/.test(text)) type = SocialRequestType.CoffeeChat;
    else if (/(散步|city\s*walk|遛弯|压马路)/.test(text))
      type = SocialRequestType.CityWalk;
    else if (/(自习|学习|study)/.test(text))
      type = SocialRequestType.StudyPartner;

    return { type, rawText, city: extractKnownCity(rawText) };
  }

  async findOwn(userId: number, q: SearchSocialRequestDto = {}) {
    const where: Record<string, unknown> = { userId };
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    const city = sanitizeCity(q.city);
    if (city) where.city = city;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: q.limit ?? 20,
      skip: q.offset ?? 0,
    });
    return { items, total };
  }

  async findOne(id: number, userId: number, agent?: AgentConnection | null) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('SocialRequest not found');
    this.assertCanRead(item, userId, agent ?? null);
    return item;
  }

  async update(
    id: number,
    userId: number,
    dto: UpdateSocialRequestDto,
    agent?: AgentConnection | null,
  ) {
    const item = await this.findOne(id, userId, agent ?? null);

    if (item.status === UserSocialRequestStatus.Cancelled) {
      throw new BadRequestException('Cannot update a cancelled request');
    }

    const patch: Partial<UserSocialRequest> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.rawText !== undefined) patch.rawText = dto.rawText;
    if (dto.city !== undefined) patch.city = sanitizeCity(dto.city);
    if (dto.lat !== undefined) patch.lat = dto.lat;
    if (dto.lng !== undefined) patch.lng = dto.lng;
    if (dto.radiusKm !== undefined) patch.radiusKm = dto.radiusKm;
    if (dto.timeStart !== undefined)
      patch.timeStart = dto.timeStart ? new Date(dto.timeStart) : null;
    if (dto.timeEnd !== undefined)
      patch.timeEnd = dto.timeEnd ? new Date(dto.timeEnd) : null;
    if (dto.genderPreference !== undefined)
      patch.genderPreference = dto.genderPreference;
    if (dto.ageMin !== undefined) patch.ageMin = dto.ageMin;
    if (dto.ageMax !== undefined) patch.ageMax = dto.ageMax;
    if (dto.interestTags !== undefined) patch.interestTags = dto.interestTags;
    if (dto.activityType !== undefined) patch.activityType = dto.activityType;
    if (dto.safetyRequirement !== undefined)
      patch.safetyRequirement = dto.safetyRequirement;
    if (dto.agentAllowed !== undefined) patch.agentAllowed = dto.agentAllowed;
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.metadata !== undefined) patch.metadata = dto.metadata;
    if (dto.expiresAt !== undefined)
      patch.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (dto.requireUserConfirmation !== undefined) {
      if (
        agent &&
        dto.requireUserConfirmation === false &&
        !PERMISSION_AUTO_CONFIRM_ALLOWED.has(agent.permissionLevel)
      ) {
        throw new ForbiddenException(
          'Agent permission level does not allow auto-confirmation',
        );
      }
      patch.requireUserConfirmation =
        OFFLINE_TYPES.has(item.type) && agent
          ? true
          : dto.requireUserConfirmation;
    }

    Object.assign(item, patch);
    const saved = await this.repo.save(item);
    if (patch.status !== undefined || patch.metadata !== undefined) {
      await this.syncPublicIntent(saved);
    }
    return saved;
  }

  async cancel(id: number, userId: number, agent?: AgentConnection | null) {
    const item = await this.findOne(id, userId, agent ?? null);
    if (item.status === UserSocialRequestStatus.Cancelled) return item;
    if (item.status === UserSocialRequestStatus.Completed) {
      throw new BadRequestException('Cannot cancel a completed request');
    }
    item.status = UserSocialRequestStatus.Cancelled;
    const saved = await this.repo.save(item);
    await this.syncPublicIntent(saved);
    return saved;
  }

  async rematch(id: number, userId: number, agent?: AgentConnection | null) {
    const item = await this.findOne(id, userId, agent ?? null);
    if (
      item.status === UserSocialRequestStatus.Cancelled ||
      item.status === UserSocialRequestStatus.Completed ||
      item.status === UserSocialRequestStatus.Expired
    ) {
      throw new BadRequestException(
        `Cannot rematch a request in status "${item.status}"`,
      );
    }
    item.status = UserSocialRequestStatus.Matching;
    // TODO: enqueue real matching job (Kafka / queue) — see AgentGatewayService
    //       for the existing candidate-search pipeline.
    return this.repo.save(item);
  }

  async syncPublicIntentById(id: number, userId: number) {
    const item = await this.findOne(id, userId);
    const intent = await this.syncPublicIntent(item);
    const agentTaskId = this.numberOrNull(item.metadata?.agentTaskId);
    await this.actionLogs.logAgentAction({
      ownerUserId: userId,
      agentId: item.agentId ?? null,
      agentTaskId,
      actionType: AgentActionType.SyncToHall,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      relatedSocialRequestId: item.id,
      outputSummary: `publicIntent=${intent.id}, status=${intent.status}`,
      payload: {
        agentTaskId,
        publicIntentId: intent.id,
        publicIntentStatus: intent.status,
      },
    });
    return intent;
  }

  // ---------- helpers ----------

  private autoTitle(type: SocialRequestType, raw?: string): string {
    const map: Record<SocialRequestType, string> = {
      [SocialRequestType.RunningPartner]: '寻找跑步搭子',
      [SocialRequestType.FitnessPartner]: '寻找健身搭子',
      [SocialRequestType.DogWalking]: '寻找遛狗搭子',
      [SocialRequestType.CoffeeChat]: '咖啡聊聊',
      [SocialRequestType.CityWalk]: '城市散步',
      [SocialRequestType.StudyPartner]: '学习搭子',
      [SocialRequestType.Custom]: '社交需求',
    };
    const base = map[type] ?? '社交需求';
    if (raw && raw.trim().length > 0 && raw.trim().length <= 40) {
      return raw.trim();
    }
    return base;
  }

  private agentSource(agent: AgentConnection): SocialRequestSource {
    switch (String(agent.agentName)) {
      case 'fitmeet_agent':
        return SocialRequestSource.FitMeetAgent;
      case 'codex':
        return SocialRequestSource.Codex;
      default:
        // Claude isn't in KnownAgent enum yet; agents identifying themselves
        // outside the known list fall back to custom_agent.
        return SocialRequestSource.CustomAgent;
    }
  }

  private async syncPublicIntent(
    request: UserSocialRequest,
  ): Promise<PublicSocialIntent> {
    const metadata = request.metadata ?? {};
    const id = `social_request_${request.id}`;
    const existing = await this.publicIntentRepo.findOne({ where: { id } });
    const publiclyVisible =
      request.visibility === SocialRequestVisibility.Public &&
      request.status !== UserSocialRequestStatus.Draft;
    const status = publiclyVisible
      ? this.toPublicStatus(request.status)
      : PublicSocialIntentStatus.Inactive;
    const intent = existing ?? this.publicIntentRepo.create({ id });

    Object.assign(intent, {
      userId: request.userId,
      linkedSocialRequestId: request.id,
      source:
        metadata.source === 'ai_social_request' ||
        request.source === SocialRequestSource.Manual
          ? 'ai_social_request'
          : request.source,
      mode: publiclyVisible ? 'public' : 'private_draft',
      requestType: request.activityType || request.type,
      title: request.title,
      description: request.description,
      interestTags: request.interestTags ?? [],
      city: sanitizeCity(request.city),
      loc:
        (metadata.locationPreference as string | undefined) ??
        (metadata.nearbyArea as string | undefined) ??
        '',
      lat: request.lat,
      lng: request.lng,
      radiusKm: request.radiusKm,
      timePreference:
        (metadata.timePreference as string | undefined) ??
        this.formatTimePreference(request.timeStart, request.timeEnd),
      locationPreference:
        (metadata.locationPreference as string | undefined) ?? '',
      socialGoal: (metadata.socialGoal as string | undefined) ?? '',
      riskLevel: this.derivePublicRiskLevel(request),
      requiresUserConfirmation: request.requireUserConfirmation,
      filters: {
        interestTags: request.interestTags ?? [],
        interests: request.interestTags ?? [],
        locationPreference:
          (metadata.locationPreference as string | undefined) ?? '',
        personalityPreference:
          (metadata.personalityPreference as string[] | undefined) ?? [],
      },
      status,
      metadata: {
        ...metadata,
        source: 'ai_social_request',
        linkedSocialRequestId: request.id,
        visibility: request.visibility,
        publiclyVisible,
      },
    });

    return this.publicIntentRepo.save(intent);
  }

  private toPublicStatus(
    status: UserSocialRequestStatus,
  ): PublicSocialIntentStatus {
    switch (status) {
      case UserSocialRequestStatus.Cancelled:
        return PublicSocialIntentStatus.Cancelled;
      case UserSocialRequestStatus.Completed:
        return PublicSocialIntentStatus.Completed;
      case UserSocialRequestStatus.Expired:
        return PublicSocialIntentStatus.Inactive;
      default:
        return PublicSocialIntentStatus.Active;
    }
  }

  private derivePublicRiskLevel(
    request: UserSocialRequest,
  ): SocialRequestRiskLevel {
    const text = `${request.type} ${request.title} ${request.description}`;
    if (/(酒|bar|pub|drink|drinking|酒店|私密|转账|付款|payment)/i.test(text)) {
      return SocialRequestRiskLevel.High;
    }
    if (/(线下|见面|遛狗|dog|跑步|健身|city|walk|coffee|咖啡)/i.test(text)) {
      return SocialRequestRiskLevel.Medium;
    }
    return SocialRequestRiskLevel.Low;
  }

  private formatTimePreference(start: Date | null, end: Date | null): string {
    if (!start) return '';
    const s = new Date(start);
    const date = `${s.getMonth() + 1}月${s.getDate()}日 ${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
    if (!end) return date;
    const e = new Date(end);
    return `${date}-${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  }

  private assertCanRead(
    item: UserSocialRequest,
    userId: number,
    agent: AgentConnection | null,
  ) {
    if (agent) {
      if (item.userId !== agent.userId) {
        throw new ForbiddenException('Agent is not authorized for this user');
      }
      return;
    }
    if (item.userId !== userId) {
      throw new ForbiddenException('Not your social request');
    }
  }

  private numberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
