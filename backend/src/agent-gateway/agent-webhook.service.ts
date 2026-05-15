import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  ActionResult,
  AgentActivityLog,
  LoggedAction,
} from './entities/agent-activity-log.entity';

export interface AgentWebhookPayload {
  event: string;
  event_id: string;
  created_at: string;
  agent_connection_id: number;
  user_id: number;
  data: Record<string, unknown>;
}

@Injectable()
export class AgentWebhookService {
  private readonly logger = new Logger(AgentWebhookService.name);

  constructor(
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(AgentActivityLog)
    private readonly activityLogRepo: Repository<AgentActivityLog>,
  ) {}

  async emitToConnection(
    agentConnectionId: number | null | undefined,
    event: string,
    data: Record<string, unknown>,
  ) {
    if (!agentConnectionId) {
      return { delivered: false, reason: 'no_agent_connection' as const };
    }

    const conn = await this.connectionRepo.findOne({
      where: { id: agentConnectionId },
    });
    if (!conn?.agentWebhookUrl) {
      await this.logWebhookEvent(conn?.id ?? agentConnectionId, conn?.userId ?? 0, {
        event,
        eventType: 'webhook.skipped',
        status: 'skipped',
        reason: conn ? 'no_webhook_url' : 'no_connection',
      });
      return { delivered: false, reason: 'no_webhook_url' as const };
    }

    const payload: AgentWebhookPayload = {
      event,
      event_id: `evt_${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
      agent_connection_id: conn.id,
      user_id: conn.userId,
      data,
    };
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = this.sign(timestamp, body);

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
          `Webhook ${event} for connection ${conn.id} returned ${response.status}`,
        );
        await this.logWebhookEvent(conn.id, conn.userId, {
          event,
          eventType: 'webhook.failed',
          status: 'failed',
          eventId: payload.event_id,
          httpStatus: response.status,
        });
        return {
          delivered: false,
          reason: 'http_error' as const,
          status: response.status,
        };
      }
      await this.logWebhookEvent(conn.id, conn.userId, {
        event,
        eventType: 'webhook.delivered',
        status: 'success',
        eventId: payload.event_id,
      });
      return { delivered: true, eventId: payload.event_id };
    } catch (err) {
      this.logger.warn(
        `Webhook ${event} for connection ${conn.id} failed: ${(err as Error).message}`,
      );
      await this.logWebhookEvent(conn.id, conn.userId, {
        event,
        eventType: 'webhook.failed',
        status: 'failed',
        eventId: payload.event_id,
        message: (err as Error).message,
      });
      return {
        delivered: false,
        reason: 'network_error' as const,
        message: (err as Error).message,
      };
    }
  }

  private sign(timestamp: string, body: string) {
    const secret =
      process.env.AGENT_WEBHOOK_SIGNING_SECRET ||
      process.env.JWT_SECRET ||
      'fitmeet-dev-webhook-secret';
    return `v1=${crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`;
  }

  private async logWebhookEvent(
    agentConnectionId: number,
    ownerUserId: number,
    metadata: {
      event: string;
      eventType: string;
      status: string;
      eventId?: string;
      reason?: string;
      httpStatus?: number;
      message?: string;
    },
  ) {
    if (!ownerUserId) return;
    try {
      await this.activityLogRepo.save(
        this.activityLogRepo.create({
          agentConnectionId,
          userId: ownerUserId,
          ownerUserId,
          action: LoggedAction.AgentEvent,
          eventType: metadata.eventType,
          status: metadata.status,
          payload: metadata,
          result:
            metadata.status === 'failed'
              ? ActionResult.Error
              : ActionResult.Success,
          riskScore: 0,
          metadata,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to write webhook activity log: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
