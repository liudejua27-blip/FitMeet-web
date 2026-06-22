import { cn } from '../../lib/utils';

type AssistantThinkingDotsProps = {
  className?: string;
  label?: string;
};

export function AssistantThinkingDots({
  className,
  label = '正在理解你的需求',
}: AssistantThinkingDotsProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-[#8a8f98]',
        className,
      )}
      data-testid="assistant-ui-thinking"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a8f98]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a8f98] [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8a8f98] [animation-delay:240ms]" />
    </span>
  );
}
