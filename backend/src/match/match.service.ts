import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  SocialRequestGenderPreference,
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { UserPreference } from '../agent-gateway/entities/user-preference.entity';
import { SafetyService } from '../safety/safety.service';
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
import { CompatibilityScorerService } from './compatibility-scorer.service';
import {
  AiMatchReasonerService,
  MatchResultSource,
} from './ai-match-reasoner.service';
import { isTestLikeText } from '../common/display-text.util';

/** Default time window when a request has no timeStart/timeEnd. */
const DEFAULT_INACTIVE_DAYS = 30;
const HARD_FILTER_USER_PAGE = 200;

/** Coarse mapping from SocialRequestType to activity tag for category match. */
const TYPE_TO_TAG: Record<SocialRequestType, string> = {
  [SocialRequestType.RunningPartner]: 'running',
  [SocialRequestType.FitnessPartner]: 'fitness',
  [SocialRequestType.DogWalking]: 'pet',
  [SocialRequestType.CoffeeChat]: 'coffee',
  [SocialRequestType.CityWalk]: 'walk',
  [SocialRequestType.StudyPartner]: 'study',
  [SocialRequestType.Custom]: '',
};

/** Adjacent types give partial credit for activityType matches. */
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
  candidateUserId: number;
  source: MatchResultSource;
  matchedSignals: string[];
  publicReason: string;
  privateReason: string;
  riskWarning: string;
  suggestedOpener: string;
  nextAction: string;
}

interface CandidateScore {
  user: User;
  pref: UserPreference | null;
  socialProfile: UserSocialProfile | null;
  activeRequest: ActiveSocialRequestSignal | null;
  total: number;
  breakdown: Record<string, number>;
  reasons: string[];
  commonTags: string[];
  distanceKm: number | null;
  risk: { level: CandidateRiskLevel; warnings: string[] };
}

