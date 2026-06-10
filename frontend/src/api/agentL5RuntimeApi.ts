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

export type AgentObservabilityDto = {
  startedAt: string;
  counters: Record<string, number>;
  latency: Record<string, AgentObservabilityLatencyDto>;
  failureReasons: Record<string, number>;
  queueDepth: Record<string, number>;
  alerts: AgentObservabilityAlertDto[];
};

export type AgentL5DashboardDto = {
  summary: AgentL5DashboardSummary;
  replaySamples: AgentOnlineReplaySampleDto[];
  subagentMemory: AgentSubagentMemoryDto[];
  meetLoopStates: AgentMeetLoopStateDto[];
  patchEffects: AgentSkillPatchEffectDto[];
  autoRuns: AgentSkillPatchDto[];
  observability?: AgentObservabilityDto;
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
