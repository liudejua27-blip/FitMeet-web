import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore, useSocialStore } from '../stores';
import * as dataService from '../services/dataService';
import { socialAgentApi } from '../api/socialAgentApi';
import type { Meet, UserProfile } from '../types';

interface ProfileView {
  id: number;
  name: string;
  avatar: string;
  color: string;
  gender: string;
  age: number;
  city: string;
  bio: string;
  followers: number;
  following: number;
  meetCount: number;
  cert: boolean;
}

function toProfileView(profile: UserProfile, userId: number): ProfileView {
  return {
    id: profile.id ?? userId,
    name: profile.name || `用户${userId}`,
    avatar: profile.avatar || profile.name?.[0] || 'U',
    color: profile.color || '#FF6A00',
    gender: profile.gender || '',
    age: profile.age || 0,
    city: profile.city || '',
    bio: profile.bio || '这位用户还没有填写简介',
    followers: profile.followers ?? 0,
    following: profile.following ?? 0,
    meetCount: profile.meetCount ?? 0,
    cert: Boolean(profile.singleCert || profile.verified),
  };
}

export const UserProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = Number.parseInt(id || '0', 10);
  const { isFollowing, toggleFollow } = useSocialStore();
  const { isLoggedIn } = useAuthStore();
  const [user, setUser] = useState<ProfileView | null>(null);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    if (!Number.isFinite(userId) || userId <= 0) {
      setError('用户不存在');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const [profile, meetList] = await Promise.all([
        dataService.getUser(userId),
        dataService.getMeets(),
      ]);
      setUser(toProfileView(profile, userId));
      setMeets(meetList.filter((meet) => meet.userId === userId));
    } catch {
      setUser(null);
      setMeets([]);
      setError('加载用户主页失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!isLoggedIn || !user?.id) return;
    const day = new Date().toISOString().slice(0, 10);
    const startedAt = Date.now();
    void socialAgentApi
      .recordInterestEvent({
        eventType: 'view_profile',
        targetUserId: user.id,
        city: user.city || null,
        source: 'user_profile_page',
        dedupeKey: `profile:view:${user.id}:${day}`,
      })
      .catch(() => undefined);

    const timer = window.setTimeout(() => {
      void socialAgentApi
        .recordInterestEvent({
          eventType: 'view_profile',
          targetUserId: user.id,
          weight: 2,
          city: user.city || null,
          source: 'user_profile_dwell',
          dedupeKey: `profile:dwell:${user.id}:${day}`,
          metadata: {
            dwellMs: Date.now() - startedAt,
          },
        })
        .catch(() => undefined);
    }, 8000);

    return () => window.clearTimeout(timer);
  }, [isLoggedIn, user?.city, user?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-textMuted">
        加载用户资料中...
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="mb-3 text-5xl">📭</div>
          <h1 className="font-display text-xl font-bold text-white">
            {error || '用户不存在'}
          </h1>
          <button
            className="mt-5 rounded-lg bg-lime px-6 py-2 text-sm font-bold text-white transition hover:bg-brand2"
            onClick={() => {
              void loadProfile();
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const following = isFollowing(userId);

  return (
    <div className="min-h-screen bg-base pb-20 text-cream">
      <div className="sticky top-[72px] z-40 border-b border-border bg-base/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          <button
            className="cursor-pointer text-textMuted transition hover:text-white"
            onClick={() => navigate(-1)}
          >
            ← 返回
          </button>
          <span className="text-sm font-display font-bold text-white">{user.name}</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6">
        <div className="flex items-start gap-6 py-8">
          <div
            className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl text-2xl font-display font-bold text-white shadow-card"
            style={{ background: user.color }}
          >
            {user.avatar}
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-xl font-display font-extrabold text-white">{user.name}</h1>
              {user.cert && <span className="text-sm text-lime">✓ 已认证</span>}
            </div>
            <div className="mb-2 text-xs text-textSofter">
              {user.gender || '未填写'} {user.age ? `${user.age}岁` : ''} · 📍 {user.city || '未填写'}
            </div>
            <p className="mb-4 text-sm text-textMuted">{user.bio}</p>

            <div className="mb-4 flex gap-6">
              <div className="text-center">
                <div className="text-lg font-bold text-white">{meets.length || user.meetCount}</div>
                <div className="text-[11px] text-textSofter">公开约练</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">{user.followers}</div>
                <div className="text-[11px] text-textSofter">粉丝</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-white">{user.following}</div>
                <div className="text-[11px] text-textSofter">关注</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className={`cursor-pointer rounded-lg px-6 py-2 text-sm font-bold transition ${
                  following
                    ? 'border border-border bg-surfaceMuted text-textMuted hover:border-red-500 hover:text-red-400'
                    : 'bg-lime text-white hover:bg-brand2 hover:shadow-glow'
                }`}
                onClick={() => toggleFollow(userId)}
              >
                {following ? '✓ 已关注' : '+ 关注'}
              </button>
              <button
                className="cursor-pointer rounded-lg border border-border bg-surface px-6 py-2 text-sm font-semibold text-white transition hover:border-borderStrong"
                onClick={() => navigate('/messages')}
              >
                💬 私信
              </button>
            </div>
          </div>
        </div>

        {meets.length > 0 && (
          <section className="mb-8">
            <h3 className="mb-4 font-display font-bold text-white">📍 TA 的约练</h3>
            <div className="space-y-3">
              {meets.map((meet) => (
                <article
                  key={meet.id}
                  className="w-full rounded-xl border border-border bg-surface p-4 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{meet.title}</span>
                    </div>
                    <span className="rounded-md bg-limeDim px-2 py-0.5 text-xs text-lime">
                      {meet.slots}/{meet.maxSlots} 人
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-textSofter">
                    ⏰ {meet.time} · 📍 {meet.loc}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {meets.length === 0 && (
          <div className="py-16 text-center">
            <div className="mb-3 text-5xl">📭</div>
            <div className="text-lg font-display font-bold text-textMuted">暂无内容</div>
            <div className="mt-1 text-sm text-textSofter">这位用户还没有公开约练信息</div>
          </div>
        )}
      </div>
    </div>
  );
};
