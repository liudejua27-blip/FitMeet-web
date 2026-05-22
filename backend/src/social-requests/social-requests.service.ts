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
  KnownAgent,
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
      : dto.source ?? SocialRequestSource.Manual;

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
  ): Promise<UserSocialRequest> {
    const ruleBased = this.parseNaturalLanguage(rawText);
    let interestTags = ruleBased.interestTags ?? [];
    let title = ruleBased.title;
    let description = ruleBased.description;
    try {
      const ai = await this.ai.parseSocialRequest(rawText);
      if (Array.isArray(ai.interestTags) && ai.interestTags.length > 0) {
        interestTags = ai.interestTags;
      }
      if (!title && ai.suggestedTitle) title = ai.suggestedTitle;
      if (!description && ai.goal) description = ai.goal;
    } catch {
      // AIService never throws, but stay defensive.
    }
    return this.create(
      userId,
      { ...ruleBased, rawText, interestTags, title, description },
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
    const text = (rawText || '').trim();
    const ruleBased = this.parseNaturalLanguage(text);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const socialProfile = await this.socialProfileRepo.findOne({
      where: { userId },
    });

    // 社交画像优先，未填则回落到 user 表上的 city / interestTags。
    const textCity = extractKnownCity(text);
    const profileCity = sanitizeCity(
      socialProfile?.city,
      sanitizeCity(user?.city, textCity),
    );
    const profileTags =
      socialProfile?.interestTags && socialProfile.interestTags.length > 0
        ? socialProfile.interestTags.filter(Boolean)
        : Array.isArray(user?.interestTags)
          ? user!.interestTags.filter(Boolean)
          : [];
    const ageRange = socialProfile?.ageRange || '';
    const nearbyArea = socialProfile?.nearbyArea || '';
    const fitnessGoals = socialProfile?.fitnessGoals || [];
    const availableTimes = socialProfile?.availableTimes || [];

    const llmEnabled = this.ai.isLlmEnabled();
    let mode: 'ai' | 'fallback' = llmEnabled ? 'ai' : 'fallback';

    let card: SocialRequestCard;
    try {
      card = await this.ai.generateSocialRequestCard(text, {
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
      card = await this.ai.generateSocialRequestCard('', {});
    }

    // Build the (persistable) CreateSocialRequestDto from the card.
    const fallbackTitle = this.autoTitle(ruleBased.type, text);
    const draft: CreateSocialRequestDto = {
      type: ruleBased.type,
      title: card.title || fallbackTitle,
      description: card.description || text,
      rawText: text,
      city: profileCity,
      radiusKm: 5,
      interestTags: card.interestTags,
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

  /** Pluggable rule-based parser. Always synchronous, always safe. */
  parseNaturalLanguage(rawText: string): CreateSocialRequestDto {
    const text = (rawText || '').toLowerCase();
    let type: SocialRequestType = SocialRequestType.Custom;
    if (/(跑步|run|jogging)/.test(text)) type = SocialRequestType.RunningPartner;
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
    switch (agent.agentName) {
      case KnownAgent.OpenClaw:
        return SocialRequestSource.OpenClaw;
      case KnownAgent.Codex:
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
        throw new ForbiddenException(
          'Agent is not authorized for this user',
        );
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
