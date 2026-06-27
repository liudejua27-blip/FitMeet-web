import { create } from 'zustand';
import type { StoreApi } from 'zustand';
import * as socialContactClient from '../api/socialContactClient';
import {
  clearAllIdempotencyKeys,
  clearIdempotencyKey,
  getIdempotencyKey,
  shouldRetainIdempotencyKey,
} from '../lib/idempotency';
import type {
  AcceptPublicIntentApplicationResponse,
  ConnectionRequest,
  ContactContextType,
  ConversationProvisioningStatus,
  ConversationStartResult,
  PublicIntentApplication,
  RealtimeEnvelope,
  RelationshipState,
  SocialContactFriend,
} from '../types/socialContact';
import { useAuthStore } from './authStore';
import { useMessageStore } from './messageStore';

type ConversationProvisioning = {
  status: ConversationProvisioningStatus;
  conversationId: string | null;
  meetId?: number | null;
};

interface SocialContactState {
  applicationsById: Record<number, PublicIntentApplication>;
  ownerApplicationIds: number[];
  applicantApplicationIds: number[];
  applicationByPublicIntentId: Record<string, number>;
  relationshipsByUserId: Record<number, RelationshipState>;
  connectionRequestsById: Record<number, ConnectionRequest>;
  friends: SocialContactFriend[];
  loadingScopes: Record<string, boolean>;
  errorsByScope: Record<string, string | null>;
  provisioningApplicationIds: number[];
  conversationsByApplicationId: Record<number, ConversationProvisioning>;
  processedRealtimeEventIds: string[];

  loadOwnerApplications: () => Promise<void>;
  loadApplicantApplications: () => Promise<void>;
  loadApplicationsForIntent: (id: string) => Promise<void>;
  createApplication: (input: { publicIntentId: string; message: string }) => Promise<PublicIntentApplication>;
  acceptApplication: (applicationId: number) => Promise<AcceptPublicIntentApplicationResponse>;
  rejectApplication: (applicationId: number) => Promise<PublicIntentApplication>;
  cancelApplication: (applicationId: number) => Promise<PublicIntentApplication>;
  loadRelationship: (userId: number) => Promise<RelationshipState | null>;
  loadConnectionRequests: (input: { box: 'inbox' | 'outbox'; status?: string }) => Promise<void>;
  createConnectionRequest: (input: {
    targetUserId: number;
    message: string;
    sourceType?: string;
    sourceId?: string;
  }) => Promise<ConnectionRequest>;
  acceptConnectionRequest: (requestId: number) => Promise<ConnectionRequest>;
  rejectConnectionRequest: (requestId: number) => Promise<ConnectionRequest>;
  cancelConnectionRequest: (requestId: number) => Promise<ConnectionRequest>;
  loadFriends: () => Promise<void>;
  deleteFriend: (userId: number) => Promise<void>;
  startContextualConversation: (input: {
    targetUserId: number;
    contextType: ContactContextType;
    contextId: string;
    initialMessage?: string;
  }) => Promise<ConversationStartResult>;
  handleRealtimeEvent: (event: RealtimeEnvelope) => void;
  recoverProvisioningApplications: () => void;
  resetForLogout: () => void;
}

type SocialContactSet = StoreApi<SocialContactState>['setState'];

const pollingDelaysMs = [0, 1000, 2000, 4000, 8000, 12000] as const;
const pollingTimers = new Map<number, number>();
const pollingAttempts = new Map<number, number>();

