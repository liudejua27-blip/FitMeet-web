import { memo, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FRIENDS } from '../../data/mockData';
import { useMessageStore } from '../../stores';
import type { Friend } from '../../types';
import * as dataService from '../../services/dataService';

interface FriendListWidgetProps {
  /** Pass friends externally; if omitted, fetches from dataService (with mock fallback). */
  friends?: Friend[];
}

export const FriendListWidget = memo(function FriendListWidget({ friends: friendsProp }: FriendListWidgetProps) {
  const navigate = useNavigate();
  const { startChat } = useMessageStore();
  const [localFriends, setLocalFriends] = useState<Friend[]>(FRIENDS);
  const friends = friendsProp ?? localFriends;

  // If not provided via props, load from data service on mount
  useEffect(() => {
    if (friendsProp) return; // Use props if available

    let cancelled = false;
    dataService.getFriends().then((data) => {
      if (!cancelled) setLocalFriends(data);
    });
    return () => { cancelled = true; };
  }, [friendsProp]);

  const handleChat = useCallback((friend: Friend) => {
    startChat(friend.id, friend.name, friend.avatar, friend.color);
    navigate('/messages');
  }, [startChat, navigate]);
  return (
    <aside className="fixed right-8 top-24 hidden w-72 rounded-2xl border border-border bg-base/85 p-4 shadow-card backdrop-blur-xl lg:block">
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-white">
        <span className="font-display">我的好友</span>
        <span className="rounded-full bg-limeDim px-2 py-0.5 text-xs font-semibold text-lime">
          {friends.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {friends.map((friend) => (
          <button
            key={friend.id}
            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition hover:border-borderStrong hover:bg-surfaceMuted"
            onClick={() => handleChat(friend)}
          >
            <div className="relative">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-[#09090A]"
                style={{ background: friend.color }}
              >
                {friend.avatar}
              </div>
              <span
                className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-surface"
                style={{ background: friend.status === 'online' ? '#C8FF00' : 'rgba(236,236,236,0.5)' }}
              />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">{friend.name}</div>
              <div className="text-xs text-textSofter">{friend.status === 'online' ? '在线' : '离线'}</div>
            </div>
            <span className="text-lg text-textMuted transition group-hover:text-white">💬</span>
          </button>
        ))}
      </div>
    </aside>
  );
});
