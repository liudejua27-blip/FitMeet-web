import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

export const Button = React.memo(function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-display font-bold rounded-full transition-all duration-200 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Variants
        variant === 'primary' && 'bg-lime text-[#09090A] hover:bg-[#d4ff1a] hover:-translate-y-0.5 hover:shadow-glow',
        variant === 'secondary' && 'bg-lime/10 text-lime border border-lime/25 hover:bg-lime hover:text-[#09090A]',
        variant === 'outline' && 'bg-transparent text-white border border-border hover:border-borderStrong hover:bg-lime/5',
        variant === 'ghost' && 'bg-transparent text-textMuted border border-border hover:border-borderStrong hover:text-white',
        // Sizes
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-5 py-2 text-sm',
        size === 'lg' && 'px-8 py-3 text-base',
        size === 'xl' && 'px-9 py-4 text-base',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
