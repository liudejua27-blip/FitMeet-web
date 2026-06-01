import { useMemo, useState } from 'react';
import type { CandidateView, SocialEmotionalInsight } from '../../api/socialRequestsApi';

const RISK_LABEL: Record<
  CandidateView['risk']['level'],
  { text: string; tone: string }
> = {
  low: { text: '低风险', tone: 'text-[#C8FF80] border-[#C8FF80]/40' },
  medium: { text: '需留意', tone: 'text-amber-300 border-amber-400/40' },
  high: { text: '高风险', tone: 'text-red-300 border-red-500/40' },
};

const LEVEL_TONE: Record<CandidateView['level'], string> = {
  high: 'from-[#C8FF80]/30 to-transparent',
  medium: 'from-sky-400/20 to-transparent',
  low: 'from-[#3a3a32]/30 to-transparent',
};

interface Props {
  candidate: CandidateView;
  onSendInvite?: (msg: string) => void | Promise<void>;
  onRequestContact?: (msg: string) => void | Promise<void>;
  onViewProfile?: () => void;
  onCreateActivity?: () => void | Promise<void>;
  onSkip?: () => void;
  busy?: boolean;
  hasConversation?: boolean;
}

export function CandidateMatchCard({
  candidate: c,
  onSendInvite,
  onRequestContact,
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
  const insight = useMemo(() => emotionalInsightFor(c), [c]);

  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-lg border border-[#26261d] bg-[#15150f] p-5">
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${
          LEVEL_TONE[c.level] ?? LEVEL_TONE.low
        } opacity-60`}
      />

      <div className="relative flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black text-[#0d0d0b]"
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
            {c.commonTags.length > 0 && ` · 共同信号 ${c.commonTags.length} 个`}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-light leading-none text-[#C8FF80]">
            {scorePct}
            <span className="text-xs text-[#8C8A6E]"> /100</span>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[#8C8A6E]">
            参考分
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
          {c.commonTags.slice(0, 8).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#C8FF80]/20 bg-[#1f1f17] px-2 py-0.5 text-[10px] text-[#C8FF80]/80"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <section className="relative grid gap-2">
        <InsightRow label="为什么适合" value={insight.fitReason} />
        <InsightRow label="怎么开场" value={insight.openerAdvice} />
        <InsightRow label="可能尴尬" value={insight.possibleAwkwardness} />
        <InsightRow label="安全第一步" value={insight.safeFirstStep} highlight />
      </section>

      {c.risk.warnings.length > 0 && (
        <ul className="relative space-y-1 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-300/80">
          {c.risk.warnings.slice(0, 3).map((warning) => (
            <li key={warning}>· {warning}</li>
          ))}
        </ul>
      )}

      <div className="relative space-y-2 rounded-lg border border-[#26261d] bg-[#0d0d0b] p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-[#8C8A6E]">
            高情商开场白
          </div>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="text-[10px] text-[#C8FF80]/80 hover:text-[#C8FF80]"
          >
            {editing ? '完成' : '微调'}
          </button>
        </div>
        {editing ? (
          <textarea
            value={msg}
            onChange={(event) => setMsg(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-[#26261d] bg-[#15150f] px-2 py-1.5 text-xs text-[#F4EFE6] outline-none focus:border-[#C8FF80]/50"
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
            发起活动
          </button>
        )}
        {onRequestContact && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRequestContact(msg)}
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

function InsightRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        highlight
          ? 'border-[#C8FF80]/25 bg-[#C8FF80]/10'
          : 'border-[#26261d] bg-[#0d0d0b]/75'
      }`}
    >
      <div className="text-[10px] font-black tracking-[0.16em] text-[#8C8A6E]">
        {label}
      </div>
      <p className="mt-1 text-xs leading-5 text-[#E8E2CF]">{value}</p>
    </div>
  );
}

function emotionalInsightFor(candidate: CandidateView): SocialEmotionalInsight {
  if (candidate.candidateExplanation) {
    return {
      fitReason: candidate.candidateExplanation.fitReasons[0] || 'TA 和这次需求有可对齐的地方。',
      openerAdvice: candidate.candidateExplanation.suggestedOpener,
      possibleAwkwardness:
        candidate.candidateExplanation.awkwardPoints[0] || '先确认边界和节奏，避免推进太快。',
      safeFirstStep: candidate.candidateExplanation.safeFirstStep,
      tone: candidate.candidateExplanation.requiresConfirmation ? 'careful' : 'gentle',
    };
  }
  if (candidate.emotionalInsight) return candidate.emotionalInsight;

  const tags = candidate.commonTags.slice(0, 2);
  const riskWarning = candidate.risk.warnings[0];
  return {
    fitReason: tags.length
      ? `TA 和你都有 ${tags.join('、')} 这些共同信号，适合从轻量话题开始，而不是只靠分数判断。`
      : candidate.reasons[0] || 'TA 和你的时间、地点或兴趣边界较匹配，可以低压力试着聊聊。',
    openerAdvice: tags.length
      ? `开场先提「${tags[0]}」，语气轻一点，给对方选择空间。`
      : '开场先问对方是否方便聊，再说明你的具体活动想法。',
    possibleAwkwardness: riskWarning
      ? `需要留意：${riskWarning} 建议先站内确认边界，不急着推进见面。`
      : '可能的小尴尬是双方期待不同，先说清楚活动强度、时长和边界会更自然。',
    safeFirstStep:
      '第一步先在站内聊清楚时间、公开地点和活动强度；线下选择人多、好离开的场所。',
    tone: riskWarning ? 'careful' : candidate.score >= 80 ? 'active' : 'gentle',
  };
}

export default CandidateMatchCard;
