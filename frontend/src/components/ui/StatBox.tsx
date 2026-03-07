import { memo } from 'react';
import { cn } from '../../lib/utils';

type StatBoxSize = 'sm' | 'md' | 'lg';

interface StatBoxProps {
  value: string;
  label: string;
  highlight?: boolean;
  icon?: string;
  size?: StatBoxSize;
  className?: string;
}

const sizeStyles: Record<StatBoxSize, { wrapper: string; value: string; label: string }> = {
  sm: {
    wrapper: 'p-2 bg-surfaceMuted rounded-lg',
    value: 'font-display font-bold text-sm',
    label: 'text-[10px] text-textMuted',
  },
  md: {
    wrapper: 'p-3 bg-surfaceMuted rounded-xl',
    value: 'font-display font-bold text-base',
    label: 'text-[10px] text-textMuted',
  },
  lg: {
    wrapper: 'p-4 bg-surface border border-border rounded-xl',
    value: 'font-display font-extrabold text-xl',
    label: 'text-xs text-textMuted mt-1',
  },
};

export const StatBox = memo(function StatBox({
  value,
  label,
  highlight = false,
  icon,
  size = 'sm',
  className,
}: StatBoxProps) {
  const s = sizeStyles[size];
  return (
    <div className={cn('text-center', s.wrapper, className)}>
      {icon && <div className="mb-1 text-2xl">{icon}</div>}
      <div className={cn(s.value, highlight ? 'text-lime' : 'text-white')}>
        {value}
      </div>
      <div className={s.label}>{label}</div>
    </div>
  );
});
