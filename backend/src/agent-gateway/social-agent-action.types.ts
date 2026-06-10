import type { FitMeetAgentSchemaAction } from './fitmeet-alpha-agent.types';

export type CandidateTargetBody = {
  targetUserId?: unknown;
  candidateUserId?: unknown;
  toUserId?: unknown;
  recipientUserId?: unknown;
  recipientId?: unknown;
  receiverId?: unknown;
  userId?: unknown;
  followingId?: unknown;
  publicIntentId?: unknown;
  socialRequestId?: unknown;
  candidateRecordId?: unknown;
  candidate?: Record<string, unknown> | null;
};

export type SocialAgentCardActionBody = {
  action?: FitMeetAgentSchemaAction | null;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};
