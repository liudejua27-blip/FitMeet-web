import { memo, useState, useCallback } from 'react';
import type { MeetRecord } from '../../types';
import { useNotificationStore } from '../../stores';

interface ProfileMeetsProps {
  records: MeetRecord[];
}

const STATUS_MAP: Record<MeetRecord['status'], { label: string; color: string }> = {
  pending: { label: '待确认', color: 'text-yellow-400 bg-yellow-400/10' },
  active: { label: '进行中', color: 'text-blue-400 bg-blue-400/10' },
  completed: { label: '已完成', color: 'text-green-400 bg-green-400/10' },
  cancelled: { label: '已取消', color: 'text-red-400 bg-red-400/10' },
};

type FilterStatus = 'all' | MeetRecord['status'];

export const ProfileMeets = memo(function ProfileMeets({ records: initialRecords }: ProfileMeetsProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [records, setRecords] = useState(initialRecords);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [successMsg, setSuccessMsg] = useState('');
  const { addNotification } = useNotificationStore();

  const showToast = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }, []);

  const handleConfirm = useCallback((id: number) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'active' as const } : r));
    const record = records.find(r => r.id === id);
    addNotification({
      type: 'meet',
      username: record?.partner || '约练',
      avatar: (record?.partner || '约')[0],
      color: '#FF6A00',
      text: `你已确认约练「${record?.sport}」`,
      time: '刚刚',
    });
    showToast(`已确认「${record?.sport}」约练！`);
  }, [records, addNotification, showToast]);

  const handleCancel = useCallback((id: number) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r));
    const record = records.find(r => r.id === id);
    addNotification({
      type: 'system',
      username: '系统',
      avatar: 'S',
      color: '#38BDF8',
      text: `你已取消约练「${record?.sport}」`,
      time: '刚刚',
    });
    showToast(`已取消「${record?.sport}」约练`);
  }, [records, addNotification, showToast]);

  const handleSubmitReview = useCallback(() => {
    if (!reviewText.trim() || !reviewingId) return;
    const record = records.find(r => r.id === reviewingId);
    addNotification({
      type: 'comment',
      username: record?.partner || '约练伙伴',
      avatar: (record?.partner || '约')[0],
      color: '#22C55E',
      text: `你给「${record?.sport}」的 ${record?.partner} 写了 ${reviewRating} 星评价`,
      time: '刚刚',
    });
    setReviewingId(null);
    setReviewText('');
    setReviewRating(5);
    showToast('评价已提交！');
  }, [reviewingId, reviewText, reviewRating, records, addNotification, showToast]);

  const filtered = filter === 'all' ? records : records.filter((r) => r.status === filter);

  const tabs: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待确认' },
    { key: 'active', label: '进行中' },
    { key: 'completed', label: '已完成' },
    { key: 'cancelled', label: '已取消' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition ${
              filter === tab.key
                ? 'bg-lime text-white'
                : 'bg-surface border border-border text-textMuted hover:border-borderStrong'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Records */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-textMuted">
          <span className="text-4xl block mb-2">🏃</span>
          暂无约练记录
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => (
            <MeetRecordCard
              key={record.id}
              record={record}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onReview={(id) => setReviewingId(id)}
            />
          ))}
        </div>
      )}

      {/* Review Modal */}
      {reviewingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setReviewingId(null)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-display font-bold text-white">
              写评价 — {records.find(r => r.id === reviewingId)?.sport}
            </h3>
            <div>
              <label className="text-xs text-textMuted mb-2 block">评分</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    className="text-2xl cursor-pointer transition hover:scale-110"
                    onClick={() => setReviewRating(star)}
                  >
                    {star <= reviewRating ? '⭐' : '☆'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">评价内容</label>
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                rows={3}
                placeholder="说说你的训练体验..."
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                className="flex-1 py-2 rounded-lg border border-border text-textMuted text-sm hover:text-white transition cursor-pointer"
                onClick={() => setReviewingId(null)}
              >
                取消
              </button>
              <button
                className="flex-1 cursor-pointer rounded-lg bg-lime py-2 text-sm font-bold text-white transition hover:bg-brand2 disabled:opacity-50"
                onClick={handleSubmitReview}
                disabled={!reviewText.trim()}
              >
                提交评价
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed left-1/2 top-20 z-[100] -translate-x-1/2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-white shadow-glow">
          ✅ {successMsg}
        </div>
      )}
    </div>
  );
});

const MeetRecordCard = memo(function MeetRecordCard({
  record,
  onConfirm,
  onCancel,
  onReview,
}: {
  record: MeetRecord;
  onConfirm: (id: number) => void;
  onCancel: (id: number) => void;
  onReview: (id: number) => void;
}) {
  const status = STATUS_MAP[record.status];

  return (
    <div className="p-4 bg-surface border border-border rounded-xl hover:border-borderStrong transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="font-semibold text-sm">{record.sport}</div>
          <div className="text-xs text-textMuted mt-1 flex items-center gap-2">
            <span>📅 {record.time}</span>
          </div>
        </div>
        <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-textMuted">
        <span>📍 {record.loc}</span>
        {record.partner && (
          <>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-5 w-5 rounded-md bg-surfaceMuted text-center text-[10px] leading-5">
                👤
              </span>
              {record.partner}
            </span>
          </>
        )}
      </div>

      {record.status === 'completed' && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-textMuted">训练完成</span>
          <button
            className="text-xs text-lime font-bold hover:underline cursor-pointer"
            onClick={() => onReview(record.id)}
          >
            写评价
          </button>
        </div>
      )}

      {record.status === 'pending' && (
        <div className="mt-3 pt-3 border-t border-border flex gap-2">
          <button
            className="flex-1 cursor-pointer rounded-lg bg-lime py-2 text-xs font-bold text-white transition hover:bg-brand2"
            onClick={() => onConfirm(record.id)}
          >
            确认
          </button>
          <button
            className="flex-1 py-2 rounded-lg border border-border text-textMuted text-xs font-bold hover:border-borderStrong transition cursor-pointer"
            onClick={() => onCancel(record.id)}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
});