export const useSocialContactStore = create<SocialContactState>()((set, get) => ({
  applicationsById: {},
  ownerApplicationIds: [],
  applicantApplicationIds: [],
  applicationByPublicIntentId: {},
  relationshipsByUserId: {},
  connectionRequestsById: {},
  friends: [],
  loadingScopes: {},
  errorsByScope: {},
  provisioningApplicationIds: [],
  conversationsByApplicationId: {},
  processedRealtimeEventIds: [],

  loadOwnerApplications: async () => {
    await runWithScope(set, 'applications:owner', async () => {
      const applications = await socialContactClient.listMyPublicIntentApplications({ role: 'owner' });
      set((state) => mergeApplications(state, applications, { owner: true }));
    });
  },

  loadApplicantApplications: async () => {
    await runWithScope(set, 'applications:applicant', async () => {
      const applications = await socialContactClient.listMyPublicIntentApplications({
        role: 'applicant',
      });
      set((state) => mergeApplications(state, applications, { applicant: true }));
    });
  },

  loadApplicationsForIntent: async (id) => {
    await runWithScope(set, `applications:intent:${id}`, async () => {
      const applications = await socialContactClient.listPublicIntentApplications(id);
      set((state) => mergeApplications(state, applications));
    });
  },

  createApplication: async ({ publicIntentId, message }) => {
    const scope = `public-intent-application:create:${publicIntentId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const application = await socialContactClient.createPublicIntentApplication({
        publicIntentId,
        message,
        idempotencyKey,
      });
      set((state) => mergeApplications(state, [application], { applicant: true }));
      return application;
    }, set);
  },

  acceptApplication: async (applicationId) => {
    const scope = `public-intent-application:accept:${applicationId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const response = await socialContactClient.acceptPublicIntentApplication({
        applicationId,
        idempotencyKey,
      });
      set((state) => mergeAcceptResponse(state, response));
      if (response.conversation.status === 'provisioning') {
        startProvisioningPolling(applicationId);
      } else {
        stopProvisioningPolling(applicationId);
        void useMessageStore.getState().loadConversations();
      }
      return response;
    }, set);
  },

  rejectApplication: async (applicationId) => {
    const scope = `public-intent-application:reject:${applicationId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const application = await socialContactClient.rejectPublicIntentApplication({
        applicationId,
        idempotencyKey,
      });
      set((state) => mergeApplications(state, [application]));
      stopProvisioningPolling(applicationId);
      return application;
    }, set);
  },

  cancelApplication: async (applicationId) => {
    const scope = `public-intent-application:cancel:${applicationId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const application = await socialContactClient.cancelPublicIntentApplication({
        applicationId,
        idempotencyKey,
      });
      set((state) => mergeApplications(state, [application], { applicant: true }));
      stopProvisioningPolling(applicationId);
      return application;
    }, set);
  },

  loadRelationship: async (userId) => {
    if (!Number.isFinite(userId) || userId <= 0) return null;
    try {
      const relationship = await socialContactClient.getRelationshipState(userId);
      set((state) => ({
        relationshipsByUserId: {
          ...state.relationshipsByUserId,
          [userId]: relationship,
        },
      }));
      return relationship;
    } catch (error) {
      set((state) => ({
        errorsByScope: {
          ...state.errorsByScope,
          [`relationship:${userId}`]: errorMessage(error),
        },
      }));
      return null;
    }
  },

  loadConnectionRequests: async ({ box, status = 'pending' }) => {
    await runWithScope(set, `connections:${box}:${status}`, async () => {
      const requests = await socialContactClient.listConnectionRequests({ box, status });
      set((state) => mergeConnectionRequests(state, requests));
    });
  },

  createConnectionRequest: async ({ targetUserId, message, sourceType, sourceId }) => {
    const scope = `connection-request:create:${targetUserId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const request = await socialContactClient.createConnectionRequest({
        targetUserId,
        message,
        sourceType,
        sourceId,
        idempotencyKey,
      });
      set((state) => mergeConnectionRequests(state, [request]));
      void get().loadRelationship(targetUserId);
      return request;
    }, set);
  },

  acceptConnectionRequest: async (requestId) => {
    const scope = `connection-request:accept:${requestId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const request = await socialContactClient.acceptConnectionRequest({
        requestId,
        idempotencyKey,
      });
      set((state) => mergeConnectionRequests(state, [request]));
      void get().loadRelationship(request.requesterId);
      void get().loadFriends();
      return request;
    }, set);
  },

  rejectConnectionRequest: async (requestId) => {
    const scope = `connection-request:reject:${requestId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const request = await socialContactClient.rejectConnectionRequest({
        requestId,
        idempotencyKey,
      });
      set((state) => mergeConnectionRequests(state, [request]));
      return request;
    }, set);
  },

  cancelConnectionRequest: async (requestId) => {
    const scope = `connection-request:cancel:${requestId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const request = await socialContactClient.cancelConnectionRequest({
        requestId,
        idempotencyKey,
      });
      set((state) => mergeConnectionRequests(state, [request]));
      return request;
    }, set);
  },

  loadFriends: async () => {
    await runWithScope(set, 'friends:list', async () => {
      const friends = await socialContactClient.listFriends();
      set({ friends });
    });
  },

  deleteFriend: async (userId) => {
    await runWithScope(set, `friends:delete:${userId}`, async () => {
      await socialContactClient.deleteFriend(userId);
      set((state) => ({
        friends: state.friends.filter((friend) => friend.id !== userId),
      }));
      await get().loadRelationship(userId);
    });
  },

  startContextualConversation: async ({ targetUserId, contextType, contextId, initialMessage }) => {
    const scope = `conversation:start:${contextType}:${contextId}`;
    return runIdempotent(scope, async (idempotencyKey) => {
      const result = await socialContactClient.startContextualConversation({
        targetUserId,
        contextType,
        contextId,
        initialMessage,
        idempotencyKey,
      });
      await useMessageStore.getState().loadConversations();
      await get().loadRelationship(targetUserId);
      return result;
    }, set);
  },

  handleRealtimeEvent: (event) => {
    if (event.eventType !== 'conversation.ready') return;
    const eventId = String(event.eventId || '');
    if (!eventId) return;
    if (get().processedRealtimeEventIds.includes(eventId)) return;

    const applicationId = numberFromUnknown(event.payload.applicationId);
    const conversationId = stringFromUnknown(event.payload.conversationId);
    const meetId = numberFromUnknown(event.payload.meetId);
    const targetUserId = numberFromUnknown(event.payload.targetUserId);

    set((state) => {
      const processedRealtimeEventIds = [...state.processedRealtimeEventIds, eventId].slice(-200);
      if (!applicationId) return { processedRealtimeEventIds };
      const existing = state.applicationsById[applicationId];
      return {
        processedRealtimeEventIds,
        applicationsById: existing
          ? {
              ...state.applicationsById,
              [applicationId]: {
                ...existing,
                status: 'accepted',
                meetId: meetId ?? existing.meetId,
              },
            }
          : state.applicationsById,
        conversationsByApplicationId: {
          ...state.conversationsByApplicationId,
          [applicationId]: {
            status: conversationId ? 'ready' : 'provisioning',
            conversationId,
            meetId,
          },
        },
        provisioningApplicationIds: conversationId
          ? state.provisioningApplicationIds.filter((id) => id !== applicationId)
          : state.provisioningApplicationIds,
      };
    });

    if (applicationId && conversationId) stopProvisioningPolling(applicationId);
    if (targetUserId) void get().loadRelationship(targetUserId);
    void get().loadOwnerApplications();
    void get().loadApplicantApplications();
    void useMessageStore.getState().loadConversations();
  },

  recoverProvisioningApplications: () => {
    const state = get();
    state.provisioningApplicationIds.forEach(startProvisioningPolling);
    Object.entries(state.conversationsByApplicationId).forEach(([id, conversation]) => {
      if (conversation.status === 'provisioning') startProvisioningPolling(Number(id));
    });
  },

  resetForLogout: () => {
    pollingTimers.forEach((timer) => window.clearTimeout(timer));
    pollingTimers.clear();
    pollingAttempts.clear();
    clearAllIdempotencyKeys();
    set({
      applicationsById: {},
      ownerApplicationIds: [],
      applicantApplicationIds: [],
      applicationByPublicIntentId: {},
      relationshipsByUserId: {},
      connectionRequestsById: {},
      friends: [],
      loadingScopes: {},
      errorsByScope: {},
      provisioningApplicationIds: [],
      conversationsByApplicationId: {},
      processedRealtimeEventIds: [],
    });
  },
}));

