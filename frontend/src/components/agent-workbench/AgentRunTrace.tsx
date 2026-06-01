import clsx from 'clsx';
import { useState } from 'react';
import type { AgentRunEvent } from './agentWorkbenchTypes';

export function AgentRunTrace({
  events,
  defaultCollapsed = false,
}: {
  events: AgentRunEvent[];
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  if (events.length === 0) return null;
  const finished = events.every((event) => event.status === 'success' || event.status === 'waiting_confirmation');

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 p-3 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-2 py-1 text-left"
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="text-sm font-semibold text-slate-900">
          {finished ? '执行过程已完成' : 'FitMeet Agent 正在处理'}
        </span>
        <span className="text-xs font-medium text-slate-400">{collapsed ? '展开' : '收起'}</span>
      </button>
      {!collapsed && (
        <div className="mt-2 space-y-1">
          {events.map((event) => (
            <AgentRunStep key={event.stepId} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentRunStep({ event }: { event: AgentRunEvent }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-2 py-2">
      <span
        className={clsx(
          'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]',
          event.status === 'success' && 'border-cyan-200 bg-cyan-50 text-cyan-700',
          event.status === 'running' && 'border-violet-200 bg-violet-50 text-violet-700',
          event.status === 'pending' && 'border-slate-200 bg-slate-50 text-slate-300',
          event.status === 'error' && 'border-rose-200 bg-rose-50 text-rose-700',
          event.status === 'waiting_confirmation' && 'border-amber-200 bg-amber-50 text-amber-700',
        )}
      >
        {event.status === 'success' ? '✓' : event.status === 'running' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> : '•'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800">{event.title}</div>
        {event.summary && <div className="mt-0.5 text-xs leading-5 text-slate-500">{event.summary}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>{event.agent}</span>
          {event.tool && <span className="rounded-full bg-slate-100 px-2 py-0.5">{event.tool}</span>}
        </div>
      </div>
    </div>
  );
}
