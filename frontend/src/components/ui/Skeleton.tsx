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

/* ─── Pre-built skeleton cards ─── */

/** Skeleton for FeedCard / post card. */
export function FeedCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-4 pt-1">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

/** Skeleton for CoachCard. */
export function CoachCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

/** Skeleton for MeetCard. */
export function MeetCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
    </div>
  );
}
