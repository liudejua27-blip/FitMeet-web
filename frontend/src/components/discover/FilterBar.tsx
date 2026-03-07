import { memo } from 'react';
import clsx from 'clsx';
import { CATEGORIES, GENDER_FILTERS, DISTANCE_FILTERS, LEVEL_FILTERS } from '../../data/mockData';

interface FilterBarProps {
  active: string;
  onChange: (key: string) => void;
  gender: string;
  onGenderChange: (g: string) => void;
  distance: string;
  onDistanceChange: (d: string) => void;
  level: string;
  onLevelChange: (l: string) => void;
}

export const FilterBar = memo(function FilterBar({
  active, onChange,
  gender, onGenderChange,
  distance, onDistanceChange,
  level, onLevelChange,
}: FilterBarProps) {
  return (
    <div className="sticky top-16 z-40 border-b border-border/70 bg-base/90 backdrop-blur-xl">
      {/* Primary filter row */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-6 py-3 text-sm">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={clsx(
              'whitespace-nowrap rounded-full border px-4 py-2 font-display font-semibold transition cursor-pointer',
              active === cat.id
                ? 'border-lime bg-lime text-[#09090A]'
                : 'border-border text-textMuted hover:border-borderStrong hover:text-white'
            )}
            onClick={() => onChange(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Secondary filter row */}
      <div className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-6 py-2.5 border-t border-border/40">
        {/* Gender filter */}
        <FilterGroup label="性别" options={GENDER_FILTERS} value={gender} onChange={onGenderChange} />

        <span className="h-4 w-px bg-border flex-shrink-0" aria-hidden />

        {/* Distance filter */}
        <FilterGroup label="距离" options={DISTANCE_FILTERS} value={distance} onChange={onDistanceChange} />

        <span className="h-4 w-px bg-border flex-shrink-0" aria-hidden />

        {/* Level filter */}
        <FilterGroup label="等级" options={LEVEL_FILTERS} value={level} onChange={onLevelChange} />
      </div>
    </div>
  );
});

const FilterGroup = memo(function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-[11px] text-textSofter font-mono mr-1">{label}</span>
      {options.map((opt) => (
        <button
          key={opt.id}
          className={clsx(
            'whitespace-nowrap rounded-full px-3 py-1 text-xs font-display font-semibold transition cursor-pointer',
            value === opt.id
              ? 'bg-lime/15 text-lime border border-lime/30'
              : 'text-textMuted hover:text-white border border-transparent'
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
});
