import React from 'react';
import { cn } from '../../lib/utils';

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

export const FilterChip = React.memo(function FilterChip({
  active = false,
  className,
  children,
  ...props
}: FilterChipProps) {
  return (
    <button
      className={cn(
        'px-4 py-1.5 rounded-full whitespace-nowrap font-display font-semibold text-[13px]',
        'border transition-all duration-200 flex-shrink-0 bg-transparent cursor-pointer',
        active
          ? 'bg-lime text-[#09090A] border-lime'
          : 'border-border text-textMuted hover:border-borderStrong hover:text-white',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
