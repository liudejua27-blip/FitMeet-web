import type { SocialRequestSummary } from '../../api/socialRequestsApi';

const TYPE_LABEL: Record<string, string> = {
  running_partner: '跑步搭子',
  fitness_partner: '健身搭子',
  dog_walking: '遛狗搭子',
  coffee_chat: '咖啡轻聊',
  city_walk: '城市散步',
  study_partner: '学习搭子',
  custom: '自定义',
};

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  draft: { text: '草稿', tone: 'border-[#3a3a32] text-[#8C8A6E]' },
  matching: { text: '正在匹配', tone: 'border-sky-400/40 text-sky-300' },
  matched: { text: '已找到候选人', tone: 'border-[#C8FF80]/50 text-[#C8FF80]' },
  invitation_pending: { text: '等待回复', tone: 'border-amber-400/40 text-amber-300' },
  chatting: { text: '聊天中', tone: 'border-sky-400/50 text-sky-300' },
  activity_created: { text: '活动已创建', tone: 'border-[#C8FF80]/60 text-[#C8FF80]' },
  completed: { text: '已完成', tone: 'border-[#C8FF80]/70 text-[#C8FF80]' },
  cancelled: { text: '已取消', tone: 'border-red-500/40 text-red-300' },
  expired: { text: '已过期', tone: 'border-[#3a3a32] text-[#5e5d4a]' },
};

const SOURCE_LABEL: Record<string, string> = {
  manual: '本人创建',
  openclaw: '受信任外部 Agent',
  codex: 'FitMeet Social Codex',
  claude: '受信任外部 Agent',
  custom_agent: '自定义 Agent',
  public: '公开渠道',
};

interface Props {
  request: SocialRequestSummary;
  onClick?: () => void;
  showAgent?: boolean;
}

export function SocialRequestCard({ request, onClick, showAgent = true }: Props) {
  const status = STATUS_LABEL[request.status] ?? STATUS_LABEL.draft;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-3 rounded-lg border border-[#26261d] bg-gradient-to-br from-[#15150f] to-[#101009] p-5 text-left transition hover:border-[#C8FF80]/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#8C8A6E]">
          {TYPE_LABEL[request.type] ?? '社交需求'} · #{request.id}
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${status.tone}`}>
          {status.text}
        </span>
      </div>

      <h3 className="text-base font-light leading-snug tracking-tight text-[#F4EFE6]">
        {request.title || TYPE_LABEL[request.type] || '社交卡片'}
      </h3>

      {request.description && (
        <p className="line-clamp-2 text-xs leading-5 text-[#C7C2B0]">
          {request.description}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-[11px] text-[#8C8A6E]">
        <Metric label="时间" value={formatTime(request.timeStart)} />
        <Metric label="城市" value={request.city || '不限'} />
        <Metric label="半径" value={`${request.radiusKm} km`} />
      </div>

      {request.interestTags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {request.interestTags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#26261d] bg-[#1f1f17] px-2 py-0.5 text-[10px] text-[#C7C2B0]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {showAgent && (
        <div className="flex items-center gap-1.5 pt-1 text-[10px] text-[#5e5d4a]">
          <span className="h-1 w-1 rounded-full bg-[#6B7A5A]" />
          来源 · {SOURCE_LABEL[request.source] ?? request.source}
          {request.agentName ? ` · ${request.agentName}` : ''}
        </div>
      )}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider">{label}</div>
      <div className="text-[#F4EFE6]">{value}</div>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '时间灵活';
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default SocialRequestCard;
