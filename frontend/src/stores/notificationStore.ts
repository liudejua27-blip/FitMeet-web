import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as dataService from '../services/dataService';
import { STORAGE_KEYS, migrateLocalStorageKey } from '../lib/storageKeys';

migrateLocalStorageKey(STORAGE_KEYS.legacyNotificationsStore, STORAGE_KEYS.notificationsStore);

export interface AppNotification {
  id: number;
  backendId?: string;
  type: 'like' | 'comment' | 'follow' | 'meet' | 'system';
  username: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  read: boolean;
  targetId?: number;
  targetType?: 'post' | 'user' | 'meet';
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
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      loadNotifications: async () => {
        try {
          const apiNotifs = await dataService.getNotifications();
          const mapped: AppNotification[] = apiNotifs.map((n, i) => ({
            id: i + 1,
            backendId: n.id,
            type: n.type,
            username: n.username || '系统',
            avatar: n.avatar || 'S',
            color: n.color || '#38BDF8',
            text: n.text,
            time: n.time || '刚刚',
            read: n.read,
            targetId: n.targetId,
          }));
          set({
            notifications: mapped,
            unreadCount: mapped.filter((n) => !n.read).length,
          });
        } catch (error) {
          console.error('Failed to load notifications', error);
        }
      },

      markAsRead: (id) => {
        const notif = get().notifications.find((n) => n.id === id);
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          );
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
        if (notif?.backendId) {
          void dataService.markNotificationAsRead(notif.backendId);
        }
      },

      markAllRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
        void dataService.markAllNotificationsRead();
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
