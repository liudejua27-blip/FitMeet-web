import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialRequestsService } from './social-requests.service';
import {
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from './social-request.entity';
import { CreateSocialRequestDto as NewCreateSocialRequestDto } from './dto/create-social-request.dto';
import { CreateSocialRequestDto as LegacyCreateSocialRequestDto } from '../agent-gateway/dto/agent-gateway.dto';
import { MatchService, MatchedCandidateView } from '../match/match.service';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import {
  SocialRequestStatus as LegacyStatus,
  SocialRequestRiskLevel as LegacyRiskLevel,
} from '../agent-gateway/entities/social-request.entity';
import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import {
  AgentActivityLog,
  LoggedAction,
  ActionResult,
} from '../agent-gateway/entities/agent-activity-log.entity';
import { MessagesService } from '../messages/messages.service';
import { sanitizeCity } from '../common/city.util';
import { AgentSideEffectLedgerService } from '../agent-gateway/agent-side-effect-ledger.service';

/**
 * Bridges the legacy agent-gateway social-request surface (which used
 * the `social_requests` table + `{requestType, description, timePreference}`
 * DTO + `SocialRequestStatus` searching/matched/closed/cancelled) onto
 * the canonical `user_social_requests` table + `SocialRequestsService` +
 * `MatchService`.
 *
 * All new writes go to `user_social_requests`. Reads are reshaped to the
 * legacy frontend `{ id, requestType, candidateUserIds, matchedCount,
 * status: 'searching'|'matched'|'closed'|'cancelled', riskLevel, ... }`
 * shape so existing consumers (`/api/agents/social-requests`,
 * `/api/agent/social-requests`) keep working without any frontend change.
 */
@Injectable()
export class AgentSocialRequestAdapter {
  private readonly logger = new Logger(AgentSocialRequestAdapter.name);

  constructor(
    private readonly socialRequests: SocialRequestsService,
    private readonly matches: MatchService,
    @InjectRepository(UserSocialRequest)
    private readonly repo: Repository<UserSocialRequest>,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(AgentActivityLog)
    private readonly logRepo: Repository<AgentActivityLog>,
    private readonly messages: MessagesService,
    @Optional()
    private readonly sideEffectLedger?: AgentSideEffectLedgerService,
  ) {}

  /** POST /api/agents/social-requests  and  POST /api/agent/social-requests */
  async createFromLegacy(
    userId: number,
    dto: LegacyCreateSocialRequestDto,
    agent: AgentConnection | null,
  ) {
    const newDto = this.legacyToNewDto(dto);
    const request = await this.socialRequests.create(userId, newDto, {
      agent,
    });
    const limit = Math.min(dto.limit ?? 10, 20);
    const { candidates } = await this.runInitialMatchWithLedger(
      request.id,
      userId,
      limit,
      agent,
    );
    const refreshed = (await this.repo.findOne({ where: { id: request.id } }))!;
    if (agent) {
      const handoff = {
        openClawNextStep: 'present_results_to_owner',
        ownerDecisionEndpoint: `/api/agent/social-requests/${request.id}/candidates/decision`,
        allowedDecisions: ['approve', 'reject'],
        allowedConnectionActions: [
          'none',
          'send_intro',
          'request_contact_exchange',
        ],
      };
      try {
        await this.logRepo.save(
          this.logRepo.create({
            agentConnectionId: agent.id,
            userId: agent.userId,
            ownerUserId: agent.userId,
            action: LoggedAction.CreateSocialRequest,
            eventType: 'match.completed',
            status: 'success',
            payload: {
              requestType: dto.requestType,
              requestId: request.id,
              resultCount: candidates.length,
            },
            result: ActionResult.Success,
            riskScore: 0,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `agent match activity log failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      try {
        await this.messages.createAgentMessageEvent({
          agentConnectionId: agent.id,
          ownerUserId: agent.userId,
          eventType: 'match.completed',
          requestId: request.id,
          contentPreview: `已为你匹配到 ${candidates.length} 位候选人`,
          dedupeKey: `${agent.id}:match.completed:${request.id}`,
          metadata: {
            requestId: request.id,
            candidateCount: candidates.length,
            candidates: candidates.slice(0, 10).map((candidate) => ({
              candidateUserId: candidate.userId,
              candidateRecordId: candidate.candidateRecordId ?? null,
              score: candidate.score,
              level: candidate.level,
              reasonTags: candidate.commonTags ?? [],
            })),
            ...handoff,
          },
        });
      } catch (err) {
        this.logger.warn(
          `agent match message event failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    const handoff = {
      openClawNextStep: 'present_results_to_owner',
      ownerDecisionEndpoint: `/api/agent/social-requests/${request.id}/candidates/decision`,
      allowedDecisions: ['approve', 'reject'],
      allowedConnectionActions: [
        'none',
        'send_intro',
        'request_contact_exchange',
      ],
    };
    return {
      request: this.toLegacyShape(refreshed, candidates),
      candidates: candidates.map((c) => this.toLegacyCandidate(c)),
      matchedBy: 'fitmeet_matching_engine',
      handoff,
    };
  }

  /** GET /api/agents/social-requests */
  async listForUser(userId: number) {
    const { items } = await this.socialRequests.findOwn(userId, { limit: 50 });
    return items.map((r) => this.toLegacyShape(r));
  }

  private async runInitialMatchWithLedger(
    requestId: number,
    userId: number,
    limit: number,
    agent: AgentConnection | null,
  ) {
    if (!this.sideEffectLedger) {
      return this.matches.runMatch(requestId, userId, { limit });
    }
    const { result } = await this.sideEffectLedger.run(
      {
        ownerUserId: userId,
        agentTaskId: null,
        actionType: 'search_candidates',
        idempotencyKey: `legacy_social_request_match:${requestId}:limit:${limit}`,
        resourceType: 'social_request',
        resourceId: requestId,
        metadata: {
          requestId,
          limit,
          agentConnectionId: agent?.id ?? null,
          source: 'agent_social_request_adapter',
        },
      },
      () => this.matches.runMatch(requestId, userId, { limit }),
    );
    return result as {
      socialRequestId: number;
      candidates: MatchedCandidateView[];
    };
  }

  /** GET /api/agent/social-requests/:id/matches */
  async getMatchesForRequest(userId: number, requestId: number) {
    const request = await this.repo.findOne({ where: { id: requestId } });
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Social request not found');
    }
    // Re-run matching to refresh suggestions (mirrors legacy behaviour).
    const { candidates } = await this.matches.runMatch(requestId, userId, {
      limit: 10,
    });
    const refreshed = (await this.repo.findOne({ where: { id: requestId } }))!;
    return {
      request: this.toLegacyShape(refreshed, candidates),
      candidates: candidates.map((c) => this.toLegacyCandidate(c)),
      matchedBy: 'fitmeet_matching_engine',
      handoff: {
        openClawNextStep: 'ask_owner_to_confirm_candidate',
        ownerDecisionEndpoint: `/api/agent/social-requests/${requestId}/candidates/decision`,
        allowedDecisions: ['approve', 'reject'],
        allowedConnectionActions: [
          'none',
          'send_intro',
          'request_contact_exchange',
        ],
      },
    };
  }

  /**
   * Validate the (requestId, candidateUserId) pair against the new
   * `user_social_requests` + `social_request_candidates` tables.
   * Returns the loaded request for the caller to use when building
   * intro messages etc.
   */
  async loadOwnedRequest(
    userId: number,
    requestId: number,
  ): Promise<UserSocialRequest> {
    const request = await this.repo.findOne({ where: { id: requestId } });
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Social request not found');
    }
    return request;
  }

  async assertCandidateBelongsTo(
    requestId: number,
    candidateUserId: number,
  ): Promise<void> {
    const exists = await this.candidateRepo.findOne({
      where: { socialRequestId: requestId, candidateUserId },
    });
    if (!exists) {
      throw new BadRequestException(
        'Candidate does not belong to this FitMeet match result',
      );
    }
  }

  /** Title used for intro messages — stable across the codebase. */
  buildIntroTitle(request: UserSocialRequest): string {
    return request.title || request.description || '社交需求';
  }

  // ── DTO mapping ────────────────────────────────────────

  private legacyToNewDto(
    dto: LegacyCreateSocialRequestDto,
  ): NewCreateSocialRequestDto {
    const type = this.inferType(dto.requestType, dto.description);
    const metadata = this.legacyMetadata(dto, type);
    return {
      type,
      title: dto.title ?? this.autoTitle(type, dto.description),
      description: dto.description ?? '',
      rawText: dto.description ?? '',
      city: sanitizeCity(dto.city),
      lat: dto.lat,
      lng: dto.lng,
      radiusKm: dto.radiusKm,
      interestTags: dto.interests,
      activityType: dto.requestType,
      safetyRequirement: dto.verifiedOnly
        ? SocialRequestSafety.VerifiedOnly
        : undefined,
      visibility:
        dto.visibility === 'public'
          ? SocialRequestVisibility.Public
          : dto.visibility === 'private'
            ? SocialRequestVisibility.Private
            : SocialRequestVisibility.MatchedOnly,
      metadata,
      // status defaults to Matching inside the service
    };
  }

  private legacyMetadata(
    dto: LegacyCreateSocialRequestDto,
    type: SocialRequestType,
  ): Record<string, unknown> {
    const taskSlotSummary: Record<string, string> = {};
    const completedSlots: string[] = [];
    const addSlot = (key: string, value: unknown) => {
      const text = this.cleanMetadataText(value);
      if (!text) return;
      taskSlotSummary[key] = text;
      completedSlots.push(key);
    };

    addSlot('activity', dto.requestType || type);
    addSlot('time_window', dto.timePreference);
    addSlot('location_text', dto.loc);
    addSlot('geo_area', dto.city);

    const metadata: Record<string, unknown> = {
      legacyAgentRequest: true,
      originalRequestType: this.cleanMetadataText(dto.requestType) || type,
    };
    const timePreference = this.cleanMetadataText(dto.timePreference);
    if (timePreference) metadata.timePreference = timePreference;
    const locationPreference = this.cleanMetadataText(dto.loc);
    if (locationPreference) {
      metadata.locationPreference = locationPreference;
      metadata.nearbyArea = locationPreference;
    }
    const city = sanitizeCity(dto.city);
    if (city) metadata.city = city;
    if (dto.visibility) metadata.visibility = dto.visibility;
    if (typeof dto.verifiedOnly === 'boolean') {
      metadata.verifiedOnly = dto.verifiedOnly;
    }
    if (Array.isArray(dto.interests) && dto.interests.length > 0) {
      metadata.interestTags = dto.interests.filter(Boolean).slice(0, 20);
    }
    if (Object.keys(taskSlotSummary).length > 0) {
      metadata.taskSlotSummary = taskSlotSummary;
      metadata.knownTaskSlotConstraints = {
        source: 'legacy_agent_social_request',
        doNotAskAgainFor: completedSlots,
        taskSlotsAreHardConstraints: true,
      };
    }
    return metadata;
  }

  private cleanMetadataText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  private inferType(
    requestType: string,
    description?: string,
  ): SocialRequestType {
    const haystack = `${requestType ?? ''} ${description ?? ''}`.toLowerCase();
    if (/run|跑步/.test(haystack)) return SocialRequestType.RunningPartner;
    if (/gym|健身|workout|训练/.test(haystack))
      return SocialRequestType.FitnessPartner;
    if (/dog|遛狗/.test(haystack)) return SocialRequestType.DogWalking;
    if (/coffee|咖啡/.test(haystack)) return SocialRequestType.CoffeeChat;
    if (/walk|散步|citywalk|遛弯|压马路/.test(haystack))
      return SocialRequestType.CityWalk;
    if (/study|自习|学习/.test(haystack)) return SocialRequestType.StudyPartner;
    return SocialRequestType.Custom;
  }

  private autoTitle(type: SocialRequestType, raw?: string): string {
    if (raw && raw.trim().length > 0 && raw.trim().length <= 40) {
      return raw.trim();
    }
    const map: Record<SocialRequestType, string> = {
      [SocialRequestType.RunningPartner]: '寻找跑步搭子',
      [SocialRequestType.FitnessPartner]: '寻找健身搭子',
      [SocialRequestType.DogWalking]: '寻找遛狗搭子',
      [SocialRequestType.CoffeeChat]: '咖啡聊聊',
      [SocialRequestType.CityWalk]: '城市散步',
      [SocialRequestType.StudyPartner]: '学习搭子',
      [SocialRequestType.Custom]: '社交需求',
    };
    return map[type];
  }

  // ── Response shaping (legacy frontend contract) ────────

  /** Mirror of frontend `SocialRequest` interface. */
  private toLegacyShape(
    r: UserSocialRequest,
    candidates?: MatchedCandidateView[],
  ) {
    const metadata = this.metadataRecord(r.metadata);
    const candidateUserIds =
      candidates?.map((c) => c.userId) ??
      (metadata.candidateUserIds as number[] | undefined) ??
      [];
    const locationPreference =
      this.cleanMetadataText(metadata.locationPreference) ||
      this.cleanMetadataText(metadata.nearbyArea);
    const timePreference =
      this.formatTimePreference(r.timeStart, r.timeEnd) ||
      this.cleanMetadataText(metadata.timePreference);
    return {
      id: r.id,
      userId: r.userId,
      agentConnectionId: r.agentId,
      requestType: r.activityType || r.type,
      title: r.title,
      description: r.description,
      city: r.city,
      loc: locationPreference,
      lat: r.lat,
      lng: r.lng,
      radiusKm: r.radiusKm,
      timePreference,
      visibility:
        r.visibility === SocialRequestVisibility.Public
          ? 'public'
          : r.visibility === SocialRequestVisibility.Private
            ? 'private'
            : 'matched_users_only',
      riskLevel: this.deriveRiskLevel(r),
      requiresUserConfirmation: r.requireUserConfirmation,
      filters: {
        verifiedOnly: r.safetyRequirement === SocialRequestSafety.VerifiedOnly,
        interests: r.interestTags ?? [],
      },
      candidateUserIds,
      matchedCount: candidateUserIds.length,
      status: this.mapStatus(r.status),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private metadataRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toLegacyCandidate(c: MatchedCandidateView) {
    return {
      profile: {
        id: c.userId,
        name: c.nickname,
        avatar: c.avatar,
        color: c.color,
        // Match shape expected by the legacy frontend; fields not provided
        // by MatchedCandidateView are filled with safe defaults.
        age: 0,
        city: '',
        bio: '',
        verified: false,
        interestTags: c.commonTags,
      },
      score: c.score,
      reasonTags: c.commonTags,
      reasonText: c.reasons.join('；'),
      nextAction: 'draft_invitation' as const,
      // Extra fields the new frontend may consume; legacy frontend ignores them.
      level: c.level,
      distanceKm: c.distanceKm,
      risk: c.risk,
      suggestedMessage: c.suggestedMessage,
      candidateRecordId: c.candidateRecordId,
      reasonerSource: c.reasonerSource,
      reasoningConfidence: c.reasoningConfidence,
      reasoningDegraded: c.reasoningDegraded,
      reasoningRetryable: c.reasoningRetryable,
      degraded: c.reasoningDegraded,
      retryable: c.reasoningRetryable,
      matchReasoner: {
        source: c.reasonerSource,
        confidence: c.reasoningConfidence,
        degraded: c.reasoningDegraded,
        retryable: c.reasoningRetryable,
        degradationReason: c.degradationReason ?? null,
      },
    };
  }

  private mapStatus(s: UserSocialRequestStatus): LegacyStatus {
    switch (s) {
      case UserSocialRequestStatus.Draft:
      case UserSocialRequestStatus.Matching:
        return LegacyStatus.Searching;
      case UserSocialRequestStatus.Matched:
      case UserSocialRequestStatus.InvitationPending:
      case UserSocialRequestStatus.Chatting:
      case UserSocialRequestStatus.ActivityCreated:
        return LegacyStatus.Matched;
      case UserSocialRequestStatus.Cancelled:
        return LegacyStatus.Cancelled;
      case UserSocialRequestStatus.Completed:
      case UserSocialRequestStatus.Expired:
      default:
        return LegacyStatus.Closed;
    }
  }

  private deriveRiskLevel(r: UserSocialRequest): LegacyRiskLevel {
    if (r.safetyRequirement === SocialRequestSafety.LowRiskOnly) {
      return LegacyRiskLevel.Low;
    }
    if (r.safetyRequirement === SocialRequestSafety.VerifiedOnly) {
      return LegacyRiskLevel.Medium;
    }
    return LegacyRiskLevel.Low;
  }

  private formatTimePreference(start: Date | null, end: Date | null): string {
    if (!start) return '';
    const s = new Date(start);
    const dateStr = `${s.getMonth() + 1}月${s.getDate()}日 ${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
    if (!end) return dateStr;
    const e = new Date(end);
    return `${dateStr}-${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  }
}
