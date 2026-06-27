import { request } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';
import type {
  AcceptPublicIntentApplicationResponse,
  ConnectionRequest,
  ContactContextType,
  ConversationStartResult,
  PublicIntentApplication,
  RelationshipState,
  SocialContactFriend,
} from '../types/socialContact';

type IdempotentInput = {
  idempotencyKey: string;
};

export function createPublicIntentApplication({
  publicIntentId,
  message,
  idempotencyKey,
}: {
  publicIntentId: string;
  message: string;
} & IdempotentInput): Promise<PublicIntentApplication> {
  return request<PublicIntentApplication>(
    fitMeetCoreEndpoints.discover.publicSocialIntentApplications(publicIntentId),
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify({ message }),
    },
  );
}

export function listMyPublicIntentApplications({
  role,
}: {
  role: 'owner' | 'applicant';
}): Promise<PublicIntentApplication[]> {
  const search = new URLSearchParams({ role });
  return request<PublicIntentApplication[]>(
    `${fitMeetCoreEndpoints.discover.myPublicIntentApplications}?${search.toString()}`,
  );
}

export function listPublicIntentApplications(
  publicIntentId: string,
): Promise<PublicIntentApplication[]> {
  return request<PublicIntentApplication[]>(
    fitMeetCoreEndpoints.discover.publicSocialIntentApplications(publicIntentId),
  );
}

export function acceptPublicIntentApplication({
  applicationId,
  idempotencyKey,
}: {
  applicationId: number;
} & IdempotentInput): Promise<AcceptPublicIntentApplicationResponse> {
  return request<AcceptPublicIntentApplicationResponse>(
    fitMeetCoreEndpoints.discover.acceptPublicIntentApplication(applicationId),
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify({}),
    },
  );
}

export function rejectPublicIntentApplication({
  applicationId,
  idempotencyKey,
}: {
  applicationId: number;
} & IdempotentInput): Promise<PublicIntentApplication> {
  return request<PublicIntentApplication>(
    fitMeetCoreEndpoints.discover.rejectPublicIntentApplication(applicationId),
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify({}),
    },
  );
}

export function cancelPublicIntentApplication({
  applicationId,
  idempotencyKey,
}: {
  applicationId: number;
} & IdempotentInput): Promise<PublicIntentApplication> {
  return request<PublicIntentApplication>(
    fitMeetCoreEndpoints.discover.cancelPublicIntentApplication(applicationId),
    {
      method: 'POST',
      headers: idempotencyHeaders(idempotencyKey),
      body: JSON.stringify({}),
    },
  );
}

export function getRelationshipState(userId: number): Promise<RelationshipState> {
  return request<RelationshipState>(fitMeetCoreEndpoints.friends.relationshipState(userId));
}

export function createConnectionRequest({
  targetUserId,
  message,
  idempotencyKey,
}: {
  targetUserId: number;
  message: string;
  sourceType?: string;
  sourceId?: string;
} & IdempotentInput): Promise<ConnectionRequest> {
  return request<ConnectionRequest>(fitMeetCoreEndpoints.friends.createConnectionRequest, {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: JSON.stringify({ targetUserId, message }),
  });
}

export function listConnectionRequests({
  box,
  status = 'pending',
}: {
  box: 'inbox' | 'outbox';
  status?: string;
}): Promise<ConnectionRequest[]> {
  const search = new URLSearchParams({ box, status });
  return request<ConnectionRequest[]>(
    `${fitMeetCoreEndpoints.friends.listConnectionRequests}?${search.toString()}`,
  );
}

export function acceptConnectionRequest({
  requestId,
  idempotencyKey,
}: {
  requestId: number;
} & IdempotentInput): Promise<ConnectionRequest> {
  return request<ConnectionRequest>(fitMeetCoreEndpoints.friends.acceptConnectionRequest(requestId), {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: JSON.stringify({}),
  });
}

export function rejectConnectionRequest({
  requestId,
  idempotencyKey,
}: {
  requestId: number;
} & IdempotentInput): Promise<ConnectionRequest> {
  return request<ConnectionRequest>(fitMeetCoreEndpoints.friends.rejectConnectionRequest(requestId), {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: JSON.stringify({}),
  });
}

export function cancelConnectionRequest({
  requestId,
  idempotencyKey,
}: {
  requestId: number;
} & IdempotentInput): Promise<ConnectionRequest> {
  return request<ConnectionRequest>(fitMeetCoreEndpoints.friends.cancelConnectionRequest(requestId), {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: JSON.stringify({}),
  });
}

export function listFriends(): Promise<SocialContactFriend[]> {
  return request<SocialContactFriend[] | { data?: SocialContactFriend[] }>(
    fitMeetCoreEndpoints.friends.list,
  ).then((response) => (Array.isArray(response) ? response : response.data ?? []));
}

export function deleteFriend(userId: number): Promise<{
  removed: boolean;
  friendship: 'none' | 'removed';
}> {
  return request(fitMeetCoreEndpoints.friends.deleteFriend(userId), {
    method: 'DELETE',
  });
}

export function startContextualConversation({
  targetUserId,
  contextType,
  contextId,
  initialMessage,
  idempotencyKey,
}: {
  targetUserId: number;
  contextType: ContactContextType;
  contextId: string;
  initialMessage?: string;
} & IdempotentInput): Promise<ConversationStartResult> {
  return request<ConversationStartResult>(fitMeetCoreEndpoints.messages.startConversation, {
    method: 'POST',
    headers: idempotencyHeaders(idempotencyKey),
    body: JSON.stringify({
      targetUserId,
      contextType,
      contextId,
      initialMessage,
    }),
  });
}

function idempotencyHeaders(idempotencyKey: string): HeadersInit {
  return { 'Idempotency-Key': idempotencyKey };
}
