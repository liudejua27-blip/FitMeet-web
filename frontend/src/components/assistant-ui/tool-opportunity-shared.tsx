import { CheckCircle2, Sparkles } from 'lucide-react';

import { normalizeInlineProductText } from './tool-card-shared';
import type { ToolUISchemaType } from './tool-ui-schema';

export function ConfirmedContextChips({
  items,
  schemaType,
}: {
  items: string[];
  schemaType: ToolUISchemaType;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5"
      data-testid="assistant-ui-confirmed-context"
      data-schema-type={schemaType}
      aria-label="已确认需求"
    >
      {items.slice(0, 5).map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100"
        >
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          {item}
        </span>
      ))}
    </div>
  );
}

export function PrimaryReason({
  reason,
  fallback,
  label,
}: {
  reason?: string | null;
  fallback?: string | null;
  label: string;
}) {
  const text = normalizeInlineProductText(reason ?? fallback);
  if (!text) return null;
  return (
    <div
      className="mt-3 rounded-xl bg-[#fafafa] px-3 py-2 ring-1 ring-black/[0.04]"
      data-testid="assistant-ui-primary-reason"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#71717a]">{text}</p>
    </div>
  );
}

export function safeImageSrc(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
