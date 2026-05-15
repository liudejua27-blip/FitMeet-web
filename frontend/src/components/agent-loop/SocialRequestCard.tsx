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
  matched: {
    text: '已找到候选人',
    tone: 'border-[#C8FF80]/50 text-[#C8FF80]',
  },
  invitation_pending: {
    text: '等待对方回复',
    tone: 'border-amber-400/40 text-amber-300',
  },
  chatting: { text: '聊天中', tone: 'border-sky-400/50 text-sky-300' },
  activity_created: {
    text: '活动已创建',
    tone: 'border-[#C8FF80]/60 text-[#C8FF80]',
  },
  completed: { text: '已完成', tone: 'border-[#C8FF80]/70 text-[#C8FF80]' },
  cancelled: { text: '已取消', tone: 'border-red-500/40 text-red-300' },
  expired: { text: '已过期', tone: 'border-[#3a3a32] text-[#5e5d4a]' },
};

const SOURCE_LABEL: Record<string, string> = {
  manual: '本人创建',
  openclaw: 'OpenClaw Agent',
  codex: 'Codex Agent',
  claude: 'Claude Agent',
  custom_agent: '自定义 Agent',
  public: '公开渠道',
};

function formatTime(iso: string | null): string {
  if (!iso) return '时间灵活';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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
      className="text-left w-full rounded-2xl bg-gradient-to-br from-[#15150f] to-[#101009] border border-[#26261d] hover:border-[#C8FF80]/40 transition p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#8C8A6E]">
          {TYPE_LABEL[request.type] ?? '社交需求'} · #{request.id}
        </span>
        <span
          className={`px-2.5 py-0.5 rounded-full border text-[11px] ${status.tone}`}
        >
          {status.text}
        </span>
      </div>

      <h3 className="text-base text-[#F4EFE6] font-light tracking-tight leading-snug">
        {request.title || TYPE_LABEL[request.type] || '社交任务'}
      </h3>

      {request.description && (
        <p className="text-xs text-[#C7C2B0] leading-5 line-clamp-2">
          {request.description}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-[11px] text-[#8C8A6E]">
        <div>
          <div className="text-[9px] uppercase tracking-wider">时间</div>
          <div className="text-[#F4EFE6]">{formatTime(request.timeStart)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider">城市</div>
          <div className="text-[#F4EFE6]">{request.city || '未限定'}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider">半径</div>
          <div className="text-[#F4EFE6]">{request.radiusKm} km</div>
        </div>
      </div>

      {request.interestTags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {request.interestTags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-full text-[10px] bg-[#1f1f17] text-[#C7C2B0] border border-[#26261d]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {showAgent && (
        <div className="pt-1 text-[10px] text-[#5e5d4a] flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-[#6B7A5A]" />
          来源 · {SOURCE_LABEL[request.source] ?? request.source}
          {request.agentName ? ` · ${request.agentName}` : ''}
        </div>
      )}
    </button>
  );
}

export default SocialRequestCard;
