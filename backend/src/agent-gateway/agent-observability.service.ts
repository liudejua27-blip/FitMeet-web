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

interface LlmTokenCostBucket {
  calls: number;
  success: number;
  failed: number;
  promptTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  reportedTokenCount: number;
  approxPromptChars: number;
  promptPrefixHashes: Set<string>;
  dynamicContextHashes: Set<string>;
  models: Set<string>;
}

interface ToolRunCostBucket {
  calls: number;
  observed: number;
  failed: number;
  blocked: number;
}

interface RunExecutionCostBucket {
  runId: string;
  traceId: string | null;
  taskId: number | null;
  status: 'started' | 'completed' | 'approval_required' | 'failed' | 'unknown';
  firstSeenAt: string;
  updatedAt: string;
  agentRunLatencyMs: number | null;
  failureReason: string | null;
  llmCallCount: number;
  toolCallCount: number;
  promptTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  reportedTokenCount: number;
  approxPromptChars: number;
  models: Set<string>;
  llmUseCases: Map<string, number>;
  tools: Map<string, ToolRunCostBucket>;
}

type SerializedLlmTokenCostBucket = {
  calls: number;
  success: number;
  failed: number;
  promptTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  promptCacheHitRate: number | null;
  completionTokens: number;
  reasoningTokens: number;
  reportedTokenCount: number;
  approxPromptChars: number;
  avgApproxPromptChars: number;
  estimatedBillableInputTokens: number;
  distinctPromptPrefixHashes: number;
  distinctDynamicContextHashes: number;
  models: string[];
};

type LlmContextBudgetRecommendation = {
  mode: 'standard' | 'strict';
  reasons: string[];
  calls: number;
  avgApproxPromptChars: number;
  avgBillableInputTokens: number;
  promptCacheHitRate: number | null;
  distinctPromptPrefixHashes: number;
  distinctDynamicContextHashes: number;
};

type ExecutionCostSummary = {
  agentRunCount: number;
  llmCallCount: number;
  toolCallCount: number;
  avgLlmCallsPerRun: number;
  avgToolCallsPerRun: number;
  llmByUseCase: Record<
    string,
    {
      calls: number;
      estimatedBillableInputTokens: number;
      completionTokens: number;
      reasoningTokens: number;
      avgLatencyMs: number;
    }
  >;
  toolByName: Record<
    string,
    {
      calls: number;
      failed: number;
      blocked: number;
      avgLatencyMs: number;
    }
  >;
};

