import { useCallback } from 'react';
import clsx from 'clsx';
import { useNotificationStore } from '../stores';
import type { AppNotification } from '../stores';

const NOTIF_ICONS: Record<AppNotification['type'], string> = {
  like: '❤️',
  comment: '💬',
  follow: '👤',
  meet: '📍',
  system: '🔔',
};

const NOTIF_COLORS: Record<AppNotification['type'], string> = {
  like: 'border-red-500/20',
  comment: 'border-blue-500/20',
  follow: 'border-lime/20',
  meet: 'border-orange-500/20',
  system: 'border-sky-500/20',
};

export const NotificationsPage = () => {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotificationStore();

  const handleClick = useCallback(
    (id: number) => {
      markAsRead(id);
    },
    [markAsRead]
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-16 z-40 border-b border-border bg-base/95 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-lg text-white">🔔 通知中心</h2>
            <p className="text-xs text-textSofter mt-0.5">
              {unreadCount > 0 ? `${unreadCount} 条未读通知` : '全部已读'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-surfaceMuted text-textMuted border border-border hover:text-white hover:border-borderStrong transition cursor-pointer"
              onClick={markAllRead}
            >
              全部已读
            </button>
          )}
        </div>
      </div>

      {/* Notification List */}
      <div className="max-w-2xl mx-auto px-6 pt-4">
        <div className="space-y-2">
          {notifications.map((notif) => (
            <button
              key={notif.id}
              className={clsx(
                'w-full flex items-start gap-3 p-4 rounded-xl border transition text-left cursor-pointer',
                notif.read
                  ? 'border-border bg-surface/50 hover:bg-surface'
                  : `border-l-2 ${NOTIF_COLORS[notif.type]} bg-surface hover:bg-surfaceMuted`
              )}
              onClick={() => handleClick(notif.id)}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-[#09090A]"
                  style={{ background: notif.color }}
                >
                  {notif.avatar}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{notif.username}</span>
                  <span className="text-xs">{NOTIF_ICONS[notif.type]}</span>
                  {!notif.read && (
                    <span className="w-2 h-2 rounded-full bg-lime flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-textMuted mt-0.5 leading-relaxed">{notif.text}</p>
                <span className="text-[10px] text-textSofter mt-1 block">{notif.time}</span>
              </div>
            </button>
          ))}
        </div>

        {notifications.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔔</div>
            <div className="text-lg font-display font-bold text-textMuted">暂无通知</div>
            <div className="text-sm text-textSofter mt-1">新的互动消息会显示在这里</div>
          </div>
        )}
      </div>
    </div>
  );
};
