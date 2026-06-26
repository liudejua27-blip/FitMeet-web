import type { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import type { AgentTask } from './entities/agent-task.entity';
import {
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import type { CandidateExplanation } from './candidate-explanation.service';
import type { CandidatePoolDebugReasons } from './social-agent-candidate-pool.service';
import type {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
  SocialAgentPlannerResult,
} from './social-agent-planner.service';
import type {
  SocialAgentIntentEntities,
  SocialAgentIntentType,
  SocialAgentReplyStrategy,
} from './social-agent-intent-router.service';
import type { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type {
  FitMeetAgentSafety,
  FitMeetAgentTrace,
  FitMeetAlphaCard,
} from './fitmeet-alpha-agent.types';
import type { AgentLoopRun, SubagentHandoffResult } from './agent-loop.types';
import type {
  UserFacingAgentPublicLoop,
  UserFacingAgentResponse,
} from './user-facing-agent-response';

export interface SocialAgentVisibleStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
  kind?: string;
  agentName?: string | null;
  toolName?: string | null;
  snapshot?: SocialAgentVisibleStepSnapshot;
}

export interface SocialAgentVisibleStepSnapshot {
  schemaVersion: 'fitmeet.step-snapshot.v1';
  observation: string[];
  critique: string;
  result: string;
}

export interface SocialAgentChatCandidate {
  agentTaskId: number;
  source?: 'profile_candidate' | 'public_intent' | 'activity';
  isRealData?: boolean;
  socialRequestId: number | null;
  targetUserId: number;
  userId: number;
  candidateUserId?: number;
  publicIntentId?: string | null;
  activityId?: number | null;
  displayName?: string;
  candidateRecordId: number | null;
  nickname: string;
  avatar: string;
  color: string;
  city: string;
  score: number;
  level: string;
  distanceKm: number | null;
  commonTags: string[];
  reasons: string[];
  interestTags?: string[];
  profileCompleteness?: number;
  dataQuality?: 'complete' | 'partial' | 'incomplete';
  matchScore?: number;
  matchReasons?: string[];
  riskWarnings?: string[];
  recentPublicActivity?: string[];
  risk: { level: string; warnings: string[] };
  suggestedOpener?: string;
  suggestedMessage: string;
  reasonerSource?: 'deepseek' | 'fallback';
  reasoningConfidence?: number;
  reasoningDegraded?: boolean;
  reasoningRetryable?: boolean;
  degradationReason?: string | null;
  degraded?: boolean;
  retryable?: boolean;
  matchReasoner?: {
    source?: 'deepseek' | 'fallback';
    confidence?: number;
    degraded?: boolean;
    retryable?: boolean;
    degradationReason?: string | null;
  };
  candidateExplanation?: CandidateExplanation;
  emotionalInsight?: {
    fitReason: string;
    openerAdvice: string;
    possibleAwkwardness: string;
    safeFirstStep: string;
    tone?: 'gentle' | 'active' | 'careful';
  };
  status?: string;
}

export interface SocialAgentChatRunResult {
  taskId: number;
  status: AgentTaskStatus;
  visibleSteps: SocialAgentVisibleStep[];
  assistantMessage: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  emptyReason?: 'no_real_candidates' | null;
  message?: string | null;
  debugReasons?: CandidatePoolDebugReasons | null;
  socialRequestDraft:
    | (CreateSocialRequestDto & {
        agentTaskId: number;
        socialRequestId?: number | null;
        mode: 'draft';
        card?: Record<string, unknown>;
        profileUsed?: Record<string, unknown>;
        visibilityConsent?: boolean;
        autoPublished?: boolean;
        publicIntentId?: string | null;
        discoverHref?: string | null;
        publishPolicy?: string | null;
        publishBlockedReason?: string | null;
      })
    | null;
  candidates: SocialAgentChatCandidate[];
  approvalRequiredActions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  cards?: FitMeetAlphaCard[];
  lifeGraphWritebackProposal?: Record<string, unknown> | null;
  safety?: FitMeetAgentSafety;
  publicLoop?: UserFacingAgentPublicLoop;
  traceId?: string;
  agentTrace?: FitMeetAgentTrace;
  structuredIntent?: Record<string, unknown>;
  assistantStreamed?: boolean;
  agentLoop?: AgentLoopRun;
  subagentHandoffs?: SubagentHandoffResult[];
  runtime?: {
    runId?: string | null;
    messageId?: string | null;
    checkpointId?: number | null;
    checkpointType?: string | null;
    canResume?: boolean;
    canReplay?: boolean;
    canFork?: boolean;
    parentCheckpointId?: number | null;
    threadId?: string | null;
    idempotencyKey?: string | null;
    checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    resumeCursor?: {
      threadId?: string | null;
      checkpointId?: number | string | null;
      parentCheckpointId?: number | string | null;
      action?: 'resume' | 'retry' | 'replay' | 'fork' | null;
      stepId?: string | null;
    } | null;
    sourceStep?: {
      stepId: string;
      label: string | null;
      toolName: string | null;
    } | null;
    stepScope?: {
      mode: 'full_checkpoint' | 'through_step';
      stepCount: number;
      sourceCheckpointId: number | null;
    } | null;
    sideEffectPolicy?: {
      idempotencyKey: string;
      sideEffectsBeforeResume: 'idempotent_only';
      duplicatePolicy: 'reuse_idempotency_key';
    } | null;
  };
}

export type SocialAgentRuntimeResumeMetadata = NonNullable<
  SocialAgentChatRunResult['runtime']
>;

export type SocialAgentChatStreamEvent =
  | { type: 'task'; taskId: number; status: AgentTaskStatus }
  | { type: 'step'; step: SocialAgentVisibleStep }
  | {
      type: 'assistant_delta';
      delta: string;
      messageId?: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'assistant_done';
      messageId?: string;
      source?: 'llm' | 'fallback';
    }
  | {
      type: 'result';
      result: SocialAgentChatRunResult;
      assistantStreamed?: boolean;
    }
  | { type: 'error'; message: string };

export type SocialAgentAssistantMessageSource =
  | 'llm'
  | 'fallback'
  | 'deterministic_route'
  | 'deterministic_action';

export type SocialAgentRequestDraft = NonNullable<
  SocialAgentChatRunResult['socialRequestDraft']
>;

export type SocialAgentChatRunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  taskId?: number | null;
  city?: string | null;
  idempotencyKey?: string | null;
  clientContext?: {
    timezone?: string | null;
    locale?: string | null;
    source?: string | null;
    threadId?: string | null;
    checkpointId?: number | null;
    parentCheckpointId?: number | null;
    resumeCursor?: {
      threadId: string;
      checkpointId: number;
      parentCheckpointId: number | null;
      action: 'resume' | 'retry' | 'replay' | 'fork';
      stepId?: string | null;
    } | null;
    stepId?: string | null;
    sourceCheckpointId?: number | null;
    approvalId?: number | null;
    sourceStepId?: string | null;
    sourceStep?: {
      stepId: string;
      label: string | null;
      toolName: string | null;
    } | null;
    stepScope?: {
      mode: 'full_checkpoint' | 'through_step';
      stepCount: number;
      sourceCheckpointId: number | null;
    } | null;
    sideEffectPolicy?: {
      idempotencyKey: string;
      sideEffectsBeforeResume: 'idempotent_only';
      duplicatePolicy: 'reuse_idempotency_key';
    } | null;
    resumeMode?:
      | 'resume'
      | 'resume_after_approval'
      | 'resume_after_rejection'
      | 'retry'
      | 'replay'
      | 'fork'
      | null;
    resumeIdempotencyKey?: string | null;
    checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    decision?: 'approved' | 'rejected' | null;
  } | null;
};

export type SocialAgentChatReplanRunBody = {
  userMessage?: string | null;
  reason?: SocialAgentPlanReason;
  failure?: SocialAgentPlanFailureContext | null;
};

export type SocialAgentRouteMessageBody = {
  message?: string | null;
  conversationIntent?: 'conversation' | 'social' | 'approval' | null;
  taskId?: number | null;
  hasCandidates?: boolean;
  idempotencyKey?: string | null;
  clientContext?: {
    timezone?: string | null;
    locale?: string | null;
    source?: string | null;
    threadId?: string | null;
    conversationIntent?: 'conversation' | 'social' | 'approval' | null;
    checkpointId?: number | null;
    parentCheckpointId?: number | null;
    resumeCursor?: {
      threadId: string;
      checkpointId: number;
      parentCheckpointId: number | null;
      action: 'resume' | 'retry' | 'replay' | 'fork';
      stepId?: string | null;
    } | null;
    stepId?: string | null;
    sourceCheckpointId?: number | null;
    approvalId?: number | null;
    sourceStepId?: string | null;
    sourceStep?: {
      stepId: string;
      label: string | null;
      toolName: string | null;
    } | null;
    stepScope?: {
      mode: 'full_checkpoint' | 'through_step';
      stepCount: number;
      sourceCheckpointId: number | null;
    } | null;
    sideEffectPolicy?: {
      idempotencyKey: string;
      sideEffectsBeforeResume: 'idempotent_only';
      duplicatePolicy: 'reuse_idempotency_key';
    } | null;
    resumeMode?:
      | 'resume'
      | 'resume_after_approval'
      | 'resume_after_rejection'
      | 'retry'
      | 'replay'
      | 'fork'
      | null;
    resumeIdempotencyKey?: string | null;
    checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    decision?: 'approved' | 'rejected' | null;
  } | null;
};

export type StreamEmit = (
  event: SocialAgentChatStreamEvent,
) => void | Promise<void>;

export type SocialAgentStreamOptions = {
  signal?: AbortSignal | null;
  deferAssistantMessageLog?: boolean;
};

export type SocialAgentIntentAction =
  | 'answer'
  | 'reply'
  | 'save_context'
  | 'queue_search'
  | 'queue_replan'
  | 'await_confirmation'
  | 'clarify';

export interface SocialAgentIntentRouteResult {
  intent: SocialAgentIntentType;
  confidence: number;
  entities: SocialAgentIntentEntities;
  shouldSearch: boolean;
  shouldReplan: boolean;
  shouldUpdateProfile: boolean;
  shouldExecuteAction: boolean;
  replyStrategy: SocialAgentReplyStrategy;
  source: 'rules' | 'deepseek';
  action: SocialAgentIntentAction;
  taskId: number | null;
  assistantMessage: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  savedContext: boolean;
  profileUpdated: boolean;
  shouldQueueRun: boolean;
  runMode: 'initial' | 'follow_up' | null;
  queuedRun?: SocialAgentAsyncRunSnapshot | null;
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
  activityResults?: SocialAgentActivityResult[];
  profileUpdateProposal?: LifeGraphProposalDto | null;
  lifeGraphWritebackProposal?: Record<string, unknown> | null;
  cards?: FitMeetAlphaCard[];
  safety?: FitMeetAgentSafety;
  publicLoop?: UserFacingAgentPublicLoop;
  permissionMode?: AgentTaskPermissionMode;
  traceId?: string;
  agentTrace?: FitMeetAgentTrace;
  structuredIntent?: Record<string, unknown>;
  assistantStreamed?: boolean;
  agentLoop?: AgentLoopRun;
  subagentHandoffs?: SubagentHandoffResult[];
  runtime?: SocialAgentRuntimeResumeMetadata;
}

export interface SocialAgentPendingApprovalSnapshot {
  id: number;
  type: ApprovalType;
  actionType: string;
  summary: string;
  riskLevel: ApprovalRiskLevel;
  payload: Record<string, unknown>;
  expiresAt: string | null;
}

export interface SocialAgentActivityResult {
  id: string;
  source: 'public_intent' | 'activity';
  isRealData?: boolean;
  activityId?: number | null;
  publicIntentId?: string | null;
  title: string;
  description: string;
  city: string;
  loc: string;
  requestType: string;
  interestTags: string[];
  timePreference: string;
  ownerUserId: number | null;
  status: string;
  createdAt: string | null;
  matchScore?: number;
  matchReasons?: string[];
}

export type ExtractedProfileFields = Record<string, string | string[]>;

export interface SocialAgentSessionMessage {
  id: string;
  role: 'user' | 'assistant';
  kind?: 'text' | 'risk' | 'approval';
  content: string;
  createdAt: string | null;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApprovalSnapshot;
}

export interface SocialAgentSessionTaskSummary {
  id: number;
  status: AgentTaskStatus;
  title: string;
  goal: string;
  permissionMode: AgentTaskPermissionMode;
  statusReason: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SocialAgentSessionSnapshot {
  hasSession: boolean;
  activeTaskId: number | null;
  task: SocialAgentSessionTaskSummary | null;
  messages: SocialAgentSessionMessage[];
  events: Array<Record<string, unknown>>;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  userFacingResult: UserFacingAgentResponse | null;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  pendingApprovals: SocialAgentPendingApprovalSnapshot[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}

export interface SocialAgentCurrentTaskSnapshot {
  taskId: number;
  status: AgentTaskStatus;
  agentState?: string;
  taskType: string;
  title: string;
  goal: string;
  memory: Record<string, unknown>;
  result: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
}

export interface SocialAgentTimelineMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  kind:
    | 'text'
    | 'status'
    | 'candidates'
    | 'activityResults'
    | 'approval'
    | 'risk'
    | 'tool';
  text: string;
  createdAt: string | null;
  candidates?: SocialAgentChatCandidate[];
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
  toolCalls?: Array<Record<string, unknown>>;
}

export interface SocialAgentTaskTimelineSnapshot {
  taskId: number;
  messages: SocialAgentTimelineMessage[];
  task: SocialAgentSessionTaskSummary;
  memory: Record<string, unknown>;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  events: Array<Record<string, unknown>>;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  pendingApprovals: SocialAgentPendingApprovalSnapshot[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}

export type SocialAgentCandidateSearchResult = {
  candidates: SocialAgentChatCandidate[];
  emptyReason: 'no_real_candidates' | null;
  message: string | null;
  debugReasons: CandidatePoolDebugReasons | null;
};

export interface SocialAgentChatReplanRunResult extends SocialAgentChatRunResult {
  replan: SocialAgentPlannerResult;
}

export type SocialAgentAsyncRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export interface SocialAgentAsyncRunSnapshot {
  taskId: number;
  runId: string;
  status: SocialAgentAsyncRunStatus;
  phase: string;
  message: string;
  visibleSteps: SocialAgentVisibleStep[];
  queuedAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  pollAfterMs: number;
  taskStatus?: AgentTaskStatus;
  error?: Record<string, unknown> | null;
  replan?: SocialAgentPlannerResult | null;
  result?: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
}

export interface SocialAgentAppendContextResult {
  taskId: number;
  saved: true;
  eventType: AgentTaskEventType.SocialAgentContextAppended;
  userMessage: string;
  previousGoal: string;
  refreshedGoal: string;
  appendedAt: string;
}

export type SocialAgentFollowUpContext = {
  task: AgentTask;
  userMessage: string;
  previousGoal: string;
  refreshedGoal: string;
  appendedAt: string;
  alreadyAppended: boolean;
};
