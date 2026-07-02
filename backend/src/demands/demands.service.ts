import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { CandidateSearchIndexService } from '../agent-gateway/candidate-search-index.service';
import {
  CandidateSearchIndex,
  CandidateSearchIndexSourceType,
} from '../agent-gateway/entities/candidate-search-index.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from '../agent-gateway/entities/social-request.entity';
import {
  classifyPublicSocialRisk,
  extractPublicRequestKeywords,
} from '../agent-gateway/public-social-intent.helpers';
import { sanitizeCity } from '../common/city.util';
import { normalizeTimeGeoContext } from '../common/time-geo.util';
import { UserBlock } from '../safety/user-block.entity';
import { ApiIdempotencyService } from '../social-loop/api-idempotency.service';
import { ContactPolicyService } from '../social-loop/contact-policy.service';
import { DomainOutboxEvent } from '../social-loop/domain-outbox-event.entity';
import { User } from '../users/user.entity';
import {
  CancelDemandDto,
  CreateDemandDto,
  CreateDemandInvitationDto,
  DemandCardFieldDto,
  DemandInvitationQueryDto,
  DemandQueryDto,
  DemandVisibilityMutationDto,
  ResolveDemandInvitationDto,
} from './demands.dto';
import {
  DemandCandidate,
  DemandCandidateStatus,
} from './demand-candidate.entity';
import {
  Demand,
  DemandCardField,
  DemandHallTarget,
  DemandMatchingPolicy,
  DemandStatus,
  DemandType,
  DemandVisibility,
} from './demand.entity';
import {
  DemandInvitation,
  DemandInvitationSourceType,
  DemandInvitationStatus,
} from './demand-invitation.entity';
import {
  serializeDemand,
  serializeDemandInvitation,
  serializeDemandInvitationAcceptResponse,
} from './demands.presenter';
import { PublicTaskIntent } from './public-task-intent.entity';

@Injectable()
export class DemandsService {
  constructor(
    private readonly idempotency: ApiIdempotencyService,
    private readonly candidateSearchIndex: CandidateSearchIndexService,
    private readonly contactPolicy: ContactPolicyService,
    @InjectRepository(Demand)
    private readonly demandRepo: Repository<Demand>,
    @InjectRepository(DemandCandidate)
    private readonly demandCandidateRepo: Repository<DemandCandidate>,
    @InjectRepository(DemandInvitation)
    private readonly demandInvitationRepo: Repository<DemandInvitation>,
    @InjectRepository(UserBlock)
    private readonly userBlockRepo: Repository<UserBlock>,
  ) {}

