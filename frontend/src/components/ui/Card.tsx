import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'selected';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Card = React.memo(function Card({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200',
        variant === 'interactive' && 'cursor-pointer hover:border-borderStrong hover:-translate-y-1 hover:shadow-card',
        variant === 'selected' && 'border-lime/45 bg-surfaceMuted',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-4',
        padding === 'lg' && 'p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardHeader = React.memo(function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mb-3', className)}>
      {children}
    </div>
  );
});

export const CardContent = React.memo(function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(className)}>
      {children}
    </div>
  );
});

export const CardFooter = React.memo(function CardFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-center gap-4 pt-3 border-t border-border', className)}>
      {children}
    </div>
  );
});
