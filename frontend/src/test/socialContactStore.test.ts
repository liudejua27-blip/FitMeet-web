import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_BASE_URL } from '../api/baseClient';
import * as socialContactClient from '../api/socialContactClient';
import { useMessageStore } from '../stores/messageStore';
import { useSocialContactStore } from '../stores/socialContactStore';
import type { PublicIntentApplication, RelationshipState } from '../types/socialContact';

const baseApplication: PublicIntentApplication = {
  id: 101,
  publicIntentId: 'intent-1',
  ownerUserId: 1,
  applicantUserId: 2,
  status: 'pending',
  message: '周六下午可以一起打羽毛球',
  meetId: null,
  resolvedAt: null,
  createdAt: '2026-06-25T08:00:00.000Z',
  updatedAt: '2026-06-25T08:00:00.000Z',
};

const readyRelationship: RelationshipState = {
  userId: 2,
  following: false,
  friendship: 'none',
  connectionRequest: 'none',
  messagePermission: 'open',
  conversationId: 'conv-1',
  blocked: false,
};

describe('social contact client/store', () => {
  beforeEach(() => {
    installStoragePolyfill();
    localStorage.clear();
    sessionStorage.clear();
    useSocialContactStore.getState().resetForLogout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useSocialContactStore.getState().resetForLogout();
    localStorage?.clear();
    sessionStorage?.clear();
  });

  it('reuses the same Idempotency-Key after a retryable application failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(
          {
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'temporary outage',
            error: { code: 'SERVICE_UNAVAILABLE', retryable: true },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(baseApplication));

    await expect(
      useSocialContactStore.getState().createApplication({
        publicIntentId: 'intent-1',
        message: '周六下午可以一起打羽毛球',
      }),
    ).rejects.toMatchObject({ status: 503 });
    const firstKey = headerValue(fetchMock.mock.calls[0]?.[1]?.headers, 'Idempotency-Key');

    await expect(
      useSocialContactStore.getState().createApplication({
        publicIntentId: 'intent-1',
        message: '周六下午可以一起打羽毛球',
      }),
    ).resolves.toMatchObject({ id: baseApplication.id, status: 'pending' });

    expect(firstKey).toBeTruthy();
    expect(headerValue(fetchMock.mock.calls[1]?.[1]?.headers, 'Idempotency-Key')).toBe(firstKey);
    expect(sessionStorage.length).toBe(0);
  });

  it('sends contextual conversation start with Idempotency-Key', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ conversationId: 'conv-1' }));

    await expect(
      socialContactClient.startContextualConversation({
        targetUserId: 2,
        contextType: 'public_intent_application',
        contextId: '101',
        initialMessage: '你好，可以一起约练吗？',
        idempotencyKey: 'idem-start-1',
      }),
    ).resolves.toMatchObject({ conversationId: 'conv-1' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/messages/start`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          targetUserId: 2,
          contextType: 'public_intent_application',
          contextId: '101',
          initialMessage: '你好，可以一起约练吗？',
        }),
      }),
    );
    expect(headerValue(fetchMock.mock.calls[0]?.[1]?.headers, 'Idempotency-Key')).toBe(
      'idem-start-1',
    );
  });

  it('dedupes conversation.ready events and marks provisioning applications ready', async () => {
    useMessageStore.getState().loadConversations = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/relationships/users/2')) return jsonResponse(readyRelationship);
      return jsonResponse([]);
    });
    useSocialContactStore.setState({
      applicationsById: {
        [baseApplication.id]: { ...baseApplication, status: 'accepted' },
      },
      provisioningApplicationIds: [baseApplication.id],
      conversationsByApplicationId: {
        [baseApplication.id]: {
          status: 'provisioning',
          conversationId: null,
          meetId: null,
        },
      },
      processedRealtimeEventIds: [],
    });

    const event = {
      eventId: 'event-1',
      eventType: 'conversation.ready',
      payload: {
        applicationId: baseApplication.id,
        conversationId: 'conv-1',
        meetId: 88,
        targetUserId: 2,
      },
    };

    useSocialContactStore.getState().handleRealtimeEvent(event);
    useSocialContactStore.getState().handleRealtimeEvent(event);

    expect(useSocialContactStore.getState().processedRealtimeEventIds).toEqual(['event-1']);
    expect(useSocialContactStore.getState().provisioningApplicationIds).toEqual([]);
    expect(useSocialContactStore.getState().conversationsByApplicationId[baseApplication.id]).toEqual(
      {
        status: 'ready',
        conversationId: 'conv-1',
        meetId: 88,
      },
    );
  });

  it('keeps an empty friends response empty instead of inserting mock contacts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    await useSocialContactStore.getState().loadFriends();

    expect(useSocialContactStore.getState().friends).toEqual([]);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  const normalized = new Headers(headers);
  return normalized.get(name);
}

function installStoragePolyfill(): void {
  const local = createMemoryStorage();
  const session = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: local,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: session,
    configurable: true,
  });
  Object.defineProperty(window, 'localStorage', {
    value: local,
    configurable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    value: session,
    configurable: true,
  });
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}
