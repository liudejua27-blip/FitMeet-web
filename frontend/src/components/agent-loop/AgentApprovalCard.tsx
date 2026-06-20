import type {
  ApprovalRequest,
  ApprovalRiskLevel,
} from '../../api/agentApprovalsApi';
import {
  agentApprovalActionLabel,
  agentApprovalEffectText,
} from '../../lib/agentApprovalCopy';

const RISK: Record<ApprovalRiskLevel, { label: string; tone: string }> = {
  low: { label: '低风险', tone: 'border-[#C8FF80]/40 text-[#C8FF80]' },
  medium: {
    label: '需要确认',
    tone: 'border-amber-400/50 text-amber-300',
  },
  high: { label: '高风险', tone: 'border-red-500/50 text-red-300' },
};

interface Props {
  request: ApprovalRequest;
  onApprove?: (id: number) => void | Promise<void>;
  onReject?: (id: number) => void | Promise<void>;
  busy?: boolean;
}

export function AgentApprovalCard({
  request: r,
  onApprove,
  onReject,
  busy,
}: Props) {
  const risk = RISK[r.riskLevel] ?? RISK.medium;
  const messageBody =
    typeof r.payload?.message === 'string'
      ? (r.payload.message as string)
      : typeof r.payload?.content === 'string'
        ? (r.payload.content as string)
        : null;
  const actionType = r.actionType || r.type;
  const targetName =
    typeof r.payload?._targetDisplayName === 'string'
      ? (r.payload._targetDisplayName as string)
      : null;
  const targetUserId =
    typeof r.payload?.toUserId === 'number'
      ? (r.payload.toUserId as number)
      : typeof r.payload?.targetUserId === 'number'
        ? (r.payload.targetUserId as number)
        : null;

  return (
    <article className="rounded-2xl bg-[#15150f] border border-[#26261d] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#8C8A6E]">
          Agent 想执行 · {agentApprovalActionLabel(actionType)}
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full border text-[11px] ${risk.tone}`}
        >
          {risk.label}
        </span>
      </div>

      <h3 className="text-sm text-[#F4EFE6] leading-snug">{r.summary}</h3>

      {r.rationale && (
        <p className="text-[11px] text-[#8C8A6E] leading-5">
          理由：{r.rationale}
        </p>
      )}

      {r.reason && (
        <p className="text-[11px] text-amber-200/90 leading-5">
          为什么需要审批：{r.reason}
        </p>
      )}

      <p className="text-[11px] text-[#8C8A6E] leading-5">
        审批后会发生：{agentApprovalEffectText(actionType)}
      </p>

      {(targetName || targetUserId || r.relatedCandidateId) && (
        <p className="text-[11px] text-[#8C8A6E] leading-5">
          目标用户：{targetName || '候选人'}
          {targetUserId ? ` · #${targetUserId}` : ''}
          {r.relatedCandidateId ? ` · 候选 #${r.relatedCandidateId}` : ''}
        </p>
      )}

      {messageBody && (
        <div className="rounded-xl bg-[#0d0d0b] border border-[#26261d] p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#8C8A6E] mb-1">
            具体内容
          </div>
          <p className="text-xs text-[#E8E2CF] leading-5 whitespace-pre-line">
            {messageBody}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => onApprove?.(r.id)}
          className="flex-1 px-3 py-2 rounded-md bg-[#C8FF80] text-[#0d0d0b] text-xs font-medium hover:bg-[#b8ef70] disabled:opacity-50"
        >
          同意
        </button>
        <button
          disabled={busy}
          onClick={() => onReject?.(r.id)}
          className="flex-1 px-3 py-2 rounded-md border border-[#26261d] text-[#C7C2B0] text-xs hover:border-red-500/40 hover:text-red-300"
        >
          拒绝
        </button>
      </div>

      {r.expiresAt && (
        <div className="text-[10px] text-[#5e5d4a]">
          {new Date(r.expiresAt).toLocaleString()} 后过期
        </div>
      )}
    </article>
  );
}

export default AgentApprovalCard;
