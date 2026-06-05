import type { Request } from 'express';

import type { AgentTaskPermissionMode } from './entities/agent-task.entity';
import type {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
} from './social-agent-planner.service';

export type FitMeetRequest = Request & {
  user: { id: number };
};

export type SocialAgentRunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  idempotencyKey?: string | null;
};

export type SocialAgentReplanRunBody = {
  userMessage?: string | null;
  reason?: SocialAgentPlanReason;
  failure?: SocialAgentPlanFailureContext | null;
};

export type SocialAgentRouteMessageBody = {
  message?: string | null;
  taskId?: number | null;
  hasCandidates?: boolean;
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
