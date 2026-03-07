import { memo } from 'react';
import { cn } from '../../lib/utils';
import { FilterChip } from '../ui';

interface CoachSearchBarProps {
  filter: string;
  onFilterChange: (filter: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const specialtyFilters = [
  { id: 'all', label: '全部' },
  { id: 'muscle', label: '💪 增肌' },
  { id: 'fat', label: '🔥 减脂' },
  { id: 'yoga', label: '🧘 瑜伽' },
  { id: 'run', label: '🏃 跑步' },
  { id: 'rehab', label: '🩺 康复' },
];

const sortOptions = [
  { id: 'recommend', label: '综合推荐' },
  { id: 'rating', label: '评分最高' },
  { id: 'price', label: '价格最低' },
];

export const CoachSearchBar = memo(function CoachSearchBar({
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
}: CoachSearchBarProps) {
  return (
    <div className="sticky top-16 z-40 flex items-center gap-3 px-8 py-5 border-b border-border bg-base/95 backdrop-blur-xl">
      {/* Search Input */}
      <div className="flex-1 max-w-[520px] flex items-center gap-2.5 bg-surface border border-border rounded-full px-5 py-2.5 transition-colors focus-within:border-lime/30">
        <span className="text-textMuted flex-shrink-0">🔍</span>
        <input
          type="text"
          placeholder="搜索教练姓名或专长..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-textMuted"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 flex-1 px-4">
        {specialtyFilters.map(f => (
          <FilterChip
            key={f.id}
            active={filter === f.id}
            onClick={() => onFilterChange(f.id)}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      {/* Sort Buttons */}
      <div className="flex gap-2 ml-auto">
        {sortOptions.map(s => (
          <button
            key={s.id}
            className={cn(
              'px-4 py-2 rounded-full font-display font-semibold text-xs transition-all duration-200 cursor-pointer',
              sortBy === s.id
                ? 'bg-surfaceMuted text-white border border-borderStrong'
                : 'text-textMuted hover:text-white bg-transparent border-none'
            )}
            onClick={() => onSortChange(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
});
