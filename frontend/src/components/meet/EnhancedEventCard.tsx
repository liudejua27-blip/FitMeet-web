import { memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { getRelativeTime, getCountdown, formatDistance } from '../../lib/timeUtils';
import { Avatar, Badge, Button } from '../ui';

interface Friend {
  id: number;
  name: string;
  avatar?: string;
}

interface EnhancedEventCardProps {
  id: number;
  title: string;
  sport: string;
  time: string;
  location: string;
  distance?: number;
  price: string;
  level: string;
  slots: number;
  maxSlots: number;
  username: string;
  userColor: string;
  userCert?: boolean;
  rating: number;
  meetCount: number;
  tags?: string[];
  friends?: Friend[];
  isSelected?: boolean;
  onSelect?: (id: number) => void;
  onJoin: (id: number) => void;
}

export const EnhancedEventCard = memo(function EnhancedEventCard({
  id,
  title,
  sport,
  time,
  location,
  distance,
  price,
  level,
  slots,
  maxSlots,
  username,
  userColor,
  userCert,
  rating,
  meetCount,
  tags = [],
  friends = [],
  isSelected = false,
  onSelect,
  onJoin,
}: EnhancedEventCardProps) {
  const handleSelect = useCallback(() => onSelect?.(id), [onSelect, id]);
  const handleJoin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onJoin(id);
  }, [onJoin, id]);

  const relativeTime = getRelativeTime(time);
  const countdown = getCountdown(time);
  const isLowSlots = slots <= 2;
  const isNewbieFriendly = tags.includes('新手友好');

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={cn(
        'relative bg-bg2 border rounded-xl p-4 mb-2.5 cursor-pointer transition-all duration-200 card-interactive',
        'hover:border-lime/50 hover:bg-bg3',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime',
        isSelected ? 'border-lime/45 bg-bg3' : 'border-border'
      )}
      onClick={handleSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(); } }}
    >
      {/* 好友已报名标记 */}
      {friends.length > 0 && (
        <div className="absolute flex items-center gap-1 px-2 py-1 border rounded-full top-3 right-3 bg-accent/20 border-accent/40">
          <div className="flex -space-x-2">
            {friends.slice(0, 3).map((friend) => (
              <div
                key={friend.id}
                className="w-5 h-5 rounded-full bg-lime border-2 border-bg2 flex items-center justify-center text-[10px] font-bold"
                title={friend.name}
              >
                {friend.name[0]}
              </div>
            ))}
          </div>
          <span className="text-[10px] text-accent font-medium">好友已报名</span>
        </div>
      )}

      {/* 倒计时警示 */}
      {countdown && (
        <div className="absolute top-3 left-3 bg-danger/90 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">
          ⏰ {countdown}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar name={username} color={userColor} size="lg" verified={userCert} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-sm mb-0.5 truncate">
            {username}
          </div>
          <div className="text-[11px] text-muted flex items-center gap-2">
            <span>⭐ {rating}</span>
            <span>约练 {meetCount} 次</span>
          </div>
        </div>
        <Badge variant="lime" size="sm">{sport}</Badge>
      </div>

      {/* Title */}
      <h3 className="font-display font-bold text-sm mb-2.5 leading-snug">
        {title}
      </h3>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1.5 mb-2.5 flex-wrap">
          {isNewbieFriendly && (
            <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium">
              🌱 新手友好
            </span>
          )}
          {tags.filter(t => t !== '新手友好').map((tag, i) => (
            <span key={i} className="text-[10px] bg-lime/10 text-lime px-2 py-0.5 rounded-full font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-lime">🕐</span>
          <span className="font-bold text-lime">{relativeTime}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>📍</span>
          <span className="truncate text-muted2">{location}</span>
          {distance && (
            <button
              className="ml-auto text-blue hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                // 触发导航
              }}
            >
              {formatDistance(distance)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>💰</span>
          <span className="text-muted2">{price}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>🎯</span>
          <span className="text-muted2">{level}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted">
          剩余 <strong className={cn(
            'font-bold',
            isLowSlots ? 'text-danger animate-blink' : 'text-lime'
          )}>{slots}</strong>/{maxSlots} 人
          {isLowSlots && <span className="ml-1 text-danger">仅剩 {slots} 席！</span>}
        </span>
        <Button variant="primary" size="sm" onClick={handleJoin} className="btn-primary">
          加入
        </Button>
      </div>
    </article>
  );
});
