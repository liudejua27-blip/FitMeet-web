import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { SocialProfileService } from '../users/social-profile.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendsService } from '../friends/friends.service';
import { ProfileMatchService } from './profile-match.service';
import {
  ContactRequest,
  ContactRequestStatus,
} from './entities/contact-request.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import { AgentWebhookService } from './agent-webhook.service';

type AgentChatBody = {
  message?: string;
  sessionId?: string;
};

type CreateMatchRequestBody = {
  recommendationId?: number;
  candidateUserId?: number;
  message?: string;
};

@Controller()
@UseGuards(JwtAuthGuard)
export class MiniProgramController {
  constructor(
    private readonly socialProfiles: SocialProfileService,
    private readonly profileMatches: ProfileMatchService,
    private readonly messages: MessagesService,
    private readonly webhooks: AgentWebhookService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    @InjectRepository(ContactRequest)
    private readonly contactRepo: Repository<ContactRequest>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Post('users/me/social-profile/agent-chat')
  async agentChat(@CurrentUser() user: User, @Body() body: AgentChatBody) {
    const message = body?.message?.trim();
    if (!message) {
      throw new BadRequestException('message is required');
    }

    const draft = await this.socialProfiles.generateAiDraft(user.id, {
      rawText: message,
      source: 'wechat_mini_agent_chat',
    });

    return {
      reply: this.buildMiniAgentReply(draft.completion.percent),
      sessionId: body?.sessionId ?? null,
      profileDraft: draft.draft,
      mode: draft.mode,
      completion: draft.completion,
    };
  }

  @Get('users/me/social-profile/matches')
  async listMatches(
    @CurrentUser() user: User,
    @Query('refresh') refresh?: string,
    @Query('limit') limit?: string,
  ) {
    const take = this.normalizeLimit(limit, 20);
    if (refresh !== 'false' && refresh !== '0') {
      try {
        await this.profileMatches.runOnce(user.id, take);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/discoverability|Enable social profile/.test(message)) {
          throw error;
        }
      }
    }
    const result = await this.profileMatches.list(user.id, take);
    return {
      candidates: result.recommendations.map((item) =>
        this.toMiniCandidate(item),
      ),
    };
  }

