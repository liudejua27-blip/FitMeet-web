import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Reusable empty-state placeholder with icon, message, and optional action.
 */
export function EmptyState({
  icon = '🔍',
  title = '暂无内容',
  description = '换个条件试试吧',
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center', className)}>
      <div className="text-5xl mb-4" aria-hidden="true">{icon}</div>
      <h3 className="font-display font-bold text-lg text-textMuted mb-2">{title}</h3>
      <p className="text-sm text-textSofter mb-4">{description}</p>
      {action}
    </div>
  );
}
