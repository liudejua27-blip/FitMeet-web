import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';

import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import { MatchService, MatchedCandidateView } from '../match/match.service';
import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  CandidateStatus,
  MatchCandidate,
} from './entities/match-candidate.entity';
import { UserPreference } from './entities/user-preference.entity';
import { ProfileMatchService } from './profile-match.service';
import { AgentWebhookService } from './agent-webhook.service';

/**
 * FitMeet "Subconscious Loop".
 *
 * This background sweep looks for newly completed profile signals and newly
 * posted request cards, then stages safe recommendations without an explicit
 * command. It never auto-friends, auto-contacts, or schedules an offline meet;
 * it only asks both sides whether they want to connect.
 *
 * Enable with `ENABLE_SUBCONSCIOUS_LOOP=true`. Legacy
 * `ENABLE_PROFILE_MATCH_AUTOPILOT=true` is still honored.
 */
@Injectable()
export class ProfileMatchAutopilotService {
  private readonly logger = new Logger(ProfileMatchAutopilotService.name);
  private lastRunAt: Date | null = null;
  private lastSummary: ProfileMatchAutopilotSummary | null = null;
  private running = false;

  constructor(
    @InjectRepository(UserSocialProfile)
    private readonly socialProfileRepo: Repository<UserSocialProfile>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(AiDelegateProfile)
    private readonly aiProfileRepo: Repository<AiDelegateProfile>,
    @InjectRepository(UserSocialRequest)
    private readonly requestRepo: Repository<UserSocialRequest>,
    @InjectRepository(UserPreference)
    private readonly preferenceRepo: Repository<UserPreference>,
    @InjectRepository(MatchCandidate)
    private readonly matchCandidateRepo: Repository<MatchCandidate>,
    @InjectRepository(SocialRequestCandidate)
    private readonly socialRequestCandidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(AiMatchSession)
    private readonly sessionRepo: Repository<AiMatchSession>,
    private readonly profileMatch: ProfileMatchService,
    private readonly matchService: MatchService,
    private readonly notifications: NotificationsService,
    private readonly messages: MessagesService,
    private readonly webhooks: AgentWebhookService,
  ) {}