  @Get('match-requests')
  async listMatchRequests(@CurrentUser() user: User) {
    const requests = await this.contactRepo.find({
      where: [{ requesterId: user.id }, { targetUserId: user.id }],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const userIds = [
      ...new Set(
        requests.flatMap((item) => [item.requesterId, item.targetUserId]),
      ),
    ];
    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) } })
      : [];
    const userMap = new Map(users.map((item) => [item.id, item]));

    return {
      requests: requests.map((item) => {
        const counterpartId =
          item.requesterId === user.id ? item.targetUserId : item.requesterId;
        const counterpart = userMap.get(counterpartId);
        return {
          id: item.id,
          fromUserId: item.requesterId,
          toUserId: item.targetUserId,
          direction: item.requesterId === user.id ? 'outgoing' : 'incoming',
          displayName: counterpart?.name ?? `User ${counterpartId}`,
          message: item.note,
          status: this.toMiniRequestStatus(item.status),
          createdAt: item.createdAt,
          respondedAt: item.respondedAt,
        };
      }),
    };
  }

  @Post('match-requests')
  async createMatchRequest(
    @CurrentUser() user: User,
    @Body() body: CreateMatchRequestBody,
  ) {
    const recommendationId =
      body.recommendationId ??
      (body.candidateUserId
        ? await this.findRecommendationId(user.id, body.candidateUserId)
        : null);
    if (!recommendationId) {
      throw new BadRequestException(
        'recommendationId or candidateUserId is required',
      );
    }
    const result = await this.profileMatches.confirmContact(
      user.id,
      recommendationId,
      body.message,
      { ownerConfirmed: true },
    );
    return {
      ...result,
      requestStatus: 'pending',
    };
  }

  @Post('match-requests/:id/accept')
  async acceptMatchRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const request = await this.getMutableRequest(user.id, id, 'accept');
    request.status = ContactRequestStatus.Accepted;
    request.respondedAt = new Date();
    await this.contactRepo.save(request);

    const conversation = await this.messages.startConversation(
      request.targetUserId,
      request.requesterId,
      request.agentConnectionId
        ? {
            agentConnectionId: request.agentConnectionId,
            ownerUserId: request.requesterId,
            actorUserId: request.requesterId,
            metadata: {
              source: 'contact_request_accept',
              contactRequestId: request.id,
            },
          }
        : {},
    );

    await Promise.all([
      this.friends.ensureFollowing(request.targetUserId, request.requesterId),
      this.friends.ensureFollowing(request.requesterId, request.targetUserId),
      this.safeNotify({
        userId: request.requesterId,
        type: 'contact_request.accepted',
        text: `${user.name ?? 'FitMeet 用户'} 已同意你的好友申请，可以开始聊天。`,
        fromUserId: request.targetUserId,
        fromUsername: user.name ?? 'FitMeet 用户',
        fromAvatar: user.avatar ?? 'F',
        fromColor: user.color ?? '#FF6A00',
        targetId: request.id,
      }),
      this.safeNotify({
        userId: request.targetUserId,
        type: 'contact_request.accepted',
        text: '已同意好友申请，FitMeet 已为你们建立聊天会话。',
        fromUserId: request.requesterId,
        targetId: request.id,
      }),
    ]);

    await this.notifyRequesterAgent(request, 'contact.request.accepted', {
      conversationId: conversation.conversationId,
    });

    return {
      ok: true,
      status: 'accepted',
      conversationId: conversation.conversationId,
    };
  }

  @Post('match-requests/:id/reject')
  async rejectMatchRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const request = await this.getMutableRequest(user.id, id, 'reject');
    request.status = ContactRequestStatus.Declined;
    request.respondedAt = new Date();
    await this.contactRepo.save(request);
    await this.safeNotify({
      userId: request.requesterId,
      type: 'contact_request.declined',
      text: `${user.name ?? 'FitMeet 用户'} 拒绝了你的好友申请。`,
      fromUserId: request.targetUserId,
      fromUsername: user.name ?? 'FitMeet 用户',
      fromAvatar: user.avatar ?? 'F',
      fromColor: user.color ?? '#FF6A00',
      targetId: request.id,
    });
    await this.notifyRequesterAgent(request, 'contact.request.declined');
    return { ok: true, status: 'rejected' };
  }

  private async safeNotify(data: {
    userId: number;
    type: string;
    text: string;
    fromUserId?: number;
    fromUsername?: string;
    fromAvatar?: string;
    fromColor?: string;
    targetId?: number;
  }) {
    try {
      await this.notifications.create(data);
    } catch {
      /* notifications are best-effort */
    }
  }

  private async notifyRequesterAgent(
    request: ContactRequest,
    eventType: 'contact.request.accepted' | 'contact.request.declined',
    extra: { conversationId?: string } = {},
  ) {
    const connections = request.agentConnectionId
      ? await this.connectionRepo.find({
          where: {
            id: request.agentConnectionId,
            userId: request.requesterId,
            status: ConnectionStatus.Active,
          },
          take: 1,
        })
      : await this.connectionRepo.find({
          where: {
            userId: request.requesterId,
            status: ConnectionStatus.Active,
          },
          take: 20,
        });
    if (!connections.length) return;

    const target = await this.userRepo.findOne({
      where: { id: request.targetUserId },
    });
    const accepted = eventType === 'contact.request.accepted';
    const contentPreview = `${target?.name ?? 'FitMeet 用户'} ${accepted ? '同意了' : '拒绝了'}你的好友申请`;
    const metadata = {
      contactRequestId: request.id,
      targetUserId: request.targetUserId,
      target: target
        ? {
            id: target.id,
            name: target.name,
            avatar: target.avatar,
            color: target.color,
            city: target.city,
            verified: target.verified,
          }
        : { id: request.targetUserId },
      contentPreview,
      status: accepted ? 'accepted' : 'declined',
      conversationId: extra.conversationId ?? null,
      nextAction: accepted
        ? 'report_acceptance_and_offer_to_open_conversation'
        : 'report_decline_and_do_not_retry_without_owner_instruction',
    };

    for (const conn of connections) {
      await this.messages.createAgentInboxEvent({
        agentConnectionId: conn.id,
        ownerUserId: request.requesterId,
        eventType,
        conversationId: extra.conversationId ?? null,
        requestId: request.id,
        fromUserId: request.targetUserId,
        contentPreview,
        dedupeKey: `${conn.id}:${eventType}:${request.id}`,
        metadata,
      });
      void this.webhooks
        .emitToConnection(conn.id, eventType, metadata)
        .catch(() => undefined);
    }
  }

  private async findRecommendationId(
    ownerUserId: number,
    targetUserId: number,
  ) {
    let listed = await this.profileMatches.list(ownerUserId, 100);
    let found = listed.recommendations.find(
      (item) => item.targetUserId === targetUserId,
    );
    if (!found) {
      await this.profileMatches.runOnce(ownerUserId, 20).catch(() => undefined);
      listed = await this.profileMatches.list(ownerUserId, 100);
      found = listed.recommendations.find(
        (item) => item.targetUserId === targetUserId,
      );
    }
    return found?.aiMatchSessionId ?? null;
  }

  private async getMutableRequest(
    userId: number,
    id: number,
    action: 'accept' | 'reject',
  ) {
    const request = await this.contactRepo.findOne({ where: { id } });
    if (!request) throw new BadRequestException('match request not found');
    if (request.status !== ContactRequestStatus.Pending) {
      throw new BadRequestException('match request is not pending');
    }
    if (action === 'accept' && request.targetUserId !== userId) {
      throw new BadRequestException('only target user can accept this request');
    }
    if (
      action === 'reject' &&
      request.targetUserId !== userId &&
      request.requesterId !== userId
    ) {
      throw new BadRequestException('not allowed to reject this request');
    }
    return request;
  }

  private toMiniCandidate(item: {
    aiMatchSessionId: number;
    targetUserId: number;
    score: number;
    status: string;
    summary: string;
    reasons: string[];
    publicReasons: string[];
    riskTips: string[];
    nextStepSuggestions: string[];
    safeProfile: {
      name: string;
      avatar: string;
      city: string;
      publicTags: string[];
      summary: string;
    };
    reasoner?: {
      sharedPoints?: string[];
      complementaryPoints?: string[];
      suggestedOpener?: string;
    };
  }) {
    return {
      recommendationId: item.aiMatchSessionId,
      candidateUserId: item.targetUserId,
      displayName: item.safeProfile.name,
      avatarUrl: item.safeProfile.avatar,
      city: item.safeProfile.city,
      publicTags: item.safeProfile.publicTags,
      matchScore: Math.round(item.score),
      matchReasons: item.publicReasons.length
        ? item.publicReasons
        : item.reasons,
      sharedSignals: item.reasoner?.sharedPoints ?? [],
      safeProfileSummary: item.safeProfile.summary || item.summary,
      openingTips:
        item.nextStepSuggestions.length > 0
          ? item.nextStepSuggestions
          : item.reasoner?.suggestedOpener
            ? [item.reasoner.suggestedOpener]
            : [],
      requestStatus: item.status === 'approved' ? 'sent' : 'none',
      riskTips: item.riskTips,
    };
  }

  private toMiniRequestStatus(status: ContactRequestStatus) {
    if (status === ContactRequestStatus.Accepted) return 'accepted';
    if (status === ContactRequestStatus.Declined) return 'rejected';
    return status;
  }

  private normalizeLimit(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(Math.floor(parsed), 50));
  }

  private buildMiniAgentReply(score: number) {
    if (score >= 80) {
      return '我已经整理出比较完整的画像草稿了。你可以进入画像确认页，检查公开卡片、私密偏好和匹配开关后再保存。';
    }
    if (score >= 50) {
      return '我先帮你整理了一版画像草稿。为了匹配更准确，你还可以补充城市、可约时间、想认识的人，以及不希望遇到的类型。';
    }
    return '我记下来了。你可以继续告诉我你想找什么样的运动搭子、常在哪个城市活动、周末还是工作日方便。';
  }

  private buildAgentReply(score: number) {
    if (score >= 80) {
      return '我已经整理出比较完整的画像草稿了。你可以进入画像确认页，检查公开卡片、私密偏好和匹配开关后再保存。';
    }
    if (score >= 50) {
      return '我先帮你整理了一版画像草稿。为了匹配更准确，你还可以补充城市、可约时间、想认识的人，以及不希望遇到的类型。';
    }
    return '我记下来了。你可以继续告诉我你想找什么样的运动搭子、常在哪个城市活动、周末还是工作日方便。';
  }
}
