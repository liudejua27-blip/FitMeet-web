import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model, Types } from 'mongoose';
import { DataSource, Repository } from 'typeorm';
import { shouldRunWorkerRole } from '../common/process-role.util';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import { ContactPermission } from '../social-loop/contact-permission.entity';
import { DomainOutboxEvent } from '../social-loop/domain-outbox-event.entity';
import { Conversation } from './conversation.schema';
import { Message } from './message.schema';

type OutboxRow = {
  id: number;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  status: string;
  attemptCount: number;
};

const OUTBOX_LEASE_MS = 60_000;

@Injectable()
export class DomainOutboxWorkerService {
  private readonly logger = new Logger(DomainOutboxWorkerService.name);
  private readonly workerId = `${process.pid}:${Math.random()
    .toString(36)
    .slice(2)}`;

  constructor(
    private readonly dataSource: DataSource,
    @InjectModel(Conversation.name)
    private readonly convModel: Model<Conversation>,
    @InjectModel(Message.name)
    private readonly msgModel: Model<Message>,
    @InjectRepository(ContactPermission)
    private readonly permissionRepo: Repository<ContactPermission>,
    private readonly realtime: RealtimeEventService,
  ) {}

  @Cron('*/5 * * * * *')
  async tick() {
    if (!shouldRunWorkerRole('worker-outbox')) return;
    await this.processPending(10);
  }

  async processPending(limit = 10) {
    const rows = await this.claimPending(limit);
    for (const row of rows) {
      await this.processOne(row);
    }
    return { processed: rows.length };
  }

  private async claimPending(limit: number): Promise<OutboxRow[]> {
    return this.dataSource.transaction(async (manager) => {
      const result: unknown = await manager.query(
        `
        UPDATE "domain_outbox_events"
        SET "status" = 'processing',
            "leaseOwner" = $2,
            "leaseExpiresAt" = now() + ($3 * interval '1 millisecond'),
            "updatedAt" = now()
        WHERE "id" IN (
          SELECT "id"
          FROM "domain_outbox_events"
          WHERE (
              "status" IN ('pending', 'failed')
              AND "availableAt" <= now()
            )
            OR (
              "status" = 'processing'
              AND "leaseExpiresAt" <= now()
            )
          ORDER BY "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        RETURNING *
        `,
        [limit, this.workerId, OUTBOX_LEASE_MS],
      );
      return this.queryRows(result);
    });
  }

