import type { SocialAgentRouteMessageBody } from './social-agent-chat.types';

export type SocialAgentCardExecutableAction =
  | import('./fitmeet-alpha-agent.types').FitMeetAgentSchemaAction
  | 'connect_candidate';
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
  action?: SocialAgentCardExecutableAction | null;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  clientContext?: SocialAgentRouteMessageBody['clientContext'];
};
