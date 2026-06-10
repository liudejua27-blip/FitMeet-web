import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../api/client';
import { activitiesApi, type ActivityType } from '../api/activitiesApi';
import {
  socialRequestsApi,
  type CandidateView,
  type SocialRequestSummary,
} from '../api/socialRequestsApi';
import { CandidateMatchCard } from '../components/agent-loop/CandidateMatchCard';
import { SocialRequestCard } from '../components/agent-loop/SocialRequestCard';

const TYPE_TO_ACTIVITY: Record<string, ActivityType> = {
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
      .then((result) => {
        if (!cancelled) setAutopilotMode(result?.mode ?? null);
      })
      .catch(() => {
        if (!cancelled) setAutopilotMode(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const autopilotActive =
    autopilotMode !== null && ['normal', 'standard', 'open'].includes(autopilotMode);

  const autopilotHintShort = autopilotActive
    ? '潜意识循环会继续帮你寻找候选人，有合适人选会进入待确认。'
    : '当前由你手动控制。你可以继续完善 AI 画像，或在 Agent 托管中开启自动模式。';

  const autopilotHintEmpty = autopilotActive
    ? '建议补充 AI 画像，放宽城市、距离或时间条件。潜意识循环也会稍后继续寻找。'
    : '建议补充 AI 画像，放宽城市、距离或时间条件；也可以在 Agent 托管里开启自动模式。';

  const load = useCallback(async () => {
    if (!Number.isFinite(reqId)) return;

    try {
      const [request, candidateResult] = await Promise.all([
        socialRequestsApi.get(reqId),
        socialRequestsApi.candidates(reqId),
      ]);
      setSummary(request);
      setCandidates(candidateResult.candidates);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载社交卡片失败');
    }
  }, [reqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rerunMatch = useCallback(async () => {
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const result = await socialRequestsApi.runMatch(reqId, 5);
      setCandidates(result.candidates);
      setInfo('已重新计算候选人');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重新匹配失败');
    } finally {
      setBusy(false);
    }
  }, [reqId]);

  const sendInvite = useCallback(
    async (candidate: CandidateView, message: string) => {
      setBusy(true);
      setError(null);
      setInfo(null);

      try {
        const conversation = await api.startConversation(candidate.userId);
        await api.sendMessage(conversation.conversationId, message);

        if (candidate.candidateRecordId) {
          try {
            await socialRequestsApi.markCandidateMessaged(reqId, candidate.candidateRecordId);
            setCandidates((current) =>
              current.map((item) =>
                item.candidateRecordId === candidate.candidateRecordId
                  ? { ...item, status: 'messaged' }
                  : item,
              ),
            );
          } catch {
            // Candidate status sync is best effort; the message already went out.
          }
        }

        try {
          const updated = await socialRequestsApi.update(reqId, {
            status: 'chatting',
          });
          setSummary(updated);
        } catch {
          // Request status sync is best effort; chat is the important action.
        }

        navigate(`/messages?conversationId=${encodeURIComponent(conversation.conversationId)}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '发送消息失败');
      } finally {
        setBusy(false);
      }
    },
    [reqId, navigate],
  );

  const createActivity = useCallback(
    async (candidate: CandidateView) => {
      if (!summary) return;

      setBusy(true);
      setError(null);
      setInfo(null);

      try {
        const activity = await activitiesApi.create({
          type: TYPE_TO_ACTIVITY[summary.type] ?? 'custom',
          title: `和 ${candidate.nickname} 的${summary.title || '约练活动'}`,
          description: summary.description,
          city: summary.city,
          startTime: summary.timeStart ?? undefined,
          socialRequestId: summary.id,
          matchedCandidateId: candidate.candidateRecordId,
          invitedUserId: candidate.userId,
        });

        try {
          const updated = await socialRequestsApi.update(summary.id, {
            status: 'activity_created',
          });
          setSummary(updated);
        } catch {
          // Activity creation succeeded; request status can be repaired later.
        }

        navigate(`/activity/${activity.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '创建约练活动失败');
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
    return <div className="min-h-screen bg-[#0d0d0b] p-8 text-[#F4EFE6]">无效的社交卡片 ID</div>;
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#F4EFE6]">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-xs text-[#8C8A6E] hover:text-[#C8FF80]"
          >
            返回
          </button>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#8C8A6E]">
            STEP 2 / 7 · 候选人匹配
          </div>
        </div>

        {summary ? (
          <div className="space-y-3">
            {searchParams.get('published') === '1' && (
              <div className="space-y-1 rounded-md border border-[#C8FF80]/30 bg-[#C8FF80]/10 px-3 py-2 text-xs text-[#C8FF80]">
                <div>
                  发布成功
                  {searchParams.get('synced') === '1' ? ' · 已同步到发现' : ' · 发现同步处理中'}
                  {searchParams.get('matched') !== null &&
                    ` · 已开始匹配，候选人 ${searchParams.get('matched') ?? 0} 位`}
                </div>
                <div className="text-[11px] text-[#C7C2B0]">{autopilotHintShort}</div>
              </div>
            )}

            <SocialRequestCard request={summary} />

            <div className="flex items-center justify-between rounded-lg border border-[#26261d] bg-[#15150f] px-4 py-3 text-xs text-[#C7C2B0]">
              <span>这张卡片已进入发现和匹配池</span>
              <Link to="/discover" className="text-[#C8FF80] hover:text-[#b8ef70]">
                查看发现展示
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#8C8A6E]">正在加载社交卡片...</div>
        )}

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm uppercase tracking-[0.2em] text-[#8C8A6E]">
            FitMeet 为你匹配到 {sortedCandidates.length} 位候选人
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={rerunMatch}
            className="rounded-md border border-[#26261d] px-3 py-1.5 text-xs text-[#C7C2B0] hover:border-[#C8FF80]/40 hover:text-[#C8FF80] disabled:opacity-50"
          >
            重新匹配
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-[#C8FF80]/30 bg-[#C8FF80]/10 px-3 py-2 text-xs text-[#C8FF80]">
            {info}
          </div>
        )}

        {sortedCandidates.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-[#26261d] bg-[#15150f] p-8 text-center text-sm text-[#8C8A6E]">
            <div className="text-[#E7DFC9]">当前候选人不足</div>
            <div className="text-xs leading-6">{autopilotHintEmpty}</div>
            <button
              type="button"
              onClick={rerunMatch}
              disabled={busy}
              className="rounded-md border border-[#C8FF80]/40 px-3 py-1.5 text-xs text-[#C8FF80] disabled:opacity-50"
            >
              立即重新匹配
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sortedCandidates.map((candidate) => (
              <CandidateMatchCard
                key={candidate.userId}
                candidate={candidate}
                busy={busy}
                hasConversation={candidate.status === 'messaged'}
                onSendInvite={(message) => sendInvite(candidate, message)}
                onViewProfile={() => navigate(`/user/${candidate.userId}`)}
                onCreateActivity={() => createActivity(candidate)}
                onSkip={() =>
                  setCandidates((current) =>
                    current.filter((item) => item.userId !== candidate.userId),
                  )
                }
              />
            ))}
          </div>
        )}

        <div className="space-x-3 pt-4 text-center text-[11px] text-[#5e5d4a]">
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
