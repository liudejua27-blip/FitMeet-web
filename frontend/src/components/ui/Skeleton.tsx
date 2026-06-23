import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

/** Pulsing placeholder for loading states. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-surfaceMuted', className)}
      aria-hidden="true"
    />
  );
}
