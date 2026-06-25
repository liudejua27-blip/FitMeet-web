export const REALTIME_EVENT_TYPES = [
  'agent:thinking',
  'agent:tool_call',
  'agent:tool_result',
  'agent:candidates',
  'agent:approval_required',
  'agent:completed',
  'agent:error',
  'message:new',
  'message:read',
  'conversation:created',
  'conversation:updated',
  'conversation.ready',
  'friend:request',
  'friend:accepted',
  'friend:rejected',
  'activity:invitation',
  'activity:confirmed',
  'activity:checked_in',
  'activity:completed',
  'activity:cancelled',
  'life_graph:proposal_created',
  'life_graph:updated',
  'life_graph:field_revoked',
  'life_graph:completeness_changed',
  'notification:new',
  'notification:read',
  'notification:cleared',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export type RealtimeEventEnvelope<TPayload = unknown> = {
  eventId: string;
  eventType: RealtimeEventType;
  userId: number;
  payload: TPayload;
  createdAt: string;
  traceId?: string;
};

export type EmitRealtimeEventInput<TPayload = unknown> = {
  userId: number;
  eventType: RealtimeEventType;
  payload?: TPayload;
  traceId?: string;
  rooms?: string[];
  notification?: {
    type?: string;
    text: string;
    targetId?: number;
    pushPayload?: Record<string, unknown>;
  };
};
