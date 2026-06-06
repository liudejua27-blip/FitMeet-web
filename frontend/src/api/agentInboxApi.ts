import * as api from './client';
import { sanitizeDisplayValue } from '../lib/displayText';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

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

export interface OpenClawSetupStatus {
  tokenConfigured: boolean;
  activeTokenCount: number;
  webhookConfigured: boolean;
  heartbeatConfigured: boolean;
  heartbeatLastSuccessAt: string | null;
  connection: {
    id: number;
    agentName: string;
    agentDisplayName: string;
    permissionLevel: string;
    status: string;
    dailyActionLimit: number;
    dailyActionsUsed: number;
    webhookConfigured: boolean;
    lastActiveAt: string | null;
    createdAt: string;
  } | null;
  subconsciousLoop: {
    enabled: boolean;
    running: boolean;
    intervalSeconds: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastSummary: Record<string, unknown> | null;
    env?: Record<string, string | null>;
  } | null;
}

export interface MatchRequestItem {
  id: number;
  fromUserId: number;
  toUserId: number;
  direction: 'incoming' | 'outgoing';
  displayName: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
  respondedAt: string | null;
}

export interface ProfileRecommendationItem {
  aiMatchSessionId: number;
  targetUserId: number;
  score: number;
  status: string;
  summary: string;
  publicReasons: string[];
  riskTips: string[];
  nextStepSuggestions: string[];
  safeProfile: {
    id: number;
    name: string;
    avatar: string;
    color: string;
    city: string;
    publicTags: string[];
    summary: string;
  };
  createdAt?: string;
}

