import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../api/client';
import {
  socialRequestsApi,
  type CandidateView,
  type SocialRequestSummary,
} from '../api/socialRequestsApi';
import { activitiesApi } from '../api/activitiesApi';
import { SocialRequestCard } from '../components/agent-loop/SocialRequestCard';
import { CandidateMatchCard } from '../components/agent-loop/CandidateMatchCard';

const TYPE_TO_ACTIVITY: Record<string, string> = {
  running_partner: 'running',
  fitness_partner: 'fitness',
  dog_walking: 'dog_walking',
  coffee_chat: 'coffee_chat',
  city_walk: 'city_walk',
  study_partner: 'coffee_chat',
  custom: 'custom',
};

export function SocialRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const reqId = Number(id);
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SocialRequestSummary | null>(null);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [autopilotMode, setAutopilotMode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .request<{ mode?: string }>('/agent/permissions')
      .then((r) => {
        if (!cancelled) setAutopilotMode(r?.mode ?? null);
      })
      .catch(() => {
        if (!cancelled) setAutopilotMode(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const autopilotActive =
    autopilotMode !== null &&
    ['normal', 'standard', 'open'].includes(autopilotMode);
  const autopilotHintShort = autopilotActive
    ? 'AI 将持续帮你寻找候选人。'
    : '已停在你的控制下，可手动触发匹配或继续完善画像后再放权给 AI。';
  const autopilotHintEmpty = autopilotActive
    ? '建议补充画像、放宽城市/距离/时间条件；AI 自动驾驶也会稍后继续寻找。'
    : '建议补充画像、放宽城市/距离/时间条件；或在「Agent Gateway」开启自动模式，让 AI 持续帮你寻找。';

  const load = useCallback(async () => {
    if (!Number.isFinite(reqId)) return;
    try {
      const [s, c] = await Promise.all([
        socialRequestsApi.get(reqId),
        socialRequestsApi.candidates(reqId),
      ]);
      setSummary(s);
      setCandidates(c.candidates);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, [reqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rerunMatch = useCallback(async () => {
    setBusy(true);
    try {
      const r = await socialRequestsApi.runMatch(reqId, 5);
      setCandidates(r.candidates);
      setInfo('已为你重新计算候选人');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '匹配失败');
    } finally {
      setBusy(false);
    }
  }, [reqId]);

  const sendInvite = useCallback(
    async (cand: CandidateView, message: string) => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const conv = await api.startConversation(cand.userId);
        await api.sendMessage(conv.conversationId, message);
        if (cand.candidateRecordId) {
          try {
            await socialRequestsApi.markCandidateMessaged(
              reqId,
              cand.candidateRecordId,
            );
            setCandidates((prev) =>
              prev.map((c) =>
                c.candidateRecordId === cand.candidateRecordId
                  ? { ...c, status: 'messaged' }
                  : c,
              ),
            );
          } catch {
            // best-effort
          }
        }
        try {
          const updated = await socialRequestsApi.update(reqId, {
            status: 'chatting',
          });
          setSummary(updated);
        } catch {
          // status update is best-effort
        }
        navigate(`/messages?conversationId=${encodeURIComponent(conv.conversationId)}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '发送失败');
      } finally {
        setBusy(false);
      }
    },
    [reqId, navigate],
  );

  const createActivity = useCallback(
    async (cand: CandidateView) => {
      if (!summary) return;
      setBusy(true);
      setError(null);
      try {
        const activity = await activitiesApi.create({
          type:
            (TYPE_TO_ACTIVITY[summary.type] as
              | 'running'
              | 'fitness'
              | 'dog_walking'
              | 'coffee_chat'
              | 'city_walk'
              | 'custom') ?? 'custom',
          title: summary.title || `与 ${cand.nickname} 的活动`,
          description: summary.description,
          city: summary.city,
          startTime: summary.timeStart ?? undefined,
          socialRequestId: summary.id,
          matchedCandidateId: cand.candidateRecordId,
          invitedUserId: cand.userId,
        });
        try {
          const updated = await socialRequestsApi.update(summary.id, {
            status: 'activity_created',
          });
          setSummary(updated);
        } catch {
          // status update is best-effort
        }
        navigate(`/activity/${activity.id}`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '创建活动失败');
      } finally {
        setBusy(false);
      }
    },
    [summary, navigate],
  );

  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => b.score - a.score),
    [candidates],
  );

  if (!Number.isFinite(reqId)) {
    return (
      <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6] p-8">
        无效的社交任务 ID
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-[#8C8A6E] hover:text-[#C8FF80]"
          >
            ← 返回
          </button>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
            STEP 2 / 7 · 候选人匹配
          </div>
        </div>

        {summary ? (
          <div className="space-y-3">
            {searchParams.get('published') === '1' && (
              <div className="text-xs text-[#C8FF80] bg-[#C8FF80]/10 border border-[#C8FF80]/30 rounded-md px-3 py-2 space-y-1">
                <div>
                  发布成功
                  {searchParams.get('synced') === '1'
                    ? ' · 已同步到大厅'
                    : ' · 同步大厅中…'}
                  {searchParams.get('matched') !== null &&
                    ` · 已开始匹配（候选 ${searchParams.get('matched') ?? 0} 位）`}
                </div>
                <div className="text-[11px] text-[#C7C2B0]">
                  {autopilotHintShort}
                </div>
              </div>
            )}
            <SocialRequestCard request={summary} />
            <div className="flex items-center justify-between rounded-xl border border-[#26261d] bg-[#15150f] px-4 py-3 text-xs text-[#C7C2B0]">
              <span>已同步到大厅</span>
              <Link to="/hall" className="text-[#C8FF80] hover:text-[#b8ef70]">
                查看大厅展示 →
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#8C8A6E]">加载任务卡...</div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-[0.2em] uppercase text-[#8C8A6E]">
            FitMeet 为你匹配到 {sortedCandidates.length} 位候选人
          </h2>
          <button
            disabled={busy}
            onClick={rerunMatch}
            className="text-xs px-3 py-1.5 rounded-md border border-[#26261d] text-[#C7C2B0] hover:border-[#C8FF80]/40 hover:text-[#C8FF80]"
          >
            重新匹配
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        {info && (
          <div className="text-xs text-[#C8FF80] bg-[#C8FF80]/10 border border-[#C8FF80]/30 rounded-md px-3 py-2">
            {info}
          </div>
        )}

        {sortedCandidates.length === 0 ? (
          <div className="rounded-2xl border border-[#26261d] bg-[#15150f] p-8 text-center text-sm text-[#8C8A6E] space-y-3">
            <div className="text-[#E7DFC9]">当前候选人不足。</div>
            <div className="text-xs leading-6">{autopilotHintEmpty}</div>
            <button
              onClick={rerunMatch}
              className="text-xs px-3 py-1.5 rounded-md border border-[#C8FF80]/40 text-[#C8FF80]"
            >
              立即重新匹配
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sortedCandidates.map((c) => (
              <div key={c.userId} className="space-y-2">
                <CandidateMatchCard
                  candidate={c}
                  busy={busy}
                  hasConversation={c.status === 'messaged'}
                  onSendInvite={(msg) => sendInvite(c, msg)}
                  onViewProfile={() => navigate(`/user/${c.userId}`)}
                  onCreateActivity={() => createActivity(c)}
                  onSkip={() =>
                    setCandidates((arr) =>
                      arr.filter((x) => x.userId !== c.userId),
                    )
                  }
                />
              </div>
            ))}
          </div>
        )}

        <div className="text-center text-[11px] text-[#5e5d4a] pt-4 space-x-3">
          <Link to="/messages" className="hover:text-[#C8FF80]">
            站内消息
          </Link>
          <span>·</span>
          <Link to="/agent/approvals" className="hover:text-[#C8FF80]">
            Agent 待确认
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SocialRequestDetailPage;
