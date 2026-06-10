import { Injectable, Logger, Optional } from '@nestjs/common';

import { AgentObservabilityRegistry } from './agent-observability.registry';
import { redactSensitiveValue } from '../common/privacy-redaction.util';
import { AgentObservabilityAlertSinkService } from './agent-observability-alert-sink.service';

type CounterMap = Map<string, number>;

interface LatencyBucket {
  count: number;
  sumMs: number;
  maxMs: number;
  firstMs: number | null;
}

export interface AgentObservabilityAlert {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

@Injectable()
export class AgentObservabilityService {
  private readonly logger = new Logger(AgentObservabilityService.name);
  private readonly startedAt = new Date().toISOString();
  private readonly counters: CounterMap = new Map();
  private readonly latency = new Map<string, LatencyBucket>();
  private readonly failureReasons: CounterMap = new Map();
  private readonly queueDepth = new Map<string, number>();

  constructor(
    @Optional()
    private readonly alertSink?: AgentObservabilityAlertSinkService,
  ) {
    AgentObservabilityRegistry.register(this);
  }

  createTraceId(prefix = 'agent'): string {
    return `${prefix}:${Date.now().toString(36)}:${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  recordAgentRun(input: {
    traceId: string;
    runId: string;
    taskId: number | null;
    status: 'started' | 'completed' | 'failed';
    latencyMs?: number | null;
    failureReason?: string | null;
  }): void {
    this.bump(`agent_run.${input.status}`);
    if (input.latencyMs != null) {
      this.observeLatency('agent_run', input.latencyMs);
    }
    if (input.failureReason) {
      this.recordFailure('agent_run', input.failureReason);
    }
    this.log('agent_run', input);
  }

  recordLlmCall(input: {
    traceId?: string | null;
    taskId: number | null;
    useCase: string;
    model: string;
    success: boolean;
    latencyMs: number;
    firstTokenLatencyMs?: number | null;
    tokenCount?: number | null;
    failureReason?: string | null;
  }): void {
    this.bump('llm.total');
    this.bump(input.success ? 'llm.success' : 'llm.failed');
    this.observeLatency(`llm.${input.useCase}`, input.latencyMs);
    if (input.firstTokenLatencyMs != null) {
      this.observeLatency(
        `llm_first_token.${input.useCase}`,
        input.firstTokenLatencyMs,
      );
    }
    if (input.tokenCount != null) {
      this.bump(`llm_tokens.${input.useCase}`, input.tokenCount);
    }
    if (!input.success) {
      this.recordFailure('llm', input.failureReason ?? 'unknown');
    }
    this.log('llm_call', input);
  }

  recordToolCall(input: {
    traceId: string;
    runId: string;
    toolName: string;
    status: 'observed' | 'failed' | 'blocked';
    latencyMs?: number | null;
    failureReason?: string | null;
  }): void {
    this.bump('tool.total');
    this.bump(`tool.${input.status}`);
    this.bump(`tool_name.${input.toolName}.${input.status}`);
    if (input.latencyMs != null) {
      this.observeLatency(`tool.${input.toolName}`, input.latencyMs);
    }
    if (input.status !== 'observed') {
      this.recordFailure('tool', input.failureReason ?? input.status);
    }
    this.log('tool_call', input);
  }

  recordApprovalBlocked(input: {
    traceId: string;
    runId: string;
    toolName: string;
  }): void {
    this.bump('approval.blocked');
    this.log('approval_blocked', input);
  }

  recordSse(input: {
    streamName: string;
    status: 'started' | 'completed' | 'interrupted' | 'failed';
    traceId?: string | null;
    eventCount?: number | null;
    latencyMs?: number | null;
    failureReason?: string | null;
  }): void {
    this.bump(`sse.${input.status}`);
    this.bump(`sse_stream.${input.streamName}.${input.status}`);
    if (input.latencyMs != null) {
      this.observeLatency(`sse.${input.streamName}`, input.latencyMs);
    }
    if (input.failureReason) {
      this.recordFailure('sse', input.failureReason);
    }
    this.log('sse', input);
  }

  recordDbQuery(input: {
    operation: string;
    latencyMs: number;
    success: boolean;
    failureReason?: string | null;
  }): void {
    this.bump('db.query_total');
    this.bump(input.success ? 'db.query_success' : 'db.query_failed');
    this.observeLatency(`db.${input.operation}`, input.latencyMs);
    if (input.latencyMs > 500) this.bump('db.slow_query');
    if (!input.success) {
      this.recordFailure('db', input.failureReason ?? 'query_failed');
    }
  }

  recordUserSatisfaction(input: {
    traceId?: string | null;
    score: number;
    source?: string | null;
  }): void {
    if (!Number.isFinite(input.score)) return;
    this.bump('user_satisfaction.total');
    this.observeLatency('user_satisfaction.score', input.score);
    if (input.score < 0.6) this.bump('user_satisfaction.low');
    this.log('user_satisfaction', input);
  }

  recordQueueSnapshot(
    lanes: Array<{ queueName?: string; queueDepth?: number; status?: string }>,
  ): void {
    for (const lane of lanes) {
      const queueName = lane.queueName ?? 'unknown';
      const depth = Number(lane.queueDepth) || 0;
      this.queueDepth.set(queueName, depth);
      if (depth > 0) this.bump('queue.has_backlog');
      if (lane.status === 'failed') this.bump('queue.worker_failed');
    }
  }

  snapshot(): Record<string, unknown> {
    const counters = this.serialize(this.counters);
    const latency = this.serializeLatency();
    const queueDepth = this.serialize(this.queueDepth);
    const alerts = this.alerts(counters, latency, queueDepth);
    void this.alertSink?.publishAlerts(alerts, {
      startedAt: this.startedAt,
      counters,
      queueDepth,
    });
    return {
      startedAt: this.startedAt,
      counters,
      latency,
      failureReasons: this.serialize(this.failureReasons),
      queueDepth,
      alerts,
      alertSink: this.alertSink?.status() ?? {
        configured: false,
        target: 'log_only',
        lastDeliveryAt: null,
        lastDeliveryStatus: null,
        lastError: null,
        cooldownMs: 300000,
      },
    };
  }

  private alerts(
    counters: Record<string, number>,
    latency: Record<string, { avgMs: number; maxMs: number; count: number }>,
    queueDepth: Record<string, number>,
  ): AgentObservabilityAlert[] {
    const alerts: AgentObservabilityAlert[] = [];
    this.rateAlert(
      alerts,
      counters,
      'llm.failed',
      'llm.total',
      0.08,
      'llm_failure_rate_high',
    );
    this.rateAlert(
      alerts,
      counters,
      'tool.failed',
      'tool.total',
      0.06,
      'tool_failure_rate_high',
    );
    this.rateAlert(
      alerts,
      counters,
      'sse.interrupted',
      'sse.started',
      0.1,
      'sse_interruption_rate_high',
    );
    if ((counters['db.slow_query'] ?? 0) > 0) {
      alerts.push({
        code: 'db_slow_query_detected',
        severity: 'warning',
        message: 'Database slow queries detected.',
        value: counters['db.slow_query'],
        threshold: 0,
      });
    }
    for (const [queueName, depth] of Object.entries(queueDepth)) {
      if (depth > 20) {
        alerts.push({
          code: 'queue_backlog_high',
          severity: depth > 100 ? 'critical' : 'warning',
          message: `Queue ${queueName} backlog is high.`,
          value: depth,
          threshold: 20,
        });
      }
    }
    for (const [key, bucket] of Object.entries(latency)) {
      if (/^llm_first_token\./.test(key) && bucket.avgMs > 2500) {
        alerts.push({
          code: 'token_latency_high',
          severity: 'warning',
          message: `${key} average first-token latency is high.`,
          value: bucket.avgMs,
          threshold: 2500,
        });
      }
    }
    return alerts;
  }

  private rateAlert(
    alerts: AgentObservabilityAlert[],
    counters: Record<string, number>,
    badKey: string,
    totalKey: string,
    threshold: number,
    code: string,
  ): void {
    const total = counters[totalKey] ?? 0;
    if (total < 10) return;
    const rate = (counters[badKey] ?? 0) / total;
    if (rate <= threshold) return;
    alerts.push({
      code,
      severity: rate > threshold * 2 ? 'critical' : 'warning',
      message: `${code}: ${(rate * 100).toFixed(1)}%`,
      value: Number(rate.toFixed(4)),
      threshold,
    });
  }

  private recordFailure(scope: string, reason: string): void {
    this.bump(`${scope}.failure_reason.${this.reasonKey(reason)}`);
    this.bump(this.failureReasons, `${scope}:${this.reasonKey(reason)}`);
  }

  private observeLatency(key: string, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const bucket = this.latency.get(key) ?? {
      count: 0,
      sumMs: 0,
      maxMs: 0,
      firstMs: null,
    };
    bucket.count += 1;
    bucket.sumMs += ms;
    bucket.maxMs = Math.max(bucket.maxMs, ms);
    bucket.firstMs ??= ms;
    this.latency.set(key, bucket);
  }

  private bump(
    keyOrMap: string | CounterMap,
    maybeKey?: string | number,
    by = 1,
  ): void {
    if (typeof keyOrMap === 'string') {
      this.counters.set(
        keyOrMap,
        (this.counters.get(keyOrMap) ?? 0) + (Number(maybeKey) || by),
      );
      return;
    }
    const key = String(maybeKey ?? '');
    keyOrMap.set(key, (keyOrMap.get(key) ?? 0) + by);
  }

  private serialize(
    map: CounterMap | Map<string, number>,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, value] of map.entries()) out[key] = value;
    return out;
  }

  private serializeLatency(): Record<
    string,
    { count: number; avgMs: number; maxMs: number; firstMs: number | null }
  > {
    const out: Record<
      string,
      { count: number; avgMs: number; maxMs: number; firstMs: number | null }
    > = {};
    for (const [key, bucket] of this.latency.entries()) {
      out[key] = {
        count: bucket.count,
        avgMs: bucket.count > 0 ? Math.round(bucket.sumMs / bucket.count) : 0,
        maxMs: bucket.maxMs,
        firstMs: bucket.firstMs,
      };
    }
    return out;
  }

  private reasonKey(reason: string): string {
    return reason
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80);
  }

  private log(event: string, payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event: `agent_observability.${event}`,
        ...(redactSensitiveValue(payload) as Record<string, unknown>),
      }),
    );
  }
}
