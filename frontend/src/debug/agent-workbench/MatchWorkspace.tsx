import type {
  SocialAgentChatCandidate,
  SocialAgentPermissionMode,
} from '../../api/socialAgentDebugApi';
import type { AgentConfirmAction } from './agentWorkbenchTypes';
import { CandidateCard } from './CandidateCard';
import { LifeGraphSummaryCard } from './LifeGraphSummaryCard';

export function MatchWorkspace({
  candidates,
  mode,
  pendingCount,
  onAction,
}: {
  candidates: SocialAgentChatCandidate[];
  mode: SocialAgentPermissionMode;
  pendingCount: number;
  onAction: (action: AgentConfirmAction) => void;
}) {
  return (
    <aside className="hidden h-[calc(100vh-72px)] w-[420px] shrink-0 overflow-y-auto border-l border-slate-200/80 bg-slate-50/80 px-4 py-5 backdrop-blur-xl xl:block">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950">Match Workspace</h2>
          <p className="mt-1 text-xs text-slate-500">社交结果、风险提示和待确认动作。</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
          {candidates.length ? `${candidates.length} 位候选` : '待生成'}
        </span>
      </div>

      <div className="space-y-4">
        {candidates.length === 0 ? (
          <>
            <LifeGraphSummaryCard mode={mode} pendingCount={pendingCount} />
            <div className="rounded-[28px] border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-950">Agent 不会自动越界</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                发送私信、好友申请、线下邀约、联系方式、隐私设置和自动回复都会先让你确认。
              </p>
            </div>
          </>
        ) : (
          candidates.map((candidate) => (
            <CandidateCard
              key={`${candidate.userId}-${candidate.candidateRecordId ?? candidate.socialRequestId ?? candidate.nickname}`}
              candidate={candidate}
              mode={mode}
              onAction={onAction}
            />
          ))
        )}
      </div>
    </aside>
  );
}

export function MobileMatchResults({
  candidates,
  mode,
  onAction,
}: {
  candidates: SocialAgentChatCandidate[];
  mode: SocialAgentPermissionMode;
  onAction: (action: AgentConfirmAction) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div className="mt-5 xl:hidden">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-slate-950">推荐候选</h2>
        <span className="text-xs text-slate-400">横向滑动查看</span>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {candidates.map((candidate) => (
          <div
            key={`${candidate.userId}-${candidate.candidateRecordId ?? candidate.socialRequestId ?? candidate.nickname}`}
            className="w-[320px] shrink-0 snap-start"
          >
            <CandidateCard candidate={candidate} mode={mode} onAction={onAction} />
          </div>
        ))}
      </div>
    </div>
  );
}