function mergeApplications(
  state: SocialContactState,
  applications: PublicIntentApplication[],
  options: { owner?: boolean; applicant?: boolean } = {},
): Partial<SocialContactState> {
  const applicationsById = { ...state.applicationsById };
  const applicationByPublicIntentId = { ...state.applicationByPublicIntentId };
  for (const application of applications) {
    applicationsById[application.id] = application;
    applicationByPublicIntentId[application.publicIntentId] = application.id;
  }
  const next: Partial<SocialContactState> = {
    applicationsById,
    applicationByPublicIntentId,
  };
  if (options.owner) {
    next.ownerApplicationIds = uniqueIds([
      ...applications.map((application) => application.id),
      ...state.ownerApplicationIds,
    ]);
  }
  if (options.applicant) {
    next.applicantApplicationIds = uniqueIds([
      ...applications.map((application) => application.id),
      ...state.applicantApplicationIds,
    ]);
  }
  return next;
}

function mergeAcceptResponse(
  state: SocialContactState,
  response: AcceptPublicIntentApplicationResponse,
): Partial<SocialContactState> {
  const existing = state.applicationsById[response.applicationId];
  return {
    applicationsById: existing
      ? {
          ...state.applicationsById,
          [response.applicationId]: {
            ...existing,
            status: 'accepted',
            meetId: response.meetId ?? existing.meetId,
          },
        }
      : state.applicationsById,
    provisioningApplicationIds:
      response.conversation.status === 'provisioning'
        ? uniqueIds([...state.provisioningApplicationIds, response.applicationId])
        : state.provisioningApplicationIds.filter((id) => id !== response.applicationId),
    conversationsByApplicationId: {
      ...state.conversationsByApplicationId,
      [response.applicationId]: {
        status: response.conversation.status,
        conversationId: response.conversation.conversationId,
        meetId: response.meetId,
      },
    },
  };
}

function mergeConnectionRequests(
  state: SocialContactState,
  requests: ConnectionRequest[],
): Partial<SocialContactState> {
  const connectionRequestsById = { ...state.connectionRequestsById };
  for (const request of requests) {
    connectionRequestsById[request.id] = request;
  }
  return { connectionRequestsById };
}

