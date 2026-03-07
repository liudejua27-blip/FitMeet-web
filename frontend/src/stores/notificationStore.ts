import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as dataService from '../services/dataService';

export interface AppNotification {
  id: number;
  /** Backend MongoDB _id */
  backendId?: string;
  type: 'like' | 'comment' | 'follow' | 'meet' | 'system';
  username: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  read: boolean;
  targetId?: number;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: number) => void;
  markAllRead: () => void;
  addNotification: (n: Omit<AppNotification, 'id' | 'read'>) => void;
  /** Load notifications from server */
  loadNotifications: () => Promise<void>;
}

const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: 1, type: 'like', username: '强哥训练日', avatar: 'K', color: '#C8FF00', text: '赞了你的动态「连续 60 天晨跑打卡」', time: '2分钟前', read: false },
  { id: 2, type: 'comment', username: '瑜伽Lisa', avatar: 'L', color: '#A78BFA', text: '评论了你的动态：「推荐大家也来试试瑜伽搭配力量训练」', time: '10分钟前', read: false },
  { id: 3, type: 'follow', username: 'Mark增肌记', avatar: 'M', color: '#F97316', text: '关注了你', time: '30分钟前', read: false },
  { id: 4, type: 'meet', username: '晨跑小雪', avatar: 'X', color: '#FF6B9D', text: '接受了你的约练邀请「周末早晨8km晨跑」', time: '1小时前', read: false },
  { id: 5, type: 'system', username: '系统', avatar: 'S', color: '#38BDF8', text: '你的实名认证已通过，快去完善个人资料吧！', time: '2小时前', read: true },
  { id: 6, type: 'like', username: '欣欣跑步', avatar: 'X', color: '#38BDF8', text: '赞了你的约练「今晚19:30望京深蹲约练」', time: '3小时前', read: true },
  { id: 7, type: 'comment', username: '小林', avatar: 'L', color: '#22C55E', text: '评论了你的动态：「下次约练算我一个！」', time: '5小时前', read: true },
  { id: 8, type: 'follow', username: '户外达人小林', avatar: 'L', color: '#22C55E', text: '关注了你', time: '昨天', read: true },
  { id: 9, type: 'meet', username: '球王阿飞', avatar: 'A', color: '#FB923C', text: '邀请你参加约练「篮球半场PK 3v3」', time: '昨天', read: true },
  { id: 10, type: 'system', username: '系统', avatar: 'S', color: '#38BDF8', text: '欢迎加入 FitMate！快去发现附近的健身搭子吧 🏋️', time: '前天', read: true },
];

const USE_API = !!import.meta.env.VITE_API_BASE_URL;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: MOCK_NOTIFICATIONS,
      unreadCount: MOCK_NOTIFICATIONS.filter((n) => !n.read).length,

      loadNotifications: async () => {
        if (!USE_API) return;
        try {
          const apiNotifs = await dataService.getNotifications();
          if (apiNotifs && apiNotifs.length > 0) {
            const mapped: AppNotification[] = apiNotifs.map((n, i) => ({
              id: i + 1,
              backendId: n._id,
              type: n.type,
              username: n.fromUsername || '系统',
              avatar: n.fromAvatar || 'S',
              color: n.fromColor || '#38BDF8',
              text: n.text,
              time: formatTime(n.createdAt),
              read: n.read,
              targetId: n.targetId,
            }));
            set({
              notifications: mapped,
              unreadCount: mapped.filter((n) => !n.read).length,
            });
          }
        } catch {
          // keep mock
        }
      },

      markAsRead: (id) => {
        const notif = get().notifications.find((n) => n.id === id);
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          };
        });
        // Sync with backend
        if (notif?.backendId) {
          dataService.markNotificationAsRead(notif.backendId);
        }
      },

      markAllRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
        // Sync with backend
        dataService.markAllNotificationsRead();
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
      name: 'fitmate-notifications',
    },
  ),
);

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
}
