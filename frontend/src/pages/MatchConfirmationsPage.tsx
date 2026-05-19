import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  agentInboxApi,
  type MatchRequestItem,
  type ProfileRecommendationItem,
} from '../api/agentInboxApi';

type LoadingState = 'idle' | 'loading' | 'error';

export const MatchConfirmationsPage = memo(function MatchConfirmationsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<MatchRequestItem[]>([]);
  const [recommendations, setRecommendations] = useState<ProfileRecommendationItem[]>([]);
  const [state, setState] = useState<LoadingState>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [requestResult, recommendationResult] = await Promise.all([
        agentInboxApi.matchRequests(),
        agentInboxApi.profileMatches(30),
      ]);
      setRequests(requestResult.requests ?? []);
      setRecommendations(recommendationResult.recommendations ?? []);
      setState('idle');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    document.title = '好友申请 / AI 推荐确认 - FitMeet';
    void load();
  }, [load]);

  const runAiMatch = async () => {
    setBusyId('run-match');
    try {
      await agentInboxApi.runProfileMatchesOnce();
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const respondRequest = async (id: number, decision: 'accept' | 'reject') => {
    setBusyId(`request-${id}-${decision}`);
    try {
      if (decision === 'accept') {
        const result = await agentInboxApi.acceptMatchRequest(id);
        if (result.conversationId) {
          navigate('/messages');
          return;
        }
      } else {
        await agentInboxApi.rejectMatchRequest(id);
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const confirmRecommendation = async (id: number) => {
    setBusyId(`recommendation-${id}`);
    try {
      await agentInboxApi.confirmProfileMatchContact(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const ignoreRecommendation = async (id: number) => {
    setBusyId(`ignore-${id}`);
    try {
      await agentInboxApi.ignoreProfileMatch(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const pendingRequests = requests.filter((item) => item.status === 'pending');
  const activeRecommendations = recommendations.filter((item) =>
    ['review', 'draft', 'pending'].includes(item.status),
  );

  return (
    <div className="min-h-screen bg-[#0b0c0d] px-4 py-10 text-[#f6efe5] sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black tracking-[0.2em] text-[#9be15d]">
              CONFIRMATION CENTER
            </div>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">
              好友申请 / AI 推荐确认
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#b9aa9a]">
              所有加好友、私信开场和 AI 撮合都需要在这里确认。DeepSeek 可以给出理由和二次评分，但不会绕过双方同意。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-[#6f8a3b] px-5 py-3 text-sm font-black text-white transition hover:bg-[#7fa447] disabled:opacity-60"
              disabled={busyId === 'run-match'}
              onClick={runAiMatch}
            >
              {busyId === 'run-match' ? '正在匹配' : '运行画像匹配'}
            </button>
            <Link className="rounded-lg border border-white/15 px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#22d3ee]/50 hover:text-[#8be9ff]" to="/agent-inbox">
              Agent Inbox
            </Link>
          </div>
        </header>

        {state === 'error' && (
          <div className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
            加载失败，请确认已登录并稍后重试。
          </div>
        )}

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Panel title="好友申请" count={pendingRequests.length}>
            {pendingRequests.length === 0 ? (
              <Empty text={state === 'loading' ? '正在读取好友申请' : '暂无待处理好友申请'} />
            ) : (
              pendingRequests.map((item) => (
                <article key={item.id} className="rounded-lg border border-white/10 bg-[#151719] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-black text-[#ffb36e]">
                        {item.direction === 'incoming' ? '收到申请' : '已发出申请'}
                      </div>
                      <h3 className="mt-2 text-xl font-black text-white">{item.displayName}</h3>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#d7cabd]">{item.message || '对方想先在 FitMeet 里建立联系。'}</p>
                  <p className="mt-3 text-xs font-bold text-[#8f8174]">{formatTime(item.createdAt)}</p>
                  {item.direction === 'incoming' && (
                    <div className="mt-5 flex gap-3">
                      <button
                        className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                        disabled={Boolean(busyId)}
                        onClick={() => respondRequest(item.id, 'accept')}
                      >
                        同意并开始聊天
                      </button>
                      <button
                        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-black text-[#c9b9a7] disabled:opacity-60"
                        disabled={Boolean(busyId)}
                        onClick={() => respondRequest(item.id, 'reject')}
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </Panel>

          <Panel title="AI 推荐确认" count={activeRecommendations.length}>
            {activeRecommendations.length === 0 ? (
              <Empty text={state === 'loading' ? '正在读取 AI 推荐' : '暂无待确认推荐，可点击运行画像匹配'} />
            ) : (
              activeRecommendations.map((item) => (
                <article key={item.aiMatchSessionId} className="rounded-lg border border-white/10 bg-[#151719] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-black text-white" style={{ background: item.safeProfile.color || '#64748b' }}>
                        {item.safeProfile.avatar || item.safeProfile.name[0] || 'U'}
                      </span>
                      <div>
                        <h3 className="text-xl font-black text-white">{item.safeProfile.name}</h3>
                        <p className="text-xs font-bold text-[#a99b8d]">{item.safeProfile.city || '城市待完善'}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-[#9be15d]/30 bg-[#9be15d]/10 px-3 py-2 text-sm font-black text-[#cfff8a]">
                      AI {Math.round(item.score)}%
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#d7cabd]">
                    {item.publicReasons[0] || item.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.safeProfile.publicTags.slice(0, 6).map((tag) => (
                      <span key={tag} className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-[#dffcf3]">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  {item.riskTips.length > 0 && (
                    <p className="mt-4 rounded-lg border border-yellow-400/20 bg-yellow-400/8 px-3 py-2 text-xs font-bold leading-6 text-yellow-100">
                      {item.riskTips[0]}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      disabled={Boolean(busyId)}
                      onClick={() => confirmRecommendation(item.aiMatchSessionId)}
                    >
                      申请加好友
                    </button>
                    <button
                      className="rounded-lg border border-white/15 px-4 py-2 text-sm font-black text-[#c9b9a7] disabled:opacity-60"
                      disabled={Boolean(busyId)}
                      onClick={() => ignoreRecommendation(item.aiMatchSessionId)}
                    >
                      忽略
                    </button>
                  </div>
                </article>
              ))
            )}
          </Panel>
        </section>
      </main>
    </div>
  );
});

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-black text-[#c9b9a7]">
          {count} 待处理
        </span>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-5 py-12 text-center text-sm font-bold text-[#a99b8d]">
      {text}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status === 'pending' ? '待确认' : status === 'accepted' ? '已同意' : status === 'rejected' ? '已拒绝' : status;
  return (
    <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-black text-[#f6efe5]">
      {label}
    </span>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}