async function runIdempotent<T>(
  scope: string,
  operation: (idempotencyKey: string) => Promise<T>,
  set: SocialContactSet,
): Promise<T> {
  const idempotencyKey = getIdempotencyKey(scope);
  try {
    const result = await runWithScope(set, scope, () => operation(idempotencyKey));
    clearIdempotencyKey(scope);
    return result;
  } catch (error) {
    if (!shouldRetainIdempotencyKey(error)) clearIdempotencyKey(scope);
    throw error;
  }
}

async function runWithScope<T>(
  set: SocialContactSet,
  scope: string,
  operation: () => Promise<T>,
): Promise<T> {
  set((state) => ({
    loadingScopes: { ...state.loadingScopes, [scope]: true },
    errorsByScope: { ...state.errorsByScope, [scope]: null },
  }));
  try {
    const result = await operation();
    set((state) => ({
      loadingScopes: { ...state.loadingScopes, [scope]: false },
    }));
    return result;
  } catch (error) {
    set((state) => ({
      loadingScopes: { ...state.loadingScopes, [scope]: false },
      errorsByScope: { ...state.errorsByScope, [scope]: errorMessage(error) },
    }));
    throw error;
  }
}

function startProvisioningPolling(applicationId: number): void {
  if (!Number.isFinite(applicationId) || pollingTimers.has(applicationId)) return;
  pollingAttempts.set(applicationId, 0);
  scheduleProvisioningPoll(applicationId);
}

function scheduleProvisioningPoll(applicationId: number): void {
  const attempt = pollingAttempts.get(applicationId) ?? 0;
  const delay = pollingDelaysMs[Math.min(attempt, pollingDelaysMs.length - 1)];
  const timer = window.setTimeout(() => {
    pollingTimers.delete(applicationId);
    void pollProvisioningApplication(applicationId);
  }, delay);
  pollingTimers.set(applicationId, timer);
}

async function pollProvisioningApplication(applicationId: number): Promise<void> {
  const store = useSocialContactStore.getState();
  const auth = useAuthStore.getState();
  if (!auth.isLoggedIn) {
    stopProvisioningPolling(applicationId);
    return;
  }

  await Promise.allSettled([
    store.loadOwnerApplications(),
    store.loadApplicantApplications(),
    useMessageStore.getState().loadConversations(),
  ]);

  const latest = useSocialContactStore.getState().applicationsById[applicationId];
  if (!latest || latest.status !== 'accepted') {
    stopProvisioningPolling(applicationId);
    return;
  }

  const relatedUserId = relatedUserForApplication(latest);
  const relationship = relatedUserId
    ? await useSocialContactStore.getState().loadRelationship(relatedUserId)
    : null;
  if (relationship?.conversationId) {
    useSocialContactStore.setState((state) => ({
      provisioningApplicationIds: state.provisioningApplicationIds.filter((id) => id !== applicationId),
      conversationsByApplicationId: {
        ...state.conversationsByApplicationId,
        [applicationId]: {
          status: 'ready',
          conversationId: relationship.conversationId,
          meetId: latest.meetId,
        },
      },
    }));
    stopProvisioningPolling(applicationId);
    return;
  }
  if (relationship?.messagePermission === 'closed') {
    stopProvisioningPolling(applicationId);
    return;
  }

  const nextAttempt = (pollingAttempts.get(applicationId) ?? 0) + 1;
  pollingAttempts.set(applicationId, nextAttempt);
  if (nextAttempt >= pollingDelaysMs.length) {
    useSocialContactStore.setState((state) => ({
      provisioningApplicationIds: state.provisioningApplicationIds.filter((id) => id !== applicationId),
      conversationsByApplicationId: {
        ...state.conversationsByApplicationId,
        [applicationId]: {
          status: 'failed',
          conversationId: null,
          meetId: latest.meetId,
        },
      },
    }));
    stopProvisioningPolling(applicationId);
    return;
  }
  scheduleProvisioningPoll(applicationId);
}

function stopProvisioningPolling(applicationId: number): void {
  const timer = pollingTimers.get(applicationId);
  if (timer) window.clearTimeout(timer);
  pollingTimers.delete(applicationId);
  pollingAttempts.delete(applicationId);
}

function relatedUserForApplication(application: PublicIntentApplication): number | null {
  const currentUserId = useAuthStore.getState().user?.id;
  if (!currentUserId) return application.ownerUserId || application.applicantUserId || null;
  if (application.ownerUserId === currentUserId) return application.applicantUserId;
  if (application.applicantUserId === currentUserId) return application.ownerUserId;
  return application.ownerUserId || application.applicantUserId || null;
}

function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后重试。';
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
