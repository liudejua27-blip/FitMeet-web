import { lazy, Suspense } from 'react';

import { useAgentWorkspaceController } from './useAgentWorkspaceController';
import type { AgentView } from './useAgentWorkspaceRoute';

const FitMeetAssistantUI = lazy(() =>
  import('./FitMeetAssistantUI').then((module) => ({ default: module.FitMeetAssistantUI })),
);

export function AgentWorkspace({ view }: { view: AgentView }) {
  const { assistantProps } = useAgentWorkspaceController(view);

  return (
    <Suspense fallback={<AgentWorkspaceShellFallback />}>
      <FitMeetAssistantUI {...assistantProps} />
    </Suspense>
  );
}

function AgentWorkspaceShellFallback() {
  return (
    <div
      className="flex h-[100svh] min-h-[100svh] bg-white text-[#0d0d0d]"
      data-testid="assistant-ui-shell-loading"
    >
      <aside className="hidden w-64 shrink-0 border-r border-black/[0.06] bg-[#f9f9f9] p-3 lg:block">
        <div className="h-9 w-36 rounded-xl bg-black/[0.06]" />
        <div className="mt-8 h-8 w-28 rounded-xl bg-black/[0.05]" />
        <div className="mt-6 space-y-2">
          <div className="h-10 rounded-xl bg-black/[0.04]" />
          <div className="h-10 rounded-xl bg-black/[0.035]" />
          <div className="h-10 rounded-xl bg-black/[0.03]" />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-end px-3 pb-3">
          <div className="mb-auto flex flex-1 items-center justify-center text-sm text-[#8a8f98]">
            正在进入 FitMeet Agent
          </div>
          <div className="rounded-[28px] border border-[#e5e5e5] bg-white px-4 py-3 text-sm text-[#8a8f98] shadow-[0_1px_2px_rgba(0,0,0,0.035)]">
            正在准备对话...
          </div>
        </div>
      </main>
    </div>
  );
}
