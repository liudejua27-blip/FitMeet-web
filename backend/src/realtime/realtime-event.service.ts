import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Notification } from '../notifications/notification.schema';
import {
  EmitRealtimeEventInput,
  RealtimeEventEnvelope,
  RealtimeEventType,
} from './realtime-event.types';
import type { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeEventService {
  private readonly logger = new Logger(RealtimeEventService.name);
  private gateway?: RealtimeGateway;

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  bindGateway(gateway: RealtimeGateway) {
    this.gateway = gateway;
  }

  emitToUser<TPayload = Record<string, unknown>>(
    input: EmitRealtimeEventInput<TPayload>,
  ): RealtimeEventEnvelope<TPayload> {
    const envelope = this.buildEnvelope(input);

    try {
      const online =
        this.gateway?.emitEnvelope(envelope, input.rooms ?? []) ?? false;
      if (!online && input.notification) {
        void this.writeOfflineNotification(envelope, input.notification);
      }
      return envelope;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'realtime.emit_failed',
          userId: input.userId,
          eventType: input.eventType,
          traceId: input.traceId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      if (input.notification) {
        void this.writeOfflineNotification(envelope, input.notification);
      }
      return envelope;
    }
  }

  emitAgentEvent(
    userId: number,
    eventType: Extract<
      RealtimeEventType,
      | 'agent:thinking'
      | 'agent:tool_call'
      | 'agent:tool_result'
      | 'agent:candidates'
      | 'agent:approval_required'
      | 'agent:completed'
      | 'agent:error'
    >,
    payload: Record<string, unknown> = {},
    traceId?: string,
  ) {
    const rooms = [
      typeof payload.taskId === 'number' ? `agent_task:${payload.taskId}` : '',
    ].filter(Boolean);
    return this.emitToUser({ userId, eventType, payload, traceId, rooms });
  }

  isUserOnline(userId: number) {
    return this.gateway?.isUserOnline(userId) ?? false;
  }

  redisAdapterDesign() {
    return {
      adapter: 'socket.io-redis-adapter',
      attachPoint: 'RealtimeGateway.afterInit(server)',
      broadcast:
        'RealtimeEventService emits envelopes to user rooms; Redis adapter fans out rooms across instances.',
      presence:
        'Use Redis SET realtime:online:{userId} with socket ids and TTL heartbeat; never rely only on one process map.',
    };
  }

  private buildEnvelope<TPayload>(
    input: EmitRealtimeEventInput<TPayload>,
  ): RealtimeEventEnvelope<TPayload> {
    return {
      eventId: `rt_${crypto.randomUUID()}`,
      eventType: input.eventType,
      userId: input.userId,
      payload: input.payload ?? ({} as TPayload),
      createdAt: new Date().toISOString(),
      traceId: input.traceId,
    };
  }

  private async writeOfflineNotification(
    envelope: RealtimeEventEnvelope,
    notification: NonNullable<EmitRealtimeEventInput['notification']>,
  ) {
    try {
      await this.notificationModel.create({
        userId: envelope.userId,
        type: notification.type ?? envelope.eventType,
        text: notification.text,
        fromUserId: 0,
        fromUsername: 'FitMeet',
        fromAvatar: 'F',
        fromColor: '#18b98f',
        targetId: notification.targetId,
        read: false,
        pushPayload: {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          traceId: envelope.traceId,
          ...(notification.pushPayload ?? {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'realtime.offline_notification_failed',
          userId: envelope.userId,
          eventType: envelope.eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
