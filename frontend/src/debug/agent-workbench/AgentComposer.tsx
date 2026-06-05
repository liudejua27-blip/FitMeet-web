import type { FormEvent } from 'react';
import { quickPrompts } from './agentWorkbenchMock';

export function AgentComposer({
  value,
  isRunning,
  onChange,
  onSubmit,
  onStop,
  onPrompt,
}: {
  value: string;
  isRunning: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onStop: () => void;
  onPrompt: (value: string) => void;
}) {
  return (
    <div className="border-t border-slate-200 bg-white/90 px-4 pb-4 pt-3 backdrop-blur-xl">
      <div className="mx-auto max-w-4xl">
        <div className="mb-3 hidden flex-wrap gap-2 sm:flex">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-cyan-200 hover:text-cyan-700"
              onClick={() => onPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_16px_50px_rgba(15,23,42,0.08)]"
        >
          <textarea
            value={value}
            rows={2}
            className="block max-h-36 min-h-14 w-full resize-none rounded-3xl bg-transparent px-4 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="说出你的社交需求，比如：今晚想找一个一起健身的人"
            onChange={(event) => onChange(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <div className="flex items-center gap-1">
              <ComposerButton label="添加图片/文件">＋</ComposerButton>
              <ComposerButton label="选择位置">⌖</ComposerButton>
              <ComposerButton label="选择需求类型">▦</ComposerButton>
            </div>
            <div className="flex items-center gap-2">
              <ComposerButton label="语音输入">♪</ComposerButton>
              {isRunning ? (
                <button
                  type="button"
                  className="rounded-2xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={onStop}
                >
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!value.trim()}
                  className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  发送
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ComposerButton({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}
