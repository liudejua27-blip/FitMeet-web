import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import * as dataService from '../services/dataService';
import * as api from '../api/client';

export interface ChatMessage {
  id: string | number;
  text: string;
  time: string;
  isMine: boolean;
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
        if (existingSocket?.connected) return;

        const socket = io(import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000', {
          query: { token },
          path: '/socket.io',
          transports: ['websocket'],
          reconnectionAttempts: 5,
        });

        socket.on('connect', () => {
          console.log('[WS] Connected');
        });

        socket.on(
          'newMessage',
          (payload: {
            id: string;
            text: string;
            conversationId: string;
            time?: string;
          }) => {
            // payload: { id, text, senderId, conversationId, time }
            const state = get();
            // Conversation ID is now used directly as ID
            const conv = state.conversations.find(
              (c) => c.id === payload.conversationId,
            );

            if (!conv) {
              get().loadConversations(); // Reload if new conv
              return;
           }

           const newMsg: ChatMessage = {
             id: payload.id,
             text: payload.text,
             time: payload.time || new Date().toLocaleTimeString(),
             isMine: false,
           };

           const isCurrent = state.activeConvId === conv.id;

           set(s => ({
             messages: {
               ...s.messages,
               [conv!.id]: [...(s.messages[conv!.id] || []), newMsg]
             },
             conversations: s.conversations.map(c =>
               c.id === conv!.id ? {
                 ...c,
                 lastMessage: newMsg.text,
                 time: '刚刚',
                 unread: isCurrent ? 0 : c.unread + 1
               } : c
             ),
             totalUnread: isCurrent ? s.totalUnread : s.totalUnread + 1
           }));
        });

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
          // eslint-disable-next-line
          const apiConvs = (await dataService.getConversations()) as any[];
          if (!apiConvs) return;

          const convs: Conversation[] = apiConvs.map((c) => ({
            id: c.id,
            userId: c.userId,
            username: c.username,
            avatar: c.avatar,
            color: c.color,
            lastMessage: c.lastMessage || '',
            time: c.time || '',
            unread: c.unread || 0,
            online: c.online || false,
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
          // eslint-disable-next-line
          const texts = (await dataService.getMessages(convId)) as any[];
          if (!texts) return;

          const msgs: ChatMessage[] = texts.map((m) => ({
            id: m._id || m.id,
            text: m.text,
            time: m.time
              ? new Date(m.time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : new Date().toLocaleTimeString(),
            isMine: m.isMine,
          }));

          set((state) => ({
             messages: {
               ...state.messages,
               [convId]: msgs
             }
           }));
         } catch (e) {
           console.error(e);
         }
      },

      selectConv: (id) => {
        set((state) => ({
          activeConvId: id,
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, unread: 0 } : c
          ),
          totalUnread: state.conversations.reduce(
            (sum, c) => sum + (c.id === id ? 0 : c.unread),
            0
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
        };

        set((state) => ({
          messages: {
            ...state.messages,
            [convId]: [...(state.messages[convId] || []), newMsg],
          },
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, lastMessage: text, time: '刚刚' } : c
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
                  const refreshed = get().conversations.find(
                    (c) => c.userId === userId,
                  );
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
      name: 'fitmate-messages',
      partialize: (state) => ({
        conversations: state.conversations,
        messages: state.messages,
        totalUnread: state.totalUnread,
      }),
    },
  ),
);
