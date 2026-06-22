import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';

import { SocialActivity } from '../activities/entities/activity.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
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
import { SocialRequest } from './entities/social-request.entity';
import {
  CandidateExplanation,
  CandidateExplanationService,
} from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { LifeGraphUnifiedMatchSignalsDto } from '../life-graph/dto/life-graph.dto';
import {
  candidateDisplayName,
  candidateProfileCompleteness,
  candidateProfileTags,
} from './social-agent-candidate-profile-presenter';
import type { CandidateProfileDataQuality } from './social-agent-candidate-profile-presenter';
import { extractCandidateTags } from './social-agent-candidate-query-parser';
import {
  candidateClampScore,
  candidateCommonTags,
  candidateMatchLevel,
  candidateTotalScore,
} from './social-agent-candidate-scoring';
import {
  buildCandidatePoolResolvedQuery,
  normalizeCandidatePoolArray,
  uniqueCandidatePoolStrings,
} from './social-agent-candidate-pool-query';
import {
  buildCandidatePoolDebugSnapshot,
  emptyCandidatePoolFiltered,
} from './social-agent-candidate-pool-debug';
import { mergeSocialAgentCandidatePool } from './social-agent-candidate-pool-merge';
import type {
  CandidatePoolIntent,
  CandidatePoolQuery,
  CandidatePoolResolvedQuery,
} from './social-agent-candidate-pool-query';
import type {
  CandidatePoolCounts,
  CandidatePoolDebugReasons,
  CandidatePoolDebugSnapshot,
  CandidatePoolFiltered,
} from './social-agent-candidate-pool-debug';
import {
  buildCandidatePoolActivityResult,
  buildCandidatePoolPublicIntentActivityResult,
} from './social-agent-candidate-pool-activity-result';
import type {
  CandidatePoolActivityExplanationInput,
  CandidatePoolActivityResult,
  CandidatePoolSource,
} from './social-agent-candidate-pool-activity-result';
import {
  applySavedSocialAgentCandidateRow,
  applySocialAgentCandidateRowState,
} from './social-agent-candidate-row-state';
import {
  buildCandidatePoolActivitySearchResult,
  buildCandidatePoolSearchResult,
} from './social-agent-candidate-pool-result.presenter';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import type { CandidateEmotionalInsight } from './social-agent-candidate-emotional-insight';
import {
  buildProfileCandidateReasons,
  buildPublicIntentCandidateReasons,
} from './social-agent-candidate-reasons';
import {
  buildProfileCandidateScoreBreakdown,
  buildPublicIntentCandidateScoreBreakdown,
} from './social-agent-candidate-score-breakdown';
import { buildCandidatePoolCandidate } from './social-agent-candidate-card.presenter';
import {
  hasSocialAgentRecommendationBoundary,
  hasSocialAgentSafetyExclusionBoundary,
  isSocialAgentActiveActivity,
  isSocialAgentActiveLegacyRequest,
  isSocialAgentActivePublicIntent,
  isSocialAgentActivityLikePublicIntent,
  isSocialAgentProfileCandidateOptedIn,
} from './social-agent-candidate-pool-eligibility';
import { SocialAgentToolResultCacheService } from './social-agent-tool-result-cache.service';
import {
  SocialAgentUserInterestEventService,
  type SocialAgentUserInterestSummary,
} from './social-agent-user-interest-event.service';

export type {
  CandidatePoolIntent,
  CandidatePoolQuery,
  CandidatePoolResolvedQuery,
} from './social-agent-candidate-pool-query';
export type {
  CandidatePoolCounts,
  CandidatePoolDebugReasons,
  CandidatePoolDebugSnapshot,
  CandidatePoolFiltered,
} from './social-agent-candidate-pool-debug';

export type {
  CandidatePoolActivityResult,
  CandidatePoolSource,
} from './social-agent-candidate-pool-activity-result';
export type { CandidateEmotionalInsight } from './social-agent-candidate-emotional-insight';

export type CandidatePoolDataQuality = CandidateProfileDataQuality;

