import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../../lib/utils';

type TooltipIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string;
  children: ReactNode;
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  function TooltipIconButton({ tooltip, className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6b7280] transition-colors hover:bg-black/[0.05] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 disabled:pointer-events-none disabled:opacity-40',
          className,
        )}
        aria-label={props['aria-label'] ?? tooltip}
        title={tooltip}
        {...props}
      >
        {children}
      </button>
    );
  },
);
