import React from 'react';
import { cn } from '../../lib/utils';

export interface TagProps {
  variant?: 'default' | 'lime';
  children: React.ReactNode;
  className?: string;
}

export const Tag = React.memo(function Tag({
  variant = 'default',
  children,
  className,
}: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono',
        variant === 'default' && 'border-border text-textMuted',
        variant === 'lime' && 'border-lime/30 text-lime bg-limeDim',
        className
      )}
    >
      {children}
    </span>
  );
});
