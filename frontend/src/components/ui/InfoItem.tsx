import { memo } from 'react';
import { cn } from '../../lib/utils';

interface InfoItemInlineProps {
  icon: string;
  text: string;
  className?: string;
}

interface InfoItemStackedProps {
  label: string;
  value: string;
  className?: string;
}

/** Inline: icon + text in a row (used in MeetCard etc.) */
export const InfoItemInline = memo(function InfoItemInline({ icon, text, className }: InfoItemInlineProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className="text-[13px]">{icon}</span>
      <span className="text-xs text-textMuted truncate">{text}</span>
    </div>
  );
});

/** Stacked: label on top, value below (used in ProfileCoach etc.) */
export const InfoItemStacked = memo(function InfoItemStacked({ label, value, className }: InfoItemStackedProps) {
  return (
    <div className={className}>
      <div className="text-xs text-textMuted mb-1">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
});
