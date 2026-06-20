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
  emotionalInsight: SocialEmotionalInsight;
  reasonerSource?: 'deepseek' | 'fallback';
  reasoningConfidence?: number;
  reasoningDegraded?: boolean;
  reasoningRetryable?: boolean;
  degradationReason?: string | null;
}

export interface SocialEmotionalInsight {
  fitReason: string;
  openerAdvice: string;
  possibleAwkwardness: string;
  safeFirstStep: string;
  tone: 'gentle' | 'active' | 'careful';
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
  scenePolicy: MatchScenePolicy;
}

type MatchSceneKind =
  | 'fitness'
  | 'travel'
  | 'drinking'
  | 'dating'
  | 'renting'
  | 'mahjong'
  | 'cards'
  | 'pet'
  | 'study'
  | 'coffee'
  | 'walking'
  | 'general';

type MatchScenePolicy = {
  kind: MatchSceneKind;
  label: string;
  riskLevel: CandidateRiskLevel;
  confirmation: 'normal' | 'strict' | 'double_confirm' | 'blocked';
  warning: string;
};

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
      requestText: [
        input.type ?? '',
        input.activityType ?? '',
        ...(input.interestTags ?? []),
      ].join(' '),
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
      requestText: [
        request.type,
        request.activityType,
        request.title,
        request.description,
        request.rawText,
        ...(request.interestTags ?? []),
        ...(typeof request.metadata?.socialGoal === 'string'
          ? [request.metadata.socialGoal]
          : []),
      ].join(' '),
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
      view.nextAction = this.nextActionForScene(c.scenePolicy);
      view.suggestedMessage = reasoning.suggestedOpener;
      view.reasonerSource = reasoning.reasonerSource;
      view.reasoningConfidence = reasoning.reasonerConfidence;
      view.reasoningDegraded = reasoning.reasoningDegraded;
      view.reasoningRetryable = reasoning.reasoningRetryable;
      view.degradationReason = reasoning.degradationReason;
      view.reasons = Array.from(
        new Set([reasoning.publicReason, ...view.reasons].filter(Boolean)),
      ).slice(0, 6);
      view.risk = {
        level: view.risk.level,
        warnings: Array.from(
          new Set([...view.risk.warnings, ...reasoning.riskWarnings]),
        ),
      };
      view.emotionalInsight = this.buildEmotionalInsight(
        c,
        request,
        view.reasons,
      );
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
      requestText: string;
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
    const scenePolicy = this.classifyScenePolicy(ctx);

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

      // 1) Distance, max 15
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

      // 2) Available-time overlap, max 15
      const availabilityScore = this.scoreAvailabilityOverlap(
        ctx.timeStart,
        ctx.timeEnd,
        user,
        pref,
        socialProfile,
        ctx.timePreference,
      );
      breakdown.timeOverlap = availabilityScore;
      if (availabilityScore >= 13) {
        reasons.push('可约时间高度重叠。');
      } else if (availabilityScore >= 8) {
        reasons.push('可约时间有部分交集。');
      } else if (availabilityScore >= 4) {
        reasons.push('候选人可能有时间窗口，但需要先确认。');
      }

      // 3) Interest similarity, max 18
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
      reasons.push(...compatibility.publicReasons);
      reasons.push(...compatibility.privateReasons);
      warnings.push(...compatibility.riskTips);
      const interestScore = Math.min(
        18,
        Math.round(
          compatibility.breakdown.interest * 0.65 +
            Math.min(compatibility.commonTags.length, 4) * 2,
        ),
      );
      breakdown.interestSimilarity = interestScore;
      if (interestScore >= 14) {
        reasons.push('兴趣相似度较高，适合自然破冰。');
      } else if (interestScore >= 8) {
        reasons.push('兴趣有交集，可以先从轻量话题试探。');
      }

      // 4-6) Life rhythm, social energy, and relationship goal.
      const lifestyleScore = this.scoreLifestyleSync(
        ctx.ownerProfile,
        socialProfile,
      );
      breakdown.lifeRhythm = lifestyleScore;
      if (lifestyleScore >= 9) reasons.push('生活作息或日常场景比较同频。');

      const socialEnergyScore = this.scoreSocialEnergy(
        ctx.ownerProfile,
        socialProfile,
      );
      breakdown.socialEnergy = socialEnergyScore;
      if (socialEnergyScore >= 8)
        reasons.push('社交能量接近，沟通节奏更容易舒服。');

      const relationshipGoalScore = this.scoreRelationshipGoal(
        ctx,
        socialProfile,
        compatibility.breakdown.bidirectionalIntent,
      );
      breakdown.relationshipGoal = relationshipGoalScore;
      if (relationshipGoalScore >= 9)
        reasons.push('关系目标接近，双方期待更容易对齐。');

      // 7-8) Trust and safety-risk, max 10 + 8
      const {
        score: trustScore,
        warnings: safeWarn,
        level: profileRiskLevel,
      } = this.scoreSafety(user, ctx.safetyRequirement);
      breakdown.trustworthiness = trustScore;
      warnings.push(...safeWarn);
      if (user.verified) reasons.push('Candidate is verified.');

      if (pref?.acceptAgentMessages)
        reasons.push('Candidate accepts agent-mediated messages.');

      const safetyRiskScore = this.scoreSafetyRisk(scenePolicy, {
        verified: user.verified,
        warnings,
        distanceKm,
      });
      breakdown.safetyRisk = safetyRiskScore;
      if (scenePolicy.warning) warnings.push(scenePolicy.warning);

      const total =
        distScore +
        availabilityScore +
        interestScore +
        lifestyleScore +
        socialEnergyScore +
        relationshipGoalScore +
        trustScore +
        safetyRiskScore;

      const riskLevel = this.maxRiskLevel(
        profileRiskLevel,
        scenePolicy.riskLevel,
      );

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
        risk: { level: riskLevel, warnings: Array.from(new Set(warnings)) },
        scenePolicy,
      });
    }

    return out.sort((a, b) => b.total - a.total);
  }

  // Individual scorers

  private scoreDistance(distanceKm: number | null, radiusKm: number): number {
    if (distanceKm == null) {
      // Same-city fallback (no coords available): moderate score.
      return 9;
    }
    if (distanceKm <= 1) return 15;
    if (distanceKm <= 3) return 13;
    if (distanceKm <= 5) return 10;
    if (distanceKm <= 10) return 7;
    if (distanceKm <= radiusKm) return 4;
    return 0;
  }

  private scoreAvailabilityOverlap(
    start: Date | null,
    end: Date | null,
    user: User,
    pref: UserPreference | null,
    profile: UserSocialProfile | null,
    timePreference?: string,
  ): number {
    const raw = this.scoreTime(start, end, user, pref, profile, timePreference);
    return Math.min(15, Math.round(raw * 0.75));
  }

  private scoreLifestyleSync(
    owner: UserSocialProfile | null | undefined,
    candidate: UserSocialProfile | null,
  ): number {
    if (!owner || !candidate) return 4;
    const ownerSignals = [
      ...this.parseTimeTokens(owner.availableTimes?.join(' ') ?? ''),
      ...this.parseTimeTokens(owner.weekdayAvailability ?? ''),
      ...this.parseTimeTokens(owner.weekendAvailability ?? ''),
      ...this.cleanList(owner.lifestyleTags),
      ...this.cleanList(owner.socialScenes),
    ];
    const candidateSignals = [
      ...this.parseTimeTokens(candidate.availableTimes?.join(' ') ?? ''),
      ...this.parseTimeTokens(candidate.weekdayAvailability ?? ''),
      ...this.parseTimeTokens(candidate.weekendAvailability ?? ''),
      ...this.cleanList(candidate.lifestyleTags),
      ...this.cleanList(candidate.socialScenes),
    ];
    const overlap = this.overlapCount(ownerSignals, candidateSignals);
    if (overlap >= 4) return 12;
    if (overlap === 3) return 10;
    if (overlap === 2) return 8;
    if (overlap === 1) return 6;
    return 3;
  }

  private scoreSocialEnergy(
    owner: UserSocialProfile | null | undefined,
    candidate: UserSocialProfile | null,
  ): number {
    if (!owner || !candidate) return 4;
    const ownerEnergy = this.energyLevel(
      `${owner.socialStyle} ${owner.openness} ${owner.socialPreference} ${(owner.traits ?? []).join(' ')}`,
    );
    const candidateEnergy = this.energyLevel(
      `${candidate.socialStyle} ${candidate.openness} ${candidate.socialPreference} ${(candidate.traits ?? []).join(' ')}`,
    );
    if (ownerEnergy === 0 || candidateEnergy === 0) return 5;
    const diff = Math.abs(ownerEnergy - candidateEnergy);
    if (diff === 0) return 10;
    if (diff === 1) return 8;
    return 4;
  }

  private scoreRelationshipGoal(
    ctx: {
      socialGoal?: string;
      type?: SocialRequestType;
      requestText?: string;
      ownerProfile?: UserSocialProfile | null;
    },
    candidate: UserSocialProfile | null,
    bidirectionalIntent: number,
  ): number {
    const requestGoals = this.relationshipGoalTokens(
      `${ctx.socialGoal ?? ''} ${ctx.type ?? ''} ${ctx.requestText ?? ''} ${(ctx.ownerProfile?.relationshipGoals ?? []).join(' ')}`,
    );
    const candidateGoals = this.relationshipGoalTokens(
      `${(candidate?.relationshipGoals ?? []).join(' ')} ${(candidate?.wantToMeet ?? []).join(' ')} ${candidate?.socialPreference ?? ''}`,
    );
    const overlap = this.overlapCount(requestGoals, candidateGoals);
    if (overlap >= 2) return 12;
    if (overlap === 1) return 9;
    if (bidirectionalIntent >= 7) return 8;
    if (requestGoals.length === 0 || candidateGoals.length === 0) return 5;
    return 2;
  }

  private scoreSafetyRisk(
    policy: MatchScenePolicy,
    input: { verified: boolean; warnings: string[]; distanceKm: number | null },
  ): number {
    let score = 8;
    if (policy.riskLevel === CandidateRiskLevel.Medium) score -= 2;
    if (policy.riskLevel === CandidateRiskLevel.High) score -= 5;
    if (!input.verified) score -= 1;
    if (input.warnings.length >= 2) score -= 1;
    if (input.distanceKm == null && policy.confirmation !== 'normal')
      score -= 1;
    return Math.max(0, Math.min(8, score));
  }

  private classifyScenePolicy(ctx: {
    type?: SocialRequestType;
    activityType?: string;
    requestText?: string;
  }): MatchScenePolicy {
    const text =
      `${ctx.type ?? ''} ${ctx.activityType ?? ''} ${ctx.requestText ?? ''}`.toLowerCase();
    if (
      /(支付|付款|转账|钱包|押金|精确定位|实时定位|共享位置|payment|wallet|deposit|precise.?location)/i.test(
        text,
      )
    ) {
      return {
        kind: 'general',
        label: '禁止自动执行动作',
        riskLevel: CandidateRiskLevel.High,
        confirmation: 'blocked',
        warning:
          '支付、钱包和精确定位永远不能由 Agent 自动执行，只能由用户本人在明确确认后处理。',
      };
    }
    if (
      /(酒|喝酒|酒搭子|夜店)/i.test(text) ||
      /\b(bar|pub|club|ktv|drinking|drink)\b/i.test(text)
    ) {
      return {
        kind: 'drinking',
        label: '酒局',
        riskLevel: CandidateRiskLevel.High,
        confirmation: 'double_confirm',
        warning:
          '酒局属于高风险线下场景，必须双方确认公开地点、结束时间和回家方式，Agent 不应自动推进。',
      };
    }
    if (/(相亲|dating|date|恋爱|脱单|对象|婚恋)/i.test(text)) {
      return {
        kind: 'dating',
        label: '相亲/约会',
        riskLevel: CandidateRiskLevel.High,
        confirmation: 'double_confirm',
        warning:
          '相亲约会需要更高确认门槛：先站内沟通，避免承诺关系、金钱往来或私密地点见面。',
      };
    }
    if (/(租房|合租|室友|看房|房东|押金|rent|roommate|apartment)/i.test(text)) {
      return {
        kind: 'renting',
        label: '租房',
        riskLevel: CandidateRiskLevel.High,
        confirmation: 'double_confirm',
        warning:
          '租房涉及住址和资金风险，Agent 只能辅助筛选，押金、合同和看房必须人工确认。',
      };
    }
    if (/(旅游|旅行|出游|旅伴|trip|travel|hotel|酒店|民宿|过夜)/i.test(text)) {
      return {
        kind: 'travel',
        label: '旅行',
        riskLevel: CandidateRiskLevel.High,
        confirmation: 'double_confirm',
        warning:
          '旅行搭子涉及长时间同行和住宿边界，必须拆成公开短行程并人工确认预算、路线和安全预案。',
      };
    }
    if (/(麻将|mahjong)/i.test(text)) {
      return {
        kind: 'mahjong',
        label: '麻将',
        riskLevel: CandidateRiskLevel.Medium,
        confirmation: 'strict',
        warning:
          '麻将场景要提前确认是否涉钱、地点是否公开，Agent 不自动组织私密牌局。',
      };
    }
    if (/(扑克|德州|牌局|poker|cards|texas)/i.test(text)) {
      return {
        kind: 'cards',
        label: '扑克/牌局',
        riskLevel: CandidateRiskLevel.Medium,
        confirmation: 'strict',
        warning: '牌局场景要提前确认规则和是否涉钱，避免私人封闭场所。',
      };
    }
    if (
      ctx.type === SocialRequestType.FitnessPartner ||
      /(健身|gym|workout|撸铁|私教)/i.test(text)
    ) {
      return {
        kind: 'fitness',
        label: '健身',
        riskLevel: CandidateRiskLevel.Medium,
        confirmation: 'strict',
        warning:
          '健身约练需先确认强度、场馆和身体边界，不让 Agent 自动承诺训练计划或私教付费。',
      };
    }
    if (
      ctx.type === SocialRequestType.DogWalking ||
      /(遛狗|宠物|dog)/i.test(text)
    ) {
      return {
        kind: 'pet',
        label: '遛狗/宠物',
        riskLevel: CandidateRiskLevel.Medium,
        confirmation: 'strict',
        warning: '宠物见面建议开放场地，先保持距离适应，不进入私人住址。',
      };
    }
    if (ctx.type === SocialRequestType.CoffeeChat) {
      return {
        kind: 'coffee',
        label: '咖啡轻聊',
        riskLevel: CandidateRiskLevel.Low,
        confirmation: 'normal',
        warning: '',
      };
    }
    if (
      ctx.type === SocialRequestType.CityWalk ||
      ctx.type === SocialRequestType.RunningPartner
    ) {
      return {
        kind: 'walking',
        label: '户外轻活动',
        riskLevel: CandidateRiskLevel.Medium,
        confirmation: 'strict',
        warning: '户外活动要先确认路线、强度、结束点和天气，不建议偏僻路线。',
      };
    }
    if (ctx.type === SocialRequestType.StudyPartner) {
      return {
        kind: 'study',
        label: '学习搭子',
        riskLevel: CandidateRiskLevel.Low,
        confirmation: 'normal',
        warning: '',
      };
    }
    return {
      kind: 'general',
      label: '普通社交',
      riskLevel: CandidateRiskLevel.Low,
      confirmation: 'normal',
      warning: '',
    };
  }

  private maxRiskLevel(
    a: CandidateRiskLevel,
    b: CandidateRiskLevel,
  ): CandidateRiskLevel {
    const rank = {
      [CandidateRiskLevel.Low]: 0,
      [CandidateRiskLevel.Medium]: 1,
      [CandidateRiskLevel.High]: 2,
    };
    return rank[a] >= rank[b] ? a : b;
  }

  private cleanList(values: string[] | undefined): string[] {
    return (values ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private overlapCount(a: string[], b: string[]): number {
    const bSet = new Set(this.cleanList(b));
    return new Set(this.cleanList(a).filter((item) => bSet.has(item))).size;
  }

  private energyLevel(text: string): number {
    const value = text.toLowerCase();
    if (/(高|主动|外向|开放|热情|open|active|extrovert|high)/i.test(value))
      return 3;
    if (/(低|安静|慢热|克制|内向|introvert|quiet|low)/i.test(value)) return 1;
    if (/(中|适中|稳定|medium|balanced)/i.test(value)) return 2;
    return 0;
  }

  private relationshipGoalTokens(text: string): string[] {
    const value = text.toLowerCase();
    const tokens: string[] = [];
    if (
      /(搭子|partner|buddy|约练|跑步|健身|麻将|扑克|散步|旅游|旅行)/i.test(
        value,
      )
    )
      tokens.push('partner');
    if (/(朋友|交友|聊天|认识|friend|social)/i.test(value))
      tokens.push('friendship');
    if (/(相亲|恋爱|对象|dating|date|relationship)/i.test(value))
      tokens.push('dating');
    if (/(学习|自习|study)/i.test(value)) tokens.push('study');
    if (/(租房|合租|室友|rent|roommate)/i.test(value)) tokens.push('renting');
    return Array.from(new Set(tokens));
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
      String(ctx.genderPreference) !== 'any' &&
      String(ctx.genderPreference) !== 'non_specified' &&
      gender &&
      gender !== String(ctx.genderPreference)
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
      ...this.stringArray(metadata.personalityPreference),
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

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
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
    if (
      cand.commonTags.length === 0 &&
      cand.breakdown.interestSimilarity === 0
    ) {
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
    const name = cand.user.name || '你好';
    const activity =
      this.activityLabel(request?.type, request?.activityType) ||
      '一次轻松活动';
    const city = request?.city || cand.user.city || '';
    const where = city ? `在${city}` : '在附近';
    const when = request?.timeStart
      ? this.formatTimeWindow(request.timeStart, request.timeEnd)
      : '最近';
    const tags = cand.commonTags.slice(0, 2).join('、');
    const tagPart = tags
      ? `看到你也对「${tags}」感兴趣，感觉我们节奏可能挺合适。`
      : '';
    return `你好 ${name}，${tagPart}我最近想${where}${when}约一次${activity}，不着急定，先在 FitMeet 上简单聊聊时间和公开地点可以吗？`;
  }

  private buildEmotionalInsight(
    cand: CandidateScore,
    request?: UserSocialRequest,
    reasons: string[] = [],
  ): SocialEmotionalInsight {
    const tags = cand.commonTags.slice(0, 2);
    const city =
      request?.city || cand.socialProfile?.city || cand.user.city || '';
    const activity = this.activityLabel(request?.type, request?.activityType);
    const hasRisk =
      cand.risk.level !== CandidateRiskLevel.Low ||
      cand.risk.warnings.length > 0;
    const fitSignal = tags.length
      ? `TA 和你都提到过 ${tags.join('、')}，共同话题比较自然`
      : reasons[0] || 'TA 在时间、地点或社交边界上和这次需求有交集';
    const placeSignal = city ? `，而且都在${city}附近，线下成本不高` : '';

    return {
      fitReason: `${fitSignal}${placeSignal}。这不是只看分数，更像是一次可以低压力开始的连接。`,
      openerAdvice: tags.length
        ? `开场建议轻一点，从「${tags[0]}」切入，不要一上来就把时间地点全压给对方，先给 TA 一个舒服的选择空间。`
        : '开场建议先确认对方当下是否方便聊，再慢慢补充你的活动想法，语气保持轻松、可拒绝。',
      possibleAwkwardness: hasRisk
        ? `这里需要温柔但谨慎：${cand.risk.warnings[0] || '资料信息还不够完整'}。别急着推进见面，先用站内聊天确认节奏。`
        : '可能的小尴尬是双方期待不完全一样：一个想认真约练，一个只是轻松认识。开头先说清楚强度和时长，会更体面。',
      safeFirstStep: this.safeFirstStep(request, activity),
      tone: hasRisk ? 'careful' : cand.total >= 80 ? 'active' : 'gentle',
    };
  }

  private safeFirstStep(
    request: UserSocialRequest | undefined,
    activity: string,
  ): string {
    const type = request?.type;
    if (
      type === SocialRequestType.RunningPartner ||
      type === SocialRequestType.FitnessPartner
    ) {
      return `第一步建议只约公开场地的短时${activity}，比如 30-45 分钟；路线、强度和结束点先说清楚，不交换私人联系方式。`;
    }
    if (
      type === SocialRequestType.CoffeeChat ||
      type === SocialRequestType.CityWalk
    ) {
      return `第一步建议选人多、好离开的公开地点，先聊 30-60 分钟；不合适也能自然结束，双方都轻松。`;
    }
    if (type === SocialRequestType.DogWalking) {
      return '第一步建议在开放公园或小区公共区域见面，先让宠物保持距离适应，不去私人住址。';
    }
    return '第一步建议先站内聊清楚时间、地点、预算和边界，再选择公开场景见面；任何联系方式交换都等双方确认。';
  }

  private activityLabel(
    type?: SocialRequestType,
    activityType?: string | null,
  ): string {
    if (activityType) return activityType;
    if (!type) return '';
    const map: Record<SocialRequestType, string> = {
      [SocialRequestType.RunningPartner]: '跑步',
      [SocialRequestType.FitnessPartner]: '健身',
      [SocialRequestType.DogWalking]: '遛狗',
      [SocialRequestType.CoffeeChat]: '咖啡轻聊',
      [SocialRequestType.CityWalk]: '散步',
      [SocialRequestType.StudyPartner]: '学习搭子',
      [SocialRequestType.Custom]: '见面聊聊',
    };
    return map[type] ?? '';
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
    const emotionalInsight = this.buildEmotionalInsight(cand, request, reasons);
    const source: MatchResultSource =
      String(request?.source) === 'public' || cand.activeRequest
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
      nextAction: this.nextActionForScene(cand.scenePolicy),
      emotionalInsight,
      reasonerSource: 'fallback',
      reasoningConfidence: 0.5,
      reasoningDegraded: false,
      reasoningRetryable: false,
      degradationReason: null,
      status: row?.status,
      candidateRecordId: row?.id,
    };
  }

  private rowToView(
    row: SocialRequestCandidate,
    user: User,
  ): MatchedCandidateView {
    const fallbackCandidate: CandidateScore = {
      user,
      pref: null,
      socialProfile: null,
      activeRequest: null,
      total: row.score,
      breakdown: row.scoreBreakdown ?? {},
      reasons: row.reasons ?? [],
      commonTags: row.commonTags ?? [],
      distanceKm: row.distanceKm,
      risk: { level: row.riskLevel, warnings: row.riskWarnings ?? [] },
      scenePolicy: {
        kind: 'general',
        label: '普通社交',
        riskLevel: row.riskLevel,
        confirmation:
          row.riskLevel === CandidateRiskLevel.High
            ? 'double_confirm'
            : row.riskLevel === CandidateRiskLevel.Medium
              ? 'strict'
              : 'normal',
        warning: (row.riskWarnings ?? [])[0] ?? '',
      },
    };
    const reasonerQuality = this.reasonerQualityFromBreakdown(
      row.scoreBreakdown ?? {},
    );
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
      emotionalInsight: this.buildEmotionalInsight(
        fallbackCandidate,
        undefined,
        row.reasons ?? [],
      ),
      ...reasonerQuality,
      status: row.status,
      candidateRecordId: row.id,
    };
  }

  private reasonerQualityFromBreakdown(
    breakdown: Record<string, number>,
  ): Pick<
    MatchedCandidateView,
    | 'reasonerSource'
    | 'reasoningConfidence'
    | 'reasoningDegraded'
    | 'reasoningRetryable'
    | 'degradationReason'
  > {
    const degraded = breakdown.aiReasoningDegraded === 1;
    const hasReasoningQuality =
      typeof breakdown.aiReasoningConfidence === 'number' ||
      typeof breakdown.aiReasoningDegraded === 'number';
    const confidence =
      typeof breakdown.aiReasoningConfidence === 'number'
        ? Math.max(0, Math.min(100, breakdown.aiReasoningConfidence)) / 100
        : 0.5;
    return {
      reasonerSource:
        hasReasoningQuality && !degraded ? 'deepseek' : 'fallback',
      reasoningConfidence: confidence,
      reasoningDegraded: degraded,
      reasoningRetryable: degraded,
      degradationReason: degraded ? 'model_unavailable' : null,
    };
  }

  private bandLevel(score: number): CandidateMatchLevel {
    if (score >= 80) return CandidateMatchLevel.High;
    if (score >= 60) return CandidateMatchLevel.Medium;
    return CandidateMatchLevel.Low;
  }

  private nextActionForScene(policy: MatchScenePolicy): string {
    if (policy.confirmation === 'blocked') {
      return `blocked_manual_only:${policy.kind}`;
    }
    if (policy.confirmation === 'double_confirm') {
      return `double_confirmation_required:${policy.kind}`;
    }
    if (policy.confirmation === 'strict') {
      return `strict_owner_confirmation_required:${policy.kind}`;
    }
    return 'owner_confirmation_required';
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
