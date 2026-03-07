import { memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import { MeetCard } from './MeetCard';
import type { Meet } from '../../data/mockData';

interface MeetSidebarProps {
  meets: Meet[];
  selectedId: number | null;
  filter: string;
  distanceFilter: string;
  onFilterChange: (filter: string) => void;
  onDistanceChange: (distance: string) => void;
  onSelect: (id: number) => void;
  onJoin: (id: number) => void;
}

const typeFilters = [
  { id: 'all', label: '全部' },
  { id: 'gym', label: '🏋️ 健身房' },
  { id: 'run', label: '🏃 跑步' },
  { id: 'yoga', label: '🧘 瑜伽' },
];

const distFilters = ['1km', '3km', '5km', '不限'];

export const MeetSidebar = memo(function MeetSidebar({
  meets,
  selectedId,
  filter,
  distanceFilter,
  onFilterChange,
  onDistanceChange,
  onSelect,
  onJoin,
}: MeetSidebarProps) {
  const handleCreate = useCallback(() => {
    window.alert('发起约练功能开发中');
  }, []);

  return (
    <aside className="border-r border-border flex flex-col h-[calc(100vh-64px)] sticky top-16 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="font-display font-extrabold text-xl">附近约练</h2>
          <Button variant="primary" size="sm" onClick={handleCreate}>
            + 发起约练
          </Button>
        </div>

        {/* Type Tabs */}
        <div className="flex gap-1.5 mb-3">
          {typeFilters.map(t => (
            <button
              key={t.id}
              aria-pressed={filter === t.id}
              className={cn(
                'flex-1 py-1.5 rounded-lg font-display font-semibold text-xs text-center',
                'border transition-all duration-200 cursor-pointer',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime',
                filter === t.id
                  ? 'bg-lime text-[#09090A] border-lime'
                  : 'border-border text-textMuted hover:border-borderStrong'
              )}
              onClick={() => onFilterChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Distance Chips */}
        <div className="flex gap-1.5">
          {distFilters.map((d) => (
            <button
              key={d}
              className={cn(
                'px-3 py-1 rounded-full font-mono text-[11px] whitespace-nowrap',
                'border transition-all duration-200 cursor-pointer bg-transparent',
                distanceFilter === d
                  ? 'border-lime/40 text-lime bg-limeDim'
                  : 'border-border text-textMuted hover:border-borderStrong'
              )}
              onClick={() => onDistanceChange(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {meets.map(meet => (
          <MeetCard
            key={meet.id}
            meet={meet}
            isSelected={selectedId === meet.id}
            onSelect={onSelect}
            onJoin={onJoin}
          />
        ))}

        {meets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-textMuted">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-sm">暂无约练活动</div>
          </div>
        )}
      </div>
    </aside>
  );
});
