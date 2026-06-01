import type { AgentConfirmAction } from './agentWorkbenchTypes';
import { permissionModeLabel } from './PermissionModeSelector';

export function ActionConfirmDialog({
  action,
  onClose,
  onConfirm,
}: {
  action: AgentConfirmAction | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!action) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 shadow-2xl sm:rounded-[32px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">确认让 FitMeet Agent 执行此操作？</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              关键社交动作不会自动执行。请确认对象、内容和风险提示。
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"
            onClick={onClose}
            aria-label="关闭确认弹窗"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-3 rounded-3xl bg-slate-50 p-4">
          <Info label="操作" value={action.title} />
          <Info label="对象" value={action.target} />
          <Info label="权限模式" value={permissionModeLabel(action.permissionMode)} />
          <div>
            <div className="text-xs font-semibold text-slate-400">将发送的内容</div>
            <div className="mt-1 rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800">
              {action.content}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            {action.riskNote}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            onClick={onClose}
          >
            修改内容
          </button>
          <button
            type="button"
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
            onClick={onConfirm}
          >
            确认发送
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}
