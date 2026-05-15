import { memo } from 'react';
import clsx from 'clsx';

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
  { id: 'muscle', label: '增肌' },
  { id: 'fat', label: '减脂' },
  { id: 'yoga', label: '瑜伽' },
  { id: 'run', label: '跑步' },
  { id: 'rehab', label: '康复' },
];

const sortOptions = [
  { id: 'recommend', label: '综合推荐' },
  { id: 'rating', label: '评分最高' },
  { id: 'students', label: '学员最多' },
];

export const CoachSearchBar = memo(function CoachSearchBar({
  filter,
  onFilterChange,
  onSearchChange,
  onSortChange,
  searchQuery,
  sortBy,
}: CoachSearchBarProps) {
  return (
    <div className="sticky top-[72px] z-40 border-b border-[#ead8c7] bg-paper/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center">
        <label className="flex min-w-[280px] flex-1 items-center gap-3 rounded-xl border border-[#ead8c7] bg-white px-4 py-3 shadow-card focus-within:border-lime/50">
          <span className="text-lime">⌕</span>
          <input
            type="text"
            placeholder="搜索教练姓名或专长..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none placeholder:text-[#a9866a]"
          />
        </label>

        <div className="flex gap-2 overflow-x-auto">
          {specialtyFilters.map((item) => (
            <button
              key={item.id}
              className={clsx(
                'rounded-lg border px-4 py-2 text-sm font-black transition',
                filter === item.id
                  ? 'border-lime bg-lime text-white shadow-glow'
                  : 'border-[#ead8c7] bg-white text-[#76543e] hover:border-lime/40 hover:text-lime',
              )}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {sortOptions.map((item) => (
            <button
              key={item.id}
              className={clsx(
                'rounded-lg px-4 py-2 text-xs font-black transition',
                sortBy === item.id ? 'bg-[#24130a] text-white' : 'bg-white text-[#76543e] hover:text-lime',
              )}
              onClick={() => onSortChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
