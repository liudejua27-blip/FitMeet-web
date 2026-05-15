import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Conversation } from './conversation.schema';
import { Message, MessageCard, MessageParticipantType, MessageSource } from './message.schema';
import {
  AgentInboxEvent,
  AgentInboxEventType,
} from './agent-inbox-event.schema';
import { User } from '../users/user.entity';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import {
  ActionResult,
  AgentActivityLog,
  LoggedAction,
} from '../agent-gateway/entities/agent-activity-log.entity';
import {
  AgentActionLog,
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from '../agent-gateway/entities/agent-action-log.entity';

type SendMessageOptions = {
  source?: MessageSource;
  card?: MessageCard;
  metadata?: Record<string, unknown>;
  senderType?: MessageParticipantType;
  receiverType?: MessageParticipantType;
  senderAgentId?: number | null;
  receiverAgentId?: number | null;
  agentConnectionId?: number | null;
  ownerUserId?: number | null;
  actorUserId?: number | null;
};

type AgentInboxOptions = {
  limit?: number;
  unreadOnly?: boolean;
};

type StartConversationOptions = {
  agentConnectionId?: number | null;
  ownerUserId?: number | null;
  actorUserId?: number | null;
  metadata?: Record<string, unknown>;
};

type AgentInboxEventInput = {
  agentConnectionId: number;
  ownerUserId: number;
  eventType: AgentInboxEventType | string;
  conversationId?: string | Types.ObjectId | null;
  messageId?: string | Types.ObjectId | null;
  requestId?: number | null;
  candidateRecordId?: number | null;
  fromUserId?: number | null;
  contentPreview?: string;
  unread?: boolean;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
};

type AgentWebhookPayload = {
  event: string;
  event_id: string;
  created_at: string;
  user_id: number;
  agent_connection_id: number;
  data: Record<string, unknown>;
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly convModel: Model<Conversation>,
    @InjectModel(Message.name)
    private readonly msgModel: Model<Message>,
    @InjectModel(AgentInboxEvent.name)
    private readonly inboxEventModel: Model<AgentInboxEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(AgentActivityLog)
    private readonly activityLogRepo: Repository<AgentActivityLog>,
    @InjectRepository(AgentActionLog)
    private readonly actionLogRepo: Repository<AgentActionLog>,
  ) {}

  async getConversations(userId: number) {
    const conversations = await this.convModel
      .find({ participantIds: userId })
      .sort({ lastMessageTime: -1 })
      .lean()
      .exec();

    const allUserIds = [
      ...new Set(conversations.flatMap((c) => c.participantIds)),
    ];
    const users = await this.userRepo.find({ where: { id: In(allUserIds) } });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return conversations.map((conv) => {
      const otherId = conv.participantIds.find((id) => id !== userId) ?? userId;
      const other = userMap.get(otherId);
      return {
        id: conv._id.toString(),
        userId: otherId,
        username: other?.name || '未知用户',
        avatar: other?.avatar || '?',
        color: other?.color || '#38BDF8',
        lastMessage: conv.lastMessage || '',
        time: this.formatTime(conv.lastMessageTime),
        unread: conv.unreadCount?.[String(userId)] || 0,
        online: true,
      };
    });
  }

  async getMessages(conversationId: string, userId: number) {
    const oid = new Types.ObjectId(conversationId);

    await this.convModel.updateOne(
      { _id: oid, participantIds: userId },
      { $set: { [`unreadCount.${userId}`]: 0 } },
    );

    const messages = await this.msgModel
      .find({ conversationId: oid })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return messages.map((message) => ({
      id: message._id.toString(),
      text: message.text,
      source: message.source ?? 'user',
      card: message.card ?? null,
      time: new Date(message.createdAt as Date | string).toLocaleTimeString(
        'zh-CN',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      ),
      isMine: message.senderId === userId,
    }));
  }

  async sendMessage(
    conversationId: string,
    senderId: number,
    text: string,
    options: SendMessageOptions = {},
  ) {
    const oid = new Types.ObjectId(conversationId);
    const conv = await this.convModel.findById(oid);
    if (!conv || !conv.participantIds.includes(Number(senderId))) {
      throw new NotFoundException('会话不存在');
    }

    const agentConnectionId =
      options.agentConnectionId ?? conv.agentConnectionId ?? null;
    const ownerUserId =
      options.ownerUserId ?? conv.ownerUserId ?? conv.actorUserId ?? null;
    const actorUserId = options.actorUserId ?? conv.actorUserId ?? ownerUserId;
    const metadata = this.withAgentMetadata(options.metadata, {
      agentConnectionId,
      ownerUserId,
      actorUserId,
      source:
        typeof options.metadata?.source === 'string'
          ? String(options.metadata.source)
          : agentConnectionId
            ? 'openclaw'
            : undefined,
    });
    const senderType = options.senderType ?? 'user';
    const receiverAgentId =
      options.receiverAgentId ??
      (agentConnectionId && senderType === 'user' ? agentConnectionId : null);
    const shouldSyncAgentInbox =
      agentConnectionId != null &&
      senderType !== 'agent' &&
      Number(senderId) !== Number(ownerUserId);

    const msg = await this.msgModel.create({
      conversationId: oid,
      agentConnectionId,
      ownerUserId,
      actorUserId,
      senderId: Number(senderId),
      text,
      source: options.source ?? 'user',
      card: options.card ?? null,
      metadata,
      senderType,
      receiverType: options.receiverType ?? 'user',
      senderAgentId: options.senderAgentId ?? null,
      receiverAgentId,
    });

    const otherId = conv.participantIds.find((id) => id !== Number(senderId));
    const update: Record<string, unknown> = {
      lastMessage: text,
      lastMessageTime: new Date(),
    };

    const inc: Record<string, number> = {};
    if (otherId) inc[`unreadCount.${otherId}`] = 1;
    if (receiverAgentId && !shouldSyncAgentInbox) {
      inc[`unreadAgentCount.${receiverAgentId}`] = 1;
    }
    if (shouldSyncAgentInbox) {
      inc[`unreadAgentCount.${agentConnectionId}`] =
        (inc[`unreadAgentCount.${agentConnectionId}`] ?? 0) + 1;
    }
    await this.convModel.updateOne(
      { _id: oid },
      Object.keys(inc).length > 0 ? { $set: update, $inc: inc } : { $set: update },
    );

    if (senderType === 'agent' && agentConnectionId && ownerUserId) {
      await this.logAgentActivityEvent({
        agentConnectionId,
        ownerUserId,
        eventType: 'message.created',
        conversationId: conv._id.toString(),
        messageId: msg._id.toString(),
        status: 'success',
        metadata: {
          senderId,
          preview: this.preview(text),
          messageSource: options.source ?? 'user',
        },
      });
    }

    if (shouldSyncAgentInbox && ownerUserId) {
      const unreadCount =
        (conv.unreadAgentCount?.[String(agentConnectionId)] ?? 0) +
        (inc[`unreadAgentCount.${agentConnectionId}`] ?? 0);
      try {
        await this.syncIncomingAgentMessage({
          agentConnectionId,
          ownerUserId,
          conversationId: conv._id.toString(),
          messageId: msg._id.toString(),
          fromUserId: Number(senderId),
          text,
          unreadCount,
        });
      } catch (err) {
        this.logger.warn(
          `agent inbox sync failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      id: msg._id.toString(),
      text: msg.text,
      source: msg.source ?? 'user',
      card: msg.card ?? null,
      senderId,
      senderType,
      senderAgentId: msg.senderAgentId ?? null,
      receiverType: msg.receiverType ?? 'user',
      receiverAgentId: msg.receiverAgentId ?? null,
      agentConnectionId,
      conversationId: conv._id.toString(),
      time: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isMine: true,
    };
  }

  async startConversation(
    userId: number,
    otherUserId: number,
    options: StartConversationOptions = {},
  ) {
    const existing = await this.convModel.findOne({
      participantIds: { $all: [userId, otherUserId] },
    });

    if (existing) {
      if (options.agentConnectionId) {
        await this.bindAgentConversation(existing._id, options);
      }
      return { conversationId: existing._id.toString(), preexisting: true };
    }

    const metadata = this.withAgentMetadata(options.metadata, {
      agentConnectionId: options.agentConnectionId ?? null,
      ownerUserId: options.ownerUserId ?? null,
      actorUserId: options.actorUserId ?? options.ownerUserId ?? null,
      source: options.agentConnectionId ? 'openclaw' : undefined,
    });
    const conv = await this.convModel.create({
      participantIds: [userId, otherUserId],
      participantAgentIds: options.agentConnectionId
        ? [options.agentConnectionId]
        : [],
      agentConnectionId: options.agentConnectionId ?? null,
      ownerUserId: options.ownerUserId ?? null,
      actorUserId: options.actorUserId ?? options.ownerUserId ?? null,
      metadata,
      lastMessage: '',
      lastMessageTime: new Date(),
      unreadCount: { [String(userId)]: 0, [String(otherUserId)]: 0 },
      unreadAgentCount: options.agentConnectionId
        ? { [String(options.agentConnectionId)]: 0 }
        : {},
    });

    return { conversationId: conv._id.toString(), preexisting: false };
  }

  async startAgentConversation(userId: number, agentId: number) {
    const existing = await this.convModel.findOne({
      participantIds: userId,
      participantAgentIds: agentId,
    });

    if (existing) {
      await this.bindAgentConversation(existing._id, {
        agentConnectionId: agentId,
        ownerUserId: userId,
        actorUserId: userId,
        metadata: { source: 'agent' },
      });
      return { conversationId: existing._id.toString(), preexisting: true };
    }

    const conv = await this.convModel.create({
      participantIds: [userId],
      participantAgentIds: [agentId],
      agentConnectionId: agentId,
      ownerUserId: userId,
      actorUserId: userId,
      metadata: {
        source: 'agent',
        agentConnectionId: agentId,
        ownerUserId: userId,
      },
      lastMessage: '',
      lastMessageTime: new Date(),
      unreadCount: { [String(userId)]: 0 },
      unreadAgentCount: { [String(agentId)]: 0 },
    });

    return { conversationId: conv._id.toString(), preexisting: false };
  }

  async getAgentInboxConversations(
    agentId: number,
    options: AgentInboxOptions = {},
  ) {
    const limit = this.normalizeLimit(options.limit, 50, 100);
    const messageConversationIds = await this.msgModel
      .distinct('conversationId', {
        $or: [
          { agentConnectionId: agentId },
          { senderAgentId: agentId },
          { receiverAgentId: agentId },
        ],
      })
      .exec();
    const conversationIds = messageConversationIds.map(
      (id) => new Types.ObjectId(String(id)),
    );

    const conversations = await this.convModel
      .find({
        $or: [
          { agentConnectionId: agentId },
          { participantAgentIds: agentId },
          ...(conversationIds.length > 0 ? [{ _id: { $in: conversationIds } }] : []),
        ],
      })
      .sort({ lastMessageTime: -1 })
      .limit(limit)
      .lean()
      .exec();

    const convIds = conversations.map((conv) => conv._id);
    const agentMessages = convIds.length
      ? await this.msgModel
          .find(
            {
              conversationId: { $in: convIds },
              $or: [
                { agentConnectionId: agentId },
                { senderAgentId: { $ne: null } },
                { receiverAgentId: { $ne: null } },
              ],
            },
            { conversationId: 1, senderAgentId: 1, receiverAgentId: 1 },
          )
          .lean()
          .exec()
      : [];

    const agentsByConversation = new Map<string, Set<number>>();
    for (const message of agentMessages) {
      const key = String(message.conversationId);
      const set = agentsByConversation.get(key) ?? new Set<number>();
      if (message.senderAgentId) set.add(message.senderAgentId);
      if (message.receiverAgentId) set.add(message.receiverAgentId);
      agentsByConversation.set(key, set);
    }

    const allUserIds = [
      ...new Set(conversations.flatMap((conv) => conv.participantIds ?? [])),
    ];
    const allAgentIds = [
      ...new Set(
        conversations.flatMap((conv) => [
          ...(conv.participantAgentIds ?? []),
          ...Array.from(agentsByConversation.get(String(conv._id)) ?? []),
        ]),
      ),
    ];
    const users = allUserIds.length
      ? await this.userRepo.find({ where: { id: In(allUserIds) } })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    return conversations
      .map((conv) => {
        const convAgentIds = [
          ...new Set([
            ...(conv.participantAgentIds ?? []),
            ...Array.from(agentsByConversation.get(String(conv._id)) ?? []),
          ]),
        ];
        const unread = conv.unreadAgentCount?.[String(agentId)] || 0;
        return {
          id: String(conv._id),
          conversationId: String(conv._id),
          agentConnectionId: conv.agentConnectionId ?? agentId,
          ownerUserId: conv.ownerUserId ?? null,
          actorUserId: conv.actorUserId ?? null,
          source:
            typeof conv.metadata?.source === 'string'
              ? conv.metadata.source
              : conv.agentConnectionId
                ? 'openclaw'
                : 'agent',
          participantUserIds: conv.participantIds ?? [],
          participantAgentIds: convAgentIds,
          users: (conv.participantIds ?? []).map((id) => {
            const user = userMap.get(id);
            return {
              id,
              name: user?.name ?? `用户 #${id}`,
              avatar: user?.avatar ?? '?',
              color: user?.color ?? '#38BDF8',
            };
          }),
          agents: convAgentIds.map((id) => {
            return {
              id,
              name: `Agent #${id}`,
              provider: null,
              agentType: 'agent_connection',
            };
          }),
          lastMessage: conv.lastMessage || '',
          lastMessageTime: conv.lastMessageTime ?? null,
          time: this.formatTime(conv.lastMessageTime),
          unread,
        };
      })
      .filter((conv) => !options.unreadOnly || conv.unread > 0);
  }

  async getAgentInboxMessages(
    conversationId: string,
    agentId: number,
    options: { limit?: number } = {},
  ) {
    const oid = new Types.ObjectId(conversationId);
    await this.assertAgentConversationAccess(oid, agentId);
    await this.convModel.updateOne(
      { _id: oid },
      { $set: { [`unreadAgentCount.${agentId}`]: 0 } },
    );
    await this.inboxEventModel.updateMany(
      { agentConnectionId: agentId, conversationId: oid },
      { $set: { unread: false } },
    );

    const limit = this.normalizeLimit(options.limit, 50, 200);
    const messages = await this.msgModel
      .find({ conversationId: oid })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return messages.reverse().map((message) => ({
      id: String(message._id),
      conversationId,
      text: message.text,
      source: message.source ?? 'user',
      card: message.card ?? null,
      metadata: message.metadata ?? null,
      agentConnectionId: message.agentConnectionId ?? null,
      ownerUserId: message.ownerUserId ?? null,
      actorUserId: message.actorUserId ?? null,
      senderType: message.senderType ?? 'user',
      receiverType: message.receiverType ?? 'user',
      senderId: message.senderId,
      senderAgentId: message.senderAgentId ?? null,
      receiverAgentId: message.receiverAgentId ?? null,
      isMine: message.senderType === 'agent' && message.senderAgentId === agentId,
      createdAt: message.createdAt,
      time: new Date(message.createdAt as Date | string).toLocaleTimeString(
        'zh-CN',
        { hour: '2-digit', minute: '2-digit' },
      ),
    }));
  }

  async sendAgentReply(
    conversationId: string,
    agentId: number,
    text: string,
    options: { ownerUserId?: number | null; metadata?: Record<string, unknown> } = {},
  ) {
    const content = (text ?? '').trim();
    if (!content) throw new BadRequestException('content is required');

    const oid = new Types.ObjectId(conversationId);
    const conv = await this.assertAgentConversationAccess(oid, agentId);
    await this.bindAgentConversation(oid, {
      agentConnectionId: agentId,
      ownerUserId: options.ownerUserId ?? conv.ownerUserId ?? null,
      actorUserId: options.ownerUserId ?? conv.actorUserId ?? null,
      metadata: { source: 'openclaw' },
    });
    const participantIds = conv.participantIds ?? [];
    const recipientUserId =
      options.ownerUserId != null && participantIds.includes(options.ownerUserId)
        ? participantIds.find((id) => id !== options.ownerUserId)
        : participantIds[0];
    if (!recipientUserId) {
      throw new BadRequestException('No user recipient in this conversation');
    }

    const senderId = options.ownerUserId ?? 0;
    const ownerUserId = options.ownerUserId ?? conv.ownerUserId ?? senderId;
    const metadata = this.withAgentMetadata(options.metadata, {
      agentConnectionId: agentId,
      ownerUserId,
      actorUserId: ownerUserId,
      source: 'openclaw',
    });
    const msg = await this.msgModel.create({
      conversationId: oid,
      agentConnectionId: agentId,
      ownerUserId,
      actorUserId: ownerUserId,
      senderId,
      text: content,
      source: 'ai_delegate',
      card: null,
      metadata: {
        ...(metadata ?? {}),
        agentInboxReply: true,
      },
      senderType: 'agent',
      receiverType: 'user',
      senderAgentId: agentId,
      receiverAgentId: null,
    });

    await this.convModel.updateOne(
      { _id: oid },
      {
        $set: { lastMessage: content, lastMessageTime: new Date() },
        $inc: { [`unreadCount.${recipientUserId}`]: 1 },
      },
    );

    await this.logAgentActivityEvent({
      agentConnectionId: agentId,
      ownerUserId,
      eventType: 'agent.reply.sent',
      conversationId,
      messageId: msg._id.toString(),
      status: 'success',
      metadata: {
        recipientUserId,
        preview: this.preview(content),
      },
    });

    return {
      id: msg._id.toString(),
      text: msg.text,
      source: msg.source ?? 'ai_delegate',
      card: msg.card ?? null,
      senderId,
      senderType: 'agent' as const,
      senderAgentId: agentId,
      receiverType: 'user' as const,
      receiverAgentId: null,
      recipientUserId,
      conversationId,
      time: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isMine: true,
    };
  }

  async findConversationBetween(userA: number, userB: number) {
    const conv = await this.convModel
      .findOne({ participantIds: { $all: [userA, userB] } })
      .lean()
      .exec();
    if (!conv) return null;
    return { conversationId: conv._id.toString() };
  }

  async getUnreadCount(userId: number) {
    const conversations = await this.convModel
      .find({ participantIds: userId })
      .lean()
      .exec();

    return {
      unreadCount: conversations.reduce(
        (total, conv) => total + (conv.unreadCount?.[String(userId)] || 0),
        0,
      ),
    };
  }

  async getParticipantIds(conversationId: string): Promise<number[]> {
    const oid = new Types.ObjectId(conversationId);
    const conv = await this.convModel.findById(oid).lean().exec();
    if (!conv) throw new NotFoundException('会话不存在');
    return conv.participantIds;
  }

  async getAgentInboxEvents(
    agentConnectionId: number,
    options: AgentInboxOptions = {},
  ) {
    const limit = this.normalizeLimit(options.limit, 50, 100);
    const query: Record<string, unknown> = { agentConnectionId };
    if (options.unreadOnly) query.unread = true;

    const events = await this.inboxEventModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return events.map((event) => ({
      id: String(event._id),
      event: event.eventType,
      eventType: event.eventType,
      agentConnectionId: event.agentConnectionId,
      ownerUserId: event.ownerUserId,
      conversationId: event.conversationId
        ? String(event.conversationId)
        : null,
      messageId: event.messageId ? String(event.messageId) : null,
      requestId: event.requestId ?? null,
      candidateRecordId: event.candidateRecordId ?? null,
      fromUserId: event.fromUserId ?? null,
      contentPreview: event.contentPreview ?? '',
      unread: Boolean(event.unread),
      metadata: event.metadata ?? {},
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }));
  }

  async createAgentInboxEvent(input: AgentInboxEventInput) {
    const conversationObjectId = input.conversationId
      ? this.toObjectId(input.conversationId)
      : null;
    const messageObjectId = input.messageId
      ? this.toObjectId(input.messageId)
      : null;
    const dedupeKey =
      input.dedupeKey ??
      [
        input.agentConnectionId,
        input.eventType,
        input.messageId ?? input.requestId ?? input.conversationId ?? 'event',
      ].join(':');

    try {
      const event = await this.inboxEventModel
        .findOneAndUpdate(
          { dedupeKey },
          {
            $setOnInsert: {
              agentConnectionId: input.agentConnectionId,
              ownerUserId: input.ownerUserId,
              eventType: input.eventType,
              conversationId: conversationObjectId,
              messageId: messageObjectId,
              requestId: input.requestId ?? null,
              candidateRecordId: input.candidateRecordId ?? null,
              fromUserId: input.fromUserId ?? null,
              contentPreview: input.contentPreview ?? '',
              unread: input.unread ?? true,
              dedupeKey,
              metadata: input.metadata ?? {},
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();

      await this.logAgentActivityEvent({
        agentConnectionId: input.agentConnectionId,
        ownerUserId: input.ownerUserId,
        eventType: input.eventType,
        conversationId: input.conversationId
          ? String(input.conversationId)
          : undefined,
        messageId: input.messageId ? String(input.messageId) : undefined,
        status: 'success',
        metadata: {
          requestId: input.requestId ?? null,
          candidateRecordId: input.candidateRecordId ?? null,
          fromUserId: input.fromUserId ?? null,
          ...(input.metadata ?? {}),
        },
      });

      return event;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return this.inboxEventModel.findOne({ dedupeKey }).lean().exec();
      }
      throw err;
    }
  }

  private async assertAgentConversationAccess(
    conversationId: Types.ObjectId,
    agentId: number,
  ) {
    const conv = await this.convModel.findById(conversationId).lean().exec();
    if (!conv) throw new NotFoundException('会话不存在');
    if (conv.agentConnectionId === agentId) return conv;
    if ((conv.participantAgentIds ?? []).includes(agentId)) return conv;

    const message = await this.msgModel
      .findOne({
        conversationId,
        $or: [
          { agentConnectionId: agentId },
          { senderAgentId: agentId },
          { receiverAgentId: agentId },
        ],
      })
      .lean()
      .exec();
    if (!message) throw new NotFoundException('会话不存在');
    return conv;
  }

  private async bindAgentConversation(
    conversationId: string | Types.ObjectId,
    options: StartConversationOptions,
  ) {
    if (!options.agentConnectionId) return;
    const set: Record<string, unknown> = {
      agentConnectionId: options.agentConnectionId,
      [`metadata.agentConnectionId`]: options.agentConnectionId,
      [`metadata.source`]:
        typeof options.metadata?.source === 'string'
          ? options.metadata.source
          : 'openclaw',
    };
    if (options.ownerUserId != null) {
      set.ownerUserId = options.ownerUserId;
      set[`metadata.ownerUserId`] = options.ownerUserId;
    }
    if (options.actorUserId != null) {
      set.actorUserId = options.actorUserId;
      set[`metadata.actorUserId`] = options.actorUserId;
    }
    for (const [key, value] of Object.entries(options.metadata ?? {})) {
      set[`metadata.${key}`] = value;
    }
    await this.convModel.updateOne(
      { _id: this.toObjectId(conversationId) },
      {
        $set: set,
        $addToSet: { participantAgentIds: options.agentConnectionId },
      },
    );
  }

  private async syncIncomingAgentMessage(input: {
    agentConnectionId: number;
    ownerUserId: number;
    conversationId: string;
    messageId: string;
    fromUserId: number;
    text: string;
    unreadCount: number;
  }) {
    const contentPreview = this.preview(input.text);
    const data = {
      conversationId: input.conversationId,
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      contentPreview,
      unreadCount: input.unreadCount,
    };

    await this.createAgentInboxEvent({
      agentConnectionId: input.agentConnectionId,
      ownerUserId: input.ownerUserId,
      eventType: 'message.received',
      conversationId: input.conversationId,
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      contentPreview,
      dedupeKey: `${input.agentConnectionId}:message.received:${input.messageId}`,
      metadata: data,
    });
    await this.createAgentInboxEvent({
      agentConnectionId: input.agentConnectionId,
      ownerUserId: input.ownerUserId,
      eventType: 'agent.inbox.updated',
      conversationId: input.conversationId,
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      contentPreview,
      dedupeKey: `${input.agentConnectionId}:agent.inbox.updated:${input.messageId}`,
      metadata: data,
    });

    await this.emitAgentWebhook(input.agentConnectionId, 'message.received', data);
    await this.emitAgentWebhook(
      input.agentConnectionId,
      'agent.inbox.updated',
      data,
    );
  }

  private async emitAgentWebhook(
    agentConnectionId: number,
    event: string,
    data: Record<string, unknown>,
  ) {
    const conn = await this.connectionRepo.findOne({
      where: { id: agentConnectionId },
    });
    if (!conn?.agentWebhookUrl) {
      await this.logAgentActivityEvent({
        agentConnectionId,
        ownerUserId: conn?.userId ?? 0,
        eventType: 'webhook.skipped',
        status: 'skipped',
        metadata: { event, reason: conn ? 'no_webhook_url' : 'no_connection' },
      });
      return;
    }

    const payload: AgentWebhookPayload = {
      event,
      event_id: `evt_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      user_id: conn.userId,
      agent_connection_id: conn.id,
      data,
    };
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = this.signWebhook(timestamp, body);

    try {
      const response = await fetch(conn.agentWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FitMeet-Event-Id': payload.event_id,
          'X-FitMeet-Event': event,
          'X-FitMeet-Timestamp': timestamp,
          'X-FitMeet-Signature': signature,
        },
        body,
      });
      if (!response.ok) {
        await this.logAgentActivityEvent({
          agentConnectionId,
          ownerUserId: conn.userId,
          eventType: 'webhook.failed',
          status: 'failed',
          metadata: { event, eventId: payload.event_id, status: response.status },
        });
        return;
      }
      await this.logAgentActivityEvent({
        agentConnectionId,
        ownerUserId: conn.userId,
        eventType: 'webhook.delivered',
        status: 'success',
        metadata: { event, eventId: payload.event_id },
      });
    } catch (err) {
      await this.logAgentActivityEvent({
        agentConnectionId,
        ownerUserId: conn.userId,
        eventType: 'webhook.failed',
        status: 'failed',
        metadata: {
          event,
          eventId: payload.event_id,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private async logAgentActivityEvent(input: {
    agentConnectionId: number;
    ownerUserId: number;
    eventType: string;
    conversationId?: string;
    messageId?: string;
    status: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.ownerUserId) return;
    try {
      await this.activityLogRepo.save(
        this.activityLogRepo.create({
          agentConnectionId: input.agentConnectionId,
          userId: input.ownerUserId,
          ownerUserId: input.ownerUserId,
          action: LoggedAction.AgentEvent,
          eventType: input.eventType,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          status: input.status,
          payload: input.metadata ?? {},
          result:
            input.status === 'failed' ? ActionResult.Error : ActionResult.Success,
          riskScore: 0,
          metadata: input.metadata ?? {},
        }),
      );
      await this.actionLogRepo.save(
        this.actionLogRepo.create({
          agentId: input.agentConnectionId,
          ownerUserId: input.ownerUserId,
          actionType: AgentActionType.AgentEvent,
          actionStatus:
            input.status === 'failed'
              ? AgentActionStatus.Failed
              : AgentActionStatus.Executed,
          riskLevel: AgentActionRiskLevel.Low,
          eventType: input.eventType,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          status: input.status,
          inputSummary: input.eventType,
          outputSummary: input.status,
          payload: input.metadata ?? {},
          reason: input.status,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `agent activity event log failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private withAgentMetadata(
    metadata: Record<string, unknown> | undefined,
    values: {
      agentConnectionId?: number | null;
      ownerUserId?: number | null;
      actorUserId?: number | null;
      source?: string;
    },
  ): Record<string, unknown> | null {
    const out: Record<string, unknown> = { ...(metadata ?? {}) };
    if (values.source) out.source = values.source;
    if (values.agentConnectionId != null) {
      out.agentConnectionId = values.agentConnectionId;
    }
    if (values.ownerUserId != null) out.ownerUserId = values.ownerUserId;
    if (values.actorUserId != null) out.actorUserId = values.actorUserId;
    return Object.keys(out).length > 0 ? out : null;
  }

  private preview(text: string): string {
    const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
    return normalized.length > 160
      ? `${normalized.slice(0, 157)}...`
      : normalized;
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }

  private signWebhook(timestamp: string, body: string) {
    const secret =
      process.env.AGENT_WEBHOOK_SIGNING_SECRET ||
      process.env.JWT_SECRET ||
      'fitmeet-dev-webhook-secret';
    return `v1=${crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`;
  }

  private normalizeLimit(
    requested: number | undefined,
    fallback: number,
    max: number,
  ): number {
    const n = Number(requested ?? fallback);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(Math.floor(n), max);
  }

  private formatTime(date?: Date): string {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
    return `${Math.floor(minutes / 1440)}天前`;
  }
}
