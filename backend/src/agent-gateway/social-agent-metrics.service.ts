import { Injectable } from '@nestjs/common';

import type { SocialAgentIntentType } from './social-agent-intent-router.service';

type CacheSummary = {
  hits: number;
  misses: number;
  total: number;
  hitRate: number;
  savedApproxPromptChars: number;
};

type PromptFingerprintSummary = {
  observations: number;
  distinctPromptPrefixHashes: number;
  distinctDynamicContextHashes: number;
  promptPrefixReuseRate: number;
};

type WorkflowEfficiencySummary = {
  total: number;
  totalIntentRoutes: number;
  workflowRouteRate: number;
  estimatedAvoidedLlmCalls: number;
  byIntent: Record<string, number>;
  byReason: Record<string, number>;
};

type DeterministicActionEfficiencySummary = {
  total: number;
  estimatedAvoidedLlmCalls: number;
  byAction: Record<string, number>;
};

type DeterministicRouteEfficiencySummary = {
  total: number;
  estimatedAvoidedLlmCalls: number;
  byIntent: Record<string, number>;
};

type TokenOptimizationSummary = {
  estimatedAvoidedLlmCalls: number;
  workflowAvoidedLlmCalls: number;
  deterministicReplyAvoidedLlmCalls: number;
  deterministicActionAvoidedLlmCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheTotal: number;
  cacheHitRate: number;
  savedApproxPromptChars: number;
  promptFingerprintObservations: number;
  distinctPromptPrefixHashes: number;
  promptPrefixReuseRate: number;
};

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
  private readonly workflowRouteTotal = new Map<string, number>(); // key: `${intent}|${reason}`
  private workflowAvoidedLlmCallsTotal = 0;
  private readonly deterministicRouteReplyTotal = new Map<string, number>(); // key: intent
  private deterministicRouteReplyAvoidedLlmCallsTotal = 0;
  private readonly deterministicActionTotal = new Map<string, number>(); // key: action
  private deterministicActionAvoidedLlmCallsTotal = 0;
  private readonly actionTotal = new Map<string, number>(); // key: action
  private readonly queuedRunsTotal = new Map<string, number>(); // key: runMode
  private readonly approvalsTotal = new Map<string, number>(); // key: approvalType
  private readonly activityResultsTotal = new Map<string, number>(); // key: hit|miss
  private readonly unknownIntentTotal = { count: 0 };
  private readonly errorTotal = new Map<string, number>(); // key: kind
  private readonly fallbackTotal = new Map<string, number>(); // key: stage
  private readonly toolResultCacheTotal = new Map<string, number>(); // key: `${cacheName}|hit`
  private readonly llmOutputCacheTotal = new Map<string, number>(); // key: `${cacheName}|hit`
  private readonly embeddingCacheTotal = new Map<string, number>(); // key: `${cacheName}|hit`
  private readonly llmPromptFingerprintTotal = new Map<string, number>(); // key: `${cacheName}|prefix|${hash}`
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

  recordWorkflowRoute(
    intent: SocialAgentIntentType,
    reason: string,
    options: { skipBrain?: boolean } = {},
  ): void {
    this.bump(this.intentTotal, `${intent}|workflow:${reason}`);
    this.bump(this.workflowRouteTotal, `${intent}|${reason}`);
    this.workflowAvoidedLlmCallsTotal += options.skipBrain ? 2 : 1;
  }

  recordAction(action: string): void {
    this.bump(this.actionTotal, action);
  }

  recordDeterministicRouteReply(
    intent: string,
    options: { estimatedAvoidedLlmCalls?: number } = {},
  ): void {
    const normalized = `${intent || 'unknown'}`.trim() || 'unknown';
    this.bump(this.deterministicRouteReplyTotal, normalized);
    const avoided = options.estimatedAvoidedLlmCalls ?? 1;
    if (Number.isFinite(avoided) && avoided > 0) {
      this.deterministicRouteReplyAvoidedLlmCallsTotal += avoided;
    }
  }

  recordDeterministicAction(
    action: string,
    options: { estimatedAvoidedLlmCalls?: number } = {},
  ): void {
    const normalized = `${action || 'unknown'}`.trim() || 'unknown';
    this.bump(this.deterministicActionTotal, normalized);
    const avoided = options.estimatedAvoidedLlmCalls ?? 1;
    if (Number.isFinite(avoided) && avoided > 0) {
      this.deterministicActionAvoidedLlmCallsTotal += avoided;
    }
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

  recordToolResultCache(input: {
    cacheName: string;
    hit: boolean;
    approxChars?: number | null;
  }): void {
    const cacheName = input.cacheName || 'unknown';
    this.bump(
      this.toolResultCacheTotal,
      `${cacheName}|${input.hit ? 'hit' : 'miss'}`,
    );
    if (input.hit && input.approxChars && input.approxChars > 0) {
      this.bump(
        this.toolResultCacheTotal,
        `${cacheName}|saved_approx_prompt_chars`,
        Math.floor(input.approxChars),
      );
    }
  }

  recordLlmOutputCache(input: {
    cacheName: string;
    hit: boolean;
    approxChars?: number | null;
    promptPrefixHash?: string | null;
    dynamicContextHash?: string | null;
  }): void {
    const cacheName = input.cacheName || 'unknown';
    this.bump(
      this.llmOutputCacheTotal,
      `${cacheName}|${input.hit ? 'hit' : 'miss'}`,
    );
    if (input.hit && input.approxChars && input.approxChars > 0) {
      this.bump(
        this.llmOutputCacheTotal,
        `${cacheName}|saved_approx_prompt_chars`,
        Math.floor(input.approxChars),
      );
    }
    if (input.promptPrefixHash) {
      this.bump(
        this.llmPromptFingerprintTotal,
        `${cacheName}|prefix|${input.promptPrefixHash}`,
      );
    }
    if (input.dynamicContextHash) {
      this.bump(
        this.llmPromptFingerprintTotal,
        `${cacheName}|dynamic|${input.dynamicContextHash}`,
      );
    }
  }

  recordEmbeddingCache(input: {
    cacheName: string;
    hit: boolean;
    approxChars?: number | null;
  }): void {
    const cacheName = input.cacheName || 'unknown';
    this.bump(
      this.embeddingCacheTotal,
      `${cacheName}|${input.hit ? 'hit' : 'miss'}`,
    );
    if (input.hit && input.approxChars && input.approxChars > 0) {
      this.bump(
        this.embeddingCacheTotal,
        `${cacheName}|saved_approx_prompt_chars`,
        Math.floor(input.approxChars),
      );
    }
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
    const toolResultCacheSummary = this.serializeCacheSummary(
      this.toolResultCacheTotal,
    );
    const llmOutputCacheSummary = this.serializeCacheSummary(
      this.llmOutputCacheTotal,
    );
    const embeddingCacheSummary = this.serializeCacheSummary(
      this.embeddingCacheTotal,
    );
    const llmPromptFingerprintSummary =
      this.serializePromptFingerprintSummary();

    return {
      startedAt: this.startedAt,
      intentTotal: this.serialize(this.intentTotal),
      workflowRouteTotal: this.serialize(this.workflowRouteTotal),
      workflowEfficiencySummary: this.serializeWorkflowEfficiencySummary(),
      deterministicRouteReplyTotal: this.serialize(
        this.deterministicRouteReplyTotal,
      ),
      deterministicRouteEfficiencySummary:
        this.serializeDeterministicRouteEfficiencySummary(),
      deterministicActionTotal: this.serialize(this.deterministicActionTotal),
      deterministicActionEfficiencySummary:
        this.serializeDeterministicActionEfficiencySummary(),
      actionTotal: this.serialize(this.actionTotal),
      queuedRunsTotal: this.serialize(this.queuedRunsTotal),
      approvalsTotal: this.serialize(this.approvalsTotal),
      activityResultsTotal: this.serialize(this.activityResultsTotal),
      unknownIntentTotal: this.unknownIntentTotal.count,
      errorTotal: this.serialize(this.errorTotal),
      fallbackTotal: this.serialize(this.fallbackTotal),
      toolResultCacheTotal: this.serialize(this.toolResultCacheTotal),
      toolResultCacheSummary,
      llmOutputCacheTotal: this.serialize(this.llmOutputCacheTotal),
      llmOutputCacheSummary,
      llmPromptFingerprintSummary,
      embeddingCacheTotal: this.serialize(this.embeddingCacheTotal),
      embeddingCacheSummary,
      cacheEfficiencySummary: {
        toolResult: this.aggregateCacheSummaries(toolResultCacheSummary),
        llmOutput: this.aggregateCacheSummaries(llmOutputCacheSummary),
        embedding: this.aggregateCacheSummaries(embeddingCacheSummary),
        combined: this.aggregateCacheSummaries(
          toolResultCacheSummary,
          llmOutputCacheSummary,
          embeddingCacheSummary,
        ),
      },
      tokenOptimizationSummary: this.serializeTokenOptimizationSummary({
        cacheSummary: this.aggregateCacheSummaries(
          toolResultCacheSummary,
          llmOutputCacheSummary,
          embeddingCacheSummary,
        ),
        promptFingerprintSummary: llmPromptFingerprintSummary,
      }),
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
    if (!Number.isFinite(by) || by <= 0) return;
    map.set(key, (map.get(key) ?? 0) + by);
  }

  private serialize(map: Map<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of map.entries()) out[k] = v;
    return out;
  }

  private serializeCacheSummary(
    map: Map<string, number>,
  ): Record<string, CacheSummary> {
    const out: Record<string, CacheSummary> = {};

    for (const [key, value] of map.entries()) {
      const separatorIndex = key.lastIndexOf('|');
      if (separatorIndex <= 0) continue;
      const cacheName = key.slice(0, separatorIndex);
      const metricName = key.slice(separatorIndex + 1);
      const current =
        out[cacheName] ??
        (out[cacheName] = {
          hits: 0,
          misses: 0,
          total: 0,
          hitRate: 0,
          savedApproxPromptChars: 0,
        });

      if (metricName === 'hit') {
        current.hits += value;
      } else if (metricName === 'miss') {
        current.misses += value;
      } else if (metricName === 'saved_approx_prompt_chars') {
        current.savedApproxPromptChars += value;
      }
    }

    for (const summary of Object.values(out)) {
      summary.total = summary.hits + summary.misses;
      summary.hitRate =
        summary.total > 0
          ? Math.round((summary.hits / summary.total) * 10000) / 10000
          : 0;
    }

    return out;
  }

  private aggregateCacheSummaries(
    ...summaries: Array<Record<string, CacheSummary>>
  ): CacheSummary {
    const aggregate: CacheSummary = {
      hits: 0,
      misses: 0,
      total: 0,
      hitRate: 0,
      savedApproxPromptChars: 0,
    };

    for (const summary of summaries) {
      for (const cache of Object.values(summary)) {
        aggregate.hits += cache.hits;
        aggregate.misses += cache.misses;
        aggregate.savedApproxPromptChars += cache.savedApproxPromptChars;
      }
    }

    aggregate.total = aggregate.hits + aggregate.misses;
    aggregate.hitRate =
      aggregate.total > 0
        ? Math.round((aggregate.hits / aggregate.total) * 10000) / 10000
        : 0;

    return aggregate;
  }

  private serializeTokenOptimizationSummary(input: {
    cacheSummary: CacheSummary;
    promptFingerprintSummary: Record<string, PromptFingerprintSummary>;
  }): TokenOptimizationSummary {
    const promptFingerprintTotals = Object.values(
      input.promptFingerprintSummary,
    ).reduce(
      (acc, summary) => {
        acc.observations += summary.observations;
        acc.distinctPromptPrefixHashes += summary.distinctPromptPrefixHashes;
        return acc;
      },
      { observations: 0, distinctPromptPrefixHashes: 0 },
    );

    return {
      estimatedAvoidedLlmCalls:
        this.workflowAvoidedLlmCallsTotal +
        this.deterministicRouteReplyAvoidedLlmCallsTotal +
        this.deterministicActionAvoidedLlmCallsTotal,
      workflowAvoidedLlmCalls: this.workflowAvoidedLlmCallsTotal,
      deterministicReplyAvoidedLlmCalls:
        this.deterministicRouteReplyAvoidedLlmCallsTotal,
      deterministicActionAvoidedLlmCalls:
        this.deterministicActionAvoidedLlmCallsTotal,
      cacheHits: input.cacheSummary.hits,
      cacheMisses: input.cacheSummary.misses,
      cacheTotal: input.cacheSummary.total,
      cacheHitRate: input.cacheSummary.hitRate,
      savedApproxPromptChars: input.cacheSummary.savedApproxPromptChars,
      promptFingerprintObservations: promptFingerprintTotals.observations,
      distinctPromptPrefixHashes:
        promptFingerprintTotals.distinctPromptPrefixHashes,
      promptPrefixReuseRate:
        promptFingerprintTotals.observations > 0
          ? Math.round(
              (1 -
                promptFingerprintTotals.distinctPromptPrefixHashes /
                  promptFingerprintTotals.observations) *
                10000,
            ) / 10000
          : 0,
    };
  }

  private serializePromptFingerprintSummary(): Record<
    string,
    PromptFingerprintSummary
  > {
    const buckets = new Map<
      string,
      {
        prefixObservations: number;
        dynamicObservations: number;
        promptPrefixHashes: Set<string>;
        dynamicContextHashes: Set<string>;
      }
    >();

    for (const [key, count] of this.llmPromptFingerprintTotal.entries()) {
      const parts = key.split('|');
      if (parts.length !== 3) continue;
      const [cacheName, kind, hash] = parts;
      if (!cacheName || !hash) continue;
      const bucket =
        buckets.get(cacheName) ??
        {
          prefixObservations: 0,
          dynamicObservations: 0,
          promptPrefixHashes: new Set<string>(),
          dynamicContextHashes: new Set<string>(),
        };
      if (kind === 'prefix') {
        bucket.prefixObservations += count;
        bucket.promptPrefixHashes.add(hash);
      }
      if (kind === 'dynamic') {
        bucket.dynamicObservations += count;
        bucket.dynamicContextHashes.add(hash);
      }
      buckets.set(cacheName, bucket);
    }

    const out: Record<string, PromptFingerprintSummary> = {};
    for (const [cacheName, bucket] of buckets.entries()) {
      const promptPrefixObservations = Array.from(
        bucket.promptPrefixHashes,
      ).reduce(
        (sum, hash) =>
          sum +
          (this.llmPromptFingerprintTotal.get(
            `${cacheName}|prefix|${hash}`,
          ) ?? 0),
        0,
      );
      const distinctPromptPrefixHashes = bucket.promptPrefixHashes.size;
      const observations = Math.max(
        bucket.prefixObservations,
        bucket.dynamicObservations,
      );
      out[cacheName] = {
        observations,
        distinctPromptPrefixHashes,
        distinctDynamicContextHashes: bucket.dynamicContextHashes.size,
        promptPrefixReuseRate:
          promptPrefixObservations > 0
            ? Math.round(
                (1 -
                  distinctPromptPrefixHashes / promptPrefixObservations) *
                  10000,
              ) / 10000
            : 0,
      };
    }
    return out;
  }

  private serializeWorkflowEfficiencySummary(): WorkflowEfficiencySummary {
    const byIntent: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    let total = 0;

    for (const [key, value] of this.workflowRouteTotal.entries()) {
      const separatorIndex = key.indexOf('|');
      if (separatorIndex <= 0) continue;
      const intent = key.slice(0, separatorIndex);
      const reason = key.slice(separatorIndex + 1);
      total += value;
      byIntent[intent] = (byIntent[intent] ?? 0) + value;
      byReason[reason] = (byReason[reason] ?? 0) + value;
    }

    const totalIntentRoutes = Array.from(this.intentTotal.entries()).reduce(
      (sum, [key, value]) => {
        const source = key.slice(key.indexOf('|') + 1);
        return source.startsWith('workflow:') ? sum : sum + value;
      },
      0,
    );

    return {
      total,
      totalIntentRoutes,
      workflowRouteRate:
        totalIntentRoutes > 0
          ? Math.round((total / totalIntentRoutes) * 10000) / 10000
          : 0,
      estimatedAvoidedLlmCalls: this.workflowAvoidedLlmCallsTotal,
      byIntent,
      byReason,
    };
  }

  private serializeDeterministicActionEfficiencySummary(): DeterministicActionEfficiencySummary {
    const byAction = this.serialize(this.deterministicActionTotal);
    const total = Object.values(byAction).reduce((sum, value) => sum + value, 0);
    return {
      total,
      estimatedAvoidedLlmCalls:
        this.deterministicActionAvoidedLlmCallsTotal,
      byAction,
    };
  }

  private serializeDeterministicRouteEfficiencySummary(): DeterministicRouteEfficiencySummary {
    const byIntent = this.serialize(this.deterministicRouteReplyTotal);
    const total = Object.values(byIntent).reduce((sum, value) => sum + value, 0);
    return {
      total,
      estimatedAvoidedLlmCalls:
        this.deterministicRouteReplyAvoidedLlmCallsTotal,
      byIntent,
    };
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
