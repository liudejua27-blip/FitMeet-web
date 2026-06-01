import clsx from 'clsx';
import type { SocialAgentPermissionMode } from '../../api/socialAgentApi';

const modes: Array<{
  value: SocialAgentPermissionMode;
  label: string;
  description: string;
}> = [
  {
    value: 'assist',
    label: 'Assisted',
    description: '只分析和建议',
  },
  {
    value: 'limited_auto',
    label: 'Limited Auto',
    description: '可搜索、推荐、生成开场白',
  },
  {
    value: 'open',
    label: 'Open',
    description: '更多自动化，关键动作仍确认',
  },
];

export function PermissionModeSelector({
  value,
  onChange,
  compact = false,
}: {
  value: SocialAgentPermissionMode;
  onChange: (value: SocialAgentPermissionMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={clsx('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-1')}>
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          className={clsx(
            'rounded-2xl border px-3 py-2 text-left transition',
            value === mode.value
              ? 'border-cyan-300 bg-cyan-50 text-slate-950 shadow-sm'
              : 'border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300',
          )}
          onClick={() => onChange(mode.value)}
        >
          <span className="block text-xs font-semibold">{mode.label}</span>
          {!compact && <span className="mt-1 block text-[11px] leading-4">{mode.description}</span>}
        </button>
      ))}
    </div>
  );
}