type SerializedRunExecutionCostBucket = {
  runId: string;
  traceId: string | null;
  taskId: number | null;
  status: RunExecutionCostBucket['status'];
  firstSeenAt: string;
  updatedAt: string;
  agentRunLatencyMs: number | null;
  failureReason: string | null;
  llmCallCount: number;
  toolCallCount: number;
  promptTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
  promptCacheHitRate: number | null;
  estimatedBillableInputTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  reportedTokenCount: number;
  approxPromptChars: number;
  models: string[];
  llmUseCases: Record<string, number>;
  tools: Record<string, ToolRunCostBucket>;
};

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
  private readonly llmTokenCostByUseCase = new Map<string, LlmTokenCostBucket>();
  private readonly runCostByRunId = new Map<string, RunExecutionCostBucket>();
  private readonly runIdByTraceId = new Map<string, string>();

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
    status: 'started' | 'completed' | 'approval_required' | 'failed';
    latencyMs?: number | null;
    failureReason?: string | null;
  }): void {
    this.bump(`agent_run.${input.status}`);
    this.recordRunStatus(input);
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
    promptPrefixHash?: string | null;
    dynamicContextHash?: string | null;
    firstTokenLatencyMs?: number | null;
    httpHeadersLatencyMs?: number | null;
    firstSseChunkLatencyMs?: number | null;
    firstReasoningDeltaLatencyMs?: number | null;
    firstContentDeltaLatencyMs?: number | null;
    promptTokens?: number | null;
    promptCacheHitTokens?: number | null;
    promptCacheMissTokens?: number | null;
    completionTokens?: number | null;
    reasoningTokens?: number | null;
    systemFingerprint?: string | null;
    tokenCount?: number | null;
    approxPromptChars?: number | null;
    failureReason?: string | null;
  }): void {
    this.bump('llm.total');
    this.bump(input.success ? 'llm.success' : 'llm.failed');
    this.recordLlmTokenCost(input);
    this.observeLatency(`llm.${input.useCase}`, input.latencyMs);
    if (input.firstTokenLatencyMs != null) {
      this.observeLatency(
        `llm_first_token.${input.useCase}`,
        input.firstTokenLatencyMs,
      );
    }
    if (input.httpHeadersLatencyMs != null) {
      this.observeLatency(
        `llm_http_headers.${input.useCase}`,
        input.httpHeadersLatencyMs,
      );
    }
    if (input.firstSseChunkLatencyMs != null) {
      this.observeLatency(
        `llm_first_sse_chunk.${input.useCase}`,
        input.firstSseChunkLatencyMs,
      );
    }
    if (input.firstReasoningDeltaLatencyMs != null) {
      this.observeLatency(
        `llm_first_reasoning_delta.${input.useCase}`,
        input.firstReasoningDeltaLatencyMs,
      );
    }
    if (input.firstContentDeltaLatencyMs != null) {
      this.observeLatency(
        `llm_first_content_delta.${input.useCase}`,
        input.firstContentDeltaLatencyMs,
      );
    }
    if (input.promptTokens != null) {
      this.bump(`llm_prompt_tokens.${input.useCase}`, input.promptTokens);
    }
    if (input.promptCacheHitTokens != null) {
      this.bump(
        `llm_prompt_cache_hit_tokens.${input.useCase}`,
        input.promptCacheHitTokens,
      );
    }
    if (input.promptCacheMissTokens != null) {
      this.bump(
        `llm_prompt_cache_miss_tokens.${input.useCase}`,
        input.promptCacheMissTokens,
      );
    }
    if (input.completionTokens != null) {
      this.bump(
        `llm_completion_tokens.${input.useCase}`,
        input.completionTokens,
      );
    }
    if (input.reasoningTokens != null) {
      this.bump(`llm_reasoning_tokens.${input.useCase}`, input.reasoningTokens);
    }
    if (input.tokenCount != null) {
      this.bump(`llm_tokens.${input.useCase}`, input.tokenCount);
    }
    if (input.approxPromptChars != null) {
      this.bump(
        `llm_approx_prompt_chars.${input.useCase}`,
        input.approxPromptChars,
      );
    }
    if (!input.success) {
      this.recordFailure('llm', input.failureReason ?? 'unknown');
    }
    this.recordRunLlmCost(input);
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
    this.recordRunToolCost(input);
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

  recommendedLlmContextMode(useCase: string): 'standard' | 'strict' {
    return this.llmContextBudgetRecommendation(useCase).mode;
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
    const llmTokenCost = this.serializeLlmTokenCost();
    const alerts = this.alerts(counters, latency, queueDepth, llmTokenCost);
    void this.alertSink?.publishAlerts(alerts, {
      startedAt: this.startedAt,
      counters,
      queueDepth,
      llmTokenCost,
    });
    return {
      startedAt: this.startedAt,
      counters,
      latency,
      llmTokenCost,
      executionCostSummary: this.serializeExecutionCostSummary(
        counters,
        latency,
        llmTokenCost,
      ),
      recentRunCostSummary: this.serializeRecentRunCostSummary(),
      llmContextBudgetRecommendations:
        this.serializeLlmContextBudgetRecommendations(llmTokenCost),
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
    llmTokenCost: Record<string, SerializedLlmTokenCostBucket>,
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
    this.llmTokenCostAlerts(alerts, llmTokenCost);
    return alerts;
  }

  private llmTokenCostAlerts(
    alerts: AgentObservabilityAlert[],
    llmTokenCost: Record<string, SerializedLlmTokenCostBucket>,
  ): void {
    for (const [useCase, bucket] of Object.entries(llmTokenCost)) {
      if (bucket.calls < 5) continue;
      const avgBillableInputTokens =
        bucket.calls > 0
          ? bucket.estimatedBillableInputTokens / bucket.calls
          : 0;
      if (bucket.avgApproxPromptChars > 18000) {
        alerts.push({
          code: 'llm_prompt_context_too_large',
          severity: bucket.avgApproxPromptChars > 24000 ? 'critical' : 'warning',
          message: `${useCase} average prompt context is too large.`,
          value: bucket.avgApproxPromptChars,
          threshold: 18000,
        });
      }
      if (avgBillableInputTokens > 6000) {
        alerts.push({
          code: 'llm_billable_input_per_call_high',
          severity: avgBillableInputTokens > 10000 ? 'critical' : 'warning',
          message: `${useCase} average billable input tokens are high.`,
          value: Number(avgBillableInputTokens.toFixed(2)),
          threshold: 6000,
        });
      }
      if (
        bucket.calls >= 10 &&
        bucket.promptCacheHitRate != null &&
        bucket.promptCacheHitRate < 0.15
      ) {
        alerts.push({
          code: 'llm_prompt_cache_hit_rate_low',
          severity: 'warning',
          message: `${useCase} prompt cache hit rate is low.`,
          value: bucket.promptCacheHitRate,
          threshold: 0.15,
        });
      }
      if (
        bucket.calls >= 10 &&
        bucket.distinctPromptPrefixHashes > Math.max(3, bucket.calls * 0.25)
      ) {
        alerts.push({
          code: 'llm_prompt_prefix_churn_high',
          severity: 'warning',
          message: `${useCase} prompt prefix is changing too often for cache reuse.`,
          value: bucket.distinctPromptPrefixHashes,
          threshold: Math.max(3, Math.floor(bucket.calls * 0.25)),
        });
      }
    }
  }

  private llmContextBudgetRecommendation(
    useCase: string,
  ): LlmContextBudgetRecommendation {
    const bucket = this.llmTokenCostByUseCase.get(useCase);
    if (!bucket) {
      return {
        mode: 'standard',
        reasons: [],
        calls: 0,
        avgApproxPromptChars: 0,
        avgBillableInputTokens: 0,
        promptCacheHitRate: null,
        distinctPromptPrefixHashes: 0,
        distinctDynamicContextHashes: 0,
      };
    }
    const cacheMeasuredTokens =
      bucket.promptCacheHitTokens + bucket.promptCacheMissTokens;
    const promptCacheHitRate =
      cacheMeasuredTokens > 0
        ? Number((bucket.promptCacheHitTokens / cacheMeasuredTokens).toFixed(4))
        : null;
    const avgApproxPromptChars =
      bucket.calls > 0 ? Math.round(bucket.approxPromptChars / bucket.calls) : 0;
    const estimatedBillableInputTokens =
      cacheMeasuredTokens > 0
        ? bucket.promptCacheMissTokens
        : Math.max(bucket.promptTokens - bucket.promptCacheHitTokens, 0);
    const avgBillableInputTokens =
      bucket.calls > 0
        ? Number((estimatedBillableInputTokens / bucket.calls).toFixed(2))
        : 0;
    const reasons: string[] = [];
    if (bucket.calls >= 5 && avgApproxPromptChars > 18000) {
      reasons.push('avg_prompt_context_too_large');
    }
    if (bucket.calls >= 5 && avgBillableInputTokens > 6000) {
      reasons.push('avg_billable_input_high');
    }
    if (
      bucket.calls >= 10 &&
      promptCacheHitRate != null &&
      promptCacheHitRate < 0.15
    ) {
      reasons.push('prompt_cache_hit_rate_low');
    }
    if (
      bucket.calls >= 10 &&
      bucket.promptPrefixHashes.size > Math.max(3, bucket.calls * 0.25)
    ) {
      reasons.push('prompt_prefix_churn_high');
    }
    return {
      mode: reasons.length > 0 ? 'strict' : 'standard',
      reasons,
      calls: bucket.calls,
      avgApproxPromptChars,
      avgBillableInputTokens,
      promptCacheHitRate,
      distinctPromptPrefixHashes: bucket.promptPrefixHashes.size,
      distinctDynamicContextHashes: bucket.dynamicContextHashes.size,
    };
  }

  private serializeLlmContextBudgetRecommendations(
    llmTokenCost: Record<string, SerializedLlmTokenCostBucket>,
  ): Record<string, LlmContextBudgetRecommendation> {
    const out: Record<string, LlmContextBudgetRecommendation> = {};
    for (const useCase of Object.keys(llmTokenCost)) {
      out[useCase] = this.llmContextBudgetRecommendation(useCase);
    }
    return out;
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

  private recordLlmTokenCost(input: {
    useCase: string;
    model: string;
    success: boolean;
    promptPrefixHash?: string | null;
    dynamicContextHash?: string | null;
    promptTokens?: number | null;
    promptCacheHitTokens?: number | null;
    promptCacheMissTokens?: number | null;
    completionTokens?: number | null;
    reasoningTokens?: number | null;
    tokenCount?: number | null;
    approxPromptChars?: number | null;
  }): void {
    const key = input.useCase || 'unknown';
    const bucket = this.llmTokenCostByUseCase.get(key) ?? {
      calls: 0,
      success: 0,
      failed: 0,
      promptTokens: 0,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      reportedTokenCount: 0,
      approxPromptChars: 0,
      promptPrefixHashes: new Set<string>(),
      dynamicContextHashes: new Set<string>(),
      models: new Set<string>(),
    };
    bucket.calls += 1;
    if (input.success) bucket.success += 1;
    else bucket.failed += 1;
    bucket.promptTokens += this.nonNegative(input.promptTokens);
    bucket.promptCacheHitTokens += this.nonNegative(input.promptCacheHitTokens);
    bucket.promptCacheMissTokens += this.nonNegative(
      input.promptCacheMissTokens,
    );
    bucket.completionTokens += this.nonNegative(input.completionTokens);
    bucket.reasoningTokens += this.nonNegative(input.reasoningTokens);
    bucket.reportedTokenCount += this.nonNegative(input.tokenCount);
    bucket.approxPromptChars += this.nonNegative(input.approxPromptChars);
    if (input.promptPrefixHash) {
      bucket.promptPrefixHashes.add(input.promptPrefixHash);
    }
    if (input.dynamicContextHash) {
      bucket.dynamicContextHashes.add(input.dynamicContextHash);
    }
    if (input.model) bucket.models.add(input.model);
    this.llmTokenCostByUseCase.set(key, bucket);
  }

  private recordRunStatus(input: {
    traceId: string;
    runId: string;
    taskId: number | null;
    status: RunExecutionCostBucket['status'];
    latencyMs?: number | null;
    failureReason?: string | null;
  }): void {
    const existingRunId = this.runIdByTraceId.get(input.traceId);
    if (existingRunId && existingRunId !== input.runId) {
      this.mergeRunCostBuckets(input.runId, existingRunId);
    }
    this.runIdByTraceId.set(input.traceId, input.runId);
    const bucket = this.ensureRunCostBucket({
      runId: input.runId,
      traceId: input.traceId,
      taskId: input.taskId,
    });
    bucket.status = input.status;
    bucket.taskId = input.taskId;
    bucket.traceId = input.traceId;
    bucket.updatedAt = new Date().toISOString();
    if (input.latencyMs != null) {
      bucket.agentRunLatencyMs = input.latencyMs;
    }
    if (input.failureReason) {
      bucket.failureReason = this.reasonKey(input.failureReason);
    }
    this.trimRunCostBuckets();
  }

  private recordRunLlmCost(input: {
    traceId?: string | null;
    taskId: number | null;
    useCase: string;
    model: string;
    promptTokens?: number | null;
    promptCacheHitTokens?: number | null;
    promptCacheMissTokens?: number | null;
    completionTokens?: number | null;
    reasoningTokens?: number | null;
    tokenCount?: number | null;
    approxPromptChars?: number | null;
  }): void {
    if (!input.traceId) return;
    const runId = this.runIdByTraceId.get(input.traceId) ?? `trace:${input.traceId}`;
    const bucket = this.ensureRunCostBucket({
      runId,
      traceId: input.traceId,
      taskId: input.taskId,
    });
    bucket.llmCallCount += 1;
    bucket.promptTokens += this.nonNegative(input.promptTokens);
    bucket.promptCacheHitTokens += this.nonNegative(input.promptCacheHitTokens);
    bucket.promptCacheMissTokens += this.nonNegative(input.promptCacheMissTokens);
    bucket.completionTokens += this.nonNegative(input.completionTokens);
    bucket.reasoningTokens += this.nonNegative(input.reasoningTokens);
    bucket.reportedTokenCount += this.nonNegative(input.tokenCount);
    bucket.approxPromptChars += this.nonNegative(input.approxPromptChars);
    if (input.model) bucket.models.add(input.model);
    const useCase = input.useCase || 'unknown';
    bucket.llmUseCases.set(useCase, (bucket.llmUseCases.get(useCase) ?? 0) + 1);
    bucket.updatedAt = new Date().toISOString();
    this.trimRunCostBuckets();
  }

  private recordRunToolCost(input: {
    traceId: string;
    runId: string;
    toolName: string;
    status: 'observed' | 'failed' | 'blocked';
  }): void {
    this.runIdByTraceId.set(input.traceId, input.runId);
    const bucket = this.ensureRunCostBucket({
      runId: input.runId,
      traceId: input.traceId,
      taskId: null,
    });
    bucket.toolCallCount += 1;
    const toolName = input.toolName || 'unknown';
    const tool =
      bucket.tools.get(toolName) ??
      ({
        calls: 0,
        observed: 0,
        failed: 0,
        blocked: 0,
      } satisfies ToolRunCostBucket);
    tool.calls += 1;
    tool[input.status] += 1;
    bucket.tools.set(toolName, tool);
    bucket.updatedAt = new Date().toISOString();
    this.trimRunCostBuckets();
  }

  private ensureRunCostBucket(input: {
    runId: string;
    traceId?: string | null;
    taskId?: number | null;
  }): RunExecutionCostBucket {
    const now = new Date().toISOString();
    const existing = this.runCostByRunId.get(input.runId);
    if (existing) {
      if (input.traceId) existing.traceId = input.traceId;
      if (input.taskId != null) existing.taskId = input.taskId;
      return existing;
    }
    const bucket: RunExecutionCostBucket = {
      runId: input.runId,
      traceId: input.traceId ?? null,
      taskId: input.taskId ?? null,
      status: 'unknown',
      firstSeenAt: now,
      updatedAt: now,
      agentRunLatencyMs: null,
      failureReason: null,
      llmCallCount: 0,
      toolCallCount: 0,
      promptTokens: 0,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      reportedTokenCount: 0,
      approxPromptChars: 0,
      models: new Set<string>(),
      llmUseCases: new Map<string, number>(),
      tools: new Map<string, ToolRunCostBucket>(),
    };
    this.runCostByRunId.set(input.runId, bucket);
    return bucket;
  }

  private mergeRunCostBuckets(targetRunId: string, sourceRunId: string): void {
    const source = this.runCostByRunId.get(sourceRunId);
    if (!source) return;
    const target = this.ensureRunCostBucket({
      runId: targetRunId,
      traceId: source.traceId,
      taskId: source.taskId,
    });
    target.llmCallCount += source.llmCallCount;
    target.toolCallCount += source.toolCallCount;
    target.promptTokens += source.promptTokens;
    target.promptCacheHitTokens += source.promptCacheHitTokens;
    target.promptCacheMissTokens += source.promptCacheMissTokens;
    target.completionTokens += source.completionTokens;
    target.reasoningTokens += source.reasoningTokens;
    target.reportedTokenCount += source.reportedTokenCount;
    target.approxPromptChars += source.approxPromptChars;
    for (const model of source.models) target.models.add(model);
    for (const [useCase, count] of source.llmUseCases.entries()) {
      target.llmUseCases.set(
        useCase,
        (target.llmUseCases.get(useCase) ?? 0) + count,
      );
    }
    for (const [toolName, sourceTool] of source.tools.entries()) {
      const targetTool =
        target.tools.get(toolName) ??
        ({
          calls: 0,
          observed: 0,
          failed: 0,
          blocked: 0,
        } satisfies ToolRunCostBucket);
      targetTool.calls += sourceTool.calls;
      targetTool.observed += sourceTool.observed;
      targetTool.failed += sourceTool.failed;
      targetTool.blocked += sourceTool.blocked;
      target.tools.set(toolName, targetTool);
    }
    this.runCostByRunId.delete(sourceRunId);
  }

  private serializeRecentRunCostSummary(): SerializedRunExecutionCostBucket[] {
    return Array.from(this.runCostByRunId.values())
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 20)
      .map((bucket) => {
        const cacheMeasuredTokens =
          bucket.promptCacheHitTokens + bucket.promptCacheMissTokens;
        return {
          runId: bucket.runId,
          traceId: bucket.traceId,
          taskId: bucket.taskId,
          status: bucket.status,
          firstSeenAt: bucket.firstSeenAt,
          updatedAt: bucket.updatedAt,
          agentRunLatencyMs: bucket.agentRunLatencyMs,
          failureReason: bucket.failureReason,
          llmCallCount: bucket.llmCallCount,
          toolCallCount: bucket.toolCallCount,
          promptTokens: bucket.promptTokens,
          promptCacheHitTokens: bucket.promptCacheHitTokens,
          promptCacheMissTokens: bucket.promptCacheMissTokens,
          promptCacheHitRate:
            cacheMeasuredTokens > 0
              ? Number(
                  (
                    bucket.promptCacheHitTokens / cacheMeasuredTokens
                  ).toFixed(4),
                )
              : null,
          estimatedBillableInputTokens:
            cacheMeasuredTokens > 0
              ? bucket.promptCacheMissTokens
              : Math.max(bucket.promptTokens - bucket.promptCacheHitTokens, 0),
          completionTokens: bucket.completionTokens,
          reasoningTokens: bucket.reasoningTokens,
          reportedTokenCount: bucket.reportedTokenCount,
          approxPromptChars: bucket.approxPromptChars,
          models: Array.from(bucket.models).sort(),
          llmUseCases: this.serialize(bucket.llmUseCases),
          tools: Object.fromEntries(
            Array.from(bucket.tools.entries()).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
        };
      });
  }

  private trimRunCostBuckets(limit = 50): void {
    if (this.runCostByRunId.size <= limit) return;
    const stale = Array.from(this.runCostByRunId.entries())
      .sort(([, left], [, right]) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, this.runCostByRunId.size - limit);
    for (const [runId, bucket] of stale) {
      this.runCostByRunId.delete(runId);
      if (bucket.traceId && this.runIdByTraceId.get(bucket.traceId) === runId) {
        this.runIdByTraceId.delete(bucket.traceId);
      }
    }
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
      const increment =
        maybeKey === undefined
          ? by
          : Number.isFinite(Number(maybeKey))
            ? Number(maybeKey)
            : by;
      this.counters.set(
        keyOrMap,
        (this.counters.get(keyOrMap) ?? 0) + increment,
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

  private serializeLlmTokenCost(): Record<string, SerializedLlmTokenCostBucket> {
    const out: Record<string, SerializedLlmTokenCostBucket> = {};
    for (const [useCase, bucket] of this.llmTokenCostByUseCase.entries()) {
      const cacheMeasuredTokens =
        bucket.promptCacheHitTokens + bucket.promptCacheMissTokens;
      out[useCase] = {
        calls: bucket.calls,
        success: bucket.success,
        failed: bucket.failed,
        promptTokens: bucket.promptTokens,
        promptCacheHitTokens: bucket.promptCacheHitTokens,
        promptCacheMissTokens: bucket.promptCacheMissTokens,
        promptCacheHitRate:
          cacheMeasuredTokens > 0
            ? Number(
                (
                  bucket.promptCacheHitTokens / cacheMeasuredTokens
                ).toFixed(4),
              )
            : null,
        completionTokens: bucket.completionTokens,
        reasoningTokens: bucket.reasoningTokens,
        reportedTokenCount: bucket.reportedTokenCount,
        approxPromptChars: bucket.approxPromptChars,
        avgApproxPromptChars:
          bucket.calls > 0
            ? Math.round(bucket.approxPromptChars / bucket.calls)
            : 0,
        estimatedBillableInputTokens:
          cacheMeasuredTokens > 0
            ? bucket.promptCacheMissTokens
            : Math.max(bucket.promptTokens - bucket.promptCacheHitTokens, 0),
        distinctPromptPrefixHashes: bucket.promptPrefixHashes.size,
        distinctDynamicContextHashes: bucket.dynamicContextHashes.size,
        models: Array.from(bucket.models).sort(),
      };
    }
    return out;
  }

  private serializeExecutionCostSummary(
    counters: Record<string, number>,
    latency: Record<string, { avgMs: number; maxMs: number; count: number }>,
    llmTokenCost: Record<string, SerializedLlmTokenCostBucket>,
  ): ExecutionCostSummary {
    const agentRunCount = counters['agent_run.started'] ?? 0;
    const llmCallCount = counters['llm.total'] ?? 0;
    const toolCallCount = counters['tool.total'] ?? 0;
    const toolByName: ExecutionCostSummary['toolByName'] = {};

    for (const [key, value] of Object.entries(counters)) {
      const match = /^tool_name\.(.+)\.(observed|failed|blocked)$/.exec(key);
      if (!match) continue;
      const [, toolName, status] = match;
      const current =
        toolByName[toolName] ??
        (toolByName[toolName] = {
          calls: 0,
          failed: 0,
          blocked: 0,
          avgLatencyMs: latency[`tool.${toolName}`]?.avgMs ?? 0,
        });
      current.calls += value;
      if (status === 'failed') current.failed += value;
      if (status === 'blocked') current.blocked += value;
    }

    return {
      agentRunCount,
      llmCallCount,
      toolCallCount,
      avgLlmCallsPerRun:
        agentRunCount > 0
          ? Number((llmCallCount / agentRunCount).toFixed(2))
          : 0,
      avgToolCallsPerRun:
        agentRunCount > 0
          ? Number((toolCallCount / agentRunCount).toFixed(2))
          : 0,
      llmByUseCase: Object.fromEntries(
        Object.entries(llmTokenCost).map(([useCase, bucket]) => [
          useCase,
          {
            calls: bucket.calls,
            estimatedBillableInputTokens: bucket.estimatedBillableInputTokens,
            completionTokens: bucket.completionTokens,
            reasoningTokens: bucket.reasoningTokens,
            avgLatencyMs: latency[`llm.${useCase}`]?.avgMs ?? 0,
          },
        ]),
      ),
      toolByName,
    };
  }

  private nonNegative(value: number | null | undefined): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.floor(value ?? 0));
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
