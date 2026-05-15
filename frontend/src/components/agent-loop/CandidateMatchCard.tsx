import { useState } from 'react';
import type { CandidateView } from '../../api/socialRequestsApi';

const RISK_LABEL: Record<string, { text: string; tone: string }> = {
  low: { text: '低风险', tone: 'text-[#C8FF80] border-[#C8FF80]/40' },
  medium: { text: '注意', tone: 'text-amber-300 border-amber-400/40' },
  high: { text: '高风险', tone: 'text-red-300 border-red-500/40' },
};

const LEVEL_TONE: Record<string, string> = {
  high: 'from-[#C8FF80]/30 to-transparent',
  medium: 'from-sky-400/20 to-transparent',
  low: 'from-[#3a3a32]/30 to-transparent',
};

interface Props {
  candidate: CandidateView;
  onSendInvite?: (msg: string) => void | Promise<void>;
  onViewProfile?: () => void;
  onCreateActivity?: () => void | Promise<void>;
  onSkip?: () => void;
  busy?: boolean;
  hasConversation?: boolean;
}

export function CandidateMatchCard({
  candidate: c,
  onSendInvite,
  onViewProfile,
  onCreateActivity,
  onSkip,
  busy,
  hasConversation,
}: Props) {
  const [msg, setMsg] = useState(c.suggestedMessage);
  const [editing, setEditing] = useState(false);
  const risk = RISK_LABEL[c.risk.level] ?? RISK_LABEL.low;
  const scorePct = Math.max(0, Math.min(100, Math.round(c.score)));

  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-[#26261d] bg-[#15150f] p-5">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${
          LEVEL_TONE[c.level] ?? LEVEL_TONE.low
        } opacity-60`}
      />

      <div className="relative flex items-start gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-base font-medium text-[#0d0d0b]"
          style={{ background: c.color || '#C8FF80' }}
        >
          {c.avatar || c.nickname.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-light text-[#F4EFE6]">
              {c.nickname}
            </h3>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${risk.tone}`}>
              {risk.text}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-[#8C8A6E]">
            {c.distanceKm != null ? `${c.distanceKm.toFixed(1)} km` : '距离待确认'}
            {c.commonTags.length > 0 && ` · 共同 ${c.commonTags.length} 个标签`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-light leading-none text-[#C8FF80]">
            {scorePct}
            <span className="text-xs text-[#8C8A6E]"> /100</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[#8C8A6E]">
            匹配分
          </div>
        </div>
      </div>

      <div className="relative h-1 overflow-hidden rounded-full bg-[#26261d]">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#6B7A5A] to-[#C8FF80]"
          style={{ width: `${scorePct}%` }}
        />
      </div>

      {c.commonTags.length > 0 && (
        <div className="relative flex flex-wrap gap-1.5">
          {c.commonTags.slice(0, 8).map((t) => (
            <span
              key={t}
              className="rounded-full border border-[#C8FF80]/20 bg-[#1f1f17] px-2 py-0.5 text-[10px] text-[#C8FF80]/80"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {c.reasons.length > 0 && (
        <ul className="relative space-y-1 text-[11px] text-[#C7C2B0]">
          {c.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="flex gap-2 leading-5">
              <span className="text-[#6B7A5A]">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {c.risk.warnings.length > 0 && (
        <ul className="relative space-y-1 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300/80">
          {c.risk.warnings.slice(0, 3).map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}

      <div className="relative space-y-2 rounded-xl border border-[#26261d] bg-[#0d0d0b] p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-[#8C8A6E]">
            默认开场白
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-[10px] text-[#C8FF80]/80 hover:text-[#C8FF80]"
          >
            {editing ? '完成' : '修改'}
          </button>
        </div>
        {editing ? (
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-[#26261d] bg-[#15150f] px-2 py-1.5 text-xs text-[#F4EFE6]"
          />
        ) : (
          <p className="whitespace-pre-line text-xs leading-5 text-[#E8E2CF]">
            {msg}
          </p>
        )}
      </div>

      <div className="relative grid grid-cols-2 gap-2">
        {onViewProfile && (
          <button
            type="button"
            disabled={busy}
            onClick={onViewProfile}
            className="rounded-md border border-[#26261d] px-3 py-2 text-xs text-[#C7C2B0] hover:border-[#C8FF80]/40 hover:text-[#C8FF80] disabled:opacity-50"
          >
            查看资料
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onSendInvite?.(msg)}
          className="rounded-md bg-[#C8FF80] px-3 py-2 text-xs font-medium text-[#0d0d0b] hover:bg-[#b8ef70] disabled:opacity-50"
        >
          {hasConversation || c.status === 'messaged' ? '继续聊天' : '发送消息'}
        </button>
        {onCreateActivity && (
          <button
            type="button"
            disabled={busy}
            onClick={onCreateActivity}
            className="rounded-md border border-[#6B7A5A]/40 px-3 py-2 text-xs text-[#C8FF80] hover:border-[#C8FF80]/60 disabled:opacity-50"
          >
            发起邀约
          </button>
        )}
        {onSendInvite && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSendInvite?.(msg)}
            className="rounded-md border border-[#26261d] px-3 py-2 text-xs text-[#C7C2B0] hover:border-[#C8FF80]/40 hover:text-[#C8FF80] disabled:opacity-50"
          >
            申请联系
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="rounded-md border border-[#26261d] px-3 py-2 text-xs text-[#8C8A6E] hover:border-[#3a3a32] hover:text-[#C7C2B0] disabled:opacity-50"
        >
          暂不联系
        </button>
      </div>
    </article>
  );
}

export default CandidateMatchCard;
