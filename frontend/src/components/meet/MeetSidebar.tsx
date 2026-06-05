import { memo } from 'react';
import clsx from 'clsx';
import type { AmapPlace } from '../../lib/amap';
import type { Meet } from '../../types';
import { Button } from '../ui';
import { MeetCard } from './MeetCard';
import { SPORT_GROUP_OPTIONS } from '../../data/taxonomy';

interface MeetSidebarProps {
  meets: Meet[];
  selectedId: number | null;
  filter: string;
  distanceFilter: string;
  currentPlace?: AmapPlace | null;
  isLocating?: boolean;
  onFilterChange: (filter: string) => void;
  onDistanceChange: (distance: string) => void;
  onUseMyLocation?: () => void;
  onSelect: (id: number) => void;
  onJoin: (id: number) => void;
  onCreate?: () => void;
}

const typeFilters = [
  { id: 'all', label: '全部' },
  ...SPORT_GROUP_OPTIONS.map((item) => ({ id: item.id, label: item.shortLabel })),
];
const distFilters = ['1km', '3km', '5km', '不限'];

export const MeetSidebar = memo(function MeetSidebar({
  currentPlace,
  distanceFilter,
  filter,
  isLocating = false,
  meets,
  onCreate,
  onDistanceChange,
  onFilterChange,
  onJoin,
  onSelect,
  onUseMyLocation,
  selectedId,
}: MeetSidebarProps) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-panel lg:sticky lg:top-28 lg:max-h-[calc(100vh-120px)]">
      <div className="border-b border-white/10 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-black">约练队列</h2>
            <p className="mt-1 text-xs text-textMuted">{meets.length} 场活动 · 附近优先</p>
          </div>
          <Button size="sm" onClick={onCreate}>
            发起
          </Button>
        </div>

        <div className="mb-4 rounded-xl border border-lime/20 bg-lime/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase text-lime">当前位置</div>
              <div className="mt-1 truncate text-sm font-black text-cream">
                {currentPlace?.name || '尚未定位'}
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-textMuted">
                {currentPlace
                  ? [currentPlace.district, currentPlace.address].filter(Boolean).join(' · ')
                  : '定位后将显示每场约练与你的实际距离，并按附近优先排序。'}
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg border border-lime/30 px-3 py-2 text-xs font-black text-lime transition hover:bg-lime hover:text-white disabled:opacity-60"
              disabled={isLocating}
              onClick={onUseMyLocation}
            >
              {isLocating ? '定位中' : currentPlace ? '更新' : '定位'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-2 text-[11px] font-black text-textMuted">运动类型</div>
            <div className="grid grid-cols-3 gap-2">
              {typeFilters.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={filter === item.id}
                  className={clsx(
                    'rounded-lg border px-2 py-2 text-xs font-black transition',
                    filter === item.id
                      ? 'border-lime bg-lime text-white shadow-glow'
                      : 'border-white/10 text-textMuted hover:border-lime/40 hover:text-cream',
                  )}
                  onClick={() => onFilterChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-black text-textMuted">距离范围</div>
            <div className="grid grid-cols-4 gap-2">
              {distFilters.map((distance) => (
                <button
                  key={distance}
                  className={clsx(
                    'rounded-lg border px-2 py-2 text-xs font-black transition',
                    distanceFilter === distance
                      ? 'border-lime/40 bg-lime/15 text-lime'
                      : 'border-white/10 text-textMuted hover:border-lime/40 hover:text-cream',
                  )}
                  onClick={() => onDistanceChange(distance)}
                >
                  {distance}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[680px] space-y-3 overflow-y-auto p-3">
        {meets.map((meet) => (
          <MeetCard
            key={meet.id}
            hasUserLocation={Boolean(currentPlace)}
            isSelected={selectedId === meet.id}
            meet={meet}
            onJoin={onJoin}
            onSelect={onSelect}
          />
        ))}
        {meets.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-10 text-center text-sm font-bold text-textMuted">
            暂无符合条件的约练
          </div>
        )}
      </div>
    </aside>
  );
});
