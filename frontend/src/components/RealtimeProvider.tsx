import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (isLoggedIn) {
      connectSocket();
      // Prime the conversation list so the bell badge / Messages page have data
      // even before the first newMessage arrives.
      loadConversations();
      wasLoggedIn.current = true;
    } else if (wasLoggedIn.current) {
      // Transition logged-in -> logged-out: drop the socket.
      disconnectSocket();
      wasLoggedIn.current = false;
    }
  }, [isLoggedIn, connectSocket, disconnectSocket, loadConversations]);

  return <>{children}</>;
}
