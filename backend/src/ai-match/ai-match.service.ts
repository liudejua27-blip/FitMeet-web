import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AiDelegateProfile } from './ai-delegate-profile.entity';
import { AiMatchSession } from './ai-match-session.entity';
import { UpsertAiDelegateProfileDto } from './dto/upsert-ai-delegate-profile.dto';
import { FriendsService } from '../friends/friends.service';
import { MessagesService } from '../messages/messages.service';
import { MessageCard } from '../messages/message.schema';

type MatchScore = {
  score: number;
  reasons: string[];
  sharedSports: string[];
};

const DEFAULT_DAILY_AUTO_CHAT_LIMIT = 3;
const MIN_AUTOPILOT_SCORE = 70;

@Injectable()
export class AiMatchService {
  constructor(
    @InjectRepository(AiDelegateProfile)
    private readonly profileRepo: Repository<AiDelegateProfile>,
    @InjectRepository(AiMatchSession)
    private readonly sessionRepo: Repository<AiMatchSession>,
    private readonly friendsService: FriendsService,
    private readonly messagesService: MessagesService,
  ) {}

  async getProfile(userId: number) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    return profile ?? this.createEmptyProfile(userId);
  }

  async upsertProfile(userId: number, dto: UpsertAiDelegateProfileDto) {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    const enabled = dto.enabled ?? existing?.enabled ?? false;
    const privacyConsent =
      dto.privacyConsent ?? existing?.privacyConsent ?? false;
    const autoChatEnabled =
      enabled && privacyConsent
        ? (dto.autoChatEnabled ?? existing?.autoChatEnabled ?? false)
        : false;

    if (enabled && !privacyConsent) {
      throw new BadRequestException(
        '开启 AI 托管前需要同意资料仅用于托管匹配。',
      );
    }
    if (autoChatEnabled && (!enabled || !privacyConsent)) {
      throw new BadRequestException(
        '开启自动代聊前需要先开启 AI 托管并同意资料用于匹配。',
      );
    }

    const profile = this.profileRepo.create({
      ...existing,
      userId,
      enabled,
      privacyConsent,
      autoChatEnabled,
      dailyAutoChatLimit: this.clampDailyLimit(
        dto.dailyAutoChatLimit ??
          existing?.dailyAutoChatLimit ??
          DEFAULT_DAILY_AUTO_CHAT_LIMIT,
      ),
      preferredName: this.clean(dto.preferredName ?? existing?.preferredName),
      city: this.clean(dto.city ?? existing?.city),
      favoriteSports: this.cleanArray(
        dto.favoriteSports ?? existing?.favoriteSports ?? [],
      ),
      interests: this.clean(dto.interests ?? existing?.interests),
      workExperience: this.clean(
        dto.workExperience ?? existing?.workExperience,
      ),
      idealPartner: this.clean(dto.idealPartner ?? existing?.idealPartner),
      trainingGoals: this.clean(dto.trainingGoals ?? existing?.trainingGoals),
      boundaries: this.clean(dto.boundaries ?? existing?.boundaries),
      availability: this.clean(dto.availability ?? existing?.availability),
    });

    return this.profileRepo.save(profile);
  }

  async getCandidates(userId: number) {
    const mine = await this.getEnabledProfile(userId);
    const profiles = await this.profileRepo.find({
      where: {
        userId: Not(userId),
        enabled: true,
        privacyConsent: true,
      },
      take: 30,
    });

    const candidates = profiles
      .map((profile) => {
        const match = this.scoreProfiles(mine, profile);
        return {
          userId: profile.userId,
          name: profile.user?.name ?? profile.preferredName,
          avatar: profile.user?.avatar || profile.preferredName?.[0] || 'AI',
          color: profile.user?.color || '#16C784',
          city: profile.city || profile.user?.city || '',
          favoriteSports: profile.favoriteSports,
          idealPartner: profile.idealPartner,
          trainingGoals: profile.trainingGoals,
          availability: profile.availability,
          autoChatEnabled: profile.autoChatEnabled,
          score: match.score,
          reasons: match.reasons,
          sharedSports: match.sharedSports,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (candidates.length === 0) return candidates;

    const sessions = await this.sessionRepo.find({
      where: {
        ownerId: userId,
        targetUserId: In(candidates.map((candidate) => candidate.userId)),
        initiatedBy: 'autopilot',
      },
      order: { createdAt: 'DESC' },
    });
    const latestSessionByTarget = new Map<number, AiMatchSession>();
    sessions.forEach((session) => {
      if (!latestSessionByTarget.has(session.targetUserId)) {
        latestSessionByTarget.set(session.targetUserId, session);
      }
    });

    return candidates.map((candidate) => {
      const session = latestSessionByTarget.get(candidate.userId);
      return {
        ...candidate,
        autopilotStatus: session ? 'contacted' : 'idle',
        autopilotConversationId: session?.conversationId ?? null,
        contactCardSent: session?.contactCardSent ?? false,
        contactedAt: session?.contactedAt ?? null,
      };
    });
  }

  async simulate(userId: number, targetUserId: number) {
    if (userId === targetUserId) {
      throw new BadRequestException('不能让 AI 和自己试聊。');
    }

    const [mine, target] = await Promise.all([
      this.getEnabledProfile(userId),
      this.getEnabledProfile(targetUserId),
    ]);
    const match = this.scoreProfiles(mine, target);
    const ownerName = mine.preferredName || mine.user?.name || '我的 AI';
    const targetName = target.preferredName || target.user?.name || '对方 AI';
    const sharedSports = match.sharedSports.join('、') || '共同运动目标';
    const transcript = [
      {
        speaker: ownerName,
        text: `我在帮主人找一个节奏稳定、边界清楚的约练搭子。TA 最近关注：${mine.trainingGoals || '规律运动'}`,
      },
      {
        speaker: targetName,
        text: `我这边的主人偏好 ${target.favoriteSports.join('、') || '轻量运动'}，可约时间是 ${target.availability || '待确认'}。`,
      },
      {
        speaker: ownerName,
        text: `我们共同点是 ${sharedSports}。我会先建议公开地点、明确强度和结束时间。`,
      },
      {
        speaker: targetName,
        text:
          match.score >= MIN_AUTOPILOT_SCORE
            ? '匹配度不错，可以建议双方先互相关注，再由真人确认是否继续聊。'
            : '可以先收藏为备选，但暂时不建议直接推进加好友。',
      },
    ];

    const session = await this.sessionRepo.save(
      this.sessionRepo.create({
        ownerId: userId,
        targetUserId,
        score: match.score,
        status: 'review',
        initiatedBy: 'manual',
        summary:
          match.score >= MIN_AUTOPILOT_SCORE
            ? 'AI 试聊反馈良好，建议由你确认后添加为关注对象。'
            : 'AI 试聊认为匹配仍需观察，建议继续寻找更稳定的搭子。',
        reasons: match.reasons,
        transcript,
      }),
    );

    return {
      id: session.id,
      targetUserId,
      targetName,
      score: match.score,
      status: session.status,
      summary: session.summary,
      reasons: session.reasons,
      transcript: session.transcript,
      canApproveFriend: match.score >= MIN_AUTOPILOT_SCORE,
      requiresUserConfirmation: true,
    };
  }

  async approveConnection(userId: number, sessionId: number) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, ownerId: userId },
    });
    if (!session) {
      throw new NotFoundException('AI 试聊记录不存在。');
    }
    if (session.score < MIN_AUTOPILOT_SCORE) {
      throw new BadRequestException('匹配度不足，暂不建议添加好友。');
    }

    await this.friendsService.ensureFollowing(userId, session.targetUserId);
    session.status = 'approved';
    await this.sessionRepo.save(session);

    return {
      following: true,
      targetUserId: session.targetUserId,
      message: '已由你确认，AI 托管建议对象已加入关注。',
    };
  }

  async runAutopilot(userId: number) {
    const mine = await this.getAutopilotProfile(userId);
    const startOfToday = this.getStartOfToday();
    const usedToday = await this.sessionRepo.count({
      where: {
        ownerId: userId,
        initiatedBy: 'autopilot',
        createdAt: MoreThanOrEqual(startOfToday),
      },
    });
    const limit = this.clampDailyLimit(mine.dailyAutoChatLimit);
    const remaining = Math.max(0, limit - usedToday);

    if (remaining === 0) {
      return {
        limit,
        usedToday,
        remaining: 0,
        contacted: [],
        skipped: ['今日 AI 自动推进次数已达上限。'],
      };
    }

    const profiles = await this.profileRepo.find({
      where: {
        userId: Not(userId),
        enabled: true,
        privacyConsent: true,
        autoChatEnabled: true,
      },
      take: 50,
    });

    const ranked = profiles
      .filter((profile) => profile.autoChatEnabled)
      .map((profile) => ({
        profile,
        match: this.scoreProfiles(mine, profile),
      }))
      .filter((item) => item.match.score >= MIN_AUTOPILOT_SCORE)
      .sort((a, b) => b.match.score - a.match.score);

    const contacted: ReturnType<AiMatchService['mapAutopilotSession']>[] = [];
    const skipped: string[] = [];

    for (const item of ranked) {
      if (contacted.length >= remaining) break;

      const existing = await this.sessionRepo.findOne({
        where: {
          ownerId: userId,
          targetUserId: item.profile.userId,
          initiatedBy: 'autopilot',
        },
      });
      if (existing) {
        skipped.push(
          `${item.profile.user?.name ?? item.profile.preferredName} 已由 AI 联系过。`,
        );
        continue;
      }

      await this.friendsService.ensureFollowing(userId, item.profile.userId);
      const { conversationId } = await this.messagesService.startConversation(
        userId,
        item.profile.userId,
      );
      const card = this.buildContactCard(mine);
      const text = this.buildAutopilotIntro(mine, item.profile, item.match);
      await this.messagesService.sendMessage(conversationId, userId, text, {
        source: 'ai_delegate',
        card,
      });

      const session = await this.sessionRepo.save(
        this.sessionRepo.create({
          ownerId: userId,
          targetUserId: item.profile.userId,
          score: item.match.score,
          status: 'approved',
          initiatedBy: 'autopilot',
          conversationId,
          contactCardSent: true,
          contactedAt: new Date(),
          summary: 'AI 已自动关注并发送 FitMeet 站内名片。',
          reasons: item.match.reasons,
          transcript: [
            {
              speaker: mine.preferredName || mine.user?.name || '我的 AI',
              text,
            },
          ],
        }),
      );

      contacted.push(this.mapAutopilotSession(session));
    }

    return {
      limit,
      usedToday: usedToday + contacted.length,
      remaining: Math.max(0, remaining - contacted.length),
      contacted,
      skipped,
    };
  }

  async getAutopilotHistory(userId: number) {
    const sessions = await this.sessionRepo.find({
      where: { ownerId: userId, initiatedBy: 'autopilot' },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return sessions.map((session) => this.mapAutopilotSession(session));
  }

  private async getEnabledProfile(userId: number) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile?.enabled || !profile.privacyConsent) {
      throw new BadRequestException('请先开启 AI 托管并同意资料用于匹配。');
    }
    return profile;
  }

  private async getAutopilotProfile(userId: number) {
    const profile = await this.getEnabledProfile(userId);
    if (!profile.autoChatEnabled) {
      throw new BadRequestException('请先开启 AI 自动关注和站内代聊。');
    }
    return profile;
  }

  private createEmptyProfile(userId: number) {
    return this.profileRepo.create({
      userId,
      enabled: false,
      privacyConsent: false,
      autoChatEnabled: false,
      dailyAutoChatLimit: DEFAULT_DAILY_AUTO_CHAT_LIMIT,
      favoriteSports: [],
    });
  }

  private scoreProfiles(
    a: AiDelegateProfile,
    b: AiDelegateProfile,
  ): MatchScore {
    const aSports = new Set(a.favoriteSports.map((item) => item.toLowerCase()));
    const sharedSports = b.favoriteSports.filter((sport) =>
      aSports.has(sport.toLowerCase()),
    );
    const aText = this.tokenize(
      [
        a.interests,
        a.workExperience,
        a.idealPartner,
        a.trainingGoals,
        a.boundaries,
      ].join(' '),
    );
    const bText = this.tokenize(
      [
        b.interests,
        b.workExperience,
        b.idealPartner,
        b.trainingGoals,
        b.boundaries,
      ].join(' '),
    );
    const overlap = [...aText].filter((token) => bText.has(token));
    const cityMatch = Boolean(a.city && b.city && a.city === b.city);
    const availabilityMatch = Boolean(
      a.availability && b.availability && a.availability === b.availability,
    );

    const score = Math.min(
      96,
      34 +
        sharedSports.length * 14 +
        Math.min(overlap.length, 6) * 5 +
        (cityMatch ? 14 : 0) +
        (availabilityMatch ? 8 : 0),
    );
    const reasons = [
      sharedSports.length
        ? `共同运动：${sharedSports.join('、')}`
        : '运动偏好需要进一步确认',
      cityMatch ? `同城：${a.city}` : '地点需要进一步对齐',
      overlap.length
        ? `资料关键词重合：${overlap.slice(0, 4).join('、')}`
        : '兴趣和理想型信息重合较少',
      availabilityMatch
        ? `时间相近：${a.availability}`
        : '可约时间需要真人确认',
    ];

    return { score, reasons, sharedSports };
  }

  private buildContactCard(profile: AiDelegateProfile): MessageCard {
    const name = profile.user?.name || profile.preferredName || 'FitMeet 用户';
    return {
      type: 'fitmeet_contact_card',
      userId: profile.userId,
      name,
      profileUrl: `/user/${profile.userId}`,
      sports: profile.favoriteSports.slice(0, 6),
      city: profile.city || profile.user?.city || '',
    };
  }

  private buildAutopilotIntro(
    owner: AiDelegateProfile,
    target: AiDelegateProfile,
    match: MatchScore,
  ) {
    const ownerName = owner.user?.name || owner.preferredName || '我的主人';
    const targetName = target.user?.name || target.preferredName || '你';
    const sports =
      match.sharedSports.join('、') ||
      owner.favoriteSports.join('、') ||
      '运动';
    const goals = owner.trainingGoals || '找一个节奏稳定、边界清楚的约练搭子';

    return [
      `由我的 FitMeet AI 托管代发：我在帮 ${ownerName} 寻找合适的约练搭子。`,
      `我注意到 ${targetName} 和 TA 在 ${sports} 上比较合拍，匹配分 ${match.score}。`,
      `TA 的目标是：${goals}。如果你也愿意，可以先通过这张 FitMeet 站内名片了解 TA，再决定是否继续聊。`,
    ].join('\n');
  }

  private mapAutopilotSession(session: AiMatchSession) {
    return {
      id: session.id,
      targetUserId: session.targetUserId,
      targetName: session.targetUser?.name || 'FitMeet 用户',
      targetAvatar: session.targetUser?.avatar || 'AI',
      targetColor: session.targetUser?.color || '#16C784',
      score: session.score,
      status: session.status,
      conversationId: session.conversationId,
      contactCardSent: session.contactCardSent,
      contactedAt: session.contactedAt ?? session.createdAt,
      summary: session.summary,
      reasons: session.reasons,
    };
  }

  private tokenize(text: string) {
    return new Set(
      text
        .toLowerCase()
        .split(/[\s,，。；;、|]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    );
  }

  private clean(value?: string) {
    return value?.trim() ?? '';
  }

  private cleanArray(value: string[]) {
    return value
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  private clampDailyLimit(value: number) {
    if (!Number.isFinite(value)) return DEFAULT_DAILY_AUTO_CHAT_LIMIT;
    return Math.max(1, Math.min(10, Math.trunc(value)));
  }

  private getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
