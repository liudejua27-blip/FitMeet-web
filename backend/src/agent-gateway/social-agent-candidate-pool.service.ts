import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';

import {
  SocialActivity,
  SocialActivityStatus,
} from '../activities/entities/activity.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { extractKnownCity, sanitizeCity } from '../common/city.util';
import { cleanDisplayText } from '../common/display-text.util';
import {
  CandidateMatchLevel,
  CandidateRiskLevel,
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import { SafetyService } from '../safety/safety.service';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { AgentTask } from './entities/agent-task.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  SocialRequest,
  SocialRequestStatus,
} from './entities/social-request.entity';
import {
  CandidateExplanation,
  CandidateExplanationService,
} from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import { buildSocialMatchDynamicExplanation } from './social-agent-candidate-dynamic-explanation';
import {
  lifeGraphBehaviorFit,
  lifeGraphBoundaryFit,
  lifeGraphGoalBoost,
  lifeGraphLocationBoost,
  lifeGraphRhythmBoost,
  lifeGraphSafetyPenalty,
  lifeGraphSportBoost,
  lifeGraphTimeBoost,
} from './social-agent-candidate-life-graph-scoring';
import {
  candidateDataQuality,
  candidateDisplayName,
  candidateProfileCompleteness,
  candidateProfileTags,
} from './social-agent-candidate-profile-presenter';
import type { CandidateProfileDataQuality } from './social-agent-candidate-profile-presenter';
import {
  extractCandidateActivity,
  extractCandidateTags,
  extractCandidateTime,
} from './social-agent-candidate-query-parser';

export type CandidatePoolSource =
  | 'profile_candidate'
  | 'public_intent'
  | 'activity';

export type CandidatePoolIntent = 'social_search' | 'activity_search';

export type CandidatePoolDataQuality = CandidateProfileDataQuality;

export type CandidatePoolDebugReasons = {
  usersTotal: number;
  socialProfilesTotal: number;
  publicIntentsTotal: number;
  eligibleProfiles: number;
  eligiblePublicIntents: number;
  eligibleActivities: number;
  filteredBySelf: number;
  filteredByBlocked: number;
  filteredByCity: number;
  filteredByBoundary: number;
  scoreBelowThreshold: number;
};

export type CandidatePoolCounts = {
  users: number;
  socialProfiles: number;
  aiDelegateProfiles: number;
  publicSocialIntents: number;
  socialRequests: number;
  socialActivities: number;
};

export type CandidatePoolFiltered = {
  self: number;
  blocked: number;
  cityMismatch: number;
  boundaryMismatch: number;
  scoreBelowThreshold: number;
};

export type CandidatePoolQuery = {
  ownerUserId: number;
  intent?: CandidatePoolIntent;
  taskId?: number | null;
  socialRequestId?: number | null;
  city?: string | null;
  activityType?: string | null;
  interestTags?: string[] | null;
  timePreference?: string | null;
  locationPreference?: string | null;
  rawText?: string | null;
  limit?: number | null;
  persistCandidates?: boolean;
};

export type CandidatePoolResolvedQuery = {
  city: string;
  intent: CandidatePoolIntent;
  interestTags: string[];
  activityType: string;
  timePreference: string;
  locationPreference: string;
  socialRequestId: number | null;
  rawText: string;
};

export type CandidatePoolCandidate = {
  source: CandidatePoolSource;
  isRealData: true;
  targetUserId: number;
  candidateUserId: number;
  userId: number;
  publicIntentId: string | null;
  socialRequestId: number | null;
  activityId: number | null;
  displayName: string;
  nickname: string;
  avatar: string;
  color: string;
  city: string;
  interestTags: string[];
  profileCompleteness: number;
  dataQuality: CandidatePoolDataQuality;
  matchScore: number;
  score: number;
  level: CandidateMatchLevel;
  matchReasons: string[];
  reasons: string[];
  riskWarnings: string[];
  risk: { level: CandidateRiskLevel; warnings: string[] };
  suggestedOpener: string;
  suggestedMessage: string;
  commonTags: string[];
  distanceKm: number | null;
  scoreBreakdown: Record<string, number>;
  candidateRecordId?: number | null;
  status?: SocialRequestCandidateStatus;
  matchedSignals: string[];
  publicReason: string;
  privateReason: string;
  riskWarning: string;
  nextAction: string;
  whyYouMayLike: string;
  whyNow: string;
  matchPoints: string[];
  boundaryNotes: string[];
  openerStrategy: string;
  dynamicSignalReasons: string[];
  continuousFilterHints: string[];
  candidateExplanation: CandidateExplanation;
  emotionalInsight: CandidateEmotionalInsight;
  lifeGraphExplanation?: {
    usedSignals: string[];
    missingSignals: string[];
    boundaryNotes: string[];
    confidenceLevel: 'high' | 'medium' | 'low';
  };
  updatedAt: string | null;
};

export type CandidateEmotionalInsight = {
  fitReason: string;
  openerAdvice: string;
  possibleAwkwardness: string;
  safeFirstStep: string;
  tone: 'gentle' | 'active' | 'careful';
};

export type CandidatePoolActivityResult = {
  id: string;
  source: CandidatePoolSource;
  isRealData: true;
  targetUserId: number | null;
  candidateUserId: number | null;
  userId: number | null;
  activityId: number | null;
  publicIntentId: string | null;
  title: string;
  description: string;
  city: string;
  loc: string;
  requestType: string;
  interestTags: string[];
  timePreference: string;
  ownerUserId: number | null;
  status: string;
  createdAt: string | null;
  matchScore: number;
  matchReasons: string[];
  candidateExplanation?: CandidateExplanation;
};

export type CandidatePoolSearchResult = {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  candidates: CandidatePoolCandidate[];
  emptyReason: 'no_real_candidates' | null;
  message: string;
  debugReasons: CandidatePoolDebugReasons;
  debug: CandidatePoolDebugSnapshot;
};

export type CandidatePoolActivitySearchResult = {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  activityResults: CandidatePoolActivityResult[];
  emptyReason: 'no_real_candidates' | null;
  message: string;
  debugReasons: CandidatePoolDebugReasons;
  debug: CandidatePoolDebugSnapshot;
};

export type CandidatePoolDebugSnapshot = {
  ownerUserId: number;
  query: CandidatePoolResolvedQuery;
  counts: CandidatePoolCounts;
  eligible: {
    profileCandidates: number;
    publicIntentCandidates: number;
    activityCandidates: number;
  };
  filtered: CandidatePoolFiltered;
  finalCandidates: Array<
    Pick<
      CandidatePoolCandidate,
      | 'source'
      | 'isRealData'
      | 'targetUserId'
      | 'candidateUserId'
      | 'userId'
      | 'publicIntentId'
      | 'socialRequestId'
      | 'activityId'
      | 'displayName'
      | 'city'
      | 'interestTags'
      | 'profileCompleteness'
      | 'dataQuality'
      | 'matchScore'
      | 'matchReasons'
      | 'riskWarnings'
      | 'suggestedOpener'
    >
  >;
};

