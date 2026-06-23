import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

migrateLocalStorageKey(STORAGE_KEYS.legacyNotificationsStore, STORAGE_KEYS.notificationsStore);

export interface AppNotification {
  id: number;
  type: 'meet' | 'system';
  username: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  read: boolean;
  targetId?: number;
  targetType?: 'post' | 'user' | 'meet' | 'agent_reminder';
  route?: string;
  reminderId?: number;
  taskId?: number;
  reminderContext?: Record<string, unknown> | null;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: number) => void;
  markAllRead: () => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'read'>) => void;
  loadNotifications: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: [],
      unreadCount: 0,

      loadNotifications: async () => {
        set((state) => ({
          unreadCount: state.notifications.filter((n) => !n.read).length,
        }));
      },

      markAsRead: (id) => {
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          );
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
      },

      markAllRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },

      addNotification: (n) => {
        const newNotif: AppNotification = { ...n, id: Date.now(), read: false };
        set((state) => ({
          notifications: [newNotif, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }));
      },
    }),
    {
      name: STORAGE_KEYS.notificationsStore,
    },
  ),
);
