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
  candidateCommonTags,
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
        this.safeFind(this.activityRepo, { order: { updatedAt: 'DESC' } }),
        this.safeFind(this.publicIntentRepo, { order: { updatedAt: 'DESC' } }),
        this.safeFind(this.profileRepo, { order: { updatedAt: 'DESC' } }),
        this.safeFind(this.aiDelegateRepo, { order: { updatedAt: 'DESC' } }),
        this.loadBlockedIds(input.ownerUserId),
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
    const city = this.firstText(profile?.city, user.city, delegate?.city);
    const tags = candidateProfileTags(user, profile, delegate);
    const completeness = candidateProfileCompleteness(user, profile, delegate);
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
    const displayName = candidateDisplayName(user, profile, city);
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
    const displayName = candidateDisplayName(user, profile, city);
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
    const displayName = candidateDisplayName(user, profile, city);
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
      publicIntentId: null,
      socialRequestId: request.id,
      activityId: null,
      query,
      lifeGraphSignals,
      sceneRisk: this.sceneRisk,
      candidateExplanation: this.candidateExplanation,
    });
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
