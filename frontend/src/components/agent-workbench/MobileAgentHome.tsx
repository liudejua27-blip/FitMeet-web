export function MobileAgentHome() {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="text-sm font-bold text-slate-950">FitMeet Agent</div>
      <div className="flex rounded-full bg-slate-100 p-1 text-xs font-semibold text-slate-500">
        <span className="rounded-full bg-white px-3 py-1 text-slate-950 shadow-sm">首页</span>
        <span className="px-3 py-1">社交</span>
        <span className="px-3 py-1">我的</span>
      </div>
    </div>
  );
}