  @Cron('*/10 * * * * *')
  async onCron(): Promise<void> {
    if (!isEnabled()) return;
    const intervalMs = configuredIntervalMs();
    if (
      this.lastRunAt &&
      Date.now() - this.lastRunAt.getTime() < intervalMs - 1000
    ) {
      return;
    }
    try {
      await this.runOnce('cron');
    } catch (err) {
      this.logger.error(
        `Subconscious loop cron failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async runOnce(
    triggeredBy: 'cron' | 'manual' = 'manual',
    ownerUserId?: number,
  ): Promise<ProfileMatchAutopilotSummary> {
    if (this.running) {
      this.logger.warn('Subconscious loop sweep already in progress, skipping');
      const skipped = emptySummary(triggeredBy, 'already_running');
      this.lastSummary = skipped;
      return skipped;
    }
    this.running = true;
    this.lastRunAt = new Date();

    const summary: ProfileMatchAutopilotSummary = emptySummary(triggeredBy);
    summary.skipped = false;

    try {
      const ownerIds = await this.collectOwnerIds(summary, ownerUserId);
      if (ownerIds.length === 0) return summary;

      const activeConnections = await this.connectionRepo.find({
        where: { userId: In(ownerIds), status: ConnectionStatus.Active },
        take: 2000,
      });
      const connectionsByOwner = groupConnectionsByOwner(activeConnections);

      const limit = perOwnerLimit();
      for (const userId of ownerIds) {
        try {
          const profileResult = await this.profileMatch.runOnce(userId, limit);
          summary.generatedRecommendations += profileResult.matchedCount ?? 0;
          summary.inboxEvents += profileResult.inboxEvents ?? 0;
          summary.skippedDuplicates += profileResult.skippedDuplicates ?? 0;
          summary.notificationsSent += await this.notifyProfileRecommendations(
            userId,
            profileResult.recommendations ?? [],
          );

          await this.runRequestCardMatchesForOwner(
            userId,
            limit,
            connectionsByOwner.get(userId) ?? [],
            summary,
          );
        } catch (err) {
          summary.errors += 1;
          this.logger.warn(
            `Subconscious loop failed for owner=${userId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } catch (err) {
      summary.errors += 1;
      this.logger.error(
        `Subconscious loop sweep crashed: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }

    this.logger.log(
      `Subconscious loop done (${triggeredBy}): profiles=${summary.scannedProfiles} requests=${summary.scannedRequests} profileRecommendations=${summary.generatedRecommendations} requestCandidates=${summary.generatedRequestCandidates} inboxEvents=${summary.inboxEvents} notifications=${summary.notificationsSent} duplicates=${summary.skippedDuplicates} errors=${summary.errors}`,
    );
    this.lastSummary = summary;
    return summary;
  }

  getStatus() {
    const intervalMs = configuredIntervalMs();
    const nextRunAt =
      this.lastRunAt && isEnabled()
        ? new Date(this.lastRunAt.getTime() + intervalMs)
        : null;
    return {
      enabled: isEnabled(),
      env: {
        ENABLE_SUBCONSCIOUS_LOOP: process.env.ENABLE_SUBCONSCIOUS_LOOP ?? null,
        ENABLE_PROFILE_MATCH_AUTOPILOT:
          process.env.ENABLE_PROFILE_MATCH_AUTOPILOT ?? null,
        PROFILE_MATCH_AUTOPILOT_INTERVAL_SECONDS:
          process.env.PROFILE_MATCH_AUTOPILOT_INTERVAL_SECONDS ?? null,
      },
      running: this.running,
      intervalSeconds: Math.round(intervalMs / 1000),
      lastRunAt: this.lastRunAt,
      nextRunAt,
      lastSummary: this.lastSummary,
    };
  }

  private async runRequestCardMatchesForOwner(
    ownerUserId: number,
    limit: number,
    ownerConnections: AgentConnection[],
    summary: ProfileMatchAutopilotSummary,
  ) {
    const requests = await this.requestRepo.find({
      where: {
        userId: ownerUserId,
        agentAllowed: true,
        status: In(ACTIVE_REQUEST_STATUSES),
      },
      order: { updatedAt: 'DESC' },
      take: MAX_REQUESTS_PER_OWNER_SWEEP,
    });
    summary.scannedRequests += requests.length;

    for (const request of requests) {
      const existing = await this.socialRequestCandidateRepo.find({
        where: {
          socialRequestId: request.id,
          status: In([
            SocialRequestCandidateStatus.Suggested,
            SocialRequestCandidateStatus.Approved,
            SocialRequestCandidateStatus.Messaged,
          ]),
        },
        take: 1,
      });
      if (existing.length > 0) {
        summary.skippedDuplicates += 1;
        continue;
      }

      try {
        const result = await this.matchService.runMatch(request.id, ownerUserId, {
          limit,
        });
        const candidates = result.candidates ?? [];
        if (candidates.length === 0) continue;
        summary.generatedRequestCandidates += candidates.length;
        summary.notificationsSent += await this.notifyRequestCardMatch(
          ownerUserId,
          request,
          candidates,
        );
        summary.inboxEvents += await this.emitRequestCardInboxEvent(
          ownerUserId,
          request,
          candidates,
          ownerConnections,
        );
      } catch (err) {
        summary.errors += 1;
        this.logger.warn(
          `Subconscious loop request-card match failed for owner=${ownerUserId}, request=${request.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async notifyProfileRecommendations(
    ownerUserId: number,
    recommendations: ProfileRecommendationForNotification[],
  ): Promise<number> {
    let sent = 0;
    for (const recommendation of recommendations) {
      await this.safeNotify({
        userId: ownerUserId,
        type: 'subconscious_loop.profile_match',
        text: `Subconscious Loop found a profile match with ${
          recommendation.safeProfile?.name ?? 'someone'
        }. Confirm before any friend request or offline plan.`,
        targetId: recommendation.aiMatchSessionId,
      });
      sent += 1;

      await this.safeNotify({
        userId: recommendation.targetUserId,
        type: 'subconscious_loop.profile_match',
        text: 'Subconscious Loop found a possible profile match. Both people must agree before any friend request.',
        targetId: recommendation.aiMatchSessionId,
      });
      sent += 1;
    }
    return sent;
  }

  private async notifyRequestCardMatch(
    ownerUserId: number,
    request: UserSocialRequest,
    candidates: MatchedCandidateView[],
  ): Promise<number> {
    await this.safeNotify({
      userId: ownerUserId,
      type: 'subconscious_loop.request_match',
      text: `Subconscious Loop found ${candidates.length} candidate(s) for "${
        request.title || request.activityType || 'your request'
      }". Confirm before sending an invite.`,
      targetId: request.id,
    });
    let sent = 1;

    for (const candidate of candidates.slice(0, MAX_CANDIDATE_NOTIFICATIONS)) {
      await this.safeNotify({
        userId: candidate.userId,
        type: 'subconscious_loop.request_match',
        text: 'Subconscious Loop found a possible request-card match. Both people must agree before becoming friends.',
        targetId: candidate.candidateRecordId ?? request.id,
      });
      sent += 1;
    }
    return sent;
  }

  private async emitRequestCardInboxEvent(
    ownerUserId: number,
    request: UserSocialRequest,
    candidates: MatchedCandidateView[],
    ownerConnections: AgentConnection[],
  ): Promise<number> {
    let events = 0;
    const safeCandidates = candidates
      .slice(0, MAX_CANDIDATE_NOTIFICATIONS)
      .map((candidate) => ({
        candidateRecordId: candidate.candidateRecordId ?? null,
        userId: candidate.userId,
        name: candidate.nickname,
        avatar: candidate.avatar,
        color: candidate.color,
        score: candidate.score,
        level: candidate.level,
        commonTags: candidate.commonTags,
        risk: candidate.risk,
      }));
    const metadata = {
      socialRequestId: request.id,
      title: request.title,
      activityType: request.activityType,
      candidateCount: candidates.length,
      candidates: safeCandidates,
      nextAction: 'ask_owner_to_confirm_before_invite_or_friend_request',
    };

    for (const conn of ownerConnections) {
      await this.messages.createAgentInboxEvent({
        agentConnectionId: conn.id,
        ownerUserId,
        eventType: 'social_request.match.recommended',
        contentPreview: `Subconscious Loop found ${candidates.length} candidate(s) for "${
          request.title || request.activityType || 'your request'
        }".`,
        dedupeKey: `${conn.id}:social_request.match.recommended:${request.id}`,
        requestId: request.id,
        metadata,
      });
      void this.webhooks
        .emitToConnection(conn.id, 'social_request.match.recommended', metadata)
        .catch(() => undefined);
      events += 1;
    }
    return events;
  }

  private async safeNotify(data: {
    userId: number;
    type: string;
    text: string;
    targetId?: number;
  }) {
    try {
      await this.notifications.create({
        ...data,
        fromUsername: 'FitMeet AI',
        fromAvatar: 'AI',
        fromColor: '#38BDF8',
      });
    } catch {
      // Notification delivery must never block the matching loop.
    }
  }

  private async collectOwnerIds(
    summary: ProfileMatchAutopilotSummary,
    ownerUserId?: number,
  ): Promise<number[]> {
    const ownerIds = new Set<number>();
    const cutoff = new Date(Date.now() - RECENT_SOURCE_WINDOW_MS);

    const profileQuery = this.socialProfileRepo
      .createQueryBuilder('profile')
      .where(
        '(profile."profileDiscoverable" = true OR profile."agentCanRecommendMe" = true)',
      );
    if (ownerUserId != null) {
      profileQuery.andWhere('profile."userId" = :ownerUserId', { ownerUserId });
    }
    const profiles = await profileQuery
      .orderBy('profile."updatedAt"', 'DESC')
      .take(MAX_OWNERS_PER_SWEEP)
      .getMany();
    summary.scannedProfiles = profiles.length;
    const eligibleOwnerIds = new Set(profiles.map((profile) => profile.userId));
    profiles.forEach((profile) => ownerIds.add(profile.userId));

    const aiProfileQuery = this.aiProfileRepo
      .createQueryBuilder('aiProfile')
      .where('aiProfile."updatedAt" >= :cutoff', { cutoff })
      .andWhere(
        '(aiProfile."enabled" = true OR aiProfile."privacyConsent" = true)',
      );
    if (ownerUserId != null) {
      aiProfileQuery.andWhere('aiProfile."userId" = :ownerUserId', {
        ownerUserId,
      });
    }
    const aiProfiles = await aiProfileQuery
      .orderBy('aiProfile."updatedAt"', 'DESC')
      .take(MAX_RECENT_SOURCE_ROWS)
      .getMany();
    aiProfiles.forEach((profile) => ownerIds.add(profile.userId));

    const requestQuery = this.requestRepo
      .createQueryBuilder('request')
      .where('request."updatedAt" >= :cutoff', { cutoff })
      .andWhere('request."agentAllowed" = true')
      .andWhere('request."status" IN (:...statuses)', {
        statuses: ACTIVE_REQUEST_STATUSES,
      });
    if (ownerUserId != null) {
      requestQuery.andWhere('request."userId" = :ownerUserId', {
        ownerUserId,
      });
    }
    const requests = await requestQuery
      .orderBy('request."updatedAt"', 'DESC')
      .take(MAX_RECENT_SOURCE_ROWS)
      .getMany();
    summary.scannedRequests = requests.length;
    requests.forEach((request) => ownerIds.add(request.userId));

    const preferenceQuery = this.preferenceRepo
      .createQueryBuilder('preference')
      .where('preference."updatedAt" >= :cutoff', { cutoff })
      .andWhere(
        '(preference."agentMessagingEnabled" = true OR preference."acceptAgentMessages" = true)',
      );
    if (ownerUserId != null) {
      preferenceQuery.andWhere('preference."userId" = :ownerUserId', {
        ownerUserId,
      });
    }
    const preferences = await preferenceQuery
      .orderBy('preference."updatedAt"', 'DESC')
      .take(MAX_RECENT_SOURCE_ROWS)
      .getMany();
    preferences.forEach((preference) => ownerIds.add(preference.userId));

    const feedbackWhere = ownerUserId != null ? { userId: ownerUserId } : {};
    const matchFeedback = await this.matchCandidateRepo.find({
      where: [
        {
          ...feedbackWhere,
          status: In([
            CandidateStatus.Approved,
            CandidateStatus.Rejected,
            CandidateStatus.Contacted,
          ]),
        },
        { ...feedbackWhere, userFeedback: Not(IsNull()) },
      ],
      order: { createdAt: 'DESC' },
      take: MAX_RECENT_SOURCE_ROWS,
    });
    matchFeedback.forEach((feedback) => ownerIds.add(feedback.userId));

    const profileFeedback = await this.sessionRepo.find({
      where: {
        ...(ownerUserId != null ? { ownerId: ownerUserId } : {}),
        source: 'profile_pool',
        status: In(['approved', 'rejected']),
      },
      order: { createdAt: 'DESC' },
      take: MAX_RECENT_SOURCE_ROWS,
    });
    profileFeedback.forEach((session) => ownerIds.add(session.ownerId));

    const collectedOwnerIds = Array.from(ownerIds).slice(0, MAX_OWNERS_PER_SWEEP);
    const unverifiedOwnerIds = collectedOwnerIds.filter(
      (userId) => !eligibleOwnerIds.has(userId),
    );
    if (unverifiedOwnerIds.length > 0) {
      const sourceProfiles = await this.socialProfileRepo.find({
        where: [
          { userId: In(unverifiedOwnerIds), profileDiscoverable: true },
          { userId: In(unverifiedOwnerIds), agentCanRecommendMe: true },
        ],
        take: MAX_OWNERS_PER_SWEEP,
      });
      summary.scannedProfiles += sourceProfiles.length;
      sourceProfiles.forEach((profile) => eligibleOwnerIds.add(profile.userId));
    }

    return collectedOwnerIds.filter((userId) => eligibleOwnerIds.has(userId));
  }
}

type ProfileRecommendationForNotification = {
  aiMatchSessionId: number;
  targetUserId: number;
  safeProfile?: { name?: string };
};

export interface ProfileMatchAutopilotSummary {
  triggeredBy: 'cron' | 'manual';
  skipped: boolean;
  reason?: string;
  scannedProfiles: number;
  scannedRequests: number;
  generatedRecommendations: number;
  generatedRequestCandidates: number;
  inboxEvents: number;
  notificationsSent: number;
  skippedDuplicates: number;
  errors: number;
}

const MAX_OWNERS_PER_SWEEP = 200;
const MAX_RECENT_SOURCE_ROWS = 200;
const MAX_REQUESTS_PER_OWNER_SWEEP = 5;
const MAX_CANDIDATE_NOTIFICATIONS = 3;
const RECENT_SOURCE_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_REQUEST_STATUSES = [
  UserSocialRequestStatus.Matching,
  UserSocialRequestStatus.Matched,
  UserSocialRequestStatus.InvitationPending,
  UserSocialRequestStatus.Chatting,
];

function emptySummary(
  triggeredBy: 'cron' | 'manual',
  reason?: string,
): ProfileMatchAutopilotSummary {
  return {
    triggeredBy,
    skipped: Boolean(reason),
    reason,
    scannedProfiles: 0,
    scannedRequests: 0,
    generatedRecommendations: 0,
    generatedRequestCandidates: 0,
    inboxEvents: 0,
    notificationsSent: 0,
    skippedDuplicates: 0,
    errors: 0,
  };
}

function isEnabled(): boolean {
  return (
    (process.env.ENABLE_SUBCONSCIOUS_LOOP ?? '').toLowerCase() === 'true' ||
    (process.env.ENABLE_PROFILE_MATCH_AUTOPILOT ?? '').toLowerCase() === 'true'
  );
}

function configuredIntervalMs(): number {
  const raw = Number(
    process.env.SUBCONSCIOUS_LOOP_INTERVAL_SECONDS ??
      process.env.PROFILE_MATCH_AUTOPILOT_INTERVAL_SECONDS,
  );
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 60;
  return seconds * 1000;
}

function perOwnerLimit(): number {
  const raw = Number(
    process.env.SUBCONSCIOUS_LOOP_PER_OWNER_LIMIT ??
      process.env.PROFILE_MATCH_AUTOPILOT_PER_OWNER_LIMIT,
  );
  if (!Number.isFinite(raw) || raw <= 0) return 3;
  return Math.min(Math.floor(raw), 10);
}

function groupConnectionsByOwner(connections: AgentConnection[]) {
  const map = new Map<number, AgentConnection[]>();
  for (const conn of connections) {
    const list = map.get(conn.userId) ?? [];
    list.push(conn);
    map.set(conn.userId, list);
  }
  return map;
}
