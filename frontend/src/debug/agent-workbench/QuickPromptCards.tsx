import { quickPrompts } from './agentWorkbenchMock';

export function QuickPromptCards({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {quickPrompts.slice(0, 4).map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="rounded-3xl border border-slate-200 bg-white/80 p-4 text-left text-sm font-medium leading-6 text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/50"
          onClick={() => onPick(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
