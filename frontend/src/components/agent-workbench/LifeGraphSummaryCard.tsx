import { Link } from 'react-router-dom';
import type { SocialAgentPermissionMode } from '../../api/socialAgentApi';
import { permissionModeLabel } from './permissionModeLabel';

export function LifeGraphSummaryCard({
  mode,
  pendingCount,
}: {
  mode: SocialAgentPermissionMode;
  pendingCount: number;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-950">Life Graph</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Agent 理解你、匹配人和保护边界的基础。</p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 to-violet-50 text-sm font-bold text-cyan-700">
          72%
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Info label="兴趣标签" value="跑步 / 健身" />
        <Info label="当前目标" value="找同频搭子" />
        <Info label="隐私边界" value="先聊后约" />
        <Info label="权限模式" value={permissionModeLabel(mode)} />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <span>待确认动作 {pendingCount} 项</span>
        <Link className="font-semibold" to="/agent-control">
          查看
        </Link>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-1 truncate font-semibold text-slate-800">{value}</div>
    </div>
  );
}
