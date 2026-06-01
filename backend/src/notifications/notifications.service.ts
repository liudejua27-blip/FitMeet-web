import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './notification.schema';
import { RealtimeEventService } from '../realtime/realtime-event.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifModel: Model<Notification>,
    @Optional()
    private readonly realtime?: RealtimeEventService,
  ) {}

  async findByUser(userId: number) {
    const notifications = await this.notifModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    return notifications.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      username: n.fromUsername,
      avatar: n.fromAvatar,
      color: n.fromColor,
      text: n.text,
      time: this.formatTime((n as { createdAt?: Date }).createdAt),
      read: n.read,
      targetId: n.targetId,
    }));
  }

  async create(data: {
    userId: number;
    type: string;
    text: string;
    fromUserId?: number;
    fromUsername?: string;
    fromAvatar?: string;
    fromColor?: string;
    targetId?: number;
  }) {
    const notification = await this.notifModel.create({
      userId: data.userId,
      type: data.type,
      text: data.text,
      fromUserId: data.fromUserId || 0,
      fromUsername: data.fromUsername || 'System',
      fromAvatar: data.fromAvatar || 'S',
      fromColor: data.fromColor || '#38BDF8',
      targetId: data.targetId,
    });
    this.realtime?.emitToUser({
      userId: data.userId,
      eventType: 'notification:new',
      payload: {
        id: notification._id.toString(),
        type: notification.type,
        text: notification.text,
        targetId: notification.targetId,
        read: notification.read,
      },
      notification: {
        type: data.type,
        text: data.text,
        targetId: data.targetId,
      },
    });
    return notification;
  }

  async markAsRead(notificationId: string) {
    await this.notifModel.updateOne({ _id: notificationId }, { read: true });
    return { success: true };
  }

  async markAllRead(userId: number) {
    await this.notifModel.updateMany({ userId, read: false }, { read: true });
    return { success: true };
  }

  async getUnreadCount(userId: number) {
    const count = await this.notifModel.countDocuments({ userId, read: false });
    return { unreadCount: count };
  }

  private formatTime(date?: Date): string {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    if (minutes < 10080) return `${Math.floor(minutes / 1440)} day ago`;
    return 'earlier';
  }
}
