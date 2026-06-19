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
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      loadNotifications: async () => {
        try {
          const apiNotifs = await dataService.getNotifications();
          const mapped: AppNotification[] = apiNotifs.map((n, i) =>
            mapApiNotification(n, i),
          );
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

function mapApiNotification(
  notification: Awaited<ReturnType<typeof dataService.getNotifications>>[number],
  index: number,
): AppNotification {
  const pushPayload =
    notification.pushPayload && typeof notification.pushPayload === 'object'
      ? notification.pushPayload
      : {};
  const isAgentReminder =
    notification.type === 'social_agent.reminder' ||
    pushPayload.targetType === 'agent_reminder';
  return {
    id: index + 1,
    backendId: notification.id,
    type: normalizeNotificationType(notification.type, isAgentReminder),
    username: notification.username || '系统',
    avatar: notification.avatar || 'S',
    color: notification.color || '#38BDF8',
    text: notification.text,
    time: notification.time || '刚刚',
    read: notification.read,
    targetId: notification.targetId,
    targetType: isAgentReminder ? 'agent_reminder' : undefined,
    route: typeof pushPayload.route === 'string' ? pushPayload.route : undefined,
    reminderId: numberFromUnknown(pushPayload.reminderId ?? notification.targetId),
    taskId: numberFromUnknown(pushPayload.taskId),
    reminderContext: recordFromUnknown(pushPayload.reminderContext),
  };
}

function normalizeNotificationType(
  type: Awaited<ReturnType<typeof dataService.getNotifications>>[number]['type'],
  isAgentReminder: boolean,
): AppNotification['type'] {
  if (isAgentReminder || type === 'social_agent.reminder') return 'system';
  return type;
}

function numberFromUnknown(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
