import * as api from './client';

export interface AgentInboxUser {
  id: number;
  name: string;
  avatar: string;
  color: string;
}

export interface AgentInboxAgent {
  id: number;
  name: string;
  provider?: string | null;
  agentType?: string | null;
}

export interface AgentInboxConversation {
  id: string;
  participantUserIds: number[];
  participantAgentIds: number[];
  users: AgentInboxUser[];
  agents: AgentInboxAgent[];
  lastMessage: string;
  lastMessageTime: string | null;
  time: string;
  unread: number;
}

export interface AgentInboxMessage {
  id: string;
  conversationId: string;
  text: string;
  source: 'user' | 'ai_delegate';
  senderType: 'user' | 'agent';
  receiverType: 'user' | 'agent';
  senderId: number;
  senderAgentId: number | null;
  receiverAgentId: number | null;
  isMine: boolean;
  createdAt?: string;
  time: string;
}

export interface AgentInboxEvent {
  id: string;
  event: string;
  eventType: string;
  agentConnectionId: number;
  ownerUserId: number;
  conversationId: string | null;
  messageId: string | null;
  requestId: number | null;
  candidateRecordId: number | null;
  fromUserId: number | null;
  contentPreview: string;
  unread: boolean;
  metadata: Record<string, unknown>;
  createdAt?: string;
}

export const agentInboxApi = {
  conversations: (params?: {
    agentProfileId?: number;
    limit?: number;
    unreadOnly?: boolean;
  }) => {
    const search = new URLSearchParams();
    if (params?.agentProfileId) {
      search.set('agentProfileId', String(params.agentProfileId));
    }
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.unreadOnly) search.set('unreadOnly', 'true');
    const qs = search.toString();
    return api.request<{
      agentProfileId: number | null;
      agentName: string | null;
      conversations: AgentInboxConversation[];
    }>(`/agents/inbox/conversations${qs ? `?${qs}` : ''}`);
  },

  messages: (
    conversationId: string,
    params?: { agentProfileId?: number; limit?: number },
  ) => {
    const search = new URLSearchParams();
    if (params?.agentProfileId) {
      search.set('agentProfileId', String(params.agentProfileId));
    }
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return api.request<{
      agentProfileId: number | null;
      agentName: string | null;
      conversationId: string;
      messages: AgentInboxMessage[];
    }>(`/agents/inbox/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`);
  },

  reply: (
    conversationId: string,
    body: { agentProfileId?: number; content: string },
  ) =>
    api.request<{
      status: 'sent';
      agentProfileId: number | null;
      agentName: string | null;
      conversationId: string;
      socketPushed: boolean;
      message: AgentInboxMessage;
    }>(`/agents/inbox/conversations/${conversationId}/reply`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  runAutopilotOnce: () =>
    api.request<{
      ok: boolean;
      summary: {
        triggeredBy: 'cron' | 'manual';
        skipped: boolean;
        reason?: string;
        agentsScanned: number;
        requestsScanned: number;
        decisions: Record<string, number>;
      };
    }>('/agents/autopilot/run-once', { method: 'POST' }),

  runProfileMatchesOnce: () =>
    api.request<{
      ok: boolean;
      matchedCount: number;
      recommendations: unknown[];
    }>('/agents/profile-matches/run-once', { method: 'POST' }),

  events: (params?: { limit?: number; unreadOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.unreadOnly) search.set('unreadOnly', 'true');
    const qs = search.toString();
    return api.request<{ events: AgentInboxEvent[] }>(
      `/agents/inbox/events${qs ? `?${qs}` : ''}`,
    );
  },
};
