import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../users/user.entity';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly convModel: Model<Conversation>,
    @InjectModel(Message.name)
    private readonly msgModel: Model<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly messagesGateway: MessagesGateway,
  ) {}

  /** Get all conversations for a user */
  async getConversations(userId: number) {
    const conversations = await this.convModel
      .find({ participantIds: userId })
      .sort({ lastMessageTime: -1 })
      .lean()
      .exec();

    // Collect all participant user IDs
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
        online: true, // TODO: check with Redis
      };
    });
  }

  /** Get messages for a conversation */
  async getMessages(conversationId: string, userId: number) {
    // Mark messages as read
    const oid = new Types.ObjectId(conversationId);

    // Reset unread
    await this.convModel.updateOne(
      { _id: oid },
      { $set: { [`unreadCount.${userId}`]: 0 } },
    );

    const messages = await this.msgModel
      .find({ conversationId: oid })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    return messages.map((rawMsg) => {
      const m = rawMsg as unknown as Message;
      return {
        id: m._id.toString(),
        text: m.text,
        time: new Date(m.createdAt as Date | string).toLocaleTimeString(
          'zh-CN',
          {
            hour: '2-digit',
            minute: '2-digit',
          },
        ),
        isMine: m.senderId === userId,
      };
    });
  }

  /** Send a message */
  async sendMessage(conversationId: string, senderId: number, text: string) {
    const oid = new Types.ObjectId(conversationId);
    const conv = await this.convModel.findById(oid);
    if (!conv) throw new Error('会话不存在');

    const msg = await this.msgModel.create({
      conversationId: oid,
      senderId: Number(senderId),
      text,
    });

    // Update conversation
    const otherId = conv.participantIds.find((id) => id !== Number(senderId));

    if (otherId) {
      // Notify recipient via WebSocket
      this.messagesGateway.notifyNewMessage(otherId, {
        id: msg._id.toString(),
        text: msg.text,
        senderId,
        conversationId: conv._id.toString(),
        time: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });

      await this.convModel.updateOne(
        { _id: oid },
        {
          lastMessage: text,
          lastMessageTime: new Date(),
          $inc: { [`unreadCount.${otherId}`]: 1 },
        },
      );
    }

    return {
      id: msg._id.toString(),
      text: msg.text,
      time: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isMine: true,
    };
  }

  /** Start or get existing conversation */
  async startConversation(userId: number, otherUserId: number) {
    // Check existing
    const existing = await this.convModel.findOne({
      participantIds: { $all: [userId, otherUserId] },
    });

    if (existing) {
      return { conversationId: existing._id.toString() };
    }

    // Create new
    const conv = await this.convModel.create({
      participantIds: [userId, otherUserId],
      lastMessage: '',
      lastMessageTime: new Date(),
      unreadCount: { [String(userId)]: 0, [String(otherUserId)]: 0 },
    });

    return { conversationId: conv._id.toString() };
  }

  /** Get total unread count */
  async getUnreadCount(userId: number) {
    const conversations = await this.convModel
      .find({ participantIds: userId })
      .lean()
      .exec();

    let total = 0;
    for (const c of conversations) {
      total += c.unreadCount?.[String(userId)] || 0;
    }
    return { unreadCount: total };
  }

  private formatTime(date: Date): string {
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
