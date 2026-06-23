import { ChevronDown, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { normalizeInlineProductText } from './tool-card-text';

export function ProductCardDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      className="group/card-details mt-3 rounded-xl bg-[#fbfbfc] px-3 py-2 ring-1 ring-black/[0.05]"
      data-testid="assistant-ui-product-card-details"
      data-default-state="collapsed"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium leading-5 text-[#52525b] marker:hidden">
        <span>{title}</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-[#a1a1aa] transition-transform group-open/card-details:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

export function ReasonList({ title, reasons }: { title: string; reasons: string[] }) {
  const visibleReasons = reasons.map(normalizeInlineProductText).filter(Boolean).slice(0, 5);
  if (visibleReasons.length === 0) return null;
  return (
    <div
      className="rounded-xl bg-white px-3 py-2 ring-1 ring-black/[0.05]"
      data-testid="assistant-ui-reason-list"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
        {visibleReasons.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

export function MetaChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f7f7f8] px-2 py-1 text-[11px] leading-4 text-[#71717a] ring-1 ring-black/5">
      {icon}
      {label}
    </span>
  );
}

export function DiffPane({
  title,
  value,
  emphasized,
}: {
  title: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 ring-1',
        emphasized
          ? 'bg-violet-50/70 text-violet-900 ring-violet-100'
          : 'bg-[#f7f7f8] text-[#52525b] ring-black/5',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">{title}</p>
      <p className="mt-1 text-xs leading-5">{value}</p>
    </div>
  );
}
