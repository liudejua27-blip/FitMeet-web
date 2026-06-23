import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Conversation } from './conversation.schema';
import {
  Message,
  MessageCard,
  MessageParticipantType,
  MessageSource,
} from './message.schema';
import { AgentMessageEvent } from './agent-message-event.schema';
import { User } from '../users/user.entity';
import {
  AgentConnection,
  ConnectionStatus,
  KnownAgent,
} from '../agent-gateway/entities/agent-connection.entity';
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
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import {
  cleanDisplayText,
  isDisplayableText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { redactSensitiveText } from '../common/privacy-redaction.util';
import { RealtimeEventService } from '../realtime/realtime-event.service';

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

type AgentMessageEventOptions = {
  limit?: number;
  unreadOnly?: boolean;
  eventType?: string;
};

type AgentMessageAckResult = {
  ok: true;
  requested: number;
  acknowledged: number;
  eventIds: string[];
};

type StartConversationOptions = {
  agentConnectionId?: number | null;
  ownerUserId?: number | null;
  actorUserId?: number | null;
  metadata?: Record<string, unknown>;
};

type AgentMessageEventInput = {
  agentConnectionId: number;
  ownerUserId: number;
  eventType: string;
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

export type RecentAgentConversationSignal = {
  conversationId: string;
  messageId: string;
  agentConnectionId: number;
  ownerUserId: number;
  fromUserId: number;
  text: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly convModel: Model<Conversation>,
    @InjectModel(Message.name)
    private readonly msgModel: Model<Message>,
    @InjectModel(AgentMessageEvent.name)
    private readonly messageEventModel: Model<AgentMessageEvent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(AgentActivityLog)
    private readonly activityLogRepo: Repository<AgentActivityLog>,
    @InjectRepository(AgentActionLog)
    private readonly actionLogRepo: Repository<AgentActionLog>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(UserSocialRequest)
    private readonly socialRequestRepo: Repository<UserSocialRequest>,
    @Optional()
    private readonly realtime?: RealtimeEventService,
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

    return conversations
      .map((conv) => {
        const otherId = conv.participantIds.find((id) => id !== userId);
        const isAgentOnlyConversation =
          !otherId &&
          (Boolean(conv.agentConnectionId) ||
            (Array.isArray(conv.participantAgentIds) &&
              conv.participantAgentIds.length > 0));
        if (isAgentOnlyConversation) {
          const conversationId = conv._id.toString();
          return {
            id: conversationId,
            conversationId,
            userId: 0,
            username: 'FitMeet Agent',
            avatar: 'AI',
            color: '#22d3ee',
            lastMessage: cleanDisplayText(conv.lastMessage, ''),
            time: this.formatTime(conv.lastMessageTime),
            unread: conv.unreadCount?.[String(userId)] || 0,
            online: true,
          };
        }
        const peerUserId = otherId ?? userId;
        const other = userMap.get(peerUserId);
        const conversationId = conv._id.toString();
        return {
          id: conversationId,
          conversationId,
          userId: peerUserId,
          username: cleanDisplayText(other?.name, '未知用户'),
          avatar: cleanDisplayText(other?.avatar, '?'),
          color: other?.color || '#38BDF8',
          lastMessage: cleanDisplayText(conv.lastMessage, ''),
          time: this.formatTime(conv.lastMessageTime),
          unread: conv.unreadCount?.[String(userId)] || 0,
          online: true,
        };
      })
      .filter((conv) => isDisplayableText(conv.username));
  }

  async getMessages(conversationId: string, userId: number) {
    const oid = this.toConversationObjectId(conversationId);
    const conv = await this.convModel
      .findOne({ _id: oid, participantIds: Number(userId) })
      .lean()
      .exec();

    if (!conv) throw new NotFoundException('会话不存在');

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
      text: this.messageTextForDisplay(message.text),
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
    const content = this.normalizeMessageContent(text);
    if (!content) throw new BadRequestException('消息内容不能为空');

    const oid = this.toConversationObjectId(conversationId);
    const conv = await this.convModel.findById(oid);
    if (!conv || !conv.participantIds.includes(Number(senderId))) {
      throw new NotFoundException('会话不存在');
    }

    const otherId = conv.participantIds.find((id) => id !== Number(senderId));
    const senderType = options.senderType ?? 'user';
    let agentConnectionId =
      options.agentConnectionId ?? conv.agentConnectionId ?? null;
    let ownerUserId =
      options.ownerUserId ?? conv.ownerUserId ?? conv.actorUserId ?? null;
    let actorUserId = options.actorUserId ?? conv.actorUserId ?? ownerUserId;
    if (!agentConnectionId && otherId && senderType !== 'agent') {
      const recipientConnection = await this.connectionRepo.findOne({
        where: {
          userId: otherId,
          agentName: KnownAgent.FitMeetAgent,
          status: ConnectionStatus.Active,
        },
        order: { updatedAt: 'DESC' },
      });
      if (recipientConnection) {
        agentConnectionId = recipientConnection.id;
        ownerUserId = otherId;
        actorUserId = otherId;
        await this.bindAgentConversation(oid, {
          agentConnectionId,
          ownerUserId,
          actorUserId,
          metadata: {
            ...(options.metadata ?? {}),
            source: 'auto_bound_fitmeet_agent_recipient',
          },
        });
      }
    }
    const metadata = this.withAgentMetadata(options.metadata, {
      agentConnectionId,
      ownerUserId,
      actorUserId,
      source:
        typeof options.metadata?.source === 'string'
          ? String(options.metadata.source)
          : agentConnectionId
            ? 'fitmeet_agent'
            : undefined,
    });
    const receiverAgentId =
      options.receiverAgentId ??
      (agentConnectionId && senderType === 'user' ? agentConnectionId : null);
    const shouldSyncAgentMessageEvents =
      agentConnectionId != null &&
      senderType !== 'agent' &&
      Number(senderId) !== Number(ownerUserId);

    let msg: Message;
    try {
      msg = await this.msgModel.create({
        conversationId: oid,
        agentConnectionId,
        ownerUserId,
        actorUserId,
        senderId: Number(senderId),
        text: content,
        source: options.source ?? 'user',
        card: options.card ?? null,
        metadata,
        senderType,
        receiverType: options.receiverType ?? 'user',
        senderAgentId: options.senderAgentId ?? null,
        receiverAgentId,
      });
    } catch (error) {
      this.logMessageSendFailure(error, {
        stage: 'message_create',
        conversationId: conv._id.toString(),
        senderId: Number(senderId),
        senderType,
        agentConnectionId,
        ownerUserId,
        source: options.source ?? 'user',
      });
      throw error;
    }

    const safeText = this.messageTextForDisplay(content);
    const update: Record<string, unknown> = {
      lastMessage: safeText,
      lastMessageTime: new Date(),
    };

    const inc: Record<string, number> = {};
    if (otherId) inc[`unreadCount.${otherId}`] = 1;
    if (receiverAgentId && !shouldSyncAgentMessageEvents) {
      inc[`unreadAgentCount.${receiverAgentId}`] = 1;
    }
    if (shouldSyncAgentMessageEvents) {
      inc[`unreadAgentCount.${agentConnectionId}`] =
        (inc[`unreadAgentCount.${agentConnectionId}`] ?? 0) + 1;
    }
    try {
      await this.convModel.updateOne(
        { _id: oid },
        Object.keys(inc).length > 0
          ? { $set: update, $inc: inc }
          : { $set: update },
      );
    } catch (error) {
      this.logMessageSendFailure(error, {
        stage: 'conversation_update',
        conversationId: conv._id.toString(),
        messageId: msg._id.toString(),
        senderId: Number(senderId),
        senderType,
        agentConnectionId,
        ownerUserId,
        source: options.source ?? 'user',
      });
      throw error;
    }

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
          preview: this.preview(safeText),
          messageSource: options.source ?? 'user',
        },
      });
    }

    if (shouldSyncAgentMessageEvents && ownerUserId && agentConnectionId) {
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
          text: safeText,
          unreadCount,
        });
      } catch (err) {
        this.logger.warn(
          `agent message event sync failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const realtimePayload = {
      id: msg._id.toString(),
      text: this.messageTextForDisplay(msg.text),
      source: msg.source ?? 'user',
      card: msg.card ?? null,
      senderId,
      senderType,
      conversationId: conv._id.toString(),
      time: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    for (const participantId of conv.participantIds.filter(
      (id) => Number(id) !== Number(senderId),
    )) {
      this.realtime?.emitToUser({
        userId: participantId,
        eventType: 'message:new',
        payload: realtimePayload,
        rooms: [`conversation:${conv._id.toString()}`],
        notification: {
          type: 'message',
          text: this.preview(safeText),
          pushPayload: {
            conversationId: conv._id.toString(),
            messageId: msg._id.toString(),
          },
        },
      });
      this.realtime?.emitToUser({
        userId: participantId,
        eventType: 'conversation:updated',
        payload: {
          conversationId: conv._id.toString(),
          lastMessage: safeText,
          updatedAt: new Date().toISOString(),
        },
        rooms: [`conversation:${conv._id.toString()}`],
      });
    }

    return {
      id: msg._id.toString(),
      text: this.messageTextForDisplay(msg.text),
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
    const ownerId = Number(userId);
    const targetId = Number(otherUserId);
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      throw new BadRequestException('当前用户无效');
    }
    if (!Number.isFinite(targetId) || targetId <= 0) {
      throw new BadRequestException('请选择要联系的用户');
    }
    if (ownerId === targetId) {
      throw new BadRequestException('不能给自己发起会话');
    }

    const participantIds = this.directParticipantIds(ownerId, targetId);
    const directKey = this.directConversationKey(ownerId, targetId);
    const existing = await this.convModel.findOne({
      $or: [
        { directKey },
        { participantIds: { $all: participantIds, $size: 2 } },
      ],
    });

    if (existing) {
      if (existing.directKey !== directKey) {
        existing.directKey = directKey;
        existing.participantIds = participantIds;
      }
      if (options.agentConnectionId) {
        await this.bindAgentConversation(existing._id, options);
      }
      if (existing.isModified()) {
        await existing.save();
      }
      return {
        conversationId: existing._id.toString(),
        preexisting: true,
        targetUserId: targetId,
      };
    }

    const metadata = this.withAgentMetadata(options.metadata, {
      agentConnectionId: options.agentConnectionId ?? null,
      ownerUserId: options.ownerUserId ?? null,
      actorUserId: options.actorUserId ?? options.ownerUserId ?? null,
      source: options.agentConnectionId ? 'fitmeet_agent' : undefined,
    });
    const conv = await this.convModel.create({
      directKey,
      participantIds,
      participantAgentIds: options.agentConnectionId
        ? [options.agentConnectionId]
        : [],
      agentConnectionId: options.agentConnectionId ?? null,
      ownerUserId: options.ownerUserId ?? null,
      actorUserId: options.actorUserId ?? options.ownerUserId ?? null,
      metadata,
      lastMessage: '',
      lastMessageTime: new Date(),
      unreadCount: { [String(ownerId)]: 0, [String(targetId)]: 0 },
      unreadAgentCount: options.agentConnectionId
        ? { [String(options.agentConnectionId)]: 0 }
        : {},
    });

    return {
      conversationId: conv._id.toString(),
      preexisting: false,
      targetUserId: targetId,
    };
  }

  async startPublicIntentConversation(
    userId: number,
    publicIntentId: string,
    text?: string,
  ) {
    const intent = await this.publicIntentRepo.findOne({
      where: { id: publicIntentId },
    });
    if (!intent?.userId) {
      throw new NotFoundException('这条大厅内容暂时没有绑定可联系的站内用户');
    }
    if (intent.userId === userId) {
      throw new BadRequestException('不能给自己发布的内容发消息');
    }

    const request = intent.linkedSocialRequestId
      ? await this.socialRequestRepo.findOne({
          where: { id: intent.linkedSocialRequestId },
        })
      : null;
    const agentConnectionId =
      request?.userId === intent.userId ? request.agentId : null;
    const metadata = {
      source: 'public_social_intent',
      publicIntentId: intent.id,
      linkedSocialRequestId: intent.linkedSocialRequestId,
      agentConnectionId,
    };
    const options: StartConversationOptions = agentConnectionId
      ? {
          agentConnectionId,
          ownerUserId: intent.userId,
          actorUserId: intent.userId,
          metadata,
        }
      : { metadata };

    const result = await this.startConversation(userId, intent.userId, options);
    const trimmed = text?.trim();
    const message = trimmed
      ? await this.sendMessage(result.conversationId, userId, trimmed, {
          ...options,
          metadata,
        })
      : null;

    return {
      ...result,
      publicIntentId: intent.id,
      agentConnectionId,
      message,
    };
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

  async getAgentMessageConversations(
    agentId: number,
    options: AgentMessageEventOptions = {},
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
          ...(conversationIds.length > 0
            ? [{ _id: { $in: conversationIds } }]
            : []),
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
                ? 'fitmeet_agent'
                : 'agent',
          participantUserIds: conv.participantIds ?? [],
          participantAgentIds: convAgentIds,
          users: (conv.participantIds ?? []).map((id) => {
            const user = userMap.get(id);
            return {
              id,
              name: cleanDisplayText(user?.name, `用户 #${id}`),
              avatar: cleanDisplayText(user?.avatar, '?'),
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
          lastMessage: cleanDisplayText(conv.lastMessage, ''),
          lastMessageTime: conv.lastMessageTime ?? null,
          time: this.formatTime(conv.lastMessageTime),
          unread,
        };
      })
      .filter((conv) => !options.unreadOnly || conv.unread > 0);
  }

  async getAgentConversationMessages(
    conversationId: string,
    agentId: number,
    options: { limit?: number } = {},
  ) {
    const oid = this.toConversationObjectId(conversationId);
    await this.assertAgentConversationAccess(oid, agentId);
    await this.convModel.updateOne(
      { _id: oid },
      { $set: { [`unreadAgentCount.${agentId}`]: 0 } },
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
      text: this.messageTextForDisplay(message.text),
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
      isMine:
        message.senderType === 'agent' && message.senderAgentId === agentId,
      createdAt: message.createdAt,
      time: new Date(message.createdAt as Date | string).toLocaleTimeString(
        'zh-CN',
        { hour: '2-digit', minute: '2-digit' },
      ),
    }));
  }

  async getTaskConversationMessages(
    taskId: number,
    options: { conversationId?: string | null; limit?: number } = {},
  ) {
    const limit = this.normalizeLimit(options.limit, 50, 200);
    const query: Record<string, unknown> = {
      'metadata.agentTaskId': { $in: [taskId, String(taskId)] },
    };
    let conversationId: string | null = null;
    if (
      options.conversationId &&
      Types.ObjectId.isValid(options.conversationId)
    ) {
      const oid = this.toConversationObjectId(options.conversationId);
      query.conversationId = oid;
      conversationId = options.conversationId;
    }

    const messages = await this.msgModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return messages.reverse().map((message) => ({
      id: String(message._id),
      conversationId: conversationId ?? String(message.conversationId),
      text: this.messageTextForDisplay(message.text),
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
      isMine: message.senderType === 'agent',
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
    options: {
      ownerUserId?: number | null;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    const content = this.normalizeMessageContent(text);
    if (!content) throw new BadRequestException('content is required');

    const oid = this.toConversationObjectId(conversationId);
    const conv = await this.assertAgentConversationAccess(oid, agentId);
    await this.bindAgentConversation(oid, {
      agentConnectionId: agentId,
      ownerUserId: options.ownerUserId ?? conv.ownerUserId ?? null,
      actorUserId: options.ownerUserId ?? conv.actorUserId ?? null,
      metadata: { source: 'fitmeet_agent' },
    });
    const participantIds = conv.participantIds ?? [];
    const recipientUserId =
      options.ownerUserId != null &&
      participantIds.includes(options.ownerUserId)
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
      source: 'fitmeet_agent',
    });
    let msg: Message;
    try {
      msg = await this.msgModel.create({
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
          agentMessageReply: true,
        },
        senderType: 'agent',
        receiverType: 'user',
        senderAgentId: agentId,
        receiverAgentId: null,
      });
    } catch (error) {
      this.logMessageSendFailure(error, {
        stage: 'agent_reply_create',
        conversationId,
        senderId,
        senderType: 'agent',
        agentConnectionId: agentId,
        ownerUserId,
        source: 'ai_delegate',
      });
      throw error;
    }

    try {
      await this.convModel.updateOne(
        { _id: oid },
        {
          $set: { lastMessage: content, lastMessageTime: new Date() },
          $inc: { [`unreadCount.${recipientUserId}`]: 1 },
        },
      );
    } catch (error) {
      this.logMessageSendFailure(error, {
        stage: 'agent_reply_conversation_update',
        conversationId,
        messageId: msg._id.toString(),
        senderId,
        senderType: 'agent',
        agentConnectionId: agentId,
        ownerUserId,
        source: 'ai_delegate',
      });
      throw error;
    }

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
      text: this.messageTextForDisplay(msg.text),
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
    const directKey = this.directConversationKey(userA, userB);
    const participantIds = this.directParticipantIds(userA, userB);
    const conv = await this.convModel
      .findOne({
        $or: [
          { directKey },
          { participantIds: { $all: participantIds, $size: 2 } },
        ],
      })
      .lean()
      .exec();
    if (!conv) return null;
    return { conversationId: conv._id.toString() };
  }

  private directParticipantIds(userA: number, userB: number): number[] {
    return [Number(userA), Number(userB)].sort((a, b) => a - b);
  }

  private directConversationKey(userA: number, userB: number): string {
    const [minUserId, maxUserId] = this.directParticipantIds(userA, userB);
    return `direct:${minUserId}:${maxUserId}`;
  }

  async getRecentAgentConversationSignals(options: {
    since: Date;
    limit?: number;
    ownerUserId?: number;
  }): Promise<RecentAgentConversationSignal[]> {
    const limit = this.normalizeLimit(options.limit, 50, 200);
    const query: Record<string, unknown> = {
      agentConnectionId: { $ne: null },
      ownerUserId: { $ne: null },
      senderType: { $ne: 'agent' },
      createdAt: { $gte: options.since },
    };
    if (options.ownerUserId != null) query.ownerUserId = options.ownerUserId;

    const messages = await this.msgModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return messages
      .filter((message) => message.agentConnectionId && message.ownerUserId)
      .map((message) => ({
        conversationId: String(message.conversationId),
        messageId: String(message._id),
        agentConnectionId: Number(message.agentConnectionId),
        ownerUserId: Number(message.ownerUserId),
        fromUserId: Number(message.senderId),
        text: this.messageTextForDisplay(message.text),
        metadata: message.metadata ?? null,
        createdAt: message.createdAt,
      }));
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
    const oid = this.toConversationObjectId(conversationId);
    const conv = await this.convModel.findById(oid).lean().exec();
    if (!conv) throw new NotFoundException('会话不存在');
    return conv.participantIds;
  }

  async getAgentMessageEvents(
    agentConnectionId: number,
    options: AgentMessageEventOptions = {},
  ) {
    const limit = this.normalizeLimit(options.limit, 50, 100);
    const query: Record<string, unknown> = { agentConnectionId };
    if (options.unreadOnly) query.unread = true;
    if (options.eventType) query.eventType = options.eventType;

    return this.findAgentMessageEvents(query, limit);
  }

  async getAgentMessageEventsForOwner(
    ownerUserId: number,
    options: AgentMessageEventOptions = {},
  ) {
    const limit = this.normalizeLimit(options.limit, 50, 100);
    const query: Record<string, unknown> = { ownerUserId };
    if (options.unreadOnly) query.unread = true;
    if (options.eventType) query.eventType = options.eventType;

    return this.findAgentMessageEvents(query, limit);
  }

  private async findAgentMessageEvents(
    query: Record<string, unknown>,
    limit: number,
  ) {
    const events = await this.messageEventModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const fromUserIds = [
      ...new Set(
        events
          .map((event) => event.fromUserId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const users = fromUserIds.length
      ? await this.userRepo.find({ where: { id: In(fromUserIds) } })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

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
      fromUser: event.fromUserId
        ? this.toSafeSenderCard(userMap.get(event.fromUserId) ?? null)
        : null,
      contentPreview: cleanDisplayText(event.contentPreview, ''),
      unread: Boolean(event.unread),
      reportText: this.buildAgentReportText(
        event.eventType,
        event.contentPreview ?? '',
        userMap.get(event.fromUserId ?? 0) ?? null,
      ),
      nextAction: this.nextAgentMessageAction(event.eventType),
      metadata: this.safeEventMetadata(event.metadata ?? {}),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }));
  }

  async ackAgentMessageEventsForOwner(
    ownerUserId: number,
    eventIds: string[] = [],
  ): Promise<AgentMessageAckResult> {
    return this.ackAgentMessageEventsByQuery({ ownerUserId }, eventIds);
  }

  async ackAgentMessageEvents(
    agentConnectionId: number,
    eventIds: string[] = [],
  ): Promise<AgentMessageAckResult> {
    return this.ackAgentMessageEventsByQuery({ agentConnectionId }, eventIds);
  }

  private async ackAgentMessageEventsByQuery(
    baseQuery: Record<string, unknown>,
    eventIds: string[] = [],
  ): Promise<AgentMessageAckResult> {
    const normalized = Array.from(
      new Set(eventIds.map((id) => (id ?? '').trim()).filter(Boolean)),
    ).slice(0, 100);
    const ids = normalized.filter((id) => Types.ObjectId.isValid(id));
    const stableIds = normalized.filter((id) => !Types.ObjectId.isValid(id));
    if (normalized.length === 0) {
      return {
        ok: true,
        requested: eventIds.length,
        acknowledged: 0,
        eventIds: [],
      };
    }
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const or: Record<string, unknown>[] = [];
    if (objectIds.length > 0) or.push({ _id: { $in: objectIds } });
    if (stableIds.length > 0) {
      or.push(
        { dedupeKey: { $in: stableIds } },
        { 'metadata.eventId': { $in: stableIds } },
        { 'metadata.messageEventId': { $in: stableIds } },
      );
    }
    const result = await this.messageEventModel
      .updateMany({ ...baseQuery, $or: or }, { $set: { unread: false } })
      .exec();
    return {
      ok: true,
      requested: eventIds.length,
      acknowledged: result.modifiedCount ?? 0,
      eventIds: normalized,
    };
  }

  async createAgentMessageEvent(input: AgentMessageEventInput) {
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
      const event = await this.messageEventModel
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
              contentPreview: cleanDisplayText(input.contentPreview, ''),
              unread: input.unread ?? true,
              dedupeKey,
              metadata: sanitizeForDisplay(input.metadata ?? {}),
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
          ...(sanitizeForDisplay(input.metadata ?? {}) as Record<
            string,
            unknown
          >),
        },
      });

      return event;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return this.messageEventModel.findOne({ dedupeKey }).lean().exec();
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
          : 'fitmeet_agent',
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
    const contentPreview = this.preview(this.messageTextForDisplay(input.text));
    const sender = await this.userRepo.findOne({
      where: { id: input.fromUserId },
    });
    const data = {
      conversationId: input.conversationId,
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      fromUser: this.toSafeSenderCard(sender),
      contentPreview,
      unreadCount: input.unreadCount,
      nextAction: 'report_to_owner_then_wait_for_instruction',
    };

    const receivedEvent = await this.createAgentMessageEvent({
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
    const updatedEvent = await this.createAgentMessageEvent({
      agentConnectionId: input.agentConnectionId,
      ownerUserId: input.ownerUserId,
      eventType: 'agent.message.updated',
      conversationId: input.conversationId,
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      contentPreview,
      dedupeKey: `${input.agentConnectionId}:agent.message.updated:${input.messageId}`,
      metadata: data,
    });
    const receivedEventId = receivedEvent?._id
      ? String(receivedEvent._id)
      : `${input.agentConnectionId}:message.received:${input.messageId}`;
    const updatedEventId = updatedEvent?._id
      ? String(updatedEvent._id)
      : `${input.agentConnectionId}:agent.message.updated:${input.messageId}`;

    await this.emitAgentWebhook(input.agentConnectionId, 'message.received', {
      ...data,
      eventId: receivedEventId,
      messageEventId: receivedEventId,
      ackEventIds: [receivedEventId],
    });
    await this.emitAgentWebhook(
      input.agentConnectionId,
      'agent.message.updated',
      {
        ...data,
        eventId: updatedEventId,
        messageEventId: updatedEventId,
        ackEventIds: [updatedEventId],
      },
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
      event_id: this.stableWebhookEventId(agentConnectionId, event, data),
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
        this.logger.warn(
          JSON.stringify({
            event: 'webhook.failed',
            source: 'messages_service',
            agentConnectionId,
            ownerUserId: conn.userId,
            webhookEvent: event,
            eventId: payload.event_id,
            httpStatus: response.status,
            reason: 'http_error',
          }),
        );
        await this.logAgentActivityEvent({
          agentConnectionId,
          ownerUserId: conn.userId,
          eventType: 'webhook.failed',
          status: 'failed',
          metadata: {
            event,
            eventId: payload.event_id,
            status: response.status,
          },
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
      this.logger.warn(
        JSON.stringify({
          event: 'webhook.failed',
          source: 'messages_service',
          agentConnectionId,
          ownerUserId: conn.userId,
          webhookEvent: event,
          eventId: payload.event_id,
          reason: 'network_error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
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
    agentConnectionId: number | null;
    ownerUserId: number;
    eventType: string;
    conversationId?: string;
    messageId?: string;
    status: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.ownerUserId) return;
    try {
      const agentConnectionId = await this.resolveActivityLogConnectionId(
        input.agentConnectionId,
        input.ownerUserId,
      );
      await this.activityLogRepo.save(
        this.activityLogRepo.create({
          agentConnectionId,
          userId: input.ownerUserId,
          ownerUserId: input.ownerUserId,
          action: LoggedAction.AgentEvent,
          eventType: input.eventType,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          status: input.status,
          payload: sanitizeForDisplay(input.metadata ?? {}) as Record<
            string,
            unknown
          >,
          result:
            input.status === 'failed'
              ? ActionResult.Error
              : ActionResult.Success,
          riskScore: 0,
          metadata: sanitizeForDisplay(input.metadata ?? {}) as Record<
            string,
            unknown
          >,
        }),
      );
      await this.actionLogRepo.save(
        this.actionLogRepo.create({
          agentId: agentConnectionId,
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
          payload: sanitizeForDisplay(input.metadata ?? {}) as Record<
            string,
            unknown
          >,
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

  private async resolveActivityLogConnectionId(
    agentConnectionId: number | null | undefined,
    ownerUserId: number,
  ): Promise<number | null> {
    if (!agentConnectionId) return null;
    const connection = await this.connectionRepo.findOne({
      where: {
        id: agentConnectionId,
        userId: ownerUserId,
      },
      select: ['id'],
    });
    if (!connection) {
      this.logger.log(
        `Skipping stale agentConnectionId=${agentConnectionId} for ownerUserId=${ownerUserId} in agent activity log`,
      );
      return null;
    }
    return connection.id;
  }

  private logMessageSendFailure(
    error: unknown,
    context: {
      stage: string;
      conversationId: string;
      messageId?: string;
      senderId: number;
      senderType: MessageParticipantType;
      agentConnectionId?: number | null;
      ownerUserId?: number | null;
      source?: MessageSource;
    },
  ) {
    this.logger.error(
      JSON.stringify({
        event: 'message.send_failed',
        ...context,
        message: error instanceof Error ? error.message : String(error),
      }),
      error instanceof Error ? error.stack : undefined,
    );
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
    const normalized = cleanDisplayText(text, '内容已隐藏')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length > 160
      ? `${normalized.slice(0, 157)}...`
      : normalized;
  }

  private normalizeMessageContent(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  private messageTextForDisplay(value: unknown): string {
    const content = this.normalizeMessageContent(value);
    return content ? redactSensitiveText(content) : '消息内容已隐藏';
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }

  private toConversationObjectId(
    value: string | Types.ObjectId,
  ): Types.ObjectId {
    if (value instanceof Types.ObjectId) return value;
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid conversation id');
    }
    return new Types.ObjectId(value);
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

  private stableWebhookEventId(
    agentConnectionId: number,
    event: string,
    data: Record<string, unknown>,
  ) {
    const stable =
      data.eventId ??
      data.event_id ??
      data.messageEventId ??
      data.messageId ??
      data.conversationId;
    if (!stable) return `evt_${crypto.randomUUID()}`;
    const digest = crypto
      .createHash('sha256')
      .update(`${agentConnectionId}:${event}:${cleanDisplayText(stable, '')}`)
      .digest('hex')
      .slice(0, 32);
    return `evt_${digest}`;
  }

  private toSafeSenderCard(user: User | null) {
    if (!user) return null;
    return {
      id: user.id,
      name: cleanDisplayText(user.name, 'FitMeet 用户'),
      avatar: cleanDisplayText(user.avatar, '?'),
      color: user.color,
      city: cleanDisplayText(user.city, ''),
      verified: user.verified,
    };
  }

  private buildAgentReportText(
    eventType: string,
    contentPreview: string,
    sender: User | null,
  ) {
    if (eventType === 'message.received') {
      const name = sender?.name ?? 'Someone';
      return `${name} sent a FitMeet message: ${contentPreview}`;
    }
    if (eventType === 'profile.match.recommended') {
      return `FitMeet found a profile recommendation: ${contentPreview}`;
    }
    if (eventType === 'social_request.match.recommended') {
      return `FitMeet found request-card matches: ${contentPreview}`;
    }
    if (eventType === 'contact.request.received') {
      const name = sender?.name ?? 'Someone';
      return `${name} wants to add the owner on FitMeet: ${contentPreview}`;
    }
    if (eventType === 'contact.request.accepted') {
      return `A FitMeet friend request was accepted: ${contentPreview}`;
    }
    if (eventType === 'contact.request.declined') {
      return `A FitMeet friend request was declined: ${contentPreview}`;
    }
    return `${eventType}: ${contentPreview}`;
  }

  private nextAgentMessageAction(eventType: string) {
    if (eventType === 'message.received') {
      return 'report_to_owner_then_read_conversation_if_requested';
    }
    if (eventType === 'profile.match.recommended') {
      return 'show_safe_profile_and_ask_owner_before_contact';
    }
    if (eventType === 'social_request.match.recommended') {
      return 'show_request_card_matches_and_ask_owner_before_invite';
    }
    if (eventType === 'contact.request.received') {
      return 'ask_owner_whether_to_accept_friend_request';
    }
    if (
      eventType === 'contact.request.accepted' ||
      eventType === 'contact.request.declined'
    ) {
      return 'report_contact_request_result_to_owner';
    }
    if (eventType === 'approval.created') {
      return 'ask_owner_for_approval';
    }
    return 'review_event';
  }

  private safeEventMetadata(metadata: Record<string, unknown>) {
    const safe = { ...(metadata ?? {}) };
    delete safe.privateReasons;
    delete safe.privateReason;
    delete safe.rawProfile;
    delete safe.rawText;
    delete safe.sensitivePrivateTags;
    return sanitizeForDisplay(safe) as Record<string, unknown>;
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
