import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import * as dataService from '../services/dataService';
import * as api from '../api/client';
import { cleanDisplayText, isDisplayableRecordText } from '../lib/displayText';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

migrateLocalStorageKey(STORAGE_KEYS.legacyMessagesStore, STORAGE_KEYS.messagesStore);

export interface ChatMessage {
  id: string | number;
  text: string;
  time: string;
  isMine: boolean;
  source?: 'user' | 'ai_delegate';
  card?: {
    type: 'fitmeet_contact_card';
    userId: number;
    name: string;
    profileUrl: string;
    sports: string[];
    city: string;
  } | null;
}

export interface Conversation {
  id: string;
  userId: number;
  username: string;
  avatar: string;
  color: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface MessageState {
  socket: Socket | null;
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Record<string, ChatMessage[]>;
  totalUnread: number;

  connectSocket: () => void;
  disconnectSocket: () => void;

  selectConv: (id: string) => void;
  closeConv: () => void;
  sendMessage: (convId: string, text: string) => Promise<void>;
  startChat: (userId: number, username: string, avatar: string, color: string) => void;
  loadConversations: () => Promise<void>;
  loadMessages: (convId: string) => Promise<void>;
}

export const useMessageStore = create<MessageState>()(
  persist(
    (set, get) => ({
      socket: null,
      conversations: [], // Start empty, load from API
      activeConvId: null,
      messages: {},
      totalUnread: 0,

      connectSocket: () => {
        const token = api.getToken();
        if (!token) return;

        const existingSocket = get().socket;
        // Already have a live (or auto-reconnecting) socket → no-op
        if (existingSocket) {
          if (existingSocket.connected) return;
          // If a stale instance exists (e.g. after logout/login), tear it down first
          try {
            existingSocket.disconnect();
          } catch {
            /* noop */
          }
          set({ socket: null });
        }

        const configuredWsBase = import.meta.env.VITE_WS_BASE_URL?.trim();
        const wsBase = (
          configuredWsBase ||
          (typeof window !== 'undefined'
            ? window.location.origin
            : api.API_BASE_URL.replace(/\/api\/?$/, ''))
        ).replace(/\/+$/, '');

        // Backend gateway uses the "messages" namespace.
        const socket = io(`${wsBase}/messages`, {
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
          console.log('[WS] Connected');
          // Sync conversations on every (re)connect so we never miss messages dropped while offline
          get().loadConversations();
        });
        socket.on('disconnect', (reason) => {
          console.log('[WS] Disconnected:', reason);
        });
        socket.on('reconnect_attempt', (n) => {
          console.log('[WS] Reconnect attempt', n);
        });
        socket.on('connect_error', (err) => {
          console.warn('[WS] connect_error:', err?.message || err);
        });

        socket.on(
          'newMessage',
          (payload: {
            id: string;
            text: string;
            conversationId: string;
            time?: string;
            source?: 'user' | 'ai_delegate';
            card?: ChatMessage['card'];
          }) => {
            // payload: { id, text, senderId, conversationId, time }
            const state = get();
            // Conversation ID is now used directly as ID
            const conv = state.conversations.find((c) => c.id === payload.conversationId);

            if (!conv) {
              get().loadConversations(); // Reload if new conv
              return;
            }

            const newMsg: ChatMessage = {
              id: payload.id,
              text: cleanDisplayText(payload.text, '消息内容已隐藏'),
              time: cleanDisplayText(payload.time, '刚刚'),
              isMine: false,
              source: payload.source ?? 'user',
              card: payload.card ?? null,
            };

            const isCurrent = state.activeConvId === conv.id;

            set((s) => ({
              messages: {
                ...s.messages,
                [conv!.id]: [...(s.messages[conv!.id] || []), newMsg],
              },
              conversations: s.conversations.map((c) =>
                c.id === conv!.id
                  ? {
                      ...c,
                      lastMessage: cleanDisplayText(newMsg.text, '消息内容已隐藏'),
                      time: '刚刚',
                      unread: isCurrent ? 0 : c.unread + 1,
                    }
                  : c,
              ),
              totalUnread: isCurrent ? s.totalUnread : s.totalUnread + 1,
            }));
          },
        );

        set({ socket });
      },

      disconnectSocket: () => {
        const socket = get().socket;
        if (socket) {
          socket.disconnect();
          set({ socket: null });
        }
      },

      loadConversations: async () => {
        try {
          const apiConvs = normalizeArrayResponse(await dataService.getConversations(), [
            'conversations',
            'items',
            'data',
          ]);
          if (apiConvs.length === 0) {
            set({ conversations: [], totalUnread: 0 });
            return;
          }

          const convs: Conversation[] = apiConvs
            .filter((c) => isDisplayableRecordText([c.username, c.lastMessage, c.time]))
            .map((c) => ({
              id: stringValue(c.id),
              userId: numberValue(c.userId),
              username: cleanDisplayText(c.username, 'FitMeet 用户'),
              avatar: cleanDisplayText(c.avatar, 'F'),
              color: stringValue(c.color, '#18b98f'),
              lastMessage: cleanDisplayText(c.lastMessage, '还没有消息'),
              time: cleanDisplayText(c.time),
              unread: numberValue(c.unread),
              online: booleanValue(c.online),
            }));

          set({
            conversations: convs,
            totalUnread: convs.reduce((sum, c) => sum + c.unread, 0),
          });
        } catch (error) {
          console.error('Failed to load conversations', error);
        }
      },

      loadMessages: async (convId: string) => {
        try {
          const texts = normalizeArrayResponse(await dataService.getMessages(convId), [
            'messages',
            'items',
            'data',
          ]);
          if (texts.length === 0) {
            set((state) => ({
              messages: {
                ...state.messages,
                [convId]: [],
              },
            }));
            return;
          }

          const msgs: ChatMessage[] = texts.map((m) => ({
            id: messageIdValue(m.id),
            text: cleanDisplayText(m.text, '消息内容已隐藏'),
            // Backend already formats time as "HH:MM" (zh-CN).
            time:
              cleanDisplayText(m.time) ||
              new Date().toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            isMine: booleanValue(m.isMine),
            source: messageSourceValue(m.source),
            card: cardValue(m.card),
          }));

          set((state) => ({
            messages: {
              ...state.messages,
              [convId]: msgs,
            },
          }));
        } catch (e) {
          console.error(e);
        }
      },

      selectConv: (id) => {
        set((state) => ({
          activeConvId: id,
          messages: {
            ...state.messages,
            [id]: [],
          },
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
          totalUnread: state.conversations.reduce(
            (sum, c) => sum + (c.id === id ? 0 : c.unread),
            0,
          ),
        }));
        get().loadMessages(id);
      },

      closeConv: () => set({ activeConvId: null }),

      sendMessage: async (convId, text) => {
        // Optimistic update
        const newMsg: ChatMessage = {
          id: Date.now(),
          text,
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          isMine: true,
          source: 'user',
          card: null,
        };

        set((state) => ({
          messages: {
            ...state.messages,
            [convId]: [...(state.messages[convId] || []), newMsg],
          },
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, lastMessage: cleanDisplayText(text), time: '刚刚' } : c,
          ),
        }));

        try {
          await dataService.sendMessage(convId, text);
        } catch (e) {
          console.error('Send failed', e);
        }
      },

      startChat: (userId) => {
        const existing = get().conversations.find((c) => c.userId === userId);
        if (existing) {
          set({ activeConvId: existing.id });
          get().loadMessages(existing.id);
        } else {
          dataService
            .startConversation(userId)
            .then((res) => {
              get()
                .loadConversations()
                .then(() => {
                  const refreshed = get().conversations.find((c) => c.userId === userId);
                  if (refreshed) {
                    set({ activeConvId: refreshed.id });
                  } else if (res?.conversationId) {
                    // Fallback using returned ID directly
                    set({ activeConvId: res.conversationId });
                  }
                });
            })
            .catch((e) => console.error(e));
        }
      },
    }),
    {
      name: STORAGE_KEYS.messagesStore,
      partialize: (state) => ({
        conversations: state.conversations,
        messages: state.messages,
        totalUnread: state.totalUnread,
      }),
    },
  ),
);

function normalizeArrayResponse(value: unknown, keys: string[]): Array<Record<string, unknown>> {
  const raw = Array.isArray(value)
    ? value
    : isRecord(value)
      ? keys.reduce<unknown>((found, key) => {
          if (Array.isArray(found)) return found;
          return value[key];
        }, undefined)
      : [];

  return Array.isArray(raw)
    ? raw.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return cleanDisplayText(value, fallback);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }
  return false;
}

function messageIdValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return stringValue(value, Date.now().toString());
}

function messageSourceValue(value: unknown): ChatMessage['source'] {
  return value === 'ai_delegate' ? 'ai_delegate' : 'user';
}

function cardValue(value: unknown): ChatMessage['card'] {
  return isRecord(value) && value.type === 'fitmeet_contact_card'
    ? (value as ChatMessage['card'])
    : null;
}
