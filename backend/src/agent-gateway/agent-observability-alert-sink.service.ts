import { Injectable, Logger } from '@nestjs/common';

import { redactSensitiveValue } from '../common/privacy-redaction.util';
import type { AgentObservabilityAlert } from './agent-observability.service';

type AlertSinkStatus = {
  configured: boolean;
  target: 'webhook' | 'log_only';
  lastDeliveryAt: string | null;
  lastDeliveryStatus: 'sent' | 'skipped' | 'failed' | null;
  lastError: string | null;
  cooldownMs: number;
};

@Injectable()
export class AgentObservabilityAlertSinkService {
  private readonly logger = new Logger(AgentObservabilityAlertSinkService.name);
  private readonly deliveredAt = new Map<string, number>();
  private lastDeliveryAt: string | null = null;
  private lastDeliveryStatus: AlertSinkStatus['lastDeliveryStatus'] = null;
  private lastError: string | null = null;

  async publishAlerts(
    alerts: AgentObservabilityAlert[],
    context: Record<string, unknown> = {},
  ): Promise<void> {
    const deliverable = alerts.filter((alert) => this.shouldDeliver(alert));
    if (deliverable.length === 0) {
      return;
    }
    const payload = redactSensitiveValue({
      event: 'fitmeet.agent_observability.alerts',
      severity: deliverable.some((alert) => alert.severity === 'critical')
        ? 'critical'
        : 'warning',
      alerts: deliverable,
      context,
      createdAt: new Date().toISOString(),
    });
    const webhookUrl = this.webhookUrl();
    try {
      if (!webhookUrl) {
        this.logger.warn(JSON.stringify(payload));
        this.markDelivered(deliverable, 'skipped');
        return;
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.webhookToken()
            ? { authorization: `Bearer ${this.webhookToken()}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`alert_webhook_http_${response.status}`);
      }
      this.markDelivered(deliverable, 'sent');
    } catch (error) {
      this.lastDeliveryAt = new Date().toISOString();
      this.lastDeliveryStatus = 'failed';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(
        JSON.stringify({
          event: 'agent_observability.alert_delivery_failed',
          reason: this.lastError,
        }),
      );
    }
  }

  status(): AlertSinkStatus {
    return {
      configured: Boolean(this.webhookUrl()),
      target: this.webhookUrl() ? 'webhook' : 'log_only',
      lastDeliveryAt: this.lastDeliveryAt,
      lastDeliveryStatus: this.lastDeliveryStatus,
      lastError: this.lastError,
      cooldownMs: this.cooldownMs(),
    };
  }

  private shouldDeliver(alert: AgentObservabilityAlert): boolean {
    const now = Date.now();
    const key = `${alert.code}:${alert.severity}`;
    const last = this.deliveredAt.get(key) ?? 0;
    return now - last >= this.cooldownMs();
  }

  private markDelivered(
    alerts: AgentObservabilityAlert[],
    status: 'sent' | 'skipped',
  ): void {
    const now = Date.now();
    for (const alert of alerts) {
      this.deliveredAt.set(`${alert.code}:${alert.severity}`, now);
    }
    this.lastDeliveryAt = new Date(now).toISOString();
    this.lastDeliveryStatus = status;
    this.lastError = null;
  }

  private webhookUrl(): string {
    return (process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_URL ?? '').trim();
  }

  private webhookToken(): string {
    return (process.env.AGENT_OBSERVABILITY_ALERT_WEBHOOK_TOKEN ?? '').trim();
  }

  private cooldownMs(): number {
    const parsed = Number(process.env.AGENT_OBSERVABILITY_ALERT_COOLDOWN_MS);
    if (!Number.isFinite(parsed) || parsed < 0) return 300000;
    return Math.trunc(parsed);
  }
}
