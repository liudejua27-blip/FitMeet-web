import { requestProtected } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export type AgentReplaySampleStatus = 'captured' | 'used_for_eval' | 'ignored';
export type AgentCanaryDecision = 'observe' | 'promote' | 'rollback';
export type AgentSkillPatchStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'rolled_back';
export type AgentSkillPatchRiskLevel = 'low' | 'medium' | 'high';

export type AgentL5DashboardSummary = {
  replayCases: number;
  replayUsedForEval: number;
  subagentMemories: number;
  activeSubagents: number;
  meetLoopStates: number;
  activeMeetLoops: number;
  canarySignals: number;
  rollbackSignals: number;
  autoRuns?: number;
  residentSubagentWorkers?: number;
  activeSubagentWorkers?: number;
  subagentWorkerJobs?: number;
  failedSubagentWorkerJobs?: number;
  activeAlerts?: number;
  messageFeedback?: number;
  negativeMessageFeedback?: number;
};

export type AgentOnlineReplaySampleDto = {
  id: number;
  ownerUserId: number | null;
  agentTaskId: number | null;
  evalCaseId: number | null;
  replayType: string;
  status: AgentReplaySampleStatus;
  input: Record<string, unknown>;
  expectedBehavior: Record<string, unknown>;
  replayContext: Record<string, unknown>;
  lastReplay: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentSubagentMemoryDto = {
  id: number;
  ownerUserId: number;
  agentTaskId: number | null;
  agentName: string;
  memoryScope: string;
  input: Record<string, unknown>;
  observation: Record<string, unknown>;
  critique: Record<string, unknown>;
  handoffOutput: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentMeetLoopStateDto = {
  id: number;
  ownerUserId: number;
  agentTaskId: number;
  activityId: number | null;
  candidateUserId: number | null;
  stage: string;
  waitingFor: string;
  state: Record<string, unknown>;
  transitionHistory: Array<Record<string, unknown>>;
  review: Record<string, unknown> | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentSkillPatchEffectDto = {
  id: number;
  patchId: number;
  metric: string;
  value: number;
  sampleSize: number | null;
  decision: AgentCanaryDecision;
  note: string;
  context: Record<string, unknown>;
  createdAt: string;
};

export type AgentSkillPatchDto = {
  id: number;
  reflectionRunId: number | null;
  patchType: string;
  title: string;
  rationale: string;
  target: string;
  patch: Record<string, unknown>;
  riskLevel: AgentSkillPatchRiskLevel;
  status: AgentSkillPatchStatus;
  evalCaseIds: number[];
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  rolledBackAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentObservabilityAlertDto = {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
};

export type AgentObservabilityLatencyDto = {
  count: number;
  avgMs: number;
  maxMs: number;
  firstMs: number | null;
};

export type AgentLlmTokenCostDto = {
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

export type AgentLlmContextBudgetRecommendationDto = {
  mode: 'standard' | 'strict';
  reasons: string[];
  calls: number;
  avgApproxPromptChars: number;
  avgBillableInputTokens: number;
  promptCacheHitRate: number | null;
  distinctPromptPrefixHashes: number;
  distinctDynamicContextHashes: number;
};

export type AgentExecutionCostSummaryDto = {
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

export type AgentRunCostSummaryDto = {
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
  promptCacheHitRate: number | null;
  estimatedBillableInputTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  reportedTokenCount: number;
  approxPromptChars: number;
  models: string[];
  llmUseCases: Record<string, number>;
  tools: Record<
    string,
    {
      calls: number;
      observed: number;
      failed: number;
      blocked: number;
    }
  >;
};

export type AgentObservabilityDto = {
  startedAt: string;
  counters: Record<string, number>;
  latency: Record<string, AgentObservabilityLatencyDto>;
  llmTokenCost?: Record<string, AgentLlmTokenCostDto>;
  executionCostSummary?: AgentExecutionCostSummaryDto;
  recentRunCostSummary?: AgentRunCostSummaryDto[];
  llmContextBudgetRecommendations?: Record<
    string,
    AgentLlmContextBudgetRecommendationDto
  >;
  failureReasons: Record<string, number>;
  queueDepth: Record<string, number>;
  alerts: AgentObservabilityAlertDto[];
};

export type AgentCacheSummaryDto = {
  hits: number;
  misses: number;
  total: number;
  hitRate: number;
  savedApproxPromptChars: number;
};

export type AgentPromptFingerprintSummaryDto = {
  observations: number;
  distinctPromptPrefixHashes: number;
  distinctDynamicContextHashes: number;
  promptPrefixReuseRate: number;
};

export type SocialAgentRuntimeMetricsDto = {
  tokenOptimizationSummary?: {
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
  cacheEfficiencySummary?: {
    toolResult: AgentCacheSummaryDto;
    llmOutput: AgentCacheSummaryDto;
    embedding?: AgentCacheSummaryDto;
    combined: AgentCacheSummaryDto;
  };
  workflowEfficiencySummary?: {
    total: number;
    totalIntentRoutes: number;
    workflowRouteRate: number;
    estimatedAvoidedLlmCalls: number;
    byIntent: Record<string, number>;
    byReason: Record<string, number>;
  };
  deterministicRouteEfficiencySummary?: {
    total: number;
    estimatedAvoidedLlmCalls: number;
    byIntent: Record<string, number>;
  };
  deterministicActionEfficiencySummary?: {
    total: number;
    estimatedAvoidedLlmCalls: number;
    byAction: Record<string, number>;
  };
  toolResultCacheSummary?: Record<string, AgentCacheSummaryDto>;
  llmOutputCacheSummary?: Record<string, AgentCacheSummaryDto>;
  llmPromptFingerprintSummary?: Record<
    string,
    AgentPromptFingerprintSummaryDto
  >;
  embeddingCacheSummary?: Record<string, AgentCacheSummaryDto>;
};

export type SocialAgentMessageFeedbackDto = {
  id: number;
  ownerUserId: number;
  agentTaskId: number | null;
  messageId: string;
  value: 'positive' | 'negative';
  reason: string | null;
  runId: string | null;
  traceId: string | null;
  source: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentL5DashboardDto = {
  summary: AgentL5DashboardSummary;
  replaySamples: AgentOnlineReplaySampleDto[];
  subagentMemory: AgentSubagentMemoryDto[];
  meetLoopStates: AgentMeetLoopStateDto[];
  patchEffects: AgentSkillPatchEffectDto[];
  autoRuns: AgentSkillPatchDto[];
  messageFeedback?: SocialAgentMessageFeedbackDto[];
  observability?: AgentObservabilityDto;
  socialAgentMetrics?: SocialAgentRuntimeMetricsDto;
  workerJobs?: SubagentWorkerJobDto[];
  workerHeartbeats?: SubagentWorkerHeartbeatDto[];
  workerFailures?: SubagentWorkerFailureDto[];
};

export type SubagentWorkerJobDto = {
  id: number;
  agentName: string;
  queueName: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  priority: number;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedUntil: string | null;
  runId: string | null;
  traceId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubagentWorkerHeartbeatDto = {
  id: number;
  workerId: string;
  queueName: string;
  status: 'idle' | 'running' | 'failed';
  activeJobId: number | null;
  lastSeenAt: string;
  metadata: Record<string, unknown>;
};

export type SubagentWorkerFailureDto = {
  id: number;
  jobId: number;
  agentName: string;
  queueName: string;
  workerId: string | null;
  error: string;
  context: Record<string, unknown>;
  createdAt: string;
};

export const agentL5RuntimeApi = {
  dashboard(limit = 30) {
    return requestProtected<AgentL5DashboardDto>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.dashboard, { limit }),
    );
  },
  replaySamples(limit = 50) {
    return requestProtected<AgentOnlineReplaySampleDto[]>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.replaySamples, { limit }),
    );
  },
  subagentMemory(input?: { agentName?: string; limit?: number }) {
    return requestProtected<AgentSubagentMemoryDto[]>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.subagentMemory, input),
    );
  },
  meetLoopStates(input?: { stage?: string; limit?: number }) {
    return requestProtected<AgentMeetLoopStateDto[]>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.meetLoopStates, input),
    );
  },
  patchEffects(input?: { patchId?: number; limit?: number }) {
    return requestProtected<AgentSkillPatchEffectDto[]>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.patchEffects, input),
    );
  },
  autoRuns(limit = 50) {
    return requestProtected<AgentSkillPatchDto[]>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.autoRuns, { limit }),
    );
  },
  observability() {
    return requestProtected<AgentObservabilityDto>(
      fitMeetCoreEndpoints.socialAgentL5.observability,
    );
  },
  recordSatisfaction(input: {
    score: number;
    source?: string;
    traceId?: string | null;
  }) {
    return requestProtected<AgentObservabilityDto>(
      fitMeetCoreEndpoints.socialAgentL5.recordSatisfaction,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );
  },
  subagentWorkerJobs(input?: {
    status?: string;
    queueName?: string;
    limit?: number;
  }) {
    return requestProtected<SubagentWorkerJobDto[]>(
      withQuery(fitMeetCoreEndpoints.socialAgentL5.subagentWorkerJobs, input),
    );
  },
  requeueSubagentWorkerJob(id: number) {
    return requestProtected<SubagentWorkerJobDto>(
      fitMeetCoreEndpoints.socialAgentL5.requeueSubagentWorkerJob(id),
      { method: 'POST', body: JSON.stringify({}) },
    );
  },
  cancelSubagentWorkerJob(id: number) {
    return requestProtected<SubagentWorkerJobDto>(
      fitMeetCoreEndpoints.socialAgentL5.cancelSubagentWorkerJob(id),
      { method: 'POST', body: JSON.stringify({}) },
    );
  },
  runAutoRunnerOnce() {
    return requestProtected<{
      createdPatchIds: number[];
      evaluatedPatchIds: number[];
      autoPublishedPatchIds: number[];
      pendingReviewPatchIds: number[];
      reconciled: Array<{ patchId: number; decision: AgentCanaryDecision }>;
    }>(fitMeetCoreEndpoints.socialAgentSelfImprove.runnerRunOnce, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};

function withQuery(
  path: string,
  params?: Record<string, string | number | undefined>,
) {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  });
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}
