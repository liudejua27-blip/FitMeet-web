import type { IcebreakerTask } from '../../api/activitiesApi';

interface Props {
  tasks: IcebreakerTask[];
  safetyTips: string[];
  proofPolicy: 'mutual_confirm' | 'mutual_or_proof' | 'mutual_and_proof';
}

const POLICY_LABEL = {
  mutual_confirm: '双方互点「确认完成」即可',
  mutual_or_proof: '双方确认或上传一张证明',
  mutual_and_proof: '双方确认 + 上传证明',
} as const;

export function ActivityIcebreakerCard({ tasks, safetyTips, proofPolicy }: Props) {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-[#15150f] to-[#101009] border border-[#26261d] p-5 space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm tracking-[0.2em] uppercase text-[#8C8A6E]">
          破冰任务卡
        </h2>
        <span className="text-[10px] text-[#5e5d4a]">
          完成条件：{POLICY_LABEL[proofPolicy]}
        </span>
      </header>

      <ol className="space-y-2">
        {tasks.map((t, i) => (
          <li
            key={t.id}
            className="rounded-xl bg-[#0d0d0b] border border-[#26261d] px-3 py-2 text-sm text-[#E8E2CF] leading-6 flex gap-3"
          >
            <span className="text-[#C8FF80] font-medium">{i + 1}</span>
            <span className="flex-1">{t.text}</span>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="text-xs text-[#5e5d4a]">本次活动暂无破冰任务。</li>
        )}
      </ol>

      {safetyTips.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 mb-1.5">
            安全提醒
          </div>
          <ul className="space-y-1 text-[11px] text-[#E8E2CF] leading-5">
            {safetyTips.map((tip, i) => (
              <li key={i}>· {tip}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default ActivityIcebreakerCard;