  private queryRows(result: unknown): OutboxRow[] {
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0] as OutboxRow[];
    }
    return Array.isArray(result) ? (result as OutboxRow[]) : [];
  }

  private async processOne(row: OutboxRow) {
    try {
      if (row.eventType === 'conversation.provision_requested') {
        await this.provisionConversation(row);
      }
      await this.markCompleted(row.id);
    } catch (error) {
      await this.markFailed(row, error);
    }
  }

  private async provisionConversation(row: OutboxRow) {
    const ownerUserId = this.number(row.payload.ownerUserId);
    const applicantUserId = this.number(row.payload.applicantUserId);
    if (!ownerUserId || !applicantUserId) {
      throw new Error('conversation provisioning payload missing participants');
    }
    const participantIds = this.directParticipantIds(
      ownerUserId,
      applicantUserId,
    );
    const directKey = this.directConversationKey(ownerUserId, applicantUserId);
    const now = new Date();
    const metadata = {
      source: row.aggregateType,
      publicIntentId: this.text(row.payload.publicIntentId),
      taskIntentId: this.text(row.payload.taskIntentId),
      publicIntentApplicationId: this.number(row.payload.applicationId),
      taskIntentApplicationId:
        row.aggregateType === 'task_intent_application'
          ? this.number(row.payload.applicationId)
          : null,
      demandInvitationId: this.number(row.payload.invitationId),
      demandId: this.text(row.payload.demandId),
      candidateRecordId: this.number(row.payload.candidateRecordId),
      meetId: this.number(row.payload.meetId),
      outboxEventId: row.id,
      outboxDedupeKey: row.dedupeKey,
    };

    const conversation = await this.convModel.findOneAndUpdate(
      {
        $or: [
          { directKey },
          { participantIds: { $all: participantIds, $size: 2 } },
        ],
      },
      {
        $setOnInsert: {
          participantAgentIds: [],
          agentConnectionId: null,
          ownerUserId,
          actorUserId: ownerUserId,
          labels:
            row.aggregateType === 'task_intent_application'
              ? ['任务大厅', '接单已接受']
              : ['约练卡', '报名已接受'],
          relatedSocialRequestId: null,
          relatedCandidateId: null,
          lastMessage: '',
          lastMessageTime: now,
          unreadCount: {
            [String(ownerUserId)]: 0,
            [String(applicantUserId)]: 0,
          },
          unreadAgentCount: {},
        },
        $set: {
          directKey,
          participantIds,
          metadata,
          source: row.aggregateType,
          status: 'open',
          relatedPublicIntentId: this.text(row.payload.publicIntentId),
          lastActionAt: now,
        },
      },
      { new: true, upsert: true },
    );
    const conversationId = conversation._id.toString();
    await this.permissionRepo.update(this.pair(ownerUserId, applicantUserId), {
      conversationId,
      status: 'open',
    });
    if (row.aggregateType === 'demand_invitation') {
      await this.dataSource.query(
        `UPDATE "demand_invitations" SET "conversationId" = $1, "updatedAt" = now() WHERE "id" = $2`,
        [conversationId, this.number(row.payload.invitationId)],
      );
    }
    await this.createWelcomeMessageOnce(
      new Types.ObjectId(conversationId),
      participantIds,
      row,
    );
    this.emitConversationReady(
      ownerUserId,
      applicantUserId,
      conversationId,
      row,
    );
  }

  private async createWelcomeMessageOnce(
    conversationId: Types.ObjectId,
    participantIds: number[],
    row: OutboxRow,
  ) {
    const existing = await this.msgModel
      .findOne({
        conversationId,
        'metadata.outboxDedupeKey': row.dedupeKey,
      })
      .lean()
      .exec();
    if (existing) return;
    await this.msgModel.create({
      conversationId,
      agentConnectionId: null,
      ownerUserId: this.number(row.payload.ownerUserId),
      actorUserId: this.number(row.payload.ownerUserId),
      senderId: 0,
      text:
        row.aggregateType === 'task_intent_application'
          ? '任务申请已接受，聊天已开放，可以开始确认服务细节。'
          : '约练报名已接受，聊天已开放，可以开始确认时间和地点。',
      source: 'ai_delegate',
      card: null,
      metadata: {
        source: 'domain_outbox',
        outboxEventId: row.id,
        outboxDedupeKey: row.dedupeKey,
      },
      read: false,
      senderType: 'agent',
      receiverType: 'user',
      senderAgentId: null,
      receiverAgentId: null,
    });
    await this.convModel.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessage:
            row.aggregateType === 'demand_invitation'
              ? '邀请已接受，聊天已开放。'
              : row.aggregateType === 'task_intent_application'
                ? '任务申请已接受，聊天已开放。'
                : '约练报名已接受，聊天已开放。',
          lastMessageTime: new Date(),
        },
        $inc: Object.fromEntries(
          participantIds.map((id) => [`unreadCount.${id}`, 1]),
        ),
      },
    );
  }

  private emitConversationReady(
    ownerUserId: number,
    applicantUserId: number,
    conversationId: string,
    row: OutboxRow,
  ) {
    for (const userId of [ownerUserId, applicantUserId]) {
      this.realtime.emitToUser({
        userId,
        eventType: 'conversation.ready',
        payload: {
          conversationId,
          invitationId: row.payload.invitationId ?? null,
          demandId: row.payload.demandId ?? null,
          applicationId: row.payload.applicationId ?? null,
          publicIntentId: row.payload.publicIntentId ?? null,
          meetId: row.payload.meetId ?? null,
        },
      });
    }
  }

  private async markCompleted(id: number) {
    await this.dataSource.getRepository(DomainOutboxEvent).update(
      { id },
      {
        status: 'completed',
        processedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: '',
      },
    );
  }

  private async markFailed(row: OutboxRow, error: unknown) {
    const attemptCount = row.attemptCount + 1;
    const backoffSeconds = Math.min(300, 2 ** attemptCount);
    await this.dataSource.getRepository(DomainOutboxEvent).update(
      { id: row.id },
      {
        status: 'failed',
        attemptCount,
        availableAt: new Date(Date.now() + backoffSeconds * 1000),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: error instanceof Error ? error.message : String(error),
      },
    );
    this.logger.warn({
      event: 'domain_outbox.failed',
      id: row.id,
      dedupeKey: row.dedupeKey,
      attemptCount,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private directParticipantIds(userA: number, userB: number): number[] {
    return [Number(userA), Number(userB)].sort((a, b) => a - b);
  }

  private directConversationKey(userA: number, userB: number): string {
    const [minUserId, maxUserId] = this.directParticipantIds(userA, userB);
    return `direct:${minUserId}:${maxUserId}`;
  }

  private pair(userId: number, targetUserId: number) {
    return {
      userLowId: Math.min(userId, targetUserId),
      userHighId: Math.max(userId, targetUserId),
    };
  }

  private number(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return '';
  }
}