const EMPTY_CANDIDATE_MESSAGE =
  '当前没有找到符合条件的真实用户，我可以帮你发布一个约练需求，或者你可以放宽城市、时间、兴趣条件。';

const EMPTY_ACTIVITY_MESSAGE =
  '当前没有找到符合条件的真实活动或公开约练卡片，可以换个城市、时间或活动类型再试。';

const ACTIVE_PUBLIC_STATUSES = [
  SocialRequestStatus.Active,
  SocialRequestStatus.Searching,
  SocialRequestStatus.Matched,
];

const ACTIVE_ACTIVITY_STATUSES = [
  SocialActivityStatus.PendingConfirm,
  SocialActivityStatus.Confirmed,
  SocialActivityStatus.InProgress,
];

const DISABLED_BOUNDARY_RE =
  /(不被推荐|不参与匹配|关闭推荐|不接受推荐|不要推荐|禁止推荐|退出匹配|关闭匹配)/i;

const DEFAULT_LIMIT = 10;

@Injectable()
export class SocialAgentCandidatePoolService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSocialProfile)
    private readonly profileRepo: Repository<UserSocialProfile>,
    @InjectRepository(AiDelegateProfile)
    private readonly aiDelegateRepo: Repository<AiDelegateProfile>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(SocialRequest)
    private readonly legacySocialRequestRepo: Repository<SocialRequest>,
    @InjectRepository(UserSocialRequest)
    private readonly userSocialRequestRepo: Repository<UserSocialRequest>,
    @InjectRepository(SocialActivity)
    private readonly activityRepo: Repository<SocialActivity>,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly safety: SafetyService,
    private readonly candidateExplanation: CandidateExplanationService,
    private readonly sceneRisk: SceneRiskPolicyService,
    @Optional() private readonly lifeGraph?: LifeGraphService,
  ) {}

  async searchSocial(
    input: CandidatePoolQuery,
  ): Promise<CandidatePoolSearchResult> {
    const query = await this.resolveQuery({
      ...input,
      intent: 'social_search',
    });
    const [
      counts,
      users,
      profiles,
      delegates,
      publicIntents,
      legacyRequests,
      blockedIds,
      lifeGraphSignals,
    ] = await Promise.all([
      this.loadCounts(),
      this.safeFind(this.userRepo, { order: { updatedAt: 'DESC' } }),
      this.safeFind(this.profileRepo, { order: { updatedAt: 'DESC' } }),
      this.safeFind(this.aiDelegateRepo, { order: { updatedAt: 'DESC' } }),
      this.safeFind(this.publicIntentRepo, { order: { updatedAt: 'DESC' } }),
      this.safeFind(this.legacySocialRequestRepo, {
        order: { updatedAt: 'DESC' },
      }),
      this.loadBlockedIds(input.ownerUserId),
      this.loadLifeGraphSignals(input.ownerUserId),
    ]);

    const profileMap = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    const delegateMap = new Map(
      delegates.map((delegate) => [delegate.userId, delegate]),
    );
    const userMap = new Map(users.map((user) => [user.id, user]));
    const filtered = this.emptyFiltered();

    const profileCandidates = this.buildProfileCandidates({
      ownerUserId: input.ownerUserId,
      query,
      users,
      profileMap,
      delegateMap,
      blockedIds,
      filtered,
      lifeGraphSignals,
    });
    const publicCandidates = this.buildPublicIntentCandidates({
      ownerUserId: input.ownerUserId,
      query,
      publicIntents,
      legacyRequests,
      userMap,
      profileMap,
      delegateMap,
      blockedIds,
      filtered,
      lifeGraphSignals,
    });
    const merged = this.mergeSocialCandidates([
      ...profileCandidates,
      ...publicCandidates,
    ]);
    const limit = this.normalizeLimit(input.limit);
    const candidates = merged.slice(0, limit);
    if (input.persistCandidates !== false) {
      await this.persistCandidateRows(query.socialRequestId, candidates);
    }

    const debug = this.buildDebug({
      ownerUserId: input.ownerUserId,
      query,
      counts,
      filtered,
      profileCandidates: profileCandidates.length,
      publicIntentCandidates: publicCandidates.length,
      activityCandidates: 0,
      finalCandidates: candidates,
    });
    return {
      ownerUserId: input.ownerUserId,
      query,
      candidates,
      emptyReason: candidates.length === 0 ? 'no_real_candidates' : null,
      message: candidates.length === 0 ? EMPTY_CANDIDATE_MESSAGE : '',
      debugReasons: this.toDebugReasons(debug),
      debug,
    };
  }

  async searchActivity(
    input: CandidatePoolQuery,
  ): Promise<CandidatePoolActivitySearchResult> {
    const query = await this.resolveQuery({
      ...input,
      intent: 'activity_search',
    });
    const [counts, activities, publicIntents, blockedIds] = await Promise.all([
      this.loadCounts(),
      this.safeFind(this.activityRepo, { order: { updatedAt: 'DESC' } }),
      this.safeFind(this.publicIntentRepo, { order: { updatedAt: 'DESC' } }),
      this.loadBlockedIds(input.ownerUserId),
    ]);
    const filtered = this.emptyFiltered();
    const realActivities = this.buildActivityResults({
      ownerUserId: input.ownerUserId,
      query,
      activities,
      publicIntents: [],
      blockedIds,
      filtered,
    });
    const fallbackPublicIntents =
      realActivities.length > 0
        ? []
        : this.buildActivityResults({
            ownerUserId: input.ownerUserId,
            query,
            activities: [],
            publicIntents,
            blockedIds,
            filtered,
          });
    const activityResults = [...realActivities, ...fallbackPublicIntents].slice(
      0,
      this.normalizeLimit(input.limit),
    );
    const debug = this.buildDebug({
      ownerUserId: input.ownerUserId,
      query,
      counts,
      filtered,
      profileCandidates: 0,
      publicIntentCandidates: fallbackPublicIntents.length,
      activityCandidates: realActivities.length,
      finalCandidates: [],
    });
    return {
      ownerUserId: input.ownerUserId,
      query,
      activityResults,
      emptyReason: activityResults.length === 0 ? 'no_real_candidates' : null,
      message: activityResults.length === 0 ? EMPTY_ACTIVITY_MESSAGE : '',
      debugReasons: this.toDebugReasons(debug),
      debug,
    };
  }

  async debugCandidatePool(
    ownerUserId: number,
    taskId?: number | null,
    intent: CandidatePoolIntent = 'social_search',
  ): Promise<CandidatePoolDebugSnapshot> {
    const input: CandidatePoolQuery = {
      ownerUserId,
      intent,
      taskId: taskId ?? null,
      persistCandidates: false,
    };
    if (intent === 'activity_search') {
      return (await this.searchActivity(input)).debug;
    }
    return (await this.searchSocial(input)).debug;
  }

  private async resolveQuery(
    input: CandidatePoolQuery,
  ): Promise<CandidatePoolResolvedQuery> {
    let request: UserSocialRequest | null = null;
    const socialRequestId = this.number(input.socialRequestId);
    if (socialRequestId) {
      request = await this.userSocialRequestRepo.findOne({
        where: { id: socialRequestId },
      });
    }

    let task: AgentTask | null = null;
    const taskId = this.number(input.taskId);
    if (taskId) {
      task = await this.taskRepo.findOne({ where: { id: taskId } });
      if (!task || task.ownerUserId !== input.ownerUserId) {
        throw new NotFoundException('Social Agent task not found');
      }
    }

    const inputCity = sanitizeCity(input.city);
    const inputActivityType = cleanDisplayText(input.activityType, '');
    const inputTimePreference = cleanDisplayText(input.timePreference, '');
    const inputLocationPreference = cleanDisplayText(
      input.locationPreference,
      '',
    );
    const rawText = cleanDisplayText(
      input.rawText ?? request?.rawText ?? request?.title ?? task?.goal,
      '',
    );
    const city = sanitizeCity(
      inputCity || request?.city || extractKnownCity(rawText),
    );
    const activityType = cleanDisplayText(
      inputActivityType ||
        request?.activityType ||
        extractCandidateActivity(rawText),
      '',
    );
    const interestTags = this.uniqueStrings([
      ...(Array.isArray(input.interestTags) ? input.interestTags : []),
      ...(Array.isArray(request?.interestTags) ? request.interestTags : []),
      ...extractCandidateTags(rawText),
      activityType,
    ]);
    const timePreference = cleanDisplayText(
      inputTimePreference || extractCandidateTime(rawText),
      '',
    );
    const locationPreference = inputLocationPreference;
    return {
      city,
      intent: input.intent ?? 'social_search',
      interestTags,
      activityType,
      timePreference,
      locationPreference,
      socialRequestId: socialRequestId ?? null,
      rawText,
    };
  }

  private buildProfileCandidates(input: {
    ownerUserId: number;
    query: CandidatePoolResolvedQuery;
    users: User[];
    profileMap: Map<number, UserSocialProfile>;
    delegateMap: Map<number, AiDelegateProfile>;
    blockedIds: Set<number>;
    filtered: CandidatePoolFiltered;
    lifeGraphSignals: LifeGraphUnifiedMatchSignalsDto | null;
  }): CandidatePoolCandidate[] {
    const out: CandidatePoolCandidate[] = [];
    for (const user of input.users) {
      if (user.id === input.ownerUserId) {
        input.filtered.self += 1;
        continue;
      }
      if (input.blockedIds.has(user.id)) {
        input.filtered.blocked += 1;
        continue;
      }
      const profile = input.profileMap.get(user.id) ?? null;
      const delegate = input.delegateMap.get(user.id) ?? null;
      if (this.hasRecommendationBoundary(profile, delegate)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      out.push(
        this.toProfileCandidate(
          user,
          profile,
          delegate,
          input.query,
          input.lifeGraphSignals,
        ),
      );
    }
    return out.sort((a, b) => b.matchScore - a.matchScore);
  }

  private buildPublicIntentCandidates(input: {
    ownerUserId: number;
    query: CandidatePoolResolvedQuery;
    publicIntents: PublicSocialIntent[];
    legacyRequests: SocialRequest[];
    userMap: Map<number, User>;
    profileMap: Map<number, UserSocialProfile>;
    delegateMap: Map<number, AiDelegateProfile>;
    blockedIds: Set<number>;
    filtered: CandidatePoolFiltered;
    lifeGraphSignals: LifeGraphUnifiedMatchSignalsDto | null;
  }): CandidatePoolCandidate[] {
    const out: CandidatePoolCandidate[] = [];
    for (const intent of input.publicIntents) {
      if (!this.isActivePublicIntent(intent)) continue;
      const ownerUserId = this.number(intent.userId);
      if (!ownerUserId) continue;
      if (ownerUserId === input.ownerUserId) {
        input.filtered.self += 1;
        continue;
      }
      if (input.blockedIds.has(ownerUserId)) {
        input.filtered.blocked += 1;
        continue;
      }
      const user = input.userMap.get(ownerUserId);
      if (!user) continue;
      const profile = input.profileMap.get(ownerUserId) ?? null;
      const delegate = input.delegateMap.get(ownerUserId) ?? null;
      if (this.hasRecommendationBoundary(profile, delegate)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      out.push(
        this.toPublicIntentCandidate(
          user,
          profile,
          delegate,
          intent,
          input.query,
          input.lifeGraphSignals,
        ),
      );
    }

    for (const request of input.legacyRequests) {
      if (!this.isActiveLegacySocialRequest(request)) continue;
      if (request.userId === input.ownerUserId) {
        input.filtered.self += 1;
        continue;
      }
      if (input.blockedIds.has(request.userId)) {
        input.filtered.blocked += 1;
        continue;
      }
      const user = input.userMap.get(request.userId);
      if (!user) continue;
      const profile = input.profileMap.get(request.userId) ?? null;
      const delegate = input.delegateMap.get(request.userId) ?? null;
      if (this.hasRecommendationBoundary(profile, delegate)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      out.push(
        this.toLegacyRequestCandidate(
          user,
          profile,
          delegate,
          request,
          input.query,
          input.lifeGraphSignals,
        ),
      );
    }
    return out.sort((a, b) => b.matchScore - a.matchScore);
  }

  private buildActivityResults(input: {
    ownerUserId: number;
    query: CandidatePoolResolvedQuery;
    activities: SocialActivity[];
    publicIntents: PublicSocialIntent[];
    blockedIds: Set<number>;
    filtered: CandidatePoolFiltered;
  }): CandidatePoolActivityResult[] {
    const now = Date.now();
    const activities = input.activities
      .filter((activity) => ACTIVE_ACTIVITY_STATUSES.includes(activity.status))
      .filter(
        (activity) => !activity.endTime || activity.endTime.getTime() >= now,
      )
      .filter((activity) => {
        if (activity.creatorId === input.ownerUserId) {
          input.filtered.self += 1;
          return false;
        }
        if (input.blockedIds.has(activity.creatorId)) {
          input.filtered.blocked += 1;
          return false;
        }
        return true;
      })
      .map((activity) => this.toActivityResult(activity, input.query));

    const publicIntents = input.publicIntents
      .filter((intent) => this.isActivePublicIntent(intent))
      .filter((intent) => this.isActivityLikePublicIntent(intent, input.query))
      .filter((intent) => {
        const ownerUserId = this.number(intent.userId);
        if (!ownerUserId) return false;
        if (ownerUserId === input.ownerUserId) {
          input.filtered.self += 1;
          return false;
        }
        if (input.blockedIds.has(ownerUserId)) {
          input.filtered.blocked += 1;
          return false;
        }
        return true;
      })
      .map((intent) => this.toPublicIntentActivityResult(intent, input.query));

    return [...activities, ...publicIntents].sort(
      (a, b) => b.matchScore - a.matchScore,
    );
  }

  private toProfileCandidate(
    user: User,
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
    query: CandidatePoolResolvedQuery,
    lifeGraphSignals: LifeGraphUnifiedMatchSignalsDto | null = null,
  ): CandidatePoolCandidate {
    const city = this.firstText(profile?.city, user.city, delegate?.city);
    const tags = candidateProfileTags(user, profile, delegate);
    const completeness = candidateProfileCompleteness(user, profile, delegate);
    const commonTags = this.commonTags(query.interestTags, tags);
    const scoreBreakdown = this.scoreProfile({
      user,
      profile,
      delegate,
      query,
      tags,
      city,
      completeness,
      commonTags,
      lifeGraphSignals,
    });
    const matchScore = this.totalScore(scoreBreakdown);
    const displayName = candidateDisplayName(user, profile, city);
    const matchReasons = this.profileReasons(
      query,
      city,
      commonTags,
      completeness,
      user,
    );
    return this.candidateBase({
      source: 'profile_candidate',
      user,
      profile,
      city,
      displayName,
      interestTags: tags,
      profileCompleteness: completeness,
      matchScore,
      scoreBreakdown,
      commonTags,
      matchReasons,
      publicIntentId: null,
      socialRequestId: query.socialRequestId,
      activityId: null,
      lifeGraphSignals,
    });
  }

  private toPublicIntentCandidate(
    user: User,
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
    intent: PublicSocialIntent,
    query: CandidatePoolResolvedQuery,
    lifeGraphSignals: LifeGraphUnifiedMatchSignalsDto | null = null,
  ): CandidatePoolCandidate {
    const city = this.firstText(
      intent.city,
      profile?.city,
      user.city,
      delegate?.city,
    );
    const tags = this.uniqueStrings([
      ...this.normalizeArray(intent.interestTags),
      intent.requestType,
      ...candidateProfileTags(user, profile, delegate),
    ]);
    const completeness = candidateProfileCompleteness(user, profile, delegate);
    const commonTags = this.commonTags(query.interestTags, tags);
    const scoreBreakdown = this.scorePublicIntent({
      query,
      city,
      tags,
      commonTags,
      completeness,
      updatedAt: intent.updatedAt,
      lifeGraphSignals,
    });
    const matchScore = this.totalScore(scoreBreakdown);
    const displayName = candidateDisplayName(user, profile, city);
    const matchReasons = this.publicIntentReasons(
      intent,
      query,
      city,
      commonTags,
    );
    return this.candidateBase({
      source: 'public_intent',
      user,
      profile,
      city,
      displayName,
      interestTags: tags,
      profileCompleteness: completeness,
      matchScore,
      scoreBreakdown,
      commonTags,
      matchReasons,
      publicIntentId: intent.id,
      socialRequestId: intent.linkedSocialRequestId ?? query.socialRequestId,
      activityId: null,
      lifeGraphSignals,
    });
  }

  private toLegacyRequestCandidate(
    user: User,
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
    request: SocialRequest,
    query: CandidatePoolResolvedQuery,
    lifeGraphSignals: LifeGraphUnifiedMatchSignalsDto | null = null,
  ): CandidatePoolCandidate {
    const city = this.firstText(
      request.city,
      profile?.city,
      user.city,
      delegate?.city,
    );
    const tags = this.uniqueStrings([
      request.requestType,
      ...extractCandidateTags(`${request.title} ${request.description}`),
      ...candidateProfileTags(user, profile, delegate),
    ]);
    const completeness = candidateProfileCompleteness(user, profile, delegate);
    const commonTags = this.commonTags(query.interestTags, tags);
    const scoreBreakdown = this.scorePublicIntent({
      query,
      city,
      tags,
      commonTags,
      completeness,
      updatedAt: request.updatedAt,
      lifeGraphSignals,
    });
    const displayName = candidateDisplayName(user, profile, city);
    const matchReasons = this.publicIntentReasons(
      {
        title: request.title,
        requestType: request.requestType,
        city: request.city,
        timePreference: request.timePreference,
      },
      query,
      city,
      commonTags,
    );
    return this.candidateBase({
      source: 'public_intent',
      user,
      profile,
      city,
      displayName,
      interestTags: tags,
      profileCompleteness: completeness,
      matchScore: this.totalScore(scoreBreakdown),
      scoreBreakdown,
      commonTags,
      matchReasons,
      publicIntentId: null,
      socialRequestId: request.id,
      activityId: null,
      lifeGraphSignals,
    });
  }

  private candidateBase(input: {
    source: Exclude<CandidatePoolSource, 'activity'>;
    user: User;
    profile: UserSocialProfile | null;
    city: string;
    displayName: string;
    interestTags: string[];
    profileCompleteness: number;
    matchScore: number;
    scoreBreakdown: Record<string, number>;
    commonTags: string[];
    matchReasons: string[];
    publicIntentId: string | null;
    socialRequestId: number | null;
    activityId: number | null;
    lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  }): CandidatePoolCandidate {
    const quality = candidateDataQuality(input.profileCompleteness);
    const riskWarnings =
      quality === 'incomplete' ? ['资料较少，建议先站内沟通确认。'] : [];
    const sceneText = [
      ...input.interestTags,
      ...input.commonTags,
      ...input.matchReasons,
    ].join(' ');
    const sceneType = this.sceneRisk.normalizeScene(null, sceneText);
    const policy = this.sceneRisk.evaluate({
      sceneType,
      actionType: 'send_message',
      text: sceneText,
      permissionMode: 'limited_auto',
      safetySignals: input.lifeGraphSignals?.safetySignals,
    });
    const candidateExplanation = this.candidateExplanation.explain({
      userRequest: {
        rawText: sceneText,
        interestTags: input.interestTags,
      },
      candidate: {
        displayName: input.displayName,
        city: input.city,
        commonTags: input.commonTags,
        interestTags: input.interestTags,
      },
      matchScore: input.matchScore,
      matchReasons: input.matchReasons,
      sceneType,
      riskWarnings: [...riskWarnings, ...policy.safetyPrompts],
      lifeGraphSignals: input.lifeGraphSignals,
    });
    const suggestedOpener = candidateExplanation.suggestedOpener;
    const emotionalInsight = this.emotionalInsightFromExplanation(
      candidateExplanation,
      policy.riskLevel === 'high' || policy.riskLevel === 'critical',
    );
    const dynamicExplanation = buildSocialMatchDynamicExplanation({
      displayName: input.displayName,
      city: input.city,
      interestTags: input.interestTags,
      commonTags: input.commonTags,
      matchReasons: input.matchReasons,
      scoreBreakdown: input.scoreBreakdown,
      riskWarnings: [...riskWarnings, ...policy.safetyPrompts],
      lifeGraphSignals: input.lifeGraphSignals,
    });
    return {
      source: input.source,
      isRealData: true,
      targetUserId: input.user.id,
      candidateUserId: input.user.id,
      userId: input.user.id,
      publicIntentId: input.publicIntentId,
      socialRequestId: input.socialRequestId,
      activityId: input.activityId,
      displayName: input.displayName,
      nickname: input.displayName,
      avatar: cleanDisplayText(input.user.avatar, ''),
      color: cleanDisplayText(input.user.color, '#202124'),
      city: input.city,
      interestTags: input.interestTags,
      profileCompleteness: input.profileCompleteness,
      dataQuality: quality,
      matchScore: input.matchScore,
      score: input.matchScore,
      level: this.matchLevel(input.matchScore),
      matchReasons: input.matchReasons,
      reasons: input.matchReasons,
      riskWarnings: [...riskWarnings, ...policy.safetyPrompts],
      risk: {
        level: this.candidateRiskLevel(policy.riskLevel),
        warnings: [...riskWarnings, ...policy.safetyPrompts],
      },
      suggestedOpener,
      suggestedMessage: suggestedOpener,
      commonTags: input.commonTags,
      distanceKm: null,
      scoreBreakdown: input.scoreBreakdown,
      candidateRecordId: null,
      status: SocialRequestCandidateStatus.Suggested,
      matchedSignals: this.uniqueStrings([
        ...input.commonTags,
        ...dynamicExplanation.dynamicSignalReasons,
      ]),
      publicReason: dynamicExplanation.whyYouMayLike,
      privateReason: dynamicExplanation.whyNow,
      riskWarning:
        dynamicExplanation.boundaryNotes[0] ??
        riskWarnings[0] ??
        policy.safetyPrompts[0] ??
        '',
      nextAction: candidateExplanation.nextActionSuggestion,
      whyYouMayLike: dynamicExplanation.whyYouMayLike,
      whyNow: dynamicExplanation.whyNow,
      matchPoints: dynamicExplanation.matchPoints,
      boundaryNotes: dynamicExplanation.boundaryNotes,
      openerStrategy: dynamicExplanation.openerStrategy,
      dynamicSignalReasons: dynamicExplanation.dynamicSignalReasons,
      continuousFilterHints: dynamicExplanation.continuousFilterHints,
      candidateExplanation,
      emotionalInsight,
      lifeGraphExplanation: candidateExplanation.lifeGraphExplanation,
      updatedAt: input.user.updatedAt
        ? input.user.updatedAt.toISOString()
        : null,
    };
  }

  private toActivityResult(
    activity: SocialActivity,
    query: CandidatePoolResolvedQuery,
  ): CandidatePoolActivityResult {
    const tags = this.uniqueStrings([
      String(activity.type),
      ...extractCandidateTags(`${activity.title} ${activity.description}`),
    ]);
    const commonTags = this.commonTags(query.interestTags, tags);
    const cityScore = this.cityMatches(query.city, activity.city) ? 35 : 0;
    const tagScore = Math.min(35, commonTags.length * 15);
    const typeScore =
      query.activityType && tags.includes(query.activityType) ? 15 : 0;
    const recentScore = this.recentScore(activity.updatedAt, 15);
    const matchScore = this.clampScore(
      cityScore + tagScore + typeScore + recentScore,
    );
    const matchReasons = this.activityReasons(query, activity.city, commonTags);
    return {
      id: String(activity.id),
      source: 'activity',
      isRealData: true,
      targetUserId: activity.creatorId ?? null,
      candidateUserId: activity.creatorId ?? null,
      userId: activity.creatorId ?? null,
      activityId: activity.id,
      publicIntentId: null,
      title: cleanDisplayText(activity.title, '真实活动'),
      description: cleanDisplayText(activity.description, ''),
      city: sanitizeCity(activity.city),
      loc: cleanDisplayText(activity.locationName, ''),
      requestType: String(activity.type),
      interestTags: tags,
      timePreference: activity.startTime
        ? activity.startTime.toISOString()
        : '',
      ownerUserId: activity.creatorId,
      status: activity.status,
      createdAt: activity.createdAt ? activity.createdAt.toISOString() : null,
      matchScore,
      matchReasons,
      candidateExplanation: this.explainActivityCandidate({
        title: cleanDisplayText(activity.title, '活动'),
        city: sanitizeCity(activity.city),
        tags,
        query,
        matchScore,
        matchReasons,
      }),
    };
  }

  private toPublicIntentActivityResult(
    intent: PublicSocialIntent,
    query: CandidatePoolResolvedQuery,
  ): CandidatePoolActivityResult {
    const tags = this.uniqueStrings([
      ...this.normalizeArray(intent.interestTags),
      intent.requestType,
      ...extractCandidateTags(`${intent.title} ${intent.description}`),
    ]);
    const commonTags = this.commonTags(query.interestTags, tags);
    const cityScore = this.cityMatches(query.city, intent.city) ? 35 : 0;
    const tagScore = Math.min(35, commonTags.length * 15);
    const typeScore =
      query.activityType && tags.includes(query.activityType) ? 15 : 0;
    const recentScore = this.recentScore(intent.updatedAt, 15);
    const matchScore = this.clampScore(
      cityScore + tagScore + typeScore + recentScore,
    );
    const matchReasons = this.activityReasons(query, intent.city, commonTags);
    return {
      id: intent.id,
      source: 'public_intent',
      isRealData: true,
      targetUserId: intent.userId ?? null,
      candidateUserId: intent.userId ?? null,
      userId: intent.userId ?? null,
      activityId: null,
      publicIntentId: intent.id,
      title: cleanDisplayText(intent.title, '公开约练卡片'),
      description: cleanDisplayText(intent.description, ''),
      city: sanitizeCity(intent.city),
      loc: cleanDisplayText(intent.loc, ''),
      requestType: cleanDisplayText(intent.requestType, ''),
      interestTags: tags,
      timePreference: cleanDisplayText(intent.timePreference, ''),
      ownerUserId: intent.userId ?? null,
      status: intent.status,
      createdAt: intent.createdAt ? intent.createdAt.toISOString() : null,
      matchScore,
      matchReasons,
      candidateExplanation: this.explainActivityCandidate({
        title: cleanDisplayText(intent.title, '公开约练卡片'),
        city: sanitizeCity(intent.city),
        tags,
        query,
        matchScore,
        matchReasons,
      }),
    };
  }

  private async persistCandidateRows(
    socialRequestId: number | null,
    candidates: CandidatePoolCandidate[],
  ): Promise<void> {
    if (!socialRequestId) return;
    for (const candidate of candidates) {
      const existing = await this.candidateRepo.findOne({
        where: { socialRequestId, candidateUserId: candidate.candidateUserId },
      });
      const row =
        existing ??
        this.candidateRepo.create({
          socialRequestId,
          candidateUserId: candidate.candidateUserId,
        });
      row.score = candidate.matchScore;
      row.level = candidate.level;
      row.scoreBreakdown = candidate.scoreBreakdown;
      row.reasons = candidate.matchReasons;
      row.commonTags = candidate.commonTags;
      row.distanceKm = null;
      row.riskLevel = candidate.risk.level;
      row.riskWarnings = candidate.risk.warnings;
      row.suggestedMessage = candidate.suggestedOpener;
      row.status = existing?.status ?? SocialRequestCandidateStatus.Suggested;
      const saved = await this.candidateRepo.save(row);
      candidate.candidateRecordId = saved.id;
      candidate.socialRequestId = socialRequestId;
    }
  }

  private mergeSocialCandidates(
    candidates: CandidatePoolCandidate[],
  ): CandidatePoolCandidate[] {
    const byUser = new Map<number, CandidatePoolCandidate>();
    for (const candidate of candidates) {
      const existing = byUser.get(candidate.candidateUserId);
      if (!existing) {
        byUser.set(candidate.candidateUserId, candidate);
        continue;
      }
      const mergedReasons = this.uniqueStrings([
        ...existing.matchReasons,
        ...candidate.matchReasons,
      ]).slice(0, 6);
      const mergedTags = this.uniqueStrings([
        ...existing.interestTags,
        ...candidate.interestTags,
      ]);
      const winner =
        candidate.matchScore > existing.matchScore ? candidate : existing;
      byUser.set(candidate.candidateUserId, {
        ...winner,
        publicIntentId:
          winner.publicIntentId ??
          existing.publicIntentId ??
          candidate.publicIntentId,
        socialRequestId:
          winner.socialRequestId ??
          existing.socialRequestId ??
          candidate.socialRequestId,
        matchReasons: mergedReasons,
        reasons: mergedReasons,
        interestTags: mergedTags,
        commonTags: this.uniqueStrings([
          ...existing.commonTags,
          ...candidate.commonTags,
        ]),
      });
    }
    return [...byUser.values()].sort((a, b) => b.matchScore - a.matchScore);
  }

  private scoreProfile(input: {
    user: User;
    profile: UserSocialProfile | null;
    delegate: AiDelegateProfile | null;
    query: CandidatePoolResolvedQuery;
    tags: string[];
    city: string;
    completeness: number;
    commonTags: string[];
    lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  }): Record<string, number> {
    const sceneType = this.sceneRisk.normalizeScene(
      null,
      [
        input.query.rawText,
        input.query.activityType,
        ...input.query.interestTags,
        ...input.tags,
      ].join(' '),
    );
    const policy = this.sceneRisk.evaluate({
      sceneType,
      actionType: 'send_message',
      text: input.query.rawText,
      permissionMode: 'limited_auto',
      safetySignals: input.lifeGraphSignals?.safetySignals,
    });
    const cityMatches = (left: string, right: string) =>
      this.cityMatches(left, right);
    return {
      distance: Math.min(
        18,
        (this.cityMatches(input.query.city, input.city) ? 14 : 6) +
          lifeGraphLocationBoost(
            input.city,
            input.lifeGraphSignals,
            cityMatches,
          ),
      ),
      timeOverlap: Math.min(
        15,
        this.timeMatches(
          input.query.timePreference,
          input.profile,
          input.delegate,
        ) + lifeGraphTimeBoost(input.lifeGraphSignals),
      ),
      interestSimilarity: Math.min(
        20,
        input.commonTags.length * 10 +
          lifeGraphSportBoost(input.tags, input.lifeGraphSignals),
      ),
      lifeRhythm: Math.min(
        10,
        this.lifeRhythmScore(input.profile, input.delegate) +
          lifeGraphRhythmBoost(input.lifeGraphSignals),
      ),
      socialEnergy: this.socialEnergyScore(input.profile, input.delegate),
      relationshipGoal: Math.min(
        10,
        this.relationshipGoalScore(input.query, input.tags) +
          lifeGraphGoalBoost(input.query, input.tags, input.lifeGraphSignals),
      ),
      lifeGraphBehaviorFit: lifeGraphBehaviorFit(
        {
          query: input.query,
          city: input.city,
          tags: input.tags,
          commonTags: input.commonTags,
          signals: input.lifeGraphSignals,
        },
        cityMatches,
      ),
      boundaryFit: lifeGraphBoundaryFit(input.query, input.lifeGraphSignals),
      trustworthiness: Math.min(
        10,
        Math.round(input.completeness * 5) + (input.user.verified ? 5 : 0),
      ),
      safetyRisk: Math.max(
        0,
        this.safetyRiskScore(policy.riskLevel) -
          lifeGraphSafetyPenalty(input.user, input.lifeGraphSignals),
      ),
    };
  }

  private scorePublicIntent(input: {
    query: CandidatePoolResolvedQuery;
    city: string;
    tags: string[];
    commonTags: string[];
    completeness: number;
    updatedAt: Date;
    lifeGraphSignals?: LifeGraphUnifiedMatchSignalsDto | null;
  }): Record<string, number> {
    const sceneType = this.sceneRisk.normalizeScene(
      null,
      [
        input.query.rawText,
        input.query.activityType,
        ...input.query.interestTags,
        ...input.tags,
      ].join(' '),
    );
    const policy = this.sceneRisk.evaluate({
      sceneType,
      actionType: 'send_message',
      text: input.query.rawText,
      permissionMode: 'limited_auto',
      safetySignals: input.lifeGraphSignals?.safetySignals,
    });
    const cityMatches = (left: string, right: string) =>
      this.cityMatches(left, right);
    return {
      distance: Math.min(
        18,
        (this.cityMatches(input.query.city, input.city) ? 14 : 6) +
          lifeGraphLocationBoost(
            input.city,
            input.lifeGraphSignals,
            cityMatches,
          ),
      ),
      timeOverlap: Math.min(
        15,
        (input.query.timePreference ? 10 : 6) +
          lifeGraphTimeBoost(input.lifeGraphSignals),
      ),
      interestSimilarity: Math.min(
        20,
        input.commonTags.length * 10 +
          lifeGraphSportBoost(input.tags, input.lifeGraphSignals),
      ),
      lifeRhythm: Math.min(
        10,
        (input.query.timePreference ? 7 : 4) +
          lifeGraphRhythmBoost(input.lifeGraphSignals),
      ),
      socialEnergy: 5,
      relationshipGoal: Math.min(
        10,
        this.relationshipGoalScore(input.query, input.tags) +
          lifeGraphGoalBoost(input.query, input.tags, input.lifeGraphSignals),
      ),
      lifeGraphBehaviorFit: lifeGraphBehaviorFit(
        {
          query: input.query,
          city: input.city,
          tags: input.tags,
          commonTags: input.commonTags,
          signals: input.lifeGraphSignals,
        },
        cityMatches,
      ),
      boundaryFit: lifeGraphBoundaryFit(input.query, input.lifeGraphSignals),
      trustworthiness: Math.min(
        10,
        Math.round(input.completeness * 5) +
          this.recentScore(input.updatedAt, 5),
      ),
      safetyRisk: this.safetyRiskScore(policy.riskLevel),
    };
  }

  private lifeRhythmScore(
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
  ): number {
    const text = [
      ...this.normalizeArray(profile?.availableTimes),
      profile?.weekdayAvailability ?? '',
      profile?.weekendAvailability ?? '',
      ...this.normalizeArray(profile?.lifestyleTags),
      ...this.normalizeArray(profile?.socialScenes),
      delegate?.availability ?? '',
    ].join(' ');
    if (!text.trim()) return 4;
    if (/周末|白天|规律|早睡|morning|weekend|day/i.test(text)) return 10;
    if (/晚上|夜间|night|evening/i.test(text)) return 7;
    return 6;
  }

  private socialEnergyScore(
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
  ): number {
    const text = [
      profile?.socialStyle,
      profile?.openness,
      profile?.socialPreference,
      ...(profile?.traits ?? []),
      delegate?.idealPartner,
    ]
      .filter(Boolean)
      .join(' ');
    if (!text.trim()) return 4;
    if (/适中|稳定|随和|balanced|medium/i.test(text)) return 8;
    if (/主动|外向|热情|开放|active|open|extrovert/i.test(text)) return 7;
    if (/慢热|安静|内向|克制|quiet|introvert/i.test(text)) return 6;
    return 5;
  }

  private relationshipGoalScore(
    query: CandidatePoolResolvedQuery,
    tags: string[],
  ): number {
    const text = [
      query.rawText,
      query.activityType,
      ...query.interestTags,
      ...tags,
    ].join(' ');
    if (/相亲|恋爱|对象|dating|date/i.test(text)) return 10;
    if (/搭子|约练|跑步|健身|麻将|扑克|旅行|旅游|partner|buddy/i.test(text))
      return 9;
    if (/朋友|聊天|认识|friend|social/i.test(text)) return 8;
    if (/学习|自习|study/i.test(text)) return 7;
    return 5;
  }

  private safetyRiskScore(
    riskLevel: ReturnType<SceneRiskPolicyService['evaluate']>['riskLevel'],
  ): number {
    if (riskLevel === 'critical') return 0;
    if (riskLevel === 'high') return 3;
    if (riskLevel === 'medium') return 6;
    return 9;
  }

  private candidateRiskLevel(
    riskLevel: ReturnType<SceneRiskPolicyService['evaluate']>['riskLevel'],
  ): CandidateRiskLevel {
    if (riskLevel === 'high' || riskLevel === 'critical') {
      return CandidateRiskLevel.High;
    }
    if (riskLevel === 'medium') return CandidateRiskLevel.Medium;
    return CandidateRiskLevel.Low;
  }

  private profileReasons(
    query: CandidatePoolResolvedQuery,
    city: string,
    commonTags: string[],
    completeness: number,
    user: User,
  ): string[] {
    const reasons: string[] = ['来自真实注册用户和社交画像。'];
    if (this.cityMatches(query.city, city)) reasons.push(`城市匹配：${city}。`);
    if (commonTags.length)
      reasons.push(`共同兴趣：${commonTags.slice(0, 3).join('、')}。`);
    if (completeness >= 0.7) reasons.push('画像信息较完整。');
    if (user.verified) reasons.push('用户已认证。');
    return reasons.slice(0, 6);
  }

  private publicIntentReasons(
    intent: Pick<
      PublicSocialIntent,
      'title' | 'requestType' | 'city' | 'timePreference'
    >,
    query: CandidatePoolResolvedQuery,
    city: string,
    commonTags: string[],
  ): string[] {
    const title = cleanDisplayText(intent.title, '公开约练卡片');
    const reasons = [`来自真实公开约练卡片：${title}。`];
    if (this.cityMatches(query.city, city))
      reasons.push(`卡片城市匹配：${city}。`);
    if (commonTags.length)
      reasons.push(`卡片标签匹配：${commonTags.slice(0, 3).join('、')}。`);
    if (intent.timePreference)
      reasons.push(`时间偏好：${intent.timePreference}。`);
    if (intent.requestType) reasons.push(`需求类型：${intent.requestType}。`);
    return reasons.slice(0, 6);
  }

  private activityReasons(
    query: CandidatePoolResolvedQuery,
    city: string,
    commonTags: string[],
  ): string[] {
    const reasons = ['来自真实活动或公开约练卡片。'];
    if (this.cityMatches(query.city, city)) reasons.push(`城市匹配：${city}。`);
    if (commonTags.length)
      reasons.push(`标签匹配：${commonTags.slice(0, 3).join('、')}。`);
    return reasons;
  }

  private emotionalInsightFromExplanation(
    explanation: CandidateExplanation,
    highRisk: boolean,
  ): CandidateEmotionalInsight {
    return {
      fitReason:
        explanation.fitReasons[0] ||
        'TA 和这次需求有可对齐的地方，适合先轻量沟通。',
      openerAdvice: explanation.suggestedOpener,
      possibleAwkwardness:
        explanation.awkwardPoints[0] || '对方资料或时间偏好还需要进一步确认。',
      safeFirstStep: explanation.safeFirstStep,
      tone: highRisk || explanation.requiresConfirmation ? 'careful' : 'gentle',
    };
  }

  private explainActivityCandidate(input: {
    title: string;
    city: string;
    tags: string[];
    query: CandidatePoolResolvedQuery;
    matchScore: number;
    matchReasons: string[];
  }): CandidateExplanation {
    const requestText = [
      input.query.rawText,
      input.query.activityType,
      ...input.query.interestTags,
      ...input.tags,
    ].join(' ');
    const sceneType = this.sceneRisk.normalizeScene(null, requestText);
    const policy = this.sceneRisk.evaluate({
      sceneType,
      actionType: 'create_activity',
      text: requestText,
      permissionMode: 'limited_auto',
    });
    return this.candidateExplanation.explain({
      userRequest: {
        rawText: requestText,
        interestTags: input.query.interestTags,
      },
      candidate: {
        displayName: input.title,
        city: input.city,
        commonTags: input.tags,
        interestTags: input.tags,
      },
      matchScore: input.matchScore,
      matchReasons: input.matchReasons,
      sceneType,
      riskWarnings: policy.safetyPrompts,
    });
  }

  private hasRecommendationBoundary(
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
  ): boolean {
    return DISABLED_BOUNDARY_RE.test(
      [profile?.privacyBoundary, profile?.rejectRules, delegate?.boundaries]
        .filter(Boolean)
        .join(' '),
    );
  }

  private isActivePublicIntent(intent: PublicSocialIntent): boolean {
    return (
      intent.mode === 'public' && ACTIVE_PUBLIC_STATUSES.includes(intent.status)
    );
  }

  private isActiveLegacySocialRequest(request: SocialRequest): boolean {
    return (
      request.visibility === 'public' &&
      ACTIVE_PUBLIC_STATUSES.includes(request.status)
    );
  }

  private isActivityLikePublicIntent(
    intent: PublicSocialIntent,
    query: CandidatePoolResolvedQuery,
  ): boolean {
    const text = [
      intent.requestType,
      intent.title,
      intent.description,
      ...this.normalizeArray(intent.interestTags),
    ]
      .join(' ')
      .toLowerCase();
    if (query.activityType && text.includes(query.activityType.toLowerCase()))
      return true;
    return /(活动|约练|跑步|羽毛球|健身|瑜伽|徒步|骑行|咖啡|拍照|摄影|city|walk|running|fitness|coffee|photo)/i.test(
      text,
    );
  }

  private commonTags(queryTags: string[], candidateTags: string[]): string[] {
    const normalizedCandidates = candidateTags.map((tag) => tag.toLowerCase());
    return this.uniqueStrings(
      queryTags.filter((tag) => {
        const normalized = tag.toLowerCase();
        return normalizedCandidates.some(
          (candidate) =>
            candidate === normalized ||
            candidate.includes(normalized) ||
            normalized.includes(candidate),
        );
      }),
    );
  }

  private cityMatches(queryCity: string, candidateCity: string): boolean {
    if (!queryCity) return true;
    if (!candidateCity) return false;
    return (
      sanitizeCity(candidateCity).includes(queryCity) ||
      queryCity.includes(sanitizeCity(candidateCity))
    );
  }

  private timeMatches(
    queryTime: string,
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
  ): number {
    if (!queryTime) return 8;
    const available = [
      ...this.normalizeArray(profile?.availableTimes),
      profile?.weekdayAvailability ?? '',
      profile?.weekendAvailability ?? '',
      delegate?.availability ?? '',
    ].join(' ');
    if (!available.trim()) return 4;
    return available.includes(queryTime) || queryTime.includes(available)
      ? 15
      : 8;
  }

  private recentScore(date: Date | null | undefined, max: number): number {
    if (!date) return 0;
    const days = (Date.now() - date.getTime()) / 86_400_000;
    if (days <= 7) return max;
    if (days <= 30) return Math.round(max * 0.7);
    if (days <= 90) return Math.round(max * 0.35);
    return 0;
  }

  private totalScore(parts: Record<string, number>): number {
    return this.clampScore(
      Object.values(parts).reduce((sum, value) => sum + value, 0),
    );
  }

  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private matchLevel(score: number): CandidateMatchLevel {
    if (score >= 75) return CandidateMatchLevel.High;
    if (score >= 45) return CandidateMatchLevel.Medium;
    return CandidateMatchLevel.Low;
  }

  private async loadCounts(): Promise<CandidatePoolCounts> {
    const [
      users,
      socialProfiles,
      aiDelegateProfiles,
      publicSocialIntents,
      socialRequests,
      socialActivities,
    ] = await Promise.all([
      this.safeCount(this.userRepo),
      this.safeCount(this.profileRepo),
      this.safeCount(this.aiDelegateRepo),
      this.safeCount(this.publicIntentRepo),
      this.safeCount(this.legacySocialRequestRepo),
      this.safeCount(this.activityRepo),
    ]);
    return {
      users,
      socialProfiles,
      aiDelegateProfiles,
      publicSocialIntents,
      socialRequests,
      socialActivities,
    };
  }

  private async loadBlockedIds(ownerUserId: number): Promise<Set<number>> {
    try {
      return await this.safety.getMutualBlockUserIds(ownerUserId);
    } catch {
      return new Set<number>();
    }
  }

  private async loadLifeGraphSignals(
    ownerUserId: number,
  ): Promise<LifeGraphUnifiedMatchSignalsDto | null> {
    try {
      return (
        (await this.lifeGraph?.getUnifiedMatchSignals(ownerUserId)) ?? null
      );
    } catch {
      return null;
    }
  }

  private buildDebug(input: {
    ownerUserId: number;
    query: CandidatePoolResolvedQuery;
    counts: CandidatePoolCounts;
    filtered: CandidatePoolFiltered;
    profileCandidates: number;
    publicIntentCandidates: number;
    activityCandidates: number;
    finalCandidates: CandidatePoolCandidate[];
  }): CandidatePoolDebugSnapshot {
    return {
      ownerUserId: input.ownerUserId,
      query: input.query,
      counts: input.counts,
      eligible: {
        profileCandidates: input.profileCandidates,
        publicIntentCandidates: input.publicIntentCandidates,
        activityCandidates: input.activityCandidates,
      },
      filtered: input.filtered,
      finalCandidates: input.finalCandidates.map((candidate) => ({
        source: candidate.source,
        isRealData: candidate.isRealData,
        targetUserId: candidate.targetUserId,
        candidateUserId: candidate.candidateUserId,
        userId: candidate.userId,
        publicIntentId: candidate.publicIntentId,
        socialRequestId: candidate.socialRequestId,
        activityId: candidate.activityId,
        displayName: candidate.displayName,
        city: candidate.city,
        interestTags: candidate.interestTags,
        profileCompleteness: candidate.profileCompleteness,
        dataQuality: candidate.dataQuality,
        matchScore: candidate.matchScore,
        matchReasons: candidate.matchReasons,
        riskWarnings: candidate.riskWarnings,
        suggestedOpener: candidate.suggestedOpener,
      })),
    };
  }

  private toDebugReasons(
    debug: CandidatePoolDebugSnapshot,
  ): CandidatePoolDebugReasons {
    return {
      usersTotal: debug.counts.users,
      socialProfilesTotal: debug.counts.socialProfiles,
      publicIntentsTotal: debug.counts.publicSocialIntents,
      eligibleProfiles: debug.eligible.profileCandidates,
      eligiblePublicIntents: debug.eligible.publicIntentCandidates,
      eligibleActivities: debug.eligible.activityCandidates,
      filteredBySelf: debug.filtered.self,
      filteredByBlocked: debug.filtered.blocked,
      filteredByCity: debug.filtered.cityMismatch,
      filteredByBoundary: debug.filtered.boundaryMismatch,
      scoreBelowThreshold: debug.filtered.scoreBelowThreshold,
    };
  }

  private emptyFiltered(): CandidatePoolFiltered {
    return {
      self: 0,
      blocked: 0,
      cityMismatch: 0,
      boundaryMismatch: 0,
      scoreBelowThreshold: 0,
    };
  }

  private async safeCount<T extends ObjectLiteral>(
    repo: Repository<T>,
  ): Promise<number> {
    try {
      return await repo.count();
    } catch {
      return 0;
    }
  }

  private async safeFind<T extends ObjectLiteral>(
    repo: Repository<T>,
    options: Parameters<Repository<T>['find']>[0],
  ): Promise<T[]> {
    try {
      return await repo.find(options);
    } catch {
      return [];
    }
  }

  private normalizeArray(value: unknown): string[] {
    if (Array.isArray(value))
      return this.uniqueStrings(value.map((item) => String(item)));
    if (typeof value === 'string') {
      return this.uniqueStrings(value.split(/[、,，;；|]/u));
    }
    return [];
  }

  private uniqueStrings(values: unknown[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      const text = cleanDisplayText(value, '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  private firstText(...values: unknown[]): string {
    for (const value of values) {
      const text = cleanDisplayText(value, '');
      if (text) return text;
    }
    return '';
  }

  private normalizeLimit(value: unknown): number {
    const limit = this.number(value) ?? DEFAULT_LIMIT;
    return Math.max(1, Math.min(30, limit));
  }

  private number(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
