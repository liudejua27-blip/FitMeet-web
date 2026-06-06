import { request } from './baseClient';

export interface ApiNotification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'meet' | 'system';
  username: string;
  avatar: string;
  color: string;
  text: string;
  time: string;
  read: boolean;
  targetId?: number;
}

export function getNotifications(): Promise<ApiNotification[]> {
  return request<ApiNotification[]>('/notifications');
}

export function getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
  return request('/notifications/unread');
}

export function markNotificationAsRead(id: string): Promise<void> {
  return request(`/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<void> {
  return request('/notifications/read-all', { method: 'POST' });
}
