import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { socialAgentApi } from '../api/socialAgentApi';
import * as dataService from '../services/dataService';
import { useAuthStore } from '../stores';
import type { PublicSocialCandidate, PublicSocialIntent } from '../types';

export function PublicIntentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuthStore();
  const [intent, setIntent] = useState<PublicSocialIntent | null>(null);
  const [candidates, setCandidates] = useState<PublicSocialCandidate[]>([]);
  const [errorState, setErrorState] = useState<{
    id: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) return undefined;
    Promise.all([
      dataService.getPublicSocialIntent(id),
      dataService.getPublicSocialIntentMatches(id).catch(() => null),
    ])
      .then(([nextIntent, matchResult]) => {
        if (cancelled) return;
        setIntent(nextIntent);
        setCandidates(matchResult?.candidates ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorState({
            id,
            message: '公开需求加载失败，请稍后重试。',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const error = errorState && errorState.id === id ? errorState.message : '';
  const loading = Boolean(id) && !error && intent?.id !== id;

  const publicTags = useMemo(() => intent?.interestTags?.slice(0, 6) ?? [], [intent]);

  const publicInterestTags = useMemo(
    () =>
      [intent?.requestType, ...(intent?.interestTags ?? [])].filter((item): item is string =>
        Boolean(item),
      ),
    [intent?.interestTags, intent?.requestType],
  );
  const publicIntentId = intent?.id ?? null;
  const publicIntentOwnerUserId = intent?.userId ?? null;
  const publicIntentSocialRequestId = intent?.linkedSocialRequestId ?? null;
  const publicIntentCity = intent?.city || null;
  const publicIntentLocation = intent?.locationPreference || intent?.loc || null;
  const publicIntentTime = intent?.timePreference || null;

  useEffect(() => {
    if (!isLoggedIn || !publicIntentId) return;
    const day = new Date().toISOString().slice(0, 10);
    const metadata = {
      publicIntentId,
      detailHref: `/public-intent/${encodeURIComponent(publicIntentId)}`,
    };
    void socialAgentApi
      .recordInterestEvent({
        eventType: 'discover_click',
        targetUserId: publicIntentOwnerUserId,
        socialRequestId: publicIntentSocialRequestId,
        activityTags: publicInterestTags,
        city: publicIntentCity,
        locationText: publicIntentLocation,
        timeWindow: publicIntentTime,
        source: 'public_intent_detail_page',
        dedupeKey: `public-intent:view:${publicIntentId}:${day}`,
        metadata,
      })
      .catch(() => undefined);

    const timer = window.setTimeout(() => {
      void socialAgentApi
        .recordInterestEvent({
          eventType: 'discover_click',
          targetUserId: publicIntentOwnerUserId,
          socialRequestId: publicIntentSocialRequestId,
          weight: 2,
          activityTags: publicInterestTags,
          city: publicIntentCity,
          locationText: publicIntentLocation,
          timeWindow: publicIntentTime,
          source: 'public_intent_detail_dwell',
          dedupeKey: `public-intent:dwell:${publicIntentId}:${day}`,
          metadata: {
            ...metadata,
            dwellMs: 8000,
          },
        })
        .catch(() => undefined);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [
    isLoggedIn,
    publicIntentCity,
    publicIntentId,
    publicIntentLocation,
    publicIntentOwnerUserId,
    publicIntentSocialRequestId,
    publicIntentTime,
    publicInterestTags,
  ]);

  const recordProfileOpen = useCallback(
    (input: { targetUserId?: number | null; source: string }) => {
      if (!isLoggedIn || !publicIntentId || !input.targetUserId) return;
      const day = new Date().toISOString().slice(0, 10);
      void socialAgentApi
        .recordInterestEvent({
          eventType: 'view_profile',
          targetUserId: input.targetUserId,
          socialRequestId: publicIntentSocialRequestId,
          activityTags: publicInterestTags,
          city: publicIntentCity,
          locationText: publicIntentLocation,
          timeWindow: publicIntentTime,
          source: input.source,
          dedupeKey: `public-intent:profile:${publicIntentId}:${input.targetUserId}:${day}`,
          metadata: {
            publicIntentId,
          },
        })
        .catch(() => undefined);
    },
    [
      isLoggedIn,
      publicIntentCity,
      publicIntentId,
      publicIntentLocation,
      publicIntentSocialRequestId,
      publicIntentTime,
      publicInterestTags,
    ],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0b] text-sm text-[#c7c2b0]">
        正在加载公开需求...
      </div>
    );
  }

  if (error || !intent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d0b] px-6 text-[#f4efe6]">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <p className="text-sm text-[#c7c2b0]">{error || '公开需求不存在'}</p>
          <button
            type="button"
            className="mt-4 rounded-full bg-[#c8ff80] px-5 py-2 text-sm font-black text-[#12140f]"
            onClick={() => navigate('/discover')}
          >
            返回发现
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#f4efe6]">
      <main className="mx-auto max-w-4xl px-6 py-8">
        <button
          type="button"
          className="text-sm text-[#9a9487] transition hover:text-[#c8ff80]"
          onClick={() => navigate(-1)}
        >
          返回
        </button>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.24)]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-[#c8ff80]">
            <span>Public Intent</span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[#d5d0c4]">
              {intent.status}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{intent.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#c7c2b0]">
            {intent.description || intent.socialGoal || '发起人正在寻找同频伙伴。'}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Info label="城市" value={intent.city || '未设置'} />
            <Info label="地点" value={intent.locationPreference || intent.loc || '待协商'} />
            <Info label="时间" value={intent.timePreference || '待协商'} />
          </div>

          {publicTags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {publicTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-[#d5d0c4]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {intent.userId ? (
              <Link
                to={`/user/${intent.userId}`}
                onClick={() =>
                  recordProfileOpen({
                    targetUserId: intent.userId,
                    source: 'public_intent_detail_owner_link',
                  })
                }
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-bold text-[#f4efe6] transition hover:border-[#c8ff80]/60"
              >
                查看发起人
              </Link>
            ) : null}
            <Link
              to={`/agent/chat?intent=${encodeURIComponent(intent.id)}`}
              className="rounded-full bg-[#c8ff80] px-5 py-2 text-sm font-black text-[#11140f]"
            >
              让 Agent 帮我参与
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">可能合适的人</h2>
              <p className="mt-1 text-sm text-[#9a9487]">
                只展示公开资料可查看的候选。发消息、加好友和邀请仍需要你确认。
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-[#c7c2b0]">
              {candidates.length} 位
            </span>
          </div>

          {candidates.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {candidates.slice(0, 4).map((candidate) => (
                <Link
                  key={candidate.profile.id}
                  to={`/user/${candidate.profile.id}`}
                  onClick={() =>
                    recordProfileOpen({
                      targetUserId: candidate.profile.id,
                      source: 'public_intent_detail_candidate_link',
                    })
                  }
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-[#c8ff80]/50"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-full font-black text-white"
                      style={{ background: candidate.profile.color || '#18b98f' }}
                    >
                      {(candidate.profile.avatar || candidate.profile.name || 'F').slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate">{candidate.profile.name}</strong>
                      <small className="text-[#9a9487]">
                        {candidate.profile.city || '城市待完善'} · {candidate.score}% 匹配
                      </small>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#c7c2b0]">
                    {candidate.reasonText || '兴趣、时间或活动边界比较接近。'}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-[#9a9487]">
              暂时没有可公开展示的候选人。你可以先让 Agent 帮你补充偏好，再发起邀请。
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-[#9a9487]">{label}</p>
      <strong className="mt-1 block text-sm text-[#f4efe6]">{value}</strong>
    </div>
  );
}

export default PublicIntentDetailPage;
