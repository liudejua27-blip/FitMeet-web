import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps {
  variant?: 'default' | 'lime' | 'meet' | 'log' | 'coach' | 'danger';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

export const Badge = React.memo(function Badge({
  variant = 'default',
  size = 'md',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-mono uppercase tracking-wider',
        // Sizes
        size === 'sm' && 'px-2 py-0.5 text-[9px]',
        size === 'md' && 'px-3 py-1 text-[10px]',
        // Variants
        variant === 'default' && 'border border-border text-textMuted bg-surface',
        variant === 'lime' && 'border border-lime/30 text-lime bg-limeDim',
        variant === 'meet' && 'bg-lime/95 text-white',
        variant === 'log' && 'bg-base/80 text-white border border-border',
        variant === 'coach' && 'bg-blue-500/90 text-white',
        variant === 'danger' && 'bg-red-500/90 text-white',
        className
      )}
    >
      {children}
    </span>
  );
});
