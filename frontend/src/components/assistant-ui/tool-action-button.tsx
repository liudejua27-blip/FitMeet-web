import { Loader2 } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function ToolActionButton({
  icon,
  label,
  busyLabel,
  busy,
  disabled,
  variant = 'ghost',
  onClick,
  ...buttonProps
}: {
  icon: ReactNode;
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'ghost' | 'primary';
  onClick: () => void;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type' | 'onClick' | 'disabled'>) {
  return (
    <button
      {...buttonProps}
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary'
          ? 'bg-[#18181b] text-white hover:bg-[#27272a]'
          : 'bg-white text-[#52525b] ring-1 ring-black/10',
      )}
      onClick={onClick}
      disabled={busy || disabled}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {busy ? (busyLabel ?? '处理中') : label}
    </button>
  );
}