export const agentInboxApi = {
  conversations: (params?: { agentProfileId?: number; limit?: number; unreadOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.agentProfileId) {
      search.set('agentProfileId', String(params.agentProfileId));
    }
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.unreadOnly) search.set('unreadOnly', 'true');
    const qs = search.toString();
    return api
      .request<{
        agentProfileId: number | null;
        agentName: string | null;
        conversations: AgentInboxConversation[];
      }>(`${fitMeetCoreEndpoints.agentInbox.conversations}${qs ? `?${qs}` : ''}`)
      .then(sanitizeAgentInboxResponse);
  },

  messages: (conversationId: string, params?: { agentProfileId?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.agentProfileId) {
      search.set('agentProfileId', String(params.agentProfileId));
    }
    if (params?.limit) search.set('limit', String(params.limit));
    const qs = search.toString();
    return api
      .request<{
        agentProfileId: number | null;
        agentName: string | null;
        conversationId: string;
        messages: AgentInboxMessage[];
      }>(
        `${fitMeetCoreEndpoints.agentInbox.messages(conversationId)}${qs ? `?${qs}` : ''}`,
      )
      .then(sanitizeAgentInboxResponse);
  },

  reply: (conversationId: string, body: { agentProfileId?: number; content: string }) =>
    api
      .request<{
        status: 'sent';
        agentProfileId: number | null;
        agentName: string | null;
        conversationId: string;
        socketPushed: boolean;
        message: AgentInboxMessage;
      }>(
        fitMeetCoreEndpoints.agentInbox.reply(conversationId),
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
      .then(sanitizeAgentInboxResponse),

  runAutopilotOnce: () =>
    api.requestProtected<{
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
    api.requestProtected<{
      ok: boolean;
      matchedCount: number;
      recommendations: unknown[];
    }>('/agents/profile-matches/run-once', { method: 'POST' }),

  runProfileMatchAutopilotOnce: () =>
    api.requestProtected<{
      ok: boolean;
      autopilot: 'profile_match_autopilot';
      summary: {
        triggeredBy: 'cron' | 'manual';
        skipped: boolean;
        reason?: string;
        scannedProfiles: number;
        scannedRequests: number;
        generatedRecommendations: number;
        generatedRequestCandidates: number;
        inboxEvents: number;
        notificationsSent: number;
        skippedDuplicates: number;
        errors: number;
      };
    }>('/agents/profile-match/autopilot/run-once', { method: 'POST' }),

  profileMatchAutopilotStatus: () =>
    api.requestProtected<OpenClawSetupStatus['subconsciousLoop']>('/agents/profile-match/autopilot/status'),

  openClawStatus: () => api.requestProtected<OpenClawSetupStatus>('/agents/openclaw/status'),

  matchRequests: () => api.requestProtected<{ requests: MatchRequestItem[] }>('/match-requests'),

  acceptMatchRequest: (id: number) =>
    api.requestProtected<{ ok: boolean; status: string; conversationId?: string }>(
      `/match-requests/${id}/accept`,
      { method: 'POST' },
    ),

  rejectMatchRequest: (id: number) =>
    api.requestProtected<{ ok: boolean; status: string }>(`/match-requests/${id}/reject`, {
      method: 'POST',
    }),

  profileMatches: (limit = 30) =>
    api
      .request<{
        recommendations: ProfileRecommendationItem[];
      }>(`/agents/profile-matches?limit=${limit}`)
      .then(sanitizeAgentInboxResponse),

  ignoreProfileMatch: (aiMatchSessionId: number) =>
    api.requestProtected<{ ok: boolean; status: string }>(
      `/agents/profile-matches/${aiMatchSessionId}/ignore`,
      { method: 'POST' },
    ),

  favoriteProfileMatch: (aiMatchSessionId: number) =>
    api.requestProtected<{ ok: boolean; status: string }>(
      `/agents/profile-matches/${aiMatchSessionId}/favorite`,
      { method: 'POST' },
    ),

  draftProfileMatchOpener: (aiMatchSessionId: number) =>
    api.requestProtected<{
      ok: boolean;
      draft: { type: 'message'; tone: string; content: string };
      requiresOwnerConfirmation: boolean;
    }>(`/agents/profile-matches/${aiMatchSessionId}/draft-opener`, {
      method: 'POST',
      body: JSON.stringify({ tone: 'friendly' }),
    }),

  confirmProfileMatchContact: (aiMatchSessionId: number) =>
    api.requestProtected<{
      ok: boolean;
      status: string;
      contactRequestId: number;
      requiresTargetConsent: boolean;
    }>(`/agents/profile-matches/${aiMatchSessionId}/confirm-contact`, {
      method: 'POST',
      body: JSON.stringify({
        ownerConfirmed: true,
        note: 'Owner confirmed from Agent Inbox recommendation card.',
      }),
    }),

  requestContactExchange: (aiMatchSessionId: number) =>
    api.requestProtected<{ ok: boolean; status: string; approvalId?: number }>(
      `/agents/profile-matches/${aiMatchSessionId}/request-contact-exchange`,
      {
        method: 'POST',
        body: JSON.stringify({
          ownerConfirmed: true,
          note: 'Owner requested contact exchange from Agent Inbox.',
        }),
      },
    ),

  sendIntro: (aiMatchSessionId: number, content: string) =>
    api.requestProtected<{
      ok: boolean;
      status: string;
      conversationId?: string;
      messageId?: string;
    }>(`/agents/profile-matches/${aiMatchSessionId}/send-intro`, {
      method: 'POST',
      body: JSON.stringify({ ownerConfirmed: true, text: content }),
    }),

  events: (params?: { limit?: number; unreadOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.unreadOnly) search.set('unreadOnly', 'true');
    const qs = search.toString();
    return api
      .request<{ events: AgentInboxEvent[] }>(
        `${fitMeetCoreEndpoints.agentInbox.events}${qs ? `?${qs}` : ''}`,
      )
      .then(sanitizeAgentInboxResponse);
  },

  ackEvents: (eventIds: string[], agentProfileId?: number) =>
    api.requestProtected<{ ok: true; requested: number; acknowledged: number; eventIds: string[] }>(
      fitMeetCoreEndpoints.agentInbox.ackEvents,
      {
        method: 'POST',
        body: JSON.stringify({ eventIds, agentProfileId }),
      },
    ),
};

function sanitizeAgentInboxResponse<T>(value: T): T {
  return sanitizeDisplayValue(value) as T;
}
