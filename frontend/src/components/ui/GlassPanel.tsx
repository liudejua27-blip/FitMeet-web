import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>;

export function GlassPanel({ children, className, ...props }: GlassPanelProps) {
  return (
    <div
      className={clsx(
        'border border-[#f4efe6]/10 bg-[#141413]/58 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