type CandidatePublicProfileSummary = {
  city: string;
  tags: string[];
  completeness: number;
  displayName: string;
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
  distanceLabel?: string | null;
  locationText?: string | null;
  timeLabel?: string | null;
  timeWindow?: string | null;
  scoreBreakdown: Record<string, number>;
  candidateRecordId?: number | null;
  status?: SocialRequestCandidateStatus;
  matchedSignals: string[];
  publicReason: string;
  privateReason: string;
  riskWarning: string;
  nextAction: string;
  recommendationConsent: {
    profileDiscoverable: boolean;
    agentCanRecommendMe: boolean;
    sourceLabel: string;
    privacyLabel: string;
    strangerPolicyLabel: string;
  };
  relationshipGoal: string | null;
  idealType: string | null;
  invitePolicy: string;
  coldStartSignals: string[];
  whyYouMayLike: string;
  whyNow: string;
  matchPoints: string[];
  boundaryNotes: string[];
  openerStrategy: string;
  dynamicSignalReasons: string[];
  recentPublicActivity?: string[];
  preferenceHistorySignals: string[];
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

const DEFAULT_LIMIT = 10;
const SOURCE_CACHE_TTL_MS = 30_000;

@Injectable()
export class SocialAgentCandidatePoolService {
  private readonly localToolResultCache =
    new SocialAgentToolResultCacheService();

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
    @Optional()
    private readonly toolResultCache?: SocialAgentToolResultCacheService,
    @Optional()
    private readonly metrics?: SocialAgentMetricsService,
    @Optional()
    private readonly interestEvents?: SocialAgentUserInterestEventService,
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
      userInterestSummary,
    ] = await Promise.all([
      this.loadCounts(),
      this.cachedFind('users:updated_desc', this.userRepo, {
        order: { updatedAt: 'DESC' },
      }),
      this.cachedFind('profiles:updated_desc', this.profileRepo, {
        order: { updatedAt: 'DESC' },
      }),
      this.cachedFind('ai_delegates:updated_desc', this.aiDelegateRepo, {
        order: { updatedAt: 'DESC' },
      }),
      this.cachedFind('public_intents:updated_desc', this.publicIntentRepo, {
        order: { updatedAt: 'DESC' },
      }),
      this.cachedFind('legacy_social_requests:updated_desc', this.legacySocialRequestRepo, {
        order: { updatedAt: 'DESC' },
      }),
      this.cachedBlockedIds(input.ownerUserId),
      this.cachedLifeGraphSignals(input.ownerUserId),
      this.loadUserInterestSummary(input.ownerUserId),
    ]);

    const profileMap = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    const delegateMap = new Map(
      delegates.map((delegate) => [delegate.userId, delegate]),
    );
    const userMap = new Map(users.map((user) => [user.id, user]));
    const filtered = emptyCandidatePoolFiltered();

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
    const merged = mergeSocialAgentCandidatePool([
      ...profileCandidates,
      ...publicCandidates,
    ]);
    const behaviorRanked = this.applyUserInterestSignals(
      merged,
      userInterestSummary,
    );
    const limit = this.normalizeLimit(input.limit);
    const candidates = behaviorRanked.slice(0, limit);
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
    return buildCandidatePoolSearchResult({
      ownerUserId: input.ownerUserId,
      query,
      candidates,
      debug,
    });
  }

  async searchActivity(
    input: CandidatePoolQuery,
  ): Promise<CandidatePoolActivitySearchResult> {
    const query = await this.resolveQuery({
      ...input,
      intent: 'activity_search',
    });
    const [counts, activities, publicIntents, profiles, delegates, blockedIds] =
      await Promise.all([
        this.loadCounts(),
        this.cachedFind('activities:updated_desc', this.activityRepo, {
          order: { updatedAt: 'DESC' },
        }),
        this.cachedFind('public_intents:updated_desc', this.publicIntentRepo, {
          order: { updatedAt: 'DESC' },
        }),
        this.cachedFind('profiles:updated_desc', this.profileRepo, {
          order: { updatedAt: 'DESC' },
        }),
        this.cachedFind('ai_delegates:updated_desc', this.aiDelegateRepo, {
          order: { updatedAt: 'DESC' },
        }),
        this.cachedBlockedIds(input.ownerUserId),
      ]);
    const profileMap = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    const delegateMap = new Map(
      delegates.map((delegate) => [delegate.userId, delegate]),
    );
    const filtered = emptyCandidatePoolFiltered();
    const realActivities = this.buildActivityResults({
      ownerUserId: input.ownerUserId,
      query,
      activities,
      publicIntents: [],
      profileMap,
      delegateMap,
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
            profileMap,
            delegateMap,
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
    return buildCandidatePoolActivitySearchResult({
      ownerUserId: input.ownerUserId,
      query,
      activityResults,
      debug,
    });
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
        where: { id: socialRequestId, userId: input.ownerUserId },
      });
      if (!request) {
        throw new NotFoundException('Social request not found');
      }
    }

    let task: AgentTask | null = null;
    const taskId = this.number(input.taskId);
    if (taskId) {
      task = await this.taskRepo.findOne({ where: { id: taskId } });
      if (!task || task.ownerUserId !== input.ownerUserId) {
        throw new NotFoundException('Social Agent task not found');
      }
    }

    return buildCandidatePoolResolvedQuery({
      query: input,
      socialRequestId: socialRequestId ?? null,
      request,
      task,
    });
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
      if (input.query.acceptsStrangers === false) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      const profile = input.profileMap.get(user.id) ?? null;
      const delegate = input.delegateMap.get(user.id) ?? null;
      if (!isSocialAgentProfileCandidateOptedIn(profile)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      if (hasSocialAgentRecommendationBoundary(profile, delegate)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      if (hasSocialAgentSafetyExclusionBoundary(profile, delegate)) {
        input.filtered.blocked += 1;
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
      if (!isSocialAgentActivePublicIntent(intent)) continue;
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
      if (input.query.acceptsStrangers === false) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      const user = input.userMap.get(ownerUserId);
      if (!user) continue;
      const profile = input.profileMap.get(ownerUserId) ?? null;
      const delegate = input.delegateMap.get(ownerUserId) ?? null;
      if (!isSocialAgentProfileCandidateOptedIn(profile)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      if (hasSocialAgentRecommendationBoundary(profile, delegate)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      if (hasSocialAgentSafetyExclusionBoundary(profile, delegate)) {
        input.filtered.blocked += 1;
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
      if (!isSocialAgentActiveLegacyRequest(request)) continue;
      if (request.userId === input.ownerUserId) {
        input.filtered.self += 1;
        continue;
      }
      if (input.blockedIds.has(request.userId)) {
        input.filtered.blocked += 1;
        continue;
      }
      if (input.query.acceptsStrangers === false) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      const user = input.userMap.get(request.userId);
      if (!user) continue;
      const profile = input.profileMap.get(request.userId) ?? null;
      const delegate = input.delegateMap.get(request.userId) ?? null;
      if (!isSocialAgentProfileCandidateOptedIn(profile)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      if (hasSocialAgentRecommendationBoundary(profile, delegate)) {
        input.filtered.boundaryMismatch += 1;
        continue;
      }
      if (hasSocialAgentSafetyExclusionBoundary(profile, delegate)) {
        input.filtered.blocked += 1;
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
    profileMap: Map<number, UserSocialProfile>;
    delegateMap: Map<number, AiDelegateProfile>;
    blockedIds: Set<number>;
    filtered: CandidatePoolFiltered;
  }): CandidatePoolActivityResult[] {
    const activities = input.activities
      .filter((activity) => isSocialAgentActiveActivity(activity))
      .filter((activity) => {
        if (activity.creatorId === input.ownerUserId) {
          input.filtered.self += 1;
          return false;
        }
        if (input.query.acceptsStrangers === false) {
          input.filtered.boundaryMismatch += 1;
          return false;
        }
        if (input.blockedIds.has(activity.creatorId)) {
          input.filtered.blocked += 1;
          return false;
        }
        if (
          this.hasUnsafeActivityOwnerBoundary(
            activity.creatorId,
            input.profileMap,
            input.delegateMap,
            true,
          )
        ) {
          input.filtered.boundaryMismatch += 1;
          return false;
        }
        return true;
      })
      .map((activity) => this.toActivityResult(activity, input.query));

    const publicIntents = input.publicIntents
      .filter((intent) => isSocialAgentActivePublicIntent(intent))
      .filter((intent) =>
        isSocialAgentActivityLikePublicIntent(intent, input.query),
      )
      .filter((intent) => {
        const ownerUserId = this.number(intent.userId);
        if (!ownerUserId) return false;
        if (ownerUserId === input.ownerUserId) {
          input.filtered.self += 1;
          return false;
        }
        if (input.query.acceptsStrangers === false) {
          input.filtered.boundaryMismatch += 1;
          return false;
        }
        if (input.blockedIds.has(ownerUserId)) {
          input.filtered.blocked += 1;
          return false;
        }
        if (
          this.hasUnsafeActivityOwnerBoundary(
            ownerUserId,
            input.profileMap,
            input.delegateMap,
            true,
          )
        ) {
          input.filtered.boundaryMismatch += 1;
          return false;
        }
        return true;
      })
      .map((intent) => this.toPublicIntentActivityResult(intent, input.query));

    return [...activities, ...publicIntents].sort(
      (a, b) => b.matchScore - a.matchScore,
    );
  }

  private hasUnsafeActivityOwnerBoundary(
    ownerUserId: number,
    profileMap: Map<number, UserSocialProfile>,
    delegateMap: Map<number, AiDelegateProfile>,
    requireAgentRecommendationOptIn: boolean,
  ): boolean {
    const profile = profileMap.get(ownerUserId) ?? null;
    const delegate = delegateMap.get(ownerUserId) ?? null;
    if (
      requireAgentRecommendationOptIn &&
      !isSocialAgentProfileCandidateOptedIn(profile)
    ) {
      return true;
    }
    return (
      hasSocialAgentRecommendationBoundary(profile, delegate) ||
      hasSocialAgentSafetyExclusionBoundary(profile, delegate)
    );
  }

  private toProfileCandidate(
    user: User,
    profile: UserSocialProfile | null,
    delegate: AiDelegateProfile | null,
    query: CandidatePoolResolvedQuery,
    lifeGraphSignals: LifeGraphUnifiedMatchSignalsDto | null = null,
  ): CandidatePoolCandidate {
    const profileSummary = this.cachedPublicProfileSummary({
      user,
      profile,
      delegate,
      city: this.firstText(profile?.city, user.city, delegate?.city),
    });
    const { city, tags, completeness, displayName } = profileSummary;
    const commonTags = candidateCommonTags(query.interestTags, tags);
    const scoreBreakdown = buildProfileCandidateScoreBreakdown({
      user,
      profile,
      delegate,
      query,
      tags,
      city,
      completeness,
      commonTags,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
    });
    const matchScore = candidateTotalScore(scoreBreakdown);
    const matchReasons = buildProfileCandidateReasons({
      query,
      city,
      commonTags,
      completeness,
      verified: user.verified,
    });
    return buildCandidatePoolCandidate({
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
      recentPublicActivity: this.profileCandidatePublicActivitySignals({
        city,
        commonTags,
        updatedAt: profile?.updatedAt ?? user.updatedAt,
      }),
      publicIntentId: null,
      socialRequestId: query.socialRequestId,
      activityId: null,
      query,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
      candidateExplanation: this.candidateExplanation,
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
    const profileSummary = this.cachedPublicProfileSummary({
      user,
      profile,
      delegate,
      city: this.firstText(intent.city, profile?.city, user.city, delegate?.city),
    });
    const { city, completeness, displayName } = profileSummary;
    const tags = this.uniqueStrings([
      ...this.normalizeArray(intent.interestTags),
      intent.requestType,
      ...profileSummary.tags,
    ]);
    const commonTags = candidateCommonTags(query.interestTags, tags);
    const scoreBreakdown = buildPublicIntentCandidateScoreBreakdown({
      query,
      city,
      tags,
      commonTags,
      completeness,
      updatedAt: intent.updatedAt,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
    });
    const matchScore = candidateTotalScore(scoreBreakdown);
    const matchReasons = buildPublicIntentCandidateReasons({
      intent,
      query,
      city,
      commonTags,
    });
    return buildCandidatePoolCandidate({
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
      recentPublicActivity: this.publicIntentCandidatePublicActivitySignals({
        title: intent.title,
        requestType: intent.requestType,
        timePreference: intent.timePreference,
        locationPreference: intent.locationPreference,
        updatedAt: intent.updatedAt,
      }),
      publicIntentId: intent.id,
      socialRequestId: intent.linkedSocialRequestId ?? query.socialRequestId,
      activityId: null,
      query,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
      candidateExplanation: this.candidateExplanation,
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
    const profileSummary = this.cachedPublicProfileSummary({
      user,
      profile,
      delegate,
      city: this.firstText(
        request.city,
        profile?.city,
        user.city,
        delegate?.city,
      ),
    });
    const { city, completeness, displayName } = profileSummary;
    const tags = this.uniqueStrings([
      request.requestType,
      ...extractCandidateTags(`${request.title} ${request.description}`),
      ...profileSummary.tags,
    ]);
    const commonTags = candidateCommonTags(query.interestTags, tags);
    const scoreBreakdown = buildPublicIntentCandidateScoreBreakdown({
      query,
      city,
      tags,
      commonTags,
      completeness,
      updatedAt: request.updatedAt,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
    });
    const matchReasons = buildPublicIntentCandidateReasons({
      intent: {
        title: request.title,
        requestType: request.requestType,
        timePreference: request.timePreference,
      },
      query,
      city,
      commonTags,
    });
    return buildCandidatePoolCandidate({
      source: 'public_intent',
      user,
      profile,
      city,
      displayName,
      interestTags: tags,
      profileCompleteness: completeness,
      matchScore: candidateTotalScore(scoreBreakdown),
      scoreBreakdown,
      commonTags,
      matchReasons,
      recentPublicActivity: this.publicIntentCandidatePublicActivitySignals({
        title: request.title,
        requestType: request.requestType,
        timePreference: request.timePreference,
        updatedAt: request.updatedAt,
      }),
      publicIntentId: null,
      socialRequestId: request.id,
      activityId: null,
      query,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
      candidateExplanation: this.candidateExplanation,
    });
  }

  private cachedPublicProfileSummary(input: {
    user: User;
    profile: UserSocialProfile | null;
    delegate: AiDelegateProfile | null;
    city: string;
  }): CandidatePublicProfileSummary {
    const key = this.publicProfileSummaryCacheKey(input);
    const cached = this.cache().getWithMeta<CandidatePublicProfileSummary>(key);
    if (cached) {
      this.metrics?.recordToolResultCache({
        cacheName: 'candidate_public_profile_summary',
        hit: true,
        approxChars: cached.approxStoredChars,
      });
      return {
        ...cached.value,
        tags: [...cached.value.tags],
      };
    }
    const summary: CandidatePublicProfileSummary = {
      city: input.city,
      tags: candidateProfileTags(input.user, input.profile, input.delegate),
      completeness: candidateProfileCompleteness(
        input.user,
        input.profile,
        input.delegate,
      ),
      displayName: candidateDisplayName(input.user, input.profile, input.city),
    };
    this.cache().set(key, summary, { ttlMs: SOURCE_CACHE_TTL_MS });
    this.metrics?.recordToolResultCache({
      cacheName: 'candidate_public_profile_summary',
      hit: false,
      approxChars: this.approxChars(summary),
    });
    return {
      ...summary,
      tags: [...summary.tags],
    };
  }

  private publicProfileSummaryCacheKey(input: {
    user: User;
    profile: UserSocialProfile | null;
    delegate: AiDelegateProfile | null;
    city: string;
  }): string {
    return [
      'candidate_public_profile_summary',
      input.user.id,
      this.updatedAtKey(input.user.updatedAt),
      this.updatedAtKey(input.profile?.updatedAt),
      this.updatedAtKey(input.delegate?.updatedAt),
      cleanDisplayText(input.city, '').toLowerCase(),
    ].join(':');
  }

  private profileCandidatePublicActivitySignals(input: {
    city: string;
    commonTags: string[];
    updatedAt: Date | string | null | undefined;
  }): string[] {
    return this.uniqueStrings([
      '公开资料已允许 Agent 推荐',
      input.city ? `公开城市：${input.city}` : '',
      input.commonTags.length
        ? `共同公开兴趣：${input.commonTags.slice(0, 2).join('、')}`
        : '',
      this.updatedAtSignal(input.updatedAt),
    ]).slice(0, 4);
  }

  private publicIntentCandidatePublicActivitySignals(input: {
    title: string;
    requestType: string;
    timePreference?: string | null;
    locationPreference?: string | null;
    updatedAt: Date | string | null | undefined;
  }): string[] {
    return this.uniqueStrings([
      cleanDisplayText(input.title, '') ? `公开约练：${cleanDisplayText(input.title, '')}` : '',
      cleanDisplayText(input.requestType, '') ? `公开类型：${cleanDisplayText(input.requestType, '')}` : '',
      cleanDisplayText(input.timePreference, '') ? `公开时间：${cleanDisplayText(input.timePreference, '')}` : '',
      cleanDisplayText(input.locationPreference, '') ? `公开地点：${cleanDisplayText(input.locationPreference, '')}` : '',
      this.updatedAtSignal(input.updatedAt),
    ]).slice(0, 4);
  }

  private applyUserInterestSignals(
    candidates: CandidatePoolCandidate[],
    summary: SocialAgentUserInterestSummary | null,
  ): CandidatePoolCandidate[] {
    if (!summary || summary.eventCount <= 0) {
      return candidates.sort((a, b) => b.matchScore - a.matchScore);
    }
    return candidates
      .map((candidate) => this.applyUserInterestSignal(candidate, summary))
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  private applyUserInterestSignal(
    candidate: CandidatePoolCandidate,
    summary: SocialAgentUserInterestSummary,
  ): CandidatePoolCandidate {
    const signals: string[] = [];
    let adjustment = 0;
    if (summary.positiveTargetUserIds.includes(candidate.candidateUserId)) {
      adjustment += 10;
      signals.push('你之前对这位候选表现过兴趣');
    }
    if (summary.negativeTargetUserIds.includes(candidate.candidateUserId)) {
      adjustment -= 25;
      signals.push('你之前跳过过这位候选，本次会降低排序');
    }
    const tagScore = this.weightedTextOverlapScore({
      candidate,
      weights: [
        ...summary.activityTagWeights,
        ...summary.candidatePreferenceWeights,
      ],
      positiveLabel: '你之前偏好类似兴趣',
      negativeLabel: '你之前减少过类似推荐',
      signals,
      maxPositive: 12,
      maxNegative: 12,
    });
    adjustment += tagScore;
    const cityScore = this.weightedTextOverlapScore({
      candidate,
      weights: summary.cityWeights,
      positiveLabel: '你之前更常选择这个城市',
      negativeLabel: '你之前降低过这个城市的类似机会',
      signals,
      maxPositive: 4,
      maxNegative: 4,
    });
    adjustment += cityScore;
    const locationScore = this.weightedTextOverlapScore({
      candidate,
      weights: summary.locationWeights,
      positiveLabel: '你之前更常选择这个区域',
      negativeLabel: '你之前降低过这个区域的类似机会',
      signals,
      maxPositive: 5,
      maxNegative: 5,
    });
    adjustment += locationScore;
    const timeWindowScore = this.weightedTextOverlapScore({
      candidate,
      weights: summary.timeWindowWeights,
      positiveLabel: '你之前更常选择这个时间',
      negativeLabel: '你之前降低过这个时间的类似机会',
      signals,
      maxPositive: 4,
      maxNegative: 4,
    });
    adjustment += timeWindowScore;
    const newScore = candidateClampScore(candidate.matchScore + adjustment);
    const preferenceHistorySignals = this.uniqueStrings([
      ...signals,
      ...candidate.preferenceHistorySignals,
    ]).slice(0, 8);
    return {
      ...candidate,
      matchScore: newScore,
      score: newScore,
      level: candidateMatchLevel(newScore),
      scoreBreakdown: {
        ...candidate.scoreBreakdown,
        behaviorPreference: Math.round(adjustment),
      },
      preferenceHistorySignals,
    };
  }

  private weightedTextOverlapScore(input: {
    candidate: CandidatePoolCandidate;
    weights: Array<{ tag: string; weight: number }>;
    positiveLabel: string;
    negativeLabel: string;
    signals: string[];
    maxPositive: number;
    maxNegative: number;
  }): number {
    if (input.weights.length === 0) return 0;
    const haystack = this.candidateBehaviorText(input.candidate);
    let positive = 0;
    let negative = 0;
    const positiveTags: string[] = [];
    const negativeTags: string[] = [];
    for (const item of input.weights) {
      const tag = cleanDisplayText(item.tag, '').trim();
      if (!tag || !this.textContains(haystack, tag)) continue;
      if (item.weight > 0) {
        positive += Math.min(item.weight, 4);
        positiveTags.push(tag);
      } else if (item.weight < 0) {
        negative += Math.min(Math.abs(item.weight), 4);
        negativeTags.push(tag);
      }
    }
    if (positiveTags.length > 0) {
      input.signals.push(
        `${input.positiveLabel}：${this.uniqueStrings(positiveTags)
          .slice(0, 3)
          .join('、')}`,
      );
    }
    if (negativeTags.length > 0) {
      input.signals.push(
        `${input.negativeLabel}：${this.uniqueStrings(negativeTags)
          .slice(0, 3)
          .join('、')}`,
      );
    }
    return (
      Math.min(positive, input.maxPositive) -
      Math.min(negative, input.maxNegative)
    );
  }

  private candidateBehaviorText(candidate: CandidatePoolCandidate): string {
    return [
      candidate.displayName,
      candidate.city,
      candidate.distanceLabel,
      candidate.timeLabel,
      candidate.timeWindow,
      candidate.locationText,
      ...candidate.interestTags,
      ...candidate.commonTags,
      ...candidate.matchReasons,
      ...(candidate.recentPublicActivity ?? []),
      candidate.publicReason,
      candidate.privateReason,
      candidate.whyYouMayLike,
      candidate.whyNow,
    ]
      .map((item) => cleanDisplayText(item, '').toLowerCase())
      .filter(Boolean)
      .join(' ');
  }

  private textContains(haystack: string, tag: string): boolean {
    const needle = tag.toLowerCase();
    return Boolean(
      needle &&
        (haystack.includes(needle) ||
          needle
            .split(/[,\s，、/]+/)
            .filter(Boolean)
            .some((part) => part.length >= 2 && haystack.includes(part))),
    );
  }

  private updatedAtSignal(value: Date | string | null | undefined): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `最近公开更新：${date.toISOString().slice(0, 10)}`;
  }

  private updatedAtKey(value: Date | string | null | undefined): string {
    if (!value) return 'none';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return cleanDisplayText(value, 'unknown');
    return date.toISOString();
  }

  private toActivityResult(
    activity: SocialActivity,
    query: CandidatePoolResolvedQuery,
  ): CandidatePoolActivityResult {
    return buildCandidatePoolActivityResult({
      activity,
      query,
      explain: (explanationInput) =>
        this.explainActivityCandidate(explanationInput),
    });
  }

  private toPublicIntentActivityResult(
    intent: PublicSocialIntent,
    query: CandidatePoolResolvedQuery,
  ): CandidatePoolActivityResult {
    return buildCandidatePoolPublicIntentActivityResult({
      intent,
      query,
      explain: (explanationInput) =>
        this.explainActivityCandidate(explanationInput),
    });
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
      applySocialAgentCandidateRowState({
        row,
        candidate,
        existingStatus: existing?.status,
      });
      const saved = await this.saveCandidateRowIdempotently(
        row,
        socialRequestId,
        candidate.candidateUserId,
      );
      applySavedSocialAgentCandidateRow({ candidate, saved, socialRequestId });
    }
  }

  private async saveCandidateRowIdempotently(
    row: SocialRequestCandidate,
    socialRequestId: number,
    candidateUserId: number,
  ): Promise<SocialRequestCandidate> {
    try {
      return await this.candidateRepo.save(row);
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) throw error;
      const existing = await this.candidateRepo.findOne({
        where: { socialRequestId, candidateUserId },
      });
      if (!existing) throw error;
      return existing;
    }
  }

  private explainActivityCandidate(
    input: CandidatePoolActivityExplanationInput,
  ): CandidateExplanation {
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

  private async loadCounts(): Promise<CandidatePoolCounts> {
    const [
      users,
      socialProfiles,
      aiDelegateProfiles,
      publicSocialIntents,
      socialRequests,
      socialActivities,
    ] = await Promise.all([
      this.cachedCount('count:users', this.userRepo),
      this.cachedCount('count:profiles', this.profileRepo),
      this.cachedCount('count:ai_delegates', this.aiDelegateRepo),
      this.cachedCount('count:public_intents', this.publicIntentRepo),
      this.cachedCount('count:legacy_social_requests', this.legacySocialRequestRepo),
      this.cachedCount('count:activities', this.activityRepo),
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
      const safetyWithRecommendationGate = this.safety as SafetyService & {
        getAgentRecommendationExcludedUserIds?: (
          userId: number,
        ) => Promise<Set<number>>;
      };
      if (
        typeof safetyWithRecommendationGate.getAgentRecommendationExcludedUserIds ===
        'function'
      ) {
        return await safetyWithRecommendationGate.getAgentRecommendationExcludedUserIds(
          ownerUserId,
        );
      }
      return await this.safety.getMutualBlockUserIds(ownerUserId);
    } catch {
      return new Set<number>();
    }
  }

  private async cachedBlockedIds(ownerUserId: number): Promise<Set<number>> {
    const cached = await this.readThroughSourceCache(
      `blocked_ids:${ownerUserId}`,
      () => this.loadBlockedIds(ownerUserId),
    );
    return new Set(cached);
  }

  private async cachedLifeGraphSignals(
    ownerUserId: number,
  ): Promise<LifeGraphUnifiedMatchSignalsDto | null> {
    return this.readThroughSourceCache(`life_graph:${ownerUserId}`, () =>
      this.loadLifeGraphSignals(ownerUserId),
    );
  }

  private async loadUserInterestSummary(
    ownerUserId: number,
  ): Promise<SocialAgentUserInterestSummary | null> {
    try {
      return (
        (await this.interestEvents?.summarizeForUser({
          ownerUserId,
          limit: 200,
        })) ?? null
      );
    } catch {
      return null;
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
    return buildCandidatePoolDebugSnapshot(input);
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

  private async cachedCount<T extends ObjectLiteral>(
    key: string,
    repo: Repository<T>,
  ): Promise<number> {
    return this.readThroughSourceCache(key, () => this.safeCount(repo));
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

  private async cachedFind<T extends ObjectLiteral>(
    key: string,
    repo: Repository<T>,
    options: Parameters<Repository<T>['find']>[0],
  ): Promise<T[]> {
    const rows = await this.readThroughSourceCache(key, () =>
      this.safeFind(repo, options),
    );
    return rows.slice();
  }

  private async readThroughSourceCache<T>(
    key: string,
    loader: () => Promise<T>,
  ): Promise<T> {
    const result = await this.cache().getOrSetWithMeta(
      `candidate_pool:${key}`,
      loader,
      {
        ttlMs: SOURCE_CACHE_TTL_MS,
      },
    );
    this.metrics?.recordToolResultCache({
      cacheName: 'candidate_pool_source',
      hit: result.hit,
      approxChars: result.approxStoredChars,
    });
    return result.value;
  }

  private cache(): SocialAgentToolResultCacheService {
    return this.toolResultCache ?? this.localToolResultCache;
  }

  private normalizeArray(value: unknown): string[] {
    return normalizeCandidatePoolArray(value);
  }

  private uniqueStrings(values: unknown[]): string[] {
    return uniqueCandidatePoolStrings(values);
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

  private approxChars(value: unknown): number {
    try {
      return JSON.stringify(value)?.length ?? 0;
    } catch {
      return 0;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const record = error as Record<string, unknown>;
    return (
      record.code === '23505' ||
      (record.driverError instanceof Object &&
        (record.driverError as Record<string, unknown>).code === '23505')
    );
  }
}
