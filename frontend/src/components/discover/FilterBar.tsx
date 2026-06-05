import { memo } from 'react';
import clsx from 'clsx';
import { CATEGORIES, DISTANCE_FILTERS, GENDER_FILTERS, LEVEL_FILTERS } from '../../data/options';

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
  active,
  distance,
  gender,
  level,
  onChange,
  onDistanceChange,
  onGenderChange,
  onLevelChange,
}: FilterBarProps) {
  return (
    <div className="sticky top-[72px] z-40 border-b border-[#ead8c7] bg-paper/95 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={clsx(
                'whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-black transition',
                active === cat.id
                  ? 'border-lime bg-lime text-white shadow-glow'
                  : 'border-[#ead8c7] bg-white text-[#76543e] hover:border-lime/40 hover:text-lime',
              )}
              onClick={() => onChange(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex gap-4 overflow-x-auto pt-2">
          <FilterGroup
            label="性别"
            options={GENDER_FILTERS}
            value={gender}
            onChange={onGenderChange}
          />
          <FilterGroup
            label="距离"
            options={DISTANCE_FILTERS}
            value={distance}
            onChange={onDistanceChange}
          />
          <FilterGroup
            label="水平"
            options={LEVEL_FILTERS}
            value={level}
            onChange={onLevelChange}
          />
        </div>
      </div>
    </div>
  );
});

const FilterGroup = memo(function FilterGroup({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#ead8c7] bg-white px-2 py-1">
      <span className="px-2 text-[11px] font-black text-[#9a7459]">{label}</span>
      {options.map((opt) => (
        <button
          key={opt.id}
          className={clsx(
            'rounded-md px-3 py-1.5 text-xs font-bold transition',
            value === opt.id ? 'bg-[#fff0e2] text-lime' : 'text-[#76543e] hover:text-lime',
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
});
