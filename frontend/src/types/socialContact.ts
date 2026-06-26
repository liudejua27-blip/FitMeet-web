export type ApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type ConnectionRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type FriendshipStatus = 'none' | 'active' | 'removed';

export type MessagePermission =
  | 'none'
  | 'opener_available'
  | 'awaiting_reply'
  | 'open'
  | 'closed';

export type ConversationProvisioningStatus =
  | 'none'
  | 'provisioning'
  | 'ready'
  | 'failed';

export type ContactContextType =
  | 'agent_candidate'
  | 'connection_request'
  | 'public_intent_application'
  | 'friendship'
  | 'meet';

export interface PublicIntentApplication {
  id: number;
  publicIntentId: string;
  ownerUserId: number;
  applicantUserId: number;
  status: ApplicationStatus;
  message: string;
  meetId: number | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptPublicIntentApplicationResponse {
  applicationId: number;
  status: 'accepted';
  meetId: number | null;
  conversation: {
    status: Exclude<ConversationProvisioningStatus, 'none' | 'failed'>;
    conversationId: string | null;
  };
}

export interface ConnectionRequest {
  id: number;
  requesterId: number;
  targetUserId: number;
  status: ConnectionRequestStatus;
  message: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  friendshipId?: number;
}

export interface RelationshipState {
  userId: number;
  following: boolean;
  friendship: Exclude<FriendshipStatus, 'removed'>;
  connectionRequest:
    | 'none'
    | 'pending_incoming'
    | 'pending_outgoing'
    | 'accepted';
  messagePermission: MessagePermission;
  conversationId: string | null;
  blocked: boolean;
}

export interface SocialContactFriend {
  id: number;
  name: string;
  avatar: string | null;
  color?: string | null;
  city?: string | null;
  status?: 'online' | 'offline';
}

export interface ConversationStartResult {
  id?: string | number;
  conversationId?: string;
  targetUserId?: number;
  preexisting?: boolean;
}

export interface RealtimeEnvelope {
  eventId: string;
  eventType: string;
  userId?: number;
  payload: Record<string, unknown>;
  createdAt?: string;
}
