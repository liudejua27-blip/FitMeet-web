import React from 'react';
import { cn, getInitials } from '../../lib/utils';

export interface AvatarProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  verified?: boolean;
  className?: string;
}

export const Avatar = React.memo(function Avatar({
  name,
  color = '#FF6A00',
  size = 'md',
  online,
  verified,
  className,
}: AvatarProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base',
  };

  return (
    <div className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'rounded-lg flex items-center justify-center font-display font-bold text-base text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]',
          sizeClasses[size]
        )}
        style={{ backgroundColor: color }}
      >
        {getInitials(name)}
      </div>

      {/* Online indicator */}
      {online !== undefined && (
        <div
          className={cn(
            'absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-surface',
            online ? 'bg-lime' : 'bg-textSofter',
            size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
          )}
        />
      )}

      {/* Verified badge */}
      {verified && (
        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-md bg-lime text-[8px] text-white">
          ✓
        </div>
      )}
    </div>
  );
});
