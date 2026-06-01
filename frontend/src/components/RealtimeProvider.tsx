import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, getToken } from '../api/client';
import { useAuthStore, useMessageStore } from '../stores';

/**
 * App-level realtime bridge.
 *
 * Responsibilities:
 *  - On login: open the /messages socket once and prime the conversation list.
 *  - On logout: tear the socket down so a new user can reconnect with their own token.
 *  - Pages (e.g. MessagesPage) MUST NOT call connectSocket() themselves; the store's
 *    connectSocket is idempotent but having a single owner avoids race / leak.
 *
 * Auto-reconnect on transport drops is handled by socket.io itself
 * (configured in messageStore.connectSocket).
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const connectSocket = useMessageStore((s) => s.connectSocket);
  const disconnectSocket = useMessageStore((s) => s.disconnectSocket);
  const loadConversations = useMessageStore((s) => s.loadConversations);
  const wasLoggedIn = useRef(false);
  const realtimeSocket = useRef<Socket | null>(null);

  useEffect(() => {
    if (isLoggedIn) {
      connectSocket();
      realtimeSocket.current = connectRealtimeSocket(realtimeSocket.current, {
        onEvent(event) {
          window.dispatchEvent(new CustomEvent('fitmeet:realtime', { detail: event }));
          if (
            event.eventType === 'message:new' ||
            event.eventType === 'conversation:created' ||
            event.eventType === 'conversation:updated'
          ) {
            loadConversations();
          }
        },
      });
      // Prime the conversation list so the bell badge / Messages page have data
      // even before the first newMessage arrives.
      loadConversations();
      wasLoggedIn.current = true;
    } else if (wasLoggedIn.current) {
      // Transition logged-in -> logged-out: drop the socket.
      disconnectSocket();
      realtimeSocket.current?.disconnect();
      realtimeSocket.current = null;
      wasLoggedIn.current = false;
    }
  }, [isLoggedIn, connectSocket, disconnectSocket, loadConversations]);

  return <>{children}</>;
}

type RealtimeEnvelope = {
  eventId: string;
  eventType: string;
  userId: number;
  payload: Record<string, unknown>;
  createdAt: string;
  traceId?: string;
};

function connectRealtimeSocket(
  current: Socket | null,
  options: { onEvent: (event: RealtimeEnvelope) => void },
) {
  const token = getToken();
  if (!token) return null;
  if (current) {
    if (current.connected) return current;
    current.disconnect();
  }

  const configuredWsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  const wsBase = (
    configuredWsBase ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : API_BASE_URL.replace(/\/api\/?$/, ''))
  ).replace(/\/+$/, '');
  const socket = io(`${wsBase}/realtime`, {
    query: { token },
    auth: { token },
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    window.dispatchEvent(
      new CustomEvent('fitmeet:realtime-status', {
        detail: { connected: true },
      }),
    );
  });
  socket.on('disconnect', () => {
    window.dispatchEvent(
      new CustomEvent('fitmeet:realtime-status', {
        detail: { connected: false },
      }),
    );
  });
  socket.on('connect_error', () => {
    window.dispatchEvent(
      new CustomEvent('fitmeet:realtime-status', {
        detail: { connected: false },
      }),
    );
  });
  socket.on('realtime:event', (event: RealtimeEnvelope) => {
    if (event && typeof event.eventType === 'string') options.onEvent(event);
  });
  socket.on('message:new', (event: RealtimeEnvelope) => options.onEvent(event));
  socket.on('life_graph:updated', (event: RealtimeEnvelope) => options.onEvent(event));
  socket.on('agent:thinking', (event: RealtimeEnvelope) => options.onEvent(event));
  socket.on('agent:candidates', (event: RealtimeEnvelope) => options.onEvent(event));
  socket.on('agent:approval_required', (event: RealtimeEnvelope) => options.onEvent(event));
  socket.on('agent:completed', (event: RealtimeEnvelope) => options.onEvent(event));
  return socket;
}
