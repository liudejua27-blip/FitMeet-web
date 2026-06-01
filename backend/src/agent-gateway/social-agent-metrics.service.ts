import { Injectable } from '@nestjs/common';

import type { SocialAgentIntentType } from './social-agent-intent-router.service';

/**
 * Lightweight in-memory metrics for the Social Agent chat pipeline.
 * Exposed via GET /api/social-agent/chat/metrics (JSON snapshot).
 * Designed to be cheap and Prometheus-friendly without adding deps.
 */
@Injectable()
export class SocialAgentMetricsService {
  private readonly startedAt = new Date().toISOString();

  // counters
  private readonly intentTotal = new Map<string, number>(); // key: `${intent}|${source}`
  private readonly actionTotal = new Map<string, number>(); // key: action
  private readonly queuedRunsTotal = new Map<string, number>(); // key: runMode
  private readonly approvalsTotal = new Map<string, number>(); // key: approvalType
  private readonly activityResultsTotal = new Map<string, number>(); // key: hit|miss
  private readonly unknownIntentTotal = { count: 0 };
  private readonly errorTotal = new Map<string, number>(); // key: kind
  private readonly fallbackTotal = new Map<string, number>(); // key: stage
  private readonly stageLatencyMs = new Map<
    string,
    { count: number; sumMs: number; maxMs: number }
  >();

  // latency histogram for route+handle pipeline (ms)
  private readonly routeLatencyMs = this.makeHist();

  private makeHist() {
    return {
      count: 0,
      sumMs: 0,
      buckets: new Map<string, number>([
        ['50', 0],
        ['100', 0],
        ['200', 0],
        ['500', 0],
        ['1000', 0],
        ['2000', 0],
        ['+Inf', 0],
      ]),
    };
  }

  recordIntent(
    intent: SocialAgentIntentType,
    source: 'rules' | 'deepseek',
  ): void {
    this.bump(this.intentTotal, `${intent}|${source}`);
    if (intent === 'unknown') this.unknownIntentTotal.count++;
  }

  recordAction(action: string): void {
    this.bump(this.actionTotal, action);
  }

  recordQueuedRun(mode: 'initial' | 'follow_up'): void {
    this.bump(this.queuedRunsTotal, mode);
  }

  recordApproval(approvalType: string): void {
    this.bump(this.approvalsTotal, approvalType);
  }

  recordActivitySearch(hit: boolean, count: number): void {
    this.bump(this.activityResultsTotal, hit ? 'hit' : 'miss');
    if (hit && count > 0) {
      this.bump(this.activityResultsTotal, `count_sum`, count);
    }
  }

  recordError(kind: string): void {
    this.bump(this.errorTotal, kind);
  }

  recordFallback(stage: string): void {
    this.bump(this.fallbackTotal, stage);
  }

  recordLatency(stage: string, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const current = this.stageLatencyMs.get(stage) ?? {
      count: 0,
      sumMs: 0,
      maxMs: 0,
    };
    current.count++;
    current.sumMs += ms;
    if (ms > current.maxMs) current.maxMs = ms;
    this.stageLatencyMs.set(stage, current);
  }

  observeRouteLatency(ms: number): void {
    const hist = this.routeLatencyMs;
    hist.count++;
    hist.sumMs += ms;
    for (const bound of ['50', '100', '200', '500', '1000', '2000', '+Inf']) {
      if (bound === '+Inf' || ms <= Number(bound)) {
        hist.buckets.set(bound, (hist.buckets.get(bound) ?? 0) + 1);
      }
    }
  }

  snapshot(): Record<string, unknown> {
    return {
      startedAt: this.startedAt,
      intentTotal: this.serialize(this.intentTotal),
      actionTotal: this.serialize(this.actionTotal),
      queuedRunsTotal: this.serialize(this.queuedRunsTotal),
      approvalsTotal: this.serialize(this.approvalsTotal),
      activityResultsTotal: this.serialize(this.activityResultsTotal),
      unknownIntentTotal: this.unknownIntentTotal.count,
      errorTotal: this.serialize(this.errorTotal),
      fallbackTotal: this.serialize(this.fallbackTotal),
      stageLatencyMs: this.serializeStageLatency(),
      routeLatencyMs: {
        count: this.routeLatencyMs.count,
        sumMs: this.routeLatencyMs.sumMs,
        avgMs:
          this.routeLatencyMs.count > 0
            ? Math.round(this.routeLatencyMs.sumMs / this.routeLatencyMs.count)
            : 0,
        buckets: this.serialize(this.routeLatencyMs.buckets),
      },
    };
  }

  private bump(map: Map<string, number>, key: string, by = 1): void {
    map.set(key, (map.get(key) ?? 0) + by);
  }

  private serialize(map: Map<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of map.entries()) out[k] = v;
    return out;
  }

  private serializeStageLatency(): Record<
    string,
    { count: number; sumMs: number; avgMs: number; maxMs: number }
  > {
    const out: Record<
      string,
      { count: number; sumMs: number; avgMs: number; maxMs: number }
    > = {};
    for (const [stage, hist] of this.stageLatencyMs.entries()) {
      out[stage] = {
        count: hist.count,
        sumMs: hist.sumMs,
        avgMs: hist.count > 0 ? Math.round(hist.sumMs / hist.count) : 0,
        maxMs: hist.maxMs,
      };
    }
    return out;
  }
}
