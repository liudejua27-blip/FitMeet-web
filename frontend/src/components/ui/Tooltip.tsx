import { memo } from 'react';
import { cn } from '../../lib/utils';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip = memo(function Tooltip({
  content,
  children,
  className,
}: TooltipProps) {
  return (
    <span className={cn('relative inline-flex group', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
          'z-50 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1',
          'text-[11px] text-textMuted shadow-lg opacity-0 translate-y-1',
          'transition-all duration-150 delay-[100ms]',
          'group-hover:opacity-100 group-hover:translate-y-0 group-hover:animate-tooltipIn',
          'group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:animate-tooltipIn'
        )}
      >
        {content}
        <span
          className="absolute left-1/2 top-full -translate-x-1/2 h-2 w-2 rotate-45 border-b border-r border-border bg-surface"
          aria-hidden="true"
        />
      </span>
    </span>
  );
});
