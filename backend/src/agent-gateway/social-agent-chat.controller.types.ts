import type { Request } from 'express';

import type { AgentTaskPermissionMode } from './entities/agent-task.entity';
import type {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
} from './social-agent-planner.service';
import type { AgentRunInterruptPayload } from './agent-run-checkpoint.service';
import type { SocialAgentRuntimeResumeMetadata } from './social-agent-chat.types';

export type FitMeetRequest = Request & {
  user: { id: number };
};

export type SocialAgentRunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  conversationIntent?: 'conversation' | 'social' | 'approval' | null;
  taskId?: number | null;
  city?: string | null;
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
    interrupt?: AgentRunInterruptPayload | null;
    stepId?: string | null;
    sourceCheckpointId?: number | null;
    approvalId?: number | null;
    sourceStepId?: string | null;
    sourceStep?: SocialAgentRuntimeResumeMetadata['sourceStep'];
    stepScope?: SocialAgentRuntimeResumeMetadata['stepScope'];
    sideEffectPolicy?: SocialAgentRuntimeResumeMetadata['sideEffectPolicy'];
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

export type SocialAgentReplanRunBody = {
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
    interrupt?: AgentRunInterruptPayload | null;
    stepId?: string | null;
    sourceCheckpointId?: number | null;
    approvalId?: number | null;
    sourceStepId?: string | null;
    sourceStep?: SocialAgentRuntimeResumeMetadata['sourceStep'];
    stepScope?: SocialAgentRuntimeResumeMetadata['stepScope'];
    sideEffectPolicy?: SocialAgentRuntimeResumeMetadata['sideEffectPolicy'];
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

export type SocialAgentThreadUpdateBody = {
  title?: string | null;
  branchSnapshot?: {
    activeBranchId?: string | null;
    branchSelections?: Record<string, number> | null;
    branchCount?: number | null;
    parentMessageId?: string | null;
    updatedAt?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type SocialAgentMessageFeedbackBody = {
  value?: 'positive' | 'negative' | null;
  reason?: string | null;
  taskId?: number | null;
  runId?: string | null;
  traceId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SocialAgentUserInterestEventBody = {
  eventType?: string | null;
  taskId?: number | null;
  targetUserId?: number | null;
  candidateRecordId?: number | null;
  socialRequestId?: number | null;
  activityId?: number | null;
  weight?: number | null;
  activityTags?: string[] | null;
  candidatePreferenceTags?: string[] | null;
  city?: string | null;
  locationText?: string | null;
  timeWindow?: string | null;
  source?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SocialAgentFeedbackEventBody = {
  taskId?: number | null;
  publicIntentId?: string | null;
  matchingJobId?: number | null;
  candidateId?: number | null;
  candidateRecordId?: number | null;
  feedbackType?: string | null;
  reasonCode?: string | null;
  freeText?: string | null;
  appliesToCurrentTask?: boolean | null;
  appliesToFutureProfile?: boolean | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SocialAgentCheckpointActionBody = {
  decision?: 'approved' | 'rejected' | null;
  reason?: string | null;
};

export type SocialAgentSendMessageBody = {
  targetUserId?: number;
  candidateUserId?: number;
  message?: string;
  suggestedOpener?: string;
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  candidate?: Record<string, unknown>;
};

export type SocialAgentSaveCandidateBody = {
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  targetUserId?: number | null;
  candidate?: Record<string, unknown>;
};

export type SocialAgentConnectCandidateBody = {
  targetUserId?: number | null;
  candidateUserId?: number | null;
  candidateRecordId?: number | null;
  publicIntentId?: string | null;
  socialRequestId?: number | null;
  candidate?: Record<string, unknown>;
};
