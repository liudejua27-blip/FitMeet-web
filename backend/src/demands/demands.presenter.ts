import { Demand } from './demand.entity';
import {
  DemandInvitation,
  DemandInvitationStatus,
} from './demand-invitation.entity';

export function serializeDemand(demand: Demand) {
  return {
    id: demand.id,
    type: demand.type,
    title: demand.title,
    summary: demand.summary ?? '',
    fields: Array.isArray(demand.fields) ? demand.fields.slice(0, 6) : [],
    visibility: demand.visibility,
    hallTarget: demand.hallTarget,
    category: demand.category ?? '',
    status: demand.status,
    ownerId: String(demand.ownerUserId),
    createdAt: demand.createdAt?.toISOString?.() ?? null,
    updatedAt: demand.updatedAt?.toISOString?.() ?? null,
    sourceConversationId: demand.sourceConversationId ?? null,
    matchingPolicy: demand.matchingPolicy ?? {},
    safetyFlags: Array.isArray(demand.safetyFlags) ? demand.safetyFlags : [],
    publicIntentId: demand.publicIntentId ?? null,
    taskIntentId: demand.taskIntentId ?? null,
    candidateCount: demand.candidateCount ?? 0,
  };
}

export type SerializedDemand = ReturnType<typeof serializeDemand>;

export function serializeDemandInvitation(invitation: DemandInvitation) {
  return {
    id: invitation.id,
    inviterUserId: invitation.inviterUserId,
    inviteeUserId: invitation.inviteeUserId,
    sourceType: invitation.sourceType,
    sourceId: invitation.sourceId ?? null,
    candidateRecordId: invitation.candidateRecordId ?? null,
    publicIntentId: invitation.publicIntentId ?? null,
    demandId: invitation.demandId ?? null,
    title: invitation.title,
    message: invitation.message,
    activityType: invitation.activityType,
    city: invitation.city ?? null,
    locationText: invitation.locationText ?? null,
    timeWindow: invitation.timeWindow ?? null,
    capacityMin: invitation.capacityMin ?? null,
    capacityMax: invitation.capacityMax ?? null,
    status: invitation.status,
    proposedMeetId: invitation.proposedMeetId ?? null,
    acceptedMeetId: invitation.acceptedMeetId ?? null,
    conversation:
      invitation.status === DemandInvitationStatus.Accepted
        ? {
            status: invitation.conversationId ? 'ready' : 'provisioning',
            conversationId: invitation.conversationId ?? null,
          }
        : null,
    expiresAt: invitation.expiresAt?.toISOString?.() ?? null,
    resolvedAt: invitation.resolvedAt?.toISOString?.() ?? null,
    createdAt: invitation.createdAt?.toISOString?.() ?? null,
    updatedAt: invitation.updatedAt?.toISOString?.() ?? null,
  };
}

export function serializeDemandInvitationAcceptResponse(
  invitation: DemandInvitation,
) {
  return {
    invitationId: invitation.id,
    status: invitation.status,
    meetId: invitation.acceptedMeetId ?? invitation.proposedMeetId ?? null,
    conversation: {
      status: invitation.conversationId ? 'ready' : 'provisioning',
      conversationId: invitation.conversationId ?? null,
    },
  };
}
