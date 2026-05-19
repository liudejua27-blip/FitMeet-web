import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentProfileService } from './agent-profile.service';
import { AgentActionLogService } from './agent-action-log.service';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';
import {
  AgentProfile,
  AgentProfileStatus,
  AgentType,
  AgentAutonomyLevel,
  AgentProvider,
} from './entities/agent-profile.entity';
import {
  AgentConnection,
  ConnectionStatus,
  KnownAgent,
} from './entities/agent-connection.entity';
import {
  AgentActionLog,
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import { canAutoExecute } from './agent-autonomy.policy';
import { AgentWebhookService } from './agent-webhook.service';

/** Daily cap for agent-to-agent auto messages, by source agent autonomy. */
function dailyA2ACapFor(level: AgentAutonomyLevel): number {
  switch (level) {
    case AgentAutonomyLevel.Open:
      return 100;
    case AgentAutonomyLevel.Normal:
      return 20;
    case AgentAutonomyLevel.Assisted:
    default:
      // Assisted agents cannot auto-send; the user (JWT path) can still
      // manually send messages, which bypass this cap.
      return 0;
  }
}

export interface SearchAgentsOpts {
  q?: string;
  type?: AgentType;
  limit?: number;
}

@Injectable()
export class AgentDiscoveryService {
  private readonly logger = new Logger(AgentDiscoveryService.name);

  constructor(
    private readonly profiles: AgentProfileService,
    private readonly messages: MessagesService,
    private readonly messagesGateway: MessagesGateway,
    private readonly actionLogs: AgentActionLogService,
    private readonly webhooks: AgentWebhookService,
    @InjectRepository(AgentProfile)
    private readonly profileRepo: Repository<AgentProfile>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(AgentActionLog)
    private readonly actionLogRepo: Repository<AgentActionLog>,
  ) {}

  /**
   * GET /api/agents/search — discoverable Active agents, excluding the
   * caller's own agents. Rule 6: blocked / paused agents are filtered.
   */
  async search(requestUserId: number, opts: SearchAgentsOpts) {
    try {
      const rows = await this.profiles.search(requestUserId, opts);
      return rows.map((p) => this.toCard(p));
    } catch (err) {
      this.logger.error(
        `agent search failed for userId=${requestUserId}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      // Never 500 a discovery query — callers expect an array.
      return [];
    }
  }

  /**
   * POST /api/agents/:id/message
   *
   * @param requestUserId   The JWT user invoking the call.
   * @param targetAgentId   AgentProfile id of the receiver.
   * @param dto             { content, fromAgentId? }
   *                          If fromAgentId is supplied AND owned by
   *                          requestUserId, the message is recorded as
   *                          senderType='agent' and subjected to daily
   *                          cap + autonomy gating (rule 5).
   */
  async sendMessageToAgent(
    requestUserId: number,
    targetAgentId: number,
    dto: { content: string; fromAgentId?: number },
  ) {
    const text = (dto.content ?? '').trim();
    if (!text) throw new BadRequestException('content is required');

    // Target — must be a discoverable Active agent (rule 6).
    const target = await this.profiles.getDiscoverable(targetAgentId);
    if (target.ownerUserId === requestUserId) {
      throw new BadRequestException('Cannot message your own agent');
    }

    // Resolve source agent (optional).
    let source: AgentProfile | null = null;
    if (dto.fromAgentId) {
      source = await this.profileRepo.findOne({
        where: { id: dto.fromAgentId },
      });
      if (!source || source.ownerUserId !== requestUserId) {
        throw new ForbiddenException('fromAgentId not owned by caller');
      }
      if (source.status !== AgentProfileStatus.Active) {
        // Rule 6: paused / blocked source cannot auto-send.
        throw new ForbiddenException('Source agent is not active');
      }

      // Rule 7: agent-initiated send_message requires autonomy.
      const allowed = canAutoExecute(
        'send_message',
        source.autonomyLevel,
        'low',
      );
      if (!allowed) {
        await this.actionLogs.logAgentAction({
          ownerUserId: requestUserId,
          agentId: source.agentConnectionId ?? null,
          actionType: AgentActionType.SendMessage,
          actionStatus: AgentActionStatus.PendingApproval,
          riskLevel: AgentActionRiskLevel.Low,
          targetAgentId,
          targetUserId: target.ownerUserId ?? null,
          reason: 'a2a_requires_approval',
          payload: { fromAgentId: source.id, preview: text.slice(0, 80) },
        });
        return {
          status: 'pending_approval' as const,
          reason: 'autonomy_level_requires_approval',
        };
      }

      // Rule 5: daily cap.
      const todayCount = await this.countTodayA2AMessages(requestUserId);
      const cap = dailyA2ACapFor(source.autonomyLevel);
      if (todayCount >= cap) {
        await this.actionLogs.logAgentAction({
          ownerUserId: requestUserId,
          agentId: source.agentConnectionId ?? null,
          actionType: AgentActionType.SendMessage,
          actionStatus: AgentActionStatus.Rejected,
          targetAgentId,
          targetUserId: target.ownerUserId ?? null,
          reason: 'daily_a2a_cap_reached',
          payload: { todayCount, cap },
        });
        return {
          status: 'rate_limited' as const,
          dailyCap: cap,
          todayCount,
        };
      }
    }

    if (target.ownerUserId === null) {
      const targetConnectionId = target.agentConnectionId ?? target.id;
      const sourceConnectionId = source?.agentConnectionId ?? source?.id ?? null;
      const { conversationId } = await this.messages.startAgentConversation(
        requestUserId,
        targetConnectionId,
      );
      const message = await this.messages.sendMessage(
        conversationId,
        requestUserId,
        text,
        {
          source: source ? 'ai_delegate' : 'user',
          senderType: source ? 'agent' : 'user',
          receiverType: 'agent',
          senderAgentId: sourceConnectionId,
          receiverAgentId: targetConnectionId,
          agentConnectionId: targetConnectionId,
          ownerUserId: target.ownerUserId ?? requestUserId,
          actorUserId: requestUserId,
          metadata: {
            source: 'agent',
            a2a: true,
            targetAgentId: target.id,
            targetAgentConnectionId: targetConnectionId,
            targetType: 'agent',
            ...(source
              ? {
                  sourceAgentId: source.id,
                  sourceAgentConnectionId: sourceConnectionId,
                }
              : {}),
          },
        },
      );

      await this.actionLogs.logAgentAction({
        ownerUserId: requestUserId,
        agentId: source?.agentConnectionId ?? null,
        actionType: AgentActionType.SendMessage,
        actionStatus: AgentActionStatus.Executed,
        riskLevel: AgentActionRiskLevel.Low,
        targetAgentId: target.id,
        targetUserId: null,
        payload: {
          fromAgentId: source?.id ?? null,
          conversationId,
          messageId: message.id,
          preview: text.slice(0, 80),
          deliveredTo: 'agent_inbox',
        },
      });

      this.emitInboxMessageWebhooks(target.agentConnectionId, {
        conversationId,
        messageId: message.id,
        targetAgentId: target.id,
        fromUserId: requestUserId,
        fromAgentId: source?.id ?? null,
        preview: text.slice(0, 120),
      });

      return {
        status: 'sent' as const,
        targetType: 'agent' as const,
        conversationId,
        message,
      };
    }

    const targetConnectionId = target.agentConnectionId ?? target.id;
    const sourceConnectionId = source?.agentConnectionId ?? source?.id ?? null;
    const { conversationId } = await this.messages.startConversation(
      requestUserId,
      target.ownerUserId,
      {
        agentConnectionId: targetConnectionId,
        ownerUserId: target.ownerUserId,
        actorUserId: requestUserId,
        metadata: {
          source: 'agent',
          targetAgentId: target.id,
          targetAgentConnectionId: targetConnectionId,
        },
      },
    );
    const message = await this.messages.sendMessage(
      conversationId,
      requestUserId,
      text,
      {
        source: source ? 'ai_delegate' : 'user',
        senderType: source ? 'agent' : 'user',
        receiverType: 'agent',
        senderAgentId: sourceConnectionId,
        receiverAgentId: targetConnectionId,
        agentConnectionId: targetConnectionId,
        ownerUserId: target.ownerUserId,
        actorUserId: requestUserId,
        metadata: {
          source: 'agent',
          a2a: true,
          targetAgentId: target.id,
          targetAgentConnectionId: targetConnectionId,
          ...(source
            ? {
                sourceAgentId: source.id,
                sourceAgentConnectionId: sourceConnectionId,
              }
            : {}),
        },
      },
    );

    // Rule 4: AgentActionLog for every A2A message.
    await this.actionLogs.logAgentAction({
      ownerUserId: requestUserId,
      agentId: source?.agentConnectionId ?? null,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      targetAgentId: target.id,
      targetUserId: target.ownerUserId,
      payload: {
        fromAgentId: source?.id ?? null,
        conversationId,
        messageId: message.id,
        preview: text.slice(0, 80),
      },
    });

    this.emitInboxMessageWebhooks(target.agentConnectionId, {
      conversationId,
      messageId: message.id,
      targetAgentId: target.id,
      fromUserId: requestUserId,
      fromAgentId: source?.id ?? null,
      preview: text.slice(0, 120),
    });

    return {
      status: 'sent' as const,
      targetType: 'user' as const,
      conversationId,
      message,
    };
  }

  private emitInboxMessageWebhooks(
    agentConnectionId: number | null | undefined,
    payload: Record<string, unknown>,
  ) {
    void this.webhooks.emitToConnection(
      agentConnectionId,
      'message.received',
      payload,
    );
    void this.webhooks.emitToConnection(
      agentConnectionId,
      'message.created',
      payload,
    );
    void this.webhooks.emitToConnection(
      agentConnectionId,
      'agent.inbox.updated',
      payload,
    );
  }

  async searchForAgentConnection(conn: AgentConnection, opts: SearchAgentsOpts) {
    return this.search(conn.userId, opts);
  }

  async getAgentDetailForConnection(conn: AgentConnection, agentId: number) {
    return this.profiles.getVisible(conn.userId, agentId);
  }

  async sendMessageToAgentForConnection(
    conn: AgentConnection,
    targetAgentId: number,
    dto: { content: string; fromAgentId?: number },
  ) {
    const source = dto.fromAgentId
      ? await this.assertOwnedSourceAgent(conn.userId, dto.fromAgentId)
      : await this.getConnectionAgentProfile(conn);
    return this.sendMessageToAgent(conn.userId, targetAgentId, {
      content: dto.content,
      fromAgentId: source.id,
    });
  }

  async inviteAgentForConnection(
    conn: AgentConnection,
    targetAgentId: number,
    dto: { fromAgentId?: number; activityId?: number; note?: string },
  ) {
    const source = dto.fromAgentId
      ? await this.assertOwnedSourceAgent(conn.userId, dto.fromAgentId)
      : await this.getConnectionAgentProfile(conn);
    return this.inviteAgent(conn.userId, targetAgentId, {
      ...dto,
      fromAgentId: source.id,
    });
  }

  async listInboxForConnection(
    conn: AgentConnection,
    opts: { limit?: number; unreadOnly?: boolean; eventType?: string } = {},
  ) {
    const [conversations, events] = await Promise.all([
      this.messages.getAgentInboxConversations(conn.id, opts),
      this.messages.getAgentInboxEvents(conn.id, opts),
    ]);
    return {
      agentProfileId: conn.id,
      agentConnectionId: conn.id,
      agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
      conversations,
      events,
    };
  }

  async listInboxEventsForConnection(
    conn: AgentConnection,
    opts: { limit?: number; unreadOnly?: boolean; eventType?: string } = {},
  ) {
    const events = await this.messages.getAgentInboxEvents(conn.id, opts);
    return {
      agentProfileId: conn.id,
      agentConnectionId: conn.id,
      agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
      events,
      total: events.length,
    };
  }

  async recordInboxHeartbeat(
    conn: AgentConnection,
    opts: { limit?: number; unreadOnly?: boolean; eventType?: string } = {},
  ) {
    const now = new Date();
    await this.connectionRepo.update(conn.id, { lastActiveAt: now });
    await this.actionLogRepo.save(
      this.actionLogRepo.create({
        agentId: conn.id,
        ownerUserId: conn.userId,
        actionType: AgentActionType.AgentEvent,
        eventType: 'agent.heartbeat.poll',
        conversationId: null,
        messageId: null,
        status: 'success',
        actionStatus: AgentActionStatus.Executed,
        riskLevel: AgentActionRiskLevel.Low,
        targetUserId: null,
        targetAgentId: null,
        relatedSocialRequestId: null,
        relatedCandidateId: null,
        relatedActivityId: null,
        inputSummary: 'OpenClaw inbox heartbeat poll',
        outputSummary: 'heartbeat recorded',
        payload: {
          source: 'agent_inbox_events',
          limit: opts.limit ?? null,
          unreadOnly: opts.unreadOnly ?? false,
          eventType: opts.eventType ?? null,
        },
        reason: null,
      }),
    );
  }

  async ackInboxEventsForConnection(
    conn: AgentConnection,
    dto: { eventIds?: string[] },
  ) {
    return this.messages.ackAgentInboxEvents(conn.id, dto.eventIds ?? []);
  }

  async listInboxMessagesForConnection(
    conn: AgentConnection,
    conversationId: string,
    opts: { limit?: number } = {},
  ) {
    const messages = await this.messages.getAgentInboxMessages(
      conversationId,
      conn.id,
      opts,
    );
    return {
      agentProfileId: conn.id,
      agentConnectionId: conn.id,
      agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
      conversationId,
      messages,
    };
  }

  async replyToInboxForConnection(
    conn: AgentConnection,
    conversationId: string,
    dto: { content?: string; text?: string },
  ) {
    const content = (dto.content ?? dto.text ?? '').trim();
    if (!content) throw new BadRequestException('content is required');
    const message = await this.messages.sendAgentReply(
      conversationId,
      conn.id,
      content,
      {
        ownerUserId: conn.userId,
        metadata: {
          source: conn.agentName === KnownAgent.OpenClaw ? 'openclaw' : 'agent',
          sourceAgentConnectionId: conn.id,
          agentConnectionId: conn.id,
          ownerUserId: conn.userId,
        },
      },
    );
    const socketPushed = this.messagesGateway.pushNewMessageToUser(
      message.recipientUserId,
      message,
    );

    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: conn.id,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      targetUserId: message.recipientUserId,
      payload: {
        agentProfileId: conn.id,
        agentConnectionId: conn.id,
        conversationId,
        messageId: message.id,
        socketPushed,
        preview: content.slice(0, 80),
      },
      reason: 'agent_inbox_reply',
    });

    return {
      status: 'sent' as const,
      agentProfileId: conn.id,
      agentConnectionId: conn.id,
      agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
      conversationId,
      socketPushed,
      message,
    };
  }

  async listInboxForOwner(
    ownerUserId: number,
    opts: {
      agentProfileId?: number;
      limit?: number;
      unreadOnly?: boolean;
      eventType?: string;
    } = {},
  ) {
    if (!opts.agentProfileId) {
      const conn = await this.connectionRepo.findOne({
        where: {
          userId: ownerUserId,
          agentName: KnownAgent.OpenClaw,
          status: ConnectionStatus.Active,
        },
        order: { updatedAt: 'DESC' },
      });
      if (!conn) {
        return {
          agentProfileId: null,
          agentConnectionId: null,
          agentName: null,
          conversations: [],
          events: [],
          total: 0,
          reason: 'no_active_agent_connection',
        };
      }
      const [conversations, events] = await Promise.all([
        this.messages.getAgentInboxConversations(conn.id, {
          limit: opts.limit,
          unreadOnly: opts.unreadOnly,
        }),
        this.messages.getAgentInboxEvents(conn.id, {
          limit: opts.limit,
          unreadOnly: opts.unreadOnly,
          eventType: opts.eventType,
        }),
      ]);
      const safe = Array.isArray(conversations) ? conversations : [];
      return {
        agentProfileId: conn.id,
        agentConnectionId: conn.id,
        agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
        conversations: safe,
        events,
        total: safe.length,
      };
    }
    let profile: AgentProfile;
    try {
      profile = await this.getOwnedInboxAgent(ownerUserId, opts.agentProfileId);
    } catch (err) {
      this.logger.warn(
        `inbox: no agent profile for owner=${ownerUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        agentProfileId: null,
        agentName: null,
        conversations: [],
        events: [],
        total: 0,
        reason: 'no_agent_profile',
      };
    }
    try {
      const [conversations, events] = await Promise.all([
        this.messages.getAgentInboxConversations(profile.id, {
          limit: opts.limit,
          unreadOnly: opts.unreadOnly,
        }),
        this.messages.getAgentInboxEvents(profile.id, {
          limit: opts.limit,
          unreadOnly: opts.unreadOnly,
          eventType: opts.eventType,
        }),
      ]);
      const safe = Array.isArray(conversations) ? conversations : [];
      return {
        agentProfileId: profile.id,
        agentName: profile.agentName,
        conversations: safe,
        events,
        total: safe.length,
      };
    } catch (err) {
      this.logger.error(
        `inbox: getAgentInboxConversations failed agent=${profile.id}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      return {
        agentProfileId: profile.id,
        agentName: profile.agentName,
        conversations: [],
        events: [],
        total: 0,
        reason: 'inbox_unavailable',
      };
    }
  }

  async listInboxEventsForOwner(
    ownerUserId: number,
    opts: {
      agentProfileId?: number;
      limit?: number;
      unreadOnly?: boolean;
    } = {},
  ) {
    const inbox = await this.listInboxForOwner(ownerUserId, opts);
    return {
      agentProfileId: inbox.agentProfileId,
      agentConnectionId:
        'agentConnectionId' in inbox ? inbox.agentConnectionId : inbox.agentProfileId,
      agentName: inbox.agentName,
      events: inbox.events ?? [],
      total: Array.isArray(inbox.events) ? inbox.events.length : 0,
      reason: 'reason' in inbox ? inbox.reason : undefined,
    };
  }

  async listInboxMessagesForOwner(
    ownerUserId: number,
    conversationId: string,
    opts: { agentProfileId?: number; limit?: number } = {},
  ) {
    if (!opts.agentProfileId) {
      const conn = await this.connectionRepo.findOne({
        where: {
          userId: ownerUserId,
          agentName: KnownAgent.OpenClaw,
          status: ConnectionStatus.Active,
        },
        order: { updatedAt: 'DESC' },
      });
      if (!conn) {
        return {
          agentProfileId: null,
          agentConnectionId: null,
          agentName: null,
          conversationId,
          messages: [],
          reason: 'no_active_agent_connection',
        };
      }
      const messages = await this.messages.getAgentInboxMessages(
        conversationId,
        conn.id,
        { limit: opts.limit },
      );
      return {
        agentProfileId: conn.id,
        agentConnectionId: conn.id,
        agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
        conversationId,
        messages,
      };
    }
    const profile = await this.getOwnedInboxAgent(ownerUserId, opts.agentProfileId);
    const messages = await this.messages.getAgentInboxMessages(
      conversationId,
      profile.id,
      { limit: opts.limit },
    );
    return {
      agentProfileId: profile.id,
      agentName: profile.agentName,
      conversationId,
      messages,
    };
  }

  async replyToInboxForOwner(
    ownerUserId: number,
    conversationId: string,
    dto: { agentProfileId?: number; content?: string; text?: string },
  ) {
    const content = (dto.content ?? dto.text ?? '').trim();
    if (!content) throw new BadRequestException('content is required');
    if (!dto.agentProfileId) {
      const conn = await this.connectionRepo.findOne({
        where: {
          userId: ownerUserId,
          agentName: KnownAgent.OpenClaw,
          status: ConnectionStatus.Active,
        },
        order: { updatedAt: 'DESC' },
      });
      if (!conn) throw new NotFoundException('Agent token not found for this owner');
      const message = await this.messages.sendAgentReply(
        conversationId,
        conn.id,
        content,
        {
          ownerUserId,
          metadata: {
            source: conn.agentName === KnownAgent.OpenClaw ? 'openclaw' : 'agent',
            ownerConsoleReply: true,
            sourceAgentConnectionId: conn.id,
            agentConnectionId: conn.id,
            ownerUserId,
          },
        },
      );
      const socketPushed = this.messagesGateway.pushNewMessageToUser(
        message.recipientUserId,
        message,
      );

      await this.actionLogs.logAgentAction({
        ownerUserId,
        agentId: conn.id,
        actionType: AgentActionType.SendMessage,
        actionStatus: AgentActionStatus.Executed,
        riskLevel: AgentActionRiskLevel.Low,
        targetUserId: message.recipientUserId,
        payload: {
          agentProfileId: conn.id,
          agentConnectionId: conn.id,
          conversationId,
          messageId: message.id,
          socketPushed,
          preview: content.slice(0, 80),
        },
        reason: 'owner_agent_inbox_reply',
      });

      return {
        status: 'sent' as const,
        agentProfileId: conn.id,
        agentConnectionId: conn.id,
        agentName: conn.agentDisplayName || String(conn.agentName || 'OpenClaw'),
        conversationId,
        socketPushed,
        message,
      };
    }
    const profile = await this.getOwnedInboxAgent(ownerUserId, dto.agentProfileId);
    const message = await this.messages.sendAgentReply(
      conversationId,
      profile.id,
      content,
      {
        ownerUserId,
        metadata: { ownerConsoleReply: true },
      },
    );
    const socketPushed = this.messagesGateway.pushNewMessageToUser(
      message.recipientUserId,
      message,
    );

    await this.actionLogs.logAgentAction({
      ownerUserId,
      agentId: profile.agentConnectionId ?? null,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      targetUserId: message.recipientUserId,
      payload: {
        agentProfileId: profile.id,
        conversationId,
        messageId: message.id,
        socketPushed,
        preview: content.slice(0, 80),
      },
      reason: 'owner_agent_inbox_reply',
    });

    return {
      status: 'sent' as const,
      agentProfileId: profile.id,
      agentName: profile.agentName,
      conversationId,
      socketPushed,
      message,
    };
  }

  /**
   * POST /api/agents/:id/invite
   *
   * Records an invite from the caller (optionally acting through their own
   * agent) toward a target agent for a referenced activity. The actual
   * activity-join orchestration is handled elsewhere; this endpoint logs
   * the invite intent and (when an agent is initiating) honors autonomy.
   */
  async inviteAgent(
    requestUserId: number,
    targetAgentId: number,
    dto: { fromAgentId?: number; activityId?: number; note?: string },
  ) {
    const target = await this.profiles.getDiscoverable(targetAgentId);
    if (target.ownerUserId === requestUserId) {
      throw new BadRequestException('Cannot invite your own agent');
    }

    let source: AgentProfile | null = null;
    if (dto.fromAgentId) {
      source = await this.profileRepo.findOne({
        where: { id: dto.fromAgentId },
      });
      if (!source || source.ownerUserId !== requestUserId) {
        throw new ForbiddenException('fromAgentId not owned by caller');
      }
      if (source.status !== AgentProfileStatus.Active) {
        throw new ForbiddenException('Source agent is not active');
      }

      const action = dto.activityId ? 'invite_activity' : 'add_friend';
      const allowed = canAutoExecute(action, source.autonomyLevel, 'low');
      if (!allowed) {
        await this.actionLogs.logAgentAction({
          ownerUserId: requestUserId,
          agentId: source.agentConnectionId ?? null,
          actionType: dto.activityId
            ? AgentActionType.InviteActivity
            : AgentActionType.AddFriend,
          actionStatus: AgentActionStatus.PendingApproval,
          riskLevel: AgentActionRiskLevel.Low,
          targetAgentId,
          targetUserId: target.ownerUserId ?? null,
          relatedActivityId: dto.activityId ?? null,
          reason: 'a2a_invite_requires_approval',
          payload: { fromAgentId: source.id, note: dto.note },
        });
        return {
          status: 'pending_approval' as const,
          reason: 'autonomy_level_requires_approval',
        };
      }
    }

    await this.actionLogs.logAgentAction({
      ownerUserId: requestUserId,
      agentId: source?.agentConnectionId ?? null,
      actionType: dto.activityId
        ? AgentActionType.InviteActivity
        : AgentActionType.AddFriend,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      targetAgentId,
      targetUserId: target.ownerUserId ?? null,
      relatedActivityId: dto.activityId ?? null,
      payload: {
        fromAgentId: source?.id ?? null,
        note: dto.note,
      },
    });

    return { status: 'invited' as const };
  }

  /** Public-facing card with display kind flag for frontend chrome. */
  toCard(p: AgentProfile) {
    return {
      id: p.id,
      agentName: p.agentName ?? `Agent #${p.id}`,
      avatar: p.avatar ?? '',
      bio: p.bio ?? '',
      agentType: p.agentType ?? AgentType.UserAgent,
      provider: p.provider ?? null,
      autonomyLevel: p.autonomyLevel ?? AgentAutonomyLevel.Assisted,
      status: p.status ?? AgentProfileStatus.Active,
      interests: Array.isArray(p.interests) ? p.interests : [],
      goals: Array.isArray(p.goals) ? p.goals : [],
      ownerUserId: p.ownerUserId ?? null,
      lastActiveAt: p.lastActiveAt ?? null,
      targetType: 'agent' as const,
      displayKind: this.displayKind(p),
    };
  }

  private displayKind(p: AgentProfile): string {
    if (p.agentType === AgentType.PlatformAgent) return 'platform_agent';
    if (p.agentType === AgentType.ExternalAgent) return 'external_agent';
    return 'user_agent';
  }

  private async getConnectionAgentProfile(conn: AgentConnection) {
    const byConnection = await this.profileRepo.findOne({
      where: { agentConnectionId: conn.id },
    });
    if (byConnection) return byConnection;

    const byOwner = await this.profileRepo.findOne({
      where: { ownerUserId: conn.userId, status: AgentProfileStatus.Active },
      order: { updatedAt: 'DESC' },
    });
    if (byOwner) return byOwner;
    try {
      const created = await this.profileRepo.save(
        this.profileRepo.create({
          ownerUserId: conn.userId,
          agentConnectionId: conn.id,
          agentName: conn.agentDisplayName || String(conn.agentName || 'Agent'),
          agentType: AgentType.UserAgent,
          provider: this.providerFromConnection(conn),
          autonomyLevel: AgentAutonomyLevel.Normal,
          status: AgentProfileStatus.Active,
          goals: [],
          interests: [],
          preferredTargets: [],
          boundaries: [],
          lastActiveAt: conn.lastActiveAt,
        }),
      );
      this.logger.warn(
        `Recovered missing agent profile for connection=${conn.id}, owner=${conn.userId}`,
      );
      return created;
    } catch (err) {
      this.logger.error(
        `Failed to recover agent profile for connection=${conn.id}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      throw new NotFoundException('Agent profile not found for this token');
    }
  }

  private providerFromConnection(conn: AgentConnection): AgentProvider {
    switch (conn.agentName) {
      case 'openclaw':
        return AgentProvider.OpenClaw;
      case 'codex':
        return AgentProvider.Codex;
      case 'qclaw':
        return AgentProvider.QClaw;
      default:
        return AgentProvider.Custom;
    }
  }

  private async getOwnedInboxAgent(
    ownerUserId: number,
    agentProfileId?: number,
  ) {
    const where = agentProfileId
      ? { id: agentProfileId, ownerUserId }
      : { ownerUserId, status: AgentProfileStatus.Active };
    let profile = await this.profileRepo.findOne({
      where,
      order: { updatedAt: 'DESC' },
    });
    if (!profile && !agentProfileId) {
      const conn = await this.connectionRepo.findOne({
        where: {
          userId: ownerUserId,
          agentName: KnownAgent.OpenClaw,
          status: ConnectionStatus.Active,
        },
        order: { updatedAt: 'DESC' },
      });
      if (conn) {
        profile = await this.getConnectionAgentProfile(conn);
      }
    }
    if (!profile) {
      throw new NotFoundException('Agent profile not found for this owner');
    }
    if (profile.status !== AgentProfileStatus.Active) {
      throw new ForbiddenException('Agent profile is not active');
    }
    return profile;
  }

  private async assertOwnedSourceAgent(ownerUserId: number, agentId: number) {
    const source = await this.profileRepo.findOne({ where: { id: agentId } });
    if (!source || source.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('fromAgentId not owned by caller');
    }
    if (source.status !== AgentProfileStatus.Active) {
      throw new ForbiddenException('Source agent is not active');
    }
    return source;
  }

  private async countTodayA2AMessages(ownerUserId: number): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.actionLogRepo
      .createQueryBuilder('log')
      .where('log.ownerUserId = :uid', { uid: ownerUserId })
      .andWhere('log.actionType = :t', { t: AgentActionType.SendMessage })
      .andWhere('log.actionStatus = :s', { s: AgentActionStatus.Executed })
      .andWhere('log.targetAgentId IS NOT NULL')
      .andWhere('log.createdAt BETWEEN :start AND :end', { start, end })
      .getCount();
  }
}
