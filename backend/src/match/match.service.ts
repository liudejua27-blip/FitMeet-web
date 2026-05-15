import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  SocialRequestGenderPreference,
  SocialRequestSafety,
  SocialRequestType,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { UserPreference } from '../agent-gateway/entities/user-preference.entity';
import { SafetyService } from '../safety/safety.service';
import { AIService } from '../ai/ai.service';
import {
  CandidateMatchLevel,
  CandidateRiskLevel,
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from './social-request-candidate.entity';
import { AgentActionLogService } from '../agent-gateway/agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from '../agent-gateway/entities/agent-action-log.entity';

/** Default time window when a request has no timeStart/timeEnd. */
const DEFAULT_INACTIVE_DAYS = 30;
const HARD_FILTER_USER_PAGE = 200;

/** Coarse mapping from SocialRequestType → activity tag for category match. */
const TYPE_TO_TAG: Record<SocialRequestType, string> = {
  [SocialRequestType.RunningPartner]: 'running',
  [SocialRequestType.FitnessPartner]: 'fitness',
  [SocialRequestType.DogWalking]: 'pet',
  [SocialRequestType.CoffeeChat]: 'coffee',
  [SocialRequestType.CityWalk]: 'walk',
  [SocialRequestType.StudyPartner]: 'study',
  [SocialRequestType.Custom]: '',
};

/** "Adjacent" types — partial credit for activityType match. */
const RELATED_TYPES: Partial<Record<SocialRequestType, SocialRequestType[]>> = {
  [SocialRequestType.RunningPartner]: [
    SocialRequestType.FitnessPartner,
    SocialRequestType.CityWalk,
  ],
  [SocialRequestType.FitnessPartner]: [SocialRequestType.RunningPartner],
  [SocialRequestType.CityWalk]: [
    SocialRequestType.RunningPartner,
    SocialRequestType.DogWalking,
  ],
  [SocialRequestType.DogWalking]: [SocialRequestType.CityWalk],
  [SocialRequestType.CoffeeChat]: [SocialRequestType.CityWalk],
};

export interface NearbySearchInput {
  userId: number;
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  type?: SocialRequestType;
  activityType?: string;
  interestTags?: string[];
  timeStart?: Date | string | null;
  timeEnd?: Date | string | null;
  safetyRequirement?: SocialRequestSafety;
  agentAllowedRequired?: boolean;
  inactiveDaysLimit?: number;
  limit?: number;
}

export interface MatchedCandidateView {
  /** Discriminator: 'user' = real user; 'agent' = AgentProfile. */
  targetType?: 'user' | 'agent';
  /** AgentProfile id when targetType === 'agent'. */
  targetAgentId?: number;
  userId: number;
  nickname: string;
  avatar: string;
  color: string;
  score: number;
  level: CandidateMatchLevel;
  distanceKm: number | null;
  commonTags: string[];
  reasons: string[];
  scoreBreakdown: Record<string, number>;
  risk: { level: CandidateRiskLevel; warnings: string[] };
  suggestedMessage: string;
  status?: SocialRequestCandidateStatus;
  candidateRecordId?: number;
}

interface CandidateScore {
  user: User;
  pref: UserPreference | null;
  socialProfile: UserSocialProfile | null;
  total: number;
  breakdown: Record<string, number>;
  reasons: string[];
  commonTags: string[];
  distanceKm: number | null;
  risk: { level: CandidateRiskLevel; warnings: string[] };
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSocialRequest)
    private readonly requestRepo: Repository<UserSocialRequest>,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(UserPreference)
    private readonly prefRepo: Repository<UserPreference>,
    @InjectRepository(UserSocialProfile)
    private readonly socialProfileRepo: Repository<UserSocialProfile>,
    private readonly safetyService: SafetyService,
    private readonly ai: AIService,
    private readonly actionLogs: AgentActionLogService,
  ) {}

  // ───────────────────────────────────────────────
  //  PUBLIC ENTRY POINTS
  // ───────────────────────────────────────────────

  /**
   * Quick "search nearby people" — does not persist candidates.
   * Used by `POST /api/agent/nearby/search`.
   */
  async searchNearby(input: NearbySearchInput): Promise<MatchedCandidateView[]> {
    const owner = await this.userRepo.findOne({ where: { id: input.userId } });
    const city = (input.city ?? owner?.city ?? '').trim();
    const blocked = await this.safetyService.getMutualBlockUserIds(input.userId);

    const users = await this.fetchCandidatePool({
      excludeUserIds: blocked,
      excludeSelfId: input.userId,
      city,
      verifiedOnly:
        input.safetyRequirement === SocialRequestSafety.VerifiedOnly,
      inactiveDaysLimit: input.inactiveDaysLimit ?? DEFAULT_INACTIVE_DAYS,
    });

    const userIds = users.map((u) => u.id);
    const prefs = await this.fetchPrefs(userIds);
    const profiles = await this.fetchSocialProfiles(userIds);
    const ownerProfile = await this.socialProfileRepo.findOne({
      where: { userId: input.userId },
    });
    const ranked = this.scoreCandidates(users, prefs, {
      profiles,
      ownerProfile,
      ownerLat: input.lat ?? null,
      ownerLng: input.lng ?? null,
      ownerCity: city,
      radiusKm: input.radiusKm ?? 5,
      type: input.type,
      activityType: input.activityType,
      interestTags: input.interestTags ?? [],
      timePreference: '',
      socialGoal: '',
      personalityPreference: [],
      locationPreference: '',
      timeStart: input.timeStart ? new Date(input.timeStart) : null,
      timeEnd: input.timeEnd ? new Date(input.timeEnd) : null,
      safetyRequirement: input.safetyRequirement,
      agentAllowedRequired: input.agentAllowedRequired ?? false,
    });

    return ranked
      .slice(0, input.limit ?? 10)
      .map((c) => this.toView(c, undefined, undefined));
  }

  /**
   * Run matching for a UserSocialRequest, persist top-K candidates and
   * return the view layer. Idempotent: deletes previous Suggested rows
   * for the same request first.
   */
  async runMatch(
    requestId: number,
    actingUserId: number,
    opts: { limit?: number } = {},
  ): Promise<{ socialRequestId: number; candidates: MatchedCandidateView[] }> {
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Social request not found');
    if (request.userId !== actingUserId) {
      // Read-only API for non-owners is exposed elsewhere; matching is owner-only.
      throw new NotFoundException('Social request not found');
    }
    if (request.status === UserSocialRequestStatus.Cancelled) {
      throw new NotFoundException('Social request is cancelled');
    }

    const limit = opts.limit ?? 10;
    const [owner, ownerProfile] = await Promise.all([
      this.userRepo.findOne({ where: { id: request.userId } }),
      this.socialProfileRepo.findOne({ where: { userId: request.userId } }),
    ]);
    const matchCity =
      (request.city || '').trim() ||
      (ownerProfile?.city || '').trim() ||
      (owner?.city || '').trim();
    const blocked = await this.safetyService.getMutualBlockUserIds(request.userId);

    let users = await this.fetchCandidatePool({
      excludeUserIds: blocked,
      excludeSelfId: request.userId,
      city: matchCity,
      verifiedOnly:
        request.safetyRequirement === SocialRequestSafety.VerifiedOnly,
      inactiveDaysLimit: DEFAULT_INACTIVE_DAYS,
    });
    if (users.length === 0 && matchCity) {
      users = await this.fetchCandidatePool({
        excludeUserIds: blocked,
        excludeSelfId: request.userId,
        city: undefined,
        verifiedOnly:
          request.safetyRequirement === SocialRequestSafety.VerifiedOnly,
        inactiveDaysLimit: DEFAULT_INACTIVE_DAYS,
      });
    }
    if (users.length === 0 && process.env.NODE_ENV !== 'production') {
      users = await this.fetchCandidatePool({
        excludeUserIds: blocked,
        excludeSelfId: request.userId,
        city: undefined,
        verifiedOnly: false,
        inactiveDaysLimit: 3650,
      });
    }

    const userIds = users.map((u) => u.id);
    const prefs = await this.fetchPrefs(userIds);
    const profiles = await this.fetchSocialProfiles(userIds);
    const ranked = this.scoreCandidates(users, prefs, {
      profiles,
      ownerProfile,
      ownerLat: request.lat,
      ownerLng: request.lng,
      ownerCity: matchCity,
      radiusKm: request.radiusKm,
      type: request.type,
      activityType: request.activityType,
      interestTags: this.mergeRequestTags(request),
      genderPreference: request.genderPreference,
      ageMin: request.ageMin,
      ageMax: request.ageMax,
      timePreference:
        typeof request.metadata?.timePreference === 'string'
          ? request.metadata.timePreference
          : '',
      socialGoal:
        typeof request.metadata?.socialGoal === 'string'
          ? request.metadata.socialGoal
          : '',
      personalityPreference: Array.isArray(
        request.metadata?.personalityPreference,
      )
        ? (request.metadata.personalityPreference as string[])
        : [],
      locationPreference:
        typeof request.metadata?.locationPreference === 'string'
          ? request.metadata.locationPreference
          : '',
      timeStart: request.timeStart,
      timeEnd: request.timeEnd,
      safetyRequirement: request.safetyRequirement,
      agentAllowedRequired: request.agentAllowed,
    });

    // Replace previous Suggested rows.
    await this.candidateRepo.delete({
      socialRequestId: request.id,
      status: SocialRequestCandidateStatus.Suggested,
    });

    const top = ranked.slice(0, limit);
    const persisted: SocialRequestCandidate[] = [];
    const enrichedViews: MatchedCandidateView[] = [];
    for (const c of top) {
      const view = this.toView(c, request, undefined);
      // Optional LLM enrichment. AIService falls back to deterministic
      // templates when DEEPSEEK_API_KEY is unset, so this never breaks the
      // matching pipeline.
      try {
        const aiMessage = await this.ai.generateInviteMessage(
          {
            title: request.title,
            activityType: request.activityType,
            interestTags: request.interestTags ?? [],
          },
          {
            nickname: c.user.name,
            commonTags: view.commonTags,
          },
        );
        if (aiMessage && aiMessage.trim().length > 0) {
          view.suggestedMessage = aiMessage.trim();
        }
        if (this.ai.isLlmEnabled()) {
          const explanation = await this.ai.explainMatchFor(
            {
              interestTags: request.interestTags ?? [],
              city: request.city,
              activityType: request.activityType,
            },
            {
              nickname: c.user.name,
              tags: c.user.interestTags ?? [],
              distanceKm: view.distanceKm,
            },
            view.score,
          );
          if (explanation && !view.reasons.includes(explanation)) {
            view.reasons = [explanation, ...view.reasons];
          }
        }
      } catch (err) {
        this.logger.warn(
          `AI enrichment skipped for candidate ${c.user.id}: ${(err as Error).message}`,
        );
      }
      const row = await this.candidateRepo.save(
        this.candidateRepo.create({
          socialRequestId: request.id,
          candidateUserId: c.user.id,
          score: view.score,
          level: view.level,
          scoreBreakdown: view.scoreBreakdown,
          reasons: view.reasons,
          commonTags: view.commonTags,
          distanceKm: view.distanceKm,
          riskLevel: view.risk.level,
          riskWarnings: view.risk.warnings,
          suggestedMessage: view.suggestedMessage,
          status: SocialRequestCandidateStatus.Suggested,
        }),
      );
      persisted.push(row);
      enrichedViews.push({
        ...view,
        status: row.status,
        candidateRecordId: row.id,
      });
    }

    if (
      persisted.length > 0 &&
      request.status === UserSocialRequestStatus.Matching
    ) {
      // Soft transition: matched-with-suggestions; stays Matching until owner
      // approves a candidate. We could move to Matched here, but that would
      // misrepresent state. Leave it; UI uses candidates list instead.
    }

    await this.actionLogs.logAgentAction({
      ownerUserId: actingUserId,
      agentId: request.agentId ?? null,
      actionType: AgentActionType.RunMatch,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      relatedSocialRequestId: request.id,
      inputSummary: `limit=${limit}, city=${matchCity || 'any'}`,
      outputSummary: `candidates=${persisted.length}`,
      payload: {
        topScores: enrichedViews.slice(0, 5).map((v) => ({
          candidateUserId: v.userId,
          score: v.score,
          level: v.level,
        })),
      },
    });

    return {
      socialRequestId: request.id,
      candidates: enrichedViews,
    };
  }

  /** GET /api/social-requests/:id/candidates — owner only. */
  async listCandidates(
    requestId: number,
    actingUserId: number,
  ): Promise<{ socialRequestId: number; candidates: MatchedCandidateView[] }> {
    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request || request.userId !== actingUserId) {
      throw new NotFoundException('Social request not found');
    }

    const rows = await this.candidateRepo.find({
      where: { socialRequestId: requestId },
      order: { score: 'DESC' },
    });
    if (rows.length === 0) {
      return { socialRequestId: requestId, candidates: [] };
    }

    const users = await this.userRepo.find({
      where: { id: In(rows.map((r) => r.candidateUserId)) },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      socialRequestId: requestId,
      candidates: rows
        .filter((r) => userMap.has(r.candidateUserId))
        .map((r) => this.rowToView(r, userMap.get(r.candidateUserId)!)),
    };
  }

  /**
   * Mark a candidate row as `messaged` after the owner sends them an invite.
   * Owner-only. Idempotent: only advances suggested/approved → messaged.
   */
  async markCandidateMessaged(
    requestId: number,
    candidateId: number,
    actingUserId: number,
  ): Promise<{ id: number; status: SocialRequestCandidateStatus }> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request || request.userId !== actingUserId) {
      throw new NotFoundException('Social request not found');
    }
    const row = await this.candidateRepo.findOne({
      where: { id: candidateId, socialRequestId: requestId },
    });
    if (!row) throw new NotFoundException('Candidate not found');

    if (
      row.status === SocialRequestCandidateStatus.Suggested ||
      row.status === SocialRequestCandidateStatus.Approved
    ) {
      row.status = SocialRequestCandidateStatus.Messaged;
      await this.candidateRepo.save(row);
    }
    if (
      request.status !== UserSocialRequestStatus.Completed &&
      request.status !== UserSocialRequestStatus.ActivityCreated &&
      request.status !== UserSocialRequestStatus.Chatting
    ) {
      request.status = UserSocialRequestStatus.Chatting;
      await this.requestRepo.save(request);
    }

    await this.actionLogs.logAgentAction({
      ownerUserId: actingUserId,
      agentId: request.agentId ?? null,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Medium,
      relatedSocialRequestId: request.id,
      relatedCandidateId: row.id,
      targetUserId: row.candidateUserId,
      inputSummary: `mark-messaged candidate=${row.id}`,
      outputSummary: `candidate.status=${row.status}, request.status=${request.status}`,
    });

    return { id: row.id, status: row.status };
  }

  // ───────────────────────────────────────────────
  //  HARD FILTERING
  // ───────────────────────────────────────────────

  private async fetchCandidatePool(input: {
    excludeUserIds: Set<number>;
    excludeSelfId: number;
    city?: string;
    verifiedOnly?: boolean;
    inactiveDaysLimit: number;
  }): Promise<User[]> {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.id != :uid', { uid: input.excludeSelfId });

    if (input.city) {
      qb.andWhere('u.city ILIKE :city', { city: `%${input.city}%` });
    }
    qb.andWhere('u."acceptNearbyMatch" = true');
    if (input.verifiedOnly) {
      qb.andWhere('u.verified = true');
    }

    // Last-active filter: User entity has only updatedAt; treat as "last active".
    const cutoff = new Date(
      Date.now() - input.inactiveDaysLimit * 24 * 60 * 60 * 1000,
    );
    qb.andWhere('u.updatedAt >= :cutoff', { cutoff });

    const users = await qb.take(HARD_FILTER_USER_PAGE).getMany();
    return users.filter((u) => !input.excludeUserIds.has(u.id));
  }

  private async fetchPrefs(userIds: number[]) {
    if (!userIds.length) return new Map<number, UserPreference>();
    const prefs = await this.prefRepo.find({
      where: { userId: In(userIds) },
    });
    return new Map(prefs.map((p) => [p.userId, p]));
  }

  private async fetchSocialProfiles(userIds: number[]) {
    if (!userIds.length) return new Map<number, UserSocialProfile>();
    const profiles = await this.socialProfileRepo.find({
      where: { userId: In(userIds) },
    });
    return new Map(profiles.map((p) => [p.userId, p]));
  }

  // ───────────────────────────────────────────────
  //  SCORING (100-point scale)
  // ───────────────────────────────────────────────

  private scoreCandidates(
    users: User[],
    prefs: Map<number, UserPreference>,
    ctx: {
      ownerLat: number | null;
      ownerLng: number | null;
      ownerCity: string;
      radiusKm: number;
      type?: SocialRequestType;
      activityType?: string;
      interestTags: string[];
      genderPreference?: SocialRequestGenderPreference;
      ageMin?: number | null;
      ageMax?: number | null;
      timeStart: Date | null;
      timeEnd: Date | null;
      safetyRequirement?: SocialRequestSafety;
      agentAllowedRequired: boolean;
      profiles: Map<number, UserSocialProfile>;
      ownerProfile: UserSocialProfile | null;
      timePreference?: string;
      socialGoal?: string;
      personalityPreference?: string[];
      locationPreference?: string;
    },
  ): CandidateScore[] {
    const desiredTags = new Set(
      [
        ...ctx.interestTags,
        ...(ctx.ownerProfile?.interestTags ?? []),
        ...(ctx.ownerProfile?.fitnessGoals ?? []),
        ...(ctx.personalityPreference ?? []),
        ctx.socialGoal ?? '',
      ]
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    );
    const typeTag = ctx.type ? TYPE_TO_TAG[ctx.type] : '';
    if (typeTag) desiredTags.add(typeTag);

    const out: CandidateScore[] = [];
    for (const user of users) {
      const pref = prefs.get(user.id) ?? null;
      const socialProfile = ctx.profiles.get(user.id) ?? null;

      // Hard filter: when the request is authored by (or routed through) an
      // agent, drop candidates who explicitly opted out of agent contact.
      if (
        ctx.agentAllowedRequired === true &&
        pref?.acceptAgentMessages === false
      ) {
        continue;
      }
      if (this.violatesPrivacyBoundary(socialProfile, ctx)) continue;
      if (this.violatesDemographicPreference(user, socialProfile, ctx)) continue;

      const breakdown: Record<string, number> = {};
      const reasons: string[] = [];
      const warnings: string[] = [];
      const candidateCity = (socialProfile?.city || user.city || '').trim();

      // 1) Distance — 20
      const distanceKm = this.computeDistanceKm(
        ctx.ownerLat,
        ctx.ownerLng,
        ctx.ownerCity,
        user,
        candidateCity,
      );
      const distScore = this.scoreDistance(distanceKm, ctx.radiusKm);
      breakdown.distance = distScore;
      if (distanceKm == null && ctx.ownerCity && candidateCity === ctx.ownerCity) {
        reasons.push(`同在 ${candidateCity}，距离待补全`);
      } else if (distanceKm != null) {
        reasons.push(`距离 ${distanceKm.toFixed(1)}km，符合 ${ctx.radiusKm}km 范围`);
      }
      if (
        ctx.locationPreference &&
        socialProfile?.nearbyArea &&
        ctx.locationPreference.includes(socialProfile.nearbyArea)
      ) {
        reasons.push(`常活动区域匹配：${socialProfile.nearbyArea}`);
      }

      // Hard filter: clearly out of radius and we have a real distance.
      if (
        distanceKm != null &&
        ctx.radiusKm > 0 &&
        distanceKm > ctx.radiusKm * 2
      ) {
        // Don't include this candidate at all.
        continue;
      }

      // 2) Time — 20
      const timeScore = this.scoreTime(
        ctx.timeStart,
        ctx.timeEnd,
        user,
        pref,
        socialProfile,
        ctx.timePreference,
      );
      breakdown.time = timeScore;
      if (timeScore >= 20) {
        reasons.push('时间窗口完全重合');
      } else if (timeScore >= 12) {
        reasons.push('时间窗口部分重合');
      } else if (timeScore >= 6) {
        reasons.push('当天有空');
      }

      // 3) Interest tags — 20
      const userTags = [
        ...(user.interestTags ?? []),
        ...(socialProfile?.interestTags ?? []),
        ...(socialProfile?.fitnessGoals ?? []),
      ].map((t) => t.toLowerCase());
      const overlap = userTags.filter((t) => desiredTags.has(t));
      const tagScore = this.scoreInterest(overlap.length, desiredTags.size);
      breakdown.interest = tagScore;
      if (overlap.length > 0) {
        reasons.push(`共同兴趣：${overlap.slice(0, 3).join('、')}`);
      }

      // 4) Activity type — 15
      const actScore = this.scoreActivityType(ctx.type, ctx.activityType, user);
      breakdown.activityType = actScore;
      if (actScore >= 15) {
        reasons.push('活动类型完全一致');
      } else if (actScore >= 8) {
        reasons.push('活动类型相近');
      }

      // 5) Personality / preference — 10
      const persoScore = this.scorePersonality(
        pref,
        [...ctx.interestTags, ...(ctx.personalityPreference ?? [])],
        user,
        socialProfile,
      );
      breakdown.personality = persoScore;

      // 6) Safety — 10
      const { score: safeScore, warnings: safeWarn, level } = this.scoreSafety(
        user,
        ctx.safetyRequirement,
      );
      breakdown.safety = safeScore;
      warnings.push(...safeWarn);
      if (user.verified) reasons.push('对方已完成认证');

      // 7) Agent acceptance — 5
      const agentScore =
        pref?.acceptAgentMessages === false
          ? 0
          : ctx.agentAllowedRequired || pref?.acceptAgentMessages
            ? 5
            : 3;
      breakdown.agentAcceptance = agentScore;
      if (pref?.acceptAgentMessages) reasons.push('对方接受 Agent 沟通');

      const total =
        distScore +
        timeScore +
        tagScore +
        actScore +
        persoScore +
        safeScore +
        agentScore;

      out.push({
        user,
        pref,
        socialProfile,
        total: Math.max(0, Math.min(100, Math.round(total))),
        breakdown,
        reasons,
        commonTags: overlap,
        distanceKm,
        risk: { level, warnings },
      });
    }

    return out.sort((a, b) => b.total - a.total);
  }

  // ── individual scorers ──────────────────────

  private scoreDistance(distanceKm: number | null, radiusKm: number): number {
    if (distanceKm == null) {
      // Same-city fallback (no coords available) — moderate score.
      return 12;
    }
    if (distanceKm <= 1) return 20;
    if (distanceKm <= 3) return 16;
    if (distanceKm <= 5) return 12;
    if (distanceKm <= 10) return 8;
    if (distanceKm <= radiusKm) return 4;
    return 0;
  }

  private scoreTime(
    start: Date | null,
    end: Date | null,
    _user: User,
    pref: UserPreference | null,
    profile: UserSocialProfile | null,
    timePreference?: string,
  ): number {
    const requestWindow = this.parseTimeTokens(timePreference ?? '');
    const profileWindow = this.parseTimeTokens(
      `${profile?.availableTimes?.join(' ') ?? ''}`,
    );
    if (
      requestWindow.length > 0 &&
      requestWindow.some((token) => profileWindow.includes(token))
    ) {
      return 20;
    }
    if (!start && !end && profileWindow.length > 0) return 14;
    if (!start || !end) return 12; // no constraint → assume partial overlap
    // First version: no hard availability data. Read free-text from
    // pref.privacyBoundaries.availability if present.
    const availability = pref?.privacyBoundaries?.availability as
      | { start?: string; end?: string }
      | undefined;
    if (availability?.start && availability?.end) {
      const aS = new Date(availability.start).getTime();
      const aE = new Date(availability.end).getTime();
      const rS = start.getTime();
      const rE = end.getTime();
      if (Number.isFinite(aS) && Number.isFinite(aE)) {
        if (aS <= rS && aE >= rE) return 20;
        if (aE > rS && aS < rE) return 12;
        if (
          new Date(aS).toDateString() === new Date(rS).toDateString()
        )
          return 6;
        return 0;
      }
    }
    return 12;
  }

  private scoreInterest(overlapCount: number, desiredSize: number): number {
    if (desiredSize === 0) return 6;
    if (overlapCount >= 4) return 20;
    if (overlapCount === 3) return 16;
    if (overlapCount === 2) return 12;
    if (overlapCount === 1) return 8;
    return 0;
  }

  private scoreActivityType(
    type: SocialRequestType | undefined,
    activityType: string | undefined,
    user: User,
  ): number {
    if (!type) return 6;
    const tags = (user.interestTags ?? []).map((t) => t.toLowerCase());
    const targetTag = TYPE_TO_TAG[type];
    if (
      activityType &&
      tags.includes(activityType.toLowerCase())
    ) {
      return 15;
    }
    if (targetTag && tags.includes(targetTag)) return 15;
    const related = RELATED_TYPES[type] ?? [];
    if (related.some((t) => tags.includes(TYPE_TO_TAG[t]))) return 8;
    return 0;
  }

  private scorePersonality(
    pref: UserPreference | null,
    interestTags: string[],
    user: User,
    socialProfile: UserSocialProfile | null,
  ): number {
    if (!pref && !socialProfile && (!user.bio || user.bio.length < 5)) return 3;
    let score = 3;
    const bio = `${user.bio ?? ''} ${socialProfile?.socialPreference ?? ''}`.toLowerCase();
    const desired = (
      pref?.idealPartnerDescription ?? interestTags.join(' ')
    ).toLowerCase();
    const tokens = desired.split(/\s+|,|，/).filter((t) => t.length > 1);
    const hits = tokens.filter((t) => bio.includes(t)).length;
    if (hits >= 3) score = 10;
    else if (hits === 2) score = 7;
    else if (hits === 1) score = 5;
    return score;
  }

  private parseTimeTokens(text: string): string[] {
    const lower = text.toLowerCase();
    const tokens: string[] = [];
    if (/(早晨|早上|morning|上午)/.test(lower)) tokens.push('morning');
    if (/(下午|afternoon)/.test(lower)) tokens.push('afternoon');
    if (/(晚上|傍晚|evening|night)/.test(lower)) tokens.push('evening');
    if (/(周末|weekend|周六|周日)/.test(lower)) tokens.push('weekend');
    if (/(工作日|weekday|平日)/.test(lower)) tokens.push('weekday');
    return tokens;
  }

  private violatesPrivacyBoundary(
    profile: UserSocialProfile | null,
    ctx: {
      ownerProfile?: UserSocialProfile | null;
      timePreference?: string;
      locationPreference?: string;
      socialGoal?: string;
    },
  ) {
    const boundary = `${ctx.ownerProfile?.rejectRules ?? ''} ${ctx.ownerProfile?.privacyBoundary ?? ''} ${profile?.rejectRules ?? ''} ${profile?.privacyBoundary ?? ''}`.toLowerCase();
    const requestText = `${ctx.timePreference ?? ''} ${ctx.locationPreference ?? ''} ${ctx.socialGoal ?? ''}`.toLowerCase();
    if (!boundary) return false;
    if (/不接受|拒绝|禁止/.test(boundary) && /夜间|深夜|凌晨|night|midnight/.test(requestText)) return true;
    if (/不接受|拒绝|禁止/.test(boundary) && /私人|住址|家里|酒店|hotel|home/.test(requestText)) return true;
    return false;
  }

  private violatesDemographicPreference(
    user: User,
    profile: UserSocialProfile | null,
    ctx: {
      genderPreference?: SocialRequestGenderPreference;
      ageMin?: number | null;
      ageMax?: number | null;
    },
  ) {
    const gender = this.normalizeGender(profile?.gender || user.gender || '');
    if (
      ctx.genderPreference &&
      ctx.genderPreference !== SocialRequestGenderPreference.Any &&
      ctx.genderPreference !== SocialRequestGenderPreference.NonSpecified &&
      gender &&
      gender !== ctx.genderPreference
    ) {
      return true;
    }

    const age = user.age || this.ageFromRange(profile?.ageRange ?? '');
    if (age > 0) {
      if (ctx.ageMin != null && age < ctx.ageMin) return true;
      if (ctx.ageMax != null && age > ctx.ageMax) return true;
    }
    return false;
  }

  private ageFromRange(range: string): number {
    const match = range.match(/(\d{2})\s*[-~到至]\s*(\d{2})/);
    if (!match) return 0;
    return Math.round((Number(match[1]) + Number(match[2])) / 2);
  }

  private normalizeGender(value: string): string {
    const lower = value.trim().toLowerCase();
    if (!lower) return '';
    if (['male', 'm', '男', '男性'].includes(lower)) return 'male';
    if (['female', 'f', '女', '女性'].includes(lower)) return 'female';
    return lower;
  }

  private mergeRequestTags(request: UserSocialRequest): string[] {
    const metadata = request.metadata ?? {};
    const fromMetadata = [
      metadata.locationPreference,
      metadata.timePreference,
      metadata.socialGoal,
      ...(Array.isArray(metadata.personalityPreference)
        ? metadata.personalityPreference
        : []),
    ];
    return Array.from(
      new Set(
        [...(request.interestTags ?? []), ...fromMetadata]
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    );
  }

  private scoreSafety(
    user: User,
    requirement: SocialRequestSafety | undefined,
  ): {
    score: number;
    warnings: string[];
    level: CandidateRiskLevel;
  } {
    const warnings: string[] = [];
    let score = 0;
    if (user.verified) score += 5;
    else warnings.push('对方未完成认证');
    if (user.bio && user.bio.length > 20) score += 2;
    else warnings.push('对方资料不完整');
    if (user.avatar) score += 1;
    if (user.singleCert) score += 2;

    let level: CandidateRiskLevel = CandidateRiskLevel.Low;
    if (warnings.length >= 2) level = CandidateRiskLevel.Medium;
    if (
      requirement === SocialRequestSafety.VerifiedOnly &&
      !user.verified
    ) {
      level = CandidateRiskLevel.High;
      warnings.push('要求"仅认证用户"，但对方未认证');
    }
    return { score: Math.min(score, 10), warnings, level };
  }

  // ── distance ────────────────────────────────

  private computeDistanceKm(
    ownerLat: number | null,
    ownerLng: number | null,
    ownerCity: string | undefined,
    user: User,
    candidateCity?: string,
  ): number | null {
    const userLat = (user as unknown as { lat?: number }).lat;
    const userLng = (user as unknown as { lng?: number }).lng;
    if (
      ownerLat != null &&
      ownerLng != null &&
      typeof userLat === 'number' &&
      typeof userLng === 'number'
    ) {
      return haversineKm(ownerLat, ownerLng, userLat, userLng);
    }
    const city = candidateCity || user.city;
    if (ownerCity && city && city === ownerCity) {
      // No coordinates on either side → return null so we fall back to the
      // "same city" reason instead of fabricating a number.
      return null;
    }
    return null;
  }

  // ───────────────────────────────────────────────
  //  REASONS + ICEBREAKER
  // ───────────────────────────────────────────────

  /**
   * Pluggable. First version is rule-based; later we'll route through an LLM
   * via ai-match / agent-gateway. Keep the signature stable.
   */
  generateMatchReasons(
    cand: CandidateScore,
    request?: UserSocialRequest,
  ): string[] {
    const reasons = [...cand.reasons];
    if (request?.activityType && cand.user.interestTags?.includes(request.activityType)) {
      reasons.push(`都喜欢「${request.activityType}」`);
    }
    if (cand.commonTags.length === 0 && cand.breakdown.interest === 0) {
      reasons.push('兴趣标签暂无重合，但其他维度匹配良好');
    }
    return Array.from(new Set(reasons)).slice(0, 6);
  }

  /** Pluggable. LLM replacement target. */
  generateIcebreakerMessage(
    cand: CandidateScore,
    request?: UserSocialRequest,
  ): string {
    const name = cand.user.name || '你好';
    const activity =
      request?.activityType ||
      (request?.type ? TYPE_TO_TAG[request.type] : '') ||
      '一起运动';
    const where =
      request?.city || cand.user.city ? `在${request?.city || cand.user.city}` : '';
    const when = request?.timeStart
      ? this.formatTimeWindow(request.timeStart, request.timeEnd)
      : '近期';
    const tags = cand.commonTags.slice(0, 2).join('、');
    const tagPart = tags ? `我们都喜欢${tags}，` : '';
    return `你好 ${name}，${tagPart}我${where}${when}想找个搭子${activity}，方便一起吗？`;
  }

  private formatTimeWindow(start: Date, end: Date | null): string {
    const s = new Date(start);
    const dateStr = `${s.getMonth() + 1}月${s.getDate()}日 ${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
    if (!end) return dateStr;
    const e = new Date(end);
    return `${dateStr}-${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  }

  // ───────────────────────────────────────────────
  //  VIEW MAPPING
  // ───────────────────────────────────────────────

  private toView(
    cand: CandidateScore,
    request: UserSocialRequest | undefined,
    row: SocialRequestCandidate | undefined,
  ): MatchedCandidateView {
    const reasons = this.generateMatchReasons(cand, request);
    const suggestedMessage = this.generateIcebreakerMessage(cand, request);
    return {
      targetType: 'user',
      userId: cand.user.id,
      nickname: cand.user.name,
      avatar: cand.user.avatar,
      color: cand.user.color,
      score: cand.total,
      level: this.bandLevel(cand.total),
      distanceKm: cand.distanceKm,
      commonTags: cand.commonTags,
      reasons,
      scoreBreakdown: cand.breakdown,
      risk: cand.risk,
      suggestedMessage,
      status: row?.status,
      candidateRecordId: row?.id,
    };
  }

  private rowToView(
    row: SocialRequestCandidate,
    user: User,
  ): MatchedCandidateView {
    return {
      targetType: 'user',
      userId: user.id,
      nickname: user.name,
      avatar: user.avatar,
      color: user.color,
      score: row.score,
      level: row.level,
      distanceKm: row.distanceKm,
      commonTags: row.commonTags ?? [],
      reasons: row.reasons ?? [],
      scoreBreakdown: row.scoreBreakdown ?? {},
      risk: { level: row.riskLevel, warnings: row.riskWarnings ?? [] },
      suggestedMessage: row.suggestedMessage,
      status: row.status,
      candidateRecordId: row.id,
    };
  }

  private bandLevel(score: number): CandidateMatchLevel {
    if (score >= 80) return CandidateMatchLevel.High;
    if (score >= 60) return CandidateMatchLevel.Medium;
    return CandidateMatchLevel.Low;
  }

  // ───────────────────────────────────────────────
  //  STATUS TRANSITIONS (used by social-requests / agent flows)
  // ───────────────────────────────────────────────

  async markCandidate(
    candidateRecordId: number,
    actingUserId: number,
    status: SocialRequestCandidateStatus,
  ) {
    const row = await this.candidateRepo.findOne({
      where: { id: candidateRecordId },
    });
    if (!row) throw new NotFoundException('Candidate not found');
    const request = await this.requestRepo.findOne({
      where: { id: row.socialRequestId },
    });
    if (!request || request.userId !== actingUserId) {
      throw new NotFoundException('Candidate not found');
    }
    row.status = status;
    return this.candidateRepo.save(row);
  }
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
