import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AiMatchSession,
  AiMatchSessionInitiator,
} from '../ai-match/ai-match-session.entity';
import { MessagesService } from '../messages/messages.service';
import { SafetyService } from '../safety/safety.service';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { User } from '../users/user.entity';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import { AgentWebhookService } from './agent-webhook.service';
import {
  ContactRequest,
  ContactRequestStatus,
} from './entities/contact-request.entity';
import {
  MatchReasonerService,
  MatchReasonerOutput,
} from './match-reasoner.service';
import { CompatibilityScorerService } from '../match/compatibility-scorer.service';
import { AgentActionLogService } from './agent-action-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';

const PROFILE_MATCH_SOURCE = 'profile_pool';
const PROFILE_MATCH_THRESHOLD = 55;

type ProfileMatchRunOptions = {
  autoEnableProfilePool?: boolean;
  initiatedBy?: AiMatchSessionInitiator;
};

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
  candidateUserId: number;
  source: 'profile_pool';
  score: number;
  scoreBreakdown: Record<string, number>;
  status: string;
  summary: string;
  reasons: string[];
  matchedSignals: string[];
  publicReason: string;
  privateReason: string;
  riskWarning: string;
  suggestedOpener: string;
  publicReasons: string[];
  privateReasons: string[];
  privateReasonAvailable: boolean;
  riskTips: string[];
  nextStepSuggestions: string[];
  safetySummary: string;
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
  reasoner?: MatchReasonerOutput;
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
    @InjectRepository(ContactRequest)
    private readonly contactRepo: Repository<ContactRequest>,
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly taskEventRepo: Repository<AgentTaskEvent>,
    private readonly safety: SafetyService,
    private readonly messages: MessagesService,
    private readonly webhooks: AgentWebhookService,
    private readonly reasoner: MatchReasonerService,
    private readonly compatibility: CompatibilityScorerService,
    private readonly actionLog: AgentActionLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Recommendation-card action dispatch helper.
   *
  * Writes to `agent_tasks`, `agent_task_events`, `agent_action_logs`, and
  * emits an Agent Inbox event with the
   * standard metadata shape ({ recommendationId, targetUserId, action,
   * status, requiresOwnerConfirmation, approvalId, conversationId,
   * messageId, ...extra }) and fire-and-forgets a webhook per action.
   * All failures are swallowed so they cannot disrupt the caller.
   */
  private async logAndDispatch(
    action:
      | 'recommendation.ignored'
      | 'recommendation.saved'
      | 'opener.drafted'
      | 'approval.created'
      | 'contact.confirmed'
      | 'contact.exchange_requested'
      | 'intro.sent',
    ownerUserId: number,
    session: AiMatchSession,
    status: string,
    extra: {
      requiresOwnerConfirmation?: boolean;
      approvalId?: number | null;
      conversationId?: string | null;
      messageId?: string | null;
      contentPreview?: string;
      payload?: Record<string, unknown>;
    } = {},
  ) {
    const actionTypeMap: Record<string, AgentActionType> = {
      'recommendation.ignored': AgentActionType.RejectAction,
      'recommendation.saved': AgentActionType.ApproveAction,
      'opener.drafted': AgentActionType.GenerateInvite,
      'approval.created': AgentActionType.AgentEvent,
      'contact.confirmed': AgentActionType.AddFriend,
      'contact.exchange_requested': AgentActionType.AddFriend,
      'intro.sent': AgentActionType.SendMessage,
    };
    const riskMap: Record<string, AgentActionRiskLevel> = {
      'recommendation.ignored': AgentActionRiskLevel.Low,
      'recommendation.saved': AgentActionRiskLevel.Low,
      'opener.drafted': AgentActionRiskLevel.Low,
      'approval.created': AgentActionRiskLevel.Medium,
      'contact.confirmed': AgentActionRiskLevel.Medium,
      'contact.exchange_requested': AgentActionRiskLevel.High,
      'intro.sent': AgentActionRiskLevel.High,
    };
    const metadata = {
      recommendationId: session.id,
      targetUserId: session.targetUserId,
      action,
      status,
      requiresOwnerConfirmation: extra.requiresOwnerConfirmation ?? false,
      approvalId: extra.approvalId ?? null,
      conversationId: extra.conversationId ?? null,
      messageId: extra.messageId ?? null,
      ...(extra.payload ?? {}),
    };
    const task = await this.createActionTask({
      ownerUserId,
      action,
      session,
      status,
      metadata,
      riskLevel: riskMap[action],
      requiresOwnerConfirmation: extra.requiresOwnerConfirmation ?? false,
      contentPreview: extra.contentPreview ?? action,
    });

    try {
      await this.actionLog.logAgentAction({
        ownerUserId,
        agentId: task?.agentConnectionId ?? null,
        agentTaskId: task?.id ?? null,
        actionType: actionTypeMap[action],
        actionStatus:
          action === 'approval.created'
            ? AgentActionStatus.PendingApproval
            : AgentActionStatus.Executed,
        riskLevel: riskMap[action],
        targetUserId: session.targetUserId,
        relatedCandidateId: session.id,
        inputSummary: `profile.match action=${action}`,
        outputSummary: extra.contentPreview ?? action,
        payload: metadata,
      });
    } catch {
      /* never block main flow */
    }

    try {
      const connections = await this.connectionRepo.find({
        where: { userId: ownerUserId, status: ConnectionStatus.Active },
        take: 20,
      });
      for (const conn of connections) {
        try {
          await this.messages.createAgentInboxEvent({
            agentConnectionId: conn.id,
            ownerUserId,
            eventType: action,
            contentPreview:
              extra.contentPreview ?? `${action}:${session.id}`,
            dedupeKey: `${conn.id}:${action}:${session.id}:${Date.now()}`,
            metadata,
          });
        } catch {
          /* one inbox failure must not block others */
        }
        void this.webhooks
          .emitToConnection(conn.id, action, metadata)
          .catch(() => undefined);
      }
    } catch {
      /* never block main flow */
    }
  }

  async runOnce(
    ownerUserId: number,
    limit = 8,
    options: ProfileMatchRunOptions = {},
  ) {
    let ownerProfile = await this.socialProfileRepo.findOne({
      where: { userId: ownerUserId },
    });
    if (!ownerProfile) {
      throw new BadRequestException(
        'Please complete your AI profile before running profile matches.',
      );
    }
    if (!this.isProfilePoolEnabled(ownerProfile)) {
      if (
        options.autoEnableProfilePool !== true ||
        !this.hasMatchableProfileSignals(ownerProfile)
      ) {
        throw new BadRequestException(
          'Please enable AI continuous recommendations before running profile matches.',
        );
      }
      ownerProfile.profileDiscoverable = true;
      ownerProfile.agentCanRecommendMe = true;
      ownerProfile.agentCanStartChatAfterApproval = true;
      ownerProfile = await this.socialProfileRepo.save(ownerProfile);
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
    const filteredTargetIds = filtered.map((profile) => profile.userId);
    const existing = filteredTargetIds.length
      ? await this.sessionRepo.find({
          where: {
            ownerId: ownerUserId,
            source: PROFILE_MATCH_SOURCE,
            targetUserId: In(filteredTargetIds),
          },
        })
      : [];
    const alreadyRecommended = new Set(
      existing.map((session) => session.targetUserId),
    );
    const skippedDuplicates = filtered.filter((profile) =>
      alreadyRecommended.has(profile.userId),
    ).length;
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
    let inboxEvents = 0;
    for (const item of ranked) {
      const reasonerInput = this.buildReasonerInput(
        owner,
        item.profile,
        item.score,
      );
      const aiScore = await this.reasoner.adjustScore(
        reasonerInput,
        item.score.score,
      );
      const reasoner = await this.reasoner.explain({
        ...reasonerInput,
        scoreBreakdown: {
          ...(reasonerInput.scoreBreakdown ?? {}),
          score: aiScore.score,
        },
      });
      const transcriptWithReasoner = [
        ...item.score.transcript,
        {
          speaker: 'ai_score_second_pass',
          text: JSON.stringify({
            baseScore: item.score.score,
            score: aiScore.score,
            confidence: aiScore.confidence,
            source: aiScore.source,
            publicReason: aiScore.publicReason,
            privateReason: aiScore.privateReason,
            riskWarnings: aiScore.riskWarnings,
          }),
        },
        ...this.reasonerToTranscript(reasoner),
      ];
      const session = await this.sessionRepo.save(
        this.sessionRepo.create({
          ownerId: ownerUserId,
          targetUserId: item.profile.userId,
          score: aiScore.score,
          status: 'review',
          initiatedBy: options.initiatedBy ?? 'profile_match_autopilot',
          source: PROFILE_MATCH_SOURCE,
          summary:
            aiScore.publicReason || reasoner.publicReason || item.score.summary,
          reasons: item.score.reasons,
          transcript: transcriptWithReasoner,
        }),
      );
      const recommendation = this.toRecommendation(
        session,
        item.profile,
        item.user as User,
        reasoner,
      );
      recommendations.push(recommendation);
      inboxEvents += await this.emitRecommendation(ownerUserId, recommendation);
    }

    return {
      ok: true,
      matchedCount: recommendations.length,
      inboxEvents,
      skippedDuplicates,
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

  async ignore(
    ownerUserId: number,
    aiMatchSessionId: number,
    options: { ownerConfirmed?: boolean } = {},
  ) {
    const session = await this.getOwnedProfileMatchSession(
      ownerUserId,
      aiMatchSessionId,
    );
    session.status = 'rejected';
    const saved = await this.sessionRepo.save(session);
    await this.logAndDispatch(
      'recommendation.ignored',
      ownerUserId,
      saved,
      'ignored',
      {
        requiresOwnerConfirmation: false,
        contentPreview: `recommendation ${saved.id} ignored`,
        payload: { ownerConfirmed: options.ownerConfirmed ?? true },
      },
    );
    return {
      ok: true,
      status: saved.status,
      action: 'recommendation.ignored',
      recommendation: await this.toRecommendationFromSession(saved),
    };
  }

  async favorite(
    ownerUserId: number,
    aiMatchSessionId: number,
    options: { ownerConfirmed?: boolean } = {},
  ) {
    const session = await this.getOwnedProfileMatchSession(
      ownerUserId,
      aiMatchSessionId,
    );
    session.status = 'approved';
    const saved = await this.sessionRepo.save(session);
    await this.logAndDispatch(
      'recommendation.saved',
      ownerUserId,
      saved,
      'saved',
      {
        requiresOwnerConfirmation: false,
        contentPreview: `recommendation ${saved.id} saved`,
        payload: { ownerConfirmed: options.ownerConfirmed ?? true },
      },
    );
    return {
      ok: true,
      status: saved.status,
      action: 'recommendation.saved',
      recommendation: await this.toRecommendationFromSession(saved),
    };
  }

  async draftOpener(
    ownerUserId: number,
    aiMatchSessionId: number,
    tone = 'friendly',
  ) {
    const session = await this.getOwnedProfileMatchSession(
      ownerUserId,
      aiMatchSessionId,
    );
    const recommendation = await this.toRecommendationFromSession(session);
    const reasonerOpener = recommendation.reasoner?.suggestedOpener;
    const tags = recommendation.safeProfile.publicTags.slice(0, 2).join('、');
    const reason = recommendation.publicReasons[0] || recommendation.summary;
    const content = this.sanitizePublicText(
      reasonerOpener && reasonerOpener.length > 0
        ? reasonerOpener
        : `你好 ${recommendation.safeProfile.name}，看到我们${tags ? `都关注 ${tags}` : '有一些共同兴趣'}，感觉可以从轻松聊天开始。${reason} 如果你也愿意，我们可以先在 FitMeet 里聊聊近期的运动或社交计划。`,
    );

    await this.logAndDispatch(
      'opener.drafted',
      ownerUserId,
      session,
      'drafted',
      {
        requiresOwnerConfirmation: true,
        contentPreview: content.slice(0, 200),
        payload: { tone, draftLength: content.length },
      },
    );

    return {
      ok: true,
      aiMatchSessionId: session.id,
      targetUserId: session.targetUserId,
      draft: {
        type: 'message',
        tone,
        content,
      },
      requiresOwnerConfirmation: true,
      nextAction: 'owner_may_confirm_send_message',
    };
  }

  async confirmContact(
    ownerUserId: number,
    aiMatchSessionId: number,
    note?: string,
    options: { ownerConfirmed?: boolean } = {},
  ) {
    const session = await this.getOwnedProfileMatchSession(
      ownerUserId,
      aiMatchSessionId,
    );
    if (session.targetUserId === ownerUserId) {
      throw new BadRequestException('Cannot request contact with yourself');
    }

    const blocked = await this.safety.getMutualBlockUserIds(ownerUserId);
    if (blocked.has(session.targetUserId)) {
      throw new ForbiddenException('Contact is blocked by safety settings');
    }
    if (options.ownerConfirmed !== true) {
      throw new BadRequestException('Owner confirmation is required before requesting contact');
    }

    const existing = await this.contactRepo.findOne({
      where: {
        requesterId: ownerUserId,
        targetUserId: session.targetUserId,
        status: ContactRequestStatus.Pending,
      },
    });
    if (existing) {
      await this.logAndDispatch(
        'contact.confirmed',
        ownerUserId,
        session,
        'pending_target_consent',
        {
          requiresOwnerConfirmation: false,
          contentPreview: `existing contact request ${existing.id}`,
          payload: { contactRequestId: existing.id, duplicate: true },
        },
      );
      return {
        ok: true,
        status: 'pending_target_consent',
        contactRequestId: existing.id,
        duplicate: true,
      };
    }

    const connection = await this.connectionRepo.findOne({
      where: { userId: ownerUserId, status: ConnectionStatus.Active },
      order: { createdAt: 'DESC' },
    });
    const contact = await this.contactRepo.save(
      this.contactRepo.create({
        requesterId: ownerUserId,
        targetUserId: session.targetUserId,
        agentConnectionId: connection?.id ?? null,
        note: this.sanitizePublicText(note ?? ''),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );
    session.status = 'approved';
    session.contactCardSent = true;
    session.contactedAt = new Date();
    await this.sessionRepo.save(session);

    await this.notifyContactRequestReceived({
      contactRequestId: contact.id,
      requesterId: ownerUserId,
      targetUserId: session.targetUserId,
      note: contact.note ?? '',
    });

    await this.logAndDispatch(
      'contact.confirmed',
      ownerUserId,
      session,
      'pending_target_consent',
      {
        requiresOwnerConfirmation: false,
        contentPreview: `contact request ${contact.id}`,
        payload: { contactRequestId: contact.id },
      },
    );

    return {
      ok: true,
      status: 'pending_target_consent',
      contactRequestId: contact.id,
      targetUserId: session.targetUserId,
      requiresTargetConsent: true,
    };
  }

  async requestContactExchange(
    ownerUserId: number,
    aiMatchSessionId: number,
    body: { note?: string; ownerConfirmed?: boolean } = {},
  ) {
    const session = await this.getOwnedProfileMatchSession(
      ownerUserId,
      aiMatchSessionId,
    );
    if (session.targetUserId === ownerUserId) {
      throw new BadRequestException('Cannot exchange contact with yourself');
    }

    return this.confirmContact(ownerUserId, aiMatchSessionId, body.note, {
      ownerConfirmed: body.ownerConfirmed === true,
    });
  }

  private async notifyContactRequestReceived(input: {
    contactRequestId: number;
    requesterId: number;
    targetUserId: number;
    note?: string;
  }) {
    const notificationRequester = await this.userRepo.findOne({
      where: { id: input.requesterId },
    });
    await this.safeNotify({
      userId: input.targetUserId,
      type: 'contact_request.received',
      text: `${notificationRequester?.name ?? 'FitMeet 用户'} 想添加你为好友，请确认是否同意。`,
      fromUserId: input.requesterId,
      fromUsername: notificationRequester?.name ?? 'FitMeet 用户',
      fromAvatar: notificationRequester?.avatar ?? 'F',
      fromColor: notificationRequester?.color ?? '#FF6A00',
      targetId: input.contactRequestId,
    });

    const targetConnections =
      (await this.connectionRepo.find({
        where: { userId: input.targetUserId, status: ConnectionStatus.Active },
        take: 20,
      })) ?? [];
    if (!targetConnections.length) return;

    const requester = await this.userRepo.findOne({
      where: { id: input.requesterId },
    });
    const contentPreview = `${requester?.name ?? 'FitMeet 用户'} 想添加你为好友`;
    const metadata = {
      contactRequestId: input.contactRequestId,
      requesterId: input.requesterId,
      requester: requester
        ? {
            id: requester.id,
            name: requester.name,
            avatar: requester.avatar,
            color: requester.color,
            city: requester.city,
            verified: requester.verified,
          }
        : { id: input.requesterId },
      contentPreview,
      notePreview: this.previewText(input.note ?? ''),
      nextAction: 'ask_owner_whether_to_accept_friend_request',
    };

    for (const conn of targetConnections) {
      await this.messages.createAgentInboxEvent({
        agentConnectionId: conn.id,
        ownerUserId: input.targetUserId,
        eventType: 'contact.request.received',
        requestId: input.contactRequestId,
        fromUserId: input.requesterId,
        contentPreview,
        dedupeKey: `${conn.id}:contact.request.received:${input.contactRequestId}`,
        metadata,
      });
      void this.webhooks
        .emitToConnection(conn.id, 'contact.request.received', metadata)
        .catch(() => undefined);
    }
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
      /* notification failures must not break matching */
    }
  }

  async sendIntro(
    ownerUserId: number,
    aiMatchSessionId: number,
    body: { ownerConfirmed?: boolean; text?: string } = {},
  ) {
    const session = await this.getOwnedProfileMatchSession(
      ownerUserId,
      aiMatchSessionId,
    );
    if (session.targetUserId === ownerUserId) {
      throw new BadRequestException('Cannot send intro to yourself');
    }

    const blocked = await this.safety.getMutualBlockUserIds(ownerUserId);
    if (blocked.has(session.targetUserId)) {
      throw new ForbiddenException('Contact is blocked by safety settings');
    }

    const text = this.sanitizePublicText(body.text ?? '').trim();
    if (!text) {
      throw new BadRequestException('Intro text is required');
    }
    if (body.ownerConfirmed !== true) {
      throw new BadRequestException('Owner confirmation is required before sending an intro');
    }

    const connection = await this.connectionRepo.findOne({
      where: { userId: ownerUserId, status: ConnectionStatus.Active },
      order: { createdAt: 'DESC' },
    });

    let conversationId: string | null = null;
    let messageId: string | null = null;
    try {
      const conv = await this.messages.startConversation(
        ownerUserId,
        session.targetUserId,
        {
          agentConnectionId: connection?.id ?? null,
          ownerUserId,
          actorUserId: ownerUserId,
          metadata: {
            source: 'profile_match.send_intro',
            recommendationId: session.id,
          },
        },
      );
      conversationId = conv.conversationId;
      const msg = await this.messages.sendMessage(
        conversationId,
        ownerUserId,
        text,
        {
          agentConnectionId: connection?.id ?? null,
          ownerUserId,
          actorUserId: ownerUserId,
          senderType: 'user',
          metadata: {
            source: 'profile_match.send_intro',
            recommendationId: session.id,
          },
        },
      );
      messageId =
        (msg as { _id?: { toString(): string }; id?: string })._id?.toString() ??
        (msg as { id?: string }).id ??
        null;
    } catch (err) {
      await this.logAndDispatch(
        'intro.sent',
        ownerUserId,
        session,
        'failed',
        {
          requiresOwnerConfirmation: false,
          contentPreview: 'intro.sent failed',
          payload: { error: (err as Error).message },
        },
      );
      throw err;
    }

    session.status = 'approved';
    session.contactedAt = new Date();
    await this.sessionRepo.save(session);

    await this.logAndDispatch(
      'intro.sent',
      ownerUserId,
      session,
      'sent',
      {
        requiresOwnerConfirmation: false,
        conversationId,
        messageId,
        contentPreview: text.slice(0, 200),
      },
    );

    return {
      ok: true,
      status: 'sent',
      conversationId,
      messageId,
      requiresOwnerConfirmation: false,
    };
  }

  private async emitRecommendation(
    ownerUserId: number,
    recommendation: ProfileRecommendation,
  ): Promise<number> {
    const connections = await this.connectionRepo.find({
      where: { userId: ownerUserId, status: ConnectionStatus.Active },
      take: 20,
    });
    let inboxEvents = 0;
    const deliveryConnections = connections.length
      ? connections
      : [
          {
            id: 0,
            userId: ownerUserId,
            status: ConnectionStatus.Active,
            agentName: 'fitmeet_autopilot',
            agentDisplayName: 'FitMeet Autopilot',
          } as AgentConnection,
        ];
    for (const conn of deliveryConnections) {
      const metadata = {
        aiMatchSessionId: recommendation.aiMatchSessionId,
        targetUserId: recommendation.targetUserId,
        candidateUserId: recommendation.candidateUserId,
        source: recommendation.source,
        score: recommendation.score,
        scoreBreakdown: recommendation.scoreBreakdown,
        matchedSignals: recommendation.matchedSignals,
        publicReason: recommendation.publicReason,
        privateReason: recommendation.privateReason,
        riskWarning: recommendation.riskWarning,
        suggestedOpener: recommendation.suggestedOpener,
        reasons: recommendation.reasons,
        publicReasons: recommendation.publicReasons,
        privateReasonAvailable: recommendation.privateReasonAvailable,
        riskTips: recommendation.riskTips,
        nextStepSuggestions: recommendation.nextStepSuggestions,
        safetySummary: recommendation.safetySummary,
        safeProfile: recommendation.safeProfile,
        nextAction: recommendation.nextAction,
        reasoner: recommendation.reasoner ?? null,
      };
      const task = await this.createActionTask({
        ownerUserId,
        action: 'profile.match.recommended',
        sessionId: recommendation.aiMatchSessionId,
        targetUserId: recommendation.targetUserId,
        status: 'pending_owner_confirmation',
        metadata: { ...metadata, requiresOwnerConfirmation: true },
        riskLevel: AgentActionRiskLevel.Medium,
        requiresOwnerConfirmation: true,
        contentPreview: recommendation.summary,
      });
      try {
        await this.actionLog.logAgentAction({
          ownerUserId,
          agentId: task?.agentConnectionId ?? null,
          agentTaskId: task?.id ?? null,
          eventType: 'profile.match.recommended',
          actionType: AgentActionType.AgentEvent,
          actionStatus: AgentActionStatus.PendingApproval,
          riskLevel: AgentActionRiskLevel.Medium,
          targetUserId: recommendation.targetUserId,
          relatedCandidateId: recommendation.aiMatchSessionId,
          inputSummary: 'profile.match.recommended',
          outputSummary: recommendation.summary,
          payload: {
            ...metadata,
            requiresOwnerConfirmation: true,
          },
        });
      } catch {
        /* recommendation audit must not block matching */
      }
      await this.messages.createAgentInboxEvent({
        agentConnectionId: conn.id,
        ownerUserId,
        eventType: 'profile.match.recommended',
        contentPreview: recommendation.summary,
        dedupeKey: `${conn.id}:profile.match.recommended:${recommendation.aiMatchSessionId}`,
        metadata,
      });
      inboxEvents += 1;
      if (conn.id > 0) {
        void this.webhooks.emitToConnection(
          conn.id,
          'profile.match.recommended',
          metadata,
        );
      }
    }
    return inboxEvents;
  }

  private async createActionTask(input: {
    ownerUserId: number;
    action: string;
    status: string;
    metadata: Record<string, unknown>;
    riskLevel: AgentActionRiskLevel;
    requiresOwnerConfirmation: boolean;
    contentPreview: string;
    session?: AiMatchSession;
    sessionId?: number;
    targetUserId?: number;
  }): Promise<AgentTask | null> {
    try {
      const connection = await this.connectionRepo.findOne({
        where: { userId: input.ownerUserId, status: ConnectionStatus.Active },
        order: { createdAt: 'DESC' },
      });
      const sessionId = input.session?.id ?? input.sessionId ?? null;
      const targetUserId = input.session?.targetUserId ?? input.targetUserId ?? null;
      const taskStatus = this.taskStatusForAction(input.action, input.status, input.requiresOwnerConfirmation);
      const task = await this.taskRepo.save(
        this.taskRepo.create({
          ownerUserId: input.ownerUserId,
          agentConnectionId: connection?.id ?? null,
          taskType: 'profile_match_action',
          title: `Profile match ${input.action}`,
          goal: 'Review and execute a profile-match recommendation action through owner confirmation.',
          input: {
            source: 'profile_match',
            action: input.action,
            recommendationId: sessionId,
            targetUserId,
            requiresOwnerConfirmation: input.requiresOwnerConfirmation,
          },
          plan: [],
          toolCalls: [],
          result: {
            action: input.action,
            status: input.status,
            contentPreview: input.contentPreview,
          },
          memory: { metadata: input.metadata },
          status: taskStatus,
          permissionMode: AgentTaskPermissionMode.Confirm,
          riskLevel: this.toTaskRiskLevel(input.riskLevel),
          idempotencyKey: null,
        }),
      );

      await this.writeTaskEvent(task, AgentTaskEventType.TaskCreated, '已创建画像推荐动作任务', input.metadata);
      if (input.requiresOwnerConfirmation) {
        await this.writeTaskEvent(
          task,
          AgentTaskEventType.ConfirmationRequested,
          '等待用户确认画像推荐动作',
          input.metadata,
        );
      } else if (this.isOutboundAction(input.action)) {
        await this.writeTaskEvent(
          task,
          AgentTaskEventType.ConfirmationReceived,
          '用户已确认画像推荐出站动作',
          input.metadata,
          AgentTaskEventActor.User,
        );
      }
      await this.writeTaskEvent(
        task,
        AgentTaskEventType.ToolReturned,
        `画像推荐动作状态：${input.status}`,
        input.metadata,
      );
      if (task.status === AgentTaskStatus.Succeeded) {
        await this.writeTaskEvent(
          task,
          AgentTaskEventType.TaskSucceeded,
          '画像推荐动作已完成',
          input.metadata,
        );
      }

      return task;
    } catch {
      return null;
    }
  }

  private async writeTaskEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown>,
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ) {
    await this.taskEventRepo.save(
      this.taskEventRepo.create({
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        eventType,
        actor,
        summary: this.sanitizePublicText(summary),
        payload,
      }),
    );
  }

  private taskStatusForAction(
    action: string,
    status: string,
    requiresOwnerConfirmation: boolean,
  ): AgentTaskStatus {
    if (requiresOwnerConfirmation) return AgentTaskStatus.AwaitingConfirmation;
    if (status.includes('pending_target_consent')) return AgentTaskStatus.AwaitingFeedback;
    if (status.includes('failed')) return AgentTaskStatus.Failed;
    if (this.isOutboundAction(action)) return AgentTaskStatus.WaitingResult;
    return AgentTaskStatus.Succeeded;
  }

  private isOutboundAction(action: string) {
    return ['contact.confirmed', 'contact.exchange_requested', 'intro.sent'].includes(action);
  }

  private toTaskRiskLevel(risk: AgentActionRiskLevel): AgentTaskRiskLevel {
    if (risk === AgentActionRiskLevel.High) return AgentTaskRiskLevel.High;
    if (risk === AgentActionRiskLevel.Medium) return AgentTaskRiskLevel.Medium;
    return AgentTaskRiskLevel.Low;
  }

  private toRecommendation(
    session: AiMatchSession,
    profile: UserSocialProfile,
    user: User,
    reasoner?: MatchReasonerOutput,
  ): ProfileRecommendation {
    const resolvedReasoner =
      reasoner ?? this.extractReasonerFromTranscript(session);
    const publicReasons = (session.transcript ?? [])
      .filter((item) => item.speaker === 'public_reason')
      .map((item) => item.text);
    const privateReasons = (session.transcript ?? [])
      .filter((item) => item.speaker === 'private_reason')
      .map((item) => item.text);
    if (resolvedReasoner) {
      if (resolvedReasoner.publicReason) publicReasons.unshift(resolvedReasoner.publicReason);
      if (resolvedReasoner.privateReason) privateReasons.unshift(resolvedReasoner.privateReason);
    }
    const riskTips = (session.transcript ?? [])
      .filter((item) => item.speaker === 'risk_tip')
      .map((item) => item.text);
    const nextStepSuggestions = (session.transcript ?? [])
      .filter((item) => item.speaker === 'next_step')
      .map((item) => item.text);
    if (resolvedReasoner?.riskWarnings?.length) {
      riskTips.unshift(...resolvedReasoner.riskWarnings);
    }
    if (resolvedReasoner?.nextAction) {
      nextStepSuggestions.unshift(resolvedReasoner.nextAction);
    }
    const safePublicTags = this.publicTags(profile).slice(0, 8);
    const publicReason = this.sanitizePublicText(
      resolvedReasoner?.publicReason || publicReasons[0] || session.summary,
    );
    const privateReason = resolvedReasoner?.privateReason
      ? this.sanitizePublicText(resolvedReasoner.privateReason)
      : privateReasons.length
        ? '命中了仅本人和授权 Agent 可见的私密偏好，具体标签不会公开展示。'
        : '';
    const riskWarning = this.sanitizePublicText(riskTips.join(' '));
    const suggestedOpener = this.sanitizePublicText(
      resolvedReasoner?.suggestedOpener || '',
    );
    return {
      aiMatchSessionId: session.id,
      targetUserId: session.targetUserId,
      candidateUserId: session.targetUserId,
      source: PROFILE_MATCH_SOURCE,
      score: session.score,
      scoreBreakdown: this.extractScoreBreakdown(session),
      status: session.status,
      summary: publicReason || session.summary,
      reasons: session.reasons ?? [],
      matchedSignals: safePublicTags,
      publicReason,
      privateReason,
      riskWarning,
      suggestedOpener,
      publicReasons,
      privateReasons: [],
      privateReasonAvailable: privateReasons.length > 0,
      riskTips,
      nextStepSuggestions,
      safetySummary:
        'Only public profile signals are shown. Contact requires owner action and target consent.',
      safeProfile: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        city: profile.city || user.city || '',
        publicTags: safePublicTags,
        summary: this.sanitizePublicText(profile.aiSummary || user.bio || ''),
      },
      nextAction: 'owner_confirmation_required',
      createdAt: session.createdAt,
      reasoner: resolvedReasoner ?? undefined,
    };
  }

  private buildReasonerInput(
    owner: UserSocialProfile,
    candidate: UserSocialProfile,
    score: { score: number; reasons: string[]; summary: string },
  ) {
    const ownerPub = this.publicTags(owner);
    const candPub = this.publicTags(candidate);
    const shared = this.overlapExpanded(ownerPub, candPub);
    const candSignals = (candidate.matchSignals ??
      {}) as ProfileMatchSignals;
    const candDecisions = candidate.sensitiveTagDecisions ?? {};
    const confirmedSensitive = (candSignals.sensitivePrivateTags ?? []).filter(
      (tag) => candDecisions[tag]?.status === 'confirmed',
    );
    const safetySignals: string[] = [];
    if (candidate.privacyBoundary)
      safetySignals.push('candidate set privacy boundary');
    if (owner.privacyBoundary) safetySignals.push('owner set privacy boundary');
    return {
      ownerProfile: owner,
      candidateProfile: candidate,
      matchSignals: candSignals,
      publicTags: { owner: ownerPub, candidate: candPub, shared },
      privatePreferenceSignals: this.privateTags(owner),
      confirmedSensitiveTags: confirmedSensitive,
      avoidSignals: candidate.avoidTraits ?? [],
      safetySignals,
      scoreBreakdown: {
        score: score.score,
        cityMatch: Boolean(
          owner.city &&
            candidate.city &&
            owner.city.trim() === candidate.city.trim(),
        ),
        mbtiMatch: Boolean(
          owner.mbti && candidate.mbti && owner.mbti === candidate.mbti,
        ),
        zodiacMatch: Boolean(
          owner.zodiac && candidate.zodiac && owner.zodiac === candidate.zodiac,
        ),
        traitOverlap: this.overlapExpanded(owner.traits ?? [], candidate.traits ?? []),
        privateOverlap: this.overlapExpanded(
          this.privateTags(owner),
          [...candPub, ...this.privateTags(candidate)],
        ),
      },
    };
  }

  private reasonerToTranscript(reasoner: MatchReasonerOutput) {
    return [
      { speaker: 'reasoner', text: JSON.stringify(reasoner) },
    ];
  }

  private extractReasonerFromTranscript(
    session: AiMatchSession,
  ): MatchReasonerOutput | undefined {
    const entry = (session.transcript ?? []).find(
      (item) => item.speaker === 'reasoner',
    );
    if (!entry) return undefined;
    try {
      return JSON.parse(entry.text) as MatchReasonerOutput;
    } catch {
      return undefined;
    }
  }

  private extractScoreBreakdown(session: AiMatchSession): Record<string, number> {
    const fallback = { score: session.score };
    const entry = (session.transcript ?? []).find(
      (item) => item.speaker === 'ai_score_second_pass',
    );
    if (!entry) return fallback;
    try {
      const parsed = JSON.parse(entry.text) as {
        baseScore?: number;
        score?: number;
        confidence?: number;
      };
      return {
        profileRuleScore:
          typeof parsed.baseScore === 'number' ? parsed.baseScore : session.score,
        aiSecondPass:
          typeof parsed.score === 'number' && typeof parsed.baseScore === 'number'
            ? parsed.score - parsed.baseScore
            : 0,
        aiConfidence:
          typeof parsed.confidence === 'number'
            ? Math.round(parsed.confidence * 100)
            : 0,
        score: session.score,
      };
    } catch {
      return fallback;
    }
  }

  private scoreProfilePair(owner: UserSocialProfile, candidate: UserSocialProfile) {
    const ownerPublic = this.publicTags(owner);
    const candidatePublic = this.publicTags(candidate);
    const ownerPrivate = this.privateTags(owner);
    const candidatePrivate = this.privateTags(candidate);
    const scored = this.compatibility.scoreProfilePair({
      ownerPublicTags: ownerPublic,
      candidatePublicTags: candidatePublic,
      ownerPrivateTags: ownerPrivate,
      candidatePrivateTags: candidatePrivate,
      ownerTraits: owner.traits ?? [],
      candidateTraits: candidate.traits ?? [],
      ownerScenes: [...(owner.fitnessGoals ?? []), ...(owner.socialScenes ?? [])],
      candidateScenes: [
        ...(candidate.fitnessGoals ?? []),
        ...(candidate.socialScenes ?? []),
      ],
      ownerCity: owner.city,
      candidateCity: candidate.city,
      ownerNearbyArea: owner.nearbyArea,
      candidateNearbyArea: candidate.nearbyArea,
      ownerMbti: owner.mbti,
      candidateMbti: candidate.mbti,
      ownerZodiac: owner.zodiac,
      candidateZodiac: candidate.zodiac,
      ownerPrivacyBoundary: owner.privacyBoundary,
      candidateAvoidTraits: candidate.avoidTraits ?? [],
      candidateAgentCanRecommendMe: candidate.agentCanRecommendMe,
    });

    return {
      score: scored.score,
      reasons: scored.publicReasons.slice(0, 6),
      summary: this.sanitizePublicText(
        scored.publicReasons[0] ??
          'Profile signals suggest this person is worth owner review before contact.',
      ),
      transcript: [
        ...scored.publicReasons.map((text) => ({ speaker: 'public_reason', text })),
        ...scored.privateReasons.map((text) => ({ speaker: 'private_reason', text })),
        ...scored.riskTips.map((text) => ({
          speaker: 'risk_tip',
          text,
        })),
        { speaker: 'next_step', text: 'Review the safe profile before taking any outbound action.' },
        { speaker: 'next_step', text: 'Use draft opener or confirm contact only after owner confirmation.' },
      ],
    };
  }

  private async getOwnedProfileMatchSession(
    ownerUserId: number,
    aiMatchSessionId: number,
  ) {
    const session = await this.sessionRepo.findOne({
      where: {
        id: aiMatchSessionId,
        ownerId: ownerUserId,
        source: PROFILE_MATCH_SOURCE,
      },
    });
    if (!session) throw new NotFoundException('Profile recommendation not found');
    return session;
  }

  private async toRecommendationFromSession(session: AiMatchSession) {
    const [profile, user] = await Promise.all([
      this.socialProfileRepo.findOne({ where: { userId: session.targetUserId } }),
      this.userRepo.findOne({ where: { id: session.targetUserId } }),
    ]);
    if (!profile || !user) {
      throw new NotFoundException('Recommended profile is no longer available');
    }
    return this.toRecommendation(session, profile, user);
  }

  private isProfilePoolEnabled(profile: UserSocialProfile | null) {
    return Boolean(
      profile && (profile.profileDiscoverable || profile.agentCanRecommendMe),
    );
  }

  private hasMatchableProfileSignals(profile: UserSocialProfile) {
    const signals = (profile.matchSignals ?? {}) as ProfileMatchSignals;
    const tags = [
      ...(profile.traits ?? []),
      ...(profile.fitnessGoals ?? []),
      ...(profile.interestTags ?? []),
      ...(profile.lifestyleTags ?? []),
      ...(profile.socialScenes ?? []),
      ...(profile.wantToMeet ?? []),
      ...(profile.preferredTraits ?? []),
      ...(signals.publicTags ?? []),
      ...(signals.privatePreferenceTags ?? []),
      ...(signals.matchKeywords ?? []),
    ].filter(Boolean);
    return Boolean(
      profile.aiSummary ||
        tags.length >= 2 ||
        Object.keys(profile.aiProfileCard ?? {}).length > 0 ||
        profile.city ||
        profile.socialPreference,
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
    const confirmedSensitive = (signals.sensitivePrivateTags ?? []).filter((tag) =>
      this.isConfirmedMatchOnlySensitiveTag(profile, tag),
    );
    return this.cleanTags([
      ...(profile.wantToMeet ?? []).filter((tag) => !this.isSensitiveTag(tag)),
      ...(profile.preferredTraits ?? []).filter((tag) => !this.isSensitiveTag(tag)),
      ...(profile.relationshipGoals ?? []).filter((tag) => !this.isSensitiveTag(tag)),
      ...(signals.privatePreferenceTags ?? []).filter(
        (tag) => !this.isSensitiveTag(tag),
      ),
      ...confirmedSensitive,
    ]);
  }

  private isConfirmedMatchOnlySensitiveTag(
    profile: UserSocialProfile,
    tag: string,
  ) {
    const decision = (profile.sensitiveTagDecisions ?? {})[tag] as
      | {
          status?: string;
          source?: string;
          visibility?: string;
          scope?: string;
          use?: string;
        }
      | undefined;
    if (decision?.status !== 'confirmed') return false;
    if (!this.isWealthOrResourceTag(tag)) return true;
    const source = (decision.source ?? '').toLowerCase();
    const scope = (
      decision.scope ??
      decision.visibility ??
      decision.use ??
      ''
    ).toLowerCase();
    return source === 'self_declared' && scope === 'match_only';
  }

  private isWealthOrResourceTag(tag: string) {
    return /wealth_resource|rich|wealth|money|income|salary|resource|resources|asset|net.?worth|有钱|富|财富|收入|高薪|资源|资产|高消费/i.test(
      tag,
    );
  }

  private buildRiskTips(
    owner: UserSocialProfile,
    candidate: UserSocialProfile,
  ): string[] {
    const tips = [
      candidate.avoidTraits?.length
        ? 'Candidate has stated avoid rules; keep the first interaction low-pressure.'
        : '',
      owner.privacyBoundary
        ? 'Owner privacy boundaries must be respected before any intro or contact exchange.'
        : '',
      owner.city && candidate.city && owner.city !== candidate.city
        ? 'Cities differ; avoid suggesting offline plans until both sides confirm logistics.'
        : '',
    ].filter(Boolean);
    return tips.length ? tips.slice(0, 3) : ['No high-risk signal detected in public profile data.'];
  }

  private sanitizePublicText(text: string): string {
    return (text ?? '')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted]')
      .replace(/(?:\+?\d[\d\s-]{6,}\d)/g, '[redacted]')
      .replace(/(微信|wechat|手机号|电话|身份证|住址|地址|单位|公司|学校|收入|年薪|月薪)[:：]?\s*[^，。；;\n]{2,}/gi, '$1已隐藏')
      .slice(0, 500);
  }

  private previewText(text: string, max = 160): string {
    const normalized = this.sanitizePublicText(text).replace(/\s+/g, ' ').trim();
    return normalized.length > max
      ? `${normalized.slice(0, Math.max(0, max - 3))}...`
      : normalized;
  }

  private overlap(a: string[], b: string[]) {
    const bSet = new Set(b.map((item) => this.normalizeTag(item)));
    return this.cleanTags(a).filter((item) => bSet.has(this.normalizeTag(item)));
  }

  private overlapExpanded(a: string[], b: string[]) {
    const bSet = new Set(
      this.cleanTags(b).flatMap((item) => this.expandMatchTag(item)),
    );
    return this.cleanTags(a).filter((item) =>
      this.expandMatchTag(item).some((tag) => bSet.has(tag)),
    );
  }

  private cleanTags(tags: string[]) {
    return Array.from(
      new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    ).slice(0, 40);
  }

  private normalizeTag(tag: string) {
    return tag.trim().toLowerCase();
  }

  private expandMatchTag(tag: string) {
    const normalized = this.normalizeTag(tag);
    if (!normalized) return [];
    const tags = new Set([normalized]);
    if (
      /(wealth_resource|rich|wealth|money|income|salary|resource|resources|asset|net.?worth)/i.test(
        normalized,
      )
    ) {
      tags.add('wealth_resource');
    }
    if (
      /(business_builder|founder|entrepreneur|startup|business|ceo)/i.test(
        normalized,
      )
    ) {
      tags.add('business_builder');
    }
    if (
      /(status_signal|high.?status|elite|vip)/i.test(
        normalized,
      )
    ) {
      tags.add('status_signal');
    }
    return Array.from(tags);
  }

  private isSensitiveTag(tag: string) {
    if (/wealth_resource|status_signal/i.test(tag)) return true;
    return /rich|money|wealth|income|salary|handsome|beautiful|good-looking|resources|status|有钱|富|收入|高薪|颜值|帅|美|资源|身份/i.test(
      tag,
    );
  }
}
