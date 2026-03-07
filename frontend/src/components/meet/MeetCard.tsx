import { memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import type { Meet } from '../../data/mockData';
import { Avatar, Badge, Button, InfoItemInline } from '../ui';

interface MeetCardProps {
  meet: Meet;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onJoin: (id: number) => void;
}

export const MeetCard = memo(function MeetCard({
  meet,
  isSelected,
  onSelect,
  onJoin
}: MeetCardProps) {
  const handleSelect = useCallback(() => onSelect(meet.id), [onSelect, meet.id]);
  const handleJoin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onJoin(meet.id);
  }, [onJoin, meet.id]);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={cn(
        'bg-surfaceMuted border rounded-2xl p-4 mb-2.5 cursor-pointer transition-all duration-200',
        'hover:border-borderStrong hover:bg-surface',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime',
        isSelected ? 'border-lime/45 bg-surface' : 'border-border'
      )}
      onClick={handleSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(); } }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar name={meet.username} color={meet.color} size="lg" verified={meet.cert} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-sm mb-0.5 truncate">
            {meet.username}
          </div>
          <div className="text-[11px] text-textMuted flex items-center gap-2">
            <span>⭐ {meet.rating}</span>
            <span>约练 {meet.meetCount} 次</span>
          </div>
        </div>
        <Badge variant="lime" size="sm">{meet.sport}</Badge>
      </div>

      {/* Title */}
      <h3 className="font-display font-bold text-sm mb-2.5 leading-snug">
        {meet.title}
      </h3>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <InfoItemInline icon="🕐" text={meet.time} />
        <InfoItemInline icon="📍" text={meet.dist} />
        <InfoItemInline icon="💰" text={meet.price} />
        <InfoItemInline icon="🎯" text={meet.level} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-textMuted">
          剩余 <strong className="text-lime">{meet.slots}</strong>/{meet.maxSlots} 人
        </span>
        <Button variant="primary" size="sm" onClick={handleJoin}>
          加入
        </Button>
      </div>
    </article>
  );
});