  async createDemand(
    ownerUserId: number,
    dto: CreateDemandDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      'demands.create',
      idempotencyKey,
      dto,
      (manager) => this.createDemandOnce(ownerUserId, dto, manager),
    );
  }

  async listMyDemands(ownerUserId: number, query: DemandQueryDto) {
    const where: FindOptionsWhere<Demand> = { ownerUserId };
    if (query.status) {
      where.status = this.parseDemandStatus(query.status);
    }
    if (query.visibility) {
      where.visibility = query.visibility;
    }
    const data = await this.demandRepo.find({
      where,
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
    return { data: data.map(serializeDemand) };
  }

  async getDemand(ownerUserId: number, id: string) {
    return serializeDemand(await this.requireDemand(ownerUserId, id));
  }

  async publishDemand(
    ownerUserId: number,
    id: string,
    dto: DemandVisibilityMutationDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      `demands.publish.${id}`,
      idempotencyKey,
      {
        id,
        visibility: dto.visibility ?? DemandVisibility.Public,
        hallTarget: dto.hallTarget ?? '',
        category: dto.category ?? '',
      },
      (manager) =>
        this.setDemandVisibilityOnce(
          ownerUserId,
          id,
          DemandVisibility.Public,
          dto,
          manager,
        ),
    );
  }

  async hideDemand(
    ownerUserId: number,
    id: string,
    dto: DemandVisibilityMutationDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      `demands.hide.${id}`,
      idempotencyKey,
      {
        id,
        visibility: dto.visibility ?? DemandVisibility.Hidden,
        hallTarget: dto.hallTarget ?? '',
        category: dto.category ?? '',
      },
      (manager) =>
        this.setDemandVisibilityOnce(
          ownerUserId,
          id,
          DemandVisibility.Hidden,
          dto,
          manager,
        ),
    );
  }

  async cancelDemand(
    ownerUserId: number,
    id: string,
    dto: CancelDemandDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      ownerUserId,
      `demands.cancel.${id}`,
      idempotencyKey,
      { id, reason: dto.reason ?? '' },
      (manager) => this.cancelDemandOnce(ownerUserId, id, dto.reason, manager),
    );
  }

  async getDemandCandidates(ownerUserId: number, id: string, limit: number) {
    const demand = await this.requireDemand(ownerUserId, id);
    if (!demand.publicIntentId && !demand.taskIntentId) {
      await this.withManager(async (manager) => {
        const fresh = await this.requireDemand(ownerUserId, id, manager);
        await this.ensureProjection(manager, fresh, fresh.visibility);
      });
    }

    const refreshed = await this.requireDemand(ownerUserId, id);
    const candidateLimit = Math.min(Math.max(limit, 1), 20);
    let persistedCandidates = await this.findReusableCandidates(
      refreshed.id,
      candidateLimit,
    );
    if (persistedCandidates.length === 0) {
      persistedCandidates = await this.generateDemandCandidates(
        refreshed,
        candidateLimit,
      );
    }

    const candidates = persistedCandidates.map((candidate) =>
      this.serializeDemandCandidate(refreshed, candidate),
    );
    refreshed.candidateCount = persistedCandidates.length;
    refreshed.status =
      persistedCandidates.length > 0
        ? DemandStatus.HasCandidates
        : DemandStatus.CandidatePool;
    await this.demandRepo.save(refreshed);
    return {
      demand: serializeDemand(refreshed),
      candidates,
      total: persistedCandidates.length,
    };
  }

  async createDemandInvitation(
    inviterUserId: number,
    dto: CreateDemandInvitationDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      inviterUserId,
      'meet-invitations.create',
      idempotencyKey,
      {
        inviteeUserId: dto.inviteeUserId,
        demandId: dto.demandId ?? '',
        candidateRecordId: dto.candidateRecordId ?? '',
        message: dto.message ?? '',
      },
      (manager) => this.createDemandInvitationOnce(inviterUserId, dto, manager),
    );
  }

  async listMyDemandInvitations(
    userId: number,
    query: DemandInvitationQueryDto,
  ) {
    const role = query.role === 'sent' ? 'sent' : 'received';
    const where =
      role === 'sent'
        ? { inviterUserId: userId, status: query.status }
        : { inviteeUserId: userId, status: query.status };
    const invitations = await this.demandInvitationRepo.find({
      where,
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
    return invitations.map(serializeDemandInvitation);
  }

  async getDemandInvitation(userId: number, id: number) {
    return serializeDemandInvitation(
      await this.requireDemandInvitation(userId, id),
    );
  }

  async acceptDemandInvitation(
    userId: number,
    id: number,
    dto: ResolveDemandInvitationDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      userId,
      `meet-invitations.accept.${id}`,
      idempotencyKey,
      { id, reason: dto.reason ?? '' },
      (manager) => this.acceptDemandInvitationOnce(userId, id, manager),
    );
  }

  async rejectDemandInvitation(
    userId: number,
    id: number,
    dto: ResolveDemandInvitationDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      userId,
      `meet-invitations.reject.${id}`,
      idempotencyKey,
      { id, reason: dto.reason ?? '' },
      (manager) =>
        this.resolveDemandInvitationOnce(
          userId,
          id,
          DemandInvitationStatus.Rejected,
          manager,
        ),
    );
  }

  async cancelDemandInvitation(
    userId: number,
    id: number,
    dto: ResolveDemandInvitationDto,
    idempotencyKey?: string,
  ) {
    return this.idempotency.run(
      userId,
      `meet-invitations.cancel.${id}`,
      idempotencyKey,
      { id, reason: dto.reason ?? '' },
      (manager) =>
        this.resolveDemandInvitationOnce(
          userId,
          id,
          DemandInvitationStatus.Cancelled,
          manager,
        ),
    );
  }

  private async createDemandOnce(
    ownerUserId: number,
    dto: CreateDemandDto,
    manager: EntityManager,
  ) {
    const repo = manager.getRepository(Demand);
    const visibility = dto.visibility;
    const fields = this.normalizeFields(dto.fields);
    const text = this.demandSourceText(dto.type, dto.title, dto.summary, fields);
    const hallTarget = this.normalizeHallTarget(
      dto.hallTarget,
      dto.type,
      visibility,
      text,
    );
    const demand = repo.create({
      id: `demand_${crypto.randomUUID()}`,
      ownerUserId,
      type: dto.type,
      title: this.cleanText(dto.title, 120),
      summary: this.cleanText(dto.summary, 2000),
      fields,
      visibility,
      hallTarget,
      category: this.normalizeDemandCategory(dto.category, dto.type, text),
      status:
        visibility === DemandVisibility.Public
          ? DemandStatus.Published
          : DemandStatus.Hidden,
      sourceConversationId: dto.sourceConversationId?.trim() || null,
      matchingPolicy: this.normalizeMatchingPolicy(dto.matchingPolicy),
      safetyFlags: this.normalizeStrings(dto.safetyFlags, 12, 80),
      publicIntentId: null,
      taskIntentId: null,
      candidateCount: 0,
    });
    await repo.save(demand);
    await this.ensureProjection(manager, demand, visibility);
    return serializeDemand(await repo.save(demand));
  }

  private async createDemandInvitationOnce(
    inviterUserId: number,
    dto: CreateDemandInvitationDto,
    manager: EntityManager,
  ) {
    const inviteeUserId = Number(dto.inviteeUserId);
    if (!Number.isFinite(inviteeUserId) || inviteeUserId <= 0) {
      throw new BadRequestException('inviteeUserId is required');
    }
    if (inviteeUserId === inviterUserId) {
      throw new BadRequestException('Cannot invite yourself');
    }
    const message = this.cleanText(dto.message, 500);
    if (!message) {
      throw new BadRequestException('message is required');
    }
    await this.contactPolicy.assertSociallyEligible(inviterUserId);
    await this.contactPolicy.assertSociallyEligible(inviteeUserId);
    await this.contactPolicy.assertNotBlocked(inviterUserId, inviteeUserId);
    await this.assertUserExists(inviteeUserId, manager);

    const demand = dto.demandId
      ? await this.requireDemand(inviterUserId, dto.demandId, manager)
      : null;
    const candidate = dto.candidateRecordId
      ? await this.requireOwnedDemandCandidate(
          inviterUserId,
          dto.candidateRecordId,
          manager,
        )
      : null;
    if (candidate && candidate.candidateUserId !== inviteeUserId) {
      throw new BadRequestException('candidateRecordId does not match invitee');
    }

    if (candidate) {
      const duplicate = await manager.getRepository(DemandInvitation).findOne({
        where: {
          demandId: demand?.id ?? candidate.demandId,
          candidateRecordId: candidate.id,
          inviteeUserId,
          status: DemandInvitationStatus.Pending,
        },
      });
      if (duplicate) return serializeDemandInvitation(duplicate);
    }

    const invitation = manager.getRepository(DemandInvitation).create({
      demandId: demand?.id ?? candidate?.demandId ?? dto.demandId ?? null,
      candidateRecordId: candidate?.id ?? dto.candidateRecordId ?? null,
      inviterUserId,
      inviteeUserId,
      sourceType: dto.sourceType ?? DemandInvitationSourceType.AgentCandidate,
      sourceId: this.cleanOptional(dto.sourceId, 120),
      publicIntentId: this.cleanOptional(dto.publicIntentId, 80),
      title: this.cleanText(dto.title, 120) || 'FitMeet 邀请',
      message,
      activityType: this.cleanText(dto.activityType, 80) || '约见',
      city: this.cleanOptional(dto.city, 80),
      locationText: this.cleanOptional(dto.locationText, 160),
      timeWindow: this.cleanOptional(dto.timeWindow, 160),
      capacityMin: dto.capacityMin ?? 1,
      capacityMax: dto.capacityMax ?? 2,
      status: DemandInvitationStatus.Pending,
      proposedMeetId: null,
      acceptedMeetId: null,
      conversationId: null,
      expiresAt: null,
      resolvedAt: null,
      metadata: {},
    });
    const saved = await manager
      .getRepository(DemandInvitation)
      .save(invitation);

    if (candidate) {
      candidate.status = DemandCandidateStatus.Invited;
      await manager.getRepository(DemandCandidate).save(candidate);
    }
    if (demand) {
      demand.status = DemandStatus.Invited;
      demand.candidateCount = Math.max(demand.candidateCount ?? 0, 1);
      await manager.getRepository(Demand).save(demand);
    }
    return serializeDemandInvitation(saved);
  }

  private async acceptDemandInvitationOnce(
    userId: number,
    id: number,
    manager: EntityManager,
  ) {
    const invitation = await this.lockDemandInvitation(id, manager);
    if (invitation.inviteeUserId !== userId) {
      throw new NotFoundException('Meet invitation not found');
    }
    if (invitation.status === DemandInvitationStatus.Accepted) {
      return serializeDemandInvitationAcceptResponse(invitation);
    }
    if (invitation.status !== DemandInvitationStatus.Pending) {
      throw new BadRequestException('Meet invitation already resolved');
    }
    await this.contactPolicy.assertSociallyEligible(invitation.inviterUserId);
    await this.contactPolicy.assertSociallyEligible(invitation.inviteeUserId);
    await this.contactPolicy.assertNotBlocked(
      invitation.inviterUserId,
      invitation.inviteeUserId,
    );
    invitation.status = DemandInvitationStatus.Accepted;
    invitation.resolvedAt = new Date();
    await manager.getRepository(DemandInvitation).save(invitation);
    await this.contactPolicy.grantOpenAccess(
      invitation.inviterUserId,
      invitation.inviteeUserId,
      'meet',
      invitation.id,
      userId,
      manager,
    );
    await this.writeDemandInvitationConversationOutbox(invitation, manager);
    if (invitation.demandId) {
      const demand = await manager
        .getRepository(Demand)
        .findOne({ where: { id: invitation.demandId } });
      if (demand) {
        demand.status = DemandStatus.MatchedCommunicating;
        await manager.getRepository(Demand).save(demand);
      }
    }
    return serializeDemandInvitationAcceptResponse(invitation);
  }

  private async resolveDemandInvitationOnce(
    userId: number,
    id: number,
    status: DemandInvitationStatus.Rejected | DemandInvitationStatus.Cancelled,
    manager: EntityManager,
  ) {
    const invitation = await this.lockDemandInvitation(id, manager);
    const isOwner =
      status === DemandInvitationStatus.Cancelled
        ? invitation.inviterUserId === userId
        : invitation.inviteeUserId === userId;
    if (!isOwner) {
      throw new NotFoundException('Meet invitation not found');
    }
    if (invitation.status === status)
      return serializeDemandInvitation(invitation);
    if (invitation.status !== DemandInvitationStatus.Pending) {
      throw new BadRequestException('Meet invitation already resolved');
    }
    invitation.status = status;
    invitation.resolvedAt = new Date();
    return serializeDemandInvitation(
      await manager.getRepository(DemandInvitation).save(invitation),
    );
  }

  private async setDemandVisibilityOnce(
    ownerUserId: number,
    id: string,
    visibility: DemandVisibility,
    dto: DemandVisibilityMutationDto,
    manager: EntityManager,
  ) {
    const demand = await this.requireDemand(ownerUserId, id, manager);
    if (demand.status === DemandStatus.Canceled) {
      throw new BadRequestException('Canceled demand cannot be changed');
    }
    demand.visibility = visibility;
    const text = this.demandSourceText(
      demand.type,
      demand.title,
      demand.summary,
      demand.fields,
    );
    demand.hallTarget = this.normalizeHallTarget(
      dto.hallTarget ?? demand.hallTarget,
      demand.type,
      visibility,
      text,
    );
    demand.category = this.normalizeDemandCategory(
      dto.category ?? demand.category,
      demand.type,
      text,
    );
    demand.status =
      visibility === DemandVisibility.Public
        ? DemandStatus.Published
        : DemandStatus.Hidden;
    await this.ensureProjection(manager, demand, visibility);
    return serializeDemand(await manager.getRepository(Demand).save(demand));
  }

  private async cancelDemandOnce(
    ownerUserId: number,
    id: string,
    reason: string | undefined,
    manager: EntityManager,
  ) {
    const demand = await this.requireDemand(ownerUserId, id, manager);
    demand.status = DemandStatus.Canceled;
    demand.candidateCount = 0;
    await this.tombstoneSocialProjection(manager, demand, {
      demandStatus: DemandStatus.Canceled,
      cancelReason: reason?.trim() || undefined,
    });
    await this.tombstoneTaskProjection(manager, demand, {
      demandStatus: DemandStatus.Canceled,
      cancelReason: reason?.trim() || undefined,
    });
    return serializeDemand(await manager.getRepository(Demand).save(demand));
  }

  private async ensureProjection(
    manager: EntityManager,
    demand: Demand,
    visibility: DemandVisibility,
  ) {
    if (visibility !== DemandVisibility.Public) {
      await this.tombstoneSocialProjection(manager, demand, {
        demandStatus: demand.status,
        visibility,
      });
      await this.tombstoneTaskProjection(manager, demand, {
        demandStatus: demand.status,
        visibility,
      });
      return null;
    }

    switch (demand.hallTarget) {
      case DemandHallTarget.TaskHall: {
        await this.tombstoneSocialProjection(manager, demand, {
          movedTo: DemandHallTarget.TaskHall,
        });
        return this.ensureTaskProjection(manager, demand);
      }
      case DemandHallTarget.HiddenMatching:
      case DemandHallTarget.None:
        await this.tombstoneSocialProjection(manager, demand, {
          demandStatus: demand.status,
          hallTarget: demand.hallTarget,
        });
        await this.tombstoneTaskProjection(manager, demand, {
          demandStatus: demand.status,
          hallTarget: demand.hallTarget,
        });
        return null;
      case DemandHallTarget.SocialHall:
      default:
        await this.tombstoneTaskProjection(manager, demand, {
          movedTo: DemandHallTarget.SocialHall,
        });
        return this.ensureSocialProjection(manager, demand, visibility);
    }
  }

  private async ensureSocialProjection(
    manager: EntityManager,
    demand: Demand,
    visibility: DemandVisibility,
  ) {
    const repo = manager.getRepository(PublicSocialIntent);
    let intent = demand.publicIntentId
      ? await repo.findOne({ where: { id: demand.publicIntentId } })
      : null;
    if (!intent) {
      intent = repo.create({
        id: `public_${crypto.randomUUID()}`,
        linkedSocialRequestId: null,
        candidateUserIds: [],
        matchedCount: 0,
        acceptedCount: 0,
        linkedMeetId: null,
        closesAt: null,
      });
    }

    const projection = this.buildPublicIntentProjection(demand, visibility);
    Object.assign(intent, projection);
    const saved = await repo.save(intent);
    demand.publicIntentId = saved.id;
    return saved;
  }

  private async ensureTaskProjection(manager: EntityManager, demand: Demand) {
    const repo = manager.getRepository(PublicTaskIntent);
    let task = demand.taskIntentId
      ? await repo.findOne({ where: { id: demand.taskIntentId } })
      : null;
    if (!task) {
      task = repo.create({
        id: `task_${crypto.randomUUID()}`,
        applicantCount: 0,
        acceptedApplicantId: null,
      });
    }

    Object.assign(task, this.buildTaskIntentProjection(demand));
    const saved = await repo.save(task);
    demand.taskIntentId = saved.id;
    return saved;
  }

  private buildPublicIntentProjection(
    demand: Demand,
    visibility: DemandVisibility,
  ): Partial<PublicSocialIntent> {
    const fieldText = demand.fields
      .map((field) => `${field.title} ${field.value}`)
      .join(' ');
    const city = sanitizeCity(
      demand.matchingPolicy?.city ||
        this.firstFieldValue(demand.fields, [
          '城市',
          '区域',
          '地点',
          '位置',
          '商圈',
          '校区',
        ]),
    );
    const loc = this.firstFieldValue(demand.fields, [
      '地点',
      '位置',
      '区域',
      '商圈',
      '校区',
    ]);
    const timePreference = this.firstFieldValue(demand.fields, [
      '时间',
      '日期',
      '时间安排',
      '频率',
    ]);
    const radiusKm = demand.matchingPolicy?.radiusKm ?? 5;
    const timeGeo = normalizeTimeGeoContext({});
    const dto = {
      requestType: demand.type,
      title: demand.title,
      description: demand.summary || fieldText || demand.title,
      city,
      loc,
      radiusKm,
      timePreference,
      verifiedOnly: true,
      interests: this.extractInterestTags(demand),
    };

    return {
      id: demand.publicIntentId ?? `public_${crypto.randomUUID()}`,
      userId: demand.ownerUserId,
      linkedSocialRequestId: null,
      source: 'demand',
      mode: visibility === DemandVisibility.Public ? 'public' : 'hidden',
      requestType: demand.type,
      title: demand.title,
      description: demand.summary || fieldText || demand.title,
      interestTags: dto.interests,
      city,
      locale: timeGeo.locale,
      countryCode: timeGeo.countryCode,
      timeZone: timeGeo.timeZone,
      utcOffsetMinutes: timeGeo.utcOffsetMinutes,
      geoHash: timeGeo.geoHash,
      loc,
      lat: null,
      lng: null,
      radiusKm,
      timePreference,
      locationPreference: loc,
      socialGoal: demand.type,
      riskLevel: classifyPublicSocialRisk(dto) ?? SocialRequestRiskLevel.Low,
      requiresUserConfirmation: true,
      filters: {
        verifiedOnly: true,
        interests: dto.interests,
        demandId: demand.id,
        visibility,
        hallTarget: demand.hallTarget,
        category: demand.category,
      },
      status: SocialRequestStatus.Searching,
      metadata: {
        source: 'demand',
        demandId: demand.id,
        demandType: demand.type,
        demandStatus: demand.status,
        hallTarget: demand.hallTarget,
        category: demand.category,
        visibility,
        sourceConversationId: demand.sourceConversationId,
        fields: demand.fields,
        matchingPolicy: demand.matchingPolicy,
        safetyFlags: demand.safetyFlags,
        tombstoned: false,
      },
      capacityMin: 1,
      capacityMax: 1,
      applicationPolicy: 'approval_required',
    };
  }

  private buildTaskIntentProjection(
    demand: Demand,
  ): Partial<PublicTaskIntent> {
    const fieldText = demand.fields
      .map((field) => `${field.title} ${field.value}`)
      .join(' ');
    const city = sanitizeCity(
      demand.matchingPolicy?.city ||
        this.firstFieldValue(demand.fields, [
          '城市',
          '区域',
          '地点',
          '位置',
          '商圈',
          '校区',
        ]),
    );
    const loc = this.firstFieldValue(demand.fields, [
      '地点',
      '位置',
      '区域',
      '商圈',
      '校区',
      '地址',
    ]);
    const timePreference = this.firstFieldValue(demand.fields, [
      '时间',
      '日期',
      '时间安排',
      '上门时间',
      '频率',
    ]);
    const budgetText = this.firstFieldValue(demand.fields, [
      '预算',
      '价格',
      '费用',
      '报酬',
    ]);
    const urgencyText = this.firstFieldValue(demand.fields, [
      '紧急程度',
      '时效',
      '优先级',
    ]);
    const text = `${demand.type} ${demand.title} ${demand.summary} ${fieldText}`;
    return {
      id: demand.taskIntentId ?? `task_${crypto.randomUUID()}`,
      userId: demand.ownerUserId,
      demandId: demand.id,
      source: 'demand',
      mode: demand.visibility === DemandVisibility.Public ? 'public' : 'hidden',
      requestType: demand.type,
      category:
        demand.category || this.normalizeDemandCategory('', demand.type, text),
      title: demand.title,
      summary: demand.summary || fieldText || demand.title,
      fields: demand.fields,
      city,
      loc,
      lat: null,
      lng: null,
      timePreference,
      budgetText,
      urgencyText,
      riskLevel: this.taskRiskLevel(text),
      applicationPolicy: 'owner_approval_required',
      status:
        demand.status === DemandStatus.Canceled ||
        demand.status === DemandStatus.Closed
          ? 'cancelled'
          : 'open',
      metadata: {
        source: 'demand',
        demandId: demand.id,
        demandType: demand.type,
        demandStatus: demand.status,
        hallTarget: demand.hallTarget,
        category: demand.category,
        visibility: demand.visibility,
        sourceConversationId: demand.sourceConversationId,
        fields: demand.fields,
        matchingPolicy: demand.matchingPolicy,
        safetyFlags: demand.safetyFlags,
        tombstoned: false,
      },
    };
  }

  private async tombstoneSocialProjection(
    manager: EntityManager,
    demand: Demand,
    metadata: Record<string, unknown> = {},
  ) {
    if (!demand.publicIntentId) return;
    const repo = manager.getRepository(PublicSocialIntent);
    const intent = await repo.findOne({ where: { id: demand.publicIntentId } });
    if (!intent) return;
    intent.status = SocialRequestStatus.Cancelled;
    intent.metadata = {
      ...(intent.metadata ?? {}),
      ...metadata,
      tombstoned: true,
    };
    await repo.save(intent);
  }

  private async tombstoneTaskProjection(
    manager: EntityManager,
    demand: Demand,
    metadata: Record<string, unknown> = {},
  ) {
    if (!demand.taskIntentId) return;
    const repo = manager.getRepository(PublicTaskIntent);
    const task = await repo.findOne({ where: { id: demand.taskIntentId } });
    if (!task) return;
    task.status = 'cancelled';
    task.metadata = {
      ...(task.metadata ?? {}),
      ...metadata,
      tombstoned: true,
    };
    await repo.save(task);
  }

  private async findReusableCandidates(demandId: string, limit: number) {
    return this.demandCandidateRepo.find({
      where: {
        demandId,
        status: In([
          DemandCandidateStatus.Recommended,
          DemandCandidateStatus.Viewed,
          DemandCandidateStatus.Invited,
        ]),
      },
      order: { score: 'DESC', updatedAt: 'DESC', id: 'ASC' },
      take: limit,
    });
  }

  private async generateDemandCandidates(demand: Demand, limit: number) {
    const searchRows = await this.candidateSearchIndex.search({
      ownerUserId: demand.ownerUserId,
      city: this.demandCity(demand),
      activityTypes: this.demandActivityTerms(demand),
      interestTags: this.demandInterestTerms(demand),
      timeBuckets: this.demandTimeTerms(demand),
      includeProfiles: true,
      includePublicIntents: false,
      limit: Math.max(limit * 4, 40),
    });
    const blockedUserIds = await this.loadMutualBlockedUserIds(
      demand.ownerUserId,
    );
    const scored = searchRows
      .filter((row) =>
        this.isEligibleDemandCandidate(demand, row, blockedUserIds),
      )
      .map((row) => this.scoreDemandCandidate(demand, row))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const saved: DemandCandidate[] = [];
    for (const candidate of scored) {
      const candidateUserId = candidate.row.userId;
      if (!candidateUserId) continue;
      const existing = await this.demandCandidateRepo.findOne({
        where: {
          demandId: demand.id,
          candidateUserId,
        },
      });
      const entity = Object.assign(
        existing ?? this.demandCandidateRepo.create(),
        {
          demandId: demand.id,
          ownerUserId: demand.ownerUserId,
          candidateUserId,
          source: 'candidate_search_index',
          sourceId: String(candidate.row.id),
          score: candidate.score,
          reasons: candidate.reasons,
          sharedPoints: candidate.sharedPoints,
          distanceText: candidate.distanceText,
          timeFitText: candidate.timeFitText,
          safetyNote: candidate.safetyNote,
          status: existing?.status ?? DemandCandidateStatus.Recommended,
          metadata: this.buildDemandCandidateMetadata(candidate.row),
        },
      );
      saved.push(await this.demandCandidateRepo.save(entity));
    }
    return saved;
  }

  private isEligibleDemandCandidate(
    demand: Demand,
    row: CandidateSearchIndex,
    blockedUserIds: Set<number>,
  ) {
    if (!row.userId || row.userId === demand.ownerUserId) return false;
    if (blockedUserIds.has(row.userId)) return false;
    if (row.sourceType !== CandidateSearchIndexSourceType.Profile) {
      return false;
    }
    if (this.isHumanConnectionDemand(demand.type)) {
      return (
        row.profileDiscoverable === true &&
        row.agentCanRecommendMe === true &&
        row.profileCompleteness >= 35
      );
    }
    return row.agentCanRecommendMe === true || row.profileDiscoverable === true;
  }

  private scoreDemandCandidate(demand: Demand, row: CandidateSearchIndex) {
    const demandCity = this.demandCity(demand);
    const demandArea = this.demandArea(demand);
    const demandTerms = this.demandInterestTerms(demand);
    const rowTags = this.rowTags(row);
    const sharedPoints = this.commonStrings(demandTerms, rowTags).slice(0, 5);
    const timeOverlap = this.commonStrings(
      this.demandTimeTerms(demand),
      row.timeBuckets ?? [],
    );

    let score = 0;
    const reasons: string[] = [];
    if (demandCity && row.city === demandCity) {
      score += 20;
      reasons.push(`同城：都在${demandCity}`);
    }
    if (demandArea && this.includesText(row.areaText, demandArea)) {
      score += 10;
      reasons.push(`区域接近：${row.areaText}`);
    }
    if (
      this.commonStrings(this.demandActivityTerms(demand), [
        ...(row.activityTypes ?? []),
        ...(row.socialScenes ?? []),
        ...(row.relationshipGoals ?? []),
      ]).length > 0
    ) {
      score += 20;
      reasons.push('需求类型匹配');
    }
    if (sharedPoints.length > 0) {
      score += Math.min(25, sharedPoints.length * 8);
      reasons.push(`共同点：${sharedPoints.slice(0, 3).join('、')}`);
    }
    if (timeOverlap.length > 0) {
      score += 10;
      reasons.push(`时间适配：${timeOverlap[0]}`);
    }
    score += Math.min(10, Math.round((row.profileCompleteness ?? 0) / 10));
    if (row.lastActiveAt) {
      score += 5;
    }

    const fallbackReason =
      demandCity && row.city === demandCity
        ? `同城且需求关键词接近，适合先发邀请确认。`
        : `需求关键词接近，适合先通过站内邀请确认。`;
    return {
      row,
      score: Math.max(1, Math.min(100, score)),
      reasons: reasons.length > 0 ? reasons : [fallbackReason],
      sharedPoints,
      distanceText: row.areaText
        ? `${row.city || '附近'} · ${row.areaText}`
        : row.city || '附近候选',
      timeFitText:
        timeOverlap[0] ??
        (row.timeBuckets?.[0] ? `常见时间：${row.timeBuckets[0]}` : ''),
      safetyNote: this.isHumanConnectionDemand(demand.type)
        ? '已通过基础推荐授权；先邀请，对方接受后再开放私信。'
        : '建议先站内确认资质、时间和费用；不要提前转账或泄露隐私。',
    };
  }

  private serializeDemandCandidate(demand: Demand, candidate: DemandCandidate) {
    const metadata = candidate.metadata ?? {};
    const displayName =
      this.metadataString(metadata.displayName) || 'FitMeet 候选人';
    const city = this.metadataString(metadata.city);
    const interestTags = this.metadataStringArray(metadata.interestTags);
    const isServiceDemand = demand.type === DemandType.Service;
    const suggestedOpener = isServiceDemand
      ? this.suggestedServiceOpener(demand, displayName)
      : this.suggestedOpener(demand, displayName);
    return {
      source: 'demand',
      isRealData: true,
      targetUserId: candidate.candidateUserId,
      userId: candidate.candidateUserId,
      candidateUserId: candidate.candidateUserId,
      candidateRecordId: candidate.id,
      publicIntentId: demand.publicIntentId,
      displayName,
      nickname: displayName,
      avatar: this.metadataString(metadata.avatar) || null,
      color: this.metadataString(metadata.color) || null,
      city: city || null,
      score: candidate.score,
      matchScore: candidate.score,
      level: `匹配度：${candidate.score}`,
      commonTags: candidate.sharedPoints,
      reasons: candidate.reasons,
      interestTags,
      matchReasons: candidate.reasons,
      riskWarnings: candidate.safetyNote ? [candidate.safetyNote] : [],
      suggestedOpener,
      suggestedMessage: suggestedOpener,
      candidateExplanation: {
        fitReasons: candidate.reasons,
        suggestedOpener,
        awkwardPoints: [],
        safeFirstStep: candidate.safetyNote,
        nextActionSuggestion: isServiceDemand
          ? '查看服务者后发送联系请求，对方接受前不直接开放聊天。'
          : '查看详情后发送邀请，对方接受前不开放私信。',
        requiresConfirmation: true,
      },
      status: candidate.status,
      safetyState: 'normal',
      moderationState: 'clean',
      verificationStatus: 'verified',
      isOnline: false,
      onlineStatus: 'recently_active',
      lastActiveText: candidate.timeFitText || candidate.distanceText,
    };
  }

  private buildDemandCandidateMetadata(row: CandidateSearchIndex) {
    return {
      indexId: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      avatar: null,
      color: null,
      displayName: row.displayName,
      city: row.city,
      areaText: row.areaText,
      activityTypes: row.activityTypes ?? [],
      interestTags: row.interestTags ?? [],
      lifestyleTags: row.lifestyleTags ?? [],
      socialScenes: row.socialScenes ?? [],
      relationshipGoals: row.relationshipGoals ?? [],
      timeBuckets: row.timeBuckets ?? [],
      publicSummary: row.publicSummary,
      trustScore: row.trustScore,
      profileCompleteness: row.profileCompleteness,
    };
  }

  private async loadMutualBlockedUserIds(ownerUserId: number) {
    const blocks = await this.userBlockRepo.find({
      where: [{ blockerId: ownerUserId }, { blockedId: ownerUserId }],
    });
    const blocked = new Set<number>();
    for (const block of blocks) {
      if (block.blockerId === ownerUserId) blocked.add(block.blockedId);
      else if (block.blockedId === ownerUserId) blocked.add(block.blockerId);
    }
    return blocked;
  }

  private demandCity(demand: Demand) {
    return sanitizeCity(
      demand.matchingPolicy?.city ||
        this.firstFieldValue(demand.fields, [
          '城市',
          '区域',
          '地点',
          '位置',
          '商圈',
          '校区',
        ]),
    );
  }

  private demandArea(demand: Demand) {
    return this.cleanText(
      this.firstFieldValue(demand.fields, [
        '区域',
        '地点',
        '位置',
        '商圈',
        '校区',
        '附近',
      ]),
      80,
    );
  }

  private demandActivityTerms(demand: Demand) {
    return this.normalizeStrings(
      [
        demand.type,
        demand.title,
        this.firstFieldValue(demand.fields, [
          '类型',
          '服务类型',
          '训练类型',
          '活动类型',
          '需求类型',
          '运动',
        ]),
        ...(demand.matchingPolicy?.hardFilters ?? []),
      ],
      16,
      80,
    );
  }

  private demandInterestTerms(demand: Demand) {
    return this.normalizeStrings(
      [
        ...this.extractInterestTags(demand),
        demand.title,
        demand.summary,
        ...demand.fields.map((field) => `${field.title} ${field.value}`),
        ...(demand.matchingPolicy?.softPreferences ?? []),
      ],
      24,
      80,
    );
  }

  private demandTimeTerms(demand: Demand) {
    return this.normalizeStrings(
      [
        this.firstFieldValue(demand.fields, [
          '时间',
          '日期',
          '时间安排',
          '频率',
          '紧急程度',
        ]),
      ],
      12,
      80,
    );
  }

  private isHumanConnectionDemand(type: Demand['type']) {
    return [
      DemandType.Friends,
      DemandType.Dating,
      DemandType.Workout,
      DemandType.Buddy,
      DemandType.Travel,
    ].includes(type);
  }

  private rowTags(row: CandidateSearchIndex) {
    return this.normalizeStrings(
      [
        row.displayName,
        row.city,
        row.areaText,
        row.publicSummary,
        ...(row.activityTypes ?? []),
        ...(row.interestTags ?? []),
        ...(row.lifestyleTags ?? []),
        ...(row.socialScenes ?? []),
        ...(row.relationshipGoals ?? []),
        ...(row.timeBuckets ?? []),
      ],
      40,
      80,
    );
  }

  private commonStrings(left: string[], right: string[]) {
    const normalizedRight = right.map((value) => value.trim()).filter(Boolean);
    const common: string[] = [];
    for (const value of left) {
      const text = value.trim();
      if (!text) continue;
      const leftKey = text.toLowerCase();
      const matched = normalizedRight.some((candidate) => {
        const rightKey = candidate.toLowerCase();
        return leftKey.includes(rightKey) || rightKey.includes(leftKey);
      });
      if (matched && !common.includes(text)) common.push(text);
    }
    return common;
  }

  private includesText(value: string | null | undefined, keyword: string) {
    const haystack = `${value ?? ''}`.trim().toLowerCase();
    const needle = keyword.trim().toLowerCase();
    return (
      haystack.length > 0 && needle.length > 0 && haystack.includes(needle)
    );
  }

  private metadataString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private metadataStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return this.normalizeStrings(
      value.filter((item): item is string => typeof item === 'string'),
      12,
      40,
    );
  }

  private suggestedOpener(demand: Demand, displayName: string) {
    const city = this.demandCity(demand);
    const cityText = city ? `在${city}` : '';
    return `你好${displayName ? `，${displayName}` : ''}，我也${cityText}关注「${demand.title}」这个需求，时间和偏好看起来比较合适，要不要先聊一下？`;
  }

  private suggestedServiceOpener(demand: Demand, displayName: string) {
    const area = this.demandArea(demand);
    const areaText = area ? `地点在${area}` : '地点可以再确认';
    return `你好${displayName ? `，${displayName}` : ''}，我有「${demand.title}」这个服务需求，${areaText}。方便的话先沟通一下时间、价格和服务边界吗？`;
  }

  private async assertUserExists(userId: number, manager: EntityManager) {
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
  }

  private async requireOwnedDemandCandidate(
    ownerUserId: number,
    id: number,
    manager: EntityManager,
  ) {
    const candidate = await manager.getRepository(DemandCandidate).findOne({
      where: { id, ownerUserId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!candidate) {
      throw new NotFoundException('Demand candidate not found');
    }
    return candidate;
  }

  private async requireDemandInvitation(userId: number, id: number) {
    const invitation = await this.demandInvitationRepo.findOne({
      where: [
        { id, inviterUserId: userId },
        { id, inviteeUserId: userId },
      ],
    });
    if (!invitation) {
      throw new NotFoundException('Meet invitation not found');
    }
    return invitation;
  }

  private async lockDemandInvitation(id: number, manager: EntityManager) {
    const invitation = await manager.getRepository(DemandInvitation).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invitation) {
      throw new NotFoundException('Meet invitation not found');
    }
    return invitation;
  }

  private async writeDemandInvitationConversationOutbox(
    invitation: DemandInvitation,
    manager: EntityManager,
  ) {
    await manager
      .getRepository(DomainOutboxEvent)
      .createQueryBuilder()
      .insert()
      .values({
        eventType: 'conversation.provision_requested',
        aggregateType: 'demand_invitation',
        aggregateId: String(invitation.id),
        dedupeKey: `demand_invitation:${invitation.id}:conversation`,
        payload: {
          invitationId: invitation.id,
          ownerUserId: invitation.inviterUserId,
          applicantUserId: invitation.inviteeUserId,
          title: invitation.title,
          ...(invitation.demandId ? { demandId: invitation.demandId } : {}),
          ...(invitation.candidateRecordId
            ? { candidateRecordId: invitation.candidateRecordId }
            : {}),
        },
        status: 'pending',
        attemptCount: 0,
        availableAt: new Date(),
        processedAt: null,
        lastError: '',
      })
      .orIgnore()
      .execute();
  }

  private async requireDemand(
    ownerUserId: number,
    id: string,
    manager?: EntityManager,
  ) {
    const repo = manager?.getRepository(Demand) ?? this.demandRepo;
    const demand = await repo.findOne({ where: { id, ownerUserId } });
    if (!demand) {
      throw new NotFoundException('Demand not found');
    }
    return demand;
  }

  private async withManager<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ) {
    return this.demandRepo.manager.transaction(operation);
  }

  private parseDemandStatus(value: string) {
    const status = value.trim() as DemandStatus;
    if (!Object.values(DemandStatus).includes(status)) {
      throw new BadRequestException('Invalid demand status');
    }
    return status;
  }

  private normalizeFields(fields: DemandCardFieldDto[]): DemandCardField[] {
    return (fields ?? []).slice(0, 6).map((field) => ({
      id:
        field.id?.trim() ||
        `${field.title.trim()}-${field.value.trim()}-${field.systemName?.trim() || 'text.alignleft'}`,
      title: this.cleanText(field.title, 40),
      value: this.cleanText(field.value, 180),
      systemName: this.cleanText(field.systemName || 'text.alignleft', 80),
      importance: field.importance?.trim() || undefined,
      privacy: field.privacy?.trim() || undefined,
    }));
  }

  private normalizeMatchingPolicy(
    policy: CreateDemandDto['matchingPolicy'],
  ): DemandMatchingPolicy {
    return {
      city: policy?.city?.trim() || undefined,
      radiusKm: policy?.radiusKm,
      hardFilters: this.normalizeStrings(policy?.hardFilters, 12, 80),
      softPreferences: this.normalizeStrings(policy?.softPreferences, 12, 80),
    };
  }

  private normalizeStrings(
    values: string[] | undefined,
    maxCount: number,
    maxLength: number,
  ) {
    return (values ?? [])
      .map((value) => this.cleanText(value, maxLength))
      .filter(Boolean)
      .slice(0, maxCount);
  }

  private firstFieldValue(fields: DemandCardField[], titles: string[]) {
    const matched = fields.find((field) =>
      titles.some((title) => field.title.includes(title)),
    );
    return matched?.value?.trim() ?? '';
  }

  private extractInterestTags(demand: Demand) {
    const text = [
      demand.type,
      demand.title,
      demand.summary,
      ...demand.fields.map((field) => `${field.title} ${field.value}`),
      ...(demand.matchingPolicy?.hardFilters ?? []),
      ...(demand.matchingPolicy?.softPreferences ?? []),
    ].join(' ');
    return Array.from(
      new Set([
        demand.type,
        ...extractPublicRequestKeywords(text),
        ...this.normalizeStrings(demand.matchingPolicy?.softPreferences, 8, 40),
      ]),
    ).slice(0, 12);
  }

  private demandSourceText(
    type: DemandType,
    title: string | undefined,
    summary: string | undefined,
    fields: DemandCardField[],
  ) {
    return [
      type,
      title ?? '',
      summary ?? '',
      ...fields.map((field) => `${field.title} ${field.value}`),
    ]
      .join(' ')
      .toLowerCase();
  }

  private normalizeHallTarget(
    requested: DemandHallTarget | undefined,
    type: DemandType,
    visibility: DemandVisibility,
    text: string,
  ) {
    if (visibility !== DemandVisibility.Public) {
      return DemandHallTarget.HiddenMatching;
    }
    if (requested && Object.values(DemandHallTarget).includes(requested)) {
      return requested;
    }
    return this.defaultHallTarget(type, text);
  }

  private defaultHallTarget(type: DemandType, text: string) {
    if (
      [DemandType.Service, DemandType.Housing, DemandType.Help].includes(type)
    ) {
      return DemandHallTarget.TaskHall;
    }
    if (type === DemandType.Activity && this.isTaskLikeActivity(text)) {
      return DemandHallTarget.TaskHall;
    }
    if (type === DemandType.Other && this.isTaskLikeActivity(text)) {
      return DemandHallTarget.TaskHall;
    }
    return DemandHallTarget.SocialHall;
  }

  private isTaskLikeActivity(text: string) {
    return [
      '收费',
      '付费',
      '报价',
      '预算',
      '服务',
      '上门',
      '开锁',
      '维修',
      '搬家',
      '家政',
      '保洁',
      '课程',
      '家教',
      '摄影师',
      '跟拍',
      '修',
      '租房',
      '找房',
      '室友',
      '跑腿',
      '代办',
      '求助',
      '急需',
      '帮忙',
      'repair',
      'service',
      'paid',
      'budget',
      'tutor',
      'photographer',
      'moving',
      'housing',
      'errand',
    ].some((keyword) => text.includes(keyword));
  }

  private normalizeDemandCategory(
    requested: string | undefined,
    type: DemandType,
    text: string,
  ) {
    const cleaned = this.cleanText(requested, 40);
    if (cleaned) return cleaned;
    if (this.defaultHallTarget(type, text) === DemandHallTarget.TaskHall) {
      return this.inferTaskCategory(type, text);
    }
    return this.inferSocialCategory(type, text);
  }

  private inferTaskCategory(type: DemandType, text: string) {
    if (type === DemandType.Housing || text.includes('找房') || text.includes('租房') || text.includes('合租')) return 'housing';
    if (text.includes('开锁') || text.includes('锁')) return 'locksmith';
    if (text.includes('维修') || text.includes('修')) return 'repair';
    if (text.includes('搬家')) return 'moving';
    if (text.includes('家政') || text.includes('保洁')) return 'housekeeping';
    if (text.includes('家教') || text.includes('辅导')) return 'tutor';
    if (text.includes('摄影') || text.includes('跟拍')) return 'photography';
    if (text.includes('课程') || text.includes('培训')) return 'course';
    if (text.includes('跑腿') || text.includes('代办')) return 'errand';
    if (type === DemandType.Help || text.includes('求助') || text.includes('帮忙')) return 'help';
    return 'service';
  }

  private inferSocialCategory(type: DemandType, text: string) {
    if (type === DemandType.Workout) return 'workout';
    if (type === DemandType.Friends) return 'friends';
    if (type === DemandType.Dating) return 'dating';
    if (type === DemandType.Travel) return 'travel';
    if (text.includes('饭') || text.includes('吃')) return 'meal';
    if (text.includes('电影') || text.includes('影院')) return 'movie';
    if (text.includes('展') || text.includes('展览')) return 'exhibition';
    if (text.includes('运动局') || text.includes('羽毛球') || text.includes('健身') || text.includes('跑步')) return 'sports';
    if (type === DemandType.Buddy) return 'buddy';
    return 'social';
  }

  private taskRiskLevel(text: string) {
    if (text.includes('开锁') || text.includes('上门') || text.includes('急需')) {
      return 'high';
    }
    if (text.includes('维修') || text.includes('搬家') || text.includes('家政')) {
      return 'medium';
    }
    return 'low';
  }

  private cleanText(value: string | undefined, maxLength: number) {
    return `${value ?? ''}`.trim().slice(0, maxLength);
  }

  private cleanOptional(value: string | undefined, maxLength: number) {
    const cleaned = this.cleanText(value, maxLength);
    return cleaned || null;
  }
}
