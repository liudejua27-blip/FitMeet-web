import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import { MessagesService } from '../messages/messages.service';
import { SafetyService } from '../safety/safety.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import { AgentWebhookService } from './agent-webhook.service';

const PROFILE_MATCH_SOURCE = 'profile_pool';
const PROFILE_MATCH_THRESHOLD = 55;

type ProfileMatchSignals = {
  publicTags?: string[];
  privatePreferenceTags?: string[];
  sensitivePrivateTags?: string[];
  matchKeywords?: string[];
  confidence?: number;
  source?: string;
};

type ProfileRecommendation = {
  aiMatchSessionId: number;
  targetUserId: number;
  score: number;
  status: string;
  summary: string;
  reasons: string[];
  safeProfile: {
    id: number;
    name: string;
    avatar: string;
    color: string;
    city: string;
    publicTags: string[];
    summary: string;
  };
  nextAction: 'owner_confirmation_required';
  createdAt: Date;
};

@Injectable()
export class ProfileMatchService {
  constructor(
    @InjectRepository(UserSocialProfile)
    private readonly socialProfileRepo: Repository<UserSocialProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AiMatchSession)
    private readonly sessionRepo: Repository<AiMatchSession>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    private readonly safety: SafetyService,
    private readonly messages: MessagesService,
    private readonly webhooks: AgentWebhookService,
  ) {}

  async runOnce(ownerUserId: number, limit = 8) {
    const ownerProfile = await this.socialProfileRepo.findOne({
      where: { userId: ownerUserId },
    });
    if (!this.isProfilePoolEnabled(ownerProfile)) {
      throw new BadRequestException(
        'Enable social profile discoverability before running profile matches.',
      );
    }
    const owner = ownerProfile as UserSocialProfile;

    const blocked = await this.safety.getMutualBlockUserIds(ownerUserId);
    const candidates = await this.socialProfileRepo
      .createQueryBuilder('profile')
      .where('profile."userId" != :ownerUserId', { ownerUserId })
      .andWhere(
        '(profile."profileDiscoverable" = true OR profile."agentCanRecommendMe" = true)',
      )
      .take(200)
      .getMany();
    const filtered = candidates.filter(
      (profile) => !blocked.has(profile.userId),
    );
    const existing = await this.sessionRepo.find({
      where: {
        ownerId: ownerUserId,
        source: PROFILE_MATCH_SOURCE,
      },
      take: 500,
    });
    const alreadyRecommended = new Set(
      existing.map((session) => session.targetUserId),
    );
    const userMap = await this.fetchUsers(filtered.map((profile) => profile.userId));

    const ranked = filtered
      .filter((profile) => !alreadyRecommended.has(profile.userId))
      .map((profile) => ({
        profile,
        user: userMap.get(profile.userId),
        score: this.scoreProfilePair(owner, profile),
      }))
      .filter((item) => item.user && item.score.score >= PROFILE_MATCH_THRESHOLD)
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, Math.max(1, Math.min(limit, 20)));

    const recommendations: ProfileRecommendation[] = [];
    for (const item of ranked) {
      const session = await this.sessionRepo.save(
        this.sessionRepo.create({
          ownerId: ownerUserId,
          targetUserId: item.profile.userId,
          score: item.score.score,
          status: 'review',
          initiatedBy: 'autopilot',
          source: PROFILE_MATCH_SOURCE,
          summary: item.score.summary,
          reasons: item.score.reasons,
          transcript: [],
        }),
      );
      const recommendation = this.toRecommendation(
        session,
        item.profile,
        item.user as User,
      );
      recommendations.push(recommendation);
      await this.emitRecommendation(ownerUserId, recommendation);
    }

    return {
      ok: true,
      matchedCount: recommendations.length,
      recommendations,
    };
  }

  async list(ownerUserId: number, limit = 30) {
    const sessions = await this.sessionRepo.find({
      where: { ownerId: ownerUserId, source: PROFILE_MATCH_SOURCE },
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
    const targetIds = sessions.map((session) => session.targetUserId);
    const [profiles, users] = await Promise.all([
      targetIds.length
        ? this.socialProfileRepo.find({ where: { userId: In(targetIds) } })
        : Promise.resolve([]),
      this.fetchUsers(targetIds),
    ]);
    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
    return {
      recommendations: sessions
        .map((session) => {
          const profile = profileMap.get(session.targetUserId);
          const user = users.get(session.targetUserId);
          if (!profile || !user) return null;
          return this.toRecommendation(session, profile, user);
        })
        .filter((item): item is ProfileRecommendation => Boolean(item)),
    };
  }

  private async emitRecommendation(
    ownerUserId: number,
    recommendation: ProfileRecommendation,
  ) {
    const connections = await this.connectionRepo.find({
      where: { userId: ownerUserId, status: ConnectionStatus.Active },
      take: 20,
    });
    for (const conn of connections) {
      const metadata = {
        aiMatchSessionId: recommendation.aiMatchSessionId,
        targetUserId: recommendation.targetUserId,
        score: recommendation.score,
        reasons: recommendation.reasons,
        safeProfile: recommendation.safeProfile,
        nextAction: recommendation.nextAction,
      };
      await this.messages.createAgentInboxEvent({
        agentConnectionId: conn.id,
        ownerUserId,
        eventType: 'profile.match.recommended',
        contentPreview: recommendation.summary,
        dedupeKey: `${conn.id}:profile.match.recommended:${recommendation.aiMatchSessionId}`,
        metadata,
      });
      void this.webhooks.emitToConnection(
        conn.id,
        'profile.match.recommended',
        metadata,
      );
    }
  }

  private toRecommendation(
    session: AiMatchSession,
    profile: UserSocialProfile,
    user: User,
  ): ProfileRecommendation {
    return {
      aiMatchSessionId: session.id,
      targetUserId: session.targetUserId,
      score: session.score,
      status: session.status,
      summary: session.summary,
      reasons: session.reasons ?? [],
      safeProfile: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        city: profile.city || user.city || '',
        publicTags: this.publicTags(profile).slice(0, 8),
        summary: profile.aiSummary || user.bio || '',
      },
      nextAction: 'owner_confirmation_required',
      createdAt: session.createdAt,
    };
  }

  private scoreProfilePair(owner: UserSocialProfile, candidate: UserSocialProfile) {
    const ownerPublic = this.publicTags(owner);
    const candidatePublic = this.publicTags(candidate);
    const ownerPrivate = this.privateTags(owner);
    const candidatePrivate = this.privateTags(candidate);
    const commonPublic = this.overlap(ownerPublic, candidatePublic);
    const ownerWantsCandidate = this.overlap(ownerPrivate, [
      ...candidatePublic,
      ...candidatePrivate,
    ]);
    const candidateWantsOwner = this.overlap(candidatePrivate, ownerPublic);
    const traitOverlap = this.overlap(owner.traits ?? [], candidate.traits ?? []);
    const cityMatch = Boolean(
      owner.city && candidate.city && owner.city.trim() === candidate.city.trim(),
    );
    const mbtiMatch = Boolean(owner.mbti && candidate.mbti && owner.mbti === candidate.mbti);
    const zodiacMatch = Boolean(
      owner.zodiac && candidate.zodiac && owner.zodiac === candidate.zodiac,
    );

    let score = 20;
    if (cityMatch) score += 15;
    score += Math.min(commonPublic.length, 4) * 7;
    score += Math.min(ownerWantsCandidate.length, 4) * 8;
    score += Math.min(candidateWantsOwner.length, 3) * 5;
    score += Math.min(traitOverlap.length, 3) * 4;
    if (mbtiMatch) score += 5;
    if (zodiacMatch) score += 3;
    if (candidate.agentCanRecommendMe) score += 5;
    score = Math.max(0, Math.min(96, Math.round(score)));

    const reasons = [
      cityMatch ? `Same city: ${candidate.city}` : '',
      commonPublic.length ? `Shared tags: ${commonPublic.slice(0, 3).join(', ')}` : '',
      ownerWantsCandidate.length ? 'Private preference signals align.' : '',
      candidateWantsOwner.length ? 'The candidate profile is also open to this type of match.' : '',
      traitOverlap.length ? `Similar traits: ${traitOverlap.slice(0, 3).join(', ')}` : '',
      mbtiMatch ? `MBTI aligned: ${owner.mbti}` : '',
      zodiacMatch ? `Zodiac aligned: ${owner.zodiac}` : '',
    ].filter(Boolean);

    return {
      score,
      reasons: reasons.slice(0, 6),
      summary:
        reasons[0] ??
        'Profile signals suggest this person is worth owner review before contact.',
    };
  }

  private isProfilePoolEnabled(profile: UserSocialProfile | null) {
    return Boolean(
      profile && (profile.profileDiscoverable || profile.agentCanRecommendMe),
    );
  }

  private async fetchUsers(userIds: number[]) {
    if (!userIds.length) return new Map<number, User>();
    const users = await this.userRepo.find({ where: { id: In(userIds) } });
    return new Map(users.map((user) => [user.id, user]));
  }

  private publicTags(profile: UserSocialProfile): string[] {
    const signals = (profile.matchSignals ?? {}) as ProfileMatchSignals;
    return this.cleanTags([
      ...(profile.interestTags ?? []),
      ...(profile.fitnessGoals ?? []),
      ...(profile.lifestyleTags ?? []),
      ...(profile.socialScenes ?? []),
      ...(profile.traits ?? []),
      ...(signals.publicTags ?? []),
      ...(signals.matchKeywords ?? []),
    ]).filter((tag) => !this.isSensitiveTag(tag));
  }

  private privateTags(profile: UserSocialProfile): string[] {
    const signals = (profile.matchSignals ?? {}) as ProfileMatchSignals;
    return this.cleanTags([
      ...(profile.wantToMeet ?? []),
      ...(profile.preferredTraits ?? []),
      ...(profile.relationshipGoals ?? []),
      ...(signals.privatePreferenceTags ?? []),
      ...(signals.sensitivePrivateTags ?? []),
    ]);
  }

  private overlap(a: string[], b: string[]) {
    const bSet = new Set(b.map((item) => this.normalizeTag(item)));
    return this.cleanTags(a).filter((item) => bSet.has(this.normalizeTag(item)));
  }

  private cleanTags(tags: string[]) {
    return Array.from(
      new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    ).slice(0, 40);
  }

  private normalizeTag(tag: string) {
    return tag.trim().toLowerCase();
  }

  private isSensitiveTag(tag: string) {
    return /rich|money|wealth|income|salary|handsome|beautiful|good-looking|resources|status|有钱|富|收入|高薪|颜值|帅|美|资源|身份/i.test(
      tag,
    );
  }
}
