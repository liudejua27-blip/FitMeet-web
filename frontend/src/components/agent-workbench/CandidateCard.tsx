import { useState } from 'react';
import type { SocialAgentChatCandidate } from '../../api/socialAgentApi';
import type { AgentConfirmAction } from './agentWorkbenchTypes';
import type { SocialAgentPermissionMode } from '../../api/socialAgentApi';

export function CandidateCard({
  candidate,
  mode,
  onAction,
}: {
  candidate: SocialAgentChatCandidate;
  mode: SocialAgentPermissionMode;
  onAction: (action: AgentConfirmAction) => void;
}) {
  const [opener, setOpener] = useState(
    candidate.suggestedOpener || candidate.suggestedMessage || '嗨，我看到你也喜欢运动。要不要先聊聊最近常去哪里训练？',
  );
  const score = Math.round(candidate.score ?? candidate.matchScore ?? 78);
  const tags = (candidate.commonTags?.length ? candidate.commonTags : candidate.interestTags ?? []).slice(0, 4);
  const name = candidate.displayName || candidate.nickname || `用户 ${candidate.userId}`;

  const confirm = (type: AgentConfirmAction['type'], title: string, content = opener) => {
    onAction({
      id: `${type}-${candidate.userId}-${Date.now()}`,
      type,
      title,
      target: name,
      content,
      riskNote: '该动作会触达对方或推进线下关系，FitMeet Agent 需要你确认后才会执行。',
      permissionMode: mode,
      candidate,
    });
  };

  return (
    <article className="animate-[fadeIn_220ms_ease-out] rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white"
          style={{ background: candidate.color || '#7dd3fc' }}
        >
          {candidate.avatar || name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-sm font-bold text-slate-950">{name}</h3>
            <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">
              {score}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {candidate.city || '附近'} {candidate.distanceKm != null ? `· ${candidate.distanceKm.toFixed(1)}km` : ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <ScoreItem label="时间匹配" value="较高" />
        <ScoreItem label="兴趣匹配" value="接近" />
        <ScoreItem label="目标匹配" value="同频" />
        <ScoreItem label="安全评分" value={candidate.risk?.level === 'high' ? '需谨慎' : '可继续'} />
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-500">为什么推荐</div>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          {candidate.reasons?.[0] ||
            candidate.candidateExplanation?.fitReasons?.[0] ||
            candidate.emotionalInsight?.fitReason ||
            '你们的时间、兴趣和当前目标比较接近，适合先轻量聊天。'}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        {candidate.risk?.warnings?.[0] ||
          candidate.emotionalInsight?.safeFirstStep ||
          '第一次建议选择公开场所，不要直接交换精确位置或联系方式。'}
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-slate-500">建议开场白</span>
        <textarea
          value={opener}
          rows={3}
          className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-cyan-300"
          onChange={(event) => setOpener(event.target.value)}
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          查看详情
        </button>
        <button className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          收藏
        </button>
        <button
          className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          onClick={() => confirm('friend_request', '发送好友申请')}
        >
          发送好友申请
        </button>
        <button
          className="rounded-2xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
          onClick={() => confirm('message', '使用这句开场白')}
        >
          使用开场白
        </button>
        <button
          className="col-span-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
          onClick={() => confirm('activity', '创建约练邀请', `邀请 ${name} 先在公开场所完成一次轻量约练。`)}
        >
          创建约练邀请
        </button>
      </div>
    </article>
  );
}

function ScoreItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <div className="text-slate-400">{label}</div>
      <div className="mt-1 font-semibold text-slate-800">{value}</div>
    </div>
  );
}
