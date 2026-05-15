import { memo, useCallback } from 'react';
import clsx from 'clsx';
import type { Meet } from '../../types';
import { Avatar, Badge } from '../ui';
import { formatDistanceMeters, getMeetDistanceMeters } from '../../lib/distance';

interface MeetCardProps {
  meet: Meet;
  isSelected: boolean;
  hasUserLocation?: boolean;
  onSelect: (id: number) => void;
  onJoin: (id: number) => void;
}

const levelLabels: Record<string, string> = {
  all: '不限水平',
  beginner: '新手友好',
  intermediate: '进阶',
  advanced: '专业',
};

export const MeetCard = memo(function MeetCard({
  hasUserLocation = false,
  isSelected,
  meet,
  onJoin,
  onSelect,
}: MeetCardProps) {
  const handleSelect = useCallback(() => onSelect(meet.id), [meet.id, onSelect]);
  const handleJoin = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onJoin(meet.id);
    },
    [meet.id, onJoin],
  );

  const distance = formatDistanceMeters(getMeetDistanceMeters(meet));
  const remainingSlots = Math.max(meet.slots, 0);
  const joinedSlots = Math.max(meet.maxSlots - remainingSlots, 0);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={clsx(
        'group cursor-pointer rounded-xl border p-4 transition focus:outline-none focus:ring-2 focus:ring-lime/40',
        isSelected
          ? 'border-lime/60 bg-[#fff7ed] text-ink shadow-card'
          : 'border-white/10 bg-white/[0.04] text-cream hover:border-lime/40 hover:bg-white/[0.07]',
      )}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={meet.username} color={meet.color} size="lg" verified={meet.cert} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-black">{meet.title}</h3>
            <Badge variant="lime" size="sm">
              {meet.sport}
            </Badge>
          </div>
          <div className={clsx('mt-1 truncate text-xs font-bold', isSelected ? 'text-[#76543e]' : 'text-textMuted')}>
            {meet.username} · {meet.time}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <div className={clsx('truncate text-xs font-bold', isSelected ? 'text-[#76543e]' : 'text-textMuted')}>
            {meet.loc}
          </div>
          <div className={clsx('mt-1 truncate text-[11px]', isSelected ? 'text-[#9a7355]' : 'text-textSofter')}>
            {meet.address || meet.city || levelLabels[meet.level] || meet.level}
          </div>
        </div>
        <div className="text-right">
          <div className={clsx('text-lg font-black', isSelected ? 'text-lime' : 'text-cream')}>
            {distance || (hasUserLocation ? '待计算' : '定位后')}
          </div>
          <div className={clsx('text-[11px] font-bold', isSelected ? 'text-[#9a7355]' : 'text-textSofter')}>
            距你
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className={clsx('mb-1 flex justify-between text-[11px] font-bold', isSelected ? 'text-[#76543e]' : 'text-textMuted')}>
            <span>{levelLabels[meet.level] || meet.level}</span>
            <span>
              {joinedSlots}/{meet.maxSlots} 人
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-lime"
              style={{ width: `${Math.min((joinedSlots / Math.max(meet.maxSlots, 1)) * 100, 100)}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          className={clsx(
            'shrink-0 rounded-lg px-3 py-2 text-xs font-black transition',
            isSelected
              ? 'bg-lime text-white hover:bg-brand2'
              : 'border border-white/10 text-textMuted hover:border-lime/40 hover:text-cream',
          )}
          onClick={handleJoin}
        >
          加入
        </button>
      </div>
    </article>
  );
});
