import { Link } from 'react-router-dom';
import { recentConversations } from './agentWorkbenchMock';
import { PermissionModeSelector } from './PermissionModeSelector';
import { permissionModeLabel } from './permissionModeLabel';
import type { SocialAgentPermissionMode } from '../../api/socialAgentDebugApi';

export function AgentSidebar({
  mode,
  onModeChange,
  onNewChat,
}: {
  mode: SocialAgentPermissionMode;
  onModeChange: (value: SocialAgentPermissionMode) => void;
  onNewChat: () => void;
}) {
  return (
    <aside className="hidden h-[calc(100vh-72px)] w-[280px] shrink-0 border-r border-slate-200/80 bg-white/80 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
      <button
        type="button"
        className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        onClick={onNewChat}
      >
        新建会话
      </button>

      <label className="mt-4 block">
        <span className="sr-only">搜索历史会话</span>
        <input
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white"
          placeholder="搜索历史会话"
        />
      </label>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          最近会话
        </div>
        <div className="space-y-2">
          {recentConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className="w-full rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-slate-200 hover:bg-white"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {conversation.title}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{conversation.updatedAt}</span>
              </div>
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                {conversation.type}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-400">当前权限</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{permissionModeLabel(mode)}</div>
        </div>
        <PermissionModeSelector value={mode} onChange={onModeChange} />
        <div className="grid grid-cols-2 gap-2">
          <Link className="rounded-2xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-600 shadow-sm" to="/life-graph">
            我的画像
          </Link>
          <Link className="rounded-2xl bg-white px-3 py-2 text-center text-xs font-semibold text-slate-600 shadow-sm" to="/agent-control">
            设置
          </Link>
        </div>
      </div>
    </aside>
  );
}