interface ActiveSocialRequestSignal {
  id: number;
  userId: number;
  title: string;
  city: string;
  type: SocialRequestType;
  activityType: string;
  interestTags: string[];
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
    private readonly reasoner: AiMatchReasonerService,
    private readonly actionLogs: AgentActionLogService,
    private readonly compatibility: CompatibilityScorerService,
  ) {}

  // Public entry points
  //  PUBLIC ENTRY POINTS
  // ---------------------------------------------------------------------------

  /**
   * Quick search nearby people; does not persist candidates.
   * Used by `POST /api/agent/nearby/search`.
   */
  async searchNearby(
    input: NearbySearchInput,
  ): Promise<MatchedCandidateView[]> {
    const owner = await this.userRepo.findOne({ where: { id: input.userId } });
    const city = (input.city ?? owner?.city ?? '').trim();
    const blocked = await this.safetyService.getMutualBlockUserIds(
      input.userId,
    );

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
    const activeRequestSignals =
      await this.fetchActiveSocialRequestSignals(userIds);
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
      activeRequestSignals,
    });

    if (ranked.length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'match.empty',
          source: 'search_nearby',
          userId: input.userId,
          city: city || null,
          radiusKm: input.radiusKm ?? 5,
          activityType: input.activityType ?? null,
          interestTags: input.interestTags ?? [],
          agentAllowedRequired: input.agentAllowedRequired ?? false,
          candidatePoolSize: users.length,
        }),
      );
    }

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
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
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
    const blocked = await this.safetyService.getMutualBlockUserIds(
      request.userId,
    );

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
    const activeRequestSignals =
      await this.fetchActiveSocialRequestSignals(userIds);
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
      activeRequestSignals,
    });

    // Replace previous Suggested rows.
    await this.candidateRepo.delete({
      socialRequestId: request.id,
      status: SocialRequestCandidateStatus.Suggested,
    });

    const top = ranked.slice(0, limit);
    if (top.length === 0) {
      this.logger.warn(
        JSON.stringify({
          event: 'match.empty',
          source: 'run_match',
          socialRequestId: request.id,
          ownerUserId: request.userId,
          actingUserId,
          city: matchCity || null,
          radiusKm: request.radiusKm,
          activityType: request.activityType || null,
          interestTags: this.mergeRequestTags(request),
          safetyRequirement: request.safetyRequirement,
          agentAllowedRequired: request.agentAllowed,
          candidatePoolSize: users.length,
          rankedCount: ranked.length,
        }),
      );
    }
    const persisted: SocialRequestCandidate[] = [];
    const enrichedViews: MatchedCandidateView[] = [];
    for (const c of top) {
      const view = this.toView(c, request, undefined);
      const reasoning = await this.reasoner.explainSocialRequestCandidate({
        request,
        source: view.source,
        ownerProfile,
        candidateUser: c.user,
        candidateProfile: c.socialProfile,
        baseScore: c.total,
        scoreBreakdown: view.scoreBreakdown,
        deterministicReasons: view.reasons,
        commonTags: view.commonTags,
        riskWarnings: view.risk.warnings,
        distanceKm: view.distanceKm,
      });
      view.score = reasoning.score;
      view.level = this.bandLevel(reasoning.score);
      view.scoreBreakdown = reasoning.scoreBreakdown;
      view.matchedSignals = reasoning.matchedSignals;
      view.publicReason = reasoning.publicReason;
      view.privateReason = reasoning.privateReason;
      view.riskWarning = reasoning.riskWarning;
      view.suggestedOpener = reasoning.suggestedOpener;
      view.nextAction = reasoning.nextAction;
      view.suggestedMessage = reasoning.suggestedOpener;
      view.reasons = Array.from(
        new Set([reasoning.publicReason, ...view.reasons].filter(Boolean)),
      ).slice(0, 6);
      view.risk = {
        ...view.risk,
        warnings: Array.from(
          new Set([...view.risk.warnings, ...reasoning.riskWarnings]),
        ),
      };
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

  /** GET /api/social-requests/:id/candidates, owner only. */
  async listCandidates(
    requestId: number,
    actingUserId: number,
  ): Promise<{ socialRequestId: number; candidates: MatchedCandidateView[] }> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
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
   * Owner-only. Idempotent: only advances suggested/approved to messaged.
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

  // Candidate scoring
  //  HARD FILTERING
  // ---------------------------------------------------------------------------

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
    if (process.env.NODE_ENV === 'production') {
      qb.andWhere('u.email NOT ILIKE :testEmailPattern', {
        testEmailPattern: '%test%',
      });
      qb.andWhere('u.name !~* :testNamePattern', {
        testNamePattern: '(test|mock|dummy|fake|seed|demo|测试|測試)',
      });
    }
    if (input.verifiedOnly) {
      qb.andWhere('u.verified = true');
    }

    // Last-active filter: User entity has only updatedAt; treat as "last active".
    const cutoff = new Date(
      Date.now() - input.inactiveDaysLimit * 24 * 60 * 60 * 1000,
    );
    qb.andWhere('u.updatedAt >= :cutoff', { cutoff });

    const users = await qb.take(HARD_FILTER_USER_PAGE).getMany();
    return users.filter(
      (user) =>
        !input.excludeUserIds.has(user.id) && !this.isProductionTestUser(user),
    );
  }

  private isProductionTestUser(user: User): boolean {
    if (process.env.NODE_ENV !== 'production') return false;
    return [user.name, user.email, user.phone, user.bio].some((value) =>
      isTestLikeText(value),
    );
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

  private async fetchActiveSocialRequestSignals(
    userIds: number[],
  ): Promise<Map<number, ActiveSocialRequestSignal>> {
    if (!userIds.length) return new Map();
    const rows = await this.requestRepo
      .createQueryBuilder('request')
      .where('request.userId IN (:...userIds)', { userIds })
      .andWhere('request.visibility = :visibility', {
        visibility: SocialRequestVisibility.Public,
      })
      .andWhere('request.agentAllowed = true')
      .andWhere('request.status IN (:...statuses)', {
        statuses: [
          UserSocialRequestStatus.Matching,
          UserSocialRequestStatus.Matched,
          UserSocialRequestStatus.InvitationPending,
          UserSocialRequestStatus.Chatting,
        ],
      })
      .andWhere('(request.expiresAt IS NULL OR request.expiresAt >= :now)', {
        now: new Date(),
      })
      .orderBy('request.updatedAt', 'DESC')
      .getMany();

    const byUser = new Map<number, ActiveSocialRequestSignal>();
    for (const row of rows) {
      if (byUser.has(row.userId)) continue;
      byUser.set(row.userId, {
        id: row.id,
        userId: row.userId,
        title: row.title,
        city: row.city,
        type: row.type,
        activityType: row.activityType,
        interestTags: row.interestTags ?? [],
      });
    }
    return byUser;
  }

  // Shared scorer inputs
  //  SCORING (100-point scale)
  // ---------------------------------------------------------------------------

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
      activeRequestSignals: Map<number, ActiveSocialRequestSignal>;
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
        .flatMap((tag) => this.expandMatchTag(tag))
        .filter(Boolean),
    );
    const typeTag = ctx.type ? TYPE_TO_TAG[ctx.type] : '';
    if (typeTag) {
      this.expandMatchTag(typeTag).forEach((tag) => desiredTags.add(tag));
    }

    const out: CandidateScore[] = [];
    for (const user of users) {
      const pref = prefs.get(user.id) ?? null;
      const socialProfile = ctx.profiles.get(user.id) ?? null;
      const activeRequest = ctx.activeRequestSignals.get(user.id) ?? null;

      if (
        ctx.agentAllowedRequired !== true &&
        socialProfile?.profileDiscoverable === false
      ) {
        continue;
      }

      // Hard filter: when the request is authored by (or routed through) an
      // agent, drop candidates who explicitly opted out of agent contact.
      if (
        ctx.agentAllowedRequired === true &&
        pref?.acceptAgentMessages === false
      ) {
        continue;
      }
      if (this.violatesPrivacyBoundary(socialProfile, ctx)) continue;
      if (this.violatesOwnerBoundary(user, socialProfile, ctx)) continue;
      if (this.violatesDemographicPreference(user, socialProfile, ctx))
        continue;

      const breakdown: Record<string, number> = {};
      const reasons: string[] = [];
      const warnings: string[] = [];
      const candidateCity = (socialProfile?.city || user.city || '').trim();
      if (activeRequest) {
        reasons.push(
          `Candidate has an active public social request: ${activeRequest.title}.`,
        );
      }
      if (socialProfile?.agentCanRecommendMe) {
        reasons.push(
          'Candidate has an AI social profile enabled for matching.',
        );
      }

      // 1) Place / distance, max 25
      const distanceKm = this.computeDistanceKm(
        ctx.ownerLat,
        ctx.ownerLng,
        ctx.ownerCity,
        user,
        candidateCity,
      );
      const distScore = this.scoreDistance(distanceKm, ctx.radiusKm);
      breakdown.distance = distScore;
      if (
        distanceKm == null &&
        ctx.ownerCity &&
        candidateCity === ctx.ownerCity
      ) {
        reasons.push(
          `Same city: ${candidateCity}. Distance needs coordinates.`,
        );
      } else if (distanceKm != null) {
        reasons.push(
          `Distance ${distanceKm.toFixed(1)}km within ${ctx.radiusKm}km preference.`,
        );
      }
      if (
        ctx.locationPreference &&
        socialProfile?.nearbyArea &&
        ctx.locationPreference.includes(socialProfile.nearbyArea)
      ) {
        reasons.push(
          `Preferred nearby area matches: ${socialProfile.nearbyArea}.`,
        );
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

      // 2) Time, max 20
      const rawTimeScore = this.scoreTime(
        ctx.timeStart,
        ctx.timeEnd,
        user,
        pref,
        socialProfile,
        ctx.timePreference,
      );
      const timeScore = rawTimeScore;
      breakdown.time = timeScore;
      if (rawTimeScore >= 20) {
        reasons.push('Time window is a strong match.');
      } else if (rawTimeScore >= 12) {
        reasons.push('Time window partially matches.');
      } else if (rawTimeScore >= 6) {
        reasons.push('Candidate appears available around the requested time.');
      }

      // 3) Interest tags, max 20
      const publicUserTags = [
        ...(user.interestTags ?? []),
        ...(socialProfile?.interestTags ?? []),
        ...(socialProfile?.fitnessGoals ?? []),
        ...(socialProfile?.lifestyleTags ?? []),
        ...(socialProfile?.socialScenes ?? []),
        ...(socialProfile?.traits ?? []),
        ...(activeRequest?.interestTags ?? []),
        activeRequest?.activityType ?? '',
        activeRequest?.type ? TYPE_TO_TAG[activeRequest.type] : '',
      ];
      const compatibility = this.compatibility.scoreRequestCandidate({
        desiredTags: [...desiredTags],
        candidatePublicTags: publicUserTags,
        candidatePrivateTags: this.getConfirmedPrivateMatchTags(socialProfile),
        candidateTraits: socialProfile?.traits ?? [],
        ownerPreferredTraits: [
          ...(ctx.ownerProfile?.preferredTraits ?? []),
          ...(ctx.personalityPreference ?? []),
        ],
        candidatePreferredTraits: socialProfile?.preferredTraits ?? [],
        ownerPublicTags: [
          ...(ctx.ownerProfile?.interestTags ?? []),
          ...(ctx.ownerProfile?.fitnessGoals ?? []),
          ...(ctx.ownerProfile?.traits ?? []),
        ],
        candidateAvoidTraits: socialProfile?.avoidTraits ?? [],
        agentAllowedRequired: ctx.agentAllowedRequired,
        candidateAcceptsAgentMessages: pref?.acceptAgentMessages ?? null,
      });
      Object.assign(breakdown, compatibility.breakdown);
      reasons.push(...compatibility.publicReasons);
      reasons.push(...compatibility.privateReasons);
      warnings.push(...compatibility.riskTips);
      const levelGoalScore = Math.min(
        15,
        Math.round(
          compatibility.breakdown.interest * 0.55 +
            compatibility.breakdown.bidirectionalIntent * 0.35 +
            Math.min(compatibility.commonTags.length, 2),
        ),
      );
      breakdown.levelAndGoal = levelGoalScore;

      // 4) Activity type / sport category, max 20

      const actScore = Math.round(
        (this.scoreActivityType(ctx.type, ctx.activityType, user) / 15) * 20,
      );
      breakdown.activityType = actScore;
      if (actScore >= 10) {
        reasons.push('Activity type is a strong match.');
      } else if (actScore >= 5) {
        reasons.push('Activity type is related.');
      }

      // 6) Safety, max 10
      const {
        score: safeScore,
        warnings: safeWarn,
        level,
      } = this.scoreSafety(user, ctx.safetyRequirement);
      breakdown.safety = safeScore;
      warnings.push(...safeWarn);
      if (user.verified) reasons.push('Candidate is verified.');

      if (pref?.acceptAgentMessages)
        reasons.push('Candidate accepts agent-mediated messages.');

      const total =
        distScore +
        timeScore +
        actScore +
        levelGoalScore +
        compatibility.breakdown.personality +
        safeScore;

      out.push({
        user,
        pref,
        socialProfile,
        activeRequest,
        total: Math.max(0, Math.min(100, Math.round(total))),
        breakdown,
        reasons,
        commonTags: compatibility.commonTags,
        distanceKm,
        risk: { level, warnings },
      });
    }

    return out.sort((a, b) => b.total - a.total);
  }

  // Individual scorers

  private scoreDistance(distanceKm: number | null, radiusKm: number): number {
    if (distanceKm == null) {
      // Same-city fallback (no coords available): moderate score.
      return 15;
    }
    if (distanceKm <= 1) return 25;
    if (distanceKm <= 3) return 21;
    if (distanceKm <= 5) return 17;
    if (distanceKm <= 10) return 11;
    if (distanceKm <= radiusKm) return 6;
    return 0;
  }

  private getConfirmedPrivateMatchTags(
    profile: UserSocialProfile | null,
  ): string[] {
    if (!profile) return [];
    const signals = (profile.matchSignals ?? {}) as {
      privatePreferenceTags?: string[];
      sensitivePrivateTags?: string[];
      matchKeywords?: string[];
    };
    const decisions = profile.sensitiveTagDecisions ?? {};
    const confirmedSensitive = (signals.sensitivePrivateTags ?? []).filter(
      (tag) => decisions[tag]?.status === 'confirmed',
    );
    return Array.from(
      new Set([
        ...confirmedSensitive,
        ...(signals.matchKeywords ?? []).filter((tag) =>
          confirmedSensitive.some((sensitive) =>
            this.expandMatchTag(sensitive).some((normalized) =>
              this.expandMatchTag(tag).includes(normalized),
            ),
          ),
        ),
      ]),
    );
  }

  private expandMatchTag(value: string | null | undefined): string[] {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return [];
    const tags = new Set([normalized]);
    if (
      /(rich|wealth|money|income|salary|resource|resources|asset|net.?worth)/i.test(
        normalized,
      )
    ) {
      tags.add('wealth_resource');
    }
    if (/(founder|entrepreneur|startup|business|ceo)/i.test(normalized)) {
      tags.add('business_builder');
    }
    if (/(high.?status|elite|vip)/i.test(normalized)) {
      tags.add('status_signal');
    }
    return Array.from(tags);
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
    if (!start || !end) return 12; // no constraint: assume partial overlap
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
        if (new Date(aS).toDateString() === new Date(rS).toDateString())
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
    if (activityType && tags.includes(activityType.toLowerCase())) {
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
    const bio =
      `${user.bio ?? ''} ${socialProfile?.socialPreference ?? ''}`.toLowerCase();
    const desired = (
      pref?.idealPartnerDescription ?? interestTags.join(' ')
    ).toLowerCase();
    const tokens = desired.split(/\\s+|,|，/).filter((t) => t.length > 1);
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
    const boundary =
      `${ctx.ownerProfile?.rejectRules ?? ''} ${ctx.ownerProfile?.privacyBoundary ?? ''} ${profile?.rejectRules ?? ''} ${profile?.privacyBoundary ?? ''}`.toLowerCase();
    const requestText =
      `${ctx.timePreference ?? ''} ${ctx.locationPreference ?? ''} ${ctx.socialGoal ?? ''}`.toLowerCase();
    if (!boundary) return false;
    if (
      /(不被推荐|不参与匹配|关闭推荐|不接受推荐|不要推荐|禁止推荐|退出匹配|关闭匹配)/.test(
        boundary,
      )
    )
      return true;
    if (
      /(不接受|拒绝|禁止)/.test(boundary) &&
      /(夜间|深夜|凌晨|night|midnight)/.test(requestText)
    )
      return true;
    if (
      /(不接受|拒绝|禁止)/.test(boundary) &&
      /(私人|住址|家里|酒店|hotel|home)/.test(requestText)
    )
      return true;
    return false;
  }

  /**
   * Owner-side hard filters extracted from `ownerProfile.privacyBoundary` /
   * `rejectRules` / `avoidTraits`. Honors "不要推荐男生/女生" and
   * "不要夜间见面" style declarations even when the current request does not
   * carry an explicit genderPreference / time filter.
   */
  private violatesOwnerBoundary(
    user: User,
    profile: UserSocialProfile | null,
    ctx: {
      ownerProfile?: UserSocialProfile | null;
      timePreference?: string;
      locationPreference?: string;
      socialGoal?: string;
    },
  ): boolean {
    const owner = ctx.ownerProfile;
    if (!owner) return false;
    const boundary =
      `${owner.rejectRules ?? ''} ${owner.privacyBoundary ?? ''} ${(owner.avoidTraits ?? []).join(' ')}`.toLowerCase();
    if (!boundary) return false;
    const candidateGender = this.normalizeGender(
      profile?.gender || user.gender || '',
    );
    if (
      candidateGender === 'male' &&
      /(不要男|拒绝男|不推荐男|不接受男|别推荐男)/.test(boundary)
    ) {
      return true;
    }
    if (
      candidateGender === 'female' &&
      /(不要女|拒绝女|不推荐女|不接受女|别推荐女)/.test(boundary)
    ) {
      return true;
    }
    // Night meeting boundary: filter candidates whose declared availability is
    // exclusively night-time when the owner refused night meetings.
    if (/(不要夜|不接受夜|拒绝夜|不夜间|不晚上|别夜间|别晚上)/.test(boundary)) {
      const times = (profile?.availableTimes ?? []).join(' ').toLowerCase();
      if (
        times &&
        /(夜|night|凌晨|深夜|midnight)/.test(times) &&
        !/(白天|day|下午|上午|周末|weekend)/.test(times)
      ) {
        return true;
      }
    }
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
    else warnings.push('Candidate is not verified.');
    if (user.bio && user.bio.length > 20) score += 2;
    else warnings.push('Candidate profile is incomplete.');
    if (user.avatar) score += 1;
    if (user.singleCert) score += 2;

    let level: CandidateRiskLevel = CandidateRiskLevel.Low;
    if (warnings.length >= 2) level = CandidateRiskLevel.Medium;
    if (requirement === SocialRequestSafety.VerifiedOnly && !user.verified) {
      level = CandidateRiskLevel.High;
      warnings.push(
        'Verified-only was requested, but the candidate is not verified.',
      );
    }
    return { score: Math.min(score, 10), warnings, level };
  }

  // Distance helpers

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
      // No coordinates on either side, so fall back to the same-city reason.
      // "same city" reason instead of fabricating a number.
      return null;
    }
    return null;
  }

  // Reasons and icebreakers
  //  REASONS + ICEBREAKER
  // ---------------------------------------------------------------------------

  /**
   * Pluggable. First version is rule-based; later we'll route through an LLM
   * via ai-match / agent-gateway. Keep the signature stable.
   */
  generateMatchReasons(
    cand: CandidateScore,
    request?: UserSocialRequest,
  ): string[] {
    const reasons = [...cand.reasons];
    if (
      request?.activityType &&
      cand.user.interestTags?.includes(request.activityType)
    ) {
      reasons.push(`Both like ${request.activityType}.`);
    }
    if (cand.commonTags.length === 0 && cand.breakdown.interest === 0) {
      reasons.push(
        'No shared interest tags yet, but other dimensions look compatible.',
      );
    }
    return Array.from(new Set(reasons)).slice(0, 6);
  }

  /** Pluggable. LLM replacement target. */
  generateIcebreakerMessage(
    cand: CandidateScore,
    request?: UserSocialRequest,
  ): string {
    const name = cand.user.name || 'there';
    const activity =
      request?.activityType ||
      (request?.type ? TYPE_TO_TAG[request.type] : '') ||
      'a shared activity';
    const city = request?.city || cand.user.city || '';
    const where = city ? ` in ${city}` : '';
    const when = request?.timeStart
      ? this.formatTimeWindow(request.timeStart, request.timeEnd)
      : 'recently';
    const tags = cand.commonTags.slice(0, 2).join(', ');
    const tagPart = tags ? ` We both like ${tags}.` : '';
    return `Hi ${name},${tagPart} I am looking for someone to do ${activity}${where} ${when}. Would you like to chat on FitMeet first?`;
  }

  private formatTimeWindow(start: Date, end: Date | null): string {
    const s = new Date(start);
    const dateStr = `${s.getMonth() + 1}/${s.getDate()} ${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
    if (!end) return dateStr;
    const e = new Date(end);
    return `${dateStr}-${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  }

  // View mapping
  //  VIEW MAPPING
  // ---------------------------------------------------------------------------

  private toView(
    cand: CandidateScore,
    request: UserSocialRequest | undefined,
    row: SocialRequestCandidate | undefined,
  ): MatchedCandidateView {
    const reasons = this.generateMatchReasons(cand, request);
    const suggestedMessage = this.generateIcebreakerMessage(cand, request);
    const source: MatchResultSource =
      request?.source === 'public' || cand.activeRequest
        ? 'public_intent'
        : 'social_request';
    const riskWarning = cand.risk.warnings.join(' ');
    return {
      targetType: 'user',
      userId: cand.user.id,
      candidateUserId: cand.user.id,
      source,
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
      matchedSignals: cand.commonTags,
      publicReason: reasons[0] ?? '',
      privateReason: '规则匹配结果，AI 仅可解释或生成话术。',
      riskWarning,
      suggestedOpener: suggestedMessage,
      nextAction: 'owner_confirmation_required',
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
      candidateUserId: user.id,
      source: 'social_request',
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
      matchedSignals: row.commonTags ?? [],
      publicReason: row.reasons?.[0] ?? '',
      privateReason: '候选来自已持久化的 MatchService 规则评分结果。',
      riskWarning: (row.riskWarnings ?? []).join(' '),
      suggestedOpener: row.suggestedMessage,
      nextAction: 'owner_confirmation_required',
      status: row.status,
      candidateRecordId: row.id,
    };
  }

  private bandLevel(score: number): CandidateMatchLevel {
    if (score >= 80) return CandidateMatchLevel.High;
    if (score >= 60) return CandidateMatchLevel.Medium;
    return CandidateMatchLevel.Low;
  }

  // Status transitions
  //  STATUS TRANSITIONS (used by social-requests / agent flows)
  // ---------------------------------------------------------------------------

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
